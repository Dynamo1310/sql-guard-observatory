using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using SQLGuardObservatory.API.Services;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de mantenimiento - REPLICANDO LÓGICA POWERSHELL TAL CUAL
/// Basado en: scripts/RelevamientoHealthScore_Maintenance.ps1
/// 
/// Métricas:
/// - CHECKDB jobs (IntegrityCheck)
/// - IndexOptimize jobs
/// 
/// Características:
/// - Valida que TODOS los pasos del job estén OK (no solo el resumen)
/// - Maneja jobs CON historial (sysjobhistory) y SIN historial (sysjobservers)
/// - Sincronización AlwaysOn: aplica el mejor resultado a todos los nodos del AG
/// - Retry con timeout extendido (30s → 60s) para instancias lentas
/// - Cutoff de 7 días para considerar un job como "reciente"
/// 
/// Peso: 5%
/// </summary>
public class MaintenanceCollector : CollectorBase<MaintenanceCollector.MaintenanceMetrics>
{
    private const int TIMEOUT_INITIAL = 30;
    private const int TIMEOUT_RETRY = 60;
    private const int CUTOFF_DAYS = 7;

    // Cache de grupos AlwaysOn identificados en PreProcess
    private Dictionary<string, List<string>> _agGroups = new();
    private Dictionary<string, string> _nodeToAgName = new();
    private Dictionary<string, string> _agPrimaryNode = new(); // AGName -> PrimaryNodeName
    
    // Cache de excepciones cargadas en PreProcess
    private HashSet<string> _checkdbExceptions = new(StringComparer.OrdinalIgnoreCase);
    private HashSet<string> _indexOptimizeExceptions = new(StringComparer.OrdinalIgnoreCase);

    public override string CollectorName => "Maintenance";
    public override string DisplayName => "Mantenimientos";
    protected override bool IncludeAWS => true;

