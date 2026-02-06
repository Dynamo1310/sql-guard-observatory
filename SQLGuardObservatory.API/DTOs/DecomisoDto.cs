using System.Text.Json.Serialization;

namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO de salida para la grilla de decomiso.
/// Representa la unión (LEFT JOIN) entre ReporteBasesSinActividad y GestionDecomiso.
/// </summary>
public class DecomisoGridDto
{
    public long? GestionId { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string DBName { get; set; } = string.Empty;
    public string? HostName { get; set; }
    public string? ProgramName { get; set; }
    public string? LoginName { get; set; }
    public int? DatabaseSizeMB { get; set; }

    /// <summary>
    /// Conversión automática de MB a GB (regla de negocio)
    /// </summary>
    public decimal DatabaseSizeGB => Math.Round((DatabaseSizeMB ?? 0) / 1024m, 2);

    /// <summary>
    /// Fecha de última actividad parseada desde varchar(30) a DateTime
    /// </summary>
    public DateTime? UltimaActividad { get; set; }

    /// <summary>
    /// Días transcurridos desde la última actividad
    /// </summary>
    public int DiasInactividad { get; set; }

    public string Estado { get; set; } = "Pendiente";
    public string? TicketJira { get; set; }
    public string? Responsable { get; set; }
    public string? Observaciones { get; set; }
    public DateTime? FechaModificacion { get; set; }
    public DateTime FechaCarga { get; set; }
}

/// <summary>
/// DTO para el resumen del dashboard (KPI cards)
/// </summary>
public class DecomisoResumenDto
{
    public int TotalBases { get; set; }
    public decimal EspacioRecuperableGB { get; set; }
    public int PendientesAccion { get; set; }
}

/// <summary>
/// DTO de entrada para actualizar el estado de gestión de decomiso
/// </summary>
public class UpdateDecomisoRequest
{
    public string ServerName { get; set; } = string.Empty;
    public string DBName { get; set; } = string.Empty;
    public string Estado { get; set; } = string.Empty;
    public string? TicketJira { get; set; }
    public string? Responsable { get; set; }
    public string? Observaciones { get; set; }
}

/// <summary>
/// DTO de respuesta para la grilla con resumen incluido
/// </summary>
public class DecomisoGridResponse
{
    public List<DecomisoGridDto> Items { get; set; } = new();
    public DecomisoResumenDto Resumen { get; set; } = new();
}
