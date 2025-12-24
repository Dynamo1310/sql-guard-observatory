using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de integridad de la cadena de logs
/// Métricas: Log chain broken, DBs sin log backup
/// Peso: 5%
/// </summary>
public class LogChainCollector : CollectorBase<LogChainCollector.LogChainMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "LogChain";
    public override string DisplayName => "Log Chain";

    public LogChainCollector(
        ILogger<LogChainCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<LogChainMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new LogChainMetrics();

        try
        {
            var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, timeoutSeconds, ct);
            ProcessLogChainResults(dataTable, result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting log chain metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessLogChainResults(DataTable table, LogChainMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var recoveryModel = GetString(row, "RecoveryModel") ?? "";
            var lastLogBackup = GetDateTime(row, "LastLogBackup");
            var isCritical = GetBool(row, "IsCritical");

            // Solo considerar DBs en FULL recovery
            if (!recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase))
                continue;

            result.FullDBsWithoutLogBackup++;

            // Calcular horas desde último log backup
            double hoursSince = lastLogBackup.HasValue 
                ? (DateTime.Now - lastLogBackup.Value).TotalHours 
                : 999;

            result.MaxHoursSinceLogBackup = Math.Max(result.MaxHoursSinceLogBackup, hoursSince);

            // Si no tiene log backup o es muy antiguo (>2h), es cadena rota
            if (!lastLogBackup.HasValue || hoursSince > 2)
            {
                result.BrokenChainCount++;
                
                if (isCritical)
                    result.CriticalBrokenCount++;
            }
            else
            {
                // Tiene log backup reciente, no contar como "sin log backup"
                result.FullDBsWithoutLogBackup--;
            }
        }
    }

    protected override int CalculateScore(LogChainMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // DB crítica con log chain roto >24h => 0 pts y cap 0
        if (data.MaxHoursSinceLogBackup > 24 && data.BrokenChainCount > 0)
        {
            score = 0;
            cap = 0;
        }
        // 1 DB crítica con log chain roto
        else if (data.CriticalBrokenCount == 1)
        {
            score = 50;
        }
        // >2 DBs con log chain roto
        else if (data.BrokenChainCount > 2)
        {
            score = 20;
        }
        // 1-2 DBs con log chain roto
        else if (data.BrokenChainCount > 0)
        {
            score = 80;
        }

        return Math.Min(score, cap);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, LogChainMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthLogChain
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            BrokenChainCount = data.BrokenChainCount,
            FullDBsWithoutLogBackup = data.FullDBsWithoutLogBackup,
            MaxHoursSinceLogBackup = (int)Math.Min(data.MaxHoursSinceLogBackup, int.MaxValue)
        };

        _context.InstanceHealthLogChain.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        var cutoffDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");

        return $@"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    (SELECT MAX(bs.backup_finish_date) 
     FROM msdb.dbo.backupset bs WITH (NOLOCK)
     WHERE bs.database_name = d.name 
       AND bs.type = 'L'
       AND bs.backup_finish_date >= '{cutoffDate}') AS LastLogBackup,
    CASE 
        WHEN d.name IN ('master', 'msdb', 'model') THEN 1
        WHEN d.name LIKE '%prod%' THEN 1
        WHEN d.name LIKE '%prd%' THEN 1
        ELSE 0
    END AS IsCritical
FROM sys.databases d
WHERE d.recovery_model_desc = 'FULL'
  AND d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
  AND d.database_id > 4
  AND d.is_read_only = 0;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(LogChainMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["BrokenChainCount"] = data.BrokenChainCount,
            ["MaxHoursSinceLogBackup"] = data.MaxHoursSinceLogBackup
        };
    }

    public class LogChainMetrics
    {
        public int BrokenChainCount { get; set; }
        public int CriticalBrokenCount { get; set; }
        public int FullDBsWithoutLogBackup { get; set; }
        public double MaxHoursSinceLogBackup { get; set; }
    }
}

