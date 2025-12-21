namespace SQLGuardObservatory.API.DTOs;

// ==================== ALERT RULE DTOs ====================

public class OnCallAlertRuleDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AlertType { get; set; } = string.Empty;
    public int? ConditionDays { get; set; }
    public bool IsEnabled { get; set; }
    public string CreatedByDisplayName { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public List<AlertRecipientDto> Recipients { get; set; } = new();
}

public class AlertRecipientDto
{
    public int Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
    public bool IsEnabled { get; set; }
}

public class CreateAlertRuleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string AlertType { get; set; } = string.Empty;
    public int? ConditionDays { get; set; }
    public List<CreateRecipientRequest> Recipients { get; set; } = new();
}

public class UpdateAlertRuleRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public int? ConditionDays { get; set; }
    public bool? IsEnabled { get; set; }
}

public class CreateRecipientRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
}

public class AddRecipientRequest
{
    public string Email { get; set; } = string.Empty;
    public string? Name { get; set; }
}

// Tipos de alertas disponibles
public static class AlertTypes
{
    public const string ScheduleGenerated = "ScheduleGenerated";
    public const string DaysRemaining = "DaysRemaining";
    public const string SwapRequested = "SwapRequested";
    public const string SwapApproved = "SwapApproved";
    public const string SwapRejected = "SwapRejected";
    public const string ScheduleModified = "ScheduleModified";
    public const string ActivationCreated = "ActivationCreated";
    public const string Custom = "Custom";

    public static readonly string[] All = 
    { 
        ScheduleGenerated, DaysRemaining, SwapRequested, SwapApproved, 
        SwapRejected, ScheduleModified, ActivationCreated, Custom 
    };

    public static string GetDisplayName(string alertType) => alertType switch
    {
        ScheduleGenerated => "Calendario Generado",
        DaysRemaining => "Días Restantes",
        SwapRequested => "Intercambio Solicitado",
        SwapApproved => "Intercambio Aprobado",
        SwapRejected => "Intercambio Rechazado",
        ScheduleModified => "Guardia Modificada",
        ActivationCreated => "Activación Registrada",
        Custom => "Personalizada",
        _ => alertType
    };
}

// ==================== NOTIFICATION LOG DTOs ====================

public class NotificationLogDto
{
    public int Id { get; set; }
    public string NotificationType { get; set; } = string.Empty;
    public string ToEmail { get; set; } = string.Empty;
    public string? ToName { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? ErrorMessage { get; set; }
    public string? ReferenceType { get; set; }
    public int? ReferenceId { get; set; }
    public DateTime SentAt { get; set; }
    public int RetryCount { get; set; }
}

public class NotificationLogFilterRequest
{
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public string? NotificationType { get; set; }
    public string? Status { get; set; }
}






