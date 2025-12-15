using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

public class ProductionAlertBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ProductionAlertBackgroundService> _logger;

    public ProductionAlertBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<ProductionAlertBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Production Alert Background Service started");

        // Esperar 30 segundos antes de iniciar para que la app termine de arrancar
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCheckCycleAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in production alert background service");
            }

            // Esperar 1 minuto antes del próximo ciclo
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
        }

        _logger.LogInformation("Production Alert Background Service stopped");
    }

    private async Task RunCheckCycleAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        
        // Verificar si la alerta está habilitada
        var config = await context.Set<ProductionAlertConfig>().FirstOrDefaultAsync(stoppingToken);
        
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

        _logger.LogInformation("Running production server check (interval: {Interval} min)", config.CheckIntervalMinutes);

        // Ejecutar la verificación
        var alertService = scope.ServiceProvider.GetRequiredService<IProductionAlertService>();
        await alertService.RunCheckAsync();
    }
}

