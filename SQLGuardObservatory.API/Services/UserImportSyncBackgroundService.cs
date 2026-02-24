namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en background que ejecuta periódicamente la sincronización
/// de usuarios desde listas de distribución de Active Directory.
/// </summary>
public class UserImportSyncBackgroundService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<UserImportSyncBackgroundService> _logger;

    public UserImportSyncBackgroundService(
        IServiceProvider serviceProvider,
        ILogger<UserImportSyncBackgroundService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("User Import Sync Background Service started");

        // Esperar 2 minutos al inicio para que los servicios estén listos
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunPendingSyncsAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in User Import Sync background service");
            }

            // Verificar cada 5 minutos
            await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
        }

        _logger.LogInformation("User Import Sync Background Service stopped");
    }

    private async Task RunPendingSyncsAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var syncService = scope.ServiceProvider.GetRequiredService<IUserImportSyncService>();

        List<int> pendingIds;
        try
        {
            pendingIds = await syncService.GetPendingSyncIdsAsync();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener syncs pendientes");
            return;
        }

        if (!pendingIds.Any())
            return;

        _logger.LogInformation("Encontrados {Count} syncs pendientes de ejecución", pendingIds.Count);

        foreach (var syncId in pendingIds)
        {
            if (stoppingToken.IsCancellationRequested)
                break;

            try
            {
                _logger.LogInformation("Ejecutando sync automático {Id}", syncId);
                var result = await syncService.ExecuteSyncAsync(syncId, null);

                if (result.Success)
                {
                    _logger.LogInformation("Sync automático {Id} completado: {Message}", syncId, result.Message);
                }
                else
                {
                    _logger.LogWarning("Sync automático {Id} falló: {Message}", syncId, result.Message);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error ejecutando sync automático {Id}", syncId);
            }
        }
    }
}
