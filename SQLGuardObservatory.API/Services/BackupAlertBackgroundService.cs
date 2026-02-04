using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background que verifica periódicamente si hay backups atrasados
/// y envía alertas cuando corresponde
/// </summary>
public class BackupAlertBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<BackupAlertBackgroundService> _logger;

    public BackupAlertBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<BackupAlertBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Backup Alert Background Service started");

        // Esperar 60 segundos antes de iniciar para que la app y el caché de overview estén listos
        await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCheckCycleAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in backup alert background service");
            }

            // Esperar 1 minuto antes del próximo ciclo de verificación
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }

        _logger.LogInformation("Backup Alert Background Service stopped");
    }

    private async Task RunCheckCycleAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        
        // Verificar si la alerta está habilitada
        var config = await context.BackupAlertConfigs.FirstOrDefaultAsync(stoppingToken);
        
        if (config == null || !config.IsEnabled)
        {
            return;
        }

        // Verificar si es momento de ejecutar según el intervalo configurado
        var now = DateTime.UtcNow;
        if (config.LastRunAt != null)
        {
            var minutesSinceLastRun = (now - config.LastRunAt.Value).TotalMinutes;
            if (minutesSinceLastRun < config.CheckIntervalMinutes)
            {
                return;
            }
        }

        _logger.LogInformation("Running backup alert check (interval: {Interval} min)", config.CheckIntervalMinutes);

        // Ejecutar la verificación
        var alertService = scope.ServiceProvider.GetRequiredService<IBackupAlertService>();
        var result = await alertService.RunCheckAsync();
        
        _logger.LogInformation("Backup alert check completed: {Success} - {Message}", result.success, result.message);
    }
}
