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
    Task<OnCallOperatorDto> AddOperatorAsync(string userId, string requestingUserId);
    
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
    Task AddEscalationUserAsync(string userId, string requestingUserId);

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
}

