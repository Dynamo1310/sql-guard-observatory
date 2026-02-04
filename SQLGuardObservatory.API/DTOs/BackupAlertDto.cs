namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO de configuración de alertas de backups
/// </summary>
public class BackupAlertConfigDto
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
/// Request para crear configuración de alertas de backups
/// </summary>
public class CreateBackupAlertRequest
{
    public string Name { get; set; } = "Alerta de Backups Atrasados";
    public string? Description { get; set; }
    public int CheckIntervalMinutes { get; set; } = 60;
    public int AlertIntervalMinutes { get; set; } = 240;
    public List<string> Recipients { get; set; } = new();
    public List<string> CcRecipients { get; set; } = new();
}

/// <summary>
/// Request para actualizar configuración de alertas de backups
/// </summary>
public class UpdateBackupAlertRequest
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
/// DTO de historial de alertas de backups
/// </summary>
public class BackupAlertHistoryDto
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    public string SentAt { get; set; } = "";
    public int RecipientCount { get; set; }
    public int CcCount { get; set; }
    public List<string> InstancesAffected { get; set; } = new();
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// DTO para mostrar estado de backups pendientes de alerta
/// </summary>
public class BackupAlertStatusDto
{
    /// <summary>
    /// Instancias con backups atrasados SIN asignación (generarían alerta)
    /// </summary>
    public List<BackupIssueSummaryDto> UnassignedIssues { get; set; } = new();
    
    /// <summary>
    /// Instancias con backups atrasados CON asignación (no generan alerta)
    /// </summary>
    public List<BackupIssueSummaryDto> AssignedIssues { get; set; } = new();
}

/// <summary>
/// Resumen de problema de backup
/// </summary>
public class BackupIssueSummaryDto
{
    public string InstanceName { get; set; } = "";
    public bool FullBackupBreached { get; set; }
    public bool LogBackupBreached { get; set; }
    public string? AssignedToUserName { get; set; }
    public string? AssignedAt { get; set; }
}
