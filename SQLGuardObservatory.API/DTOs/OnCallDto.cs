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
    public string? ProfilePhotoUrl { get; set; }
    /// <summary>
    /// Color asignado al operador en formato hexadecimal (#RRGGBB)
    /// </summary>
    public string? ColorCode { get; set; }
    /// <summary>
    /// Número de teléfono del operador
    /// </summary>
    public string? PhoneNumber { get; set; }
}

public class AddOperatorRequest
{
    public string UserId { get; set; } = string.Empty;
    /// <summary>
    /// Color opcional para el operador en formato hexadecimal (#RRGGBB)
    /// </summary>
    public string? ColorCode { get; set; }
    /// <summary>
    /// Número de teléfono del operador
    /// </summary>
    public string? PhoneNumber { get; set; }
}

public class UpdateOperatorPhoneRequest
{
    /// <summary>
    /// Número de teléfono del operador
    /// </summary>
    public string? PhoneNumber { get; set; }
}

public class UpdateOperatorColorRequest
{
    /// <summary>
    /// Color del operador en formato hexadecimal (#RRGGBB)
    /// </summary>
    public string ColorCode { get; set; } = string.Empty;
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
    /// <summary>
    /// Número de teléfono del operador de guardia
    /// </summary>
    public string? PhoneNumber { get; set; }
    /// <summary>
    /// Color asignado al operador
    /// </summary>
    public string? ColorCode { get; set; }
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
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public int Order { get; set; }
    /// <summary>
    /// Color asignado en formato hexadecimal (#RRGGBB)
    /// </summary>
    public string? ColorCode { get; set; }
    /// <summary>
    /// Número de teléfono para contacto
    /// </summary>
    public string? PhoneNumber { get; set; }
}

public class AddEscalationUserRequest
{
    public string UserId { get; set; } = string.Empty;
    public string? ColorCode { get; set; }
    public string? PhoneNumber { get; set; }
}

public class UpdateEscalationUserRequest
{
    public string? ColorCode { get; set; }
    public string? PhoneNumber { get; set; }
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
    public string? ProfilePhotoUrl { get; set; }
}

// ==================== CONFIGURATION DTOs ====================

