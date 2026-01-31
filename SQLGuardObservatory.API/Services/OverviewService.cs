using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IOverviewService
{
    Task<OverviewPageDataDto> GetOverviewDataAsync();
}

/// <summary>
/// Servicio optimizado para obtener todos los datos del Overview.
/// Lee desde la tabla de caché OverviewSummaryCache que se actualiza
/// automáticamente por los collectors (HealthScoreConsolidator, DiscosCollector, MaintenanceCollector).
/// </summary>
public class OverviewService : IOverviewService
{
    private readonly IOverviewSummaryCacheService _cacheService;
    private readonly ILogger<OverviewService> _logger;

    public OverviewService(
        IOverviewSummaryCacheService cacheService,
        ILogger<OverviewService> logger)
    {
        _cacheService = cacheService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los datos necesarios para la página Overview.
    /// Lee desde el caché pre-calculado para máximo rendimiento.
    /// Solo incluye datos de PRODUCCIÓN.
    /// NUNCA bloquea - si no hay caché, devuelve datos vacíos y dispara refresh en background.
    /// </summary>
    public async Task<OverviewPageDataDto> GetOverviewDataAsync()
    {
        var startTime = DateTime.UtcNow;
        _logger.LogDebug("Obteniendo datos del Overview desde caché...");

        try
        {
            // Intentar obtener datos del caché
            var cache = await _cacheService.GetCachedDataAsync();

            if (cache == null)
            {
                // Si no hay caché, NO bloquear - devolver vacío y disparar refresh en background
                _logger.LogInformation("Caché de Overview vacío, disparando refresh en background...");
                
                // Disparar refresh en background sin esperar (fire-and-forget)
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _cacheService.RefreshCacheAsync("OnDemandBackground");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Error en refresh de caché en background");
                    }
                });

                // Devolver datos vacíos inmediatamente
                return new OverviewPageDataDto 
                { 
                    LastUpdate = DateTime.UtcNow,
                    CriticalInstances = new(),
                    BackupIssues = new(),
                    CriticalDisks = new(),
                    MaintenanceOverdue = new()
                };
            }

            // Mapear caché a DTO
            var result = _cacheService.MapCacheToDto(cache);

            var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;
            _logger.LogInformation(
                "Overview data obtenido desde caché en {Elapsed}ms: {Total} instancias, {Critical} críticas, {Disks} discos críticos, {Maint} mant. vencido (Última actualización: {LastUpdate})",
                elapsed, result.TotalInstances, result.CriticalCount, result.CriticalDisksCount, 
                result.MaintenanceOverdueCount, cache.LastUpdatedUtc);

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo datos del Overview desde caché");
            throw;
        }
    }
}
