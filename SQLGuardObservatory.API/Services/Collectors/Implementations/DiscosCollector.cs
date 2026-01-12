using Microsoft.Extensions.DependencyInjection;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using System.Data;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SQLGuardObservatory.API.Services.Collectors.Implementations;

/// <summary>
/// Collector de métricas de Discos
/// Replica exactamente la lógica de RelevamientoHealthScore_Discos.ps1 v3.3
/// 
/// Características:
/// - Espacio Libre REAL: Considera espacio en disco + espacio interno en archivos con growth
/// - RealFreePct = (FreeGB + FreeSpaceInGrowableFilesGB) / TotalGB * 100
/// - IsAlerted = true SOLO si FilesWithGrowth > 0 AND RealFreePct <= 10%
/// - DWH Hardcoded: Servidores DWH siempre asumen growth habilitado
/// - SQL 2005/2008 fallback: Usa xp_fixeddrives cuando sys.dm_os_volume_stats no existe
/// - Análisis de archivos: Usa FILEPROPERTY para calcular espacio interno
/// - Normalización de mount points: E:\DWM\DWM4\ -> E:\
/// 
/// Peso: 7%
/// </summary>
public class DiscosCollector : CollectorBase<DiscosCollector.DiscosMetrics>
{
    public override string CollectorName => "Discos";
    public override string DisplayName => "Discos";

    public DiscosCollector(
        ILogger<DiscosCollector> logger,
        ICollectorConfigService configService,
        ISqlConnectionFactory connectionFactory,
        IInstanceProvider instanceProvider,
        IServiceScopeFactory scopeFactory) 
        : base(logger, configService, connectionFactory, instanceProvider, scopeFactory)
    {
    }

    protected override async Task<DiscosMetrics> CollectFromInstanceAsync(
        SqlInstanceInfo instance,
        int timeoutSeconds,
        string query,
        CancellationToken ct)
    {
        var result = new DiscosMetrics();
        var isDWH = instance.InstanceName.Contains("DWH", StringComparison.OrdinalIgnoreCase);

        try
        {
            // Detectar si tiene sys.dm_os_volume_stats
            // SQL 2005 (9.x) = No tiene
            // SQL 2008 RTM (10.0.x) = Puede no tener
            // SQL 2008 R2+ (10.50.x+) = Sí tiene sys.dm_os_volume_stats
            // Sin SqlMinorVersion disponible, usamos solo MajorVersion >= 11
            bool hasVolumeStats = instance.SqlMajorVersion >= 11;

            DataTable? spaceData = null;
            DataTable? fileAnalysisData = null;
            DataTable? rolesData = null;

            if (hasVolumeStats)
            {
                // SQL 2008 R2+ con sys.dm_os_volume_stats
                try
                {
                    spaceData = await ExecuteQueryAsync(instance.InstanceName, GetVolumeStatsQuery(), timeoutSeconds, ct);
                }
                catch (Exception ex) when (ex.Message.Contains("dm_os_volume_stats"))
                {
                    // Fallback si falla por dm_os_volume_stats
                    hasVolumeStats = false;
                    _logger.LogInformation("{Instance}: sys.dm_os_volume_stats no disponible, usando fallback", 
                        instance.InstanceName);
                }
            }

            if (!hasVolumeStats)
            {
                // SQL 2005/2008 RTM: Usar xp_fixeddrives
                spaceData = await ExecuteQueryAsync(instance.InstanceName, GetXpFixedDrivesQuery(), timeoutSeconds, ct);
            }

            // Análisis de archivos (espacio interno) - solo si tiene dm_os_volume_stats o es SQL 2008+
            if (instance.SqlMajorVersion >= 10)
            {
                try
                {
                    fileAnalysisData = await ExecuteQueryAsync(instance.InstanceName, 
                        GetFileAnalysisQuery(), timeoutSeconds + 10, ct);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "{Instance}: Error en análisis de archivos", instance.InstanceName);
                    result.FileAnalysisQueryFailed = true;
                }
            }

            // Detectar roles de volúmenes
            if (hasVolumeStats)
            {
                try
                {
                    rolesData = await ExecuteQueryAsync(instance.InstanceName, GetRolesQuery(), 5, ct);
                }
                catch { /* Ignorar errores de roles */ }
            }
            else
            {
                // SQL 2005: usar sysaltfiles para roles
                try
                {
                    rolesData = await ExecuteQueryAsync(instance.InstanceName, GetSysaltfilesRolesQuery(), 5, ct);
                }
                catch { /* Ignorar errores */ }
            }

            // Procesar datos de espacio
            if (spaceData != null && spaceData.Rows.Count > 0)
            {
                ProcessSpaceData(spaceData, result, isDWH, hasVolumeStats);
            }

            // Procesar análisis de archivos
            if (fileAnalysisData != null && fileAnalysisData.Rows.Count > 0)
            {
                ProcessFileAnalysis(fileAnalysisData, result, isDWH);
            }

            // Procesar roles
            if (rolesData != null && rolesData.Rows.Count > 0)
            {
                ProcessRoles(rolesData, result, hasVolumeStats);
            }

            // Calcular métricas finales
            CalculateFinalMetrics(result);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error collecting disk metrics from {Instance}", instance.InstanceName);
        }

