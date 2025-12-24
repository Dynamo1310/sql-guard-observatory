using Microsoft.Data.SqlClient;
using SQLGuardObservatory.API.Models.Collectors;
using System.Collections.Concurrent;
using System.Data;
using System.Diagnostics;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Clase base abstracta para todos los collectors de métricas
/// Implementa el patrón Template Method para la ejecución de collectors
/// </summary>
/// <typeparam name="TResult">Tipo del resultado de la recolección para una instancia</typeparam>
public abstract class CollectorBase<TResult> : ICollector where TResult : class, new()
{
    protected readonly ILogger _logger;
    protected readonly ICollectorConfigService _configService;
    protected readonly ISqlConnectionFactory _connectionFactory;
    protected readonly IInstanceProvider _instanceProvider;
    
    private volatile bool _isRunning;
    private readonly SemaphoreSlim _executionLock = new(1, 1);

    public abstract string CollectorName { get; }
    public abstract string DisplayName { get; }
    public bool IsRunning => _isRunning;

    protected CollectorBase(
        ILogger logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider)
    {
        _logger = logger;
        _configService = configService;
        _connectionFactory = connectionFactory;
        _instanceProvider = instanceProvider;
    }

    /// <summary>
    /// Ejecuta el collector para todas las instancias configuradas
    /// </summary>
    public async Task<CollectorExecutionResult> ExecuteAsync(CancellationToken ct = default)
    {
        var executionResult = new CollectorExecutionResult { CollectorName = CollectorName };
        
        if (!await _executionLock.WaitAsync(0, ct))
        {
            _logger.LogWarning("Collector {CollectorName} is already running, skipping execution", CollectorName);
            return executionResult;
        }

        try
        {
            _isRunning = true;
            var stopwatch = Stopwatch.StartNew();
            
            // Obtener configuración
            var config = await _configService.GetConfigAsync(CollectorName, ct);
            if (config == null)
            {
                _logger.LogWarning("Configuration not found for collector {CollectorName}", CollectorName);
                return executionResult;
            }

            if (!config.IsEnabled)
            {
                _logger.LogInformation("Collector {CollectorName} is disabled, skipping", CollectorName);
                return executionResult;
            }

            // Iniciar log de ejecución
            var executionLog = await _configService.StartExecutionLogAsync(CollectorName, "Scheduled", null, ct);
            
            // Obtener instancias
            var instances = await _instanceProvider.GetFilteredInstancesAsync(ct: ct);
            _logger.LogInformation("Collector {CollectorName} starting for {Count} instances", CollectorName, instances.Count);

            // Obtener umbrales
            var thresholds = await _configService.GetActiveThresholdsAsync(CollectorName, ct);

            // Procesar instancias en paralelo
            var results = new ConcurrentBag<CollectorInstanceResult>();
            var parallelOptions = new ParallelOptions
            {
                MaxDegreeOfParallelism = config.ParallelDegree,
                CancellationToken = ct
            };

            await Parallel.ForEachAsync(instances, parallelOptions, async (instance, token) =>
            {
                var result = await ProcessInstanceAsync(instance, config, thresholds, token);
                results.Add(result);
            });

            // Calcular estadísticas
            var successCount = results.Count(r => r.Success);
            var errorCount = results.Count(r => !r.Success && r.Error != null);
            var skippedCount = results.Count(r => !r.Success && r.Error == null);

            stopwatch.Stop();

            // Completar log de ejecución
            await _configService.CompleteExecutionLogAsync(
                executionLog.Id,
                successCount,
                errorCount,
                skippedCount,
                null,
                ct);

            // Actualizar última ejecución en config
            await _configService.UpdateLastExecutionAsync(
                CollectorName,
                DateTime.Now,
                stopwatch.ElapsedMilliseconds,
                successCount,
                null,
                ct);

            _logger.LogInformation(
                "Collector {CollectorName} completed in {Duration}ms - Success: {Success}, Errors: {Errors}, Skipped: {Skipped}",
                CollectorName, stopwatch.ElapsedMilliseconds, successCount, errorCount, skippedCount);

            // Post-procesamiento (opcional, para collectors que necesitan sincronizar datos entre instancias)
            await PostProcessAsync(results.ToList(), ct);

            // Preparar resultado
            executionResult.InstancesProcessed = results.Count;
            executionResult.SuccessCount = successCount;
            executionResult.ErrorCount = errorCount;
            executionResult.TotalDurationMs = stopwatch.ElapsedMilliseconds;
            executionResult.Results = results.ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Fatal error in collector {CollectorName}", CollectorName);
            
            await _configService.UpdateLastExecutionAsync(
                CollectorName,
                DateTime.Now,
                0,
                0,
                ex.Message,
                ct);
        }
        finally
        {
            _isRunning = false;
            _executionLock.Release();
        }

        return executionResult;
    }

