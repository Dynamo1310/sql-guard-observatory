namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para enviar notificaciones a Microsoft Teams
/// Soporta Incoming Webhooks (canales) y Graph API (mensajes directos)
/// </summary>
public interface ITeamsNotificationService
{
    // ==================== ALERTAS ====================

    /// <summary>
    /// Envía alerta crítica a Teams (canal y/o usuario de guardia)
    /// </summary>
    Task SendCriticalAlertAsync(
        string instanceName,
        int healthScore,
        string alertType,
        string message,
        string? onCallUserEmail = null);

    /// <summary>
    /// Envía notificación de alerta resuelta
    /// </summary>
    Task SendAlertResolvedAsync(
        string instanceName,
        string alertType,
        string message);

    // ==================== GUARDIAS (ON-CALL) ====================

    /// <summary>
    /// Notifica solicitud de intercambio de guardia
    /// </summary>
    Task SendSwapRequestNotificationAsync(
        string targetUserEmail,
        string targetUserName,
        string requesterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason,
        int swapRequestId);

    /// <summary>
    /// Notifica aprobación de intercambio
    /// </summary>
    Task SendSwapApprovedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd);

    /// <summary>
    /// Notifica rechazo de intercambio
    /// </summary>
    Task SendSwapRejectedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);

    /// <summary>
    /// Notifica inicio de guardia a un operador
    /// </summary>
    Task SendOnCallStartNotificationAsync(
        string operatorEmail,
        string operatorName,
        DateTime weekStart,
        DateTime weekEnd);

    /// <summary>
    /// Notifica modificación de guardia por escalamiento
    /// </summary>
    Task SendEscalationOverrideNotificationAsync(
        string affectedUserEmail,
        string affectedUserName,
        string escalationUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason);

    // ==================== JOBS ====================

    /// <summary>
    /// Notifica job fallido
    /// </summary>
    Task SendJobFailedNotificationAsync(
        string instanceName,
        string jobName,
        DateTime failedAt,
        string? errorMessage);

    // ==================== CANAL ====================

    /// <summary>
    /// Envía mensaje genérico al canal de Teams
    /// </summary>
    Task SendChannelMessageAsync(
        string title,
        string message,
        string color = "default");

    // ==================== MENSAJE DIRECTO ====================

    /// <summary>
    /// Envía mensaje directo a un usuario específico
    /// </summary>
    Task SendDirectMessageAsync(
        string userEmail,
        string title,
        string message,
        string? actionUrl = null,
        string? actionText = null);

    // ==================== HEALTH CHECK ====================

    /// <summary>
    /// Verifica conectividad con Teams
    /// </summary>
    Task<bool> TestConnectionAsync();
}









