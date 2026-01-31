using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Backups
/// Replica exactamente la lógica de RelevamientoHealthScore_Backups.ps1
/// 
/// Características:
/// - Sincronización AlwaysOn: Identifica grupos AG y sincroniza el mejor backup entre nodos
/// - Retry con 3 intentos: Normal → Timeout extendido → SQL 2005 fallback
/// - DWH handling: 7 días tolerancia para FULL backup en instancias DWH
/// - Excepción SSCC03: Instancia con backup a nivel VM
/// - SQL 2005 fallback: Query compatible con subqueries en lugar de GROUP BY
/// 
/// Peso: 18%
/// </summary>
public class BackupsCollector : CollectorBase<BackupsCollector.BackupsMetrics>
{
    public override string CollectorName => "Backups";
    public override string DisplayName => "Backups";

    // Instancias con backup a nivel VM (excluidas de verificación)
    private static readonly HashSet<string> VmBackupInstances = new(StringComparer.OrdinalIgnoreCase)
    {
        "SSCC03"
    };

    // Cache de grupos AlwaysOn para sincronización post-proceso
    private Dictionary<string, AlwaysOnGroup> _alwaysOnGroups = new();
    private Dictionary<string, string> _nodeToGroup = new();

    public BackupsCollector(
        ILogger<BackupsCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
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

        // Excepción SSCC03: Backup a nivel VM - marcar como OK sin verificar (como en PowerShell)
        if (VmBackupInstances.Contains(instance.InstanceName))
        {
            _logger.LogInformation("{Instance} - VM Backup - Excluido de verificación (backup a nivel VM)", instance.InstanceName);
            result.LastFullBackup = DateTime.Now;
            result.LastLogBackup = DateTime.Now;
            result.FullBackupBreached = false;
            result.LogBackupBreached = false;
            result.IsVmBackup = true;
            result.Details.Add("VM_BACKUP:OK");
            return result;
        }

        // Cutoff de días según tipo de instancia
        var cutoffDays = isDWH ? -14 : -7;
        var cutoffDate = DateTime.Now.AddDays(cutoffDays).ToString("yyyy-MM-dd");

        // Retry con 3 intentos (como en PowerShell)
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
                var currentQuery = useSQL2005Query ? GetSQL2005Query(cutoffDate) : GetModernQuery(cutoffDate);

                if (attemptCount == 3 && !isSql2005)
                {
                    usedFallback = true;
                    _logger.LogInformation("{Instance} - Usando query SQL 2005 fallback", instance.InstanceName);
                }

                dataTable = await ExecuteQueryAsync(instance.InstanceName, currentQuery, currentTimeout, ct);
                break;
            }
            catch (Exception ex)
            {
                lastError = ex;
                
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

        // Procesar resultados (lógica idéntica al PowerShell)
        ProcessBackupResults(dataTable, result, isDWH);

        return result;
    }

