using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de integridad de la cadena de logs
/// Replica exactamente la lógica de RelevamientoHealthScore_LogChain.ps1
/// 
/// Características:
/// - Query optimizada con JOINs en lugar de subconsultas
/// - Detecta bases en FULL sin log backups
/// - Detecta log chain roto (>24h sin backup)
/// - Retry con timeout extendido
/// 
/// Peso en scoring: 5%
/// </summary>
public class LogChainCollector : CollectorBase<LogChainCollector.LogChainMetrics>
{
    public override string CollectorName => "LogChain";
    public override string DisplayName => "Log Chain";

    public LogChainCollector(
        ILogger<LogChainCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
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
            var logChainAtRisk = GetInt(row, "LogChainAtRisk") == 1;
            var hoursSinceLog = GetInt(row, "HoursSinceLastLog");
            var lastLogBackup = GetDateTime(row, "LastLogBackup");

            // Solo DBs en FULL recovery nos interesan
            if (!recoveryModel.Equals("FULL", StringComparison.OrdinalIgnoreCase))
                continue;

            // Contar DBs en FULL sin log backup
            if (!lastLogBackup.HasValue)
            {
                result.FullDBsWithoutLogBackup++;
            }

            // Contar cadenas rotas
            if (logChainAtRisk)
            {
                result.BrokenChainCount++;
            }

            // Máximo de horas desde último log backup
            if (hoursSinceLog > 0)
            {
                result.MaxHoursSinceLogBackup = Math.Max(result.MaxHoursSinceLogBackup, hoursSinceLog);
            }
            else if (!lastLogBackup.HasValue)
            {
                // Si no hay log backup, considerar máximo
                result.MaxHoursSinceLogBackup = Math.Max(result.MaxHoursSinceLogBackup, 999);
            }
        }
    }

    protected override int CalculateScore(LogChainMetrics data, List<CollectorThreshold> thresholds)
    {
        // Scoring (0-100):
        // - 100 pts: Todas las DBs críticas con log chain intacto
        // - 80 pts: 1 DB no crítica con log chain roto
        // - 50 pts: 1 DB crítica con log chain roto
        // - 20 pts: >2 DBs con log chain roto
        // - 0 pts: DBs críticas con log chain roto >24h
        
        if (data.MaxHoursSinceLogBackup > 24 && data.BrokenChainCount > 0)
            return 0;

        if (data.BrokenChainCount > 2)
            return 20;

        if (data.BrokenChainCount == 1)
            return 50;

        if (data.FullDBsWithoutLogBackup == 1)
            return 80;

        return 100;
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

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthLogChain.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        var cutoffDate = DateTime.Now.AddDays(-7).ToString("yyyy-MM-dd");

        // Query mejorada: detecta cadenas rotas correctamente
        // - log_reuse_wait_desc = 'LOG_BACKUP' indica que el log no puede reutilizarse porque necesita backup
        // - Esto ocurre en bases FULL cuando NO hay backups de log o la cadena está rota
        // - También detecta bases sin ningún backup de log (cadena nunca iniciada)
        return $@"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    d.log_reuse_wait_desc AS LogReuseWait,
    bs_full.backup_finish_date AS LastFullBackup,
    bs_log.backup_finish_date AS LastLogBackup,
    ISNULL(DATEDIFF(HOUR, bs_log.backup_finish_date, GETDATE()), 9999) AS HoursSinceLastLog,
    -- LogChainAtRisk: detecta cadena de backups rota
    CASE 
        -- 1. Base en FULL SIN ningún log backup (cadena nunca iniciada)
        WHEN d.recovery_model_desc = 'FULL' AND bs_log.backup_finish_date IS NULL THEN 1
        -- 2. Base en FULL con log backup muy antiguo (>24h = cadena posiblemente rota)
        WHEN d.recovery_model_desc = 'FULL' AND DATEDIFF(HOUR, bs_log.backup_finish_date, GETDATE()) > 24 THEN 1
        -- 3. log_reuse_wait = 'LOG_BACKUP' indica que el log está creciendo porque necesita backup
        --    Esto es un indicador de que la cadena no está siendo mantenida correctamente
        WHEN d.recovery_model_desc = 'FULL' AND d.log_reuse_wait_desc = 'LOG_BACKUP' 
             AND DATEDIFF(HOUR, bs_log.backup_finish_date, GETDATE()) > 1 THEN 1
        -- 4. Si hay full backup pero no log backups, la cadena está incompleta
        WHEN d.recovery_model_desc = 'FULL' AND bs_full.backup_finish_date IS NOT NULL 
             AND bs_log.backup_finish_date IS NULL THEN 1
        ELSE 0
    END AS LogChainAtRisk,
    d.state_desc AS DatabaseState,
    -- Información adicional para diagnóstico
    d.log_reuse_wait_desc AS LogReuseReason
FROM sys.databases d
LEFT JOIN (
    SELECT database_name, MAX(backup_finish_date) AS backup_finish_date
    FROM msdb.dbo.backupset WITH (NOLOCK)
    WHERE type = 'D' AND backup_finish_date >= '{cutoffDate}'
    GROUP BY database_name
) bs_full ON d.name = bs_full.database_name
LEFT JOIN (
    SELECT database_name, MAX(backup_finish_date) AS backup_finish_date
    FROM msdb.dbo.backupset WITH (NOLOCK)
    WHERE type = 'L' AND backup_finish_date >= '{cutoffDate}'
    GROUP BY database_name
) bs_log ON d.name = bs_log.database_name
WHERE d.database_id > 4  -- Excluir system databases
  AND d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
  AND d.is_read_only = 0
ORDER BY LogChainAtRisk DESC, HoursSinceLastLog DESC;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(LogChainMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["BrokenChainCount"] = data.BrokenChainCount,
            ["FullDBsWithoutLogBackup"] = data.FullDBsWithoutLogBackup,
            ["MaxHoursSinceLogBackup"] = data.MaxHoursSinceLogBackup
        };
    }

    public class LogChainMetrics
    {
        public int BrokenChainCount { get; set; }
        public int FullDBsWithoutLogBackup { get; set; }
        public int MaxHoursSinceLogBackup { get; set; }
    }
}
