using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background para enviar notificaciones de parcheo
/// T-48h: recordatorio a célula y operador
/// T-2h: alerta de inicio de ventana
/// T+fin: notificación de fin de ventana
/// </summary>
public class PatchNotificationBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<PatchNotificationBackgroundService> _logger;
    
    // Intervalo de verificación (cada 15 minutos)
    private static readonly TimeSpan CheckInterval = TimeSpan.FromMinutes(15);

    public PatchNotificationBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<PatchNotificationBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("PatchNotificationBackgroundService iniciado");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ProcessPendingNotificationsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en PatchNotificationBackgroundService");
            }

            await Task.Delay(CheckInterval, stoppingToken);
        }

        _logger.LogInformation("PatchNotificationBackgroundService detenido");
    }

    private async Task ProcessPendingNotificationsAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var emailService = scope.ServiceProvider.GetService<IEmailService>();

        if (emailService == null)
        {
            _logger.LogWarning("IEmailService no disponible, notificaciones deshabilitadas");
            return;
        }

        var now = DateTime.UtcNow;

        // Obtener configuración de notificaciones
        var notificationSettings = await context.PatchNotificationSettings
            .Where(s => s.IsEnabled)
            .ToListAsync(cancellationToken);

        if (!notificationSettings.Any())
        {
            return;
        }

        // Obtener planes activos en las próximas 48 horas
        var upcomingPlans = await context.PatchPlans
            .Where(p => PatchPlanStatus.ActiveStatuses.Contains(p.Status))
            .Where(p => p.ScheduledDate >= now.Date && p.ScheduledDate <= now.AddHours(48).Date)
            .Include(p => p.AssignedDba)
            .ToListAsync(cancellationToken);

        foreach (var plan in upcomingPlans)
        {
            foreach (var setting in notificationSettings)
            {
                await TrySendNotificationAsync(
                    context, emailService, plan, setting, now, cancellationToken);
            }
        }

        // Procesar notificaciones de fin de ventana (T+fin)
        var finSetting = notificationSettings.FirstOrDefault(s => s.NotificationType == PatchNotificationType.TFin);
        if (finSetting != null)
        {
            await ProcessEndOfWindowNotificationsAsync(
                context, emailService, finSetting, now, cancellationToken);
        }

        await context.SaveChangesAsync(cancellationToken);
    }

    private async Task TrySendNotificationAsync(
        ApplicationDbContext context,
        IEmailService emailService,
        PatchPlan plan,
        PatchNotificationSetting setting,
        DateTime now,
        CancellationToken cancellationToken)
    {
        // Calcular cuándo debería enviarse la notificación
        var scheduledDateTime = plan.ScheduledDate.Add(plan.WindowStartTime);
        var notificationTime = scheduledDateTime.AddHours(-(setting.HoursBefore ?? 0));

        // Verificar si es momento de enviar (dentro de los próximos 15 minutos)
        if (now >= notificationTime && now < notificationTime.AddMinutes(15))
        {
            // Verificar si ya se envió
            var alreadySent = await context.PatchNotificationHistories
                .AnyAsync(h => 
                    h.PatchPlanId == plan.Id && 
                    h.NotificationType == setting.NotificationType &&
                    h.WasSuccessful, cancellationToken);

            if (!alreadySent)
            {
                await SendNotificationAsync(
                    context, emailService, plan, setting, cancellationToken);
            }
        }
    }

    private async Task ProcessEndOfWindowNotificationsAsync(
        ApplicationDbContext context,
        IEmailService emailService,
        PatchNotificationSetting setting,
        DateTime now,
        CancellationToken cancellationToken)
    {
        // Buscar planes cuya ventana ya terminó pero aún están en proceso
        var plansEndedWindow = await context.PatchPlans
            .Where(p => p.Status == PatchPlanStatus.EnProceso)
            .Where(p => p.ScheduledDate.Add(p.WindowEndTime) <= now)
            .Include(p => p.AssignedDba)
            .ToListAsync(cancellationToken);

        foreach (var plan in plansEndedWindow)
        {
            // Verificar si ya se envió
            var alreadySent = await context.PatchNotificationHistories
                .AnyAsync(h => 
                    h.PatchPlanId == plan.Id && 
                    h.NotificationType == setting.NotificationType &&
                    h.WasSuccessful, cancellationToken);

            if (!alreadySent)
            {
                await SendNotificationAsync(
                    context, emailService, plan, setting, cancellationToken);
            }
        }
    }

    private async Task SendNotificationAsync(
        ApplicationDbContext context,
        IEmailService emailService,
        PatchPlan plan,
        PatchNotificationSetting setting,
        CancellationToken cancellationToken)
    {
        var recipients = GetRecipients(plan, setting.RecipientType);

        foreach (var (email, name) in recipients)
        {
            if (string.IsNullOrEmpty(email)) continue;

            try
            {
                var subject = ReplaceTemplateVariables(
                    setting.EmailSubjectTemplate ?? "[SQL Nova] Notificación de parcheo - {ServerName}",
                    plan, name);

                var body = ReplaceTemplateVariables(
                    setting.EmailBodyTemplate ?? GetDefaultBodyTemplate(setting.NotificationType),
                    plan, name);

                await emailService.SendEmailAsync(email, subject, body, isHtml: true);

                // Registrar envío exitoso
                context.PatchNotificationHistories.Add(new PatchNotificationHistory
                {
                    PatchPlanId = plan.Id,
                    NotificationType = setting.NotificationType,
                    RecipientEmail = email,
                    RecipientName = name,
                    Subject = subject,
                    SentAt = DateTime.UtcNow,
                    WasSuccessful = true
                });

                _logger.LogInformation(
                    "Notificación {Type} enviada para plan {PlanId} a {Email}",
                    setting.NotificationType, plan.Id, email);
            }
            catch (Exception ex)
            {
                // Registrar fallo
                context.PatchNotificationHistories.Add(new PatchNotificationHistory
                {
                    PatchPlanId = plan.Id,
                    NotificationType = setting.NotificationType,
                    RecipientEmail = email,
                    RecipientName = name,
                    SentAt = DateTime.UtcNow,
                    WasSuccessful = false,
                    ErrorMessage = ex.Message
                });

                _logger.LogError(ex,
                    "Error al enviar notificación {Type} para plan {PlanId} a {Email}",
                    setting.NotificationType, plan.Id, email);
            }
        }
    }

    private List<(string Email, string Name)> GetRecipients(PatchPlan plan, string recipientType)
    {
        var recipients = new List<(string Email, string Name)>();

        switch (recipientType)
        {
            case NotificationRecipientType.Operator:
                if (plan.AssignedDba != null)
                {
                    recipients.Add((plan.AssignedDba.Email ?? "", plan.AssignedDbaName ?? ""));
                }
                break;

            case NotificationRecipientType.Owner:
                if (!string.IsNullOrEmpty(plan.CoordinationOwnerEmail))
                {
                    recipients.Add((plan.CoordinationOwnerEmail, plan.CoordinationOwnerName ?? ""));
                }
                break;

            case NotificationRecipientType.All:
                if (plan.AssignedDba != null)
                {
                    recipients.Add((plan.AssignedDba.Email ?? "", plan.AssignedDbaName ?? ""));
                }
                if (!string.IsNullOrEmpty(plan.CoordinationOwnerEmail))
                {
                    recipients.Add((plan.CoordinationOwnerEmail, plan.CoordinationOwnerName ?? ""));
                }
                break;
        }

        return recipients.Where(r => !string.IsNullOrEmpty(r.Email)).Distinct().ToList();
    }

    private string ReplaceTemplateVariables(string template, PatchPlan plan, string recipientName)
    {
        return template
            .Replace("{ServerName}", plan.ServerName)
            .Replace("{InstanceName}", plan.InstanceName ?? "N/A")
            .Replace("{ScheduledDate}", plan.ScheduledDate.ToString("dd/MM/yyyy"))
            .Replace("{WindowStart}", plan.WindowStartTime.ToString(@"hh\:mm"))
            .Replace("{WindowEnd}", plan.WindowEndTime.ToString(@"hh\:mm"))
            .Replace("{CurrentVersion}", plan.CurrentVersion)
            .Replace("{TargetVersion}", plan.TargetVersion)
            .Replace("{OperatorName}", plan.AssignedDbaName ?? "No asignado")
            .Replace("{RecipientName}", recipientName)
            .Replace("{EstimatedDuration}", (plan.EstimatedDuration ?? 120).ToString())
            .Replace("{NovaUrl}", "https://sqlnova.supervielle.com.ar"); // TODO: Obtener de configuración
    }

    private string GetDefaultBodyTemplate(string notificationType)
    {
        return notificationType switch
        {
            PatchNotificationType.T48h => @"
<html>
<body>
<h2>Recordatorio de Parcheo Programado</h2>
<p>Estimado/a {RecipientName},</p>
<p>Le recordamos que en 48 horas se realizará un parcheo programado:</p>
<table>
<tr><td><strong>Servidor:</strong></td><td>{ServerName}</td></tr>
<tr><td><strong>Fecha:</strong></td><td>{ScheduledDate}</td></tr>
<tr><td><strong>Ventana:</strong></td><td>{WindowStart} - {WindowEnd}</td></tr>
</table>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>",
            PatchNotificationType.T2h => @"
<html>
<body>
<h2>ALERTA: Parcheo en 2 horas</h2>
<p>Estimado/a {RecipientName},</p>
<p>La ventana de parcheo comienza en 2 horas:</p>
<table>
<tr><td><strong>Servidor:</strong></td><td>{ServerName}</td></tr>
<tr><td><strong>Hora inicio:</strong></td><td>{WindowStart}</td></tr>
</table>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>",
            PatchNotificationType.TFin => @"
<html>
<body>
<h2>Ventana de Parcheo Finalizada</h2>
<p>Estimado/a {RecipientName},</p>
<p>La ventana de parcheo ha finalizado para {ServerName}.</p>
<p>Por favor, suba la evidencia y valide el estado del parcheo en SQL Nova.</p>
<p>Saludos,<br/>Equipo DBA - SQL Nova</p>
</body>
</html>",
            _ => "<html><body><p>Notificación de parcheo para {ServerName}</p></body></html>"
        };
    }
}
