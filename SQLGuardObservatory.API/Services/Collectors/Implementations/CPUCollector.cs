using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de CPU
/// Métricas: P95 CPU, Runnable Tasks, Signal Waits
/// Peso: 10%
/// </summary>
public class CPUCollector : CollectorBase<CPUCollector.CPUMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "CPU";
    public override string DisplayName => "CPU";

    public CPUCollector(
        ILogger<CPUCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<CPUMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new CPUMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            if (dataSet.Tables.Count == 0)
                return result;

            // Procesar según versión de SQL Server
            if (instance.SqlMajorVersion <= 10) // SQL 2005/2008
            {
                ProcessLegacyResults(dataSet, result);
            }
            else // SQL 2012+
            {
                ProcessModernResults(dataSet, result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting CPU metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessLegacyResults(DataSet dataSet, CPUMetrics result)
    {
        // ResultSet 1: Scheduler metrics
        if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
        {
            var row = dataSet.Tables[0].Rows[0];
            var totalTasks = GetInt(row, "TotalCurrentTasks");
            var workQueue = GetInt(row, "TotalWorkQueue");
            var runnableTotal = GetInt(row, "RunnableTasksTotal");
            var schedulers = GetInt(row, "ActiveSchedulers", 1);

            // Aproximación de CPU basada en carga de schedulers
            if (schedulers > 0)
            {
                var approxCPU = (int)((totalTasks / (decimal)schedulers) * 12);
                if (workQueue > 0)
                    approxCPU += (int)((workQueue / (decimal)schedulers) * 5);

                approxCPU = Math.Clamp(approxCPU, totalTasks > 0 ? 1 : 0, 100);

                result.SQLProcessUtilization = approxCPU;
                result.AvgCPUPercentLast10Min = approxCPU;
                result.P95CPUPercent = approxCPU;
            }

            result.RunnableTasks = runnableTotal;
        }

        // ResultSet 2: Runnable tasks count
        if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
        {
            var runnableCount = GetInt(dataSet.Tables[1].Rows[0], "RunnableTasksCount");
            if (runnableCount > 0)
                result.RunnableTasks = runnableCount;
        }

        // ResultSet 3: Pending I/O
        if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
        {
            result.PendingDiskIOCount = GetInt(dataSet.Tables[2].Rows[0], "PendingDiskIO");
        }
    }

    private void ProcessModernResults(DataSet dataSet, CPUMetrics result)
    {
        // ResultSet 1: CPU History (últimos 10 minutos)
        if (dataSet.Tables.Count >= 1 && dataSet.Tables[0].Rows.Count > 0)
        {
            var cpuValues = new List<int>();
            foreach (DataRow row in dataSet.Tables[0].Rows)
            {
                var sqlCpu = GetInt(row, "SQLServerCPU");
                cpuValues.Add(sqlCpu);

                if (cpuValues.Count == 1)
                {
                    result.SQLProcessUtilization = sqlCpu;
                    result.SystemIdleProcess = GetInt(row, "SystemIdle");
                    result.OtherProcessUtilization = GetInt(row, "OtherProcessCPU");
                }
            }

            if (cpuValues.Count > 0)
            {
                result.AvgCPUPercentLast10Min = (int)cpuValues.Average();
                
                // Calcular P95
                cpuValues.Sort();
                var p95Index = (int)Math.Floor(cpuValues.Count * 0.95);
                if (p95Index >= cpuValues.Count) p95Index = cpuValues.Count - 1;
                result.P95CPUPercent = cpuValues[p95Index];
            }
        }

        // ResultSet 2: Runnable tasks
        if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
        {
            result.RunnableTasks = GetInt(dataSet.Tables[1].Rows[0], "RunnableTasksCount");
        }

        // ResultSet 3: Pending I/O
        if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
        {
            result.PendingDiskIOCount = GetInt(dataSet.Tables[2].Rows[0], "PendingDiskIO");
        }
    }

    protected override int CalculateScore(CPUMetrics data, List<CollectorThreshold> thresholds)
    {
        // Evaluar P95 CPU
        var score = EvaluateThresholds(data.P95CPUPercent, thresholds, "P95CPU");

        // Aplicar cap por Runnable Tasks
        score = ApplyCaps(score, data.RunnableTasks, thresholds, "Caps");

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, CPUMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthCPU
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            SQLProcessUtilization = data.SQLProcessUtilization,
            SystemIdleProcess = data.SystemIdleProcess,
            OtherProcessUtilization = data.OtherProcessUtilization,
            RunnableTasks = data.RunnableTasks,
            PendingDiskIOCount = data.PendingDiskIOCount,
            AvgCPUPercentLast10Min = data.AvgCPUPercentLast10Min,
            P95CPUPercent = data.P95CPUPercent
        };

        _context.InstanceHealthCPU.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        if (sqlMajorVersion <= 10) // SQL 2005/2008
        {
            return @"
-- Aproximación de CPU basada en schedulers activos (SQL 2005/2008)
SELECT 
    ISNULL(SUM(current_tasks_count), 0) AS TotalCurrentTasks,
    ISNULL(SUM(work_queue_count), 0) AS TotalWorkQueue,
    ISNULL(SUM(runnable_tasks_count), 0) AS RunnableTasksTotal,
    COUNT(*) AS ActiveSchedulers
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255
  AND status = 'VISIBLE ONLINE';

-- Runnable tasks (schedulers con tareas esperando CPU)
SELECT ISNULL(COUNT(*), 0) AS RunnableTasksCount
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE status = 'VISIBLE ONLINE'
  AND runnable_tasks_count > 0;

-- Work queued (I/O pendiente)
SELECT ISNULL(SUM(pending_disk_io_count), 0) AS PendingDiskIO
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255;";
        }

        // SQL 2012+
        return @"
-- CPU Utilization (últimos 10 minutos) - SQL 2012+
DECLARE @ts_now bigint;
SELECT @ts_now = cpu_ticks / (cpu_ticks / ms_ticks) FROM sys.dm_os_sys_info WITH (NOLOCK);

WITH CPUHistory AS (
    SELECT 
        record.value('(./Record/@id)[1]', 'int') AS record_id,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS SystemIdle,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS SQLProcessUtilization,
        [timestamp]
    FROM (
        SELECT [timestamp], CONVERT(xml, record) AS [record]
        FROM sys.dm_os_ring_buffers WITH (NOLOCK)
        WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
          AND record LIKE N'%<SystemHealth>%'
    ) AS x
)
SELECT TOP(10)
    DATEADD(ms, -1 * (@ts_now - [timestamp]), GETDATE()) AS EventTime,
    SQLProcessUtilization AS SQLServerCPU,
    SystemIdle,
    100 - SystemIdle - SQLProcessUtilization AS OtherProcessCPU
FROM CPUHistory
ORDER BY record_id DESC;

-- Runnable tasks (tareas esperando CPU)
SELECT ISNULL(COUNT(*), 0) AS RunnableTasksCount
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE status = 'VISIBLE ONLINE'
  AND runnable_tasks_count > 0;

-- Work queued (I/O pendiente)
SELECT ISNULL(SUM(pending_disk_io_count), 0) AS PendingDiskIO
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(CPUMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["P95CPU"] = data.P95CPUPercent,
            ["AvgCPU"] = data.AvgCPUPercentLast10Min,
            ["RunnableTasks"] = data.RunnableTasks
        };
    }

    public class CPUMetrics
    {
        public int SQLProcessUtilization { get; set; }
        public int SystemIdleProcess { get; set; }
        public int OtherProcessUtilization { get; set; }
        public int RunnableTasks { get; set; }
        public int PendingDiskIOCount { get; set; }
        public int AvgCPUPercentLast10Min { get; set; }
        public int P95CPUPercent { get; set; }
    }
}

