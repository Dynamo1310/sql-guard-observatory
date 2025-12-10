namespace SQLGuardObservatory.API.DTOs;

public class DiskDto
{
    public long Id { get; set; }
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? Hosting { get; set; }
    public string Servidor { get; set; } = string.Empty;
    public string Drive { get; set; } = string.Empty;
    
    // Espacio físico en disco
    public decimal? TotalGB { get; set; }
    public decimal? LibreGB { get; set; }
    public decimal? PorcentajeLibre { get; set; }
    
    // Espacio REAL (v3.3) = Espacio físico + Espacio interno en archivos con growth
    public decimal? RealLibreGB { get; set; }
    public decimal? RealPorcentajeLibre { get; set; }
    public decimal? EspacioInternoEnArchivosGB { get; set; }
    
    // Información de archivos
    public int FilesWithGrowth { get; set; }
    public int FilesWithoutGrowth { get; set; }
    public int TotalFiles { get; set; }
    
    // Estado y alertas
    public string? Estado { get; set; }
    public bool IsAlerted { get; set; }
    
    // Rol del disco
    public bool IsDataDisk { get; set; }
    public bool IsLogDisk { get; set; }
    public bool IsTempDBDisk { get; set; }
    
    public DateTime CaptureDate { get; set; }
}

public class DiskSummaryDto
{
    public int DiscosCriticos { get; set; }
    public int DiscosAdvertencia { get; set; }
    public int DiscosSaludables { get; set; }
    public int TotalDiscos { get; set; }
    
    // Nuevos contadores para diferenciar tipos de alertas
    public int DiscosAlertadosReales { get; set; }  // Discos con growth + espacio real <= 10%
    public int DiscosBajosSinRiesgo { get; set; }   // Discos <10% pero sin growth o con espacio interno
    
    public DateTime? UltimaCaptura { get; set; }
}

public class DiskFiltersDto
{
    public List<string> Ambientes { get; set; } = new();
    public List<string> Hostings { get; set; } = new();
    public List<string> Instancias { get; set; } = new();
    public List<string> Estados { get; set; } = new();
}
