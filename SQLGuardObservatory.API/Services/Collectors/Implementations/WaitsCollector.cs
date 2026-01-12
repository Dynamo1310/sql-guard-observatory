using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de Wait Statistics & Blocking (v3.1 mejorado con método delta)
/// Métricas en tiempo real usando snapshot delta de 2 segundos (igual que IOCollector)
/// Categorías: I/O, Memory, CPU, Lock, Network
/// Peso: 0% directo, alimenta otros collectors
/// </summary>
public class WaitsCollector : CollectorBase<WaitsCollector.WaitsMetrics>
{
    public override string CollectorName => "Waits";
    public override string DisplayName => "Wait Statistics";

    public WaitsCollector(
        ILogger<WaitsCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
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
            // Query 1: Blocking info (tiempo real, no necesita delta)
            var blockingQuery = GetBlockingQuery();
            var blockingData = await ExecuteQueryAsync(instance.InstanceName, blockingQuery, timeoutSeconds, ct);
            ProcessBlockingResults(blockingData, result);

            // Query 2: Wait Stats con método DELTA (2 segundos)
            // Esto da valores de waits en tiempo real, no acumulados desde el último reinicio
            var deltaQuery = GetDeltaWaitsQuery();
            var deltaData = await ExecuteQueryMultiResultAsync(instance.InstanceName, deltaQuery, timeoutSeconds + 5, ct);
            
            // ResultSet 1: Top waits (delta)
            if (deltaData.Tables.Count >= 1)
            {
                ProcessTopWaitsResults(deltaData.Tables[0], result);
            }
            
            // ResultSet 2: Aggregates (delta)
            if (deltaData.Tables.Count >= 2)
            {
                ProcessAggregatesResults(deltaData.Tables[1], result);
            }

            // Query 3: MaxDOP
            var maxDopQuery = "SELECT CAST(value_in_use AS INT) AS MaxDOP FROM sys.configurations WITH (NOLOCK) WHERE name = 'max degree of parallelism';";
            var maxDopData = await ExecuteQueryAsync(instance.InstanceName, maxDopQuery, timeoutSeconds, ct);
            if (maxDopData.Rows.Count > 0)
            {
                result.MaxDOP = GetInt(maxDopData.Rows[0], "MaxDOP");
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting wait stats from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessBlockingResults(DataTable table, WaitsMetrics result)
    {
        if (table.Rows.Count > 0)
        {
            var row = table.Rows[0];
            result.BlockedSessionCount = GetInt(row, "BlockedCount");
            result.MaxBlockTimeSeconds = GetInt(row, "MaxBlockSeconds");
            result.BlockerSessionIds = GetString(row, "BlockerIds") ?? "";
        }
    }

    private void ProcessTopWaitsResults(DataTable table, WaitsMetrics result)
    {
        int idx = 0;
        foreach (DataRow row in table.Rows)
        {
            if (idx >= 5) break;

            var waitInfo = new WaitInfo
            {
                WaitType = GetString(row, "wait_type") ?? "",
                WaitCount = GetLong(row, "waiting_tasks_count"),
                TotalWaitMs = GetLong(row, "wait_time_ms")
            };

            result.TopWaits.Add(waitInfo);
            idx++;
        }
    }

    private void ProcessAggregatesResults(DataTable table, WaitsMetrics result)
    {
        if (table.Rows.Count > 0)
        {
            var row = table.Rows[0];

            // I/O Waits
            result.PageIOLatchWaitCount = GetLong(row, "PageIOLatchCount");
            result.PageIOLatchWaitMs = GetLong(row, "PageIOLatchMs");
            result.WriteLogWaitCount = GetLong(row, "WriteLogCount");
            result.WriteLogWaitMs = GetLong(row, "WriteLogMs");
            result.AsyncIOCompletionCount = GetLong(row, "AsyncIOCount");
            result.AsyncIOCompletionMs = GetLong(row, "AsyncIOMs");

            // Memory Waits
            result.ResourceSemaphoreWaitCount = GetLong(row, "ResourceSemCount");
            result.ResourceSemaphoreWaitMs = GetLong(row, "ResourceSemMs");

            // CPU/Parallelism Waits
            result.CXPacketWaitCount = GetLong(row, "CXPacketCount");
            result.CXPacketWaitMs = GetLong(row, "CXPacketMs");
            result.CXConsumerWaitCount = GetLong(row, "CXConsumerCount");
            result.CXConsumerWaitMs = GetLong(row, "CXConsumerMs");
            result.SOSSchedulerYieldCount = GetLong(row, "SOSYieldCount");
            result.SOSSchedulerYieldMs = GetLong(row, "SOSYieldMs");
            result.ThreadPoolWaitCount = GetLong(row, "ThreadPoolCount");
            result.ThreadPoolWaitMs = GetLong(row, "ThreadPoolMs");

            // Lock Waits
            result.LockWaitCount = GetLong(row, "LockCount");
            result.LockWaitMs = GetLong(row, "LockMs");
            
            // Network Waits
            result.NetworkWaitCount = GetLong(row, "NetworkCount");
            result.NetworkWaitMs = GetLong(row, "NetworkMs");

            // Totals
            result.TotalWaits = GetLong(row, "TotalCount");
            result.TotalWaitMs = GetLong(row, "TotalMs");
            result.TotalSignalWaitMs = GetLong(row, "TotalSignalMs");
        }
    }

    protected override int CalculateScore(WaitsMetrics data, List<CollectorThreshold> thresholds)
    {
        // Este collector no tiene score directo pero puede calcular uno basado en waits
        var score = 100;

        if (data.TotalWaitMs > 0)
        {
            // PAGEIOLATCH > 10% = crítico
            var pageIOPct = (data.PageIOLatchWaitMs * 100.0m) / data.TotalWaitMs;
            if (pageIOPct > 10) score -= 30;
            else if (pageIOPct > 5) score -= 15;

            // CXPACKET > 15% = crítico
            var cxPacketPct = (data.CXPacketWaitMs * 100.0m) / data.TotalWaitMs;
            if (cxPacketPct > 15) score -= 20;
            else if (cxPacketPct > 10) score -= 10;

            // RESOURCE_SEMAPHORE > 5% = crítico
            var resSemPct = (data.ResourceSemaphoreWaitMs * 100.0m) / data.TotalWaitMs;
            if (resSemPct > 5) score -= 30;
            else if (resSemPct > 2) score -= 15;

            // THREADPOOL > 0.01% = crítico
            var threadPoolPct = (data.ThreadPoolWaitMs * 100.0m) / data.TotalWaitMs;
            if (threadPoolPct > 0.01m) score -= 40;
        }

        // Blocking
        if (data.BlockedSessionCount > 10) score -= 30;
        else if (data.BlockedSessionCount > 0) score -= 10;

        return Math.Clamp(score, 0, 100);
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
            // Blocking
            BlockedSessionCount = data.BlockedSessionCount,
            MaxBlockTimeSeconds = data.MaxBlockTimeSeconds,
            BlockerSessionIds = data.BlockerSessionIds,
            // I/O Waits
            PageIOLatchWaitCount = data.PageIOLatchWaitCount,
            PageIOLatchWaitMs = data.PageIOLatchWaitMs,
            WriteLogWaitCount = data.WriteLogWaitCount,
            WriteLogWaitMs = data.WriteLogWaitMs,
            AsyncIOCompletionCount = data.AsyncIOCompletionCount,
            AsyncIOCompletionMs = data.AsyncIOCompletionMs,
            // Memory Waits
            ResourceSemaphoreWaitCount = data.ResourceSemaphoreWaitCount,
            ResourceSemaphoreWaitMs = data.ResourceSemaphoreWaitMs,
            // CPU Waits
            CXPacketWaitCount = data.CXPacketWaitCount,
            CXPacketWaitMs = data.CXPacketWaitMs,
            CXConsumerWaitCount = data.CXConsumerWaitCount,
            CXConsumerWaitMs = data.CXConsumerWaitMs,
            SOSSchedulerYieldCount = data.SOSSchedulerYieldCount,
            SOSSchedulerYieldMs = data.SOSSchedulerYieldMs,
            ThreadPoolWaitCount = data.ThreadPoolWaitCount,
            ThreadPoolWaitMs = data.ThreadPoolWaitMs,
            // Lock Waits
            LockWaitCount = data.LockWaitCount,
            LockWaitMs = data.LockWaitMs,
            // Network Waits (v3.1)
            NetworkWaitCount = data.NetworkWaitCount,
            NetworkWaitMs = data.NetworkWaitMs,
            // Config
            MaxDOP = data.MaxDOP,
            // Totals
            TotalWaits = data.TotalWaits,
            TotalWaitMs = data.TotalWaitMs,
            TotalSignalWaitMs = data.TotalSignalWaitMs
        };

        // Top 5 waits
        if (data.TopWaits.Count > 0)
        {
            entity.TopWait1Type = data.TopWaits[0].WaitType;
            entity.TopWait1Count = data.TopWaits[0].WaitCount;
            entity.TopWait1Ms = data.TopWaits[0].TotalWaitMs;
        }
        if (data.TopWaits.Count > 1)
        {
            entity.TopWait2Type = data.TopWaits[1].WaitType;
            entity.TopWait2Count = data.TopWaits[1].WaitCount;
            entity.TopWait2Ms = data.TopWaits[1].TotalWaitMs;
        }
        if (data.TopWaits.Count > 2)
        {
            entity.TopWait3Type = data.TopWaits[2].WaitType;
            entity.TopWait3Count = data.TopWaits[2].WaitCount;
            entity.TopWait3Ms = data.TopWaits[2].TotalWaitMs;
        }
        if (data.TopWaits.Count > 3)
        {
            entity.TopWait4Type = data.TopWaits[3].WaitType;
            entity.TopWait4Count = data.TopWaits[3].WaitCount;
            entity.TopWait4Ms = data.TopWaits[3].TotalWaitMs;
        }
        if (data.TopWaits.Count > 4)
        {
            entity.TopWait5Type = data.TopWaits[4].WaitType;
            entity.TopWait5Count = data.TopWaits[4].WaitCount;
            entity.TopWait5Ms = data.TopWaits[4].TotalWaitMs;
        }

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthWaits.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    private string GetBlockingQuery()
    {
        return @"
-- Blocking activo (replicando lógica PowerShell)
SELECT 
    COUNT(*) AS BlockedCount,
    ISNULL(MAX(r.wait_time / 1000), 0) AS MaxBlockSeconds,
    STUFF((
        SELECT DISTINCT ',' + CAST(blocking_session_id AS VARCHAR(10))
        FROM sys.dm_exec_requests WITH (NOLOCK)
        WHERE blocking_session_id > 0
        GROUP BY blocking_session_id
        FOR XML PATH('')
    ), 1, 1, '') AS BlockerIds
FROM sys.dm_exec_requests r WITH (NOLOCK)
WHERE r.blocking_session_id > 0;";
    }

    /// <summary>
    /// Query con método DELTA para medir waits en tiempo real (2 segundos de muestreo)
    /// Similar al IOCollector - captura la actividad actual, no acumulada desde el reinicio
    /// </summary>
    private string GetDeltaWaitsQuery()
    {
        return @"
-- =====================================================
-- WAIT STATS con método DELTA (2 segundos)
-- Mide waits ACTUALES, no históricos acumulados
-- =====================================================

-- Snapshot inicial
SELECT 
    wait_type,
    waiting_tasks_count,
    wait_time_ms,
    signal_wait_time_ms
INTO #wait_snapshot1
FROM sys.dm_os_wait_stats WITH (NOLOCK)
WHERE wait_type NOT IN (
    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
    'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
    'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
    'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
    'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 
    'SQLTRACE_INCREMENTAL_FLUSH_SLEEP', 'DIRTY_PAGE_POLL',
    'HADR_FILESTREAM_IOMGR_IOCOMPLETION', 'ONDEMAND_TASK_QUEUE',
    'FT_IFTSHC_MUTEX', 'BROKER_EVENTHANDLER',
    'BROKER_RECEIVE_WAITFOR', 'SP_SERVER_DIAGNOSTICS_SLEEP',
    'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_ASYNC_QUEUE',
    'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP'
);

-- Esperar 2 segundos para capturar actividad
WAITFOR DELAY '00:00:02';

-- Top 10 waits con DELTA (actividad en los últimos 2 segundos)
SELECT TOP 10
    ws.wait_type,
    (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) AS waiting_tasks_count,
    (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) AS wait_time_ms,
    (ws.signal_wait_time_ms - ISNULL(s1.signal_wait_time_ms, 0)) AS signal_wait_time_ms
FROM sys.dm_os_wait_stats ws WITH (NOLOCK)
LEFT JOIN #wait_snapshot1 s1 ON ws.wait_type = s1.wait_type
WHERE (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) > 0
ORDER BY (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) DESC;

-- Waits agregados por categoría con DELTA
SELECT
    -- I/O Waits
    SUM(CASE WHEN ws.wait_type LIKE 'PAGEIOLATCH%' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS PageIOLatchCount,
    SUM(CASE WHEN ws.wait_type LIKE 'PAGEIOLATCH%' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS PageIOLatchMs,
    SUM(CASE WHEN ws.wait_type = 'WRITELOG' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS WriteLogCount,
    SUM(CASE WHEN ws.wait_type = 'WRITELOG' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS WriteLogMs,
    SUM(CASE WHEN ws.wait_type IN ('ASYNC_IO_COMPLETION', 'IO_COMPLETION') 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS AsyncIOCount,
    SUM(CASE WHEN ws.wait_type IN ('ASYNC_IO_COMPLETION', 'IO_COMPLETION') 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS AsyncIOMs,
    
    -- Memory Waits
    SUM(CASE WHEN ws.wait_type LIKE 'RESOURCE_SEMAPHORE%' OR ws.wait_type = 'CMEMTHREAD'
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS ResourceSemCount,
    SUM(CASE WHEN ws.wait_type LIKE 'RESOURCE_SEMAPHORE%' OR ws.wait_type = 'CMEMTHREAD'
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS ResourceSemMs,
    
    -- CPU/Parallelism Waits
    SUM(CASE WHEN ws.wait_type = 'CXPACKET' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS CXPacketCount,
    SUM(CASE WHEN ws.wait_type = 'CXPACKET' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS CXPacketMs,
    SUM(CASE WHEN ws.wait_type = 'CXCONSUMER' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS CXConsumerCount,
    SUM(CASE WHEN ws.wait_type = 'CXCONSUMER' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS CXConsumerMs,
    SUM(CASE WHEN ws.wait_type = 'SOS_SCHEDULER_YIELD' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS SOSYieldCount,
    SUM(CASE WHEN ws.wait_type = 'SOS_SCHEDULER_YIELD' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS SOSYieldMs,
    SUM(CASE WHEN ws.wait_type LIKE 'THREADPOOL%' 
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS ThreadPoolCount,
    SUM(CASE WHEN ws.wait_type LIKE 'THREADPOOL%' 
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS ThreadPoolMs,
    
    -- Lock Waits
    SUM(CASE WHEN ws.wait_type LIKE 'LCK_%' OR ws.wait_type LIKE 'PAGELATCH_%'
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS LockCount,
    SUM(CASE WHEN ws.wait_type LIKE 'LCK_%' OR ws.wait_type LIKE 'PAGELATCH_%'
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS LockMs,
    
    -- Network Waits
    SUM(CASE WHEN ws.wait_type IN ('ASYNC_NETWORK_IO', 'OLEDB', 'PREEMPTIVE_OLEDBOPS')
        THEN (ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) ELSE 0 END) AS NetworkCount,
    SUM(CASE WHEN ws.wait_type IN ('ASYNC_NETWORK_IO', 'OLEDB', 'PREEMPTIVE_OLEDBOPS')
        THEN (ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) ELSE 0 END) AS NetworkMs,
    
    -- Totals (delta)
    SUM(ws.waiting_tasks_count - ISNULL(s1.waiting_tasks_count, 0)) AS TotalCount,
    SUM(ws.wait_time_ms - ISNULL(s1.wait_time_ms, 0)) AS TotalMs,
    SUM(ws.signal_wait_time_ms - ISNULL(s1.signal_wait_time_ms, 0)) AS TotalSignalMs
FROM sys.dm_os_wait_stats ws WITH (NOLOCK)
LEFT JOIN #wait_snapshot1 s1 ON ws.wait_type = s1.wait_type
WHERE ws.wait_type NOT IN (
    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
    'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
    'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
    'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
    'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 
    'SQLTRACE_INCREMENTAL_FLUSH_SLEEP'
);

DROP TABLE #wait_snapshot1;";
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // No se usa, las queries están en métodos separados
        return "";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(WaitsMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["TotalWaitMs"] = data.TotalWaitMs,
            ["BlockedSessions"] = data.BlockedSessionCount,
            ["PageIOLatchMs"] = data.PageIOLatchWaitMs,
            ["CXPacketMs"] = data.CXPacketWaitMs
        };
    }

    public class WaitsMetrics
    {
        // Blocking
        public int BlockedSessionCount { get; set; }
        public int MaxBlockTimeSeconds { get; set; }
        public string BlockerSessionIds { get; set; } = "";

        // I/O Waits
        public long PageIOLatchWaitCount { get; set; }
        public long PageIOLatchWaitMs { get; set; }
        public long WriteLogWaitCount { get; set; }
        public long WriteLogWaitMs { get; set; }
        public long AsyncIOCompletionCount { get; set; }
        public long AsyncIOCompletionMs { get; set; }

        // Memory Waits
        public long ResourceSemaphoreWaitCount { get; set; }
        public long ResourceSemaphoreWaitMs { get; set; }

        // CPU/Parallelism Waits
        public long CXPacketWaitCount { get; set; }
        public long CXPacketWaitMs { get; set; }
        public long CXConsumerWaitCount { get; set; }
        public long CXConsumerWaitMs { get; set; }
        public long SOSSchedulerYieldCount { get; set; }
        public long SOSSchedulerYieldMs { get; set; }
        public long ThreadPoolWaitCount { get; set; }
        public long ThreadPoolWaitMs { get; set; }

        // Lock Waits
        public long LockWaitCount { get; set; }
        public long LockWaitMs { get; set; }
        
        // Network Waits (v3.1)
        public long NetworkWaitCount { get; set; }
        public long NetworkWaitMs { get; set; }

        // Config
        public int MaxDOP { get; set; }

        // Totals
        public long TotalWaits { get; set; }
        public long TotalWaitMs { get; set; }
        public long TotalSignalWaitMs { get; set; }

        // Top Waits
        public List<WaitInfo> TopWaits { get; set; } = new();
    }

    public class WaitInfo
    {
        public string WaitType { get; set; } = "";
        public long WaitCount { get; set; }
        public long TotalWaitMs { get; set; }
    }
}

