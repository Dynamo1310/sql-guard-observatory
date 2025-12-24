using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de estadísticas de espera
/// Alimenta métricas para otros collectors
/// Peso: 0% (auxiliar)
/// </summary>
public class WaitsCollector : CollectorBase<WaitsCollector.WaitsMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Waits";
    public override string DisplayName => "Wait Statistics";

    public WaitsCollector(
        ILogger<WaitsCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<WaitsMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new WaitsMetrics();

        try
        {
            var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, timeoutSeconds, ct);
            ProcessWaitsResults(dataTable, result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting wait stats from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessWaitsResults(DataTable table, WaitsMetrics result)
    {
        long totalWaitMs = 0;
        long cpuWaits = 0;
        long memoryWaits = 0;
        long ioWaits = 0;
        long lockWaits = 0;
        long cxpacketWaits = 0;

        foreach (DataRow row in table.Rows)
        {
            var waitType = GetString(row, "WaitType") ?? "";
            var waitMs = GetLong(row, "TotalWaitMs");
            var waitPct = GetDecimal(row, "WaitPct");

            totalWaitMs += waitMs;

            // Categorizar waits
            if (waitType.Contains("CXPACKET") || waitType.Contains("CXCONSUMER") || waitType.Contains("SOS_SCHEDULER_YIELD"))
            {
                cpuWaits += waitMs;
                if (waitType.Contains("CXPACKET"))
                {
                    cxpacketWaits += waitMs;
                }
            }
            else if (waitType.Contains("RESOURCE_SEMAPHORE"))
            {
                memoryWaits += waitMs;
            }
            else if (waitType.Contains("PAGEIOLATCH") || waitType.Contains("WRITELOG") || waitType.Contains("ASYNC_IO"))
            {
                ioWaits += waitMs;
            }
            else if (waitType.StartsWith("LCK_M_"))
            {
                lockWaits += waitMs;
            }

            // Track top waits
            result.TopWaits.Add(new WaitInfo
            {
                WaitType = waitType,
                TotalWaitMs = waitMs,
                WaitPct = waitPct
            });
        }

        result.TotalWaitMs = totalWaitMs;
        result.CPUWaitMs = cpuWaits;
        result.MemoryWaitMs = memoryWaits;
        result.IOWaitMs = ioWaits;
        result.LockWaitMs = lockWaits;
        result.CXPacketWaitMs = cxpacketWaits;

        // Calcular porcentajes
        if (totalWaitMs > 0)
        {
            result.CPUWaitPct = (cpuWaits * 100.0m) / totalWaitMs;
            result.MemoryWaitPct = (memoryWaits * 100.0m) / totalWaitMs;
            result.IOWaitPct = (ioWaits * 100.0m) / totalWaitMs;
            result.LockWaitPct = (lockWaits * 100.0m) / totalWaitMs;
            result.CXPacketWaitPct = (cxpacketWaits * 100.0m) / totalWaitMs;
        }

        // Limitar a top 10 waits
        result.TopWaits = result.TopWaits
            .OrderByDescending(w => w.TotalWaitMs)
            .Take(10)
            .ToList();
    }

    protected override int CalculateScore(WaitsMetrics data, List<CollectorThreshold> thresholds)
    {
        // Este collector no tiene score directo
        // Su información alimenta a otros collectors
        return 100;
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, WaitsMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthWaits
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            TotalWaitMs = data.TotalWaitMs,
            TotalWaits = data.TopWaits.Sum(w => (long)(w.TotalWaitMs / 1000)), // Estimate
            CXPacketWaitMs = data.CXPacketWaitMs,
            LockWaitMs = data.LockWaitMs,
            ResourceSemaphoreWaitMs = data.MemoryWaitMs,
            PageIOLatchWaitMs = data.IOWaitMs,
            SOSSchedulerYieldMs = data.CPUWaitMs
        };

        // Top 5 waits
        if (data.TopWaits.Count > 0)
        {
            entity.TopWait1Type = data.TopWaits[0].WaitType;
            entity.TopWait1Ms = (long)data.TopWaits[0].TotalWaitMs;
        }
        if (data.TopWaits.Count > 1)
        {
            entity.TopWait2Type = data.TopWaits[1].WaitType;
            entity.TopWait2Ms = (long)data.TopWaits[1].TotalWaitMs;
        }
        if (data.TopWaits.Count > 2)
        {
            entity.TopWait3Type = data.TopWaits[2].WaitType;
            entity.TopWait3Ms = (long)data.TopWaits[2].TotalWaitMs;
        }
        if (data.TopWaits.Count > 3)
        {
            entity.TopWait4Type = data.TopWaits[3].WaitType;
            entity.TopWait4Ms = (long)data.TopWaits[3].TotalWaitMs;
        }
        if (data.TopWaits.Count > 4)
        {
            entity.TopWait5Type = data.TopWaits[4].WaitType;
            entity.TopWait5Ms = (long)data.TopWaits[4].TotalWaitMs;
        }

        _context.InstanceHealthWaits.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- Wait statistics (excluyendo idle waits)
WITH Waits AS (
    SELECT 
        wait_type AS WaitType,
        wait_time_ms AS TotalWaitMs,
        wait_time_ms - signal_wait_time_ms AS ResourceWaitMs,
        signal_wait_time_ms AS SignalWaitMs,
        waiting_tasks_count AS WaitingTasksCount
    FROM sys.dm_os_wait_stats
    WHERE wait_type NOT IN (
        'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SQLTRACE_BUFFER_FLUSH',
        'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'WAITFOR', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION',
        'CHECKPOINT_QUEUE', 'XE_TIMER_EVENT', 'XE_DISPATCHER_WAIT', 'BROKER_TASK_STOP',
        'CLR_AUTO_EVENT', 'BROKER_EVENTHANDLER', 'DIRTY_PAGE_POLL', 'SP_SERVER_DIAGNOSTICS_SLEEP',
        'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT', 'LOGMGR_QUEUE',
        'ONDEMAND_TASK_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_DISPATCHER_JOIN',
        'BROKER_RECEIVE_WAITFOR', 'PREEMPTIVE_XE_GETTARGETSTATE', 'HADR_CLUSAPI_CALL',
        'HADR_LOGCAPTURE_WAIT', 'HADR_NOTIFICATION_DEQUEUE', 'HADR_TIMER_TASK',
        'HADR_WORK_QUEUE', 'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_ASYNC_QUEUE',
        'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP', 'WAIT_XTP_CKPT_CLOSE',
        'WAIT_XTP_HOST_WAIT', 'WAITFOR_TASKSHUTDOWN', 'PARALLEL_REDO_DRAIN_WORKER',
        'PARALLEL_REDO_LOG_CACHE', 'PARALLEL_REDO_TRAN_LIST', 'PARALLEL_REDO_WORKER_SYNC',
        'REDO_THREAD_PENDING_WORK', 'REDO_THREAD_SYNC'
    )
    AND wait_time_ms > 0
)
SELECT TOP 20
    WaitType,
    TotalWaitMs,
    ResourceWaitMs,
    SignalWaitMs,
    WaitingTasksCount,
    CAST(TotalWaitMs * 100.0 / SUM(TotalWaitMs) OVER() AS DECIMAL(5,2)) AS WaitPct
FROM Waits
ORDER BY TotalWaitMs DESC;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(WaitsMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["TotalWaitMs"] = data.TotalWaitMs,
            ["CPUWaitPct"] = data.CPUWaitPct,
            ["IOWaitPct"] = data.IOWaitPct,
            ["LockWaitPct"] = data.LockWaitPct
        };
    }

    public class WaitsMetrics
    {
        public long TotalWaitMs { get; set; }
        public long CPUWaitMs { get; set; }
        public long MemoryWaitMs { get; set; }
        public long IOWaitMs { get; set; }
        public long LockWaitMs { get; set; }
        public long CXPacketWaitMs { get; set; }
        public decimal CPUWaitPct { get; set; }
        public decimal MemoryWaitPct { get; set; }
        public decimal IOWaitPct { get; set; }
        public decimal LockWaitPct { get; set; }
        public decimal CXPacketWaitPct { get; set; }
        public List<WaitInfo> TopWaits { get; set; } = new();
    }

    public class WaitInfo
    {
        public string WaitType { get; set; } = "";
        public long TotalWaitMs { get; set; }
        public decimal WaitPct { get; set; }
    }
}

