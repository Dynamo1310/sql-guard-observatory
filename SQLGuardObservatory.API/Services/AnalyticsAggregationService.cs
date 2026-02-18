using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio en segundo plano que agrega los eventos de analytics cada hora
/// para alimentar la tabla AnalyticsDaily usada por los dashboards.
/// </summary>
public class AnalyticsAggregationService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<AnalyticsAggregationService> _logger;

    public AnalyticsAggregationService(
        IServiceProvider serviceProvider,
        ILogger<AnalyticsAggregationService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Analytics Aggregation Background Service started");

        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunAggregationAsync(stoppingToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in Analytics Aggregation background service");
            }

            await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
        }

        _logger.LogInformation("Analytics Aggregation Background Service stopped");
    }

    private async Task RunAggregationAsync(CancellationToken stoppingToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var analyticsService = scope.ServiceProvider.GetRequiredService<IAnalyticsService>();

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var yesterday = today.AddDays(-1);

        await analyticsService.AggregateAsync(yesterday);
        await analyticsService.AggregateAsync(today);

        _logger.LogInformation("Analytics aggregation completed for {Yesterday} and {Today}", yesterday, today);
    }
}
