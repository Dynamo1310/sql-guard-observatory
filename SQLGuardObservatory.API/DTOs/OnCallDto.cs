namespace SQLGuardObservatory.API.DTOs;

// ==================== OPERATOR DTOs ====================

public class OnCallOperatorDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int RotationOrder { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class AddOperatorRequest
{
    public string UserId { get; set; } = string.Empty;
}

public class ReorderOperatorsRequest
{
    public List<OperatorOrderItem> Orders { get; set; } = new();
}

public class OperatorOrderItem
{
    public int Id { get; set; }
    public int Order { get; set; }
}

// ==================== SCHEDULE DTOs ====================

public class OnCallScheduleDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public DateTime WeekStartDate { get; set; }
    public DateTime WeekEndDate { get; set; }
    public int WeekNumber { get; set; }
    public int Year { get; set; }
    public bool IsOverride { get; set; }
    public string? ModifiedByDisplayName { get; set; }
    public DateTime CreatedAt { get; set; }
}

public class GenerateScheduleRequest
{
    /// <summary>
    /// Fecha de inicio para generar el calendario (debe ser un miércoles)
    /// </summary>
    public DateTime StartDate { get; set; }
    
    /// <summary>
    /// Número de semanas a generar (por defecto todo el año)
    /// </summary>
    public int? WeeksToGenerate { get; set; }
}

public class UpdateScheduleRequest
{
    /// <summary>
    /// Nuevo usuario asignado a la guardia
    /// </summary>
    public string UserId { get; set; } = string.Empty;
    
    /// <summary>
    /// Razón del cambio (opcional)
    /// </summary>
    public string? Reason { get; set; }
}

public class OnCallCurrentDto
{
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public DateTime WeekStartDate { get; set; }
    public DateTime WeekEndDate { get; set; }
    public int WeekNumber { get; set; }
    public bool IsCurrentlyOnCall { get; set; }
    
    /// <summary>
    /// Usuarios de escalamiento disponibles
    /// </summary>
    public List<EscalationUserDto> EscalationUsers { get; set; } = new();
}

public class EscalationUserDto
{
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int Order { get; set; }
}

public class UpdateEscalationOrderRequest
{
    public List<string> UserIds { get; set; } = new();
}

// ==================== SWAP REQUEST DTOs ====================

public class OnCallSwapRequestDto
{
    public int Id { get; set; }
    
    // Solicitante
    public string RequesterId { get; set; } = string.Empty;
    public string RequesterDomainUser { get; set; } = string.Empty;
    public string RequesterDisplayName { get; set; } = string.Empty;
    
    // Usuario objetivo
    public string TargetUserId { get; set; } = string.Empty;
    public string TargetDomainUser { get; set; } = string.Empty;
    public string TargetDisplayName { get; set; } = string.Empty;
    
    // Guardia original
    public int OriginalScheduleId { get; set; }
    public DateTime OriginalWeekStartDate { get; set; }
    public DateTime OriginalWeekEndDate { get; set; }
    
    // Guardia a intercambiar (si aplica)
    public int? SwapScheduleId { get; set; }
    public DateTime? SwapWeekStartDate { get; set; }
    public DateTime? SwapWeekEndDate { get; set; }
    
    public string Status { get; set; } = string.Empty;
    public string? RejectionReason { get; set; }
    public string? RequestReason { get; set; }
    public DateTime RequestedAt { get; set; }
    public DateTime? RespondedAt { get; set; }
    public bool IsEscalationOverride { get; set; }
}

public class CreateSwapRequestDto
{
    /// <summary>
    /// ID de la guardia que se quiere intercambiar
    /// </summary>
    public int OriginalScheduleId { get; set; }
    
    /// <summary>
    /// Usuario al que se le solicita cubrir la guardia
    /// </summary>
    public string TargetUserId { get; set; } = string.Empty;
    
    /// <summary>
    /// ID de la guardia que se ofrece a cambio (opcional)
    /// </summary>
    public int? SwapScheduleId { get; set; }
    
    /// <summary>
    /// Razón de la solicitud (ej: vacaciones, evento personal, etc.)
    /// </summary>
    public string? Reason { get; set; }
}

public class RejectSwapRequestDto
{
    public string Reason { get; set; } = string.Empty;
}

// ==================== CALENDAR VIEW DTOs ====================

public class MonthCalendarDto
{
    public int Year { get; set; }
    public int Month { get; set; }
    public string MonthName { get; set; } = string.Empty;
    public List<CalendarDayDto> Days { get; set; } = new();
    public List<OnCallWeekDto> OnCallWeeks { get; set; } = new();
}

public class CalendarDayDto
{
    public DateTime Date { get; set; }
    public int DayOfMonth { get; set; }
    public bool IsCurrentMonth { get; set; }
    public bool IsToday { get; set; }
    public bool IsOnCallStart { get; set; }
    public bool IsOnCallEnd { get; set; }
    public string? OnCallUserId { get; set; }
    public string? OnCallDisplayName { get; set; }
    public string? ColorCode { get; set; }
}

public class OnCallWeekDto
{
    public int ScheduleId { get; set; }
    public DateTime WeekStartDate { get; set; }
    public DateTime WeekEndDate { get; set; }
    public int WeekNumber { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string ColorCode { get; set; } = string.Empty;
    public bool IsCurrentWeek { get; set; }
}

// ==================== WHITELIST USERS DTO ====================

public class WhitelistUserDto
{
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool IsOperator { get; set; }
    public bool IsEscalation { get; set; }
}

