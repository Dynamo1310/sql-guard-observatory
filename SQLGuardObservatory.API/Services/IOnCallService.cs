using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IOnCallService
{
    // ==================== OPERATORS ====================
    
    /// <summary>
    /// Obtiene todos los operadores de guardia
    /// </summary>
    Task<List<OnCallOperatorDto>> GetOperatorsAsync();
    
    /// <summary>
    /// Agrega un usuario como operador de guardia
    /// </summary>
    Task<OnCallOperatorDto> AddOperatorAsync(string userId, string requestingUserId, string? colorCode = null, string? phoneNumber = null);
    
    /// <summary>
    /// Actualiza el color de un operador
    /// </summary>
    Task UpdateOperatorColorAsync(int operatorId, string colorCode, string requestingUserId);

    /// <summary>
    /// Actualiza el teléfono de un operador
    /// </summary>
    Task UpdateOperatorPhoneAsync(int operatorId, string? phoneNumber, string requestingUserId);
    
    /// <summary>
    /// Elimina un operador de guardia
    /// </summary>
    Task RemoveOperatorAsync(int operatorId, string requestingUserId);
    
    /// <summary>
    /// Reordena los operadores de guardia
    /// </summary>
    Task ReorderOperatorsAsync(List<OperatorOrderItem> orders, string requestingUserId);
    
    // ==================== SCHEDULE ====================
    
    /// <summary>
    /// Obtiene el calendario de guardias para un mes específico
    /// </summary>
    Task<MonthCalendarDto> GetMonthCalendarAsync(int year, int month);
    
    /// <summary>
    /// Obtiene todas las guardias para un rango de fechas
    /// </summary>
    Task<List<OnCallScheduleDto>> GetSchedulesAsync(DateTime startDate, DateTime endDate);
    
    /// <summary>
    /// Genera el calendario de guardias automáticamente
    /// </summary>
    Task GenerateScheduleAsync(DateTime startDate, int weeksToGenerate, string requestingUserId);
    
    /// <summary>
    /// Actualiza una guardia específica (solo usuarios de escalamiento)
    /// </summary>
    Task UpdateScheduleAsync(int scheduleId, string newUserId, string requestingUserId, string? reason);
    
    /// <summary>
    /// Obtiene quién está de guardia actualmente
    /// </summary>
    Task<OnCallCurrentDto> GetCurrentOnCallAsync();

    /// <summary>
    /// Obtiene la guardia para una fecha específica
    /// </summary>
    Task<OnCallScheduleDto?> GetScheduleByDateAsync(DateTime date);

    /// <summary>
    /// Obtiene las guardias futuras de un usuario específico
    /// </summary>
    Task<List<OnCallScheduleDto>> GetUserSchedulesAsync(string userId);
    
    // ==================== SWAP REQUESTS ====================
    
    /// <summary>
    /// Obtiene las solicitudes de intercambio (filtradas por usuario si no es escalamiento)
    /// </summary>
    Task<List<OnCallSwapRequestDto>> GetSwapRequestsAsync(string userId);
    
    /// <summary>
    /// Crea una solicitud de intercambio
    /// </summary>
    Task<OnCallSwapRequestDto> CreateSwapRequestAsync(CreateSwapRequestDto request, string requesterId);
    
    /// <summary>
    /// Aprueba una solicitud de intercambio
    /// </summary>
    Task ApproveSwapRequestAsync(int requestId, string approverId);
    
    /// <summary>
    /// Rechaza una solicitud de intercambio
    /// </summary>
    Task RejectSwapRequestAsync(int requestId, string rejecterId, string reason);
    
    // ==================== UTILITIES ====================
    
    /// <summary>
    /// Obtiene todos los usuarios de la lista blanca disponibles para ser operadores
    /// </summary>
    Task<List<WhitelistUserDto>> GetWhitelistUsersAsync();
    
    /// <summary>
    /// Verifica si un usuario es guardia de escalamiento
    /// </summary>
    Task<bool> IsEscalationUserAsync(string userId);

    /// <summary>
    /// Obtiene los usuarios de escalamiento
    /// </summary>
    Task<List<EscalationUserDto>> GetEscalationUsersAsync();

    /// <summary>
    /// Agrega un usuario como guardia de escalamiento
    /// </summary>
    Task<EscalationUserDto> AddEscalationUserAsync(string userId, string requestingUserId, string? colorCode = null, string? phoneNumber = null);

    /// <summary>
    /// Actualiza un usuario de escalamiento (color y/o teléfono)
    /// </summary>
    Task UpdateEscalationUserAsync(int escalationId, UpdateEscalationUserRequest request, string requestingUserId);

    /// <summary>
    /// Actualiza el orden de los usuarios de escalamiento
    /// </summary>
    Task UpdateEscalationOrderAsync(List<string> userIds, string requestingUserId);

    /// <summary>
    /// Quita un usuario de guardia de escalamiento
    /// </summary>
    Task RemoveEscalationUserAsync(string userId, string requestingUserId);

    /// <summary>
    /// Verifica si un usuario puede gestionar escalamiento (es escalamiento o SuperAdmin)
    /// </summary>
    Task<bool> CanManageEscalationAsync(string userId);

    // ==================== CONFIGURATION ====================
    
    /// <summary>
    /// Obtiene la configuración de guardias
    /// </summary>
    Task<OnCallConfigDto> GetConfigAsync();

    /// <summary>
    /// Actualiza la configuración de guardias
    /// </summary>
    Task UpdateConfigAsync(UpdateOnCallConfigRequest request, string userId);

    // ==================== HOLIDAYS ====================

    /// <summary>
    /// Obtiene todos los feriados
    /// </summary>
    Task<List<OnCallHolidayDto>> GetHolidaysAsync();

    /// <summary>
    /// Crea un nuevo feriado
    /// </summary>
    Task<OnCallHolidayDto> CreateHolidayAsync(CreateHolidayRequest request, string userId);

    /// <summary>
    /// Actualiza un feriado existente
    /// </summary>
    Task UpdateHolidayAsync(int id, UpdateHolidayRequest request, string userId);

    /// <summary>
    /// Elimina un feriado
    /// </summary>
    Task DeleteHolidayAsync(int id, string userId);

    // ==================== DAY OVERRIDES ====================

    /// <summary>
    /// Obtiene las coberturas por día para un rango de fechas
    /// </summary>
    Task<List<OnCallDayOverrideDto>> GetDayOverridesAsync(DateTime startDate, DateTime endDate);

    /// <summary>
    /// Crea una cobertura para un día específico (solo escalamiento)
    /// </summary>
    Task<OnCallDayOverrideDto> CreateDayOverrideAsync(CreateDayOverrideRequest request, string userId);

    /// <summary>
    /// Elimina una cobertura de día específico (solo escalamiento)
    /// </summary>
    Task DeleteDayOverrideAsync(int id, string userId);

    /// <summary>
    /// Obtiene el operador de guardia para una fecha específica (considerando overrides)
    /// </summary>
    Task<string?> GetOnCallUserIdForDateAsync(DateTime date);

    // ==================== EMAIL TEMPLATES ====================

    /// <summary>
    /// Obtiene todos los templates de email
    /// </summary>
    Task<List<OnCallEmailTemplateDto>> GetEmailTemplatesAsync();

    /// <summary>
    /// Obtiene un template de email por ID
    /// </summary>
    Task<OnCallEmailTemplateDto?> GetEmailTemplateAsync(int id);

    /// <summary>
    /// Crea un nuevo template de email
    /// </summary>
    Task<OnCallEmailTemplateDto> CreateEmailTemplateAsync(CreateEmailTemplateRequest request, string userId);

    /// <summary>
    /// Actualiza un template de email existente
    /// </summary>
    Task<OnCallEmailTemplateDto> UpdateEmailTemplateAsync(int id, UpdateEmailTemplateRequest request, string userId);

    /// <summary>
    /// Elimina un template de email
    /// </summary>
    Task DeleteEmailTemplateAsync(int id);

    // ==================== SCHEDULE BATCHES ====================

    /// <summary>
    /// Obtiene todos los lotes de calendario
    /// </summary>
    Task<List<OnCallScheduleBatchDto>> GetScheduleBatchesAsync();

    /// <summary>
    /// Obtiene los lotes pendientes de aprobación
    /// </summary>
    Task<List<OnCallScheduleBatchDto>> GetPendingBatchesAsync();

    /// <summary>
    /// Aprueba un lote de calendario
    /// </summary>
    Task ApproveScheduleBatchAsync(int batchId, string userId);

    /// <summary>
    /// Rechaza un lote de calendario
    /// </summary>
    Task RejectScheduleBatchAsync(int batchId, string userId, string reason);
}

