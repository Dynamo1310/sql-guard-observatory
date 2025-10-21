using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

public interface IPermissionService
{
    Task<List<RolePermissionDto>> GetAllRolePermissionsAsync();
    Task<RolePermissionDto?> GetRolePermissionsAsync(string role);
    Task<bool> UpdateRolePermissionsAsync(string role, Dictionary<string, bool> permissions);
    Task<AvailableViewsDto> GetAvailableViewsAndRolesAsync();
    Task<List<string>> GetUserPermissionsAsync(string userId);
}

