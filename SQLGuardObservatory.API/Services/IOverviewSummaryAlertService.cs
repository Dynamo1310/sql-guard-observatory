using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public interface IOverviewSummaryAlertService
{
    /// <summary>
    /// Obtiene la configuración actual de alertas de resumen
    /// </summary>
    Task<OverviewSummaryAlertConfig?> GetConfigAsync();
    
    /// <summary>
    /// Actualiza la configuración de alertas
    /// </summary>
    Task<OverviewSummaryAlertConfig> UpdateConfigAsync(UpdateOverviewSummaryAlertConfigRequest request, string userId, string userDisplayName);
    
    /// <summary>
    /// Obtiene todos los schedules configurados
    /// </summary>
    Task<List<OverviewSummaryAlertSchedule>> GetSchedulesAsync();
    
    /// <summary>
    /// Agrega un nuevo schedule
    /// </summary>
    Task<OverviewSummaryAlertSchedule> AddScheduleAsync(CreateOverviewSummaryAlertScheduleRequest request);
    
    /// <summary>
    /// Actualiza un schedule existente
    /// </summary>
    Task<OverviewSummaryAlertSchedule?> UpdateScheduleAsync(int scheduleId, UpdateOverviewSummaryAlertScheduleRequest request);
    
    /// <summary>
    /// Elimina un schedule
    /// </summary>
    Task<bool> DeleteScheduleAsync(int scheduleId);
    
    /// <summary>
    /// Obtiene el historial de alertas enviadas
    /// </summary>
    Task<List<OverviewSummaryAlertHistory>> GetHistoryAsync(int limit = 20);
    
    /// <summary>
    /// Genera los datos del resumen Overview
    /// </summary>
    Task<OverviewSummaryDataDto> GenerateSummaryDataAsync();
    
    /// <summary>
    /// Envía el resumen por email a todos los destinatarios
    /// </summary>
    Task<OverviewSummaryAlertResult> SendSummaryAsync(int? scheduleId = null, string triggerType = "Manual");
    
    /// <summary>
    /// Envía un email de prueba
    /// </summary>
    Task<OverviewSummaryAlertResult> SendTestEmailAsync();
    
    /// <summary>
    /// Verifica si hay algún schedule que deba ejecutarse ahora
    /// </summary>
    Task CheckAndExecuteSchedulesAsync();
}




