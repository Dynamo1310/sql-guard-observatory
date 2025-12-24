using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de configuración y contención de TempDB
/// Métricas compuestas: Contención (40%), Latencia (30%), Configuración (20%), Recursos (10%)
/// Peso: 8%
/// </summary>
public class ConfigTempDBCollector : CollectorBase<ConfigTempDBCollector.TempDBMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "ConfiguracionTempdb";
    public override string DisplayName => "Config TempDB";

    public ConfigTempDBCollector(
        ILogger<ConfigTempDBCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<TempDBMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new TempDBMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: TempDB files info
            if (dataSet.Tables.Count >= 1)
            {
                ProcessTempDBFiles(dataSet.Tables[0], result);
            }

            // ResultSet 2: CPU count
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.LogicalCPUCount = GetInt(dataSet.Tables[1].Rows[0], "CPUCount");
            }

            // ResultSet 3: Contention (PAGELATCH waits)
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                result.PageLatchWaitsPct = GetDecimal(dataSet.Tables[2].Rows[0], "PageLatchPct");
            }

            // ResultSet 4: I/O stats
            if (dataSet.Tables.Count >= 4 && dataSet.Tables[3].Rows.Count > 0)
            {
                result.AvgWriteLatencyMs = GetDecimal(dataSet.Tables[3].Rows[0], "AvgWriteLatency");
            }

            // Calcular score parciales
            CalculatePartialScores(result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting TempDB metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessTempDBFiles(DataTable table, TempDBMetrics result)
    {
        var fileSizes = new List<long>();
        var growthConfigs = new List<string>();
        decimal totalSpaceMB = 0;
        decimal freeSpaceMB = 0;

        foreach (DataRow row in table.Rows)
        {
            var fileType = GetString(row, "FileType") ?? "";
            if (fileType != "ROWS") continue;

            result.TempDBFileCount++;
            
            var sizeMB = GetLong(row, "SizeMB");
            fileSizes.Add(sizeMB);
            totalSpaceMB += sizeMB;
            freeSpaceMB += GetDecimal(row, "FreeSpaceMB");
            
            var growth = GetInt(row, "Growth");
            var isPercent = GetBool(row, "IsPercent");
            growthConfigs.Add(isPercent ? $"{growth}%" : $"{growth}MB");
        }

        // Verificar si todos los archivos tienen el mismo tamaño
        if (fileSizes.Count > 1)
        {
            result.AllFilesSameSize = fileSizes.Distinct().Count() == 1;
        }

        // Verificar si todos tienen growth en MB (no %)
        result.GrowthInMB = growthConfigs.All(g => g.EndsWith("MB"));

        // Free space
        if (totalSpaceMB > 0)
        {
            result.FreeSpacePct = (freeSpaceMB * 100m) / totalSpaceMB;
        }
    }

    private void CalculatePartialScores(TempDBMetrics result)
    {
        // Configuración Score (20%)
        var configScore = 0;
        
        // Files per CPU (hasta 8)
        var idealFiles = Math.Min(result.LogicalCPUCount, 8);
        if (result.TempDBFileCount >= idealFiles)
        {
            configScore += 10;
        }
        else if (result.TempDBFileCount >= idealFiles / 2)
        {
            configScore += 5;
        }
        
        // Same size
        if (result.AllFilesSameSize)
        {
            configScore += 5;
        }
        
        // Growth in MB (not percent)
        if (result.GrowthInMB)
        {
            configScore += 5;
        }

        result.ConfigurationScore = configScore;

        // Contención Score (40%)
        var contentionScore = 40;
        if (result.PageLatchWaitsPct > 10)
        {
            contentionScore = 0;
        }
        else if (result.PageLatchWaitsPct > 5)
        {
            contentionScore = 20;
        }
        else if (result.PageLatchWaitsPct > 2)
        {
            contentionScore = 30;
        }

        result.ContentionScore = contentionScore;

        // Latencia Score (30%)
        var latencyScore = 30;
        if (result.AvgWriteLatencyMs > 50)
        {
            latencyScore = 0;
        }
        else if (result.AvgWriteLatencyMs > 20)
        {
            latencyScore = 15;
        }
        else if (result.AvgWriteLatencyMs > 10)
        {
            latencyScore = 25;
        }

        result.LatencyScore = latencyScore;

        // Recursos Score (10%)
        var resourceScore = 10;
        if (result.FreeSpacePct < 10)
        {
            resourceScore = 0;
        }
        else if (result.FreeSpacePct < 20)
        {
            resourceScore = 5;
        }

        result.ResourceScore = resourceScore;
    }

    protected override int CalculateScore(TempDBMetrics data, List<CollectorThreshold> thresholds)
    {
        // Score compuesto
        var score = data.ConfigurationScore + data.ContentionScore + data.LatencyScore + data.ResourceScore;
        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, TempDBMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthConfiguracionTempdb
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            TempDBFileCount = data.TempDBFileCount,
            TempDBAllSameSize = data.AllFilesSameSize,
            TempDBAllSameGrowth = data.GrowthInMB,
            CPUCount = data.LogicalCPUCount,
            TempDBPageLatchWaits = (int)data.PageLatchWaitsPct,
            TempDBAvgWriteLatencyMs = data.AvgWriteLatencyMs,
            TempDBFreeSpacePct = data.FreeSpacePct,
            TempDBContentionScore = data.ContentionScore,
            TempDBGrowthConfigOK = data.GrowthInMB
        };

        _context.InstanceHealthConfiguracionTempdb.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        var fileSpaceQuery = sqlMajorVersion >= 11
            ? @"SELECT 
                    mf.type_desc AS FileType,
                    mf.size * 8 / 1024 AS SizeMB,
                    CAST(FILEPROPERTY(mf.name, 'SpaceUsed') * 8.0 / 1024 AS DECIMAL(18,2)) AS UsedSpaceMB,
                    (mf.size - CAST(FILEPROPERTY(mf.name, 'SpaceUsed') AS BIGINT)) * 8.0 / 1024 AS FreeSpaceMB,
                    mf.growth,
                    mf.is_percent_growth AS IsPercent
                FROM tempdb.sys.database_files mf;"
            : @"SELECT 
                    mf.type_desc AS FileType,
                    mf.size * 8 / 1024 AS SizeMB,
                    0 AS UsedSpaceMB,
                    mf.size * 8.0 / 1024 * 0.5 AS FreeSpaceMB, -- Estimate
                    mf.growth,
                    mf.is_percent_growth AS IsPercent
                FROM tempdb.sys.database_files mf;";

        return $@"
-- TempDB files info
{fileSpaceQuery}

-- CPU count
SELECT cpu_count AS CPUCount FROM sys.dm_os_sys_info;

-- Contention (PAGELATCH waits on allocation pages)
SELECT 
    CAST(
        SUM(CASE WHEN wait_type LIKE 'PAGELATCH%' AND resource_description LIKE '2:%' THEN wait_time_ms ELSE 0 END) * 100.0 /
        NULLIF(SUM(wait_time_ms), 0)
    AS DECIMAL(5,2)) AS PageLatchPct
FROM sys.dm_os_wait_stats
WHERE wait_type NOT IN ('CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SQLTRACE_BUFFER_FLUSH',
                         'SLEEP_TASK','SLEEP_SYSTEMTASK','WAITFOR','HADR_FILESTREAM_IOMGR_IOCOMPLETION',
                         'CHECKPOINT_QUEUE','XE_TIMER_EVENT','XE_DISPATCHER_WAIT','BROKER_TASK_STOP',
                         'CLR_AUTO_EVENT','BROKER_EVENTHANDLER','DIRTY_PAGE_POLL','SP_SERVER_DIAGNOSTICS_SLEEP');

-- TempDB I/O latency
SELECT 
    CASE 
        WHEN SUM(num_of_writes) > 0 
        THEN CAST(SUM(io_stall_write_ms) * 1.0 / SUM(num_of_writes) AS DECIMAL(18,2))
        ELSE 0 
    END AS AvgWriteLatency
FROM sys.dm_io_virtual_file_stats(2, NULL); -- database_id = 2 is tempdb";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(TempDBMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["FileCount"] = data.TempDBFileCount,
            ["CPUCount"] = data.LogicalCPUCount,
            ["ContentionPct"] = data.PageLatchWaitsPct,
            ["WriteLatency"] = data.AvgWriteLatencyMs
        };
    }

    public class TempDBMetrics
    {
        public int TempDBFileCount { get; set; }
        public bool AllFilesSameSize { get; set; } = true;
        public bool GrowthInMB { get; set; }
        public int LogicalCPUCount { get; set; }
        public decimal PageLatchWaitsPct { get; set; }
        public decimal AvgWriteLatencyMs { get; set; }
        public decimal FreeSpacePct { get; set; } = 100m;
        public int ContentionScore { get; set; }
        public int LatencyScore { get; set; }
        public int ConfigurationScore { get; set; }
        public int ResourceScore { get; set; }
    }
}

