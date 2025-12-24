using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Discos
/// Métricas: Espacio libre por volumen, espacio real (disco + interno)
/// Peso: 7%
/// </summary>
public class DiscosCollector : CollectorBase<DiscosCollector.DiscosMetrics>
{
    private readonly ApplicationDbContext _context;

    public override string CollectorName => "Discos";
    public override string DisplayName => "Discos";

    public DiscosCollector(
        ILogger<DiscosCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        ApplicationDbContext context) 
        : base(logger, configService, connectionFactory, instanceProvider)
    {
        _context = context;
    }

    protected override async Task<DiscosMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new DiscosMetrics();

        try
        {
            var dataSet = await ExecuteQueryMultiResultAsync(instance.InstanceName, query, timeoutSeconds, ct);

            // ResultSet 1: Volume stats
            if (dataSet.Tables.Count >= 1)
            {
                ProcessVolumeStats(dataSet.Tables[0], result);
            }

            // ResultSet 2: File growth info (para calcular espacio real)
            if (dataSet.Tables.Count >= 2)
            {
                ProcessFileGrowthInfo(dataSet.Tables[1], result);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting disk metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessVolumeStats(DataTable table, DiscosMetrics result)
    {
        foreach (DataRow row in table.Rows)
        {
            var volume = new VolumeInfo
            {
                MountPoint = GetString(row, "MountPoint") ?? "",
                TotalGB = GetDecimal(row, "TotalGB"),
                FreeGB = GetDecimal(row, "FreeGB"),
                FreePct = GetDecimal(row, "FreePct"),
                MediaType = GetString(row, "MediaType"),
                HealthStatus = GetString(row, "HealthStatus")
            };

            result.Volumes.Add(volume);

            // Track worst free pct
            if (volume.FreePct < result.WorstFreePct)
            {
                result.WorstFreePct = volume.FreePct;
            }
        }
    }

    private void ProcessFileGrowthInfo(DataTable table, DiscosMetrics result)
    {
        // Agrupar info de archivos por volumen
        var volumeFileInfo = new Dictionary<string, (int filesWithGrowth, decimal freeSpaceInGrowable)>();

        foreach (DataRow row in table.Rows)
        {
            var volume = GetString(row, "MountPoint") ?? "";
            var hasGrowth = GetBool(row, "HasGrowth");
            var freeSpaceMB = GetDecimal(row, "FreeSpaceInFileMB");

            if (!volumeFileInfo.ContainsKey(volume))
            {
                volumeFileInfo[volume] = (0, 0);
            }

            var current = volumeFileInfo[volume];
            if (hasGrowth)
            {
                volumeFileInfo[volume] = (current.filesWithGrowth + 1, current.freeSpaceInGrowable + freeSpaceMB);
            }
        }

        // Actualizar volúmenes con info de archivos
        foreach (var vol in result.Volumes)
        {
            if (volumeFileInfo.TryGetValue(vol.MountPoint, out var fileInfo))
            {
                vol.FilesWithGrowth = fileInfo.filesWithGrowth;
                vol.FreeSpaceInGrowableFilesMB = fileInfo.freeSpaceInGrowable;

                // Calcular espacio real libre
                if (vol.TotalGB > 0)
                {
                    var freeSpaceInGrowableGB = fileInfo.freeSpaceInGrowable / 1024m;
                    var realFreeGB = vol.FreeGB + freeSpaceInGrowableGB;
                    vol.RealFreePct = (realFreeGB / vol.TotalGB) * 100m;
                }

                // Determinar si debe alertar
                vol.IsAlerted = vol.FilesWithGrowth > 0 && vol.RealFreePct <= 10;
            }
        }

        // Categorizar volúmenes por tipo de archivos
        foreach (DataRow row in table.Rows)
        {
            var volume = GetString(row, "MountPoint") ?? "";
            var fileType = GetString(row, "FileType") ?? "";

            var vol = result.Volumes.FirstOrDefault(v => v.MountPoint == volume);
            if (vol != null)
            {
                if (fileType == "ROWS")
                    vol.HasDataFiles = true;
                else if (fileType == "LOG")
                    vol.HasLogFiles = true;
            }
        }

        // Calcular promedios para Data y Log disks
        var dataDisks = result.Volumes.Where(v => v.HasDataFiles).ToList();
        var logDisks = result.Volumes.Where(v => v.HasLogFiles).ToList();

        if (dataDisks.Count > 0)
            result.DataDiskAvgFreePct = dataDisks.Average(v => v.FreePct);

        if (logDisks.Count > 0)
            result.LogDiskAvgFreePct = logDisks.Average(v => v.FreePct);

        // Recalcular worst free pct considerando espacio real
        var worstRealPct = result.Volumes
            .Where(v => v.RealFreePct.HasValue)
            .Select(v => v.RealFreePct!.Value)
            .DefaultIfEmpty(100m)
            .Min();

        result.WorstRealFreePct = worstRealPct;
    }

    protected override int CalculateScore(DiscosMetrics data, List<CollectorThreshold> thresholds)
    {
        // Usar el peor espacio real libre
        var worstFreePct = data.WorstRealFreePct ?? data.WorstFreePct;

        var score = EvaluateThresholds(worstFreePct, thresholds, "FreeSpace");

        // Ajuste inteligente: si hay volúmenes alertados (riesgo real)
        var alertedVolumes = data.Volumes.Where(v => v.IsAlerted).ToList();
        if (alertedVolumes.Count > 0)
        {
            var worstAlertedPct = alertedVolumes.Min(v => v.RealFreePct ?? 100);
            if (worstAlertedPct <= 5)
            {
                score = 0;
            }
            else if (worstAlertedPct <= 10)
            {
                score = Math.Min(score, 30);
            }
        }
        // Si el disco está bajo pero no hay archivos con growth, menos riesgo
        else if (data.WorstFreePct < 10)
        {
            var hasAnyGrowthFiles = data.Volumes.Any(v => v.FilesWithGrowth > 0);
            if (!hasAnyGrowthFiles)
            {
                score = Math.Min(100, score + 20);
            }
            else if (data.WorstRealFreePct.HasValue && data.WorstRealFreePct >= 15)
            {
                score = Math.Min(100, score + 10);
            }
        }

        return Math.Clamp(score, 0, 100);
    }

    protected override async Task SaveResultAsync(SqlInstanceInfo instance, DiscosMetrics data, int score, CancellationToken ct)
    {
        var volumesJson = data.Volumes.Count > 0 
            ? JsonSerializer.Serialize(data.Volumes) 
            : null;

        var entity = new InstanceHealthDiscos
        {
            InstanceName = instance.InstanceName,
            Ambiente = instance.Ambiente,
            HostingSite = instance.HostingSite,
            SqlVersion = instance.SqlVersionString,
            CollectedAtUtc = DateTime.Now,
            WorstFreePct = data.WorstFreePct,
            DataDiskAvgFreePct = data.DataDiskAvgFreePct,
            LogDiskAvgFreePct = data.LogDiskAvgFreePct,
            VolumesJson = volumesJson
        };

        _context.InstanceHealthDiscos.Add(entity);
        await _context.SaveChangesAsync(ct);
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        // SQL 2008 R2 y anteriores no tienen sys.dm_os_volume_stats
        if (sqlMajorVersion < 11)
        {
            return @"
-- Fallback para SQL 2008 y anteriores: solo info básica de archivos
SELECT DISTINCT
    LEFT(mf.physical_name, 2) AS MountPoint,
    CAST(100.0 AS DECIMAL(18,2)) AS TotalGB,
    CAST(50.0 AS DECIMAL(18,2)) AS FreeGB,
    CAST(50.0 AS DECIMAL(18,2)) AS FreePct,
    'Unknown' AS MediaType,
    'Healthy' AS HealthStatus
FROM sys.master_files mf;

-- Info de archivos con growth
SELECT 
    LEFT(mf.physical_name, 2) AS MountPoint,
    mf.type_desc AS FileType,
    CASE WHEN mf.growth > 0 THEN 1 ELSE 0 END AS HasGrowth,
    CAST((mf.max_size - mf.size) * 8.0 / 1024 AS DECIMAL(18,2)) AS FreeSpaceInFileMB
FROM sys.master_files mf
WHERE mf.type IN (0, 1);";
        }

        return @"
-- Volume stats (SQL 2012+)
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    CAST(vs.total_bytes / 1024.0 / 1024 / 1024 AS DECIMAL(18,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024 / 1024 AS DECIMAL(18,2)) AS FreeGB,
    CAST(vs.available_bytes * 100.0 / NULLIF(vs.total_bytes, 0) AS DECIMAL(18,2)) AS FreePct,
    vs.logical_volume_name AS VolumeLabel,
    'Unknown' AS MediaType,
    'Healthy' AS HealthStatus
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs;

-- Info de archivos con growth
SELECT 
    vs.volume_mount_point AS MountPoint,
    mf.type_desc AS FileType,
    CASE WHEN mf.growth > 0 THEN 1 ELSE 0 END AS HasGrowth,
    CASE 
        WHEN mf.max_size = -1 THEN 0
        WHEN mf.max_size = 0 THEN 0
        ELSE CAST((mf.max_size - mf.size) * 8.0 / 1024 AS DECIMAL(18,2))
    END AS FreeSpaceInFileMB
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
WHERE mf.type IN (0, 1);";
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(DiscosMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["WorstFreePct"] = data.WorstFreePct,
            ["WorstRealFreePct"] = data.WorstRealFreePct,
            ["VolumeCount"] = data.Volumes.Count,
            ["AlertedVolumes"] = data.Volumes.Count(v => v.IsAlerted)
        };
    }

    public class DiscosMetrics
    {
        public decimal WorstFreePct { get; set; } = 100m;
        public decimal? WorstRealFreePct { get; set; }
        public decimal DataDiskAvgFreePct { get; set; } = 100m;
        public decimal LogDiskAvgFreePct { get; set; } = 100m;
        public List<VolumeInfo> Volumes { get; set; } = new();
    }

    public class VolumeInfo
    {
        public string MountPoint { get; set; } = "";
        public decimal TotalGB { get; set; }
        public decimal FreeGB { get; set; }
        public decimal FreePct { get; set; }
        public decimal? RealFreePct { get; set; }
        public string? MediaType { get; set; }
        public string? HealthStatus { get; set; }
        public int FilesWithGrowth { get; set; }
        public decimal FreeSpaceInGrowableFilesMB { get; set; }
        public bool IsAlerted { get; set; }
        public bool HasDataFiles { get; set; }
        public bool HasLogFiles { get; set; }
    }
}

