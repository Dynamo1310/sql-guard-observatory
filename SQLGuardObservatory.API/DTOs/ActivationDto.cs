namespace SQLGuardObservatory.API.DTOs;

// ==================== ACTIVATION DTOs ====================

public class OnCallActivationDto
{
    public int Id { get; set; }
    
    // Guardia
    public int ScheduleId { get; set; }
    public DateTime ScheduleWeekStart { get; set; }
    public DateTime ScheduleWeekEnd { get; set; }
    
    // Operador
    public string OperatorUserId { get; set; } = string.Empty;
    public string OperatorDomainUser { get; set; } = string.Empty;
    public string OperatorDisplayName { get; set; } = string.Empty;
    
    // Tiempos
    public DateTime ActivatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public int? DurationMinutes { get; set; }
    
    // Categorización
    public string Category { get; set; } = string.Empty;
    public string Severity { get; set; } = string.Empty;
    
    // Detalle
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Resolution { get; set; }
    public string? InstanceName { get; set; }
    
    // Service Desk
    public string? ServiceDeskUrl { get; set; }
    
    // Estado
    public string Status { get; set; } = "Pending";
    
    // Metadata
    public string CreatedByDisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

public class CreateActivationRequest
{
    public int ScheduleId { get; set; }
    public DateTime ActivatedAt { get; set; }
    public DateTime? ResolvedAt { get; set; }
    public int? DurationMinutes { get; set; }
    public string Category { get; set; } = "Other";
    public string Severity { get; set; } = "Medium";
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Resolution { get; set; }
    public string? InstanceName { get; set; }
    public string? ServiceDeskUrl { get; set; }
    public string Status { get; set; } = "Pending";
}

public class UpdateActivationRequest
{
    public DateTime? ResolvedAt { get; set; }
    public int? DurationMinutes { get; set; }
    public string? Category { get; set; }
    public string? Severity { get; set; }
    public string? Title { get; set; }
    public string? Description { get; set; }
    public string? Resolution { get; set; }
    public string? InstanceName { get; set; }
    public string? ServiceDeskUrl { get; set; }
    public string? Status { get; set; }
}

public class ActivationSummaryDto
{
    public int TotalActivations { get; set; }
    public int TotalHours { get; set; }
    public int TotalMinutes { get; set; }
    public int CriticalCount { get; set; }
    public int HighCount { get; set; }
    public int MediumCount { get; set; }
    public int LowCount { get; set; }
    public Dictionary<string, int> ByCategory { get; set; } = new();
    public Dictionary<string, int> ByOperator { get; set; } = new();
}

public class ActivationFilterRequest
{
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? OperatorUserId { get; set; }
    public string? Category { get; set; }
    public string? Severity { get; set; }
}

// Categorías y Severidades disponibles
public static class ActivationCategories
{
    public const string Database = "Database";
    public const string Performance = "Performance";
    public const string Connectivity = "Connectivity";
    public const string Backup = "Backup";
    public const string Security = "Security";
    public const string Other = "Other";

    public static readonly string[] All = { Database, Performance, Connectivity, Backup, Security, Other };
}

public static class ActivationSeverities
{
    public const string Low = "Low";
    public const string Medium = "Medium";
    public const string High = "High";
    public const string Critical = "Critical";

    public static readonly string[] All = { Low, Medium, High, Critical };
}

// ==================== ACTIVATION CATEGORY DTOs ====================

public class ActivationCategoryDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Icon { get; set; }
    public bool IsDefault { get; set; }
    public bool IsActive { get; set; }
    public int Order { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByDisplayName { get; set; }
}

public class CreateActivationCategoryRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Icon { get; set; }
}

public class UpdateActivationCategoryRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Icon { get; set; }
    public bool IsActive { get; set; } = true;
}







