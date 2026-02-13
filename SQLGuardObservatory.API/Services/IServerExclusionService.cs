using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para gestionar exclusiones globales de servidores en alertas.
/// Cuando un servidor se da de baja, se excluye de todas las alertas.
/// </summary>
public interface IServerExclusionService
{
    /// <summary>
    /// Obtiene todas las exclusiones (activas e inactivas)
    /// </summary>
    Task<List<ServerAlertExclusion>> GetAllExclusionsAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene solo las exclusiones activas (no expiradas)
    /// </summary>
    Task<List<ServerAlertExclusion>> GetActiveExclusionsAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Retorna un HashSet con los nombres de servidores excluidos para filtrado eficiente.
    /// Incluye variantes: hostname, shortname, FQDN para matching flexible.
    /// </summary>
    Task<HashSet<string>> GetExcludedServerNamesAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Verifica si un servidor específico está excluido.
    /// Soporta matching por hostname, nombre corto e instancia.
    /// </summary>
    Task<bool> IsServerExcludedAsync(string serverName, CancellationToken ct = default);
    
    /// <summary>
    /// Agrega una nueva exclusión
    /// </summary>
    Task<ServerAlertExclusion> AddExclusionAsync(ServerAlertExclusion exclusion, CancellationToken ct = default);
    
    /// <summary>
    /// Elimina una exclusión por Id
    /// </summary>
    Task<bool> RemoveExclusionAsync(int id, CancellationToken ct = default);
}
