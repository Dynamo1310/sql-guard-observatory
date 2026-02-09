using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background que verifica periódicamente si hay discos críticos
/// y envía alertas cuando corresponde
/// </summary>
public class DiskAlertBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<DiskAlertBackgroundService> _logger;

    public DiskAlertBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<DiskAlertBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Disk Alert Background Service started");

        // Esperar 90 segundos antes de iniciar para que la app y los collectors estén listos
        await Task.Delay(TimeSpan.FromSeconds(90), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCheckAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in disk alert background service");
            }

            // Esperar 1 minuto antes del próximo ciclo de verificación
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }

        _logger.LogInformation("Disk Alert Background Service stopped");
    }

    private async Task RunCheckAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        
        // Verificar si la alerta está habilitada
        DiskAlertConfig? config;
        try
        {
            config = await context.DiskAlertConfigs
                .FirstOrDefaultAsync(stoppingToken);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error checking disk alert config - table may not exist yet");
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

        _logger.LogInformation("Running disk alert check (interval: {Interval} min)", config.CheckIntervalMinutes);

        // Ejecutar la verificación
        var alertService = scope.ServiceProvider.GetRequiredService<IDiskAlertService>();
        var result = await alertService.RunCheckAsync();
        
        _logger.LogInformation("Disk alert check completed: {Success} - {Message}", result.success, result.message);
    }
}
