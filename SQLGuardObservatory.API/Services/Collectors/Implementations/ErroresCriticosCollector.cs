using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de errores críticos y blocking
/// Métricas: Severity 20+ errors, Blocking sessions
/// Peso: 7%
/// </summary>
public class ErroresCriticosCollector : CollectorBase<ErroresCriticosCollector.ErroresCriticosMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "ErroresCriticos";
    public override string DisplayName => "Errores Críticos";

    public ErroresCriticosCollector(
        ILogger<ErroresCriticosCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<ErroresCriticosMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new ErroresCriticosMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Errors count 24h
            if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
            {
                result.Severity20PlusCount = GetInt(dataSet.Tables[0].Rows[0], "ErrorCount");
            }

            // ResultSet 2: Errors count 1h
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.Severity20PlusLast1h = GetInt(dataSet.Tables[1].Rows[0], "ErrorCount1h");
            }

            // ResultSet 3: Blocking info
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                var row = dataSet.Tables[2].Rows[0];
                result.BlockedSessionCount = GetInt(row, "BlockedCount");
                result.MaxBlockTimeSeconds = GetInt(row, "MaxBlockTimeSeconds");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting critical errors from {Instance}", instance.InstanceName);
        }

        return result;
    }

    protected override int CalculateScore(ErroresCriticosMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // Penalización por errores severity 20+
        if (data.Severity20PlusCount > 0)
        {
            score = 100 - (data.Severity20PlusCount * 10);
            if (score < 60) score = 60; // Máximo -40
        }

        // Cap por error reciente (última hora)
        if (data.Severity20PlusLast1h > 0)
        {
            cap = 70;
        }

        // Penalización por blocking
        if (data.BlockedSessionCount > 0)
        {
            if (data.BlockedSessionCount > 10 || data.MaxBlockTimeSeconds > 30)
            {
                // Blocking severo
                score = Math.Min(score, 40);
                cap = Math.Min(cap, 60);
            }
            else if (data.BlockedSessionCount > 5 || data.MaxBlockTimeSeconds > 10)
            {
                // Blocking moderado
                score = Math.Min(score, 60);
                cap = Math.Min(cap, 80);
            }
            else
            {
                // Blocking leve
                score = Math.Min(score, 80);
            }
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, ErroresCriticosMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthErroresCriticos
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            Severity20PlusCount = data.Severity20PlusCount,
            Severity20PlusLast1h = data.Severity20PlusLast1h
        };

        _context.InstanceHealthErroresCriticos.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- Errors severity 20+ in last 24h
DECLARE @ErrorCount INT = 0;
BEGIN TRY
    SELECT @ErrorCount = COUNT(*)
    FROM sys.fn_xe_file_target_read_file(
        'system_health*.xel', NULL, NULL, NULL) AS xed
    CROSS APPLY (SELECT CAST(event_data AS XML) AS event_xml) AS x
    WHERE x.event_xml.value('(event/@name)[1]', 'varchar(100)') = 'error_reported'
      AND x.event_xml.value('(event/data[@name=""severity""]/value)[1]', 'int') >= 20
      AND x.event_xml.value('(event/@timestamp)[1]', 'datetime2') > DATEADD(HOUR, -24, GETDATE());
END TRY
BEGIN CATCH
    SET @ErrorCount = 0;
END CATCH
SELECT @ErrorCount AS ErrorCount;

-- Errors in last 1h
DECLARE @ErrorCount1h INT = 0;
BEGIN TRY
    SELECT @ErrorCount1h = COUNT(*)
    FROM sys.fn_xe_file_target_read_file(
        'system_health*.xel', NULL, NULL, NULL) AS xed
    CROSS APPLY (SELECT CAST(event_data AS XML) AS event_xml) AS x
    WHERE x.event_xml.value('(event/@name)[1]', 'varchar(100)') = 'error_reported'
      AND x.event_xml.value('(event/data[@name=""severity""]/value)[1]', 'int') >= 20
      AND x.event_xml.value('(event/@timestamp)[1]', 'datetime2') > DATEADD(HOUR, -1, GETDATE());
END TRY
BEGIN CATCH
    SET @ErrorCount1h = 0;
END CATCH
SELECT @ErrorCount1h AS ErrorCount1h;

-- Current blocking
SELECT 
    COUNT(*) AS BlockedCount,
    ISNULL(MAX(DATEDIFF(SECOND, r.start_time, GETDATE())), 0) AS MaxBlockTimeSeconds
FROM sys.dm_exec_requests r
WHERE r.blocking_session_id > 0;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(ErroresCriticosMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Errors24h"] = data.Severity20PlusCount,
            ["Errors1h"] = data.Severity20PlusLast1h,
            ["BlockedSessions"] = data.BlockedSessionCount,
            ["MaxBlockTime"] = data.MaxBlockTimeSeconds
        };
    }

    public class ErroresCriticosMetrics
    {
        public int Severity20PlusCount { get; set; }
        public int Severity20PlusLast1h { get; set; }
        public int BlockedSessionCount { get; set; }
        public int MaxBlockTimeSeconds { get; set; }
    }
}

