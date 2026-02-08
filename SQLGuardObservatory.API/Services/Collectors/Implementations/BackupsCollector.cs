using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Backups
/// 
/// Características:
/// - Sincronización AlwaysOn: Identifica grupos AG y sincroniza el mejor backup entre nodos
/// - Retry con 3 intentos: Normal → Timeout extendido → SQL 2005 fallback
/// - DWH handling: 7 días tolerancia para FULL backup en instancias DWH
/// - Excepción SSCC03: Instancia con backup a nivel VM
/// - SQL 2005 fallback: Query compatible con subqueries en lugar de GROUP BY
/// - Supresión de LOG: No alerta por LOG cuando hay FULL running o en grace period
/// - Detección de FULL running: Usa sys.dm_exec_requests para detectar backups en ejecución
/// 
/// Umbrales configurables (desde CollectorThresholds):
/// - FullThresholdHours: 30 horas (antes 24h)
/// - LogThresholdHours: 2 horas
/// - GraceMinutesAfterFull: 15 minutos
/// 
/// Peso: 18%
/// </summary>
public class BackupsCollector : CollectorBase<BackupsCollector.BackupsMetrics>
{
    public override string CollectorName => "Backups";
    public override string DisplayName => "Backups";

    // Umbrales por defecto (se sobrescriben con valores de CollectorThresholds)
    private const int DEFAULT_FULL_THRESHOLD_HOURS = 30;
    private const int DEFAULT_LOG_THRESHOLD_HOURS = 2;
    private const int DEFAULT_GRACE_MINUTES_AFTER_FULL = 15;
    private const int DWH_FULL_THRESHOLD_HOURS = 168; // 7 días

    // Instancias con backup a nivel VM (excluidas de verificación)
    private static readonly HashSet<string> VmBackupInstances = new(StringComparer.OrdinalIgnoreCase)
    {
        "SSCC03"
    };

    // Cache de grupos AlwaysOn para sincronización post-proceso
    private Dictionary<string, AlwaysOnGroup> _alwaysOnGroups = new();
    private Dictionary<string, string> _nodeToGroup = new();

    // Thresholds cargados de la configuración
    private int _fullThresholdHours = DEFAULT_FULL_THRESHOLD_HOURS;
    private int _logThresholdHours = DEFAULT_LOG_THRESHOLD_HOURS;
    private int _graceMinutesAfterFull = DEFAULT_GRACE_MINUTES_AFTER_FULL;

    public BackupsCollector(
        ILogger<BackupsCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    /// <summary>
    /// Pre-procesamiento: Cargar thresholds e identificar grupos AlwaysOn
    /// </summary>
    protected override async Task PreProcessAsync(List<SqlInstanceInfo> instances, CancellationToken ct)
    {
        // Cargar thresholds configurables
        await LoadThresholdsAsync(ct);

        _alwaysOnGroups.Clear();
        _nodeToGroup.Clear();

        _logger.LogInformation("Identificando grupos de AlwaysOn...");

        // Solo procesar instancias con AlwaysOn habilitado
        var alwaysOnInstances = instances.Where(i => i.IsAlwaysOnEnabled).ToList();

        foreach (var instance in alwaysOnInstances)
        {
            try
            {
                var query = @"
                    SELECT DISTINCT
                        ag.name AS AGName,
                        ar.replica_server_name AS ReplicaServer
                    FROM sys.availability_groups ag
                    INNER JOIN sys.availability_replicas ar ON ag.group_id = ar.group_id
                    ORDER BY ag.name, ar.replica_server_name";

                var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, 10, ct);

                foreach (DataRow row in dataTable.Rows)
                {
                    var agName = GetString(row, "AGName") ?? "";
                    var replicaServer = GetString(row, "ReplicaServer") ?? "";

                    if (string.IsNullOrEmpty(agName) || string.IsNullOrEmpty(replicaServer))
                        continue;

                    if (!_alwaysOnGroups.ContainsKey(agName))
                    {
                        _alwaysOnGroups[agName] = new AlwaysOnGroup { Name = agName };
                    }

                    if (!_alwaysOnGroups[agName].Nodes.Contains(replicaServer, StringComparer.OrdinalIgnoreCase))
                    {
                        _alwaysOnGroups[agName].Nodes.Add(replicaServer);
                    }

                    _nodeToGroup[replicaServer] = agName;
                }
            }
            catch (Exception ex)
            {
                _logger.LogDebug(ex, "No se pudo consultar AG en {Instance}", instance.InstanceName);
            }
        }

        if (_alwaysOnGroups.Count > 0)
        {
            _logger.LogInformation("{Count} grupo(s) AlwaysOn identificado(s)", _alwaysOnGroups.Count);
            foreach (var ag in _alwaysOnGroups)
            {
                _logger.LogDebug("  AG {Name}: {Nodes}", ag.Key, string.Join(", ", ag.Value.Nodes));
            }
        }
    }

