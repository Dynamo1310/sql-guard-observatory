namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para la configuración de un collector
/// </summary>
public record CollectorConfigDto(
    string Name,
    string DisplayName,
    string? Description,
    bool IsEnabled,
    int IntervalSeconds,
    int TimeoutSeconds,
    decimal Weight,
    int ParallelDegree,
    string Category,
    int ExecutionOrder,
    DateTime? LastExecution,
    long? LastExecutionDurationMs,
    int? LastInstancesProcessed,
    string? LastError,
    DateTime? LastErrorUtc
);

/// <summary>
/// DTO para actualizar la configuración de un collector
/// </summary>
public record UpdateCollectorConfigDto(
    bool? IsEnabled,
    int? IntervalSeconds,
    int? TimeoutSeconds,
    decimal? Weight,
    int? ParallelDegree
);

/// <summary>
/// DTO para un umbral de collector
/// </summary>
public record CollectorThresholdDto(
    int Id,
    string CollectorName,
    string ThresholdName,
    string DisplayName,
    decimal ThresholdValue,
    string ThresholdOperator,
    int ResultingScore,
    string ActionType,
    string? Description,
    decimal DefaultValue,
    int EvaluationOrder,
    string? ThresholdGroup,
    bool IsActive
);

/// <summary>
/// DTO para actualizar un umbral
/// </summary>
public record UpdateThresholdDto(
    decimal? ThresholdValue,
    string? ThresholdOperator,
    int? ResultingScore,
    bool? IsActive
);

/// <summary>
/// DTO para actualizar múltiples umbrales a la vez
/// </summary>
public record UpdateThresholdsDto(
    List<UpdateSingleThresholdDto> Thresholds
);

/// <summary>
/// DTO para actualizar un umbral específico dentro de un batch
/// </summary>
public record UpdateSingleThresholdDto(
    string ThresholdName,
    decimal? ThresholdValue,
    string? ThresholdOperator,
    int? ResultingScore,
    bool? IsActive
);

/// <summary>
/// DTO para una query por versión de SQL
/// </summary>
public record SqlVersionQueryDto(
    int Id,
    string CollectorName,
    string QueryName,
    int MinSqlVersion,
    int? MaxSqlVersion,
    string QueryTemplate,
    string? Description,
    int Priority,
    bool IsActive
);

/// <summary>
/// DTO para el log de ejecución de un collector
/// </summary>
public record CollectorExecutionLogDto(
    long Id,
    string CollectorName,
    DateTime StartedAtUtc,
    DateTime? CompletedAtUtc,
    long? DurationMs,
    string Status,
    int TotalInstances,
    int SuccessCount,
    int ErrorCount,
    int SkippedCount,
    string? ErrorMessage,
    string TriggerType,
    string? TriggeredBy
);

/// <summary>
/// DTO para el resumen del estado de collectors
/// </summary>
public record CollectorsSummaryDto(
    int TotalCollectors,
    int EnabledCollectors,
    int RunningCollectors,
    DateTime? LastGlobalExecution,
    List<CollectorStatusDto> Collectors
);

/// <summary>
/// DTO para el estado resumido de un collector
/// </summary>
public record CollectorStatusDto(
    string Name,
    string DisplayName,
    bool IsEnabled,
    string Status, // Running, Idle, Error
    DateTime? LastExecution,
    int? LastDurationMs,
    int? LastInstancesProcessed,
    string? LastError
);

/// <summary>
/// DTO para solicitar ejecución manual de un collector
/// </summary>
public record ExecuteCollectorDto(
    string? InstanceFilter, // Filtro opcional de instancias
    bool ForceExecution // Ejecutar aunque esté deshabilitado
);

/// <summary>
/// DTO para el resultado de ejecución manual
/// </summary>
public record ExecuteCollectorResultDto(
    bool Started,
    string Message,
    long? ExecutionLogId
);

