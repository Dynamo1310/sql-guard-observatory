namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para la configuración de alerta de resumen Overview
/// </summary>
public class OverviewSummaryAlertConfigDto
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string? Description { get; set; }
    public bool IsEnabled { get; set; }
    public List<string> Recipients { get; set; } = new();
    public bool IncludeOnlyProduction { get; set; } = true;
    public List<OverviewSummaryAlertScheduleDto> Schedules { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

/// <summary>
/// DTO para un horario programado
/// </summary>
public class OverviewSummaryAlertScheduleDto
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    /// <summary>
    /// Hora en formato HH:mm (ej: "08:00", "14:00", "20:00")
    /// </summary>
    public string TimeOfDay { get; set; } = "08:00";
    public bool IsEnabled { get; set; } = true;
    /// <summary>
    /// Días de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
    /// </summary>
    public List<int> DaysOfWeek { get; set; } = new() { 1, 2, 3, 4, 5 };
    public DateTime? LastSentAt { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Request para crear/actualizar la configuración
/// </summary>
public class UpdateOverviewSummaryAlertConfigRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public bool? IsEnabled { get; set; }
    public List<string>? Recipients { get; set; }
    public bool? IncludeOnlyProduction { get; set; }
}

/// <summary>
/// Request para agregar un nuevo schedule
/// </summary>
public class CreateOverviewSummaryAlertScheduleRequest
{
    /// <summary>
    /// Hora en formato HH:mm (ej: "08:00")
    /// </summary>
    public string TimeOfDay { get; set; } = "08:00";
    public bool IsEnabled { get; set; } = true;
    /// <summary>
    /// Días de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
    /// </summary>
    public List<int> DaysOfWeek { get; set; } = new() { 1, 2, 3, 4, 5 };
}

/// <summary>
/// Request para actualizar un schedule existente
/// </summary>
public class UpdateOverviewSummaryAlertScheduleRequest
{
    public string? TimeOfDay { get; set; }
    public bool? IsEnabled { get; set; }
    public List<int>? DaysOfWeek { get; set; }
}

/// <summary>
/// DTO para el historial de alertas enviadas
/// </summary>
public class OverviewSummaryAlertHistoryDto
{
    public int Id { get; set; }
    public int ConfigId { get; set; }
    public int? ScheduleId { get; set; }
    public string? ScheduleTime { get; set; }
    public DateTime SentAt { get; set; }
    public int RecipientCount { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string TriggerType { get; set; } = "Scheduled";
    public OverviewSummaryDataDto? SummaryData { get; set; }
}

/// <summary>
/// DTO para los datos del resumen Overview
/// </summary>
public class OverviewSummaryDataDto
{
    public int TotalInstances { get; set; }
    public int HealthyCount { get; set; }
    public int WarningCount { get; set; }
    public int RiskCount { get; set; }
    public int CriticalCount { get; set; }
    public int AverageHealthScore { get; set; }
    public int BackupsOverdue { get; set; }
    public int CriticalDisks { get; set; }
    public int MaintenanceOverdue { get; set; }
    public List<CriticalInstanceSummary> CriticalInstances { get; set; } = new();
    public List<BackupIssueSummary> BackupIssues { get; set; } = new();
    public List<CriticalDiskSummary> CriticalDisksList { get; set; } = new();
    public List<MaintenanceOverdueSummary> MaintenanceOverdueList { get; set; } = new();
    public DateTime GeneratedAt { get; set; }
}

public class CriticalInstanceSummary
{
    public string InstanceName { get; set; } = "";
    public int HealthScore { get; set; }
    public List<string> Issues { get; set; } = new();
}

public class BackupIssueSummary
{
    public string InstanceName { get; set; } = "";
    public int Score { get; set; }
    public List<string> Issues { get; set; } = new();
}

public class CriticalDiskSummary
{
    public string InstanceName { get; set; } = "";
    public string Drive { get; set; } = "";
    public decimal RealPorcentajeLibre { get; set; }
    public decimal RealLibreGB { get; set; }
}

public class MaintenanceOverdueSummary
{
    public string InstanceName { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string Tipo { get; set; } = "";
    public string? AgName { get; set; }
}

/// <summary>
/// Respuesta genérica para operaciones de alerta
/// </summary>
public class OverviewSummaryAlertResult
{
    public bool Success { get; set; }
    public string Message { get; set; } = "";
}