    /// <summary>
    /// Carga los thresholds configurables desde la base de datos
    /// </summary>
    private async Task LoadThresholdsAsync(CancellationToken ct)
    {
        try
        {
            var thresholds = await _configService.GetActiveThresholdsAsync(CollectorName, ct);

            var fullThreshold = thresholds.FirstOrDefault(t => t.ThresholdName == "FullThresholdHours");
            if (fullThreshold != null)
            {
                _fullThresholdHours = (int)fullThreshold.ThresholdValue;
            }

            var logThreshold = thresholds.FirstOrDefault(t => t.ThresholdName == "LogThresholdHours");
            if (logThreshold != null)
            {
                _logThresholdHours = (int)logThreshold.ThresholdValue;
            }

            var graceThreshold = thresholds.FirstOrDefault(t => t.ThresholdName == "GraceMinutesAfterFull");
            if (graceThreshold != null)
            {
                _graceMinutesAfterFull = (int)graceThreshold.ThresholdValue;
            }

            _logger.LogInformation(
                "Thresholds cargados: FULL={FullHours}h, LOG={LogHours}h, GracePeriod={GraceMinutes}min",
                _fullThresholdHours, _logThresholdHours, _graceMinutesAfterFull);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error cargando thresholds, usando valores por defecto");
        }
    }

    protected override async Task<BackupsMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new BackupsMetrics();
        var isDWH = instance.InstanceName.Contains("DWH", StringComparison.OrdinalIgnoreCase);
        var isSql2005 = instance.SqlMajorVersion <= 9;

        result.IsDWH = isDWH;
        result.IsSql2005 = isSql2005;
        
        // Asignar AGName si la instancia pertenece a un Availability Group
        var hostName = instance.InstanceName.Split('\\')[0];
        if (_nodeToGroup.TryGetValue(hostName, out var agName))
        {
            result.AGName = agName;
        }
        else if (_nodeToGroup.TryGetValue(instance.InstanceName, out var agNameFull))
        {
            result.AGName = agNameFull;
        }

        // Excepción SSCC03: Backup a nivel VM - marcar como OK sin verificar
        if (VmBackupInstances.Contains(instance.InstanceName))
        {
            _logger.LogInformation("{Instance} - VM Backup - Excluido de verificación (backup a nivel VM)", instance.InstanceName);
            result.LastFullBackup = DateTime.Now;
            result.LastLogBackup = DateTime.Now;
            result.FullBackupBreached = false;
            result.LogBackupBreached = false;
            result.IsVmBackup = true;
            result.HasViewServerState = true;
            result.Details.Add("VM_BACKUP:OK");
            return result;
        }

        // Cutoff de días según tipo de instancia
        var cutoffDays = isDWH ? -14 : -7;
        var cutoffDate = DateTime.Now.AddDays(cutoffDays).ToString("yyyy-MM-dd");

        // Retry con 3 intentos
        DataTable? dataTable = null;
        int attemptCount = 0;
        bool usedFallback = isSql2005;
        Exception? lastError = null;

