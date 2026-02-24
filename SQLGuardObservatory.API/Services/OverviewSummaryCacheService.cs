using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Models.Collectors;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IOverviewSummaryCacheService
{
    /// <summary>
    /// Recalcula y guarda el caché del Overview
    /// </summary>
    /// <param name="triggeredBy">Identificador del origen (ej: "HealthScoreConsolidator", "DiscosCollector")</param>
    /// <param name="ct">Token de cancelación</param>
    Task RefreshCacheAsync(string triggeredBy, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los datos cacheados del Overview
    /// </summary>
    /// <returns>Datos del caché o null si no existe</returns>
    Task<OverviewSummaryCache?> GetCachedDataAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Mapea los datos del caché al DTO de respuesta
    /// </summary>
    OverviewPageDataDto MapCacheToDto(OverviewSummaryCache cache);
}

/// <summary>
/// Servicio que gestiona el caché de datos del Overview.
/// Calcula y almacena los KPIs y listas para optimizar la carga del dashboard.
/// </summary>
public class OverviewSummaryCacheService : IOverviewSummaryCacheService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<OverviewSummaryCacheService> _logger;
    private readonly string _connectionString;
    private static readonly SemaphoreSlim _refreshLock = new(1, 1);
    
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public OverviewSummaryCacheService(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<OverviewSummaryCacheService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("ApplicationDb")
            ?? throw new InvalidOperationException("ApplicationDb connection string not configured");
    }

    public async Task RefreshCacheAsync(string triggeredBy, CancellationToken ct = default)
    {
        // Evitar ejecuciones concurrentes
        if (!await _refreshLock.WaitAsync(TimeSpan.FromSeconds(5), ct))
        {
            _logger.LogDebug("RefreshCacheAsync skipped - another refresh is in progress");
            return;
        }

        try
        {
            var startTime = DateTime.UtcNow;
            _logger.LogDebug("Refreshing Overview cache triggered by {TriggeredBy}...", triggeredBy);

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Obtener servidores excluidos globalmente (dados de baja)
            var exclusionService = scope.ServiceProvider.GetRequiredService<IServerExclusionService>();
            var excludedServers = await exclusionService.GetExcludedServerNamesAsync(ct);

            // Ejecutar las 5 queries en paralelo
            var healthScoresTask = GetProductionHealthScoresAsync(ct);
            var criticalDisksTask = GetProductionCriticalDisksAsync(ct);
            var maintenanceTask = GetProductionMaintenanceOverdueAsync(context, ct);
            var backupBreachesTask = GetProductionBackupBreachesAsync(ct);
            var agHealthTask = GetProductionAGHealthAsync(ct);

            await Task.WhenAll(healthScoresTask, criticalDisksTask, maintenanceTask, backupBreachesTask, agHealthTask);

            var healthScores = healthScoresTask.Result;
            var criticalDisks = criticalDisksTask.Result;
            var maintenanceOverdue = maintenanceTask.Result;
            var backupBreaches = backupBreachesTask.Result;
            var agHealthStatuses = agHealthTask.Result;

            // Filtrar instancias excluidas globalmente de todos los resultados
            if (excludedServers.Count > 0)
            {
                healthScores = healthScores
                    .Where(s => !IsInstanceExcluded(s.InstanceName, excludedServers))
                    .ToList();
                criticalDisks = criticalDisks
                    .Where(d => !IsInstanceExcluded(d.InstanceName, excludedServers))
                    .ToList();
                maintenanceOverdue = maintenanceOverdue
                    .Where(m => !IsInstanceExcluded(m.InstanceName, excludedServers))
                    .ToList();
                backupBreaches = backupBreaches
                    .Where(b => !IsInstanceExcluded(b.InstanceName, excludedServers))
                    .ToList();
                agHealthStatuses = agHealthStatuses
                    .Where(a => !IsInstanceExcluded(a.InstanceName, excludedServers))
                    .ToList();

                _logger.LogDebug(
                    "Filtered {ExcludedCount} excluded servers from Overview cache data",
                    excludedServers.Count);
            }

            // Calcular KPIs
            var totalInstances = healthScores.Count;
            var healthyCount = healthScores.Count(s => s.HealthStatus == "Healthy");
            var warningCount = healthScores.Count(s => s.HealthStatus == "Warning");
            var riskCount = healthScores.Count(s => s.HealthStatus == "Risk");
            var criticalCount = healthScores.Count(s => s.HealthScore < 60);
            var avgScore = healthScores.Count > 0
                ? Math.Round((decimal)healthScores.Average(s => s.HealthScore), 2)
                : 0;

            // Backups atrasados - usar datos reales de la tabla InstanceHealth_Backups
            // Agrupar por AG: para AGs, si al menos un nodo tiene backup OK, el AG no está breached
            var backupIssues = BuildBackupIssuesWithAGGrouping(backupBreaches, healthScores);

            // Cantidad de instancias AlwaysOn con problemas
            var agUnhealthyCount = agHealthStatuses.Count(a => 
                a.WorstState != "HEALTHY" && a.WorstState != "N/A");

            // Buscar o crear el registro de caché
            var cache = await context.OverviewSummaryCache
                .FirstOrDefaultAsync(c => c.CacheKey == "Production", ct);

            if (cache == null)
            {
                cache = new OverviewSummaryCache { CacheKey = "Production" };
                context.OverviewSummaryCache.Add(cache);
            }

            // Actualizar valores
            cache.TotalInstances = totalInstances;
            cache.HealthyCount = healthyCount;
            cache.WarningCount = warningCount;
            cache.RiskCount = riskCount;
            cache.CriticalCount = criticalCount;
            cache.AvgScore = avgScore;
            cache.BackupsOverdue = backupIssues.Count;
            cache.CriticalDisksCount = criticalDisks.Count;
            cache.MaintenanceOverdueCount = maintenanceOverdue.Count;
            cache.AGUnhealthyCount = agUnhealthyCount;

            // Serializar listas a JSON
            cache.AGHealthStatusesJson = JsonSerializer.Serialize(agHealthStatuses, _jsonOptions);
            cache.BackupIssuesJson = JsonSerializer.Serialize(backupIssues, _jsonOptions);
            cache.CriticalDisksJson = JsonSerializer.Serialize(criticalDisks, _jsonOptions);
            cache.MaintenanceOverdueJson = JsonSerializer.Serialize(maintenanceOverdue, _jsonOptions);

            // Metadata
            cache.LastUpdatedUtc = DateTime.UtcNow;
            cache.LastUpdatedBy = triggeredBy;

            await context.SaveChangesAsync(ct);

            // Auto-resolver asignaciones que ya no tienen issue correspondiente
            await AutoResolveStaleAssignmentsAsync(context, backupIssues, criticalDisks, maintenanceOverdue, ct);

            var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;
            _logger.LogInformation(
                "Overview cache refreshed in {Elapsed}ms by {TriggeredBy}: {Total} instancias, {AGUnhealthy} AG unhealthy, {Disks} discos, {Maint} mant.",
                elapsed, triggeredBy, totalInstances, agUnhealthyCount, criticalDisks.Count, maintenanceOverdue.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing Overview cache");
            throw;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task<OverviewSummaryCache?> GetCachedDataAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        return await context.OverviewSummaryCache
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CacheKey == "Production", ct);
    }

    public OverviewPageDataDto MapCacheToDto(OverviewSummaryCache cache)
    {
        var result = new OverviewPageDataDto
        {
            TotalInstances = cache.TotalInstances,
            HealthyCount = cache.HealthyCount,
            WarningCount = cache.WarningCount,
            RiskCount = cache.RiskCount,
            CriticalCount = cache.CriticalCount,
            AvgScore = (double)cache.AvgScore,
            BackupsOverdue = cache.BackupsOverdue,
            CriticalDisksCount = cache.CriticalDisksCount,
            MaintenanceOverdueCount = cache.MaintenanceOverdueCount,
            AGUnhealthyCount = cache.AGUnhealthyCount,
            LastUpdate = cache.LastUpdatedUtc
        };

        // Deserializar listas
        if (!string.IsNullOrEmpty(cache.AGHealthStatusesJson))
        {
            result.AGHealthStatuses = JsonSerializer.Deserialize<List<OverviewAGHealthDto>>(
                cache.AGHealthStatusesJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.BackupIssuesJson))
        {
            result.BackupIssues = JsonSerializer.Deserialize<List<OverviewBackupIssueDto>>(
                cache.BackupIssuesJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.CriticalDisksJson))
        {
            result.CriticalDisks = JsonSerializer.Deserialize<List<OverviewCriticalDiskDto>>(
                cache.CriticalDisksJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.MaintenanceOverdueJson))
        {
            result.MaintenanceOverdue = JsonSerializer.Deserialize<List<OverviewMaintenanceOverdueDto>>(
                cache.MaintenanceOverdueJson, _jsonOptions) ?? new();
        }

        return result;
    }

    #region Private Query Methods

    /// <summary>
    /// Obtiene los health scores más recientes de producción
    /// </summary>
    private async Task<List<OverviewHealthScoreRaw>> GetProductionHealthScoresAsync(CancellationToken ct)
    {
        var results = new List<OverviewHealthScoreRaw>();

        var query = @"
            WITH RankedScores AS (
                SELECT 
                    InstanceName,
                    Ambiente,
                    HealthScore,
                    HealthStatus,
                    BackupsScore,
                    AlwaysOnScore,
                    CPUScore,
                    MemoriaScore,
                    DiscosScore,
                    MantenimientosScore,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Score
                WHERE Ambiente = 'Produccion'
            )
            SELECT 
                InstanceName,
                Ambiente,
                HealthScore,
                HealthStatus,
                BackupsScore,
                AlwaysOnScore,
                CPUScore,
                MemoriaScore,
                DiscosScore,
                MantenimientosScore
            FROM RankedScores 
            WHERE rn = 1
            ORDER BY HealthScore ASC";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 30;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new OverviewHealthScoreRaw
            {
                InstanceName = reader.GetString(0),
                Ambiente = reader.IsDBNull(1) ? null : reader.GetString(1),
                HealthScore = reader.GetInt32(2),
                HealthStatus = reader.IsDBNull(3) ? "Unknown" : reader.GetString(3),
                BackupsScore = reader.IsDBNull(4) ? 100 : reader.GetInt32(4),
                AlwaysOnScore = reader.IsDBNull(5) ? 100 : reader.GetInt32(5),
                CPUScore = reader.IsDBNull(6) ? 100 : reader.GetInt32(6),
                MemoriaScore = reader.IsDBNull(7) ? 100 : reader.GetInt32(7),
                DiscosScore = reader.IsDBNull(8) ? 100 : reader.GetInt32(8),
                MantenimientosScore = reader.IsDBNull(9) ? 100 : reader.GetInt32(9)
            });
        }

        return results;
    }

    /// <summary>
    /// Obtiene los discos críticos (alertados) de producción
    /// </summary>
    private async Task<List<OverviewCriticalDiskDto>> GetProductionCriticalDisksAsync(CancellationToken ct)
    {
        var results = new List<OverviewCriticalDiskDto>();

        var query = @"
            WITH LatestDiscos AS (
                SELECT 
                    InstanceName,
                    VolumesJson,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Discos
                WHERE Ambiente = 'Produccion'
            )
            SELECT InstanceName, VolumesJson
            FROM LatestDiscos
            WHERE rn = 1";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 60;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var instanceName = reader.GetString(0);
            var volumesJson = reader.IsDBNull(1) ? null : reader.GetString(1);

            if (!string.IsNullOrEmpty(volumesJson))
            {
                try
                {
                    var volumes = JsonSerializer.Deserialize<List<DiskVolumeJson>>(volumesJson,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (volumes != null)
                    {
                        foreach (var vol in volumes.Where(v => v.IsAlerted == true))
                        {
                            results.Add(new OverviewCriticalDiskDto
                            {
                                InstanceName = instanceName,
                                Drive = vol.MountPoint ?? vol.VolumeName ?? "N/A",
                                PorcentajeLibre = vol.FreePct ?? 0,
                                RealPorcentajeLibre = vol.RealFreePct ?? vol.FreePct ?? 0,
                                LibreGB = vol.FreeGB ?? 0,
                                RealLibreGB = vol.RealFreeGB ?? vol.FreeGB ?? 0,
                                EspacioInternoEnArchivosGB = vol.FreeSpaceInGrowableFilesGB ?? 0,
                                Estado = "Critico"
                            });
                        }
                    }
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Error parseando VolumesJson para {Instance}", instanceName);
                }
            }
        }

        return results.OrderBy(d => d.RealPorcentajeLibre).ToList();
    }

    /// <summary>
    /// Obtiene el mantenimiento vencido de producción
    /// </summary>
    private async Task<List<OverviewMaintenanceOverdueDto>> GetProductionMaintenanceOverdueAsync(
        ApplicationDbContext context, CancellationToken ct)
    {
        var results = new List<OverviewMaintenanceOverdueDto>();
        var agProcessed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            // 1. Cargar excepciones activas para Maintenance
            var checkdbExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var indexOptimizeExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var exceptions = await context.Set<CollectorException>()
                .AsNoTracking()
                .Where(e => e.CollectorName == "Maintenance" && e.IsActive)
                .ToListAsync(ct);

            foreach (var ex in exceptions)
            {
                if (ex.ExceptionType.Equals("CHECKDB", StringComparison.OrdinalIgnoreCase))
                {
                    checkdbExceptions.Add(ex.ServerName);
                }
                else if (ex.ExceptionType.Equals("IndexOptimize", StringComparison.OrdinalIgnoreCase))
                {
                    indexOptimizeExceptions.Add(ex.ServerName);
                }
            }

            // 2. Query optimizada para mantenimiento vencido
            // Incluye Onpremise + AWS (RDS e Instancia/EC2)
            var query = @"
                WITH LatestMaintenance AS (
                    SELECT 
                        m.InstanceName,
                        m.CheckdbOk,
                        m.IndexOptimizeOk,
                        m.AGName,
                        m.LastCheckdb,
                        m.LastIndexOptimize,
                        m.HostingSite,
                        ROW_NUMBER() OVER (PARTITION BY m.InstanceName ORDER BY m.CollectedAtUtc DESC) AS rn
                    FROM dbo.InstanceHealth_Maintenance m
                    WHERE m.Ambiente = 'Produccion'
                )
                SELECT lm.InstanceName, lm.CheckdbOk, lm.IndexOptimizeOk, lm.AGName, lm.LastCheckdb, lm.LastIndexOptimize
                FROM LatestMaintenance lm
                LEFT JOIN dbo.SqlServerInstancesCache c ON lm.InstanceName = c.NombreInstancia
                WHERE lm.rn = 1 
                  AND (lm.CheckdbOk = 0 OR lm.IndexOptimizeOk = 0)
                  AND (
                      lm.HostingSite = 'Onpremise'
                      OR (lm.HostingSite = 'AWS' AND c.HostingType IN ('RDS', 'Instancia'))
                  )
                  AND lm.InstanceName NOT LIKE 'readreplica%'
                  AND lm.InstanceName NOT LIKE 'restore%'";

            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(ct);

            await using var command = new SqlCommand(query, connection);
            command.CommandTimeout = 30;
            
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var instanceName = reader.GetString(0);
                var checkdbOk = !reader.IsDBNull(1) && reader.GetBoolean(1);
                var indexOptimizeOk = !reader.IsDBNull(2) && reader.GetBoolean(2);
                var agName = reader.IsDBNull(3) ? null : reader.GetString(3);
                var lastCheckdb = reader.IsDBNull(4) ? (DateTime?)null : reader.GetDateTime(4);
                var lastIndexOptimize = reader.IsDBNull(5) ? (DateTime?)null : reader.GetDateTime(5);

                // Si pertenece a un AG y ya lo procesamos, saltar
                if (!string.IsNullOrEmpty(agName) && agProcessed.Contains(agName))
                {
                    continue;
                }

                // Verificar excepciones
                var hostname = instanceName.Split('\\')[0];
                var shortName = hostname.Split('.')[0];

                var isCheckdbExcepted = checkdbExceptions.Contains(instanceName)
                                     || checkdbExceptions.Contains(hostname)
                                     || checkdbExceptions.Contains(shortName);

                var isIndexOptimizeExcepted = indexOptimizeExceptions.Contains(instanceName)
                                           || indexOptimizeExceptions.Contains(hostname)
                                           || indexOptimizeExceptions.Contains(shortName);

                var checkdbVencido = !checkdbOk && !isCheckdbExcepted;
                var indexOptimizeVencido = !indexOptimizeOk && !isIndexOptimizeExcepted;

                if (!checkdbVencido && !indexOptimizeVencido)
                {
                    continue;
                }

                string tipo;
                if (checkdbVencido && indexOptimizeVencido)
                {
                    tipo = "CHECKDB e IndexOptimize";
                }
                else if (checkdbVencido)
                {
                    tipo = "CHECKDB";
                }
                else
                {
                    tipo = "IndexOptimize";
                }

                if (!string.IsNullOrEmpty(agName))
                {
                    agProcessed.Add(agName);
                }

                results.Add(new OverviewMaintenanceOverdueDto
                {
                    InstanceName = instanceName,
                    DisplayName = !string.IsNullOrEmpty(agName) ? agName : instanceName,
                    Tipo = tipo,
                    LastCheckdb = lastCheckdb,
                    LastIndexOptimize = lastIndexOptimize,
                    CheckdbVencido = checkdbVencido,
                    IndexOptimizeVencido = indexOptimizeVencido,
                    AgName = agName
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo mantenimiento atrasado");
        }

        return results
            .OrderByDescending(m => m.CheckdbVencido && m.IndexOptimizeVencido)
            .ThenBy(m => m.DisplayName)
            .ToList();
    }

    /// <summary>
    /// Obtiene el estado de salud de AlwaysOn para producción, agrupado por Availability Group.
    /// Solo incluye instancias que tienen AGs reales creados (AGName IS NOT NULL y DatabaseCount > 0).
    /// Agrupa los nodos de un mismo AG en una sola fila.
    /// </summary>
    private async Task<List<OverviewAGHealthDto>> GetProductionAGHealthAsync(CancellationToken ct)
    {
        var rawResults = new List<AGHealthRaw>();

        // Traer datos por instancia, solo las que tienen AG real
        var query = @"
            WITH LatestAlwaysOn AS (
                SELECT 
                    InstanceName,
                    Ambiente,
                    AlwaysOnWorstState,
                    DatabaseCount,
                    SynchronizedCount,
                    SuspendedCount,
                    ISNULL(MaxSendQueueKB, 0) AS MaxSendQueueKB,
                    ISNULL(MaxRedoQueueKB, 0) AS MaxRedoQueueKB,
                    ISNULL(MaxSecondsBehind, 0) AS MaxSecondsBehind,
                    AlwaysOnDetails,
                    AGName,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_AlwaysOn
                WHERE Ambiente = 'Produccion'
                  AND AlwaysOnEnabled = 1
                  AND AGName IS NOT NULL
                  AND DatabaseCount > 0
            )
            SELECT 
                InstanceName,
                Ambiente,
                AlwaysOnWorstState,
                DatabaseCount,
                SynchronizedCount,
                SuspendedCount,
                MaxSendQueueKB,
                MaxRedoQueueKB,
                MaxSecondsBehind,
                AlwaysOnDetails,
                AGName
            FROM LatestAlwaysOn
            WHERE rn = 1";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 30;

        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            rawResults.Add(new AGHealthRaw
            {
                InstanceName = reader.GetString(0),
                Ambiente = reader.IsDBNull(1) ? null : reader.GetString(1),
                WorstState = reader.IsDBNull(2) ? "N/A" : reader.GetString(2),
                DatabaseCount = reader.IsDBNull(3) ? 0 : reader.GetInt32(3),
                SynchronizedCount = reader.IsDBNull(4) ? 0 : reader.GetInt32(4),
                SuspendedCount = reader.IsDBNull(5) ? 0 : reader.GetInt32(5),
                MaxSendQueueKB = reader.IsDBNull(6) ? 0 : reader.GetInt32(6),
                MaxRedoQueueKB = reader.IsDBNull(7) ? 0 : reader.GetInt32(7),
                MaxSecondsBehind = reader.IsDBNull(8) ? 0 : reader.GetInt32(8),
                Details = reader.IsDBNull(9) ? null : reader.GetString(9),
                AGName = reader.IsDBNull(10) ? null : reader.GetString(10)
            });
        }

        // Agrupar por AGName
        return BuildAGHealthWithGrouping(rawResults);
    }

    /// <summary>
    /// Agrupa los nodos de un mismo AG en una sola fila, tomando el peor estado entre nodos.
    /// </summary>
    private static List<OverviewAGHealthDto> BuildAGHealthWithGrouping(List<AGHealthRaw> rawResults)
    {
        var results = new List<OverviewAGHealthDto>();
        var stateOrder = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
        {
            ["SUSPENDED"] = 1,
            ["NOT_HEALTHY"] = 2,
            ["NOT_SYNCHRONIZED"] = 3,
            ["ERROR"] = 4,
            ["HEALTHY"] = 5,
            ["N/A"] = 6
        };

        var agGroups = rawResults
            .Where(r => !string.IsNullOrEmpty(r.AGName))
            .GroupBy(r => r.AGName!, StringComparer.OrdinalIgnoreCase);

        foreach (var group in agGroups)
        {
            var agName = group.Key;
            var nodes = group.ToList();

            // Peor estado entre todos los nodos
            var worstState = nodes
                .OrderBy(n => stateOrder.GetValueOrDefault(n.WorstState, 6))
                .First().WorstState;

            // Max DatabaseCount (todos los nodos del AG tienen las mismas DBs)
            var dbCount = nodes.Max(n => n.DatabaseCount);
            // Min SynchronizedCount (peor caso entre nodos)
            var syncCount = nodes.Min(n => n.SynchronizedCount);
            // Max SuspendedCount
            var suspCount = nodes.Max(n => n.SuspendedCount);
            // Max de métricas de performance
            var maxSendQueue = nodes.Max(n => n.MaxSendQueueKB);
            var maxRedoQueue = nodes.Max(n => n.MaxRedoQueueKB);
            var maxSecsBehind = nodes.Max(n => n.MaxSecondsBehind);

            // Combinar detalles de nodos con problemas
            var allDetails = string.Join("|",
                nodes.Where(n => !string.IsNullOrEmpty(n.Details))
                     .Select(n => n.Details!));

            results.Add(new OverviewAGHealthDto
            {
                InstanceName = nodes.First().InstanceName,
                DisplayName = agName,
                Ambiente = nodes.First().Ambiente,
                WorstState = worstState,
                DatabaseCount = dbCount,
                SynchronizedCount = syncCount,
                SuspendedCount = suspCount,
                MaxSendQueueKB = maxSendQueue,
                MaxRedoQueueKB = maxRedoQueue,
                MaxSecondsBehind = maxSecsBehind,
                Details = string.IsNullOrEmpty(allDetails) ? null : allDetails
            });
        }

        return results
            .OrderBy(r => stateOrder.GetValueOrDefault(r.WorstState, 6))
            .ThenBy(r => r.DisplayName)
            .ToList();
    }

    /// <summary>
    /// Obtiene los backups con breach de producción consultando datos reales.
    /// Incluye AGName para agrupar nodos de Availability Groups.
    /// </summary>
    private async Task<List<OverviewBackupBreachRaw>> GetProductionBackupBreachesAsync(CancellationToken ct)
    {
        var results = new List<OverviewBackupBreachRaw>();

        // Traer TODOS los registros más recientes (incluyendo no-breached) para poder evaluar AGs correctamente
        var query = @"
            WITH LatestBackups AS (
                SELECT 
                    InstanceName,
                    FullBackupBreached,
                    LogBackupBreached,
                    LastFullBackup,
                    LastLogBackup,
                    BackupDetails,
                    ISNULL(LogCheckSuppressed, 0) AS LogCheckSuppressed,
                    LogCheckSuppressReason,
                    AGName,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Backups
                WHERE Ambiente = 'Produccion'
            )
            SELECT InstanceName, FullBackupBreached, LogBackupBreached, 
                   LastFullBackup, LastLogBackup, BackupDetails,
                   LogCheckSuppressed, LogCheckSuppressReason, AGName
            FROM LatestBackups
            WHERE rn = 1";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 30;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new OverviewBackupBreachRaw
            {
                InstanceName = reader.GetString(0),
                FullBackupBreached = !reader.IsDBNull(1) && reader.GetBoolean(1),
                LogBackupBreached = !reader.IsDBNull(2) && reader.GetBoolean(2),
                LastFullBackup = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                LastLogBackup = reader.IsDBNull(4) ? null : reader.GetDateTime(4),
                BackupDetails = reader.IsDBNull(5) ? null : reader.GetString(5),
                LogCheckSuppressed = !reader.IsDBNull(6) && reader.GetBoolean(6),
                LogCheckSuppressReason = reader.IsDBNull(7) ? null : reader.GetString(7),
                AGName = reader.IsDBNull(8) ? null : reader.GetString(8)
            });
        }

        return results;
    }

    /// <summary>
    /// Construye la lista de backup issues agrupando por Availability Group.
    /// Para AGs: si al menos un nodo tiene backup OK (no breached), el AG no se reporta como breached.
    /// El backup en AGs se ejecuta en un solo nodo, por lo que es suficiente que un nodo tenga backup.
    /// </summary>
    private static List<OverviewBackupIssueDto> BuildBackupIssuesWithAGGrouping(
        List<OverviewBackupBreachRaw> allBackups, 
        List<OverviewHealthScoreRaw> healthScores)
    {
        var results = new List<OverviewBackupIssueDto>();
        var agProcessed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        // Separar instancias con y sin AG
        var agBackups = allBackups.Where(b => !string.IsNullOrEmpty(b.AGName)).ToList();
        var standaloneBackups = allBackups.Where(b => string.IsNullOrEmpty(b.AGName)).ToList();

        // Procesar AGs: agrupar por AGName
        var agGroups = agBackups.GroupBy(b => b.AGName!, StringComparer.OrdinalIgnoreCase);

        foreach (var agGroup in agGroups)
        {
            var agName = agGroup.Key;
            var nodes = agGroup.ToList();

            // Para determinar breach del AG:
            // Si al menos un nodo NO tiene FULL breach → el AG no tiene FULL breach
            // Si al menos un nodo NO tiene LOG breach → el AG no tiene LOG breach
            // (Porque el backup se ejecuta en un solo nodo del AG)
            var agFullBreached = nodes.All(n => n.FullBackupBreached);
            var agLogBreached = nodes.All(n => n.LogBackupBreached);

            // Si ningún tipo de backup está atrasado a nivel AG, no agregar
            if (!agFullBreached && !agLogBreached)
            {
                continue;
            }

            // Usar los mejores valores (más recientes) del AG
            var bestFullBackup = nodes
                .Where(n => n.LastFullBackup.HasValue)
                .OrderByDescending(n => n.LastFullBackup)
                .FirstOrDefault()?.LastFullBackup;
            var bestLogBackup = nodes
                .Where(n => n.LastLogBackup.HasValue)
                .OrderByDescending(n => n.LastLogBackup)
                .FirstOrDefault()?.LastLogBackup;

            // Supresión: si algún nodo tiene LOG suprimido, el AG hereda
            var logSuppressed = nodes.Any(n => n.LogCheckSuppressed);
            var suppressReason = nodes.FirstOrDefault(n => n.LogCheckSuppressed)?.LogCheckSuppressReason;

            // Combinar los details de todos los nodos
            var allDetails = string.Join("|", nodes.Where(n => !string.IsNullOrEmpty(n.BackupDetails)).Select(n => n.BackupDetails));

            // Crear un raw ficticio para reutilizar los helpers
            var agRaw = new OverviewBackupBreachRaw
            {
                InstanceName = nodes.First().InstanceName,
                FullBackupBreached = agFullBreached,
                LogBackupBreached = agLogBreached,
                BackupDetails = allDetails,
                LogCheckSuppressed = logSuppressed,
                LogCheckSuppressReason = suppressReason
            };

            // Obtener el score del primer nodo disponible
            var score = nodes
                .Select(n => healthScores.FirstOrDefault(h => h.InstanceName.Equals(n.InstanceName, StringComparison.OrdinalIgnoreCase))?.BackupsScore ?? 0)
                .Min();

            results.Add(new OverviewBackupIssueDto
            {
                InstanceName = nodes.First().InstanceName,
                DisplayName = agName,
                AgName = agName,
                Score = score,
                FullBackupBreached = agFullBreached,
                LogBackupBreached = agLogBreached,
                LastFullBackup = bestFullBackup,
                LastLogBackup = bestLogBackup,
                Issues = BuildBackupIssuesList(agRaw),
                BreachedDatabases = ParseBreachedDatabases(allDetails, agFullBreached, agLogBreached),
                LogCheckSuppressed = logSuppressed,
                LogCheckSuppressReason = suppressReason
            });
        }

        // Procesar instancias standalone (sin AG)
        foreach (var b in standaloneBackups)
        {
            // Solo incluir si tiene algún breach
            if (!b.FullBackupBreached && !b.LogBackupBreached)
            {
                continue;
            }

            results.Add(new OverviewBackupIssueDto
            {
                InstanceName = b.InstanceName,
                DisplayName = b.InstanceName,
                AgName = null,
                Score = healthScores.FirstOrDefault(h => h.InstanceName.Equals(b.InstanceName, StringComparison.OrdinalIgnoreCase))?.BackupsScore ?? 0,
                FullBackupBreached = b.FullBackupBreached,
                LogBackupBreached = b.LogBackupBreached,
                LastFullBackup = b.LastFullBackup,
                LastLogBackup = b.LastLogBackup,
                Issues = BuildBackupIssuesList(b),
                BreachedDatabases = ParseBreachedDatabases(b.BackupDetails, b.FullBackupBreached, b.LogBackupBreached),
                LogCheckSuppressed = b.LogCheckSuppressed,
                LogCheckSuppressReason = b.LogCheckSuppressReason
            });
        }

        return results
            .OrderBy(b => b.Score)
            .ThenByDescending(b => b.FullBackupBreached)
            .ToList();
    }

    /// <summary>
    /// Construye la lista de issues de backup basada en los flags de breach
    /// </summary>
    private static List<string> BuildBackupIssuesList(OverviewBackupBreachRaw backup)
    {
        var issues = new List<string>();
        
        if (backup.FullBackupBreached)
            issues.Add("FULL vencido");
        if (backup.LogBackupBreached)
            issues.Add("LOG vencido");
        
        return issues;
    }

    /// <summary>
    /// Parsea el BackupDetails para obtener las bases de datos con breach
    /// Formato esperado: "DBName:FULL=Xh|DBName2:LOG=Yh..."
    /// </summary>
    private static List<string> ParseBreachedDatabases(string? backupDetails, bool fullBreached, bool logBreached)
    {
        var breachedDbs = new List<string>();
        
        if (string.IsNullOrEmpty(backupDetails))
        {
            // Si no hay detalles pero hay breach, mostrar mensaje genérico
            if (fullBreached)
                breachedDbs.Add("Backup FULL atrasado (sin detalle de DBs)");
            if (logBreached)
                breachedDbs.Add("Backup LOG atrasado (sin detalle de DBs)");
            return breachedDbs;
        }

        // Parsear el formato "DBName:FULL=Xh|DBName2:LOG=Yh..."
        var entries = backupDetails.Split('|', StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var entry in entries)
        {
            // Ignorar marcadores especiales
            if (entry.Contains("SYNCED_FROM_AG") || entry.Contains("VM_BACKUP"))
                continue;

            // Formato: "DBName:FULL=Xh" o "DBName:LOG=Xh"
            var parts = entry.Split(':');
            if (parts.Length >= 2)
            {
                var dbName = parts[0];
                var backupInfo = parts[1];
                
                // Determinar si es FULL o LOG
                var isFullType = backupInfo.StartsWith("FULL", StringComparison.OrdinalIgnoreCase);
                var isLogType = backupInfo.StartsWith("LOG", StringComparison.OrdinalIgnoreCase);
                
                // Extraer horas del backup
                var hoursMatch = System.Text.RegularExpressions.Regex.Match(backupInfo, @"=(\d+)h");
                if (hoursMatch.Success && int.TryParse(hoursMatch.Groups[1].Value, out int hours))
                {
                    if (isFullType && fullBreached)
                    {
                        breachedDbs.Add($"{dbName} (FULL: {hours}h)");
                    }
                    else if (isLogType && logBreached)
                    {
                        breachedDbs.Add($"{dbName} (LOG: {hours}h)");
                    }
                }
            }
        }

        return breachedDbs;
    }

    /// <summary>
    /// Auto-resuelve asignaciones activas cuyos issues ya no existen en las listas actuales.
    /// Esto evita que una asignación vieja reaparezca si el problema se resolvió y luego vuelve.
    /// </summary>
    private async Task AutoResolveStaleAssignmentsAsync(
        ApplicationDbContext context,
        List<OverviewBackupIssueDto> backupIssues,
        List<OverviewCriticalDiskDto> criticalDisks,
        List<OverviewMaintenanceOverdueDto> maintenanceOverdue,
        CancellationToken ct)
    {
        try
        {
            var activeAssignments = await context.OverviewIssueAssignments
                .Where(a => a.ResolvedAt == null)
                .ToListAsync(ct);

            if (activeAssignments.Count == 0)
                return;

            // Construir sets de keys actuales para cada tipo
            var backupKeys = new HashSet<string>(
                backupIssues.Select(b => b.DisplayName ?? b.InstanceName),
                StringComparer.OrdinalIgnoreCase);

            var diskKeys = new HashSet<string>(
                criticalDisks.Select(d => $"{d.InstanceName}|{d.Drive}"),
                StringComparer.OrdinalIgnoreCase);

            var maintenanceKeys = new HashSet<string>(
                maintenanceOverdue.Select(m => $"{m.InstanceName}|{m.Tipo}"),
                StringComparer.OrdinalIgnoreCase);

            var resolvedCount = 0;

            foreach (var assignment in activeAssignments)
            {
                bool isStale = assignment.IssueType switch
                {
                    "Backup" => !backupKeys.Contains(assignment.InstanceName),
                    "Disk" => !diskKeys.Contains($"{assignment.InstanceName}|{assignment.DriveOrTipo}"),
                    "Maintenance" => !maintenanceKeys.Contains($"{assignment.InstanceName}|{assignment.DriveOrTipo}"),
                    _ => false
                };

                if (isStale)
                {
                    assignment.ResolvedAt = LocalClockAR.Now;
                    assignment.Notes = "Auto-resuelto: el problema ya no se detecta en el último chequeo";
                    resolvedCount++;
                }
            }

            if (resolvedCount > 0)
            {
                await context.SaveChangesAsync(ct);
                _logger.LogInformation(
                    "Auto-resueltas {Count} asignaciones cuyo problema ya no existe",
                    resolvedCount);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al auto-resolver asignaciones obsoletas");
        }
    }

    /// <summary>
    /// Verifica si una instancia está en la lista de servidores excluidos,
    /// comparando nombre completo y hostname.
    /// </summary>
    private static bool IsInstanceExcluded(string instanceName, HashSet<string> excludedServers)
    {
        return excludedServers.Contains(instanceName)
            || excludedServers.Contains(instanceName.Split('\\')[0]);
    }

    #endregion

    /// <summary>
    /// Clase auxiliar para deserializar JSON de volúmenes
    /// </summary>
    private class DiskVolumeJson
    {
        public string? MountPoint { get; set; }
        public string? VolumeName { get; set; }
        public decimal? TotalGB { get; set; }
        public decimal? FreeGB { get; set; }
        public decimal? FreePct { get; set; }
        public decimal? RealFreeGB { get; set; }
        public decimal? RealFreePct { get; set; }
        public decimal? FreeSpaceInGrowableFilesGB { get; set; }
        public bool? IsAlerted { get; set; }
        public int? FilesWithGrowth { get; set; }
        /// <summary>
        /// v3.5: Indica si es un disco crítico del sistema (C, E, F, G, H)
        /// </summary>
        public bool? IsCriticalSystemDisk { get; set; }
    }

    /// <summary>
    /// Clase auxiliar para datos crudos de AlwaysOn antes de agrupar por AG
    /// </summary>
    private class AGHealthRaw
    {
        public string InstanceName { get; set; } = string.Empty;
        public string? Ambiente { get; set; }
        public string WorstState { get; set; } = "N/A";
        public int DatabaseCount { get; set; }
        public int SynchronizedCount { get; set; }
        public int SuspendedCount { get; set; }
        public int MaxSendQueueKB { get; set; }
        public int MaxRedoQueueKB { get; set; }
        public int MaxSecondsBehind { get; set; }
        public string? Details { get; set; }
        public string? AGName { get; set; }
    }
}
