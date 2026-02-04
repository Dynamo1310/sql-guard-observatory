namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para asignación de problema del Overview
/// </summary>
public class OverviewAssignmentDto
{
    public int Id { get; set; }
    public string IssueType { get; set; } = "";
    public string InstanceName { get; set; } = "";
    public string? DriveOrTipo { get; set; }
    public string AssignedToUserId { get; set; } = "";
    public string AssignedToUserName { get; set; } = "";
    public string AssignedByUserId { get; set; } = "";
    public string AssignedByUserName { get; set; } = "";
    public DateTime AssignedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// Request para crear una asignación
/// </summary>
public class CreateOverviewAssignmentRequest
{
    /// <summary>
    /// Tipo de problema: 'Backup', 'Disk', 'Maintenance'
    /// </summary>
    public string IssueType { get; set; } = "";
    
    public string InstanceName { get; set; } = "";
    
    /// <summary>
    /// Drive para discos (ej: "C:"), Tipo para mantenimiento (ej: "CHECKDB")
    /// </summary>
    public string? DriveOrTipo { get; set; }
    
    /// <summary>
    /// ID del usuario al que se asigna
    /// </summary>
    public string AssignedToUserId { get; set; } = "";
    
    public string? Notes { get; set; }
}

/// <summary>
/// Usuario disponible para asignación de problemas del Overview
/// </summary>
public class AssignableUserDto
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Email { get; set; }
    public string? DomainUser { get; set; }
}