        while (attemptCount < 3 && dataTable == null)
        {
            attemptCount++;
            
            try
            {
                // Determinar query según intento y versión
                var useSQL2005Query = isSql2005 || attemptCount == 3;
                var currentTimeout = attemptCount == 1 ? timeoutSeconds : timeoutSeconds * 2;
                var currentQuery = useSQL2005Query ? GetSQL2005Query(cutoffDate) : GetModernQueryWithRunningBackups(cutoffDate);

                if (attemptCount == 3 && !isSql2005)
                {
                    usedFallback = true;
                    _logger.LogInformation("{Instance} - Usando query SQL 2005 fallback", instance.InstanceName);
                }

                dataTable = await ExecuteQueryAsync(instance.InstanceName, currentQuery, currentTimeout, ct);
                result.HasViewServerState = true;
                break;
            }
            catch (Exception ex)
            {
                lastError = ex;
                
                // Verificar si es error de permisos VIEW SERVER STATE
                if (ex.Message.Contains("VIEW SERVER STATE") || ex.Message.Contains("permission"))
                {
                    _logger.LogWarning(
                        "Cannot detect running backups on {Instance} - VIEW SERVER STATE permission not granted. Using fallback query.",
                        instance.InstanceName);
                    result.HasViewServerState = false;
                    
                    // Intentar con query sin detección de running backups
                    try
                    {
                        var fallbackQuery = isSql2005 ? GetSQL2005Query(cutoffDate) : GetModernQuery(cutoffDate);
                        dataTable = await ExecuteQueryAsync(instance.InstanceName, fallbackQuery, timeoutSeconds * 2, ct);
                        break;
                    }
                    catch
                    {
                        // Continuar con el retry normal
                    }
                }
                
                if (attemptCount < 3)
                {
                    _logger.LogDebug("Error en {Instance} (intento {Attempt}), reintentando...", 
                        instance.InstanceName, attemptCount);
                    await Task.Delay(500, ct);
                }
            }
        }

        // Si después de 3 intentos no hay datos, reportar error
        if (dataTable == null || dataTable.Rows.Count == 0)
        {
            if (lastError != null)
            {
                _logger.LogWarning(lastError, "Error obteniendo backups en {Instance} después de 3 intentos", 
                    instance.InstanceName);
            }
            result.FullBackupBreached = true;
            result.LogBackupBreached = true;
            return result;
        }

        // Log si se usó fallback exitosamente
        if (usedFallback && !isSql2005)
        {
            _logger.LogInformation("{Instance} - Query SQL 2005 fallback exitosa", instance.InstanceName);
        }

        // Procesar resultados con la nueva lógica de supresión
        ProcessBackupResults(dataTable, result, isDWH, instance.InstanceName);

