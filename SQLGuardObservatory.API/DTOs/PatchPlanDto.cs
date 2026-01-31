namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para representar un plan de parcheo
/// </summary>
public class PatchPlanDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string CurrentVersion { get; set; } = "";
    public string TargetVersion { get; set; } = "";
    public bool IsCoordinated { get; set; }
    public string? ProductOwnerNote { get; set; }
    public DateTime ScheduledDate { get; set; }
    public string WindowStartTime { get; set; } = "";
    public string WindowEndTime { get; set; } = "";
    public string? AssignedDbaId { get; set; }
    public string? AssignedDbaName { get; set; }
    public bool? WasPatched { get; set; }
    public string Status { get; set; } = "";
    public DateTime? PatchedAt { get; set; }
    public string? PatchedByUserName { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
    public DateTime? UpdatedAt { get; set; }
    
    // Nuevos campos para sistema mejorado
    public string PatchMode { get; set; } = "Manual";
    public string? CoordinationOwnerId { get; set; }
    public string? CoordinationOwnerName { get; set; }
    public string? CoordinationOwnerEmail { get; set; }
    public string? CellTeam { get; set; }
    public int? EstimatedDuration { get; set; }
    public string? Priority { get; set; }
    public string? ClusterName { get; set; }
    public bool IsAlwaysOn { get; set; }
    public string? Ambiente { get; set; }
    public DateTime? ContactedAt { get; set; }
    public DateTime? ResponseReceivedAt { get; set; }
    public int RescheduledCount { get; set; }
    public string? WaiverReason { get; set; }
}

/// <summary>
/// DTO para crear un nuevo plan de parcheo
/// </summary>
public class CreatePatchPlanRequest
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string CurrentVersion { get; set; } = "";
    public string TargetVersion { get; set; } = "";
    public bool IsCoordinated { get; set; }
    public string? ProductOwnerNote { get; set; }
    public DateTime ScheduledDate { get; set; }
    public string WindowStartTime { get; set; } = "";
    public string WindowEndTime { get; set; } = "";
    public string? AssignedDbaId { get; set; }
    public string? Notes { get; set; }
    
    // Nuevos campos
    public string? Status { get; set; }
    public string PatchMode { get; set; } = "Manual";
    public string? CoordinationOwnerId { get; set; }
    public string? CoordinationOwnerName { get; set; }
    public string? CoordinationOwnerEmail { get; set; }
    public string? CellTeam { get; set; }
    public int? EstimatedDuration { get; set; }
    public string? Priority { get; set; }
    public string? ClusterName { get; set; }
    public bool IsAlwaysOn { get; set; }
    public string? Ambiente { get; set; }
}

/// <summary>
/// DTO para actualizar un plan de parcheo
/// </summary>
public class UpdatePatchPlanRequest
{
    public string? ServerName { get; set; }
    public string? InstanceName { get; set; }
    public string? CurrentVersion { get; set; }
    public string? TargetVersion { get; set; }
    public bool? IsCoordinated { get; set; }
    public string? ProductOwnerNote { get; set; }
    public DateTime? ScheduledDate { get; set; }
    public string? WindowStartTime { get; set; }
    public string? WindowEndTime { get; set; }
    public string? AssignedDbaId { get; set; }
    public bool? WasPatched { get; set; }
    public string? Notes { get; set; }
    
    // Nuevos campos
    public string? Status { get; set; }
    public string? PatchMode { get; set; }
    public string? CoordinationOwnerId { get; set; }
    public string? CoordinationOwnerName { get; set; }
    public string? CoordinationOwnerEmail { get; set; }
    public string? CellTeam { get; set; }
    public int? EstimatedDuration { get; set; }
    public string? Priority { get; set; }
    public string? ClusterName { get; set; }
    public bool? IsAlwaysOn { get; set; }
    public string? Ambiente { get; set; }
    public string? WaiverReason { get; set; }
}

/// <summary>
/// DTO para marcar un parcheo como completado o fallido
/// </summary>
public class MarkPatchStatusRequest
{
    public bool WasPatched { get; set; }
    public string? Notes { get; set; }
}

