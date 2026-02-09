namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO de configuración de alertas de discos críticos
/// </summary>
public class DiskAlertConfigDto
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsEnabled { get; set; }
    public int CheckIntervalMinutes { get; set; }
    public int AlertIntervalMinutes { get; set; }
    
    /// <summary>
    /// Lista de destinatarios (TO)
    /// </summary>
    public List<string> Recipients { get; set; } = new();
    
    /// <summary>
    /// Lista de destinatarios en copia (CC)
    /// </summary>
    public List<string> CcRecipients { get; set; } = new();
    
    public string? LastRunAt { get; set; }
    public string? LastAlertSentAt { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

/// <summary>
/// Request para actualizar configuración de alertas de discos
/// </summary>
public class UpdateDiskAlertRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? IsEnabled { get; set; }
    public int? CheckIntervalMinutes { get; set; }
    public int? AlertIntervalMinutes { get; set; }
    public List<string>? Recipients { get; set; }
    public List<string>? CcRecipients { get; set; }
}

/// <summary>
/// DTO de historial de alertas de discos críticos
/// </summary>
public class DiskAlertHistoryDto
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    public string SentAt { get; set; } = "";
    public int RecipientCount { get; set; }
    public int CcCount { get; set; }
    public List<string> DisksAffected { get; set; } = new();
    public int CriticalDiskCount { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// DTO para estado actual de discos críticos
/// </summary>
public class DiskAlertStatusDto
{
    /// <summary>
    /// Discos críticos SIN asignación (generarían alerta)
    /// </summary>
    public List<CriticalDiskIssueSummaryDto> UnassignedDisks { get; set; } = new();
    
    /// <summary>
    /// Discos críticos CON asignación (no generan alerta)
    /// </summary>
    public List<CriticalDiskIssueSummaryDto> AssignedDisks { get; set; } = new();
    
    /// <summary>
    /// Cantidad total de discos críticos (asignados + sin asignar)
    /// </summary>
    public int TotalCriticalDisks { get; set; }
}

/// <summary>
/// Resumen de disco crítico individual
/// </summary>
public class CriticalDiskIssueSummaryDto
{
    public string InstanceName { get; set; } = "";
    public string Drive { get; set; } = "";
    public decimal PorcentajeLibre { get; set; }
    public decimal LibreGB { get; set; }
    public decimal? TotalGB { get; set; }
    public decimal? RealPorcentajeLibre { get; set; }
    public decimal? RealLibreGB { get; set; }
    public bool IsCriticalSystemDisk { get; set; }
    
    /// <summary>
    /// Nombre del usuario asignado (solo para discos asignados)
    /// </summary>
    public string? AssignedToUserName { get; set; }
    
    /// <summary>
    /// Fecha de asignación formateada (solo para discos asignados)
    /// </summary>
    public string? AssignedAt { get; set; }
}
