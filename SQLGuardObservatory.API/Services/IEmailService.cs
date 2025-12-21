namespace SQLGuardObservatory.API.Services;

public interface IEmailService
{
    /// <summary>
    /// Envía notificación de solicitud de intercambio al usuario objetivo
    /// </summary>
    Task SendSwapRequestNotificationAsync(
        string targetEmail,
        string targetName,
        string requesterName,
        DateTime originalWeekStart,
        DateTime originalWeekEnd,
        string? reason);

    /// <summary>
    /// Envía notificación de aprobación de intercambio al solicitante
    /// </summary>
    Task SendSwapApprovedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd);

    /// <summary>
    /// Envía notificación de rechazo de intercambio al solicitante
    /// </summary>
    Task SendSwapRejectedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);

    /// <summary>
    /// Envía notificación cuando un usuario de escalamiento modifica una guardia
    /// </summary>
    Task SendEscalationOverrideNotificationAsync(
        string affectedUserEmail,
        string affectedUserName,
        string escalationUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);
}






