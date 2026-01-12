using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Helpers;
using Microsoft.EntityFrameworkCore;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background que ejecuta las notificaciones programadas de guardias.
/// Lee el schedule configurado de cada template en la base de datos.
/// </summary>
public class ScheduledNotificationService : BackgroundService
{
    private readonly ILogger<ScheduledNotificationService> _logger;
    private readonly IServiceProvider _serviceProvider;
    private Timer? _timer;
    private DateTime _lastWeeklyCheck = DateTime.MinValue;
    private DateTime _lastPreWeekCheck = DateTime.MinValue;

    public ScheduledNotificationService(
        ILogger<ScheduledNotificationService> logger,
        IServiceProvider serviceProvider)
    {
        _logger = logger;
        _serviceProvider = serviceProvider;
    }

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Servicio de notificaciones programadas iniciado");

        // Verificar cada minuto si hay que enviar notificaciones
        _timer = new Timer(CheckAndSendNotifications, null, TimeSpan.Zero, TimeSpan.FromMinutes(1));

        return Task.CompletedTask;
    }

    private async void CheckAndSendNotifications(object? state)
    {
        try
        {
            var now = LocalClockAR.Now;

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Verificar cada template con schedule habilitado
            var scheduledTemplates = await context.OnCallEmailTemplates
                .Where(t => t.IsScheduled && t.IsEnabled && !string.IsNullOrEmpty(t.ScheduleCron))
                .ToListAsync();

            foreach (var template in scheduledTemplates)
            {
                if (ShouldSendNow(template.ScheduleCron!, now, template.AlertType))
                {
                    await SendNotificationAsync(template.AlertType);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error verificando notificaciones programadas");
        }
    }

    /// <summary>
    /// Verifica si es el momento de enviar según el cron
    /// Formato cron: minuto hora * * díaSemana (0=domingo, 1=lunes, ..., 6=sábado)
    /// </summary>
    private bool ShouldSendNow(string cron, DateTime now, string alertType)
    {
        try
        {
            var parts = cron.Split(' ');
            if (parts.Length < 5) return false;

            var cronMinute = int.Parse(parts[0]);
            var cronHour = int.Parse(parts[1]);
            var cronDayOfWeek = int.Parse(parts[4]); // 0=domingo en cron estándar

            // Convertir día de semana de cron (0=domingo) a .NET (0=sunday)
            var nowDayOfWeek = (int)now.DayOfWeek;

            if (now.Hour == cronHour && now.Minute == cronMinute && nowDayOfWeek == cronDayOfWeek)
            {
                // Verificar que no se haya enviado ya en este minuto
                var lastCheck = alertType == "WeeklyNotification" ? _lastWeeklyCheck : _lastPreWeekCheck;
                
                if ((now - lastCheck).TotalMinutes >= 1)
                {
                    // Actualizar último envío
                    if (alertType == "WeeklyNotification")
                        _lastWeeklyCheck = now;
                    else
                        _lastPreWeekCheck = now;

                    return true;
                }
            }

            return false;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error parseando cron: {Cron}", cron);
            return false;
        }
    }

    private async Task SendNotificationAsync(string alertType)
    {
        try
        {
            _logger.LogInformation("Ejecutando notificación programada: {AlertType}", alertType);
            
            using var scope = _serviceProvider.CreateScope();
            var alertService = scope.ServiceProvider.GetRequiredService<IOnCallAlertService>();

            switch (alertType)
            {
                case "WeeklyNotification":
                    await alertService.SendWeeklyNotificationAsync();
                    break;
                case "PreWeekNotification":
                    await alertService.SendPreWeekNotificationAsync();
                    break;
                default:
                    _logger.LogWarning("Tipo de notificación no soportado para schedule: {AlertType}", alertType);
                    break;
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ejecutando notificación programada: {AlertType}", alertType);
        }
    }

    public override async Task StopAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Servicio de notificaciones programadas detenido");
        _timer?.Change(Timeout.Infinite, 0);
        await base.StopAsync(stoppingToken);
    }

    public override void Dispose()
    {
        _timer?.Dispose();
        base.Dispose();
    }
}
