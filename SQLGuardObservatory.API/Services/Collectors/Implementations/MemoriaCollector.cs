using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Memoria
/// Métricas: PLE, Memory Grants, Stolen Memory, Buffer Cache
/// Peso: 8%
/// </summary>
public class MemoriaCollector : CollectorBase<MemoriaCollector.MemoriaMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Memoria";
    public override string DisplayName => "Memoria";

    public MemoriaCollector(
        ILogger<MemoriaCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<MemoriaMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new MemoriaMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Performance Counters
            if (dataSet.Tables.Count >= 1)
            {
                ProcessPerformanceCounters(dataSet.Tables[0], result);
            }

            // ResultSet 2: Memory Grants Pending
            if (dataSet.Tables.Count >= 2 && dataSet.Tables[1].Rows.Count > 0)
            {
                result.MemoryGrantsPending = GetInt(dataSet.Tables[1].Rows[0], "GrantsPending");
            }

            // ResultSet 3: Memory Grants Active
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                result.MemoryGrantsActive = GetInt(dataSet.Tables[2].Rows[0], "GrantsActive");
            }

            // ResultSet 4: Max Server Memory (skip sys_info)
            if (dataSet.Tables.Count >= 5 && dataSet.Tables[4].Rows.Count > 0)
            {
                result.MaxServerMemoryMB = GetInt(dataSet.Tables[4].Rows[0], "MaxServerMemoryMB");
            }

            // Calcular PLETarget y BufferPoolSize
            if (result.TotalServerMemoryMB > 0)
            {
                result.BufferPoolSizeMB = result.TotalServerMemoryMB;
                var bufferPoolGB = result.BufferPoolSizeMB / 1024.0m;
                result.PLETarget = (int)(bufferPoolGB * 300); // 300 segundos por GB
            }

            // Determinar memory pressure
            if (result.PLETarget > 0)
            {
                result.MemoryPressure = result.PageLifeExpectancy < (result.PLETarget * 0.5m) || 
                                        result.MemoryGrantsPending > 10;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting memory metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessPerformanceCounters(DataTable table, MemoriaMetrics result)
    {
        decimal? bufferCacheRatio = null;
        decimal? bufferCacheBase = null;

        foreach (DataRow row in table.Rows)
        {
            var counterName = GetString(row, "counter_name")?.Trim() ?? "";
            var counterValue = GetLong(row, "cntr_value");

            if (counterName.Contains("Page life expectancy", StringComparison.OrdinalIgnoreCase))
            {
                result.PageLifeExpectancy = (int)counterValue;
            }
            else if (counterName.Contains("Buffer cache hit ratio", StringComparison.OrdinalIgnoreCase) && 
                     !counterName.Contains("base", StringComparison.OrdinalIgnoreCase))
            {
                bufferCacheRatio = counterValue;
            }
            else if (counterName.Contains("Buffer cache hit ratio base", StringComparison.OrdinalIgnoreCase))
            {
                bufferCacheBase = counterValue;
            }
            else if (counterName.Contains("Total Server Memory", StringComparison.OrdinalIgnoreCase))
            {
                result.TotalServerMemoryMB = (int)(counterValue / 1024);
            }
            else if (counterName.Contains("Target Server Memory", StringComparison.OrdinalIgnoreCase))
            {
                result.TargetServerMemoryMB = (int)(counterValue / 1024);
            }
            else if (counterName.Contains("Stolen Server Memory", StringComparison.OrdinalIgnoreCase))
            {
                result.StolenServerMemoryMB = (int)(counterValue / 1024);
            }
        }

        // Calcular Buffer Cache Hit Ratio
        if (bufferCacheRatio.HasValue && bufferCacheBase.HasValue && bufferCacheBase.Value > 0)
        {
            result.BufferCacheHitRatio = (bufferCacheRatio.Value * 100.0m) / bufferCacheBase.Value;
        }
    }

    protected override int CalculateScore(MemoriaMetrics data, List<CollectorThreshold> thresholds)
    {
        // Calcular PLE Score (60% del score)
        int pleScore;
        if (data.PLETarget > 0)
        {
            var pleRatio = (data.PageLifeExpectancy * 100.0m) / data.PLETarget;
            pleScore = EvaluateThresholds(pleRatio, thresholds, "PLE");
        }
        else
        {
            // Si no hay target, usar PLE absoluto
            pleScore = data.PageLifeExpectancy >= 300 ? 100 :
                       data.PageLifeExpectancy >= 200 ? 80 :
                       data.PageLifeExpectancy >= 100 ? 60 : 40;
        }

        // Calcular Memory Grants Score (25% del score)
        var grantsScore = data.MemoryGrantsPending == 0 ? 100 :
                          data.MemoryGrantsPending <= 5 ? 80 :
                          data.MemoryGrantsPending <= 10 ? 50 : 0;

        // Calcular Uso de Memoria Score (15% del score)
        var usoScore = 100;
        if (data.MaxServerMemoryMB > 0 && data.TotalServerMemoryMB > 0)
        {
            var usoRatio = (data.TotalServerMemoryMB * 100.0m) / data.MaxServerMemoryMB;
            usoScore = usoRatio >= 95 ? 100 : usoRatio >= 80 ? 90 : usoRatio >= 60 ? 70 : 50;
        }

        // Fórmula ponderada
        var score = (int)((pleScore * 0.6m) + (grantsScore * 0.25m) + (usoScore * 0.15m));

        // Aplicar caps
        score = ApplyCaps(score, data.MemoryGrantsPending, thresholds, "Caps");

        // Aplicar penalizaciones por stolen memory
        if (data.TotalServerMemoryMB > 0 && data.StolenServerMemoryMB > 0)
        {
            var stolenPct = (data.StolenServerMemoryMB * 100.0m) / data.TotalServerMemoryMB;
            score = ApplyPenalties(score, stolenPct, thresholds, "Caps");
        }

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, MemoriaMetrics data, int score, CancellationToken ct)
    {
        var entity = new InstanceHealthMemoria
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            PageLifeExpectancy = data.PageLifeExpectancy,
            BufferCacheHitRatio = data.BufferCacheHitRatio,
            TotalServerMemoryMB = data.TotalServerMemoryMB,
            TargetServerMemoryMB = data.TargetServerMemoryMB,
            MaxServerMemoryMB = data.MaxServerMemoryMB,
            BufferPoolSizeMB = data.BufferPoolSizeMB,
            MemoryGrantsPending = data.MemoryGrantsPending,
            MemoryGrantsActive = data.MemoryGrantsActive,
            PLETarget = data.PLETarget,
            MemoryPressure = data.MemoryPressure,
            StolenServerMemoryMB = data.StolenServerMemoryMB
        };

        _context.InstanceHealthMemoria.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        var sysInfoQuery = sqlMajorVersion <= 10
            ? @"SELECT 
                    physical_memory_in_bytes / 1024 / 1024 AS TotalPhysicalMemoryMB,
                    bpool_committed / 128 AS CommittedMemoryMB,
                    bpool_commit_target / 128 AS CommittedTargetMB
                FROM sys.dm_os_sys_info;"
            : @"SELECT 
                    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
                    committed_kb / 1024 AS CommittedMemoryMB,
                    committed_target_kb / 1024 AS CommittedTargetMB
                FROM sys.dm_os_sys_info;";

        return $@"
-- Memory counters
SELECT 
    counter_name,
    cntr_value
FROM sys.dm_os_performance_counters WITH (NOLOCK)
WHERE object_name LIKE '%Buffer Manager%'
   OR object_name LIKE '%Memory Manager%'
ORDER BY counter_name;

-- Memory Grants Pending
SELECT COUNT(*) AS GrantsPending
FROM sys.dm_exec_query_memory_grants WITH (NOLOCK)
WHERE grant_time IS NULL;

-- Memory Grants Active
SELECT COUNT(*) AS GrantsActive
FROM sys.dm_exec_query_memory_grants WITH (NOLOCK)
WHERE grant_time IS NOT NULL;

-- System Info (version-specific)
{sysInfoQuery}

-- Max Server Memory configurado
SELECT CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations WITH (NOLOCK)
WHERE name = 'max server memory (MB)';";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(MemoriaMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["PLE"] = data.PageLifeExpectancy,
            ["PLETarget"] = data.PLETarget,
            ["GrantsPending"] = data.MemoryGrantsPending,
            ["MemoryPressure"] = data.MemoryPressure
        };
    }

    public class MemoriaMetrics
    {
        public int PageLifeExpectancy { get; set; }
        public decimal BufferCacheHitRatio { get; set; } = 100.0m;
        public int TotalServerMemoryMB { get; set; }
        public int TargetServerMemoryMB { get; set; }
        public int MaxServerMemoryMB { get; set; }
        public int BufferPoolSizeMB { get; set; }
        public int MemoryGrantsPending { get; set; }
        public int MemoryGrantsActive { get; set; }
        public int PLETarget { get; set; }
        public bool MemoryPressure { get; set; }
        public int StolenServerMemoryMB { get; set; }
    }
}

