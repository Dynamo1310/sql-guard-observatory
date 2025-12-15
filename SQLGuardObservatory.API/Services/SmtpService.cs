using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class SmtpService : ISmtpService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<SmtpService> _logger;

    public SmtpService(ApplicationDbContext context, ILogger<SmtpService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<SmtpSettingsDto?> GetSettingsAsync()
    {
        var settings = await _context.SmtpSettings
            .Include(s => s.UpdatedByUser)
            .FirstOrDefaultAsync(s => s.IsActive);

        if (settings == null) return null;

        return new SmtpSettingsDto
        {
            Id = settings.Id,
            Host = settings.Host,
            Port = settings.Port,
            FromEmail = settings.FromEmail,
            FromName = settings.FromName,
            EnableSsl = settings.EnableSsl,
            Username = settings.Username,
            HasPassword = !string.IsNullOrEmpty(settings.Password),
            IsActive = settings.IsActive,
            CreatedAt = settings.CreatedAt,
            UpdatedAt = settings.UpdatedAt,
            UpdatedByDisplayName = settings.UpdatedByUser?.DisplayName
        };
    }

    public async Task<SmtpSettingsDto> UpdateSettingsAsync(UpdateSmtpSettingsRequest request, string userId)
    {
        var settings = await _context.SmtpSettings.FirstOrDefaultAsync(s => s.IsActive);

        if (settings == null)
        {
            settings = new SmtpSettingsEntity
            {
                Host = request.Host,
                Port = request.Port,
                FromEmail = request.FromEmail,
                FromName = request.FromName,
                EnableSsl = request.EnableSsl,
                Username = request.Username,
                Password = request.Password,
                IsActive = true,
                UpdatedByUserId = userId,
                UpdatedAt = DateTime.Now
            };
            _context.SmtpSettings.Add(settings);
        }
        else
        {
            settings.Host = request.Host;
            settings.Port = request.Port;
            settings.FromEmail = request.FromEmail;
            settings.FromName = request.FromName;
            settings.EnableSsl = request.EnableSsl;
            settings.Username = request.Username;
            
            // Solo actualizar contraseña si se proporciona
            if (!string.IsNullOrEmpty(request.Password))
            {
                settings.Password = request.Password;
            }
            
            settings.UpdatedByUserId = userId;
            settings.UpdatedAt = DateTime.Now;
        }

        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Configuración SMTP actualizada por {UserId}", userId);

        return (await GetSettingsAsync())!;
    }

    public async Task<bool> TestConnectionAsync(string testEmail)
    {
        try
        {
            var success = await SendEmailAsync(
                testEmail,
                null,
                "[SQLNova] Email de Prueba",
                GetTestEmailBody(),
                "Test"
            );
            
            return success;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en prueba de conexión SMTP");
            return false;
        }
    }

    public async Task<bool> SendEmailAsync(string toEmail, string? toName, string subject, string htmlBody,
        string notificationType, string? referenceType = null, int? referenceId = null)
    {
        var settings = await _context.SmtpSettings.FirstOrDefaultAsync(s => s.IsActive);
        
        if (settings == null)
        {
            _logger.LogWarning("No hay configuración SMTP activa");
            await LogNotification(toEmail, toName, subject, htmlBody, "Failed", "No hay configuración SMTP activa", notificationType, referenceType, referenceId);
            return false;
        }

        try
        {
            using var client = new SmtpClient(settings.Host, settings.Port);

            if (!string.IsNullOrEmpty(settings.Username))
            {
                client.Credentials = new NetworkCredential(settings.Username, settings.Password);
            }

            client.EnableSsl = settings.EnableSsl;
            client.DeliveryMethod = SmtpDeliveryMethod.Network;

            var message = new MailMessage
            {
                From = new MailAddress(settings.FromEmail, settings.FromName),
                Subject = subject,
                Body = htmlBody,
                IsBodyHtml = true
            };

            message.To.Add(new MailAddress(toEmail, toName));

            await client.SendMailAsync(message);

            _logger.LogInformation("Email enviado a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, toName, subject, htmlBody, "Sent", null, notificationType, referenceType, referenceId);
            
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar email a {Email}", toEmail);
            await LogNotification(toEmail, toName, subject, htmlBody, "Failed", ex.Message, notificationType, referenceType, referenceId);
            return false;
        }
    }

    private async Task LogNotification(string toEmail, string? toName, string subject, string? body,
        string status, string? errorMessage, string notificationType, string? referenceType, int? referenceId)
    {
        var log = new NotificationLog
        {
            NotificationType = notificationType,
            ToEmail = toEmail,
            ToName = toName,
            Subject = subject,
            Body = body,
            Status = status,
            ErrorMessage = errorMessage,
            ReferenceType = referenceType,
            ReferenceId = referenceId,
            SentAt = DateTime.Now
        };

        _context.NotificationLogs.Add(log);
        await _context.SaveChangesAsync();
    }

    private string GetTestEmailBody()
    {
        return @"
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #10b981; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }
        .footer { background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }
        .success { color: #10b981; }
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>✓ Conexión Exitosa</h1>
        </div>
        <div class='content'>
            <h2 class='success'>La configuración SMTP funciona correctamente</h2>
            <p>Este email confirma que la configuración de correo de SQLNova App está funcionando.</p>
            <p>A partir de ahora, el sistema podrá enviar:</p>
            <ul>
                <li>Notificaciones de cambios de guardia</li>
                <li>Alertas de planificación</li>
                <li>Solicitudes de intercambio</li>
                <li>Registro de activaciones</li>
            </ul>
        </div>
        <div class='footer'>
            SQLNova App<br/>
            Email de prueba - " + DateTime.Now.ToString("dd/MM/yyyy HH:mm:ss") + @"
        </div>
    </div>
</body>
</html>";
    }
}

