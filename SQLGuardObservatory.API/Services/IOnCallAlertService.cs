namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para disparar alertas configuradas por los usuarios basadas en eventos de guardias
/// </summary>
public interface IOnCallAlertService
{
    /// <summary>
    /// Dispara alertas de tipo ScheduleGenerated
    /// </summary>
    Task TriggerScheduleGeneratedAlertsAsync(DateTime startDate, DateTime endDate, int weeksGenerated);

    /// <summary>
    /// Dispara alertas de tipo SwapRequested
    /// </summary>
    Task TriggerSwapRequestedAlertsAsync(
        string requesterName,
        string targetUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason,
        int swapRequestId);

    /// <summary>
    /// Dispara alertas de tipo SwapApproved
    /// </summary>
    Task TriggerSwapApprovedAlertsAsync(
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd);

    /// <summary>
    /// Dispara alertas de tipo SwapRejected
    /// </summary>
    Task TriggerSwapRejectedAlertsAsync(
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);

    /// <summary>
    /// Dispara alertas de tipo ScheduleModified
    /// </summary>
    Task TriggerScheduleModifiedAlertsAsync(
        string operatorName,
        string modifiedByName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);

    /// <summary>
    /// Dispara alertas de tipo ActivationCreated
    /// </summary>
    Task TriggerActivationCreatedAlertsAsync(
        string operatorName,
        DateTime activatedAt,
        string category,
        string severity,
        string title,
        string? instanceName);

    /// <summary>
    /// Verifica y dispara alertas de tipo DaysRemaining
    /// Debe ser llamado por un job programado diariamente
    /// </summary>
    Task CheckAndTriggerDaysRemainingAlertsAsync();

    /// <summary>
    /// Envía email al aprobador notificando que hay un calendario pendiente de aprobación
    /// </summary>
    Task SendSchedulePendingApprovalEmailAsync(
        string approverEmail,
        string approverName,
        string generatedByName,
        DateTime startDate,
        DateTime endDate,
        int weeksGenerated,
        int batchId);

    /// <summary>
    /// Envía la notificación semanal de guardia (miércoles 12:00)
    /// Notifica quién ENTRA de guardia ese mismo día a las 19:00
    /// </summary>
    Task SendWeeklyNotificationAsync();

    /// <summary>
    /// Envía el aviso previo de guardia (martes 16:00)
    /// Notifica quién entrará de guardia al día siguiente a las 19:00
    /// </summary>
    Task SendPreWeekNotificationAsync();

    /// <summary>
    /// Envía un email de prueba a una dirección específica usando un template
    /// </summary>
    Task SendTestEmailAsync(int templateId, string testEmail);
}