    public MaintenanceCollector(
        ILogger<MaintenanceCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    /// <summary>
    /// Pre-procesamiento: Identificar grupos de AlwaysOn, detectar nodos PRIMARY y cargar excepciones
    /// </summary>
    protected override async Task PreProcessAsync(
        List<SqlInstanceInfo> instances,
        CancellationToken ct)
    {
        _agGroups.Clear();
        _nodeToAgName.Clear();
        _agPrimaryNode.Clear();
        _checkdbExceptions.Clear();
        _indexOptimizeExceptions.Clear();

        // === CARGAR EXCEPCIONES ===
        _logger.LogInformation("🔍 [PRE-PROCESO] Cargando excepciones de mantenimiento...");
        try
        {
            var exceptions = await _configService.GetActiveExceptionsAsync(CollectorName, ct);
            foreach (var exception in exceptions)
            {
                if (exception.ExceptionType.Equals("CHECKDB", StringComparison.OrdinalIgnoreCase))
                {
                    _checkdbExceptions.Add(exception.ServerName);
                    _logger.LogDebug("    + Excepción CHECKDB: '{ServerName}'", exception.ServerName);
                }
                else if (exception.ExceptionType.Equals("IndexOptimize", StringComparison.OrdinalIgnoreCase))
                {
                    _indexOptimizeExceptions.Add(exception.ServerName);
                    _logger.LogDebug("    + Excepción IndexOptimize: '{ServerName}'", exception.ServerName);
                }
            }
            
            if (_checkdbExceptions.Count > 0 || _indexOptimizeExceptions.Count > 0)
            {
                _logger.LogInformation("  📋 Excepciones cargadas: CHECKDB={CheckdbCount} ({CheckdbServers}), IndexOptimize={IndexOptCount}",
                    _checkdbExceptions.Count, string.Join(", ", _checkdbExceptions), _indexOptimizeExceptions.Count);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning("Error cargando excepciones: {Error}", ex.Message);
        }

        _logger.LogInformation("🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn y nodos primarios...");

        foreach (var instance in instances.Where(i => i.IsAlwaysOnEnabled))
        {
            try
            {
                // Query mejorada que incluye el rol de cada réplica (PRIMARY/SECONDARY)
                var agQuery = @"
SELECT DISTINCT
    ag.name AS AGName,
    ar.replica_server_name AS ReplicaServer,
    ISNULL(ars.role_desc, 'UNKNOWN') AS Role
FROM sys.availability_groups ag
INNER JOIN sys.availability_replicas ar ON ag.group_id = ar.group_id
LEFT JOIN sys.dm_hadr_availability_replica_states ars ON ar.replica_id = ars.replica_id
ORDER BY ag.name, ar.replica_server_name";

                var agData = await ExecuteQueryAsync(instance.InstanceName, agQuery, 10, ct, instance.HostingSite, instance.Ambiente);

                foreach (DataRow row in agData.Rows)
                {
                    var agName = GetString(row, "AGName");
                    var replicaServer = GetString(row, "ReplicaServer");
                    var role = GetString(row, "Role") ?? "UNKNOWN";

                    if (!string.IsNullOrEmpty(agName) && !string.IsNullOrEmpty(replicaServer))
                    {
                        if (!_agGroups.ContainsKey(agName))
                        {
                            _agGroups[agName] = new List<string>();
                        }
                        if (!_agGroups[agName].Contains(replicaServer))
                        {
                            _agGroups[agName].Add(replicaServer);
                        }
                        _nodeToAgName[replicaServer] = agName;

                        // Registrar el nodo PRIMARY del grupo
                        if (role.Equals("PRIMARY", StringComparison.OrdinalIgnoreCase))
                        {
                            _agPrimaryNode[agName] = replicaServer;
                            _logger.LogDebug("    🔵 AG {AGName}: Nodo PRIMARY detectado: {PrimaryNode}", agName, replicaServer);
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug("No se pudo consultar AG en {Instance}: {Error}", 
                    instance.InstanceName, ex.Message);
            }
        }

        if (_agGroups.Count > 0)
        {
            _logger.LogInformation("  ✅ {Count} grupo(s) AlwaysOn identificado(s)", _agGroups.Count);
            foreach (var ag in _agGroups)
            {
                var primaryInfo = _agPrimaryNode.TryGetValue(ag.Key, out var primary) 
                    ? $" (PRIMARY: {primary})" 
                    : " (PRIMARY no detectado)";
                _logger.LogDebug("    • {AGName}: {Nodes}{PrimaryInfo}", ag.Key, string.Join(", ", ag.Value), primaryInfo);
            }
        }
        else
        {
            _logger.LogInformation("  ℹ️ No se encontraron grupos AlwaysOn");
        }
    }

    /// <summary>
    /// Prefijos de instancias AWS que se excluyen de la recolección de mantenimiento.
    /// Read replicas no tienen SQL Agent, restores son temporales.
    /// </summary>
    private static readonly string[] _excludedAwsPrefixes = { "readreplica", "restore" };

    protected override async Task<MaintenanceMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new MaintenanceMetrics();
        var cutoffDate = DateTime.Now.AddDays(-CUTOFF_DAYS);

        // Excluir instancias AWS que no aplican para mantenimiento (read replicas, restores)
        if (instance.IsAWS)
        {
            var lowerName = instance.InstanceName.ToLowerInvariant();
            foreach (var prefix in _excludedAwsPrefixes)
            {
                if (lowerName.StartsWith(prefix))
                {
                    _logger.LogDebug("Skipping AWS instance {Instance} (matches excluded prefix '{Prefix}')", 
                        instance.InstanceName, prefix);
                    result.CheckdbOk = true;
                    result.IndexOptimizeOk = true;
                    return result;
                }
            }
        }

        // Asignar AGName si la instancia pertenece a un grupo
        result.AGName = GetAgNameForInstance(instance.InstanceName);

        // Verificar excepciones para esta instancia
        // Soporta: FQDN (server.domain.com), hostname (server), instancia nombrada (server\instance)
        var hostname = instance.InstanceName.Split('\\')[0]; // SERVER.domain.com o SERVER
        var shortName = hostname.Split('.')[0]; // SERVER (sin dominio)
        
        // Debug: mostrar comparaciones para servidores que podrían estar exceptuados
        if (_checkdbExceptions.Count > 0 || _indexOptimizeExceptions.Count > 0)
        {
            _logger.LogDebug("  🔍 Verificando excepciones para '{Instance}' (hostname='{Hostname}', shortName='{ShortName}')", 
                instance.InstanceName, hostname, shortName);
        }
        
        result.CheckdbExcepted = _checkdbExceptions.Contains(instance.InstanceName) 
                               || _checkdbExceptions.Contains(hostname)
                               || _checkdbExceptions.Contains(shortName);
        result.IndexOptimizeExcepted = _indexOptimizeExceptions.Contains(instance.InstanceName) 
                                     || _indexOptimizeExceptions.Contains(hostname)
                                     || _indexOptimizeExceptions.Contains(shortName);
        
        if (result.CheckdbExcepted || result.IndexOptimizeExcepted)
        {
            _logger.LogInformation("  ✅ {Instance} EXCEPTUADO: CHECKDB={Checkdb}, IndexOptimize={IndexOpt}", 
                instance.InstanceName, result.CheckdbExcepted, result.IndexOptimizeExcepted);
        }

        try
        {
            // === QUERY CHECKDB JOBS con retry ===
            var checkdbQuery = instance.IsAWS ? GetCheckdbJobsQueryRDS() : GetCheckdbJobsQuery();
            DataTable? checkdbData = null;
            
            // Intento 1 con timeout normal
            try
            {
                checkdbData = await ExecuteQueryAsync(instance.InstanceName, checkdbQuery, TIMEOUT_INITIAL, ct, instance.HostingSite, instance.Ambiente);
            }
            catch (Exception ex1)
            {
                await Task.Delay(500, ct);
                
                // Intento 2: en AWS usar sp_help_job en C# (no requiere permisos directos en msdb tables)
                // En on-premise reintentar con timeout extendido
                try
                {
                    if (instance.IsAWS)
                    {
                        _logger.LogInformation("Query directa CHECKDB falló en RDS {Instance} ({Error}), usando sp_help_job fallback en C#", 
                            instance.InstanceName, ex1.Message);
                        checkdbData = await ExecuteSpHelpJobFallbackAsync(instance, "IntegrityCheck", TIMEOUT_RETRY, ct);
                    }
                    else
                    {
                        checkdbData = await ExecuteQueryAsync(instance.InstanceName, checkdbQuery, TIMEOUT_RETRY, ct, instance.HostingSite, instance.Ambiente);
                    }
                }
                catch (Exception ex2)
                {
                    _logger.LogWarning("Query CHECKDB falló en {Instance}, asumiendo 0 jobs: {Error}", 
                        instance.InstanceName, ex2.Message);
                    checkdbData = new DataTable();
                }
            }

            ProcessCheckdbJobs(checkdbData, result, cutoffDate);

            // === QUERY INDEXOPTIMIZE JOBS con retry ===
            var indexOptQuery = instance.IsAWS ? GetIndexOptimizeJobsQueryRDS() : GetIndexOptimizeJobsQuery();
            DataTable? indexOptData = null;
            
            // Intento 1 con timeout normal
            try
            {
                indexOptData = await ExecuteQueryAsync(instance.InstanceName, indexOptQuery, TIMEOUT_INITIAL, ct, instance.HostingSite, instance.Ambiente);
            }
            catch (Exception ex1)
            {
                await Task.Delay(500, ct);
                
                // Intento 2: en AWS usar sp_help_job fallback en C#
                try
                {
                    if (instance.IsAWS)
                    {
                        _logger.LogInformation("Query directa IndexOptimize falló en RDS {Instance} ({Error}), usando sp_help_job fallback en C#", 
                            instance.InstanceName, ex1.Message);
                        indexOptData = await ExecuteSpHelpJobFallbackAsync(instance, "IndexOptimize", TIMEOUT_RETRY, ct);
                    }
                    else
                    {
                        indexOptData = await ExecuteQueryAsync(instance.InstanceName, indexOptQuery, TIMEOUT_RETRY, ct, instance.HostingSite, instance.Ambiente);
                    }
                }
                catch (Exception ex2)
                {
                    _logger.LogWarning("Query IndexOptimize falló en {Instance}, asumiendo 0 jobs: {Error}", 
                        instance.InstanceName, ex2.Message);
                    indexOptData = new DataTable();
                }
            }

            ProcessIndexOptimizeJobs(indexOptData, result, cutoffDate);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error procesando maintenance jobs en {Instance}", instance.InstanceName);
        }

        return result;
    }

    /// <summary>
    /// Obtiene el nombre del AG para una instancia (puede ser hostname o instancia completa)
    /// </summary>
    private string? GetAgNameForInstance(string instanceName)
    {
        // Buscar coincidencia exacta primero
        if (_nodeToAgName.TryGetValue(instanceName, out var agName))
        {
            return agName;
        }

        // Buscar por hostname (para instancias nombradas: SERVER\INSTANCE -> SERVER)
        var hostname = instanceName.Split('\\')[0];
        if (_nodeToAgName.TryGetValue(hostname, out agName))
        {
            return agName;
        }

        // Buscar coincidencia parcial
        foreach (var kvp in _nodeToAgName)
        {
            if (instanceName.Contains(kvp.Key, StringComparison.OrdinalIgnoreCase) ||
                kvp.Key.Contains(instanceName.Split('\\')[0], StringComparison.OrdinalIgnoreCase))
            {
                return kvp.Value;
            }
        }

        return null;
    }

    /// <summary>
    /// Procesa los jobs de CHECKDB (IntegrityCheck) - TAL CUAL el PowerShell
    /// </summary>
    private void ProcessCheckdbJobs(DataTable table, MaintenanceMetrics result, DateTime cutoffDate)
    {
        DateTime? mostRecentCheckdb = null;
        bool allCheckdbOk = true;

        foreach (DataRow row in table.Rows)
        {
            var jobName = GetString(row, "JobName") ?? "";
            var finishTime = GetDateTime(row, "LastFinishTime");
            var lastRunDate = GetInt(row, "LastRunDate");
            var lastRunTime = GetInt(row, "LastRunTime");
            var lastRunDuration = GetInt(row, "LastRunDuration");
            var lastRunStatus = GetInt(row, "LastRunStatus");
            var isRealSuccessInt = GetInt(row, "IsRealSuccess");
            var totalSteps = GetInt(row, "TotalSteps");
            var successfulSteps = GetInt(row, "SuccessfulSteps");
            var failedSteps = GetInt(row, "FailedSteps");
            var hasHistoryInt = GetInt(row, "HasHistory");

            // Calcular FinishTime si no viene directo (como en PowerShell)
            if (!finishTime.HasValue && lastRunDate > 0 && lastRunTime >= 0)
            {
                finishTime = CalculateFinishTime(lastRunDate, lastRunTime, lastRunDuration);
            }

            // IsRealSuccess: como en PowerShell, valida run_status = 1, FailedSteps = 0, TotalSteps >= 1
            bool isRealSuccess = isRealSuccessInt == 1;
            bool hasHistory = hasHistoryInt == 1;

            var jobInfo = new JobInfo
            {
                JobName = jobName,
                FinishTime = finishTime,
                IsSuccess = isRealSuccess,
                LastRunStatus = lastRunStatus,
                Duration = lastRunDuration,
                TotalSteps = totalSteps,
                SuccessfulSteps = successfulSteps,
                FailedSteps = failedSteps,
                HasHistory = hasHistory
            };

            result.CheckdbJobs.Add(jobInfo);

            // Log de diagnóstico cuando el historial de steps fue purgado
            if (totalSteps == 0 && isRealSuccess)
            {
                _logger.LogDebug("  ⚠️ CHECKDB job '{JobName}' tiene TotalSteps=0 pero run_status=1 (historial de steps purgado)", jobName);
            }

            if (finishTime.HasValue)
            {
                // Un job es reciente si: FinishTime >= cutoff Y fue éxito real
                var isRecent = finishTime.Value >= cutoffDate && isRealSuccess;

                // Actualizar más reciente (SOLO si fue éxito real, como en PowerShell)
                if (isRealSuccess && (!mostRecentCheckdb.HasValue || finishTime.Value > mostRecentCheckdb.Value))
                {
                    mostRecentCheckdb = finishTime.Value;
                }

                // Si alguno NO está OK, marcar como no OK
                if (!isRecent)
                {
                    allCheckdbOk = false;
                    _logger.LogDebug("  ❌ CHECKDB job '{JobName}' NO está OK: FinishTime={FinishTime}, IsRealSuccess={IsSuccess}, Cutoff={Cutoff}",
                        jobName, finishTime.Value.ToString("yyyy-MM-dd HH:mm:ss"), isRealSuccess, cutoffDate.ToString("yyyy-MM-dd HH:mm:ss"));
                }
            }
            else
            {
                // Job existe pero no tiene datos válidos = no OK
                allCheckdbOk = false;
            }
        }

        // Solo setear si hay jobs (como en PowerShell: if ($checkdbJobs.Count -gt 0))
        if (table.Rows.Count > 0)
        {
            result.LastCheckdb = mostRecentCheckdb;
            result.CheckdbOk = allCheckdbOk;
        }
    }

    /// <summary>
    /// Procesa los jobs de IndexOptimize - TAL CUAL el PowerShell
    /// </summary>
    private void ProcessIndexOptimizeJobs(DataTable table, MaintenanceMetrics result, DateTime cutoffDate)
    {
        DateTime? mostRecentIndexOpt = null;
        bool allIndexOptOk = true;

        foreach (DataRow row in table.Rows)
        {
            var jobName = GetString(row, "JobName") ?? "";
            var finishTime = GetDateTime(row, "LastFinishTime");
            var lastRunDate = GetInt(row, "LastRunDate");
            var lastRunTime = GetInt(row, "LastRunTime");
            var lastRunDuration = GetInt(row, "LastRunDuration");
            var lastRunStatus = GetInt(row, "LastRunStatus");
            var isRealSuccessInt = GetInt(row, "IsRealSuccess");
            var totalSteps = GetInt(row, "TotalSteps");
            var successfulSteps = GetInt(row, "SuccessfulSteps");
            var failedSteps = GetInt(row, "FailedSteps");
            var hasHistoryInt = GetInt(row, "HasHistory");

            // Calcular FinishTime si no viene directo
            if (!finishTime.HasValue && lastRunDate > 0 && lastRunTime >= 0)
            {
                finishTime = CalculateFinishTime(lastRunDate, lastRunTime, lastRunDuration);
            }

            bool isRealSuccess = isRealSuccessInt == 1;
            bool hasHistory = hasHistoryInt == 1;

            var jobInfo = new JobInfo
            {
                JobName = jobName,
                FinishTime = finishTime,
                IsSuccess = isRealSuccess,
                LastRunStatus = lastRunStatus,
                Duration = lastRunDuration,
                TotalSteps = totalSteps,
                SuccessfulSteps = successfulSteps,
                FailedSteps = failedSteps,
                HasHistory = hasHistory
            };

            result.IndexOptimizeJobs.Add(jobInfo);

            // Log de diagnóstico cuando el historial de steps fue purgado
            if (totalSteps == 0 && isRealSuccess)
            {
                _logger.LogDebug("  ⚠️ IndexOptimize job '{JobName}' tiene TotalSteps=0 pero run_status=1 (historial de steps purgado)", jobName);
            }

            if (finishTime.HasValue)
            {
                var isRecent = finishTime.Value >= cutoffDate && isRealSuccess;

                if (isRealSuccess && (!mostRecentIndexOpt.HasValue || finishTime.Value > mostRecentIndexOpt.Value))
                {
                    mostRecentIndexOpt = finishTime.Value;
                }

                if (!isRecent)
                {
                    allIndexOptOk = false;
                    _logger.LogDebug("  ❌ IndexOptimize job '{JobName}' NO está OK: FinishTime={FinishTime}, IsRealSuccess={IsSuccess}, Cutoff={Cutoff}",
                        jobName, finishTime.Value.ToString("yyyy-MM-dd HH:mm:ss"), isRealSuccess, cutoffDate.ToString("yyyy-MM-dd HH:mm:ss"));
                }
            }
            else
            {
                allIndexOptOk = false;
            }
        }

        if (table.Rows.Count > 0)
        {
            result.LastIndexOptimize = mostRecentIndexOpt;
            result.IndexOptimizeOk = allIndexOptOk;
        }
    }

    /// <summary>
    /// Calcula el tiempo de FINALIZACIÓN desde run_date + run_time + duration
    /// Formato SQL Server: run_date = YYYYMMDD, run_time = HHMMSS, duration = HHMMSS
    /// Como en PowerShell: $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
    /// </summary>
    private DateTime? CalculateFinishTime(int runDate, int runTime, int runDuration)
    {
        try
        {
            // Parse run_date (YYYYMMDD)
            var year = runDate / 10000;
            var month = (runDate / 100) % 100;
            var day = runDate % 100;

            // Parse run_time (HHMMSS)
            var hours = runTime / 10000;
            var minutes = (runTime / 100) % 100;
            var seconds = runTime % 100;

            var startTime = new DateTime(year, month, day, hours, minutes, seconds);

            // Parse duration (HHMMSS) y calcular tiempo de FINALIZACIÓN
            var durationHours = runDuration / 10000;
            var durationMinutes = (runDuration / 100) % 100;
            var durationSeconds = runDuration % 100;

            return startTime.AddHours(durationHours).AddMinutes(durationMinutes).AddSeconds(durationSeconds);
        }
        catch
        {
            return null;
        }
    }

    /// <summary>
    /// Post-procesamiento: Sincronizar mantenimiento entre nodos de AlwaysOn
    /// PRIORIZA el resultado del nodo PRIMARY y lo sincroniza a todos los nodos del grupo
    /// </summary>
    protected override async Task PostProcessAsync(
        List<CollectorInstanceResult> results,
        CancellationToken ct)
    {
        if (_agGroups.Count == 0)
        {
            _logger.LogDebug("No hay grupos AlwaysOn para sincronizar");
            return;
        }

        _logger.LogInformation("🔄 [POST-PROCESO] Sincronizando mantenimiento entre nodos AlwaysOn...");
        _logger.LogInformation("   📋 CHECKDB: Mejor resultado de todos los nodos | IndexOptimize: Resultado del PRIMARY");
        var cutoffDate = DateTime.Now.AddDays(-CUTOFF_DAYS);
        var syncedCount = 0;

        foreach (var agGroup in _agGroups)
        {
            var agName = agGroup.Key;
            var nodeNames = agGroup.Value;

            // Obtener el nodo PRIMARY de este grupo
            var hasPrimary = _agPrimaryNode.TryGetValue(agName, out var primaryNode);
            _logger.LogDebug("  🔧 Procesando AG: {AGName} - Nodos: {Nodes} - PRIMARY: {Primary}", 
                agName, string.Join(", ", nodeNames), primaryNode ?? "No detectado");

            // Obtener resultados de todos los nodos del grupo
            var groupResults = results
                .Where(r => nodeNames.Any(n => 
                    r.InstanceName.Equals(n, StringComparison.OrdinalIgnoreCase) ||
                    r.InstanceName.Split('\\')[0].Equals(n, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            if (groupResults.Count == 0)
            {
                _logger.LogDebug("    ⚠️ Sin resultados para este grupo");
                continue;
            }

            // === CHECKDB: Siempre usar el mejor resultado de TODOS los nodos ===
            var allCheckdbJobs = new List<JobInfo>();
            foreach (var nodeResult in groupResults)
            {
                if (nodeResult.MetricsObject is MaintenanceMetrics metrics)
                {
                    allCheckdbJobs.AddRange(metrics.CheckdbJobs);
                }
            }
            var (bestCheckdb, allCheckdbOk) = FindBestMaintenanceResult(allCheckdbJobs, cutoffDate, "CHECKDB");
            _logger.LogDebug("    🔄 CHECKDB (mejor de todos): {BestCheckdb} (OK: {CheckdbOk})", 
                bestCheckdb?.ToString("yyyy-MM-dd HH:mm:ss") ?? "NULL", allCheckdbOk);

            // === IndexOptimize: Usar resultado del PRIMARY si está disponible ===
            DateTime? bestIndexOptimize;
            bool allIndexOptimizeOk;

            MaintenanceMetrics? primaryMetrics = null;
            if (hasPrimary && !string.IsNullOrEmpty(primaryNode))
            {
                var primaryResult = groupResults.FirstOrDefault(r => 
                    r.InstanceName.Equals(primaryNode, StringComparison.OrdinalIgnoreCase) ||
                    r.InstanceName.Split('\\')[0].Equals(primaryNode, StringComparison.OrdinalIgnoreCase));
                
                if (primaryResult?.MetricsObject is MaintenanceMetrics metrics)
                {
                    primaryMetrics = metrics;
                }
            }

            if (primaryMetrics != null)
            {
                // Usar IndexOptimize del PRIMARY
                bestIndexOptimize = primaryMetrics.LastIndexOptimize;
                allIndexOptimizeOk = primaryMetrics.IndexOptimizeOk;
                _logger.LogDebug("    🔵 IndexOptimize del PRIMARY: {BestIndexOpt} (OK: {IndexOptOk})", 
                    bestIndexOptimize?.ToString("yyyy-MM-dd HH:mm:ss") ?? "NULL", allIndexOptimizeOk);
            }
            else
            {
                // Fallback: Mejor de todos los nodos
                _logger.LogDebug("    ⚠️ No se encontró PRIMARY, usando mejor IndexOptimize de todos los nodos");
                var allIndexOptimizeJobs = new List<JobInfo>();
                foreach (var nodeResult in groupResults)
                {
                    if (nodeResult.MetricsObject is MaintenanceMetrics metrics)
                    {
                        allIndexOptimizeJobs.AddRange(metrics.IndexOptimizeJobs);
                    }
                }
                (bestIndexOptimize, allIndexOptimizeOk) = FindBestMaintenanceResult(allIndexOptimizeJobs, cutoffDate, "IndexOptimize");
                _logger.LogDebug("    🔄 IndexOptimize (fallback): {BestIndexOpt} (OK: {IndexOptOk})", 
                    bestIndexOptimize?.ToString("yyyy-MM-dd HH:mm:ss") ?? "NULL", allIndexOptimizeOk);
            }

            // === APLICAR LOS VALORES A TODOS LOS NODOS ===
            foreach (var nodeResult in groupResults)
            {
                if (nodeResult.MetricsObject is MaintenanceMetrics metrics)
                {
                    metrics.LastCheckdb = bestCheckdb;
                    metrics.CheckdbOk = allCheckdbOk;
                    metrics.LastIndexOptimize = bestIndexOptimize;
                    metrics.IndexOptimizeOk = allIndexOptimizeOk;
                    metrics.AGName = agName;
                    
                    syncedCount++;
                }
            }

            _logger.LogDebug("    ✅ Sincronizados {Count} nodos del AG", groupResults.Count);
        }

        _logger.LogInformation("  ✅ Total: {Count} nodos sincronizados", syncedCount);

        // === ACTUALIZAR LA BD CON LOS VALORES SINCRONIZADOS ===
        await UpdateSyncedResultsInDatabaseAsync(results, ct);
        
        // === ACTUALIZAR EL CACHÉ DEL OVERVIEW ===
        await RefreshOverviewCacheAsync(results, ct);
    }

    /// <summary>
    /// Actualiza el caché del Overview después de recolectar los datos de mantenimiento
    /// </summary>
    private async Task RefreshOverviewCacheAsync(List<CollectorInstanceResult> results, CancellationToken ct)
    {
        // Solo actualizar el caché si hubo resultados exitosos
        var successCount = results.Count(r => r.Success);
        if (successCount == 0)
        {
            return;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var cacheService = scope.ServiceProvider.GetService<IOverviewSummaryCacheService>();
            
            if (cacheService != null)
            {
                await cacheService.RefreshCacheAsync("MaintenanceCollector", ct);
                _logger.LogDebug("Overview cache refreshed after MaintenanceCollector");
            }
        }
        catch (Exception ex)
        {
            // No propagar el error para no afectar el resultado del collector
            _logger.LogWarning(ex, "Error refreshing Overview cache after MaintenanceCollector");
        }
    }

    /// <summary>
    /// Encuentra el mejor resultado de mantenimiento basado en el FinishTime más reciente.
    /// Prioriza por tipo de job pero siempre respetando el FinishTime más reciente.
    /// </summary>
    private (DateTime? BestTime, bool AllOk) FindBestMaintenanceResult(
        List<JobInfo> jobs, 
        DateTime cutoffDate,
        string jobType)
    {
        if (jobs.Count == 0) return (null, false);

        // Separar jobs con y sin historial
        var jobsWithHistory = jobs.Where(j => j.HasHistory).ToList();
        var jobsWithoutHistory = jobs.Where(j => !j.HasHistory).ToList();

        _logger.LogDebug("      📊 {JobType} - Jobs con historial: {WithHistory}, sin historial: {WithoutHistory}",
            jobType, jobsWithHistory.Count, jobsWithoutHistory.Count);

        // PRIORIDAD 1: Jobs CON historial con mantenimiento real (TotalSteps > 1)
        var realJobsWithHistory = jobsWithHistory.Where(j => j.TotalSteps > 1).ToList();

        if (realJobsWithHistory.Count > 0)
        {
            var mostRecentReal = realJobsWithHistory
                .Where(j => j.FinishTime.HasValue)
                .OrderByDescending(j => j.FinishTime)
                .FirstOrDefault();

            if (mostRecentReal != null && mostRecentReal.FinishTime.HasValue)
            {
                var allOk = mostRecentReal.IsSuccess && mostRecentReal.FinishTime.Value >= cutoffDate;
                _logger.LogDebug("      ✅ Usando job CON historial con mantenimiento real: {JobName} - FinishTime: {FinishTime} - Success: {IsSuccess}",
                    mostRecentReal.JobName, mostRecentReal.FinishTime, mostRecentReal.IsSuccess);
                return (mostRecentReal.FinishTime, allOk);
            }
        }

        // PRIORIDAD 2: Jobs CON historial pero con pocos pasos
        if (jobsWithHistory.Count > 0)
        {
            var mostRecent = jobsWithHistory
                .Where(j => j.FinishTime.HasValue)
                .OrderByDescending(j => j.FinishTime)
                .FirstOrDefault();

            if (mostRecent != null && mostRecent.FinishTime.HasValue)
            {
                var allOk = mostRecent.IsSuccess && mostRecent.FinishTime.Value >= cutoffDate;
                _logger.LogDebug("      ⚠️ Usando job CON historial (pocos pasos): {JobName} - FinishTime: {FinishTime}",
                    mostRecent.JobName, mostRecent.FinishTime);
                return (mostRecent.FinishTime, allOk);
            }
        }

        // PRIORIDAD 3: Jobs SIN historial (fallback)
        if (jobsWithoutHistory.Count > 0)
        {
            var mostRecent = jobsWithoutHistory
                .Where(j => j.FinishTime.HasValue)
                .OrderByDescending(j => j.FinishTime)
                .FirstOrDefault();

            if (mostRecent != null && mostRecent.FinishTime.HasValue)
            {
                var allOk = mostRecent.IsSuccess && mostRecent.FinishTime.Value >= cutoffDate;
                _logger.LogDebug("      ⚠️ Usando job SIN historial (fallback): {JobName} - FinishTime: {FinishTime}",
                    mostRecent.JobName, mostRecent.FinishTime);
                return (mostRecent.FinishTime, allOk);
            }
        }

        return (null, false);
    }

    /// <summary>
    /// Actualiza los registros en la BD con los valores sincronizados de AlwaysOn
    /// </summary>
    private async Task UpdateSyncedResultsInDatabaseAsync(List<CollectorInstanceResult> results, CancellationToken ct)
    {
        foreach (var result in results.Where(r => r.Success && r.MetricsObject is MaintenanceMetrics))
        {
            var metrics = (MaintenanceMetrics)result.MetricsObject!;
            
            // Solo actualizar si tiene AGName (pertenece a un grupo AlwaysOn)
            if (string.IsNullOrEmpty(metrics.AGName)) continue;

            try
            {
                await SaveWithScopedContextAsync(async context =>
                {
                    // Obtener el registro más reciente de esta instancia
                    var latestRecord = context.InstanceHealthMaintenance
                        .Where(m => m.InstanceName == result.InstanceName)
                        .OrderByDescending(m => m.CollectedAtUtc)
                        .FirstOrDefault();

                    if (latestRecord != null)
                    {
                        // Actualizar con los valores sincronizados
                        latestRecord.LastCheckdb = metrics.LastCheckdb;
                        latestRecord.CheckdbOk = metrics.CheckdbOk;
                        latestRecord.LastIndexOptimize = metrics.LastIndexOptimize;
                        latestRecord.IndexOptimizeOk = metrics.IndexOptimizeOk;
                        latestRecord.AGName = metrics.AGName;

                        await context.SaveChangesAsync(ct);
                    }
                }, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error actualizando registro sincronizado para {Instance}", result.InstanceName);
            }
        }
    }

    protected override int CalculateScore(MaintenanceMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;

        // Penalización por CHECKDB (como en PowerShell: -30)
        // Solo aplicar si NO está exceptuado
        var checkdbFailed = !data.CheckdbOk && !data.CheckdbExcepted;
        if (checkdbFailed)
        {
            score -= 30;
        }

        // Penalización por IndexOptimize (como en PowerShell: -20)
        // Solo aplicar si NO está exceptuado
        var indexOptFailed = !data.IndexOptimizeOk && !data.IndexOptimizeExcepted;
        if (indexOptFailed)
        {
            score -= 20;
        }

        // Ambos fallando = crítico (cap en 30)
        // Solo aplicar si ninguno está exceptuado
        if (checkdbFailed && indexOptFailed)
        {
            score = Math.Min(score, 30);
        }

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, MaintenanceMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthMaintenance
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            LastCheckdb = data.LastCheckdb,
            LastIndexOptimize = data.LastIndexOptimize,
            CheckdbOk = data.CheckdbOk,
            IndexOptimizeOk = data.IndexOptimizeOk,
            AGName = data.AGName
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthMaintenance.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    /// <summary>
    /// Query para IntegrityCheck jobs (CHECKDB)
    /// REPLICA EXACTA del CTE del PowerShell con validación de todos los pasos
    /// </summary>
    private string GetCheckdbJobsQuery()
    {
        return @"
-- IntegrityCheck jobs con validación de TODOS los pasos (replicando lógica PowerShell TAL CUAL)
-- Un job solo se considera exitoso si:
-- 1. El step_id = 0 (resumen) está en status 1 (Succeeded)
-- 2. TODOS los pasos individuales (step_id > 0) de esa ejecución están en status 1
-- 3. Se ejecutó más de 1 paso (evita jobs que solo verifican rol primario y salen)
WITH JobsWithHistory AS (
    -- Jobs que tienen historial en sysjobhistory
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        -- Calcular tiempo de finalización
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        -- Contar total de pasos ejecutados (excluyendo step 0)
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0) AS TotalSteps,
        -- Contar pasos exitosos (excluyendo step 0)
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status = 1) AS SuccessfulSteps,
        -- Contar pasos fallidos
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
),
JobsWithoutHistory AS (
    -- Jobs SIN historial pero CON datos en sysjobservers (última ejecución)
    SELECT 
        j.job_id,
        j.name AS JobName,
        js.last_run_date AS run_date,
        js.last_run_time AS run_time,
        js.last_run_duration AS run_duration,
        js.last_run_outcome AS run_status,
        CASE WHEN js.last_run_date > 0 THEN
            DATEADD(SECOND, 
                (js.last_run_duration / 10000) * 3600 + ((js.last_run_duration / 100) % 100) * 60 + (js.last_run_duration % 100),
                CAST(CAST(js.last_run_date AS VARCHAR) + ' ' + 
                     STUFF(STUFF(RIGHT('000000' + CAST(js.last_run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                     AS DATETIME)
            )
        ELSE NULL END AS FinishTime,
        -- Sin historial detallado, asumimos TotalSteps = 2 para que participe normalmente
        2 AS TotalSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 2 ELSE 0 END AS SuccessfulSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 0 ELSE 2 END AS FailedSteps,
        0 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
      AND js.last_run_date > 0
      AND NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobhistory jh WHERE jh.job_id = j.job_id AND jh.step_id = 0)
),
AllJobExecutions AS (
    SELECT * FROM JobsWithHistory
    UNION ALL
    SELECT * FROM JobsWithoutHistory
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS LastRunDate,
        run_time AS LastRunTime,
        run_duration AS LastRunDuration,
        run_status AS LastRunStatus,
        FinishTime AS LastFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        -- Un job es realmente exitoso si:
        -- 1. El job terminó exitoso (run_status = 1)
        -- 2. Todos los pasos fueron exitosos (FailedSteps = 0)
        -- Nota: No se exige TotalSteps >= 1 porque el historial de steps puede ser
        -- purgado por SQL Agent, dejando solo el resumen (step_id=0) con run_status=1.
        CASE WHEN run_status = 1 
              AND FailedSteps = 0
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM AllJobExecutions
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunDuration,
    LastRunStatus,
    LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM RankedExecutions 
WHERE rn = 1;";
    }

    /// <summary>
    /// Query para IndexOptimize jobs
    /// REPLICA EXACTA del CTE del PowerShell
    /// </summary>
    private string GetIndexOptimizeJobsQuery()
    {
        return @"
-- IndexOptimize jobs con validación de TODOS los pasos (replicando lógica PowerShell TAL CUAL)
WITH JobsWithHistory AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0) AS TotalSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0 AND jh2.run_status = 1) AS SuccessfulSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0 AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
),
JobsWithoutHistory AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        js.last_run_date AS run_date,
        js.last_run_time AS run_time,
        js.last_run_duration AS run_duration,
        js.last_run_outcome AS run_status,
        CASE WHEN js.last_run_date > 0 THEN
            DATEADD(SECOND, 
                (js.last_run_duration / 10000) * 3600 + ((js.last_run_duration / 100) % 100) * 60 + (js.last_run_duration % 100),
                CAST(CAST(js.last_run_date AS VARCHAR) + ' ' + 
                     STUFF(STUFF(RIGHT('000000' + CAST(js.last_run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                     AS DATETIME)
            )
        ELSE NULL END AS FinishTime,
        2 AS TotalSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 2 ELSE 0 END AS SuccessfulSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 0 ELSE 2 END AS FailedSteps,
        0 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
      AND js.last_run_date > 0
      AND NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobhistory jh WHERE jh.job_id = j.job_id AND jh.step_id = 0)
),
AllJobExecutions AS (
    SELECT * FROM JobsWithHistory
    UNION ALL
    SELECT * FROM JobsWithoutHistory
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS LastRunDate,
        run_time AS LastRunTime,
        run_duration AS LastRunDuration,
        run_status AS LastRunStatus,
        FinishTime AS LastFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        -- Nota: No se exige TotalSteps >= 1 porque el historial de steps puede ser
        -- purgado por SQL Agent, dejando solo el resumen (step_id=0) con run_status=1.
        CASE WHEN run_status = 1 
              AND FailedSteps = 0
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM AllJobExecutions
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunDuration,
    LastRunStatus,
    LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM RankedExecutions 
WHERE rn = 1;";
    }

    /// <summary>
    /// Query CHECKDB para RDS - Sin acceso a sysjobservers (permission denied en RDS)
    /// Solo usa sysjobs + sysjobhistory que sí son accesibles
    /// </summary>
    private string GetCheckdbJobsQueryRDS()
    {
        return @"
-- IntegrityCheck jobs para RDS (sin sysjobservers)
WITH JobsWithHistory AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0) AS TotalSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status = 1) AS SuccessfulSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS LastRunDate,
        run_time AS LastRunTime,
        run_duration AS LastRunDuration,
        run_status AS LastRunStatus,
        FinishTime AS LastFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        CASE WHEN run_status = 1 
              AND FailedSteps = 0
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM JobsWithHistory
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunDuration,
    LastRunStatus,
    LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM RankedExecutions 
WHERE rn = 1;";
    }

    /// <summary>
    /// Query IndexOptimize para RDS - Sin acceso a sysjobservers (permission denied en RDS)
    /// Solo usa sysjobs + sysjobhistory que sí son accesibles
    /// </summary>
    private string GetIndexOptimizeJobsQueryRDS()
    {
        return @"
-- IndexOptimize jobs para RDS (sin sysjobservers)
WITH JobsWithHistory AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0) AS TotalSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0 AND jh2.run_status = 1) AS SuccessfulSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id AND jh2.run_date = jh.run_date AND jh2.step_id > 0 AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
      AND j.enabled = 1
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS LastRunDate,
        run_time AS LastRunTime,
        run_duration AS LastRunDuration,
        run_status AS LastRunStatus,
        FinishTime AS LastFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        CASE WHEN run_status = 1 
              AND FailedSteps = 0
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM JobsWithHistory
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunDuration,
    LastRunStatus,
    LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM RankedExecutions 
WHERE rn = 1;";
    }

    /// <summary>
    /// Fallback para RDS cuando ni sysjobservers ni sysjobhistory son accesibles.
    /// Usa msdb.dbo.sp_help_job que funciona con permisos estándar en RDS.
    /// No tiene validación a nivel de steps, solo resultado general del job.
    /// </summary>
    /// <summary>
    /// Fallback robusto para RDS: ejecuta sp_help_job directamente y procesa los resultados en C#.
    /// No usa temp tables ni INSERT...EXEC (que falla si el esquema de sp_help_job varía por versión).
    /// Accede a las columnas por nombre, lo que es independiente del orden/cantidad de columnas.
    /// </summary>
    private async Task<DataTable> ExecuteSpHelpJobFallbackAsync(
        SqlInstanceInfo instance,
        string jobPattern,
        int timeoutSeconds,
        CancellationToken ct)
    {
        // Ejecutar sp_help_job directamente - SqlDataAdapter captura el primer result set
        var rawData = await ExecuteQueryAsync(
            instance.InstanceName,
            "EXEC msdb.dbo.sp_help_job @job_type = N'LOCAL'",
            timeoutSeconds, ct,
            instance.HostingSite, instance.Ambiente);

        _logger.LogDebug("sp_help_job en {Instance} devolvió {Count} jobs totales, buscando patrón '{Pattern}'",
            instance.InstanceName, rawData.Rows.Count, jobPattern);

        // Crear DataTable normalizado con las columnas que esperan ProcessCheckdbJobs/ProcessIndexOptimizeJobs
        var result = new DataTable();
        result.Columns.Add("JobName", typeof(string));
        result.Columns.Add("LastRunDate", typeof(int));
        result.Columns.Add("LastRunTime", typeof(int));
        result.Columns.Add("LastRunDuration", typeof(int));
        result.Columns.Add("LastRunStatus", typeof(int));
        result.Columns.Add("LastFinishTime", typeof(DateTime));
        result.Columns.Add("TotalSteps", typeof(int));
        result.Columns.Add("SuccessfulSteps", typeof(int));
        result.Columns.Add("FailedSteps", typeof(int));
        result.Columns.Add("IsRealSuccess", typeof(int));
        result.Columns.Add("HasHistory", typeof(int));

        foreach (DataRow row in rawData.Rows)
        {
            // Acceder por nombre de columna (robusto ante cambios de esquema)
            var name = row["name"]?.ToString() ?? "";
            var enabled = Convert.ToInt32(row["enabled"]);
            var lastRunDate = Convert.ToInt32(row["last_run_date"]);
            var lastRunTime = Convert.ToInt32(row["last_run_time"]);
            var lastRunOutcome = Convert.ToInt32(row["last_run_outcome"]);

            // Filtrar: debe coincidir con el patrón, estar habilitado, no ser STOP, y haber ejecutado
            if (!name.Contains(jobPattern, StringComparison.OrdinalIgnoreCase))
                continue;
            if (name.Contains("STOP", StringComparison.OrdinalIgnoreCase))
                continue;
            if (enabled != 1)
                continue;
            if (lastRunDate <= 0)
                continue;

            // Calcular FinishTime en C# (más robusto que en T-SQL)
            DateTime? finishTime = null;
            if (lastRunDate > 19000101)
            {
                try
                {
                    var dateStr = lastRunDate.ToString();
                    var timeStr = lastRunTime.ToString().PadLeft(6, '0');
                    finishTime = DateTime.ParseExact(
                        $"{dateStr} {timeStr[..2]}:{timeStr[2..4]}:{timeStr[4..6]}",
                        "yyyyMMdd HH:mm:ss",
                        System.Globalization.CultureInfo.InvariantCulture);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Error parseando fecha para job '{JobName}': date={Date}, time={Time}, error={Error}",
                        name, lastRunDate, lastRunTime, ex.Message);
                }
            }

            var isSuccess = lastRunOutcome == 1 ? 1 : 0;

            _logger.LogDebug("sp_help_job fallback - Job '{JobName}': last_run_date={Date}, last_run_time={Time}, outcome={Outcome}, finishTime={FinishTime}",
                name, lastRunDate, lastRunTime, lastRunOutcome, finishTime?.ToString("yyyy-MM-dd HH:mm:ss") ?? "null");

            var newRow = result.NewRow();
            newRow["JobName"] = name;
            newRow["LastRunDate"] = lastRunDate;
            newRow["LastRunTime"] = lastRunTime;
            newRow["LastRunDuration"] = 0;
            newRow["LastRunStatus"] = lastRunOutcome;
            newRow["LastFinishTime"] = finishTime.HasValue ? (object)finishTime.Value : DBNull.Value;
            newRow["TotalSteps"] = 0;
            newRow["SuccessfulSteps"] = isSuccess;
            newRow["FailedSteps"] = isSuccess == 1 ? 0 : 1;
            newRow["IsRealSuccess"] = isSuccess;
            newRow["HasHistory"] = 0;
            result.Rows.Add(newRow);
        }

        _logger.LogInformation("sp_help_job fallback en {Instance}: encontrados {Count} jobs que coinciden con '{Pattern}'",
            instance.InstanceName, result.Rows.Count, jobPattern);

        return result;
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // No se usa, las queries están en métodos separados
        return "";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(MaintenanceMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["LastCheckdb"] = data.LastCheckdb,
            ["CheckdbOk"] = data.CheckdbOk,
            ["LastIndexOptimize"] = data.LastIndexOptimize,
            ["IndexOptimizeOk"] = data.IndexOptimizeOk,
            ["AGName"] = data.AGName
        };
    }

    /// <summary>
    /// Métricas de mantenimiento - estructura para almacenar los datos recolectados
    /// </summary>
    public class MaintenanceMetrics
    {
        public DateTime? LastCheckdb { get; set; }
        public DateTime? LastIndexOptimize { get; set; }
        public bool CheckdbOk { get; set; }
        public bool IndexOptimizeOk { get; set; }
        public string? AGName { get; set; }
        public List<JobInfo> CheckdbJobs { get; set; } = new();
        public List<JobInfo> IndexOptimizeJobs { get; set; } = new();
        
        // Excepciones - si están en true, no se aplica penalización
        public bool CheckdbExcepted { get; set; }
        public bool IndexOptimizeExcepted { get; set; }
    }

    /// <summary>
    /// Información de un job de mantenimiento - incluye todos los campos del PowerShell
    /// </summary>
    public class JobInfo
    {
        public string JobName { get; set; } = "";
        public DateTime? FinishTime { get; set; }
        public bool IsSuccess { get; set; }
        public int LastRunStatus { get; set; }
        public int Duration { get; set; }
        public int TotalSteps { get; set; }
        public int SuccessfulSteps { get; set; }
        public int FailedSteps { get; set; }
        public bool HasHistory { get; set; }
    }
}
