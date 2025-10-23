namespace SQLGuardObservatory.API.DTOs;

public class DiskDto
{
    public long Id { get; set; }
    public string InstanceName { get; set; } = string.Empty;
    public string? Ambiente { get; set; }
    public string? Hosting { get; set; }
    public string Servidor { get; set; } = string.Empty;
    public string Drive { get; set; } = string.Empty;
    public decimal? TotalGB { get; set; }
    public decimal? LibreGB { get; set; }
    public decimal? PorcentajeLibre { get; set; }
    public string? Estado { get; set; }
    public DateTime CaptureDate { get; set; }
}

public class DiskSummaryDto
{
    public int DiscosCriticos { get; set; }
    public int DiscosAdvertencia { get; set; }
    public int DiscosSaludables { get; set; }
    public int TotalDiscos { get; set; }
    public DateTime? UltimaCaptura { get; set; }
}

public class DiskFiltersDto
{
    public List<string> Ambientes { get; set; } = new();
    public List<string> Hostings { get; set; } = new();
    public List<string> Instancias { get; set; } = new();
    public List<string> Estados { get; set; } = new();
}