public class OnCallConfigDto
{
    public bool RequiresApproval { get; set; }
    public string? ApproverId { get; set; }
    public string? ApproverDisplayName { get; set; }
    public int? ApproverGroupId { get; set; }
    public string? ApproverGroupName { get; set; }
    /// <summary>
    /// Días mínimos de anticipación para que operadores soliciten intercambios
    /// </summary>
    public int MinDaysForSwapRequest { get; set; }
    /// <summary>
    /// Días mínimos de anticipación para que escalamiento modifique guardias
    /// </summary>
    public int MinDaysForEscalationModify { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

public class UpdateOnCallConfigRequest
{
    public bool RequiresApproval { get; set; }
    public string? ApproverId { get; set; }
    public int? ApproverGroupId { get; set; }
    /// <summary>
    /// Días mínimos de anticipación para que operadores soliciten intercambios
    /// </summary>
    public int MinDaysForSwapRequest { get; set; } = 7;
    /// <summary>
    /// Días mínimos de anticipación para que escalamiento modifique guardias
    /// </summary>
    public int MinDaysForEscalationModify { get; set; } = 0;
}

// ==================== HOLIDAY DTOs ====================

public class OnCallHolidayDto
{
    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsRecurring { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByDisplayName { get; set; }
}

public class CreateHolidayRequest
{
    public DateTime Date { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsRecurring { get; set; }
}

public class UpdateHolidayRequest
{
    public DateTime Date { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsRecurring { get; set; }
}

// ==================== DAY OVERRIDE DTOs ====================

/// <summary>
/// DTO para mostrar una cobertura de día específico
/// </summary>
public class OnCallDayOverrideDto
{
    public int Id { get; set; }
    public DateTime Date { get; set; }
    public string OriginalUserId { get; set; } = string.Empty;
    public string OriginalDisplayName { get; set; } = string.Empty;
    public string CoverUserId { get; set; } = string.Empty;
    public string CoverDisplayName { get; set; } = string.Empty;
    public string? CoverPhoneNumber { get; set; }
    public string? CoverColorCode { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedByDisplayName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
}

/// <summary>
/// Request para crear una cobertura de día específico
/// </summary>
public class CreateDayOverrideRequest
{
    /// <summary>
    /// Fecha del día a cubrir
    /// </summary>
    public DateTime Date { get; set; }
    
    /// <summary>
    /// ID del operador que cubrirá ese día
    /// </summary>
    public string CoverUserId { get; set; } = string.Empty;
    
    /// <summary>
    /// Motivo de la cobertura (opcional)
    /// </summary>
    public string? Reason { get; set; }
}

// ==================== EMAIL TEMPLATE DTOs ====================

/// <summary>
/// DTO para templates de email configurables
/// </summary>
public class OnCallEmailTemplateDto
{
    public int Id { get; set; }
    public string AlertType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool AttachExcel { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsDefault { get; set; }
    public bool IsScheduled { get; set; }
    public string? ScheduleCron { get; set; }
    public string? ScheduleDescription { get; set; }
    public string? Recipients { get; set; }
    public string? LinkPlanillaGuardias { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByDisplayName { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? UpdatedByDisplayName { get; set; }
}

/// <summary>
/// Request para crear un template de email
/// </summary>
public class CreateEmailTemplateRequest
{
    public string AlertType { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool AttachExcel { get; set; }
    public bool IsEnabled { get; set; } = true;
    public bool IsScheduled { get; set; }
    public string? ScheduleCron { get; set; }
    public string? ScheduleDescription { get; set; }
    public string? Recipients { get; set; }
    public string? LinkPlanillaGuardias { get; set; }
}

/// <summary>
/// Request para actualizar un template de email
/// </summary>
public class UpdateEmailTemplateRequest
{
    public string Name { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public bool AttachExcel { get; set; }
    public bool IsEnabled { get; set; }
    public bool IsScheduled { get; set; }
    public string? ScheduleCron { get; set; }
    public string? ScheduleDescription { get; set; }
    public string? Recipients { get; set; }
    public string? LinkPlanillaGuardias { get; set; }
}

/// <summary>
/// Request para enviar email de prueba
/// </summary>
public class SendTestEmailRequest
{
    public string TestEmail { get; set; } = string.Empty;
}

/// <summary>
/// Información de placeholders disponibles para un tipo de alerta
/// </summary>
public class EmailTemplatePlaceholderInfo
{
    public string AlertType { get; set; } = string.Empty;
    public string AlertTypeName { get; set; } = string.Empty;
    public List<PlaceholderDto> Placeholders { get; set; } = new();
}

public class PlaceholderDto
{
    public string Key { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Example { get; set; } = string.Empty;
}

// ==================== SCHEDULE BATCH DTOs ====================

/// <summary>
/// DTO para lotes de generación de calendario
/// </summary>
public class OnCallScheduleBatchDto
{
    public int Id { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime EndDate { get; set; }
    public int WeeksGenerated { get; set; }
    public string Status { get; set; } = string.Empty;
    public string GeneratedByDisplayName { get; set; } = string.Empty;
    public DateTime GeneratedAt { get; set; }
    public string? ApproverDisplayName { get; set; }
    public DateTime? ApprovedAt { get; set; }
    public string? ApprovedByDisplayName { get; set; }
    public string? RejectionReason { get; set; }
}

/// <summary>
/// Request para aprobar un lote de calendario
/// </summary>
public class ApproveScheduleBatchRequest
{
    // No requiere datos adicionales, solo el ID en la URL
}

/// <summary>
/// Request para rechazar un lote de calendario
/// </summary>
public class RejectScheduleBatchRequest
{
    public string Reason { get; set; } = string.Empty;
}

