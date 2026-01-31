namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para configuración de semana de freezing
/// </summary>
public class PatchingFreezingConfigDto
{
    public int Id { get; set; }
    public int WeekOfMonth { get; set; }
    public bool IsFreezingWeek { get; set; }
    public string? Description { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Request para actualizar configuración de freezing
/// </summary>
public class UpdateFreezingConfigRequest
{
    public List<FreezingWeekConfig> Weeks { get; set; } = new();
}

/// <summary>
/// Configuración de una semana de freezing
/// </summary>
public class FreezingWeekConfig
{
    public int WeekOfMonth { get; set; }
    public bool IsFreezingWeek { get; set; }
    public string? Description { get; set; }
}

/// <summary>
/// DTO para configuración de notificaciones de parcheo
/// </summary>
public class PatchNotificationSettingDto
{
    public int Id { get; set; }
    public string NotificationType { get; set; } = "";
    public bool IsEnabled { get; set; }
    public int? HoursBefore { get; set; }
    public string RecipientType { get; set; } = "";
    public string? EmailSubjectTemplate { get; set; }
    public string? EmailBodyTemplate { get; set; }
    public string? Description { get; set; }
    public DateTime? UpdatedAt { get; set; }
}

/// <summary>
/// Request para actualizar configuración de notificación
/// </summary>
public class UpdateNotificationSettingRequest
{
    public string NotificationType { get; set; } = "";
    public bool IsEnabled { get; set; }
    public int? HoursBefore { get; set; }
    public string RecipientType { get; set; } = "";
    public string? EmailSubjectTemplate { get; set; }
    public string? EmailBodyTemplate { get; set; }
    public string? Description { get; set; }
}

/// <summary>
/// DTO para historial de notificaciones
/// </summary>
public class PatchNotificationHistoryDto
{
    public int Id { get; set; }
    public int PatchPlanId { get; set; }
    public string ServerName { get; set; } = "";
    public string NotificationType { get; set; } = "";
    public string RecipientEmail { get; set; } = "";
    public string? RecipientName { get; set; }
    public string? Subject { get; set; }
    public DateTime SentAt { get; set; }
    public bool WasSuccessful { get; set; }
    public string? ErrorMessage { get; set; }
}

/// <summary>
/// Request para probar envío de notificación
/// </summary>
public class TestNotificationRequest
{
    public string NotificationType { get; set; } = "";
    public string TestEmail { get; set; } = "";
}

/// <summary>
/// Response con información del mes para freezing
/// </summary>
public class FreezingMonthInfoDto
{
    public int Year { get; set; }
    public int Month { get; set; }
    public string MonthName { get; set; } = "";
    public List<FreezingWeekInfoDto> Weeks { get; set; } = new();
}

/// <summary>
/// Información de una semana del mes
/// </summary>
public class FreezingWeekInfoDto
{
    public int WeekOfMonth { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public bool IsFreezingWeek { get; set; }
    public string? Description { get; set; }
    public int DaysInWeek { get; set; }
}
