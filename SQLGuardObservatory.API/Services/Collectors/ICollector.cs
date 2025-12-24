namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Interface base para todos los collectors
/// </summary>
public interface ICollector
{
    /// <summary>
    /// Nombre único del collector
    /// </summary>
    string CollectorName { get; }
    
    /// <summary>
    /// Nombre para mostrar
    /// </summary>
    string DisplayName { get; }
    
    /// <summary>
    /// Indica si el collector está actualmente ejecutándose
    /// </summary>
    bool IsRunning { get; }
    
    /// <summary>
    /// Ejecuta el collector para todas las instancias
    /// </summary>
    Task<CollectorExecutionResult> ExecuteAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Ejecuta el collector para una instancia específica
    /// </summary>
    Task ExecuteForInstanceAsync(string instanceName, CancellationToken ct = default);
}

/// <summary>
/// Resultado de la ejecución de un collector para una instancia
/// </summary>
public class CollectorInstanceResult
{
    public string InstanceName { get; set; } = string.Empty;
    public bool Success { get; set; }
    public int Score { get; set; }
    public string? Error { get; set; }
    public long DurationMs { get; set; }
    public Dictionary<string, object?> Metrics { get; set; } = new();
}

/// <summary>
/// Resultado de la ejecución completa de un collector
/// </summary>
public class CollectorExecutionResult
{
    public string CollectorName { get; set; } = string.Empty;
    public int InstancesProcessed { get; set; }
    public int SuccessCount { get; set; }
    public int ErrorCount { get; set; }
    public long TotalDurationMs { get; set; }
    public List<CollectorInstanceResult> Results { get; set; } = new();
}