        return result;
    }

    private void ProcessSpaceData(DataTable table, DiscosMetrics result, bool isDWH, bool hasVolumeStats)
    {
        var volumesByDrive = new Dictionary<string, VolumeInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (DataRow row in table.Rows)
        {
            string mountPoint;
            decimal totalGB, freeGB, freePct;

            if (hasVolumeStats)
            {
                mountPoint = GetString(row, "MountPoint") ?? "";
                totalGB = GetDecimal(row, "TotalGB");
                freeGB = GetDecimal(row, "FreeGB");
                freePct = GetDecimal(row, "FreePct");
            }
            else
            {
                // xp_fixeddrives format
                var driveLetter = GetString(row, "DriveLetter") ?? GetString(row, "Drive") ?? "";
                mountPoint = $"{driveLetter}:\\";
                var mbFree = GetDecimal(row, "MBFree");
                freeGB = mbFree / 1024m;
                // xp_fixeddrives no da tamaño total - se estima conservadoramente
                totalGB = freeGB * 5; // Asumir 20% libre como estimación
                freePct = totalGB > 0 ? (freeGB / totalGB) * 100 : 20;
            }

            // Normalizar mount point a letra de unidad
            var normalizedDrive = NormalizeDriveLetter(mountPoint);
            if (string.IsNullOrEmpty(normalizedDrive))
                continue;

            // Agrupar por letra de unidad (combinar mount points)
            if (!volumesByDrive.ContainsKey(normalizedDrive))
            {
                volumesByDrive[normalizedDrive] = new VolumeInfo
                {
                    MountPoint = normalizedDrive,
                    TotalGB = 0,
                    FreeGB = 0
                };
            }

            var vol = volumesByDrive[normalizedDrive];
            vol.TotalGB += totalGB;
            vol.FreeGB += freeGB;
            vol.OriginalMountPoints.Add(mountPoint);
        }

        // Calcular FreePct para volúmenes combinados
        foreach (var vol in volumesByDrive.Values)
        {
            vol.FreePct = vol.TotalGB > 0 ? (vol.FreeGB / vol.TotalGB) * 100m : 100m;
            result.Volumes.Add(vol);
        }
    }

    private void ProcessFileAnalysis(DataTable table, DiscosMetrics result, bool isDWH)
    {
        var fileAnalysisByDrive = new Dictionary<string, FileAnalysisInfo>(StringComparer.OrdinalIgnoreCase);

        foreach (DataRow row in table.Rows)
        {
            var driveLetter = GetString(row, "DriveLetter")?.Trim() ?? "";
            if (string.IsNullOrEmpty(driveLetter))
                continue;

            // Normalizar a formato "E:\"
            var normalizedDrive = NormalizeDriveLetter(driveLetter);
            if (string.IsNullOrEmpty(normalizedDrive))
                normalizedDrive = $"{driveLetter}:\\";

            if (!fileAnalysisByDrive.ContainsKey(normalizedDrive))
            {
                fileAnalysisByDrive[normalizedDrive] = new FileAnalysisInfo();
            }

            var info = fileAnalysisByDrive[normalizedDrive];
            info.TotalFiles += GetInt(row, "TotalFiles");
            info.FilesWithoutGrowth += GetInt(row, "FilesWithoutGrowth");
            info.FilesWithGrowth += GetInt(row, "FilesWithGrowth");
            info.TotalFreeSpaceInFilesMB += GetDecimal(row, "TotalFreeSpaceInFilesMB");
            info.FreeSpaceInGrowableFilesMB += GetDecimal(row, "FreeSpaceInGrowableFilesMB");
            info.ProblematicFiles += GetInt(row, "ProblematicFiles");
        }

        // Aplicar análisis de archivos a volúmenes
        foreach (var vol in result.Volumes)
        {
            var driveLetter = vol.MountPoint.Substring(0, Math.Min(2, vol.MountPoint.Length));
            var normalizedDrive = NormalizeDriveLetter(vol.MountPoint);

            FileAnalysisInfo? fileInfo = null;
            if (fileAnalysisByDrive.TryGetValue(normalizedDrive, out var info1))
                fileInfo = info1;
            else if (fileAnalysisByDrive.TryGetValue(driveLetter, out var info2))
                fileInfo = info2;
            else if (fileAnalysisByDrive.TryGetValue($"{driveLetter}:", out var info3))
                fileInfo = info3;

            if (fileInfo != null)
            {
                vol.TotalFiles = fileInfo.TotalFiles;
                vol.FilesWithoutGrowth = fileInfo.FilesWithoutGrowth;
                vol.FilesWithGrowth = fileInfo.FilesWithGrowth;
                vol.TotalFreeSpaceInFilesMB = fileInfo.TotalFreeSpaceInFilesMB;
                vol.FreeSpaceInGrowableFilesMB = fileInfo.FreeSpaceInGrowableFilesMB;
                vol.ProblematicFiles = fileInfo.ProblematicFiles;
            }

            // Calcular ESPACIO LIBRE REAL (v3.3)
            // RealFreePct = (FreeGB + FreeSpaceInGrowableFilesGB) / TotalGB * 100
            var freeSpaceInGrowableFilesGB = vol.FreeSpaceInGrowableFilesMB / 1024m;
            vol.FreeSpaceInGrowableFilesGB = Math.Round(freeSpaceInGrowableFilesGB, 2);
            vol.RealFreeGB = Math.Round(vol.FreeGB + freeSpaceInGrowableFilesGB, 2);
            vol.RealFreePct = vol.TotalGB > 0 
                ? Math.Round((vol.RealFreeGB / vol.TotalGB) * 100m, 2) 
                : 100m;

            // Determinar si debe alertar (v3.4)
            // IsAlerted = true si:
            // 1. FilesWithGrowth > 0 AND RealFreePct <= 10% (lógica original v3.3)
            // 2. Disco de LOGS con growth Y % físico < 10% (aunque tenga espacio interno)
            //    porque si se llena el disco de logs, la instancia queda inaccesible
            vol.IsAlerted = vol.FilesWithGrowth > 0 && vol.RealFreePct <= 10;
        }
    }

    private void ProcessRoles(DataTable table, DiscosMetrics result, bool hasVolumeStats)
    {
        var rolesByDrive = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (DataRow row in table.Rows)
        {
            string mountPoint;
            string diskRole;

            if (hasVolumeStats)
            {
                mountPoint = GetString(row, "MountPoint") ?? "";
                diskRole = GetString(row, "DiskRole") ?? "";
            }
            else
            {
                // sysaltfiles format
                var driveLetter = GetString(row, "DriveLetter") ?? "";
                mountPoint = $"{driveLetter}:\\";
                diskRole = GetString(row, "DiskRole") ?? "Data";
            }

            var normalizedDrive = NormalizeDriveLetter(mountPoint);
            if (string.IsNullOrEmpty(normalizedDrive))
                continue;

            if (!rolesByDrive.ContainsKey(normalizedDrive))
            {
                rolesByDrive[normalizedDrive] = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            }
            rolesByDrive[normalizedDrive].Add(diskRole);
        }

        // Aplicar roles a volúmenes
        foreach (var vol in result.Volumes)
        {
            var normalizedDrive = NormalizeDriveLetter(vol.MountPoint);
            if (rolesByDrive.TryGetValue(normalizedDrive, out var roles))
            {
                vol.IsDataDisk = roles.Contains("Data") || roles.Contains("ROWS");
                vol.IsLogDisk = roles.Contains("Log") || roles.Contains("LOG");
                vol.IsTempDBDisk = roles.Contains("TempDB");
            }
            else
            {
                // Por defecto asumir Data
                vol.IsDataDisk = true;
            }
        }
    }

    private void CalculateFinalMetrics(DiscosMetrics result)
    {
        if (result.Volumes.Count == 0)
            return;

        // v3.4: Recalcular IsAlerted para discos de LOGS
        // Después de ProcessRoles ya tenemos IsLogDisk establecido
        // Si es disco de logs con growth y % físico < 10%, marcar como alertado
        // aunque tenga espacio interno disponible (porque si se llena, la instancia queda inaccesible)
        foreach (var vol in result.Volumes)
        {
            if (vol.IsLogDisk && vol.FilesWithGrowth > 0 && vol.FreePct < 10)
            {
                vol.IsAlerted = true;
            }
        }

        // Worst free pct (disco físico)
        result.WorstFreePct = result.Volumes.Min(v => v.FreePct);

        // Worst real free pct (considerando espacio interno)
        result.WorstRealFreePct = result.Volumes
            .Where(v => v.RealFreePct.HasValue)
            .Select(v => v.RealFreePct!.Value)
            .DefaultIfEmpty(100m)
            .Min();

        // Promedios por rol
        var dataDisks = result.Volumes.Where(v => v.IsDataDisk).ToList();
        var logDisks = result.Volumes.Where(v => v.IsLogDisk).ToList();
        var tempdbDisks = result.Volumes.Where(v => v.IsTempDBDisk).ToList();

        if (dataDisks.Count > 0)
            result.DataDiskAvgFreePct = dataDisks.Average(v => v.FreePct);

        if (logDisks.Count > 0)
            result.LogDiskAvgFreePct = logDisks.Average(v => v.FreePct);

        if (tempdbDisks.Count > 0)
            result.TempDBDiskFreePct = tempdbDisks.Average(v => v.FreePct);

        // Contar volúmenes alertados
        result.AlertedVolumeCount = result.Volumes.Count(v => v.IsAlerted);
        result.HasAnyGrowthFiles = result.Volumes.Any(v => v.FilesWithGrowth > 0);
    }

    protected override int CalculateScore(DiscosMetrics data, List<CollectorThreshold> thresholds)
    {
        var score = 100;
        var cap = 100;

        // Usar el peor espacio REAL libre (disco + interno)
        var worstRealPct = data.WorstRealFreePct ?? data.WorstFreePct;

        // SCORING v3.3 (idéntico al PowerShell):
        // ≥20% = 100, 15–19% = 80, 10–14% = 60, 5–9% = 40, <5% = 0
        if (worstRealPct >= 20)
            score = 100;
        else if (worstRealPct >= 15)
            score = 80;
        else if (worstRealPct >= 10)
            score = 60;
        else if (worstRealPct >= 5)
            score = 40;
        else
            score = 0;

        // AJUSTE INTELIGENTE v3.3:
        // Si hay volúmenes ALERTADOS (RealFreePct <= 10% Y growth habilitado) → Riesgo REAL
        var alertedVolumes = data.Volumes.Where(v => v.IsAlerted).ToList();
        
        if (alertedVolumes.Count > 0)
        {
            var worstAlertedPct = alertedVolumes.Min(v => v.RealFreePct ?? 100);
            
            if (worstAlertedPct <= 5)
            {
                score = 0;
                cap = 40;
            }
            else if (worstAlertedPct <= 10)
            {
                score = Math.Min(score, 30);
                cap = 50;
            }
        }
        // Si el disco está bajo pero SIN archivos con growth, menos riesgo
        else if (data.WorstFreePct < 10 && !data.HasAnyGrowthFiles)
        {
            score = Math.Min(100, score + 20);
        }
        // Si disco bajo pero buen espacio REAL, riesgo bajo
        else if (data.WorstFreePct < 10 && (data.WorstRealFreePct ?? 0) >= 15)
        {
            score = Math.Min(100, score + 10);
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
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
            TempDBDiskFreePct = data.TempDBDiskFreePct,
            VolumesJson = volumesJson
        };

        await SaveWithScopedContextAsync(async context =>
        {
            context.InstanceHealthDiscos.Add(entity);
            await context.SaveChangesAsync(ct);
        }, ct);
    }

    /// <summary>
    /// Normaliza mount point a solo letra de unidad.
    /// Convierte "E:\DWM\DWM4\" -> "E:\" y "E:\" -> "E:\"
    /// </summary>
    private static string NormalizeDriveLetter(string mountPoint)
    {
        if (string.IsNullOrWhiteSpace(mountPoint))
            return "";

        var match = Regex.Match(mountPoint, @"^([A-Za-z]:)");
        if (match.Success)
            return match.Groups[1].Value + "\\";

        return mountPoint;
    }

    private string GetVolumeStatsQuery()
    {
        return @"
-- Espacio en discos (deduplicado por volumen físico) - SQL 2008 R2+
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;";
    }

    private string GetXpFixedDrivesQuery()
    {
        return @"
-- SQL 2005/2008 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive AS DriveLetter,
    MBFree AS MBFree
FROM #DriveSpace

DROP TABLE #DriveSpace";
    }

    private string GetFileAnalysisQuery()
    {
        return @"
-- Análisis de espacio interno en archivos usando FILEPROPERTY (compatible con todas las versiones)
-- CORREGIDO: Un archivo REALMENTE puede crecer si growth > 0 Y (max_size = -1 [UNLIMITED] O max_size > size)
-- Un archivo con growth > 0 pero max_size = size ya alcanzó su máximo y NO puede crecer más
IF OBJECT_ID('tempdb..#FileSpaceAnalysis') IS NOT NULL DROP TABLE #FileSpaceAnalysis;
CREATE TABLE #FileSpaceAnalysis (
    DriveLetter VARCHAR(2),
    TotalFiles INT,
    FilesWithoutGrowth INT,
    FilesWithGrowth INT,
    TotalFileSizeMB DECIMAL(18,2),
    TotalFreeSpaceInFilesMB DECIMAL(18,2),
    FreeSpaceInGrowableFilesMB DECIMAL(18,2),
    ProblematicFiles INT
);

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'
USE ' + QUOTENAME(d.name) + N';
INSERT INTO #FileSpaceAnalysis
SELECT 
    RTRIM(LEFT(mf.physical_name, 2)) AS DriveLetter,
    COUNT(*) AS TotalFiles,
    -- Sin crecimiento: growth = 0 O (growth > 0 pero ya alcanzó max_size)
    SUM(CASE 
        WHEN mf.growth = 0 THEN 1 
        WHEN mf.growth > 0 AND mf.max_size != -1 AND mf.max_size <= mf.size THEN 1 
        ELSE 0 
    END) AS FilesWithoutGrowth,
    -- Con crecimiento: growth > 0 Y (unlimited O aún puede crecer)
    SUM(CASE 
        WHEN mf.growth > 0 AND (mf.max_size = -1 OR mf.max_size > mf.size) THEN 1 
        ELSE 0 
    END) AS FilesWithGrowth,
    CAST(SUM(mf.size * 8.0 / 1024) AS DECIMAL(18,2)) AS TotalFileSizeMB,
    CAST(SUM((mf.size - FILEPROPERTY(mf.name, ''SpaceUsed'')) * 8.0 / 1024) AS DECIMAL(18,2)) AS TotalFreeSpaceInFilesMB,
    -- Espacio libre solo en archivos que REALMENTE pueden crecer
    CAST(SUM(CASE 
        WHEN mf.growth > 0 AND (mf.max_size = -1 OR mf.max_size > mf.size) 
        THEN (mf.size - FILEPROPERTY(mf.name, ''SpaceUsed'')) * 8.0 / 1024 
        ELSE 0 
    END) AS DECIMAL(18,2)) AS FreeSpaceInGrowableFilesMB,
    -- Archivos problemáticos: pueden crecer pero tienen poco espacio libre interno
    SUM(CASE 
        WHEN mf.growth > 0 AND (mf.max_size = -1 OR mf.max_size > mf.size) 
             AND (mf.size - FILEPROPERTY(mf.name, ''SpaceUsed'')) * 8.0 / 1024 < 30 
        THEN 1 
        ELSE 0 
    END) AS ProblematicFiles