    private void ProcessBackupResults(DataTable table, BackupsMetrics result, bool isDWH)
    {
        // Umbrales exactos del PowerShell:
        // DWH: 7 días para FULL backup
        // Otras instancias: 24 horas para FULL backup
        // LOG: 2 horas para todas
        var fullThresholdDays = isDWH ? -7 : -1;
        var fullThreshold = DateTime.Now.AddDays(fullThresholdDays);
        var logThreshold = DateTime.Now.AddHours(-2);

        var breachedFullDbs = new List<DataRow>();
        var breachedLogDbs = new List<DataRow>();
        var fullRecoveryDbs = new List<DataRow>();

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

            // Track Full Recovery DBs para log backup
            if (recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase))
            {
                fullRecoveryDbs.Add(row);
                
                if (!lastLogBackup.HasValue || lastLogBackup.Value < logThreshold)
                {
                    breachedLogDbs.Add(row);
                }
            }
        }

        result.FullBackupBreached = breachedFullDbs.Count > 0;
        result.LogBackupBreached = breachedLogDbs.Count > 0;
        result.BreachedFullCount = breachedFullDbs.Count;
        result.BreachedLogCount = breachedLogDbs.Count;
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
            
            // Verificar si esta DB tiene LOG breach (solo para Recovery Model FULL)
            var hasLogBreach = recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase) &&
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
    }

    protected override int CalculateScore(BackupsMetrics data, List<CollectorThreshold> thresholds)
    {
        // Lógica exacta del PowerShell Consolidate:
        // Backups tiene peso 18% (9% FULL + 9% LOG)
        // 
        // En el consolidador se calcula así:
        // $fullBackupScore = if ($backupsData.FullBackupBreached) { 0 } else { 100 }
        // $logBackupScore = if ($backupsData.LogBackupBreached) { 0 } else { 100 }
        // 
        // Luego: ($fullBackupScore * 0.09) + ($logBackupScore * 0.09)
        // 
        // Para este collector, retornamos un score combinado:
        // - FULL OK y LOG OK: 100
        // - FULL Breach solo: 50 (pierde mitad del peso)
        // - LOG Breach solo: 50 (pierde mitad del peso)
        // - Ambos Breach: 0
        
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
            // Detalles como en PowerShell: unidos por "|"
            BackupDetails = data.Details.Count > 0 ? string.Join("|", data.Details) : null
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthBackups.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    /// <summary>
    /// Pre-procesamiento: Identificar grupos AlwaysOn para sincronización posterior
    /// Replica Get-AlwaysOnGroups del PowerShell
    /// </summary>
    protected override async Task PreProcessAsync(List<SqlInstanceInfo> instances, CancellationToken ct)
    {
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
    /// Post-procesamiento: Sincronizar backups entre nodos AlwaysOn
    /// Replica Sync-AlwaysOnBackups del PowerShell
    /// Toma el MEJOR valor de cada grupo (backup más reciente) y lo aplica a TODOS los nodos
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
                }
            }

            _logger.LogDebug("AG {Name}: Mejor FULL: {Full}, Mejor LOG: {Log}", 
                agGroup.Name, bestFullDate, bestLogDate);

            // Aplicar los MEJORES valores a TODOS los nodos del grupo
            foreach (var result in groupResults)
            {
                if (result.MetricsObject is BackupsMetrics metrics)
                {
                    metrics.LastFullBackup = bestFullDate;
                    metrics.LastLogBackup = bestLogDate;
                    metrics.WasSyncedFromAlwaysOn = true;

                    // Recalcular breaches con los valores sincronizados
                    var isDWH = result.InstanceName.Contains("DWH", StringComparison.OrdinalIgnoreCase);
                    var fullThresholdHours = isDWH ? 168 : 24; // 7 días vs 1 día

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

                    if (bestLogDate.HasValue)
                    {
                        var logAge = DateTime.Now - bestLogDate.Value;
                        metrics.LogBackupBreached = logAge.TotalHours > 2;
                        metrics.LogBackupAgeHours = (int)logAge.TotalHours;
                    }
                    else
                    {
                        // Si no hay LOG backup, no se considera breach (igual que PowerShell)
                        metrics.LogBackupBreached = false;
                    }

                    // Recalcular score con la nueva lógica:
                    // FULL OK + LOG OK = 100, FULL Breach = -50, LOG Breach = -50
                    var fullScore = metrics.FullBackupBreached ? 0 : 50;
                    var logScore = metrics.LogBackupBreached ? 0 : 50;
                    result.Score = fullScore + logScore;

                    _logger.LogDebug("Nodo {Instance} sincronizado: FULL={FullBreached}, LOG={LogBreached}, Score={Score}", 
                        result.InstanceName, metrics.FullBackupBreached, metrics.LogBackupBreached, result.Score);

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

    private string GetModernQuery(string cutoffDate)
    {
        return $@"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END) AS LastFullBackup,
    MAX(CASE WHEN bs.type = 'L' THEN bs.backup_finish_date END) AS LastLogBackup
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
       AND bs.backup_finish_date >= '{cutoffDate}') AS LastLogBackup
FROM sys.databases d
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb', 'SqlMant')
  AND d.database_id > 4
  AND d.is_read_only = 0;";
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // Se usa GetModernQuery o GetSQL2005Query según el intento
        var cutoffDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");
        return sqlMajorVersion <= 9 ? GetSQL2005Query(cutoffDate) : GetModernQuery(cutoffDate);
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
            ["WasSyncedFromAlwaysOn"] = data.WasSyncedFromAlwaysOn
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
    }

    private class AlwaysOnGroup
    {
        public string Name { get; set; } = "";
        public List<string> Nodes { get; set; } = new();
    }
}
