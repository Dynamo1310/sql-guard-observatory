using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de mantenimiento
/// Métricas: CHECKDB, IndexOptimize
/// Peso: 5%
/// </summary>
public class MaintenanceCollector : CollectorBase<MaintenanceCollector.MaintenanceMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Maintenance";
    public override string DisplayName => "Mantenimientos";

    public MaintenanceCollector(
        ILogger<MaintenanceCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<MaintenanceMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new MaintenanceMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: CHECKDB info
            if (dataSet.Tables.Count >= 1)
            {
                ProcessCheckDBResults(dataSet.Tables[0], result);
            }

            // ResultSet 2: Index maintenance (Ola Hallengren CommandLog)
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.LastIndexOptimize = GetDateTime(dataSet.Tables[1].Rows[0], "LastIndexMaintenance");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting maintenance metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessCheckDBResults(DataTable table, MaintenanceMetrics result)
    {
        DateTime? oldestCheckdb = null;
        int dbCount = 0;
        int staleCount = 0; // DBs sin CHECKDB reciente

        foreach (DataRow row in table.Rows)
        {
            var lastCheckdb = GetDateTime(row, "LastCheckdb");
            dbCount++;

            if (!lastCheckdb.HasValue)
            {
                staleCount++;
                continue;
            }

            if (!oldestCheckdb.HasValue || lastCheckdb.Value < oldestCheckdb.Value)
            {
                oldestCheckdb = lastCheckdb.Value;
            }

            var daysSince = (DateTime.Now - lastCheckdb.Value).TotalDays;
            if (daysSince > 7)
            {
                staleCount++;
            }
        }

        result.LastCheckdb = oldestCheckdb;
        result.DatabaseCount = dbCount;
        result.StaleDatabaseCount = staleCount;

        if (oldestCheckdb.HasValue)
        {
            result.DaysSinceOldestCheckdb = (int)(DateTime.Now - oldestCheckdb.Value).TotalDays;
        }
        else
        {
            result.DaysSinceOldestCheckdb = 999;
        }

        result.CheckdbOk = result.DaysSinceOldestCheckdb <= 7;
    }

    protected override int CalculateScore(MaintenanceMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = EvaluateThresholds(data.DaysSinceOldestCheckdb, thresholds, "Checkdb");

        // Penalización adicional si hay muchas DBs sin CHECKDB
        if (data.DatabaseCount > 0)
        {
            var stalePct = (data.StaleDatabaseCount * 100.0m) / data.DatabaseCount;
            if (stalePct > 50)
            {
                score = Math.Min(score, 50);
            }
            else if (stalePct > 25)
            {
                score = Math.Min(score, 70);
            }
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
            CheckdbOk = data.CheckdbOk
        };

        _context.InstanceHealthMaintenance.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- CHECKDB status from DBCC DBINFO
-- Uses DBCC PAGE trick to get last known good CHECKDB date
CREATE TABLE #DBCCResult (
    ParentObject VARCHAR(255),
    Object VARCHAR(255),
    Field VARCHAR(255),
    Value VARCHAR(255)
);

DECLARE @dbname NVARCHAR(256);
DECLARE db_cursor CURSOR FOR 
    SELECT name FROM sys.databases 
    WHERE state_desc = 'ONLINE' 
      AND database_id > 4
      AND name NOT IN ('tempdb');

OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @dbname;

WHILE @@FETCH_STATUS = 0
BEGIN
    BEGIN TRY
        INSERT INTO #DBCCResult
        EXEC('DBCC DBINFO([' + @dbname + ']) WITH TABLERESULTS, NO_INFOMSGS');
    END TRY
    BEGIN CATCH
    END CATCH
    FETCH NEXT FROM db_cursor INTO @dbname;
END

CLOSE db_cursor;
DEALLOCATE db_cursor;

SELECT 
    ParentObject AS DatabaseName,
    CASE 
        WHEN Value = '1900-01-01 00:00:00.000' THEN NULL
        ELSE TRY_CAST(Value AS DATETIME)
    END AS LastCheckdb
FROM #DBCCResult
WHERE Field = 'dbi_dbccLastKnownGood';

DROP TABLE #DBCCResult;

-- Index maintenance (Ola Hallengren CommandLog if exists)
DECLARE @IndexMaintenance DATETIME;
BEGIN TRY
    IF EXISTS (SELECT 1 FROM sys.objects WHERE name = 'CommandLog' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
        SELECT @IndexMaintenance = MAX(EndTime)
        FROM dbo.CommandLog WITH (NOLOCK)
        WHERE CommandType IN ('ALTER_INDEX', 'DBCC_INDEXDEFRAG')
          AND EndTime IS NOT NULL
          AND EndTime > DATEADD(DAY, -30, GETDATE());
    END
END TRY
BEGIN CATCH
END CATCH
SELECT @IndexMaintenance AS LastIndexMaintenance;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(MaintenanceMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["LastCheckdb"] = data.LastCheckdb,
            ["DaysSince"] = data.DaysSinceOldestCheckdb,
            ["CheckdbOk"] = data.CheckdbOk,
            ["StaleDatabases"] = data.StaleDatabaseCount
        };
    }

    public class MaintenanceMetrics
    {
        public DateTime? LastCheckdb { get; set; }
        public DateTime? LastIndexOptimize { get; set; }
        public bool CheckdbOk { get; set; }
        public int DaysSinceOldestCheckdb { get; set; } = 999;
        public int DatabaseCount { get; set; }
        public int StaleDatabaseCount { get; set; }
    }
}

