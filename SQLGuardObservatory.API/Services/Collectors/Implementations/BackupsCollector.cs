using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Backups
/// Métricas: Último Full/Log backup, Breaches
/// Peso: 18%
/// </summary>
public class BackupsCollector : CollectorBase<BackupsCollector.BackupsMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Backups";
    public override string DisplayName => "Backups";

    public BackupsCollector(
        ILogger<BackupsCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<BackupsMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new BackupsMetrics();
        var isDWH = instance.InstanceName.Contains("DWH", StringComparison.OrdinalIgnoreCase);

        try
        {
            var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, timeoutSeconds, ct);

            if (dataTable.Rows.Count == 0)
            {
                result.FullBackupBreached = true;
                result.LogBackupBreached = true;
                return result;
            }

            ProcessBackupResults(dataTable, result, isDWH);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting backup metrics from {Instance}", instance.InstanceName);
            result.FullBackupBreached = true;
            result.LogBackupBreached = true;
        }

        return result;
    }

    private void ProcessBackupResults(DataTable table, BackupsMetrics result, bool isDWH)
    {
        // Umbrales: DWH = 7 días para FULL, Otras = 24 horas
        var fullThreshold = DateTime.Now.AddDays(isDWH ? -7 : -1);
        var logThreshold = DateTime.Now.AddHours(-2);

        var fullRecoveryDbs = new List<DataRow>();
        var breachedFullDbs = new List<DataRow>();
        var breachedLogDbs = new List<DataRow>();

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

        // Determinar fecha a mostrar (peor si hay breach, mejor si no)
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

        result.IsDWH = isDWH;
    }

    protected override int CalculateScore(BackupsMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // Log backup breach es más crítico (afecta RPO)
        if (data.LogBackupBreached)
        {
            score = 0;
            cap = 60; // Cap global por cadena de log rota
        }
        else if (data.FullBackupBreached)
        {
            score = 0;
        }

        return Math.Min(score, cap);
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
            LogBackupBreached = data.LogBackupBreached
        };

        _context.InstanceHealthBackups.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // Cutoff de 7 días para limitar escaneo de msdb
        var cutoffDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");

        if (sqlMajorVersion <= 9) // SQL 2005
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

        // SQL 2008+
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

    protected override Dictionary<string, object?> GetMetricsFromResult(BackupsMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["FullBackupBreached"] = data.FullBackupBreached,
            ["LogBackupBreached"] = data.LogBackupBreached,
            ["LastFullBackup"] = data.LastFullBackup,
            ["LastLogBackup"] = data.LastLogBackup
        };
    }

    // Post-procesamiento para sincronizar backups entre nodos AlwaysOn
    protected override async Task PostProcessAsync(List<CollectorInstanceResult> results, CancellationToken ct)
    {
        // Agrupar instancias por AG (si implementamos detección de AG)
        // Por ahora, este método está preparado para futura implementación
        await Task.CompletedTask;
    }

    public class BackupsMetrics
    {
        public DateTime? LastFullBackup { get; set; }
        public DateTime? LastLogBackup { get; set; }
        public bool FullBackupBreached { get; set; }
        public bool LogBackupBreached { get; set; }
        public bool IsDWH { get; set; }
    }
}

