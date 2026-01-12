using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para verificar permisos administrativos basados en capacidades dinámicas.
/// Los roles personalizables definen qué CAPACIDADES tiene cada usuario.
/// Los grupos controlan PERMISOS DE VISTAS (qué puede ver cada usuario).
/// </summary>
public interface IAdminAuthorizationService
{
    // =============================================
    // Sistema de capacidades dinámicas
    // =============================================
    
    /// <summary>
    /// Verifica si el usuario tiene una capacidad específica
    /// </summary>
    Task<bool> HasCapabilityAsync(string userId, string capabilityKey);
    
    /// <summary>
    /// Obtiene todas las capacidades habilitadas del usuario
    /// </summary>
    Task<List<string>> GetUserCapabilitiesAsync(string userId);
    
    /// <summary>
    /// Obtiene el rol administrativo del usuario
    /// </summary>
    Task<AdminRole?> GetUserAdminRoleAsync(string userId);
    
    /// <summary>
    /// Obtiene los roles que el usuario puede asignar a otros
    /// </summary>
    Task<List<AdminRole>> GetAssignableRolesAsync(string userId);
    
    /// <summary>
    /// Verifica si el usuario puede asignar un rol específico (por ID)
    /// </summary>
    Task<bool> CanAssignRoleByIdAsync(string userId, int targetRoleId);
    
    // =============================================
    // Verificaciones de rol (compatibilidad)
    // =============================================
    
    /// <summary>
    /// Obtiene el nombre del rol del usuario (para compatibilidad)
    /// </summary>
    Task<string> GetUserRoleAsync(string userId);
    
    /// <summary>
    /// Verifica si el usuario es SuperAdmin (rol de sistema con máxima prioridad)
    /// </summary>
    Task<bool> IsSuperAdminAsync(string userId);
    
    /// <summary>
    /// Verifica si el usuario es Admin (rol de sistema con prioridad media)
    /// </summary>
    Task<bool> IsAdminAsync(string userId);
    
    /// <summary>
    /// Verifica si el usuario es Reader (rol de sistema con mínima prioridad)
    /// </summary>
    Task<bool> IsReaderAsync(string userId);
    
    // =============================================
    // Permisos sobre usuarios (ahora basados en capacidades)
    // =============================================
    
    Task<bool> CanCreateUsersAsync(string userId);
    Task<bool> CanEditUsersAsync(string userId);
    Task<bool> CanDeleteUsersAsync(string userId);
    Task<bool> CanImportFromADAsync(string userId);
    Task<bool> CanAssignRolesAsync(string userId);
    
    /// <summary>
    /// Verifica si el usuario puede modificar a otro usuario específico
    /// Considera la prioridad del rol: no se puede modificar usuarios con rol de mayor prioridad
    /// </summary>
    Task<bool> CanModifyUserAsync(string userId, string targetUserId);
    
    /// <summary>
    /// Verifica si el usuario puede asignar un rol específico (por nombre - compatibilidad)
    /// </summary>
    Task<bool> CanAssignRoleAsync(string userId, string targetRoleName);
    
    // =============================================
    // Permisos sobre grupos
    // =============================================
    
    Task<bool> CanViewGroupsAsync(string userId);
    Task<bool> CanCreateGroupsAsync(string userId);
    Task<bool> CanManageGroupAsync(string userId, int groupId);
    Task<bool> CanEditGroupAsync(string userId, int groupId);
    Task<bool> CanDeleteGroupAsync(string userId, int groupId);
    Task<bool> CanManageGroupMembersAsync(string userId, int groupId);
    Task<bool> CanManageGroupPermissionsAsync(string userId, int groupId);
    Task<bool> CanSyncGroupWithADAsync(string userId, int groupId);
    Task<List<int>> GetManageableGroupIdsAsync(string userId);
    
    // =============================================
    // Permisos sobre roles
    // =============================================
    
    Task<bool> CanViewRolesAsync(string userId);
    Task<bool> CanCreateRolesAsync(string userId);
    Task<bool> CanEditRolesAsync(string userId);
    Task<bool> CanDeleteRolesAsync(string userId);
    Task<bool> CanAssignCapabilitiesAsync(string userId);
    
    // =============================================
    // Permisos sobre sistema
    // =============================================
    
    Task<bool> CanConfigureSMTPAsync(string userId);
    Task<bool> CanConfigureCollectorsAsync(string userId);
    Task<bool> CanConfigureAlertsAsync(string userId);
    Task<bool> CanManageCredentialsAsync(string userId);
    Task<bool> CanViewAuditAsync(string userId);
    Task<bool> CanManageMenuBadgesAsync(string userId);
    
    // =============================================
    // Asignaciones de grupos a admins
    // =============================================
    
    Task<bool> CanAssignGroupsToAdminsAsync(string userId);
    Task<UserAdminAssignmentsDto?> GetUserAssignmentsAsync(string adminUserId);
    Task<GroupAdminsDto?> GetGroupAdminsAsync(int groupId);
    
    // =============================================
    // Información de autorización completa
    // =============================================
    
    /// <summary>
    /// Obtiene información completa de autorización del usuario para el frontend
    /// </summary>
    Task<UserAuthorizationDto> GetUserAuthorizationAsync(string userId);
    
    /// <summary>
    /// Obtiene información de autorización del usuario (compatibilidad)
    /// </summary>
    Task<UserAuthorizationInfoDto> GetUserAuthorizationInfoAsync(string userId);
}
