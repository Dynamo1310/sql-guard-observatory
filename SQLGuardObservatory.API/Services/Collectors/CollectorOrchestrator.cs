using Microsoft.AspNetCore.SignalR;
using SQLGuardObservatory.API.Hubs;
using SQLGuardObservatory.API.Models.Collectors;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Servicio de background que orquesta la ejecución de todos los collectors
/// </summary>
public class CollectorOrchestrator : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<CollectorOrchestrator> _logger;
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly Dictionary<string, DateTime> _lastExecutions = new();
    private readonly Dictionary<string, Task> _runningCollectors = new();
    private readonly SemaphoreSlim _orchestratorLock = new(1, 1);

    public CollectorOrchestrator(
        IServiceProvider serviceProvider,
        ILogger<CollectorOrchestrator> logger,
        IHubContext<NotificationHub> hubContext)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _hubContext = hubContext;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CollectorOrchestrator starting...");

        // Esperar un poco para que la aplicación termine de inicializarse
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

        _logger.LogInformation("CollectorOrchestrator started, beginning collector scheduling");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CheckAndExecuteCollectorsAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error in collector orchestrator loop");
            }

            // Verificar cada 10 segundos si hay collectors que ejecutar
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
        }

        _logger.LogInformation("CollectorOrchestrator stopping...");
    }

    private async Task CheckAndExecuteCollectorsAsync(CancellationToken ct)
    {
        await _orchestratorLock.WaitAsync(ct);
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var configService = scope.ServiceProvider.GetRequiredService<ICollectorConfigService>();
            
            var enabledCollectors = await configService.GetEnabledCollectorsAsync(ct);
            var now = DateTime.Now;

            foreach (var config in enabledCollectors)
            {
                // Verificar si ya pasó el intervalo desde la última ejecución
                if (!ShouldExecute(config, now))
                    continue;

                // Verificar si ya está ejecutándose
                if (_runningCollectors.TryGetValue(config.CollectorName, out var runningTask) && !runningTask.IsCompleted)
                {
                    _logger.LogDebug("Collector {CollectorName} is still running, skipping", config.CollectorName);
                    continue;
                }

                // Ejecutar el collector en background
                var task = ExecuteCollectorAsync(config.CollectorName, ct);
                _runningCollectors[config.CollectorName] = task;
                _lastExecutions[config.CollectorName] = now;
            }

            // Limpiar tareas completadas
            var completedCollectors = _runningCollectors
                .Where(kvp => kvp.Value.IsCompleted)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var collectorName in completedCollectors)
            {
                _runningCollectors.Remove(collectorName);
            }
        }
        finally
        {
            _orchestratorLock.Release();
        }
    }

    private bool ShouldExecute(CollectorConfig config, DateTime now)
    {
        if (!_lastExecutions.TryGetValue(config.CollectorName, out var lastExecution))
        {
            // Primera ejecución
            return true;
        }

        var elapsed = now - lastExecution;
        return elapsed.TotalSeconds >= config.IntervalSeconds;
    }

    private async Task ExecuteCollectorAsync(string collectorName, CancellationToken ct)
    {
        var startTime = DateTime.Now;
        var success = false;
        var instancesProcessed = 0;
        string? errorMessage = null;

        try
        {
            using var scope = _serviceProvider.CreateScope();
            var collectors = scope.ServiceProvider.GetServices<ICollector>();
            var collector = collectors.FirstOrDefault(c => c.CollectorName == collectorName);

            if (collector == null)
            {
                _logger.LogWarning("Collector {CollectorName} not found in registered services", collectorName);
                return;
            }

            _logger.LogInformation("Starting collector {CollectorName}", collectorName);
            var result = await collector.ExecuteAsync(ct);
            success = true;
            instancesProcessed = result.InstancesProcessed;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(ex, "Error executing collector {CollectorName}", collectorName);
            errorMessage = ex.Message;
        }
        finally
        {
            var duration = DateTime.Now - startTime;
            
            // Enviar notificación SignalR para actualización en tiempo real
            try
            {
                await _hubContext.Clients.All.SendAsync("HealthScoreUpdated", new
                {
                    CollectorName = collectorName,
                    Success = success,
                    InstancesProcessed = instancesProcessed,
                    DurationMs = (int)duration.TotalMilliseconds,
                    Timestamp = DateTime.Now,
                    Error = errorMessage
                }, ct);

                _logger.LogDebug("SignalR notification sent for collector {CollectorName}", collectorName);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to send SignalR notification for collector {CollectorName}", collectorName);
            }
        }
    }

    /// <summary>
    /// Ejecuta un collector específico de forma manual
    /// </summary>
    public async Task<bool> ExecuteCollectorManuallyAsync(string collectorName, CancellationToken ct)
    {
        await _orchestratorLock.WaitAsync(ct);
        try
        {
            // Verificar si ya está ejecutándose
            if (_runningCollectors.TryGetValue(collectorName, out var runningTask) && !runningTask.IsCompleted)
            {
                _logger.LogWarning("Collector {CollectorName} is already running", collectorName);
                return false;
            }

            var task = ExecuteCollectorAsync(collectorName, ct);
            _runningCollectors[collectorName] = task;
            _lastExecutions[collectorName] = DateTime.Now;

            return true;
        }
        finally
        {
            _orchestratorLock.Release();
        }
    }

    /// <summary>
    /// Obtiene el estado actual de todos los collectors
    /// </summary>
    public Dictionary<string, CollectorStatus> GetCollectorStatuses()
    {
        var statuses = new Dictionary<string, CollectorStatus>();

        foreach (var (name, task) in _runningCollectors)
        {
            statuses[name] = new CollectorStatus
            {
                IsRunning = !task.IsCompleted,
                LastExecution = _lastExecutions.GetValueOrDefault(name),
                HasError = task.IsFaulted
            };
        }

        return statuses;
    }

    public class CollectorStatus
    {
        public bool IsRunning { get; set; }
        public DateTime? LastExecution { get; set; }
        public bool HasError { get; set; }
    }
}