/// <summary>
/// DTO para representar un DBA disponible para asignar
/// </summary>
public class AvailableDbaDto
{
    public string Id { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string? Email { get; set; }
    public string? DomainUser { get; set; }
}

/// <summary>
/// DTO para filtrar planes de parcheo
/// </summary>
public class PatchPlanFilterRequest
{
    public DateTime? FromDate { get; set; }
    public DateTime? ToDate { get; set; }
    public string? AssignedDbaId { get; set; }
    public string? Status { get; set; }
    public string? ServerName { get; set; }
    public string? CellTeam { get; set; }
    public string? Ambiente { get; set; }
    public string? Priority { get; set; }
    public string? PatchMode { get; set; }
}

/// <summary>
/// DTO para reprogramar un plan de parcheo
/// </summary>
public class ReschedulePatchPlanRequest
{
    public DateTime NewScheduledDate { get; set; }
    public string? NewWindowStartTime { get; set; }
    public string? NewWindowEndTime { get; set; }
    public string? Reason { get; set; }
}

/// <summary>
/// DTO para el calendario de parcheos
/// </summary>
public class PatchCalendarDto
{
    public int Id { get; set; }
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string Status { get; set; } = "";
    public string? Priority { get; set; }
    public string? CellTeam { get; set; }
    public string? Ambiente { get; set; }
    public DateTime ScheduledDate { get; set; }
    public string WindowStartTime { get; set; } = "";
    public string WindowEndTime { get; set; } = "";
    public string? AssignedDbaName { get; set; }
    public int? EstimatedDuration { get; set; }
    public bool IsAlwaysOn { get; set; }
    public string? ClusterName { get; set; }
}

/// <summary>
/// DTO para estadísticas del dashboard de parcheos
/// </summary>
public class PatchDashboardStatsDto
{
    // Por ciclo
    public int TotalPlans { get; set; }
    public int CompletedPlans { get; set; }
    public int PendingPlans { get; set; }
    public int FailedPlans { get; set; }
    public double CompletionPercentage { get; set; }
    public int DelayedPlans { get; set; }
    
    // Por prioridad
    public int HighPriorityPending { get; set; }
    public int MediumPriorityPending { get; set; }
    public int LowPriorityPending { get; set; }
    
    // Por célula
    public List<CellStatsDto> CellStats { get; set; } = new();
    
    // Por cumplimiento
    public int InWindowExecutions { get; set; }
    public int OutOfWindowExecutions { get; set; }
    public double AverageLeadTimeDays { get; set; }
}

/// <summary>
/// Estadísticas por célula
/// </summary>
public class CellStatsDto
{
    public string CellTeam { get; set; } = "";
    public int Backlog { get; set; }
    public int Completed { get; set; }
    public int Rescheduled { get; set; }
    public int Waivers { get; set; }
}

/// <summary>
/// DTO para sugerencia de ventana
/// </summary>
public class SuggestedWindowDto
{
    public DateTime Date { get; set; }
    public string StartTime { get; set; } = "";
    public string EndTime { get; set; } = "";
    public int AvailableMinutes { get; set; }
    public string Reason { get; set; } = "";
    public bool IsRecommended { get; set; }
}

/// <summary>
/// DTO para servidor no-compliance
/// </summary>
public class NonCompliantServerDto
{
    public string ServerName { get; set; } = "";
    public string? InstanceName { get; set; }
    public string? Ambiente { get; set; }
    public string? MajorVersion { get; set; }
    public string? CurrentBuild { get; set; }
    public string? CurrentCU { get; set; }
    public string? RequiredBuild { get; set; }
    public string? RequiredCU { get; set; }
    public int PendingCUsForCompliance { get; set; }
    public string PatchStatus { get; set; } = "";
    public bool IsAlwaysOn { get; set; }
    public string? ClusterName { get; set; }
    public DateTime? LastChecked { get; set; }
}

/// <summary>
/// Request para contactar owners
/// </summary>
public class ContactOwnersRequest
{
    public List<int> PatchPlanIds { get; set; } = new();
    public string? CustomMessage { get; set; }
}
