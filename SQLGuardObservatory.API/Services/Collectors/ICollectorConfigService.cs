using SQLGuardObservatory.API.Models.Collectors;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Servicio para gestionar la configuración de collectors
/// </summary>
public interface ICollectorConfigService
{
    /// <summary>
    /// Obtiene la configuración de un collector específico
    /// </summary>
    Task<CollectorConfig?> GetConfigAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene la configuración de todos los collectors
    /// </summary>
    Task<List<CollectorConfig>> GetAllConfigsAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los collectors habilitados ordenados por ejecución
    /// </summary>
    Task<List<CollectorConfig>> GetEnabledCollectorsAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Actualiza la configuración de un collector
    /// </summary>
    Task<bool> UpdateConfigAsync(string collectorName, Action<CollectorConfig> updateAction, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los umbrales de un collector
    /// </summary>
    Task<List<CollectorThreshold>> GetThresholdsAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los umbrales activos de un collector (para cálculo de score)
    /// </summary>
    Task<List<CollectorThreshold>> GetActiveThresholdsAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Actualiza un umbral específico
    /// </summary>
    Task<bool> UpdateThresholdAsync(int thresholdId, Action<CollectorThreshold> updateAction, CancellationToken ct = default);
    
    /// <summary>
    /// Restablece los umbrales de un collector a sus valores por defecto
    /// </summary>
    Task<bool> ResetThresholdsToDefaultAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene la query apropiada para una versión de SQL Server
    /// </summary>
    Task<SqlVersionQuery?> GetQueryForVersionAsync(string collectorName, string queryName, int sqlMajorVersion, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene todas las queries de un collector
    /// </summary>
    Task<List<SqlVersionQuery>> GetVersionQueriesAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Registra el inicio de una ejecución
    /// </summary>
    Task<CollectorExecutionLog> StartExecutionLogAsync(string collectorName, string triggerType, string? triggeredBy = null, CancellationToken ct = default);
    
    /// <summary>
    /// Actualiza el log de ejecución con el resultado
    /// </summary>
    Task CompleteExecutionLogAsync(long logId, int successCount, int errorCount, int skippedCount, string? errorMessage = null, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los logs de ejecución recientes de un collector
    /// </summary>
    Task<List<CollectorExecutionLog>> GetRecentExecutionLogsAsync(string collectorName, int count = 10, CancellationToken ct = default);
    
    /// <summary>
    /// Actualiza las métricas de última ejecución en la configuración
    /// </summary>
    Task UpdateLastExecutionAsync(string collectorName, DateTime executionTime, long durationMs, int instancesProcessed, string? error = null, CancellationToken ct = default);
    
    // === EXCEPCIONES DE COLLECTORS ===
    
    /// <summary>
    /// Obtiene todas las excepciones de un collector
    /// </summary>
    Task<List<CollectorException>> GetExceptionsAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene todas las excepciones activas de un collector
    /// </summary>
    Task<List<CollectorException>> GetActiveExceptionsAsync(string collectorName, CancellationToken ct = default);
    
    /// <summary>
    /// Agrega una nueva excepción
    /// </summary>
    Task<CollectorException> AddExceptionAsync(CollectorException exception, CancellationToken ct = default);
    
    /// <summary>
    /// Elimina una excepción por ID
    /// </summary>
    Task<bool> RemoveExceptionAsync(int exceptionId, CancellationToken ct = default);
    
    /// <summary>
    /// Verifica si un servidor está exceptuado para un tipo específico
    /// </summary>
    Task<bool> IsExceptedAsync(string collectorName, string exceptionType, string serverName, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene las excepciones activas para un servidor específico
    /// </summary>
    Task<List<CollectorException>> GetExceptionsForServerAsync(string collectorName, string serverName, CancellationToken ct = default);
}

