using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services.Collectors;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// API para configuración de collectors y umbrales
/// </summary>
[ApiController]
[Route("api/collectors")]
public class CollectorConfigController : ControllerBase
{
    private readonly ICollectorConfigService _configService;
    private readonly CollectorOrchestrator _orchestrator;
    private readonly ILogger<CollectorConfigController> _logger;

    public CollectorConfigController(
        ICollectorConfigService configService,
        CollectorOrchestrator orchestrator,
        ILogger<CollectorConfigController> logger)
    {
        _configService = configService;
        _orchestrator = orchestrator;
        _logger = logger;
    }

    /// <summary>
    /// Lista todos los collectors con su configuración
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<CollectorConfigDto>>> GetAllCollectors(CancellationToken ct)
    {
        var configs = await _configService.GetAllConfigsAsync(ct);
        var statuses = _orchestrator.GetCollectorStatuses();

        var result = configs.Select(c => new CollectorConfigDto(
            c.CollectorName,
            c.DisplayName,
            c.Description,
            c.IsEnabled,
            c.IntervalSeconds,
            c.TimeoutSeconds,
            c.Weight,
            c.ParallelDegree,
            c.Category,
            c.ExecutionOrder,
            c.LastExecutionUtc,
            c.LastExecutionDurationMs,
            c.LastInstancesProcessed,
            c.LastError,
            c.LastErrorUtc
        )).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Obtiene la configuración de un collector específico
    /// </summary>
    [HttpGet("{name}")]
    public async Task<ActionResult<CollectorConfigDto>> GetCollector(string name, CancellationToken ct)
    {
        var config = await _configService.GetConfigAsync(name, ct);
        if (config == null)
            return NotFound($"Collector '{name}' not found");

        return Ok(new CollectorConfigDto(
            config.CollectorName,
            config.DisplayName,
            config.Description,
            config.IsEnabled,
            config.IntervalSeconds,
            config.TimeoutSeconds,
            config.Weight,
            config.ParallelDegree,
            config.Category,
            config.ExecutionOrder,
            config.LastExecutionUtc,
            config.LastExecutionDurationMs,
            config.LastInstancesProcessed,
            config.LastError,
            config.LastErrorUtc
        ));
    }

    /// <summary>
    /// Actualiza la configuración de un collector
    /// </summary>
    [HttpPut("{name}")]
    public async Task<ActionResult> UpdateCollector(string name, [FromBody] UpdateCollectorConfigDto dto, CancellationToken ct)
    {
        var success = await _configService.UpdateConfigAsync(name, config =>
        {
            if (dto.IsEnabled.HasValue)
                config.IsEnabled = dto.IsEnabled.Value;
            if (dto.IntervalSeconds.HasValue)
                config.IntervalSeconds = Math.Max(30, dto.IntervalSeconds.Value); // Mínimo 30 segundos
            if (dto.TimeoutSeconds.HasValue)
                config.TimeoutSeconds = Math.Max(5, dto.TimeoutSeconds.Value);
            if (dto.Weight.HasValue)
                config.Weight = Math.Clamp(dto.Weight.Value, 0, 100);
            if (dto.ParallelDegree.HasValue)
                config.ParallelDegree = Math.Clamp(dto.ParallelDegree.Value, 1, 20);
        }, ct);

        if (!success)
            return NotFound($"Collector '{name}' not found");

        _logger.LogInformation("Collector {Name} configuration updated", name);
        return NoContent();
    }

    /// <summary>
    /// Obtiene los umbrales de un collector
    /// </summary>
    [HttpGet("{name}/thresholds")]
    public async Task<ActionResult<List<CollectorThresholdDto>>> GetThresholds(string name, CancellationToken ct)
    {
        var config = await _configService.GetConfigAsync(name, ct);
        if (config == null)
            return NotFound($"Collector '{name}' not found");

        var thresholds = await _configService.GetThresholdsAsync(name, ct);

        var result = thresholds.Select(t => new CollectorThresholdDto(
            t.Id,
            t.CollectorName,
            t.ThresholdName,
            t.DisplayName,
            t.ThresholdValue,
            t.ThresholdOperator,
            t.ResultingScore,
            t.ActionType,
            t.Description,
            t.DefaultValue,
            t.EvaluationOrder,
            t.ThresholdGroup,
            t.IsActive
        )).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Actualiza un umbral específico
    /// </summary>
    [HttpPut("{name}/thresholds/{thresholdId:int}")]
    public async Task<ActionResult> UpdateThreshold(string name, int thresholdId, [FromBody] UpdateThresholdDto dto, CancellationToken ct)
    {
        var success = await _configService.UpdateThresholdAsync(thresholdId, threshold =>
        {
            if (dto.ThresholdValue.HasValue)
                threshold.ThresholdValue = dto.ThresholdValue.Value;
            if (!string.IsNullOrEmpty(dto.ThresholdOperator))
                threshold.ThresholdOperator = dto.ThresholdOperator;
            if (dto.ResultingScore.HasValue)
                threshold.ResultingScore = dto.ResultingScore.Value;
            if (dto.IsActive.HasValue)
                threshold.IsActive = dto.IsActive.Value;
        }, ct);

        if (!success)
            return NotFound($"Threshold {thresholdId} not found");

        _logger.LogInformation("Threshold {Id} for collector {Name} updated", thresholdId, name);
        return NoContent();
    }

    /// <summary>
    /// Actualiza múltiples umbrales a la vez
    /// </summary>
    [HttpPut("{name}/thresholds")]
    public async Task<ActionResult> UpdateThresholds(string name, [FromBody] UpdateThresholdsDto dto, CancellationToken ct)
    {
        var thresholds = await _configService.GetThresholdsAsync(name, ct);
        var updated = 0;

        foreach (var update in dto.Thresholds)
        {
            var threshold = thresholds.FirstOrDefault(t => t.ThresholdName == update.ThresholdName);
            if (threshold == null) continue;

            var success = await _configService.UpdateThresholdAsync(threshold.Id, t =>
            {
                if (update.ThresholdValue.HasValue)
                    t.ThresholdValue = update.ThresholdValue.Value;
                if (!string.IsNullOrEmpty(update.ThresholdOperator))
                    t.ThresholdOperator = update.ThresholdOperator;
                if (update.ResultingScore.HasValue)
                    t.ResultingScore = update.ResultingScore.Value;
                if (update.IsActive.HasValue)
                    t.IsActive = update.IsActive.Value;
            }, ct);

            if (success) updated++;
        }

        _logger.LogInformation("Updated {Count} thresholds for collector {Name}", updated, name);
        return Ok(new { Updated = updated });
    }

    /// <summary>
    /// Restablece los umbrales a sus valores por defecto
    /// </summary>
    [HttpPost("{name}/thresholds/reset")]
    public async Task<ActionResult> ResetThresholds(string name, CancellationToken ct)
    {
        var success = await _configService.ResetThresholdsToDefaultAsync(name, ct);
        
        if (!success)
            return NotFound($"Collector '{name}' not found");

        _logger.LogInformation("Thresholds for collector {Name} reset to defaults", name);
        return NoContent();
    }

    /// <summary>
    /// Ejecuta un collector manualmente
    /// </summary>
    [HttpPost("{name}/execute")]
    public async Task<ActionResult<ExecuteCollectorResultDto>> ExecuteCollector(
        string name, 
        [FromBody] ExecuteCollectorDto? dto, 
        CancellationToken ct)
    {
        var config = await _configService.GetConfigAsync(name, ct);
        if (config == null)
            return NotFound($"Collector '{name}' not found");

        // Registrar ejecución manual
        var executionLog = await _configService.StartExecutionLogAsync(name, "Manual", User?.Identity?.Name, ct);

        var started = await _orchestrator.ExecuteCollectorManuallyAsync(name, ct);

        if (!started)
        {
            await _configService.CompleteExecutionLogAsync(executionLog.Id, 0, 0, 0, "Collector already running", ct);
            return Ok(new ExecuteCollectorResultDto(false, "Collector is already running", null));
        }

        _logger.LogInformation("Manual execution of collector {Name} started", name);
        return Ok(new ExecuteCollectorResultDto(true, "Collector execution started", executionLog.Id));
    }

    /// <summary>
    /// Obtiene los logs de ejecución recientes de un collector
    /// </summary>
    [HttpGet("{name}/logs")]
    public async Task<ActionResult<List<CollectorExecutionLogDto>>> GetExecutionLogs(
        string name, 
        [FromQuery] int count = 10, 
        CancellationToken ct = default)
    {
        var logs = await _configService.GetRecentExecutionLogsAsync(name, count, ct);

        var result = logs.Select(l => new CollectorExecutionLogDto(
            l.Id,
            l.CollectorName,
            l.StartedAtUtc,
            l.CompletedAtUtc,
            l.DurationMs,
            l.Status,
            l.TotalInstances,
            l.SuccessCount,
            l.ErrorCount,
            l.SkippedCount,
            l.ErrorMessage,
            l.TriggerType,
            l.TriggeredBy
        )).ToList();

        return Ok(result);
    }

    /// <summary>
    /// Obtiene resumen del estado de todos los collectors
    /// </summary>
    [HttpGet("summary")]
    public async Task<ActionResult<CollectorsSummaryDto>> GetSummary(CancellationToken ct)
    {
        var configs = await _configService.GetAllConfigsAsync(ct);
        var statuses = _orchestrator.GetCollectorStatuses();

        var collectors = configs.Select(c =>
        {
            var status = statuses.GetValueOrDefault(c.CollectorName);
            return new CollectorStatusDto(
                c.CollectorName,
                c.DisplayName,
                c.IsEnabled,
                status?.IsRunning == true ? "Running" : (c.LastError != null ? "Error" : "Idle"),
                c.LastExecutionUtc,
                (int?)c.LastExecutionDurationMs,
                c.LastInstancesProcessed,
                c.LastError
            );
        }).ToList();

        var summary = new CollectorsSummaryDto(
            configs.Count,
            configs.Count(c => c.IsEnabled),
            statuses.Count(s => s.Value.IsRunning),
            configs.Max(c => c.LastExecutionUtc),
            collectors
        );

        return Ok(summary);
    }

    /// <summary>
    /// Obtiene las queries por versión de un collector
    /// </summary>
    [HttpGet("{name}/queries")]
    public async Task<ActionResult<List<SqlVersionQueryDto>>> GetVersionQueries(string name, CancellationToken ct)
    {
        var queries = await _configService.GetVersionQueriesAsync(name, ct);

        var result = queries.Select(q => new SqlVersionQueryDto(
            q.Id,
            q.CollectorName,
            q.QueryName,
            q.MinSqlVersion,
            q.MaxSqlVersion,
            q.QueryTemplate,
            q.Description,
            q.Priority,
            q.IsActive
        )).ToList();

        return Ok(result);
    }
}

