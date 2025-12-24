using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de I/O
/// Métricas: Latencia Read/Write, IOPS, IO por volumen
/// Método: Snapshot Delta (2 segundos)
/// Peso: 10%
/// </summary>
public class IOCollector : CollectorBase<IOCollector.IOMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "IO";
    public override string DisplayName => "IO";

    public IOCollector(
        ILogger<IOCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<IOMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new IOMetrics();

        try
        {
            // La query incluye WAITFOR DELAY de 2 segundos para snapshot delta
            var dataTable = await ExecuteQueryAsync(instance.InstanceName, query, timeoutSeconds + 5, ct);

            if (dataTable.Rows.Count == 0)
                return result;

            ProcessIOResults(dataTable, result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting IO metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessIOResults(DataTable table, IOMetrics result)
    {
        var allReads = new List<(decimal stall, int ops, decimal latency)>();
        var allWrites = new List<(decimal stall, int ops, decimal latency)>();
        var dataReads = new List<(decimal stall, int ops)>();
        var dataWrites = new List<(decimal stall, int ops)>();
        var logWrites = new List<(decimal stall, int ops)>();
        var volumeMetrics = new Dictionary<string, VolumeIOMetrics>();

        foreach (DataRow row in table.Rows)
        {
            var fileType = GetString(row, "FileType") ?? "";
            var physicalName = GetString(row, "PhysicalName") ?? "";
            var deltaReads = GetInt(row, "DeltaReads");
            var deltaWrites = GetInt(row, "DeltaWrites");
            var readStallMs = GetDecimal(row, "TotalReadStallMs");
            var writeStallMs = GetDecimal(row, "TotalWriteStallMs");
            var readLatency = GetDecimal(row, "AvgReadLatencyMs");
            var writeLatency = GetDecimal(row, "AvgWriteLatencyMs");
            var readIOPS = GetDecimal(row, "ReadIOPS");
            var writeIOPS = GetDecimal(row, "WriteIOPS");

            // Acumular para reads
            if (deltaReads > 0)
            {
                allReads.Add((readStallMs, deltaReads, readLatency));
                if (fileType == "ROWS")
                    dataReads.Add((readStallMs, deltaReads));
            }

            // Acumular para writes
            if (deltaWrites > 0)
            {
                allWrites.Add((writeStallMs, deltaWrites, writeLatency));
                if (fileType == "ROWS")
                    dataWrites.Add((writeStallMs, deltaWrites));
                else if (fileType == "LOG")
                    logWrites.Add((writeStallMs, deltaWrites));
            }

            // Agrupar por volumen
            if (physicalName.Length >= 2 && physicalName[1] == ':')
            {
                var volume = physicalName.Substring(0, 2);
                if (!volumeMetrics.ContainsKey(volume))
                {
                    volumeMetrics[volume] = new VolumeIOMetrics { MountPoint = volume };
                }

                var vol = volumeMetrics[volume];
                vol.TotalReadStallMs += readStallMs;
                vol.TotalWriteStallMs += writeStallMs;
                vol.TotalDeltaReads += deltaReads;
                vol.TotalDeltaWrites += deltaWrites;
                vol.TotalReadIOPS += readIOPS;
                vol.TotalWriteIOPS += writeIOPS;
                vol.MaxReadLatency = Math.Max(vol.MaxReadLatency, readLatency);
                vol.MaxWriteLatency = Math.Max(vol.MaxWriteLatency, writeLatency);
            }

            result.TotalIOPS += readIOPS + writeIOPS;
            result.ReadIOPS += readIOPS;
            result.WriteIOPS += writeIOPS;
        }

        // Calcular promedios ponderados
        if (allReads.Count > 0)
        {
            var totalStall = allReads.Sum(x => x.stall);
            var totalOps = allReads.Sum(x => x.ops);
            result.AvgReadLatencyMs = totalOps > 0 ? totalStall / totalOps : 0;
            result.MaxReadLatencyMs = allReads.Max(x => x.latency);
        }

        if (allWrites.Count > 0)
        {
            var totalStall = allWrites.Sum(x => x.stall);
            var totalOps = allWrites.Sum(x => x.ops);
            result.AvgWriteLatencyMs = totalOps > 0 ? totalStall / totalOps : 0;
            result.MaxWriteLatencyMs = allWrites.Max(x => x.latency);
        }

        // Data files
        if (dataReads.Count > 0)
        {
            var totalStall = dataReads.Sum(x => x.stall);
            var totalOps = dataReads.Sum(x => x.ops);
            result.DataFileAvgReadMs = totalOps > 0 ? totalStall / totalOps : 0;
        }

        if (dataWrites.Count > 0)
        {
            var totalStall = dataWrites.Sum(x => x.stall);
            var totalOps = dataWrites.Sum(x => x.ops);
            result.DataFileAvgWriteMs = totalOps > 0 ? totalStall / totalOps : 0;
        }

        // Log files
        if (logWrites.Count > 0)
        {
            var totalStall = logWrites.Sum(x => x.stall);
            var totalOps = logWrites.Sum(x => x.ops);
            result.LogFileAvgWriteMs = totalOps > 0 ? totalStall / totalOps : 0;
        }

        // Convertir métricas por volumen
        result.IOByVolume = volumeMetrics.Values
            .OrderBy(v => v.MountPoint)
            .Select(v => new VolumeIOResult
            {
                MountPoint = v.MountPoint,
                AvgReadLatencyMs = v.TotalDeltaReads > 0 ? Math.Round(v.TotalReadStallMs / v.TotalDeltaReads, 2) : 0,
                AvgWriteLatencyMs = v.TotalDeltaWrites > 0 ? Math.Round(v.TotalWriteStallMs / v.TotalDeltaWrites, 2) : 0,
                MaxReadLatencyMs = Math.Round(v.MaxReadLatency, 2),
                MaxWriteLatencyMs = Math.Round(v.MaxWriteLatency, 2),
                ReadIOPS = Math.Round(v.TotalReadIOPS, 2),
                WriteIOPS = Math.Round(v.TotalWriteIOPS, 2),
                TotalIOPS = Math.Round(v.TotalReadIOPS + v.TotalWriteIOPS, 2)
            })
            .ToList();
    }

    protected override int CalculateScore(IOMetrics data, List<CollectorThreshold> thresholds)
    {
        // Calcular latencia promedio ponderada
        var avgLatency = (data.DataFileAvgReadMs + data.DataFileAvgWriteMs + data.LogFileAvgWriteMs) / 3;

        // Evaluar latencia general
        var score = EvaluateThresholds(avgLatency, thresholds, "Latency");

        // Aplicar cap por latencia de log
        score = ApplyCaps(score, data.LogFileAvgWriteMs, thresholds, "Caps");

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, IOMetrics data, int score, CancellationToken ct)
    {
        var ioByVolumeJson = data.IOByVolume.Count > 0 
            ? JsonSerializer.Serialize(data.IOByVolume) 
            : null;

        var entity = new InstanceHealthIO
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            AvgReadLatencyMs = data.AvgReadLatencyMs,
            AvgWriteLatencyMs = data.AvgWriteLatencyMs,
            MaxReadLatencyMs = data.MaxReadLatencyMs,
            MaxWriteLatencyMs = data.MaxWriteLatencyMs,
            DataFileAvgReadMs = data.DataFileAvgReadMs,
            DataFileAvgWriteMs = data.DataFileAvgWriteMs,
            LogFileAvgWriteMs = data.LogFileAvgWriteMs,
            TotalIOPS = (int)Math.Min(data.TotalIOPS, int.MaxValue),
            ReadIOPS = (int)Math.Min(data.ReadIOPS, int.MaxValue),
            WriteIOPS = (int)Math.Min(data.WriteIOPS, int.MaxValue),
            IODetails = ioByVolumeJson
        };

        _context.InstanceHealthIO.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return @"
-- SNAPSHOT DELTA: Mide latencia ACTUAL (no histórica)
-- Toma 2 snapshots con 2 segundos de diferencia

-- Snapshot inicial
SELECT 
    vfs.database_id,
    vfs.file_id,
    vfs.num_of_reads,
    vfs.num_of_writes,
    vfs.io_stall_read_ms,
    vfs.io_stall_write_ms
INTO #snapshot1
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs;

-- Esperar 2 segundos para capturar actividad
WAITFOR DELAY '00:00:02';

-- Snapshot final y cálculo de delta
SELECT 
    DB_NAME(vfs.database_id) AS DatabaseName,
    mf.type_desc AS FileType,
    mf.physical_name AS PhysicalName,
    vfs.num_of_reads AS NumReads,
    vfs.num_of_writes AS NumWrites,
    (vfs.num_of_reads - ISNULL(s1.num_of_reads, 0)) AS DeltaReads,
    (vfs.num_of_writes - ISNULL(s1.num_of_writes, 0)) AS DeltaWrites,
    CASE 
        WHEN (vfs.num_of_reads - ISNULL(s1.num_of_reads, 0)) > 0 
        THEN CAST((vfs.io_stall_read_ms - ISNULL(s1.io_stall_read_ms, 0)) * 1.0 / 
             (vfs.num_of_reads - s1.num_of_reads) AS DECIMAL(18,2))
        ELSE 0 
    END AS AvgReadLatencyMs,
    CASE 
        WHEN (vfs.num_of_writes - ISNULL(s1.num_of_writes, 0)) > 0 
        THEN CAST((vfs.io_stall_write_ms - ISNULL(s1.io_stall_write_ms, 0)) * 1.0 / 
             (vfs.num_of_writes - s1.num_of_writes) AS DECIMAL(18,2))
        ELSE 0 
    END AS AvgWriteLatencyMs,
    (vfs.io_stall_read_ms - ISNULL(s1.io_stall_read_ms, 0)) AS TotalReadStallMs,
    (vfs.io_stall_write_ms - ISNULL(s1.io_stall_write_ms, 0)) AS TotalWriteStallMs,
    CAST((vfs.num_of_reads - ISNULL(s1.num_of_reads, 0)) / 2.0 AS DECIMAL(18,2)) AS ReadIOPS,
    CAST((vfs.num_of_writes - ISNULL(s1.num_of_writes, 0)) / 2.0 AS DECIMAL(18,2)) AS WriteIOPS,
    2 AS SampleSeconds
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
INNER JOIN sys.master_files mf 
    ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
LEFT JOIN #snapshot1 s1 
    ON vfs.database_id = s1.database_id AND vfs.file_id = s1.file_id
WHERE (vfs.num_of_reads - ISNULL(s1.num_of_reads, 0)) > 0 
   OR (vfs.num_of_writes - ISNULL(s1.num_of_writes, 0)) > 0
ORDER BY AvgReadLatencyMs DESC, AvgWriteLatencyMs DESC;

DROP TABLE #snapshot1;";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(IOMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["AvgReadLatency"] = data.AvgReadLatencyMs,
            ["AvgWriteLatency"] = data.AvgWriteLatencyMs,
            ["LogLatency"] = data.LogFileAvgWriteMs,
            ["TotalIOPS"] = data.TotalIOPS
        };
    }

    public class IOMetrics
    {
        public decimal AvgReadLatencyMs { get; set; }
        public decimal AvgWriteLatencyMs { get; set; }
        public decimal MaxReadLatencyMs { get; set; }
        public decimal MaxWriteLatencyMs { get; set; }
        public decimal DataFileAvgReadMs { get; set; }
        public decimal DataFileAvgWriteMs { get; set; }
        public decimal LogFileAvgWriteMs { get; set; }
        public decimal TotalIOPS { get; set; }
        public decimal ReadIOPS { get; set; }
        public decimal WriteIOPS { get; set; }
        public List<VolumeIOResult> IOByVolume { get; set; } = new();
    }

    public class VolumeIOResult
    {
        public string MountPoint { get; set; } = "";
        public decimal AvgReadLatencyMs { get; set; }
        public decimal AvgWriteLatencyMs { get; set; }
        public decimal MaxReadLatencyMs { get; set; }
        public decimal MaxWriteLatencyMs { get; set; }
        public decimal ReadIOPS { get; set; }
        public decimal WriteIOPS { get; set; }
        public decimal TotalIOPS { get; set; }
    }

    private class VolumeIOMetrics
    {
        public string MountPoint { get; set; } = "";
        public decimal TotalReadStallMs { get; set; }
        public decimal TotalWriteStallMs { get; set; }
        public int TotalDeltaReads { get; set; }
        public int TotalDeltaWrites { get; set; }
        public decimal TotalReadIOPS { get; set; }
        public decimal TotalWriteIOPS { get; set; }
        public decimal MaxReadLatency { get; set; }
        public decimal MaxWriteLatency { get; set; }
    }
}

