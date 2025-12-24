using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en segundo plano que verifica cada minuto si hay schedules de resumen Overview que deben ejecutarse
/// </summary>
public class OverviewSummaryBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<OverviewSummaryBackgroundService> _logger;

    public OverviewSummaryBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<OverviewSummaryBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Overview Summary Alert Background Service started");

        // Esperar 60 segundos antes de iniciar para que la app termine de arrancar
        await Task.Delay(TimeSpan.FromSeconds(60), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckSchedulesAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Overview Summary background service");
            }

            // Esperar 1 minuto antes del próximo ciclo
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }

        _logger.LogInformation("Overview Summary Alert Background Service stopped");
    }

    private async Task CheckSchedulesAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        
        try
        {
            var alertService = scope.ServiceProvider.GetRequiredService<IOverviewSummaryAlertService>();
            await alertService.CheckAndExecuteSchedulesAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error checking Overview Summary schedules");
        }
    }
}

