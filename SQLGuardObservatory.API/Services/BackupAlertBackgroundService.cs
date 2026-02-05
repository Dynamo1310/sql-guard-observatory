using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background que verifica periódicamente si hay backups atrasados
/// y envía alertas cuando corresponde (FULL y LOG independientes)
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
                // Ejecutar verificación para FULL
                await RunCheckForTypeAsync(BackupAlertType.Full, stoppingToken);
                
                // Ejecutar verificación para LOG
                await RunCheckForTypeAsync(BackupAlertType.Log, stoppingToken);
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

    /// <summary>
    /// Ejecuta la verificación para un tipo específico de alerta (FULL o LOG)
    /// </summary>
    private async Task RunCheckForTypeAsync(BackupAlertType alertType, CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        
        var typeName = alertType == BackupAlertType.Full ? "FULL" : "LOG";
        
        // Verificar si la alerta de este tipo está habilitada
        BackupAlertConfig? config;
        try
        {
            config = await context.BackupAlertConfigs
                .FirstOrDefaultAsync(c => c.AlertType == alertType, stoppingToken);
        }
        catch (Exception ex)
        {
            // La tabla podría no existir aún o no tener la columna AlertType
            _logger.LogDebug(ex, "Error checking config for {Type} alerts - table may not exist yet", typeName);
            return;
        }
        
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

        _logger.LogInformation("Running {Type} backup alert check (interval: {Interval} min)", typeName, config.CheckIntervalMinutes);

        // Ejecutar la verificación
        var alertService = scope.ServiceProvider.GetRequiredService<IBackupAlertService>();
        var result = await alertService.RunCheckAsync(alertType);
        
        _logger.LogInformation("{Type} backup alert check completed: {Success} - {Message}", typeName, result.success, result.message);
    }
}
