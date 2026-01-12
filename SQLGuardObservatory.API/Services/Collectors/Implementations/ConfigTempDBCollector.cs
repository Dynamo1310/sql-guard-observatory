using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de configuración y contención de TempDB (v3.1 mejorado)
/// Métricas compuestas: Contención (40%), Latencia (30%), Configuración (20%), Recursos (10%)
/// MEJORA: Usa método DELTA para medir contención en tiempo real (2 segundos)
/// MEJORA: Incluye métricas de Version Store y active transactions
/// Peso: 8%
/// </summary>
public class ConfigTempDBCollector : CollectorBase<ConfigTempDBCollector.TempDBMetrics>
{
    public override string CollectorName => "ConfiguracionTempdb";
    public override string DisplayName => "Config TempDB";

    public ConfigTempDBCollector(
        ILogger<ConfigTempDBCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
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
            // Aumentar timeout por el WAITFOR DELAY de 2 segundos
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds + 5, ct);

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

            // ResultSet 3: Contention DELTA (tiempo real, 2 segundos)
            if (dataSet.Tables.Count >= 3 && dataSet.Tables[2].Rows.Count > 0)
            {
                result.PageLatchDeltaCount = GetInt(dataSet.Tables[2].Rows[0], "DeltaWaitCount");
                result.PageLatchDeltaMs = GetLong(dataSet.Tables[2].Rows[0], "DeltaWaitMs");
            }
            
            // ResultSet 4: Contention histórico (para referencia)
            if (dataSet.Tables.Count >= 4 && dataSet.Tables[3].Rows.Count > 0)
            {
                result.PageLatchWaitsPct = GetDecimal(dataSet.Tables[3].Rows[0], "PageLatchPct");
            }

            // ResultSet 5: I/O latency
            if (dataSet.Tables.Count >= 5 && dataSet.Tables[4].Rows.Count > 0)
            {
                result.AvgWriteLatencyMs = GetDecimal(dataSet.Tables[4].Rows[0], "AvgWriteLatency");
            }
            
            // ResultSet 6: Version Store metrics
            if (dataSet.Tables.Count >= 6 && dataSet.Tables[5].Rows.Count > 0)
            {
                result.VersionStoreMB = GetInt(dataSet.Tables[5].Rows[0], "VersionStoreMB");
                result.UserObjectsMB = GetInt(dataSet.Tables[5].Rows[0], "UserObjectsMB");
                result.InternalObjectsMB = GetInt(dataSet.Tables[5].Rows[0], "InternalObjectsMB");
            }
            
            // ResultSet 7: Active Version Store Transactions
            if (dataSet.Tables.Count >= 7 && dataSet.Tables[6].Rows.Count > 0)
            {
                result.ActiveVersionStoreTransactions = GetInt(dataSet.Tables[6].Rows[0], "ActiveVersionStoreTransactions");
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
        var growthValues = new List<int>();
        var isPercentGrowths = new List<bool>();
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
            growthValues.Add(growth);
            isPercentGrowths.Add(isPercent);
        }

        // Verificar si todos los archivos tienen el mismo tamaño
        if (fileSizes.Count > 1)
        {
            result.AllFilesSameSize = fileSizes.Distinct().Count() == 1;
        }

        // Verificar si todos tienen el mismo growth
        if (growthValues.Count > 1)
        {
            result.AllFilesSameGrowth = growthValues.Distinct().Count() == 1;
        }

        // Verificar si todos tienen growth en MB (no %)
        result.GrowthInMB = isPercentGrowths.Count > 0 && isPercentGrowths.All(x => !x);