FROM sys.database_files mf
WHERE mf.type IN (0, 1)
GROUP BY RTRIM(LEFT(mf.physical_name, 2));
'
FROM sys.databases d
WHERE d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
  AND d.state = 0
  AND d.is_read_only = 0;

EXEC sp_executesql @sql;

SELECT 
    DriveLetter,
    SUM(TotalFiles) AS TotalFiles,
    SUM(FilesWithoutGrowth) AS FilesWithoutGrowth,
    SUM(FilesWithGrowth) AS FilesWithGrowth,
    SUM(TotalFileSizeMB) AS TotalFileSizeMB,
    SUM(TotalFreeSpaceInFilesMB) AS TotalFreeSpaceInFilesMB,
    SUM(FreeSpaceInGrowableFilesMB) AS FreeSpaceInGrowableFilesMB,
    SUM(ProblematicFiles) AS ProblematicFiles
FROM #FileSpaceAnalysis
GROUP BY DriveLetter
ORDER BY SUM(ProblematicFiles) DESC, SUM(TotalFreeSpaceInFilesMB) ASC;

DROP TABLE #FileSpaceAnalysis;";
    }

    private string GetRolesQuery()
    {
        return @"
-- Detectar roles de volúmenes
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs";
    }

    private string GetSysaltfilesRolesQuery()
    {
        return @"
-- Detectar roles de discos vía sysaltfiles (SQL 2005)
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'";
    }

    protected override string GetDefaultQuery(int sqlMajorVersion)
    {
        return sqlMajorVersion >= 11 ? GetVolumeStatsQuery() : GetXpFixedDrivesQuery();
    }

    protected override Dictionary<string, object?> GetMetricsFromResult(DiscosMetrics data)
    {
        return new Dictionary<string, object?>
        {
            ["WorstFreePct"] = data.WorstFreePct,
            ["WorstRealFreePct"] = data.WorstRealFreePct,
            ["VolumeCount"] = data.Volumes.Count,
            ["AlertedVolumes"] = data.AlertedVolumeCount,
            ["HasAnyGrowthFiles"] = data.HasAnyGrowthFiles
        };
    }

    public class DiscosMetrics
    {
        public decimal WorstFreePct { get; set; } = 100m;
        public decimal? WorstRealFreePct { get; set; }
        public decimal DataDiskAvgFreePct { get; set; } = 100m;
        public decimal LogDiskAvgFreePct { get; set; } = 100m;
        public decimal TempDBDiskFreePct { get; set; } = 100m;
        public List<VolumeInfo> Volumes { get; set; } = new();
        public int AlertedVolumeCount { get; set; }
        public bool HasAnyGrowthFiles { get; set; }
        public bool FileAnalysisQueryFailed { get; set; }
    }

    public class VolumeInfo
    {
        public string MountPoint { get; set; } = "";
        public decimal TotalGB { get; set; }
        public decimal FreeGB { get; set; }
        public decimal FreePct { get; set; }
        
        // Espacio libre REAL (v3.3)
        public decimal? RealFreePct { get; set; }
        public decimal RealFreeGB { get; set; }
        public decimal FreeSpaceInGrowableFilesGB { get; set; }
        public decimal FreeSpaceInGrowableFilesMB { get; set; }
        
        // Análisis de archivos
        public int TotalFiles { get; set; }
        public int FilesWithGrowth { get; set; }
        public int FilesWithoutGrowth { get; set; }
        public decimal TotalFreeSpaceInFilesMB { get; set; }
        public int ProblematicFiles { get; set; }
        
        // Alerta (v3.3)
        public bool IsAlerted { get; set; }
        
        // Roles (nombres deben coincidir con DiskVolumeInfo en DisksService)
        public bool IsDataDisk { get; set; }
        public bool IsLogDisk { get; set; }
        public bool IsTempDBDisk { get; set; }
        
        // Mount points originales (para agrupar)
        public List<string> OriginalMountPoints { get; set; } = new();
    }

    private class FileAnalysisInfo
    {
        public int TotalFiles { get; set; }
        public int FilesWithoutGrowth { get; set; }
        public int FilesWithGrowth { get; set; }
        public decimal TotalFreeSpaceInFilesMB { get; set; }
        public decimal FreeSpaceInGrowableFilesMB { get; set; }
        public int ProblematicFiles { get; set; }
    }
}
