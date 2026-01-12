using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IPermissionService
{
    /// <summary>
    /// Obtiene las vistas disponibles del sistema
    /// </summary>
    Task<AvailableViewsDto> GetAvailableViewsAndRolesAsync();
    
    /// <summary>
    /// Obtiene los permisos de un usuario basados en sus grupos
    /// </summary>
    Task<List<string>> GetUserPermissionsAsync(string userId);
    
    /// <summary>
    /// Verifica si un usuario tiene permiso para una vista específica
    /// </summary>
    Task<bool> HasPermissionAsync(string userId, string viewName);
}
