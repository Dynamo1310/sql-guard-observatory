using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public class DisksService : IDisksService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<DisksService> _logger;

    public DisksService(ApplicationDbContext context, ILogger<DisksService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<DiskDto>> GetDisksAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null)
    {
        try
        {
            // Construir filtros SQL dinámicos para optimizar la consulta
            var whereConditions = new List<string>();
            var parameters = new List<Microsoft.Data.SqlClient.SqlParameter>();
            
            if (!string.IsNullOrWhiteSpace(ambiente))
            {
                whereConditions.Add("d.Ambiente = @Ambiente");
                parameters.Add(new Microsoft.Data.SqlClient.SqlParameter("@Ambiente", ambiente));
            }
            if (!string.IsNullOrWhiteSpace(hosting))
            {
                whereConditions.Add("d.HostingSite = @Hosting");
                parameters.Add(new Microsoft.Data.SqlClient.SqlParameter("@Hosting", hosting));
            }
            if (!string.IsNullOrWhiteSpace(instance))
            {
                whereConditions.Add("d.InstanceName = @Instance");
                parameters.Add(new Microsoft.Data.SqlClient.SqlParameter("@Instance", instance));
            }
            
            var whereClause = whereConditions.Count > 0 
                ? "WHERE " + string.Join(" AND ", whereConditions) 
                : "";

            // Usar la tabla InstanceHealth_Discos con datos más recientes por instancia
            // Optimizado: filtros aplicados en SQL y usando subconsulta más eficiente
            var query = $@"
                WITH FilteredDiscos AS (
                    SELECT 
                        d.Id,
                        d.InstanceName,
                        d.Ambiente,
                        d.HostingSite,
                        d.SqlVersion,
                        d.CollectedAtUtc,
                        d.WorstFreePct,
                        d.DataDiskAvgFreePct,
                        d.LogDiskAvgFreePct,
                        d.TempDBDiskFreePct,
                        d.VolumesJson
                    FROM dbo.InstanceHealth_Discos d
                    {whereClause}
                ),
                LatestDiscos AS (
                    SELECT 
                        *,
                        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                    FROM FilteredDiscos
                )
                SELECT 
                    Id,
                    InstanceName,
                    Ambiente,
                    HostingSite,
                    SqlVersion,
                    CollectedAtUtc,
                    WorstFreePct,
                    DataDiskAvgFreePct,
                    LogDiskAvgFreePct,
                    TempDBDiskFreePct,
                    VolumesJson
                FROM LatestDiscos
                WHERE rn = 1
                ORDER BY WorstFreePct ASC";

            // Usar timeout extendido para consultas grandes (120 segundos)
            var rawData = await _context.Database
                .SqlQueryRaw<InstanceDiskData>(query, parameters.ToArray())
                .ToListAsync(new CancellationTokenSource(TimeSpan.FromSeconds(120)).Token);

            var disks = new List<DiskDto>();

            foreach (var row in rawData)
            {
                // Los filtros de ambiente, hosting e instance ya se aplican en SQL
                // Solo el filtro de estado se aplica en memoria (después de parsear JSON)

                // Parsear VolumesJson para obtener volúmenes individuales
                if (!string.IsNullOrWhiteSpace(row.VolumesJson))
                {
                    try
                    {
                        var volumes = JsonSerializer.Deserialize<List<DiskVolumeInfo>>(row.VolumesJson, new JsonSerializerOptions 
                        { 
                            PropertyNameCaseInsensitive = true 
                        });

                        if (volumes != null)
                        {
                            foreach (var vol in volumes)
                            {
                                // Obtener valores del JSON
                                var freePct = vol.FreePct ?? 0;
                                var realFreePct = vol.RealFreePct ?? freePct;
                                var freeGB = vol.FreeGB ?? 0;
                                var realFreeGB = vol.RealFreeGB ?? freeGB;
                                var freeSpaceInGrowableFilesGB = vol.FreeSpaceInGrowableFilesGB ?? 0;
                                var filesWithGrowth = vol.FilesWithGrowth ?? 0;
                                var filesWithoutGrowth = vol.FilesWithoutGrowth ?? 0;
                                var totalFiles = vol.TotalFiles ?? (filesWithGrowth + filesWithoutGrowth);
                                var isAlerted = vol.IsAlerted ?? false;
                                
                                // v3.5: Determinar estado basado en la lógica del script
                                var isLogDisk = vol.IsLogDisk ?? false;
                                var isCriticalSystemDisk = vol.IsCriticalSystemDisk ?? false;
                                
                                var diskEstado = GetEstadoV33(freePct, realFreePct, filesWithGrowth, isAlerted, isLogDisk, isCriticalSystemDisk);

                                // Filtrar por estado si se especificó
                                if (!string.IsNullOrWhiteSpace(estado) && diskEstado != estado)
                                    continue;

                                disks.Add(new DiskDto
                                {
                                    Id = row.Id,
                                    InstanceName = row.InstanceName,
                                    Ambiente = row.Ambiente,
                                    Hosting = row.HostingSite,
                                    Servidor = row.InstanceName.Split('\\')[0],
                                    Drive = vol.MountPoint ?? vol.VolumeName ?? "N/A",
                                    
                                    // Espacio físico
                                    TotalGB = vol.TotalGB,
                                    LibreGB = freeGB,
                                    PorcentajeLibre = freePct,
                                    
                                    // Espacio REAL (v3.3)
                                    RealLibreGB = realFreeGB,
                                    RealPorcentajeLibre = realFreePct,
                                    EspacioInternoEnArchivosGB = freeSpaceInGrowableFilesGB,
                                    
                                    // Información de archivos
                                    FilesWithGrowth = filesWithGrowth,
                                    FilesWithoutGrowth = filesWithoutGrowth,
                                    TotalFiles = totalFiles,
                                    
                                    // Estado y alertas
                                    Estado = diskEstado,
                                    IsAlerted = isAlerted,
                                    
                                    // Rol del disco
                                    IsDataDisk = vol.IsDataDisk ?? false,
                                    IsLogDisk = vol.IsLogDisk ?? false,
                                    IsTempDBDisk = vol.IsTempDBDisk ?? false,
                                    
                                    CaptureDate = row.CollectedAtUtc
                                });
                            }
                        }
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogWarning(ex, "Error parseando VolumesJson para {Instance}", row.InstanceName);
                        // Agregar registro con datos agregados si falla el parseo
                        disks.Add(new DiskDto
                        {
                            Id = row.Id,
                            InstanceName = row.InstanceName,
                            Ambiente = row.Ambiente,
                            Hosting = row.HostingSite,
                            Servidor = row.InstanceName.Split('\\')[0],
                            Drive = "Agregado",
                            TotalGB = null,
                            LibreGB = null,
                            PorcentajeLibre = row.WorstFreePct,
                            RealLibreGB = null,
                            RealPorcentajeLibre = row.WorstFreePct,
                            EspacioInternoEnArchivosGB = null,
                            FilesWithGrowth = 0,
                            FilesWithoutGrowth = 0,
                            TotalFiles = 0,
                            Estado = GetEstadoSimple(row.WorstFreePct),
                            IsAlerted = false,
                            CaptureDate = row.CollectedAtUtc
                        });
                    }
                }
                else
                {
                    // Sin VolumesJson, usar datos agregados
                    var diskEstado = GetEstadoSimple(row.WorstFreePct);
                    
                    if (!string.IsNullOrWhiteSpace(estado) && diskEstado != estado)
                        continue;

                    disks.Add(new DiskDto
                    {
                        Id = row.Id,
                        InstanceName = row.InstanceName,
                        Ambiente = row.Ambiente,
                        Hosting = row.HostingSite,
                        Servidor = row.InstanceName.Split('\\')[0],
                        Drive = "Agregado",
                        TotalGB = null,
                        LibreGB = null,
                        PorcentajeLibre = row.WorstFreePct,
                        RealLibreGB = null,
                        RealPorcentajeLibre = row.WorstFreePct,
                        EspacioInternoEnArchivosGB = null,
                        FilesWithGrowth = 0,
                        FilesWithoutGrowth = 0,
                        TotalFiles = 0,
                        Estado = diskEstado,
                        IsAlerted = false,
                        CaptureDate = row.CollectedAtUtc
                    });
                }
            }

            // Ordenar: Primero alertados reales, luego por porcentaje real libre
            return disks
                .OrderByDescending(d => d.IsAlerted)
                .ThenBy(d => d.Estado == "Critico" ? 1 : d.Estado == "Advertencia" ? 2 : 3)
                .ThenBy(d => d.RealPorcentajeLibre ?? d.PorcentajeLibre)
                .ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener discos");
            throw;
        }
    }

    public async Task<DiskSummaryDto> GetDisksSummaryAsync(string? ambiente = null, string? hosting = null, string? instance = null, string? estado = null)
    {
        try
        {
            var allDisks = await GetDisksAsync(ambiente, hosting, instance, null);

            // Contar según la lógica v3.3
            var alertadosReales = allDisks.Count(d => d.IsAlerted);
            var bajosSinRiesgo = allDisks.Count(d => !d.IsAlerted && d.PorcentajeLibre < 10);

            return new DiskSummaryDto
            {
                // Críticos = Solo los realmente alertados (growth + espacio real bajo)
                DiscosCriticos = alertadosReales,
                DiscosAdvertencia = allDisks.Count(d => d.Estado == "Advertencia"),
                DiscosSaludables = allDisks.Count(d => d.Estado == "Saludable"),
                TotalDiscos = allDisks.Count,
                
                // Nuevos contadores
                DiscosAlertadosReales = alertadosReales,
                DiscosBajosSinRiesgo = bajosSinRiesgo,
                
                UltimaCaptura = allDisks.MaxBy(d => d.CaptureDate)?.CaptureDate
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de discos");
            throw;
        }
    }

    public async Task<DiskFiltersDto> GetAvailableFiltersAsync()
    {
        try
        {
            var disks = await GetDisksAsync();

            return new DiskFiltersDto
            {
                Ambientes = disks
                    .Where(d => !string.IsNullOrWhiteSpace(d.Ambiente))
                    .Select(d => d.Ambiente!)
                    .Distinct()
                    .OrderBy(a => a)
                    .ToList(),
                Hostings = disks
                    .Where(d => !string.IsNullOrWhiteSpace(d.Hosting))
                    .Select(d => d.Hosting!)
                    .Distinct()
                    .OrderBy(h => h)
                    .ToList(),
                Instancias = disks
                    .Select(d => d.InstanceName)
                    .Distinct()
                    .OrderBy(i => i)
                    .ToList(),
                Estados = new List<string> { "Critico", "Advertencia", "Saludable" }
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener filtros disponibles");
            throw;
        }
    }

    /// <summary>
    /// v3.5: Determina el estado del disco según la lógica del script de relevamiento
    /// - Crítico: IsAlerted = true (tiene growth + espacio real &lt;= 10%)
    /// - Crítico: Disco con .ldf (logs) + growth + % físico libre &lt; 10% (sin importar espacio interno)
    /// - Crítico: v3.5: Disco crítico del sistema (C, E, F, G, H) con % físico &lt; 10%
    /// - Advertencia: Espacio real entre 10-20%
    /// - Saludable: Espacio real &gt; 20%
    /// 
    /// NOTA: Un disco con &lt;10% físico pero sin growth o con espacio interno
    /// NO se marca como crítico porque los archivos no van a crecer,
    /// EXCEPTO si es un disco crítico del sistema (C, E, F, G, H).
    /// 
    /// EXCEPCIÓN IMPORTANTE: Los discos que contienen archivos .ldf (logs) con growth
    /// y % físico libre &lt; 10% son SIEMPRE críticos aunque tengan espacio interno.
    /// Esto es porque si se llena el disco de logs, la instancia queda INACCESIBLE.
    /// 
    /// v3.5: Los discos críticos del sistema (C=SO, E=Motor, F=TempDB Data, G=TempDB Log, H=User Log)
    /// son SIEMPRE críticos si tienen &lt; 10% de espacio libre, independientemente del growth.
    /// </summary>
    private static string GetEstadoV33(decimal freePct, decimal realFreePct, int filesWithGrowth, bool isAlerted, bool isLogDisk = false, bool isCriticalSystemDisk = false)
    {
        // Si está marcado como alertado por el script, es crítico
        if (isAlerted)
            return "Critico";
        
        // v3.5: Discos críticos del sistema (C, E, F, G, H) con % físico bajo (< 10%)
        // Son SIEMPRE críticos independientemente del growth
        if (isCriticalSystemDisk && freePct < 10)
            return "Critico";
        
        // v3.4: Discos con archivos .ldf (logs) + growth + % físico bajo (< 10%)
        // Son SIEMPRE críticos aunque tengan espacio interno disponible
        // porque si se llena el disco de logs, la instancia queda inaccesible
        if (isLogDisk && filesWithGrowth > 0 && freePct < 10)
            return "Critico";
        
        // Si tiene archivos con growth y espacio real bajo, verificar
        if (filesWithGrowth > 0 && realFreePct <= 10)
            return "Critico";
        
        // Si no tiene archivos con growth, usar el espacio real para determinar advertencia
        // (pero nunca crítico porque no va a crecer)
        if (realFreePct < 20)
            return "Advertencia";
        
        return "Saludable";
    }

    /// <summary>
    /// Estado simple basado solo en porcentaje (para casos sin datos de growth)
    /// </summary>
    private static string GetEstadoSimple(decimal porcentajeLibre)
    {
        if (porcentajeLibre < 10)
            return "Critico";
        if (porcentajeLibre < 20)
            return "Advertencia";
        return "Saludable";
    }
}

// Clase auxiliar para mapear datos de la query
public class InstanceDiskData
{
    public long Id { get; set; }
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public string? SqlVersion { get; set; }
    public DateTime CollectedAtUtc { get; set; }
    public decimal WorstFreePct { get; set; }
    public decimal DataDiskAvgFreePct { get; set; }
    public decimal LogDiskAvgFreePct { get; set; }
    public decimal TempDBDiskFreePct { get; set; }
    public string? VolumesJson { get; set; }
}

// Clase para deserializar el JSON de volúmenes (DisksService)
public class DiskVolumeInfo
{
    public string? MountPoint { get; set; }
    public string? VolumeName { get; set; }
    public decimal? TotalGB { get; set; }
    public decimal? FreeGB { get; set; }
    public decimal? FreePct { get; set; }
    
    // v3.3: Espacio libre REAL
    public decimal? RealFreeGB { get; set; }
    public decimal? RealFreePct { get; set; }
    public decimal? FreeSpaceInGrowableFilesGB { get; set; }
    public decimal? FreeSpaceInGrowableFilesMB { get; set; }
    public bool? IsAlerted { get; set; }
    
    // Información de archivos
    public int? FilesWithGrowth { get; set; }
    public int? FilesWithoutGrowth { get; set; }
    public int? TotalFiles { get; set; }
    public int? ProblematicFileCount { get; set; }
    public decimal? TotalFreeSpaceInFilesMB { get; set; }
    public decimal? AvgFreeSpaceInGrowableFilesMB { get; set; }
    public decimal? AvgFreeSpacePctInGrowableFiles { get; set; }
    
    // Roles del disco
    public bool? IsDataDisk { get; set; }
    public bool? IsLogDisk { get; set; }
    public bool? IsTempDBDisk { get; set; }
    
    /// <summary>
    /// v3.5: Indica si es un disco crítico del sistema (C, E, F, G, H)
    /// </summary>
    public bool? IsCriticalSystemDisk { get; set; }
    
    // Información de disco físico
    public string? MediaType { get; set; }
    public string? BusType { get; set; }
    public string? HealthStatus { get; set; }
    public string? OperationalStatus { get; set; }
    
    // Competencia
    public int? DatabaseCount { get; set; }
    public int? FileCount { get; set; }
    public string? DatabaseList { get; set; }
}
