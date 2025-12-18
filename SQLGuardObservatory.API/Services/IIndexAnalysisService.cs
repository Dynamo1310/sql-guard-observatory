using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para análisis exhaustivo de índices en SQL Server
/// </summary>
public interface IIndexAnalysisService
{
    /// <summary>
    /// Obtiene las instancias del inventario filtradas (sin AWS, sin DMZ)
    /// </summary>
    Task<List<IndexAnalysisInstanceDto>> GetFilteredInstancesAsync();
    
    /// <summary>
    /// Obtiene las bases de datos de una instancia
    /// </summary>
    Task<List<DatabaseInfoDto>> GetDatabasesAsync(string instanceName);
    
    /// <summary>
    /// Obtiene índices fragmentados (>= umbral configurado)
    /// </summary>
    Task<List<FragmentedIndexDto>> GetFragmentedIndexesAsync(string instanceName, string databaseName, int minPageCount = 100, double minFragmentationPct = 10.0);
    
    /// <summary>
    /// Obtiene índices sin uso (no utilizados desde el último reinicio de SQL Server)
    /// </summary>
    Task<List<UnusedIndexDto>> GetUnusedIndexesAsync(string instanceName, string databaseName, int minPageCount = 100);
    
    /// <summary>
    /// Obtiene índices duplicados (mismas columnas clave en el mismo orden)
    /// </summary>
    Task<List<DuplicateIndexDto>> GetDuplicateIndexesAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Obtiene índices faltantes sugeridos por SQL Server
    /// </summary>
    Task<List<MissingIndexDto>> GetMissingIndexesAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Obtiene índices deshabilitados
    /// </summary>
    Task<List<DisabledIndexDto>> GetDisabledIndexesAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Obtiene índices solapados/redundantes
    /// </summary>
    Task<List<OverlappingIndexDto>> GetOverlappingIndexesAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Obtiene índices con problemas de diseño
    /// </summary>
    Task<List<BadIndexDto>> GetBadIndexesAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Obtiene el análisis completo de una base de datos
    /// </summary>
    Task<FullIndexAnalysisDto> GetFullAnalysisAsync(IndexAnalysisRequest request);
    
    /// <summary>
    /// Obtiene solo el resumen del análisis
    /// </summary>
    Task<IndexAnalysisSummaryDto> GetAnalysisSummaryAsync(string instanceName, string databaseName);
    
    /// <summary>
    /// Prueba la conexión a una instancia
    /// </summary>
    Task<bool> TestConnectionAsync(string instanceName);
}