        // Free space y tamaño total
        result.TotalSizeMB = (int)totalSpaceMB;
        if (totalSpaceMB > 0)
        {
            result.FreeSpacePct = (freeSpaceMB * 100m) / totalSpaceMB;
            result.UsedSpaceMB = (int)(totalSpaceMB - freeSpaceMB);
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

        // Contención Score (40%) - AHORA USA DELTA (tiempo real)
        // El valor delta indica contención en los últimos 2 segundos
        var contentionScore = 40;
        
        // Si hay delta, usar delta como métrica principal (más preciso)
        if (result.PageLatchDeltaMs > 0)
        {
            // >500ms de contención en 2 segundos = crítico
            if (result.PageLatchDeltaMs > 500)
            {
                contentionScore = 0;
            }
            // >200ms = alto
            else if (result.PageLatchDeltaMs > 200)
            {
                contentionScore = 15;
            }
            // >50ms = moderado
            else if (result.PageLatchDeltaMs > 50)
            {
                contentionScore = 30;
            }
            // >10ms = leve
            else if (result.PageLatchDeltaMs > 10)
            {
                contentionScore = 35;
            }
        }
        // Fallback: usar % histórico si no hay delta
        else if (result.PageLatchWaitsPct > 10)
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

        // Recursos Score (10%) - incluye version store
        var resourceScore = 10;
        if (result.FreeSpacePct < 10)
        {
            resourceScore = 0;
        }
        else if (result.FreeSpacePct < 20)
        {
            resourceScore = 5;
        }
        
        // Penalizar version store grande
        if (result.VersionStoreMB > 2048) // >2GB
        {
            resourceScore = Math.Max(resourceScore - 3, 0);
        }
        else if (result.VersionStoreMB > 1024) // >1GB
        {
            resourceScore = Math.Max(resourceScore - 1, 0);
        }

        result.ResourceScore = resourceScore;
    }

