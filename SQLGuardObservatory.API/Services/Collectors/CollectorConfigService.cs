using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Implementación del servicio de configuración de collectors
/// Usa ApplicationDbContext (SQLGuardObservatoryAuth) para la configuración
/// </summary>
public class CollectorConfigService : ICollectorConfigService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<CollectorConfigService> _logger;

    public CollectorConfigService(ApplicationDbContext context, ILogger<CollectorConfigService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<CollectorConfig?> GetConfigAsync(string collectorName, CancellationToken ct = default)
    {
        return await _context.Set<CollectorConfig>()
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CollectorName == collectorName, ct);
    }

    public async Task<List<CollectorConfig>> GetAllConfigsAsync(CancellationToken ct = default)
    {
        return await _context.Set<CollectorConfig>()
            .AsNoTracking()
            .OrderBy(c => c.Category)
            .ThenBy(c => c.ExecutionOrder)
            .ToListAsync(ct);
    }

    public async Task<List<CollectorConfig>> GetEnabledCollectorsAsync(CancellationToken ct = default)
    {
        return await _context.Set<CollectorConfig>()
            .AsNoTracking()
            .Where(c => c.IsEnabled)
            .OrderBy(c => c.Category)
            .ThenBy(c => c.ExecutionOrder)
            .ToListAsync(ct);
    }

    public async Task<bool> UpdateConfigAsync(string collectorName, Action<CollectorConfig> updateAction, CancellationToken ct = default)
    {
        try
        {
            var config = await _context.Set<CollectorConfig>()
                .FirstOrDefaultAsync(c => c.CollectorName == collectorName, ct);

            if (config == null)
                return false;

            updateAction(config);
            config.UpdatedAtUtc = DateTime.Now;

            await _context.SaveChangesAsync(ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating collector config for {CollectorName}", collectorName);
            return false;
        }
    }

    public async Task<List<CollectorThreshold>> GetThresholdsAsync(string collectorName, CancellationToken ct = default)
    {
        return await _context.Set<CollectorThreshold>()
            .AsNoTracking()
            .Where(t => t.CollectorName == collectorName)
            .OrderBy(t => t.ThresholdGroup)
            .ThenBy(t => t.EvaluationOrder)
            .ToListAsync(ct);
    }

    public async Task<List<CollectorThreshold>> GetActiveThresholdsAsync(string collectorName, CancellationToken ct = default)
    {
        return await _context.Set<CollectorThreshold>()
            .AsNoTracking()
            .Where(t => t.CollectorName == collectorName && t.IsActive)
            .OrderBy(t => t.EvaluationOrder)
            .ToListAsync(ct);
    }

    public async Task<bool> UpdateThresholdAsync(int thresholdId, Action<CollectorThreshold> updateAction, CancellationToken ct = default)
    {
        try
        {
            var threshold = await _context.Set<CollectorThreshold>()
                .FirstOrDefaultAsync(t => t.Id == thresholdId, ct);

            if (threshold == null)
                return false;

            updateAction(threshold);
            threshold.UpdatedAtUtc = DateTime.Now;

            await _context.SaveChangesAsync(ct);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating threshold {ThresholdId}", thresholdId);
            return false;
        }
    }

    public async Task<bool> ResetThresholdsToDefaultAsync(string collectorName, CancellationToken ct = default)
    {
        try
        {
            var thresholds = await _context.Set<CollectorThreshold>()
                .Where(t => t.CollectorName == collectorName)
                .ToListAsync(ct);

            foreach (var threshold in thresholds)
            {
                threshold.ThresholdValue = threshold.DefaultValue;
                threshold.IsActive = true;
                threshold.UpdatedAtUtc = DateTime.Now;
            }

            await _context.SaveChangesAsync(ct);
            _logger.LogInformation("Reset {Count} thresholds to default for collector {CollectorName}", 
                thresholds.Count, collectorName);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting thresholds for {CollectorName}", collectorName);
            return false;
        }
    }

    public async Task<SqlVersionQuery?> GetQueryForVersionAsync(string collectorName, string queryName, int sqlMajorVersion, CancellationToken ct = default)
    {
        var queries = await _context.Set<SqlVersionQuery>()
            .AsNoTracking()
            .Where(q => q.CollectorName == collectorName && q.QueryName == queryName && q.IsActive)
            .OrderBy(q => q.Priority)
            .ToListAsync(ct);

        // Encontrar la primera query compatible con la versión
        return queries.FirstOrDefault(q => q.IsCompatibleWith(sqlMajorVersion));
    }

    public async Task<List<SqlVersionQuery>> GetVersionQueriesAsync(string collectorName, CancellationToken ct = default)
    {
        return await _context.Set<SqlVersionQuery>()
            .AsNoTracking()
            .Where(q => q.CollectorName == collectorName)
            .OrderBy(q => q.QueryName)
            .ThenBy(q => q.Priority)
            .ToListAsync(ct);
    }

    public async Task<CollectorExecutionLog> StartExecutionLogAsync(string collectorName, string triggerType, string? triggeredBy = null, CancellationToken ct = default)
    {
        var log = new CollectorExecutionLog
        {
            CollectorName = collectorName,
            StartedAtUtc = DateTime.Now, // Hora local Argentina
            Status = "Running",
            TriggerType = triggerType,
            TriggeredBy = triggeredBy
        };

        _context.Set<CollectorExecutionLog>().Add(log);
        await _context.SaveChangesAsync(ct);

        return log;
    }

    public async Task CompleteExecutionLogAsync(long logId, int successCount, int errorCount, int skippedCount, string? errorMessage = null, CancellationToken ct = default)
    {
        try
        {
            var log = await _context.Set<CollectorExecutionLog>()
                .FirstOrDefaultAsync(l => l.Id == logId, ct);

            if (log == null)
                return;

            log.CompletedAtUtc = DateTime.Now; // Hora local Argentina
            log.DurationMs = (long)(log.CompletedAtUtc.Value - log.StartedAtUtc).TotalMilliseconds;
            log.Status = errorMessage != null ? "Failed" : "Completed";
            log.SuccessCount = successCount;
            log.ErrorCount = errorCount;
            log.SkippedCount = skippedCount;
            log.TotalInstances = successCount + errorCount + skippedCount;
            log.ErrorMessage = errorMessage;

            await _context.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error completing execution log {LogId}", logId);
        }
    }

    public async Task<List<CollectorExecutionLog>> GetRecentExecutionLogsAsync(string collectorName, int count = 10, CancellationToken ct = default)
    {
        return await _context.Set<CollectorExecutionLog>()
            .AsNoTracking()
            .Where(l => l.CollectorName == collectorName)
            .OrderByDescending(l => l.StartedAtUtc)
            .Take(count)
            .ToListAsync(ct);
    }

    public async Task UpdateLastExecutionAsync(string collectorName, DateTime executionTime, long durationMs, int instancesProcessed, string? error = null, CancellationToken ct = default)
    {
        await UpdateConfigAsync(collectorName, config =>
        {
            config.LastExecutionUtc = executionTime;
            config.LastExecutionDurationMs = durationMs;
            config.LastInstancesProcessed = instancesProcessed;
            
            if (error != null)
            {
                config.LastError = error;
                config.LastErrorUtc = DateTime.Now;
            }
            else
            {
                config.LastError = null;
                config.LastErrorUtc = null;
            }
        }, ct);
    }
}

