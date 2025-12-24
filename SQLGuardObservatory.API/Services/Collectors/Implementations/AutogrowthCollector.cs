using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de eventos de autogrowth
/// Métricas: Eventos en 24h, Archivos cerca del límite
/// Peso: 5%
/// </summary>
public class AutogrowthCollector : CollectorBase<AutogrowthCollector.AutogrowthMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Autogrowth";
    public override string DisplayName => "Autogrowth";

    public AutogrowthCollector(
        ILogger<AutogrowthCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<AutogrowthMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new AutogrowthMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Autogrowth events
            if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
            {
                result.AutogrowthEventsLast24h = GetInt(dataSet.Tables[0].Rows[0], "GrowthEvents");
            }

            // ResultSet 2: Files near limit
            if (dataSet.Tables.Count >= 2)
            {
                ProcessFilesNearLimit(dataSet.Tables[1], result);
            }

            // ResultSet 3: Bad growth config (% growth)
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                result.FilesWithBadGrowth = GetInt(dataSet.Tables[2].Rows[0], "BadGrowthCount");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting autogrowth metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessFilesNearLimit(DataTable table, AutogrowthMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var pctOfMax = GetDecimal(row, "PctOfMax");
            result.FilesNearLimit++;

            if (pctOfMax > result.WorstPercentOfMax)
            {
                result.WorstPercentOfMax = pctOfMax;
            }
        }
    }

    protected override int CalculateScore(AutogrowthMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = EvaluateThresholds(data.AutogrowthEventsLast24h, thresholds, "Events");

        // Penalización por archivos cerca del límite
        if (data.FilesNearLimit > 0)
        {
            score -= 30;
        }

        // Cap por archivos al límite (>90%)
        if (data.WorstPercentOfMax > 90)
        {
            score = 0;
        }

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, AutogrowthMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthAutogrowth
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            AutogrowthEventsLast24h = data.AutogrowthEventsLast24h,
            FilesNearLimit = data.FilesNearLimit,
            FilesWithBadGrowth = data.FilesWithBadGrowth,
            WorstPercentOfMax = data.WorstPercentOfMax
        };

        _context.InstanceHealthAutogrowth.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- Autogrowth events in last 24h from default trace
DECLARE @GrowthEvents INT = 0;
BEGIN TRY
    DECLARE @TracePath NVARCHAR(260);
    SELECT @TracePath = CAST(value AS NVARCHAR(260))
    FROM sys.fn_trace_getinfo(NULL)
    WHERE traceid = 1 AND property = 2;

    IF @TracePath IS NOT NULL
    BEGIN
        SELECT @GrowthEvents = COUNT(*)
        FROM sys.fn_trace_gettable(@TracePath, DEFAULT)
        WHERE EventClass IN (92, 93) -- Data File Auto Grow, Log File Auto Grow
          AND StartTime > DATEADD(HOUR, -24, GETDATE());
    END
END TRY
BEGIN CATCH
    SET @GrowthEvents = 0;
END CATCH
SELECT @GrowthEvents AS GrowthEvents;

-- Files near limit (>80% of max_size)
SELECT 
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.name AS FileName,
    mf.type_desc AS FileType,
    CAST(mf.size * 8.0 / 1024 AS DECIMAL(18,2)) AS CurrentSizeMB,
    CAST(mf.max_size * 8.0 / 1024 AS DECIMAL(18,2)) AS MaxSizeMB,
    CAST(mf.size * 100.0 / mf.max_size AS DECIMAL(5,2)) AS PctOfMax
FROM sys.master_files mf
WHERE mf.max_size > 0 
  AND mf.max_size != -1
  AND mf.size * 100.0 / mf.max_size > 80
  AND mf.growth > 0;

-- Files with bad growth config (percent growth or very small growth)
SELECT COUNT(*) AS BadGrowthCount
FROM sys.master_files mf
WHERE mf.growth > 0
  AND (
      mf.is_percent_growth = 1  -- Percent growth is bad
      OR (mf.is_percent_growth = 0 AND mf.growth < 64) -- Less than 512KB is too small
  )
  AND mf.database_id > 4
  AND mf.type IN (0, 1);";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(AutogrowthMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Events24h"] = data.AutogrowthEventsLast24h,
            ["FilesNearLimit"] = data.FilesNearLimit,
            ["WorstPctOfMax"] = data.WorstPercentOfMax,
            ["BadGrowthFiles"] = data.FilesWithBadGrowth
        };
    }

    public class AutogrowthMetrics
    {
        public int AutogrowthEventsLast24h { get; set; }
        public int FilesNearLimit { get; set; }
        public int FilesWithBadGrowth { get; set; }
        public decimal WorstPercentOfMax { get; set; }
    }
}

