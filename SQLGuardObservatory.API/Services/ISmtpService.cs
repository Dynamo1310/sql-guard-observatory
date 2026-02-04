using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface ISmtpService
{
    /// <summary>
    /// Obtiene la configuración SMTP activa
    /// </summary>
    Task<SmtpSettingsDto?> GetSettingsAsync();

    /// <summary>
    /// Actualiza la configuración SMTP
    /// </summary>
    Task<SmtpSettingsDto> UpdateSettingsAsync(UpdateSmtpSettingsRequest request, string userId);

    /// <summary>
    /// Envía un email de prueba
    /// </summary>
    Task<bool> TestConnectionAsync(string testEmail);

    /// <summary>
    /// Envía un email
    /// </summary>
    Task<bool> SendEmailAsync(string toEmail, string? toName, string subject, string htmlBody, 
        string notificationType, string? referenceType = null, int? referenceId = null,
        byte[]? attachmentData = null, string? attachmentName = null);

    /// <summary>
    /// Envía un email a múltiples destinatarios con soporte para CC.
    /// Un solo email es enviado con todos los destinatarios TO y CC.
    /// </summary>
    Task<bool> SendEmailWithCcAsync(
        IEnumerable<string> toEmails, 
        IEnumerable<string>? ccEmails,
        string subject, 
        string htmlBody,
        string notificationType,
        string? referenceType = null, 
        int? referenceId = null);
}








