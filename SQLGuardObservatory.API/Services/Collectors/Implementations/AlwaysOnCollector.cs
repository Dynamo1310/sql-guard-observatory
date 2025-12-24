using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de AlwaysOn Availability Groups
/// Métricas: AG state, sync status, queues
/// Peso: 14%
/// </summary>
public class AlwaysOnCollector : CollectorBase<AlwaysOnCollector.AlwaysOnMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "AlwaysOn";
    public override string DisplayName => "AlwaysOn";

    public AlwaysOnCollector(
        ILogger<AlwaysOnCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<AlwaysOnMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new AlwaysOnMetrics();

        // Si la instancia no tiene AlwaysOn habilitado, retornar score perfecto
        if (!instance.IsAlwaysOnEnabled)
        {
            result.AlwaysOnEnabled = false;
            return result;
        }

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: AlwaysOn status general
            if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
            {
                var row = dataSet.Tables[0].Rows[0];
                result.AlwaysOnEnabled = GetInt(row, "AlwaysOnEnabled") == 1;
            }

            if (!result.AlwaysOnEnabled)
                return result;

            // ResultSet 2: Database states
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                ProcessDatabaseStates(dataSet.Tables[1], result);
            }

            // ResultSet 3: Queue sizes
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                ProcessQueueSizes(dataSet.Tables[2], result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting AlwaysOn metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessDatabaseStates(DataTable table, AlwaysOnMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            result.DatabaseCount++;
            
            var state = GetString(row, "SynchronizationState") ?? "";
            var healthDesc = GetString(row, "SynchronizationHealthDesc") ?? "";
            var isSuspended = GetBool(row, "IsSuspended");

            if (state.Equals("SYNCHRONIZED", StringComparison.OrdinalIgnoreCase) ||
                state.Equals("SYNCHRONIZING", StringComparison.OrdinalIgnoreCase))
            {
                result.SynchronizedCount++;
            }

            if (isSuspended)
            {
                result.SuspendedCount++;
            }

            if (healthDesc.Equals("NOT_HEALTHY", StringComparison.OrdinalIgnoreCase))
            {
                result.NotHealthyCount++;
            }
        }
    }

    private void ProcessQueueSizes(DataTable table, AlwaysOnMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var sendQueueKB = GetLong(row, "SendQueueKB");
            var redoQueueKB = GetLong(row, "RedoQueueKB");

            result.MaxSendQueueKB = Math.Max(result.MaxSendQueueKB, sendQueueKB);
            result.MaxRedoQueueKB = Math.Max(result.MaxRedoQueueKB, redoQueueKB);
        }
    }

    protected override int CalculateScore(AlwaysOnMetrics data, List<CollectorThreshold> thresholds)
    {
        // Si no tiene AlwaysOn, score perfecto
        if (!data.AlwaysOnEnabled)
            return 100;

        var score = 100;
        var cap = 100;

        // DB Suspended => score 0, cap 60
        if (data.SuspendedCount > 0)
        {
            score = 0;
            cap = 60;
        }
        // No todas sincronizadas
        else if (data.SynchronizedCount < data.DatabaseCount)
        {
            score = 50;
            cap = 60;
        }
        else
        {
            // Penalizaciones por queues
            if (data.MaxSendQueueKB > 100000) // >100 MB
                score -= 30;

            if (data.MaxRedoQueueKB > 100000) // >100 MB
                score -= 20;
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, AlwaysOnMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthAlwaysOn
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            AlwaysOnEnabled = data.AlwaysOnEnabled,
            DatabaseCount = data.DatabaseCount,
            SynchronizedCount = data.SynchronizedCount,
            SuspendedCount = data.SuspendedCount,
            MaxSendQueueKB = (int)Math.Min(data.MaxSendQueueKB, int.MaxValue),
            MaxRedoQueueKB = (int)Math.Min(data.MaxRedoQueueKB, int.MaxValue),
            AlwaysOnWorstState = data.SuspendedCount > 0 ? "Suspended" : 
                                 data.SynchronizedCount < data.DatabaseCount ? "Synchronizing" : "Synchronized"
        };

        _context.InstanceHealthAlwaysOn.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // AlwaysOn solo disponible en SQL 2012+
        if (sqlMajorVersion < 11)
        {
            return @"
SELECT 0 AS AlwaysOnEnabled;
SELECT NULL AS SynchronizationState, NULL AS SynchronizationHealthDesc, 0 AS IsSuspended WHERE 1=0;
SELECT NULL AS SendQueueKB, NULL AS RedoQueueKB WHERE 1=0;";
        }

        return @"
-- Check if AlwaysOn is enabled
SELECT CAST(SERVERPROPERTY('IsHadrEnabled') AS INT) AS AlwaysOnEnabled;

-- Database synchronization states
SELECT 
    drs.synchronization_state_desc AS SynchronizationState,
    drs.synchronization_health_desc AS SynchronizationHealthDesc,
    drs.is_suspended AS IsSuspended,
    drs.database_id,
    DB_NAME(drs.database_id) AS DatabaseName
FROM sys.dm_hadr_database_replica_states drs
WHERE drs.is_local = 1;

-- Queue sizes
SELECT 
    drs.log_send_queue_size AS SendQueueKB,
    drs.redo_queue_size AS RedoQueueKB,
    DB_NAME(drs.database_id) AS DatabaseName
FROM sys.dm_hadr_database_replica_states drs
WHERE drs.is_local = 1;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(AlwaysOnMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["Enabled"] = data.AlwaysOnEnabled,
            ["Databases"] = data.DatabaseCount,
            ["Synchronized"] = data.SynchronizedCount,
            ["Suspended"] = data.SuspendedCount
        };
    }

    public class AlwaysOnMetrics
    {
        public bool AlwaysOnEnabled { get; set; }
        public int DatabaseCount { get; set; }
        public int SynchronizedCount { get; set; }
        public int SuspendedCount { get; set; }
        public int NotHealthyCount { get; set; }
        public long MaxSendQueueKB { get; set; }
        public long MaxRedoQueueKB { get; set; }
    }
}

