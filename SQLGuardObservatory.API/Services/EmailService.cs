using System.Net;
using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class EmailService : IEmailService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<EmailService> _logger;
    private readonly string _appUrl;

    public EmailService(ApplicationDbContext context, IConfiguration configuration, ILogger<EmailService> logger)
    {
        _context = context;
        _logger = logger;
        _appUrl = configuration["AppUrl"] ?? "http://asprbm-nov-01:5173";
    }

    public async Task SendSwapRequestNotificationAsync(
        string targetEmail,
        string targetName,
        string requesterName,
        DateTime originalWeekStart,
        DateTime originalWeekEnd,
        string? reason)
    {
        var subject = $"[SQLNova] Solicitud de Intercambio de Guardia DBA";
        
        var body = $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2563eb; }}
        .warning {{ color: #dc2626; font-weight: bold; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Solicitud de Intercambio de Guardia</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{targetName}</strong>,</p>
            
            <p>Has recibido una solicitud de intercambio de guardia DBA.</p>
            
            <div class='info-box'>
                <strong>Guardia solicitada:</strong><br/>
                Desde: {originalWeekStart:dddd dd/MM/yyyy HH:mm}<br/>
                Hasta: {originalWeekEnd:dddd dd/MM/yyyy HH:mm}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo:</strong> {reason}</p>")}
            
            <p>Por favor, ingresa a la aplicación para <strong>aprobar o rechazar</strong> esta solicitud.</p>
            
            <p class='warning'>Recuerda que tienes 48 horas para responder antes de que la solicitud expire.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Solicitud en SQLNova</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";

        await SendEmailAsync(targetEmail, subject, body, "SwapRequest", "SwapRequest");
    }

    public async Task SendSwapApprovedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string approverName,
        DateTime weekStart,
        DateTime weekEnd)
    {
        var subject = $"[SQLNova] Tu solicitud de intercambio fue APROBADA";
        
        var body = $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #16a34a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #16a34a; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #16a34a; }}
        .success {{ color: #16a34a; font-weight: bold; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Intercambio Aprobado</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{requesterName}</strong>,</p>
            
            <p class='success'>Tu solicitud de intercambio de guardia ha sido aprobada.</p>
            
            <div class='info-box'>
                <strong>Guardia intercambiada:</strong><br/>
                Desde: {weekStart:dddd dd/MM/yyyy HH:mm}<br/>
                Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}
            </div>
            
            <p>El calendario de guardias ha sido actualizado automáticamente.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";

        await SendEmailAsync(requesterEmail, subject, body, "SwapApproved", "SwapRequest");
    }

    public async Task SendSwapRejectedNotificationAsync(
        string requesterEmail,
        string requesterName,
        string rejecterName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var subject = $"[SQLNova] Tu solicitud de intercambio fue RECHAZADA";
        
        var body = $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #dc2626; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Intercambio Rechazado</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{requesterName}</strong>,</p>
            
            <p>Tu solicitud de intercambio de guardia ha sido rechazada.</p>
            
            <div class='info-box'>
                <strong>Guardia solicitada:</strong><br/>
                Desde: {weekStart:dddd dd/MM/yyyy HH:mm}<br/>
                Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo del rechazo:</strong> {reason}</p>")}
            
            <p>Puedes intentar solicitar el intercambio con otro operador.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";

        await SendEmailAsync(requesterEmail, subject, body, "SwapRejected", "SwapRequest");
    }

    public async Task SendEscalationOverrideNotificationAsync(
        string affectedUserEmail,
        string affectedUserName,
        string escalationUserName,
        DateTime weekStart,
        DateTime weekEnd,
        string? reason)
    {
        var subject = $"[SQLNova] Tu guardia DBA ha sido modificada";
        
        var body = $@"
<!DOCTYPE html>
<html>
<head>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #f59e0b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }}
        .content {{ background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; }}
        .btn {{ display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin-top: 15px; }}
        .info-box {{ background-color: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #f59e0b; }}
    </style>
</head>
<body>
    <div class='container'>
        <div class='header'>
            <h1>Modificación de Guardia</h1>
        </div>
        <div class='content'>
            <p>Hola <strong>{affectedUserName}</strong>,</p>
            
            <p>Un usuario de escalamiento ha modificado tu asignación de guardia.</p>
            
            <div class='info-box'>
                <strong>Guardia afectada:</strong><br/>
                Desde: {weekStart:dddd dd/MM/yyyy HH:mm}<br/>
                Hasta: {weekEnd:dddd dd/MM/yyyy HH:mm}
            </div>
            
            {(string.IsNullOrEmpty(reason) ? "" : $"<p><strong>Motivo:</strong> {reason}</p>")}
            
            <p>Por favor, revisa el calendario actualizado para ver los cambios.</p>
            
            <a href='{_appUrl}/oncall' class='btn'>Ver Calendario de Guardias</a>
        </div>
        <div class='footer'>
            SQLNova App - Gestión de Guardias DBA<br/>
            Este es un mensaje automático, por favor no responder.
        </div>
    </div>
</body>
</html>";

        await SendEmailAsync(affectedUserEmail, subject, body, "EscalationOverride", "Assignment");
    }

    private async Task SendEmailAsync(string toEmail, string subject, string htmlBody, string notificationType, string? referenceType = null)
    {
        // Usar la configuración SMTP global de la base de datos
        var settings = await _context.SmtpSettings.FirstOrDefaultAsync(s => s.IsActive);
        
        if (settings == null)
        {
            _logger.LogWarning("No hay configuración SMTP activa. Email no enviado a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, null, subject, htmlBody, "Failed", "No hay configuración SMTP activa", notificationType, referenceType);
            return;
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
            
            message.To.Add(toEmail);

            await client.SendMailAsync(message);
            
            _logger.LogInformation("Email enviado exitosamente a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, null, subject, htmlBody, "Sent", null, notificationType, referenceType);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar email a {Email}: {Subject}", toEmail, subject);
            await LogNotification(toEmail, null, subject, htmlBody, "Failed", ex.Message, notificationType, referenceType);
            // No lanzamos la excepción para no interrumpir el flujo principal
        }
    }

    private async Task LogNotification(string toEmail, string? toName, string subject, string? body,
        string status, string? errorMessage, string notificationType, string? referenceType)
    {
        try
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
                SentAt = DateTime.Now
            };

            _context.NotificationLogs.Add(log);
            await _context.SaveChangesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al registrar notificación en el log");
        }
    }
}
