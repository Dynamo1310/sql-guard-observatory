namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Modelo POCO para mapeo Dapper de la tabla [SQLNova].[dbo].[ReporteBasesSinActividad]
/// </summary>
public class ReporteBaseSinActividad
{
    public string ServerName { get; set; } = string.Empty;
    public string DB { get; set; } = string.Empty;
    public string? HostName { get; set; }
    public string? ProgramName { get; set; }
    public string? LoginName { get; set; }
    public string UltimaActividad { get; set; } = string.Empty;
    public string LastReportSentAt { get; set; } = string.Empty;
    public int? DatabaseSizeMB { get; set; }
    public DateTime FechaCarga { get; set; }
}
