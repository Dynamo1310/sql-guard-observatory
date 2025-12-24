namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Proveedor de instancias SQL Server a monitorear
/// </summary>
public interface IInstanceProvider
{
    /// <summary>
    /// Obtiene todas las instancias activas para monitoreo
    /// </summary>
    Task<List<SqlInstanceInfo>> GetActiveInstancesAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene instancias filtradas (excluyendo DMZ, AWS según configuración, etc.)
    /// </summary>
    Task<List<SqlInstanceInfo>> GetFilteredInstancesAsync(
        bool includeDMZ = false, 
        bool includeAWS = false, 
        bool onlyAWS = false,
        CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene información de una instancia específica
    /// </summary>
    Task<SqlInstanceInfo?> GetInstanceInfoAsync(string instanceName, CancellationToken ct = default);
    
    /// <summary>
    /// Actualiza la información de versión de una instancia
    /// </summary>
    Task UpdateInstanceVersionAsync(string instanceName, int sqlMajorVersion, string versionString, CancellationToken ct = default);
}