        return result;
    }

    /// <summary>
    /// Procesa los resultados del backup con lógica de supresión de LOG
    /// </summary>
    private void ProcessBackupResults(DataTable table, BackupsMetrics result, bool isDWH, string instanceName)
    {
        // Umbrales: DWH usa 7 días, el resto usa el threshold configurable (30h por defecto)
        var fullThresholdHours = isDWH ? DWH_FULL_THRESHOLD_HOURS : _fullThresholdHours;
        var fullThreshold = DateTime.Now.AddHours(-fullThresholdHours);
        var logThreshold = DateTime.Now.AddHours(-_logThresholdHours);
        var graceThreshold = DateTime.Now.AddMinutes(-_graceMinutesAfterFull);

        var breachedFullDbs = new List<DataRow>();
        var breachedLogDbs = new List<DataRow>();
        var fullRecoveryDbs = new List<DataRow>();

        // Detectar si hay algún FULL running en cualquier DB de la instancia
        bool anyFullRunning = false;
        DateTime? earliestFullRunningSince = null;

        // Primera pasada: detectar FULL running y recolectar datos
        foreach (DataRow row in table.Rows)
        {
            var isFullRunning = GetInt(row, "IsFullRunning") == 1;
            var fullRunningSince = GetDateTime(row, "FullRunningSince");

            if (isFullRunning)
            {
                anyFullRunning = true;
                if (!earliestFullRunningSince.HasValue || (fullRunningSince.HasValue && fullRunningSince.Value < earliestFullRunningSince.Value))
                {
                    earliestFullRunningSince = fullRunningSince;
                }
            }
        }

        result.IsFullRunning = anyFullRunning;
        result.FullRunningSince = earliestFullRunningSince;

        // Determinar si el LOG check debe suprimirse
        // Caso 1: Hay un FULL corriendo
        if (anyFullRunning)
        {
            result.LogCheckSuppressed = true;
            result.LogCheckSuppressReason = "FULL_RUNNING";
            _logger.LogInformation(
                "LOG check suppressed for {Instance} - FULL backup running since {Since}",
                instanceName, earliestFullRunningSince?.ToString("yyyy-MM-dd HH:mm:ss") ?? "unknown");
        }
        else
        {
            // Caso 2: FULL terminó hace poco (grace period)
            // Buscar el FULL más reciente para verificar si estamos en grace period
            DateTime? mostRecentFullBackup = null;
            foreach (DataRow row in table.Rows)
            {
                var lastFullBackup = GetDateTime(row, "LastFullBackup");
                if (lastFullBackup.HasValue)
                {
                    if (!mostRecentFullBackup.HasValue || lastFullBackup.Value > mostRecentFullBackup.Value)
                    {
                        mostRecentFullBackup = lastFullBackup.Value;
                    }
                }
            }

            // Si el FULL más reciente terminó dentro del grace period, suprimir LOG check
            if (mostRecentFullBackup.HasValue && mostRecentFullBackup.Value > graceThreshold)
            {
                var minutesSinceFullCompleted = (int)(DateTime.Now - mostRecentFullBackup.Value).TotalMinutes;
                var minutesRemaining = _graceMinutesAfterFull - minutesSinceFullCompleted;
                
                if (minutesRemaining > 0)
                {
                    result.LogCheckSuppressed = true;
                    result.LogCheckSuppressReason = "GRACE_PERIOD";
                    _logger.LogInformation(
                        "LOG check suppressed for {Instance} - Grace period after FULL ({MinutesRemaining}m remaining)",
                        instanceName, minutesRemaining);
                }
            }
        }

        // Segunda pasada: evaluar breaches
        foreach (DataRow row in table.Rows)
        {
            var recoveryModel = GetString(row, "RecoveryModel") ?? "";
            var lastFullBackup = GetDateTime(row, "LastFullBackup");
            var lastLogBackup = GetDateTime(row, "LastLogBackup");

            // Verificar FULL backup breach
            if (!lastFullBackup.HasValue || lastFullBackup.Value < fullThreshold)
            {
                breachedFullDbs.Add(row);
            }

            // Track Full/Bulk-Logged Recovery DBs para log backup
            if (recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase) ||
                recoveryModel.Equals("BULK_LOGGED", StringComparison.OrdinalIgnoreCase))
            {
                fullRecoveryDbs.Add(row);
                
                // Solo evaluar LOG breach si NO está suprimido
                if (!result.LogCheckSuppressed)
                {
                    if (!lastLogBackup.HasValue || lastLogBackup.Value < logThreshold)
                    {
                        breachedLogDbs.Add(row);
                    }
                }
            }
        }

        result.FullBackupBreached = breachedFullDbs.Count > 0;
        
        // Si LOG está suprimido, NO marcamos breach aunque técnicamente haya
        result.LogBackupBreached = result.LogCheckSuppressed ? false : breachedLogDbs.Count > 0;
        
        result.BreachedFullCount = breachedFullDbs.Count;
        result.BreachedLogCount = result.LogCheckSuppressed ? 0 : breachedLogDbs.Count;
        result.FullRecoveryDbCount = fullRecoveryDbs.Count;

        // Si hay DBs con breach, mostrar el PEOR backup (más antiguo)
        // Si no hay breach, mostrar el MÁS RECIENTE
        if (result.FullBackupBreached)
        {
            var worstBackup = breachedFullDbs
                .Select(r => GetDateTime(r, "LastFullBackup"))
                .Where(d => d.HasValue)
                .OrderBy(d => d)
                .FirstOrDefault();
            result.LastFullBackup = worstBackup;
        }
        else
        {
            result.LastFullBackup = table.AsEnumerable()
                .Select(r => GetDateTime(r, "LastFullBackup"))
                .Where(d => d.HasValue)
                .OrderByDescending(d => d)
                .FirstOrDefault();
        }

        if (result.LogBackupBreached)
        {
            var worstLog = breachedLogDbs
                .Select(r => GetDateTime(r, "LastLogBackup"))
                .Where(d => d.HasValue)
                .OrderBy(d => d)
                .FirstOrDefault();
            result.LastLogBackup = worstLog;
        }
        else if (fullRecoveryDbs.Count > 0)
        {
            result.LastLogBackup = fullRecoveryDbs
                .Select(r => GetDateTime(r, "LastLogBackup"))
                .Where(d => d.HasValue)
                .OrderByDescending(d => d)
                .FirstOrDefault();
        }

        // Calcular edades en horas
        if (result.LastFullBackup.HasValue)
        {
            result.FullBackupAgeHours = (int)(DateTime.Now - result.LastFullBackup.Value).TotalHours;
        }
        if (result.LastLogBackup.HasValue)
        {
            result.LogBackupAgeHours = (int)(DateTime.Now - result.LastLogBackup.Value).TotalHours;
        }

        // Detalles por DB - incluir FULL y LOG breaches
        foreach (DataRow row in table.Rows)
        {
            var dbName = GetString(row, "DatabaseName") ?? "";
            var recoveryModel = GetString(row, "RecoveryModel") ?? "";
            var lastFullBackup = GetDateTime(row, "LastFullBackup");
            var lastLogBackup = GetDateTime(row, "LastLogBackup");
            
            var fullAge = lastFullBackup.HasValue 
                ? (int)(DateTime.Now - lastFullBackup.Value).TotalHours 
                : 999;
            
            // Verificar si esta DB tiene FULL breach
            var hasFullBreach = !lastFullBackup.HasValue || lastFullBackup.Value < fullThreshold;
            
            // Verificar si esta DB tiene LOG breach (solo si no está suprimido y recovery model aplica)
            var hasLogBreach = !result.LogCheckSuppressed &&
                              (recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase) ||
                               recoveryModel.Equals("BULK_LOGGED", StringComparison.OrdinalIgnoreCase)) &&
                              (!lastLogBackup.HasValue || lastLogBackup.Value < logThreshold);
            
            if (hasFullBreach)
            {
                result.Details.Add($"{dbName}:FULL={fullAge}h");
            }
            
            if (hasLogBreach)
            {
                var logAge = lastLogBackup.HasValue 
                    ? (int)(DateTime.Now - lastLogBackup.Value).TotalHours 
                    : 999;
                result.Details.Add($"{dbName}:LOG={logAge}h");
            }
        }

        // Agregar información de supresión a los detalles
        if (result.LogCheckSuppressed)
        {
            result.Details.Add($"LOG_SUPPRESSED:{result.LogCheckSuppressReason}");
        }
    }

    protected override int CalculateScore(BackupsMetrics data, List<CollectorThreshold> thresholds)
    {
        // Score combinado:
        // - FULL OK y LOG OK: 100
        // - FULL Breach solo: 50 (pierde mitad del peso)
        // - LOG Breach solo: 50 (pierde mitad del peso)
        // - Ambos Breach: 0
        // 
        // Nota: Si LOG está suprimido, se considera OK para el score
        
        var fullScore = data.FullBackupBreached ? 0 : 50;
        var logScore = data.LogBackupBreached ? 0 : 50;
        
        return fullScore + logScore;
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, BackupsMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthBackups
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            LastFullBackup = data.LastFullBackup,
            LastLogBackup = data.LastLogBackup,
            FullBackupBreached = data.FullBackupBreached,
            LogBackupBreached = data.LogBackupBreached,
            BackupDetails = data.Details.Count > 0 ? string.Join("|", data.Details) : null,
            // Nuevos campos de supresión
            IsFullRunning = data.IsFullRunning,
            FullRunningSince = data.FullRunningSince,
            LogCheckSuppressed = data.LogCheckSuppressed,
            LogCheckSuppressReason = data.LogCheckSuppressReason,
            HasViewServerState = data.HasViewServerState,
            // Availability Group
            AGName = data.AGName
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthBackups.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    /// <summary>
    /// Post-procesamiento: Sincronizar backups entre nodos AlwaysOn
    /// </summary>
    protected override async Task PostProcessAsync(List<CollectorInstanceResult> results, CancellationToken ct)
    {
        if (_alwaysOnGroups.Count == 0)
        {
            return;
        }

        _logger.LogInformation("Sincronizando backups entre nodos AlwaysOn...");

        foreach (var agGroup in _alwaysOnGroups.Values)
        {
            var nodeNames = agGroup.Nodes;
            
            // Obtener resultados de todos los nodos del grupo
            var groupResults = results
                .Where(r => nodeNames.Any(n => n.Equals(r.InstanceName, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            if (groupResults.Count == 0)
            {
                _logger.LogDebug("Sin resultados para AG {Name}", agGroup.Name);
                continue;
            }

            // Encontrar el MEJOR LastFullBackup (más reciente)
            DateTime? bestFullDate = null;
            DateTime? bestLogDate = null;
            bool anyFullRunning = false;
            DateTime? earliestFullRunningSince = null;

            foreach (var result in groupResults)
            {
                if (result.MetricsObject is BackupsMetrics metrics)
                {
                    if (metrics.LastFullBackup.HasValue)
                    {
                        if (!bestFullDate.HasValue || metrics.LastFullBackup.Value > bestFullDate.Value)
                        {
                            bestFullDate = metrics.LastFullBackup.Value;
                        }
                    }
                    if (metrics.LastLogBackup.HasValue)
                    {
                        if (!bestLogDate.HasValue || metrics.LastLogBackup.Value > bestLogDate.Value)
                        {
                            bestLogDate = metrics.LastLogBackup.Value;
                        }
                    }
                    if (metrics.IsFullRunning)
                    {
                        anyFullRunning = true;
                        if (!earliestFullRunningSince.HasValue || 
                            (metrics.FullRunningSince.HasValue && metrics.FullRunningSince.Value < earliestFullRunningSince.Value))
                        {
                            earliestFullRunningSince = metrics.FullRunningSince;
                        }
                    }
                }
            }

            _logger.LogDebug("AG {Name}: Mejor FULL: {Full}, Mejor LOG: {Log}, FullRunning: {Running}", 
                agGroup.Name, bestFullDate, bestLogDate, anyFullRunning);

            // Aplicar los MEJORES valores a TODOS los nodos del grupo
            foreach (var result in groupResults)
            {
                if (result.MetricsObject is BackupsMetrics metrics)
                {
                    metrics.LastFullBackup = bestFullDate;
                    metrics.LastLogBackup = bestLogDate;
                    metrics.WasSyncedFromAlwaysOn = true;

                    // Sincronizar estado de FULL running
                    if (anyFullRunning && !metrics.IsFullRunning)
                    {
                        metrics.IsFullRunning = true;
                        metrics.FullRunningSince = earliestFullRunningSince;
                        metrics.LogCheckSuppressed = true;
                        metrics.LogCheckSuppressReason = "FULL_RUNNING";
                    }

                    // Recalcular breaches con los valores sincronizados
                    var isDWH = result.InstanceName.Contains("DWH", StringComparison.OrdinalIgnoreCase);
                    var fullThresholdHours = isDWH ? DWH_FULL_THRESHOLD_HOURS : _fullThresholdHours;

                    if (bestFullDate.HasValue)
                    {
                        var fullAge = DateTime.Now - bestFullDate.Value;
                        metrics.FullBackupBreached = fullAge.TotalHours > fullThresholdHours;
                        metrics.FullBackupAgeHours = (int)fullAge.TotalHours;
                    }
                    else
                    {
                        metrics.FullBackupBreached = true;
                    }

                    // LOG breach solo si no está suprimido
                    if (!metrics.LogCheckSuppressed)
                    {
                        if (bestLogDate.HasValue)
                        {
                            var logAge = DateTime.Now - bestLogDate.Value;
                            metrics.LogBackupBreached = logAge.TotalHours > _logThresholdHours;
                            metrics.LogBackupAgeHours = (int)logAge.TotalHours;
                        }
                        else
                        {
                            // Si no hay LOG backup, no se considera breach
                            metrics.LogBackupBreached = false;
                        }
                    }
                    else
                    {
                        metrics.LogBackupBreached = false;
                    }

                    // Recalcular score
                    var fullScore = metrics.FullBackupBreached ? 0 : 50;
                    var logScore = metrics.LogBackupBreached ? 0 : 50;
                    result.Score = fullScore + logScore;

                    _logger.LogDebug("Nodo {Instance} sincronizado: FULL={FullBreached}, LOG={LogBreached}, Suppressed={Suppressed}, Score={Score}", 
                        result.InstanceName, metrics.FullBackupBreached, metrics.LogBackupBreached, metrics.LogCheckSuppressed, result.Score);

                    // IMPORTANTE: Actualizar el registro ya guardado en la BD con los valores sincronizados
                    await UpdateSyncedBackupAsync(result.InstanceName, metrics, ct);
                }
            }
        }
    }

    /// <summary>
    /// Actualiza el registro de backup más reciente con los valores sincronizados de AlwaysOn
    /// </summary>
    private async Task UpdateSyncedBackupAsync(string instanceName, BackupsMetrics metrics, CancellationToken ct)
    {
        try
        {
            await SaveWithScopedContextAsync(async context =>
            {
                // Obtener el registro más reciente para esta instancia
                var latestRecord = await context.InstanceHealthBackups
                    .Where(b => b.InstanceName == instanceName)
                    .OrderByDescending(b => b.CollectedAtUtc)
                    .FirstOrDefaultAsync(ct);

                if (latestRecord != null)
                {
                    // Actualizar con los valores sincronizados
                    latestRecord.LastFullBackup = metrics.LastFullBackup;
                    latestRecord.LastLogBackup = metrics.LastLogBackup;
                    latestRecord.FullBackupBreached = metrics.FullBackupBreached;
                    latestRecord.LogBackupBreached = metrics.LogBackupBreached;
                    latestRecord.IsFullRunning = metrics.IsFullRunning;
                    latestRecord.FullRunningSince = metrics.FullRunningSince;
                    latestRecord.LogCheckSuppressed = metrics.LogCheckSuppressed;
                    latestRecord.LogCheckSuppressReason = metrics.LogCheckSuppressReason;
                    latestRecord.AGName = metrics.AGName;
                    latestRecord.BackupDetails = metrics.Details.Count > 0 
                        ? string.Join("|", metrics.Details) + "|SYNCED_FROM_AG" 
                        : "SYNCED_FROM_AG";

                    await context.SaveChangesAsync(ct);
                    _logger.LogDebug("Registro de backup actualizado para {Instance} con valores sincronizados de AG", instanceName);
                }
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error actualizando backup sincronizado para {Instance}", instanceName);
        }
    }

    /// <summary>
    /// Query moderna con detección de backups FULL en ejecución (SQL 2012+)
    /// </summary>
    private string GetModernQueryWithRunningBackups(string cutoffDate)
    {
        return $@"
;WITH last_full AS (
    SELECT bs.database_name, MAX(bs.backup_finish_date) AS last_full_finish
    FROM msdb.dbo.backupset bs WITH (NOLOCK)
    WHERE bs.type = 'D' AND bs.backup_finish_date IS NOT NULL
      AND bs.backup_finish_date >= '{cutoffDate}'
    GROUP BY bs.database_name
),
last_log AS (
    SELECT bs.database_name, MAX(bs.backup_finish_date) AS last_log_finish
    FROM msdb.dbo.backupset bs WITH (NOLOCK)
    WHERE bs.type = 'L' AND bs.backup_finish_date IS NOT NULL
      AND bs.backup_finish_date >= '{cutoffDate}'
    GROUP BY bs.database_name
),
running_full AS (
    SELECT DISTINCT 
        DB_NAME(r.database_id) AS database_name, 
        MIN(r.start_time) OVER (PARTITION BY r.database_id) AS full_running_since
    FROM sys.dm_exec_requests r
    WHERE r.command = 'BACKUP DATABASE' AND r.database_id <> 0
)
SELECT
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    lf.last_full_finish AS LastFullBackup,
    ll.last_log_finish AS LastLogBackup,
    CASE WHEN rf.database_name IS NOT NULL THEN 1 ELSE 0 END AS IsFullRunning,
    rf.full_running_since AS FullRunningSince
FROM sys.databases d
LEFT JOIN last_full lf ON lf.database_name = d.name
LEFT JOIN last_log ll ON ll.database_name = d.name
LEFT JOIN running_full rf ON rf.database_name = d.name
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb', 'SqlMant')
  AND d.database_id > 4
  AND d.is_read_only = 0;";
    }

    /// <summary>
    /// Query moderna sin detección de running backups (fallback si no hay VIEW SERVER STATE)
    /// </summary>
    private string GetModernQuery(string cutoffDate)
    {
        return $@"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END) AS LastFullBackup,
    MAX(CASE WHEN bs.type = 'L' THEN bs.backup_finish_date END) AS LastLogBackup,
    CAST(0 AS INT) AS IsFullRunning,
    CAST(NULL AS DATETIME) AS FullRunningSince
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset bs WITH (NOLOCK)
    ON d.name = bs.database_name
    AND bs.backup_finish_date >= '{cutoffDate}'
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb', 'SqlMant')
  AND d.database_id > 4
  AND d.is_read_only = 0
GROUP BY d.name, d.recovery_model_desc;";
    }

    /// <summary>
    /// Query SQL 2005 fallback (sin CTEs ni dm_exec_requests)
    /// </summary>
    private string GetSQL2005Query(string cutoffDate)
    {
        return $@"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    (SELECT MAX(bs.backup_finish_date) 
     FROM msdb.dbo.backupset bs WITH (NOLOCK)
     WHERE bs.database_name = d.name 
       AND bs.type = 'D'
       AND bs.backup_finish_date >= '{cutoffDate}') AS LastFullBackup,
    (SELECT MAX(bs.backup_finish_date) 
     FROM msdb.dbo.backupset bs WITH (NOLOCK)
     WHERE bs.database_name = d.name 
       AND bs.type = 'L'
       AND bs.backup_finish_date >= '{cutoffDate}') AS LastLogBackup,
    CAST(0 AS INT) AS IsFullRunning,
    CAST(NULL AS DATETIME) AS FullRunningSince
FROM sys.databases d
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb', 'SqlMant')
  AND d.database_id > 4
  AND d.is_read_only = 0;";
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        var cutoffDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");
        return sqlMajorVersion <= 9 ? GetSQL2005Query(cutoffDate) : GetModernQueryWithRunningBackups(cutoffDate);
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(BackupsMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["FullBackupBreached"] = data.FullBackupBreached,
            ["LogBackupBreached"] = data.LogBackupBreached,
            ["LastFullBackup"] = data.LastFullBackup,
            ["LastLogBackup"] = data.LastLogBackup,
            ["IsDWH"] = data.IsDWH,
            ["WasSyncedFromAlwaysOn"] = data.WasSyncedFromAlwaysOn,
            ["IsFullRunning"] = data.IsFullRunning,
            ["LogCheckSuppressed"] = data.LogCheckSuppressed,
            ["LogCheckSuppressReason"] = data.LogCheckSuppressReason,
            ["HasViewServerState"] = data.HasViewServerState
        };
    }

    public class BackupsMetrics
    {
        public DateTime? LastFullBackup { get; set; }
        public DateTime? LastLogBackup { get; set; }
        public bool FullBackupBreached { get; set; }
        public bool LogBackupBreached { get; set; }
        public bool IsDWH { get; set; }
        public bool IsSql2005 { get; set; }
        public bool IsVmBackup { get; set; }
        public bool WasSyncedFromAlwaysOn { get; set; }
        public int BreachedFullCount { get; set; }
        public int BreachedLogCount { get; set; }
        public int FullRecoveryDbCount { get; set; }
        public int FullBackupAgeHours { get; set; }
        public int LogBackupAgeHours { get; set; }
        public List<string> Details { get; set; } = new();
        
        // Campos para supresión de LOG durante FULL backup
        public bool IsFullRunning { get; set; }
        public DateTime? FullRunningSince { get; set; }
        public bool LogCheckSuppressed { get; set; }
        public string? LogCheckSuppressReason { get; set; }
        public bool HasViewServerState { get; set; } = true;
        
        /// <summary>
        /// Nombre del Availability Group (null si no pertenece a un AG)
        /// </summary>
        public string? AGName { get; set; }
    }

    private class AlwaysOnGroup
    {
        public string Name { get; set; } = "";
        public List<string> Nodes { get; set; } = new();
    }
}