    protected override int CalculateScore(TempDBMetrics data, List<CollectorThreshold> thresholds)
    {
        // Score compuesto TempDB Health (ajustado para ser más realista):
        // 50% Contención y Latencia (lo más importante - si funciona bien, no penalizar)
        // 30% Configuración (archivos, same size, growth)
        // 20% Recursos (espacio libre, version store)
        
        // ==== 1. CONTENCIÓN + LATENCIA (50 pts) ====
        // Esta es la métrica más importante - si no hay contención ni latencia alta, TempDB está bien
        int performanceScore = 100;
        
        // Contención: usar delta si está disponible (más preciso)
        if (data.PageLatchDeltaMs > 500) // >500ms de contención en 2s = crítico
        {
            performanceScore -= 60;
        }
        else if (data.PageLatchDeltaMs > 100) // >100ms = alto
        {
            performanceScore -= 30;
        }
        else if (data.PageLatchDeltaMs > 20) // >20ms = moderado
        {
            performanceScore -= 10;
        }
        // Si no hay delta, usar % histórico como fallback
        else if (data.PageLatchWaitsPct > 5)
        {
            performanceScore -= 20;
        }
        
        // Latencia de escritura
        if (data.AvgWriteLatencyMs > 50) performanceScore -= 40;
        else if (data.AvgWriteLatencyMs > 20) performanceScore -= 20;
        else if (data.AvgWriteLatencyMs > 10) performanceScore -= 5;
        
        performanceScore = Math.Max(performanceScore, 0);
        var performanceContribution = (int)(performanceScore * 0.50);

        // ==== 2. CONFIGURACIÓN (30 pts) ====
        // Más flexible: múltiples archivos es bueno, pero no penalizar tanto
        int configScore = 100;
        
        // Número de archivos: 4+ es bueno, 2-3 es aceptable, 1 es subóptimo
        // La recomendación oficial es 1 archivo por core hasta 8, pero 4 archivos funciona bien
        if (data.TempDBFileCount >= 4)
        {
            // Óptimo o mejor - 4+ archivos es excelente
        }
        else if (data.TempDBFileCount >= 2)
        {
            // 2-3 archivos: aceptable, pequeña penalización
            configScore -= 10;
        }
        else if (data.TempDBFileCount == 1)
        {
            // 1 archivo: puede causar contención, pero si no hay contención está OK
            // Solo penalizar si realmente hay contención
            if (data.PageLatchDeltaMs > 10 || data.PageLatchWaitsPct > 1)
            {
                configScore -= 30; // Penalizar solo si hay contención
            }
            else
            {
                configScore -= 10; // Penalización menor si funciona bien
            }
        }

        // Archivos del mismo tamaño: importante para round-robin
        if (!data.AllFilesSameSize)
        {
            configScore -= 10;
        }
        
        // Growth en MB vs %: preferencia menor, no penalizar mucho
        if (!data.GrowthInMB)
        {
            configScore -= 5; // Penalización mínima - muchos entornos funcionan bien con %
        }

        configScore = Math.Max(configScore, 0);
        var configContribution = (int)(configScore * 0.30);

        // ==== 3. RECURSOS (20 pts) ====
        int resourceScore = 100;
        
        // Espacio libre
        if (data.FreeSpacePct < 5)
        {
            resourceScore -= 50; // Crítico
        }
        else if (data.FreeSpacePct < 10)
        {
            resourceScore -= 30;
        }
        else if (data.FreeSpacePct < 20)
        {
            resourceScore -= 10;
        }

        // Version store muy grande (puede indicar transacciones largas)
        if (data.VersionStoreMB > 10240) resourceScore -= 30;  // >10GB
        else if (data.VersionStoreMB > 5120) resourceScore -= 15; // >5GB
        else if (data.VersionStoreMB > 2048) resourceScore -= 5;  // >2GB

        resourceScore = Math.Max(resourceScore, 0);
        var resourceContribution = (int)(resourceScore * 0.20);

        // Score final compuesto
        var finalScore = performanceContribution + configContribution + resourceContribution;
        return Math.Clamp(finalScore, 0, 100);
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
            TempDBGrowthConfigOK = data.GrowthInMB,
            // Delta metrics (v3.1)
            TempDBPageLatchDeltaMs = data.PageLatchDeltaMs,
            TempDBPageLatchDeltaCount = data.PageLatchDeltaCount,
            // Version Store (v3.1)
            TempDBVersionStoreMB = data.VersionStoreMB,
            TempDBUserObjectsMB = data.UserObjectsMB,
            TempDBInternalObjectsMB = data.InternalObjectsMB,
            TempDBActiveVersionStoreTx = data.ActiveVersionStoreTransactions
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthConfiguracionTempdb.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
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

-- =====================================================
-- CONTENCIÓN CON MÉTODO DELTA (2 segundos)
-- Mide contención ACTUAL, no histórica acumulada
-- =====================================================

-- Snapshot 1
SELECT 
    wait_type,
    waiting_tasks_count,
    wait_time_ms
INTO #tempdb_waits1
FROM sys.dm_os_wait_stats WITH (NOLOCK)
WHERE wait_type IN ('PAGELATCH_UP', 'PAGELATCH_EX', 'PAGELATCH_SH');

-- Esperar 2 segundos
WAITFOR DELAY '00:00:02';

-- Snapshot 2 con delta
SELECT 
    ISNULL(SUM(ws.waiting_tasks_count - ISNULL(t1.waiting_tasks_count, 0)), 0) AS DeltaWaitCount,
    ISNULL(SUM(ws.wait_time_ms - ISNULL(t1.wait_time_ms, 0)), 0) AS DeltaWaitMs
FROM sys.dm_os_wait_stats ws WITH (NOLOCK)
LEFT JOIN #tempdb_waits1 t1 ON ws.wait_type = t1.wait_type
WHERE ws.wait_type IN ('PAGELATCH_UP', 'PAGELATCH_EX', 'PAGELATCH_SH');

-- Porcentaje histórico (para referencia/backwards compatibility)
SELECT 
    CAST(
        SUM(CASE WHEN wait_type LIKE 'PAGELATCH%' THEN wait_time_ms ELSE 0 END) * 100.0 /
        NULLIF(SUM(wait_time_ms), 0)
    AS DECIMAL(5,2)) AS PageLatchPct
FROM sys.dm_os_wait_stats WITH (NOLOCK)
WHERE wait_type NOT IN ('CLR_SEMAPHORE','LAZYWRITER_SLEEP','RESOURCE_QUEUE','SQLTRACE_BUFFER_FLUSH',
                         'SLEEP_TASK','SLEEP_SYSTEMTASK','WAITFOR','HADR_FILESTREAM_IOMGR_IOCOMPLETION',
                         'CHECKPOINT_QUEUE','XE_TIMER_EVENT','XE_DISPATCHER_WAIT','BROKER_TASK_STOP',
                         'CLR_AUTO_EVENT','BROKER_EVENTHANDLER','DIRTY_PAGE_POLL','SP_SERVER_DIAGNOSTICS_SLEEP');

DROP TABLE #tempdb_waits1;

-- TempDB I/O latency
SELECT 
    CASE 
        WHEN SUM(num_of_writes) > 0 
        THEN CAST(SUM(io_stall_write_ms) * 1.0 / SUM(num_of_writes) AS DECIMAL(18,2))
        ELSE 0 
    END AS AvgWriteLatency
FROM sys.dm_io_virtual_file_stats(2, NULL); -- database_id = 2 is tempdb

-- Version Store Metrics
SELECT 
    ISNULL(SUM(version_store_reserved_page_count) * 8 / 1024, 0) AS VersionStoreMB,
    ISNULL(SUM(user_object_reserved_page_count) * 8 / 1024, 0) AS UserObjectsMB,
    ISNULL(SUM(internal_object_reserved_page_count) * 8 / 1024, 0) AS InternalObjectsMB
FROM sys.dm_db_file_space_usage WITH (NOLOCK);

-- Active Version Store Transactions
SELECT COUNT(*) AS ActiveVersionStoreTransactions
FROM sys.dm_tran_active_snapshot_database_transactions WITH (NOLOCK);";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(TempDBMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["FileCount"] = data.TempDBFileCount,
            ["CPUCount"] = data.LogicalCPUCount,
            ["ContentionPct"] = data.PageLatchWaitsPct,
            ["ContentionDeltaMs"] = data.PageLatchDeltaMs,
            ["WriteLatency"] = data.AvgWriteLatencyMs,
            ["VersionStoreMB"] = data.VersionStoreMB,
            ["ActiveVSTx"] = data.ActiveVersionStoreTransactions
        };
    }

    public class TempDBMetrics
    {
        // Configuración
        public int TempDBFileCount { get; set; }
        public bool AllFilesSameSize { get; set; } = true;
        public bool AllFilesSameGrowth { get; set; } = true;
        public bool GrowthInMB { get; set; }
        public int LogicalCPUCount { get; set; }
        
        // Contención (v3.1 - método delta)
        public decimal PageLatchWaitsPct { get; set; }
        public long PageLatchDeltaMs { get; set; }      // Tiempo de contención en 2 segundos (delta)
        public int PageLatchDeltaCount { get; set; }   // Eventos de contención en 2 segundos (delta)
        
        // Latencia
        public decimal AvgWriteLatencyMs { get; set; }
        public decimal AvgReadLatencyMs { get; set; }
        
        // Espacio
        public decimal FreeSpacePct { get; set; } = 100m;
        public int TotalSizeMB { get; set; }
        public int UsedSpaceMB { get; set; }
        
        // Version Store (v3.1)
        public int VersionStoreMB { get; set; }
        public int UserObjectsMB { get; set; }
        public int InternalObjectsMB { get; set; }
        public int ActiveVersionStoreTransactions { get; set; }
        
        // Scores parciales
        public int ContentionScore { get; set; }
        public int LatencyScore { get; set; }
        public int ConfigurationScore { get; set; }
        public int ResourceScore { get; set; }
        public string MountPoint { get; set; } = "";
    }
}