    /// <summary>
    /// Ejecuta el collector para una instancia específica
    /// </summary>
    public async Task ExecuteForInstanceAsync(string instanceName, CancellationToken ct = default)
    {
        var config = await _configService.GetConfigAsync(CollectorName, ct);
        if (config == null) return;

        var instance = await _instanceProvider.GetInstanceInfoAsync(instanceName, ct);
        if (instance == null)
        {
            _logger.LogWarning("Instance {InstanceName} not found", instanceName);
            return;
        }

        var thresholds = await _configService.GetActiveThresholdsAsync(CollectorName, ct);
        await ProcessInstanceAsync(instance, config, thresholds, ct);
    }

    /// <summary>
    /// Procesa una instancia individual
    /// </summary>
    private async Task<CollectorInstanceResult> ProcessInstanceAsync(
        SqlInstanceInfo instance,
        CollectorConfig config,
        List<CollectorThreshold> thresholds,
        CancellationToken ct)
    {
        var result = new CollectorInstanceResult { InstanceName = instance.InstanceName };
        var stopwatch = Stopwatch.StartNew();

        try
        {
            // Verificar conectividad
            if (!await _connectionFactory.TestConnectionAsync(instance.InstanceName, config.TimeoutSeconds, ct))
            {
                _logger.LogDebug("Instance {InstanceName} not reachable, skipping", instance.InstanceName);
                return result; // Success = false, Error = null (skipped)
            }

            // Obtener versión de SQL Server si no la tenemos
            if (instance.SqlMajorVersion == 0)
            {
                instance.SqlMajorVersion = await _connectionFactory.GetSqlMajorVersionAsync(instance.InstanceName, 10, ct);
            }

            // Obtener query específica para la versión
            var query = await GetQueryForVersionAsync(instance.SqlMajorVersion, ct);

            // Recolectar métricas
            var data = await CollectFromInstanceAsync(instance, config.TimeoutSeconds, query, ct);

            // Calcular score
            var score = CalculateScore(data, thresholds);

            // Guardar resultado
            await SaveResultAsync(instance, data, score, ct);

            result.Success = true;
            result.Score = score;
            result.Metrics = GetMetricsFromResult(data);
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
            _logger.LogWarning(ex, "Error processing instance {InstanceName} in collector {CollectorName}",
                instance.InstanceName, CollectorName);
        }
        finally
        {
            stopwatch.Stop();
            result.DurationMs = stopwatch.ElapsedMilliseconds;
        }

        return result;
    }

    /// <summary>
    /// Recolecta métricas de una instancia
    /// </summary>
    protected abstract Task<TResult> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct);

    /// <summary>
    /// Calcula el score basado en los datos recolectados y los umbrales configurados
    /// </summary>
    protected abstract int CalculateScore(TResult data, List<CollectorThreshold> thresholds);

    /// <summary>
    /// Guarda el resultado en la base de datos
    /// </summary>
    protected abstract Task SaveResultAsync(SqlInstanceInfo instance, TResult data, int score, CancellationToken ct);

    /// <summary>
    /// Obtiene la query SQL apropiada para una versión de SQL Server
    /// </summary>
    protected virtual async Task<string> GetQueryForVersionAsync(int sqlMajorVersion, CancellationToken ct)
    {
        var query = await _configService.GetQueryForVersionAsync(CollectorName, "MainQuery", sqlMajorVersion, ct);
        if (query != null)
        {
            return query.QueryTemplate;
        }

        // Fallback a query por defecto implementada en el collector
        return GetDefaultQuery(sqlMajorVersion);
    }

    /// <summary>
    /// Query por defecto si no hay configurada en la base de datos
    /// </summary>
    protected abstract string GetDefaultQuery(int sqlMajorVersion);

    /// <summary>
    /// Extrae las métricas principales del resultado para logging/debugging
    /// </summary>
    protected virtual Dictionary<string, object?> GetMetricsFromResult(TResult data)
    {
        return new Dictionary<string, object?>();
    }

    /// <summary>
    /// Post-procesamiento después de procesar todas las instancias
    /// Útil para sincronización de datos entre nodos (ej: AlwaysOn)
    /// </summary>
    protected virtual Task PostProcessAsync(List<CollectorInstanceResult> results, CancellationToken ct)
    {
        return Task.CompletedTask;
    }

    /// <summary>
    /// Ejecuta una query y devuelve un DataTable
    /// </summary>
    protected async Task<DataTable> ExecuteQueryAsync(
        string instanceName,
        string query,
        int timeoutSeconds,
        CancellationToken ct)
    {
        await using var connection = await _connectionFactory.CreateConnectionAsync(instanceName, timeoutSeconds, ct);
        await using var command = connection.CreateCommand();
        command.CommandText = query;
        command.CommandTimeout = timeoutSeconds;

        var dataTable = new DataTable();
        using var adapter = new SqlDataAdapter(command);
        adapter.Fill(dataTable);

        return dataTable;
    }

    /// <summary>
    /// Ejecuta una query y devuelve múltiples result sets como DataSet
    /// </summary>
    protected async Task<DataSet> ExecuteQueryMultiResultAsync(
        string instanceName,
        string query,
        int timeoutSeconds,
        CancellationToken ct)
    {
        await using var connection = await _connectionFactory.CreateConnectionAsync(instanceName, timeoutSeconds, ct);
        await using var command = connection.CreateCommand();
        command.CommandText = query;
        command.CommandTimeout = timeoutSeconds;

        var dataSet = new DataSet();
        using var adapter = new SqlDataAdapter(command);
        adapter.Fill(dataSet);

        return dataSet;
    }

    /// <summary>
    /// Evalúa los umbrales y calcula el score
    /// </summary>
    protected int EvaluateThresholds(decimal value, List<CollectorThreshold> thresholds, string thresholdGroup)
    {
        var groupThresholds = thresholds
            .Where(t => t.ThresholdGroup == thresholdGroup && t.ActionType == "Score")
            .OrderBy(t => t.EvaluationOrder)
            .ToList();

        foreach (var threshold in groupThresholds)
        {
            if (EvaluateCondition(value, threshold.ThresholdOperator, threshold.ThresholdValue))
            {
                return threshold.ResultingScore;
            }
        }

        return 100; // Default score if no threshold matches
    }

    /// <summary>
    /// Aplica caps al score basado en umbrales
    /// </summary>
    protected int ApplyCaps(int score, decimal value, List<CollectorThreshold> thresholds, string? thresholdGroup = null)
    {
        var capThresholds = thresholds
            .Where(t => t.ActionType == "Cap" && (thresholdGroup == null || t.ThresholdGroup == thresholdGroup))
            .ToList();

        foreach (var cap in capThresholds)
        {
            if (EvaluateCondition(value, cap.ThresholdOperator, cap.ThresholdValue))
            {
                score = Math.Min(score, cap.ResultingScore);
            }
        }

        return score;
    }

    /// <summary>
    /// Aplica penalizaciones al score
    /// </summary>
    protected int ApplyPenalties(int score, decimal value, List<CollectorThreshold> thresholds, string? thresholdGroup = null)
    {
        var penaltyThresholds = thresholds
            .Where(t => t.ActionType == "Penalty" && (thresholdGroup == null || t.ThresholdGroup == thresholdGroup))
            .ToList();

        foreach (var penalty in penaltyThresholds)
        {
            if (EvaluateCondition(value, penalty.ThresholdOperator, penalty.ThresholdValue))
            {
                score += penalty.ResultingScore; // ResultingScore es negativo para penalizaciones
            }
        }

        return Math.Max(0, Math.Min(100, score)); // Clamp entre 0 y 100
    }

    /// <summary>
    /// Evalúa una condición basada en operador
    /// </summary>
    private static bool EvaluateCondition(decimal value, string op, decimal threshold)
    {
        return op switch
        {
            ">" => value > threshold,
            ">=" => value >= threshold,
            "<" => value < threshold,
            "<=" => value <= threshold,
            "=" => value == threshold,
            "!=" => value != threshold,
            _ => false
        };
    }

    /// <summary>
    /// Helper para obtener valor decimal de un DataRow de forma segura
    /// </summary>
    protected static decimal GetDecimal(DataRow row, string columnName, decimal defaultValue = 0)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return Convert.ToDecimal(value);
    }

    /// <summary>
    /// Helper para obtener valor int de un DataRow de forma segura
    /// </summary>
    protected static int GetInt(DataRow row, string columnName, int defaultValue = 0)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return Convert.ToInt32(value);
    }

    /// <summary>
    /// Helper para obtener valor long de un DataRow de forma segura
    /// </summary>
    protected static long GetLong(DataRow row, string columnName, long defaultValue = 0)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return Convert.ToInt64(value);
    }

    /// <summary>
    /// Helper para obtener valor bool de un DataRow de forma segura
    /// </summary>
    protected static bool GetBool(DataRow row, string columnName, bool defaultValue = false)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return Convert.ToBoolean(value);
    }

    /// <summary>
    /// Helper para obtener valor string de un DataRow de forma segura
    /// </summary>
    protected static string? GetString(DataRow row, string columnName, string? defaultValue = null)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return value.ToString();
    }

    /// <summary>
    /// Helper para obtener valor DateTime de un DataRow de forma segura
    /// </summary>
    protected static DateTime? GetDateTime(DataRow row, string columnName, DateTime? defaultValue = null)
    {
        if (!row.Table.Columns.Contains(columnName))
            return defaultValue;

        var value = row[columnName];
        if (value == null || value == DBNull.Value)
            return defaultValue;

        return Convert.ToDateTime(value);
    }
}

