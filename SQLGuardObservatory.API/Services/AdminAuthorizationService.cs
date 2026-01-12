using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para verificar permisos administrativos basados en capacidades dinámicas.
/// Los roles personalizables definen qué CAPACIDADES tiene cada usuario.
/// Los grupos controlan PERMISOS DE VISTAS (qué puede ver cada usuario).
/// </summary>
public class AdminAuthorizationService : IAdminAuthorizationService
{
    private readonly ApplicationDbContext _context;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IPermissionService _permissionService;

    public AdminAuthorizationService(
        ApplicationDbContext context,
        UserManager<ApplicationUser> userManager,
        IPermissionService permissionService)
    {
        _context = context;
        _userManager = userManager;
        _permissionService = permissionService;
    }

    // =============================================
    // Sistema de capacidades dinámicas
    // =============================================

    public async Task<bool> HasCapabilityAsync(string userId, string capabilityKey)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
                .ThenInclude(r => r!.Capabilities)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user?.AdminRole == null) return false;

        return user.AdminRole.Capabilities
            .Any(c => c.CapabilityKey == capabilityKey && c.IsEnabled);
    }

    public async Task<List<string>> GetUserCapabilitiesAsync(string userId)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
                .ThenInclude(r => r!.Capabilities)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user?.AdminRole == null) return new List<string>();

        return user.AdminRole.Capabilities
            .Where(c => c.IsEnabled)
            .Select(c => c.CapabilityKey)
            .ToList();
    }

    public async Task<AdminRole?> GetUserAdminRoleAsync(string userId)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
                .ThenInclude(r => r!.Capabilities)
            .Include(u => u.AdminRole)
                .ThenInclude(r => r!.AssignableRoles)
                    .ThenInclude(ar => ar.AssignableRole)
            .FirstOrDefaultAsync(u => u.Id == userId);

        return user?.AdminRole;
    }

    public async Task<List<AdminRole>> GetAssignableRolesAsync(string userId)
    {
        var userRole = await GetUserAdminRoleAsync(userId);
        if (userRole == null) return new List<AdminRole>();

        var assignableRoleIds = userRole.AssignableRoles.Select(ar => ar.AssignableRoleId).ToList();

        return await _context.AdminRoles
            .Where(r => assignableRoleIds.Contains(r.Id) && r.IsActive)
            .OrderByDescending(r => r.Priority)
            .ToListAsync();
    }

    public async Task<bool> CanAssignRoleByIdAsync(string userId, int targetRoleId)
    {
        var userRole = await GetUserAdminRoleAsync(userId);
        if (userRole == null) return false;

        return userRole.AssignableRoles.Any(ar => ar.AssignableRoleId == targetRoleId);
    }

    // =============================================
    // Verificaciones de rol (compatibilidad)
    // =============================================

    public async Task<string> GetUserRoleAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);
        return role?.Name ?? "Reader";
    }

    public async Task<bool> IsSuperAdminAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);
        return role?.Name == "SuperAdmin";
    }

    public async Task<bool> IsAdminAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);
        return role?.Name == "Admin";
    }

    public async Task<bool> IsReaderAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);
        return role?.Name == "Reader" || role == null;
    }

    // =============================================
    // Permisos sobre usuarios
    // =============================================

    public async Task<bool> CanCreateUsersAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.UsersCreate);
    }

    public async Task<bool> CanEditUsersAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.UsersEdit);
    }

    public async Task<bool> CanDeleteUsersAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.UsersDelete);
    }

    public async Task<bool> CanImportFromADAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.UsersImportFromAD);
    }

    public async Task<bool> CanAssignRolesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.UsersAssignRoles);
    }

    public async Task<bool> CanModifyUserAsync(string userId, string targetUserId)
    {
        // Un usuario siempre puede ver su propio perfil
        if (userId == targetUserId) return true;

        // Verificar capacidad de edición
        if (!await HasCapabilityAsync(userId, CapabilityDefinitions.UsersEdit)) return false;

        // Obtener roles de ambos usuarios
        var currentUserRole = await GetUserAdminRoleAsync(userId);
        var targetUserRole = await GetUserAdminRoleAsync(targetUserId);

        if (currentUserRole == null) return false;

        // No se puede modificar usuarios con rol de mayor prioridad
        var targetPriority = targetUserRole?.Priority ?? 0;
        return currentUserRole.Priority >= targetPriority;
    }

    public async Task<bool> CanAssignRoleAsync(string userId, string targetRoleName)
    {
        if (!await HasCapabilityAsync(userId, CapabilityDefinitions.UsersAssignRoles)) return false;

        var assignableRoles = await GetAssignableRolesAsync(userId);
        return assignableRoles.Any(r => r.Name == targetRoleName);
    }

    // =============================================
    // Permisos sobre grupos
    // =============================================

    public async Task<bool> CanViewGroupsAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.GroupsView);
    }

    public async Task<bool> CanCreateGroupsAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.GroupsCreate);
    }

    public async Task<bool> CanManageGroupAsync(string userId, int groupId)
    {
        // Si tiene capacidad global de edición de grupos
        if (await HasCapabilityAsync(userId, CapabilityDefinitions.GroupsEdit))
        {
            // SuperAdmin (prioridad máxima) puede gestionar cualquier grupo
            var role = await GetUserAdminRoleAsync(userId);
            if (role?.Priority >= 1000) return true;
        }

        // Verificar asignación específica
        return await _context.AdminGroupAssignments
            .AnyAsync(a => a.UserId == userId && a.GroupId == groupId);
    }

    public async Task<bool> CanEditGroupAsync(string userId, int groupId)
    {
        // Verificar si tiene capacidad global
        var role = await GetUserAdminRoleAsync(userId);
        if (role?.Priority >= 1000) return true; // SuperAdmin

        // Verificar asignación específica
        var assignment = await _context.AdminGroupAssignments
            .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);

        return assignment?.CanEdit ?? false;
    }

    public async Task<bool> CanDeleteGroupAsync(string userId, int groupId)
    {
        // Verificar capacidad global de eliminar grupos
        if (await HasCapabilityAsync(userId, CapabilityDefinitions.GroupsDelete))
        {
            var role = await GetUserAdminRoleAsync(userId);
            if (role?.Priority >= 1000) return true; // SuperAdmin
        }

        // Verificar asignación específica
        var assignment = await _context.AdminGroupAssignments
            .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);

        return assignment?.CanDelete ?? false;
    }

    public async Task<bool> CanManageGroupMembersAsync(string userId, int groupId)
    {
        // SuperAdmin puede gestionar cualquier grupo
        var role = await GetUserAdminRoleAsync(userId);
        if (role?.Priority >= 1000) return true;

        // Verificar asignación específica
        var assignment = await _context.AdminGroupAssignments
            .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);

        return assignment?.CanManageMembers ?? false;
    }

    public async Task<bool> CanManageGroupPermissionsAsync(string userId, int groupId)
    {
        // SuperAdmin puede gestionar cualquier grupo
        var role = await GetUserAdminRoleAsync(userId);
        if (role?.Priority >= 1000) return true;

        // Verificar asignación específica
        var assignment = await _context.AdminGroupAssignments
            .FirstOrDefaultAsync(a => a.UserId == userId && a.GroupId == groupId);

        return assignment?.CanManagePermissions ?? false;
    }

    public async Task<bool> CanSyncGroupWithADAsync(string userId, int groupId)
    {
        if (!await HasCapabilityAsync(userId, CapabilityDefinitions.GroupsSyncWithAD)) return false;

        // SuperAdmin puede sincronizar cualquier grupo
        var role = await GetUserAdminRoleAsync(userId);
        if (role?.Priority >= 1000) return true;

        // Verificar si tiene asignación para el grupo
        return await _context.AdminGroupAssignments
            .AnyAsync(a => a.UserId == userId && a.GroupId == groupId);
    }

    public async Task<List<int>> GetManageableGroupIdsAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);

        // SuperAdmin puede gestionar todos los grupos activos
        if (role?.Priority >= 1000)
        {
            return await _context.SecurityGroups
                .Where(g => !g.IsDeleted)
                .Select(g => g.Id)
                .ToListAsync();
        }

        // Otros usuarios solo pueden gestionar grupos asignados
        return await _context.AdminGroupAssignments
            .Where(a => a.UserId == userId)
            .Select(a => a.GroupId)
            .ToListAsync();
    }

    // =============================================
    // Permisos sobre roles
    // =============================================

    public async Task<bool> CanViewRolesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.RolesView);
    }

    public async Task<bool> CanCreateRolesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.RolesCreate);
    }

    public async Task<bool> CanEditRolesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.RolesEdit);
    }

    public async Task<bool> CanDeleteRolesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.RolesDelete);
    }

    public async Task<bool> CanAssignCapabilitiesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.RolesAssignCapabilities);
    }

    // =============================================
    // Permisos sobre sistema
    // =============================================

    public async Task<bool> CanConfigureSMTPAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemConfigureSMTP);
    }

    public async Task<bool> CanConfigureCollectorsAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemConfigureCollectors);
    }

    public async Task<bool> CanConfigureAlertsAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemConfigureAlerts);
    }

    public async Task<bool> CanManageCredentialsAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemManageCredentials);
    }

    public async Task<bool> CanViewAuditAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemViewAudit);
    }

    public async Task<bool> CanManageMenuBadgesAsync(string userId)
    {
        return await HasCapabilityAsync(userId, CapabilityDefinitions.SystemManageMenuBadges);
    }

    // =============================================
    // Asignaciones de grupos a admins
    // =============================================

    public async Task<bool> CanAssignGroupsToAdminsAsync(string userId)
    {
        // Solo SuperAdmin puede asignar grupos a otros admins
        var role = await GetUserAdminRoleAsync(userId);
        return role?.Priority >= 1000;
    }

    public async Task<UserAdminAssignmentsDto?> GetUserAssignmentsAsync(string adminUserId)
    {
        var user = await _userManager.FindByIdAsync(adminUserId);
        if (user == null) return null;

        var roleName = await GetUserRoleAsync(adminUserId);

        var assignments = await _context.AdminGroupAssignments
            .Where(a => a.UserId == adminUserId)
            .Include(a => a.Group)
            .Select(a => new AssignedGroupDto
            {
                AssignmentId = a.Id,
                GroupId = a.GroupId,
                GroupName = a.Group!.Name,
                GroupColor = a.Group.Color,
                GroupIcon = a.Group.Icon,
                MemberCount = _context.UserGroups.Count(ug => ug.GroupId == a.GroupId),
                CanEdit = a.CanEdit,
                CanDelete = a.CanDelete,
                CanManageMembers = a.CanManageMembers,
                CanManagePermissions = a.CanManagePermissions
            })
            .ToListAsync();

        return new UserAdminAssignmentsDto
        {
            UserId = adminUserId,
            UserDisplayName = user.DisplayName ?? user.UserName ?? string.Empty,
            UserRole = roleName,
            AssignedGroups = assignments
        };
    }

    public async Task<GroupAdminsDto?> GetGroupAdminsAsync(int groupId)
    {
        var group = await _context.SecurityGroups
            .Where(g => g.Id == groupId && !g.IsDeleted)
            .FirstOrDefaultAsync();

        if (group == null) return null;

        var admins = await _context.AdminGroupAssignments
            .Where(a => a.GroupId == groupId)
            .Include(a => a.User)
            .Include(a => a.AssignedByUser)
            .Select(a => new GroupAdminDto
            {
                AssignmentId = a.Id,
                UserId = a.UserId,
                UserDisplayName = a.User!.DisplayName ?? a.User.UserName ?? string.Empty,
                UserEmail = a.User.Email,
                CanEdit = a.CanEdit,
                CanDelete = a.CanDelete,
                CanManageMembers = a.CanManageMembers,
                CanManagePermissions = a.CanManagePermissions,
                AssignedByDisplayName = a.AssignedByUser != null ? a.AssignedByUser.DisplayName : null,
                CreatedAt = a.CreatedAt.ToString("o")
            })
            .ToListAsync();

        return new GroupAdminsDto
        {
            GroupId = groupId,
            GroupName = group.Name,
            Admins = admins
        };
    }

    // =============================================
    // Información de autorización completa
    // =============================================

    public async Task<UserAuthorizationDto> GetUserAuthorizationAsync(string userId)
    {
        var role = await GetUserAdminRoleAsync(userId);
        var capabilities = await GetUserCapabilitiesAsync(userId);
        var assignableRoles = await GetAssignableRolesAsync(userId);
        var manageableGroupIds = await GetManageableGroupIdsAsync(userId);

        return new UserAuthorizationDto
        {
            UserId = userId,
            RoleId = role?.Id,
            RoleName = role?.Name ?? "Reader",
            RoleColor = role?.Color ?? "#6b7280",
            RoleIcon = role?.Icon ?? "Eye",
            RolePriority = role?.Priority ?? 0,
            Capabilities = capabilities,
            AssignableRoles = assignableRoles.Select(r => new AdminRoleDto
            {
                Id = r.Id,
                Name = r.Name,
                Description = r.Description,
                Color = r.Color,
                Icon = r.Icon,
                Priority = r.Priority,
                IsSystem = r.IsSystem,
                IsActive = r.IsActive
            }).ToList(),
            ManageableGroupIds = manageableGroupIds,
            // Helpers de compatibilidad
            IsSuperAdmin = role?.Name == "SuperAdmin",
            IsAdmin = role?.Name == "Admin",
            IsReader = role?.Name == "Reader" || role == null,
            CanCreateUsers = capabilities.Contains(CapabilityDefinitions.UsersCreate),
            CanDeleteUsers = capabilities.Contains(CapabilityDefinitions.UsersDelete),
            CanCreateGroups = capabilities.Contains(CapabilityDefinitions.GroupsCreate)
        };
    }

    public async Task<UserAuthorizationInfoDto> GetUserAuthorizationInfoAsync(string userId)
    {
        var authDto = await GetUserAuthorizationAsync(userId);
        var permissions = await _permissionService.GetUserPermissionsAsync(userId);

        return new UserAuthorizationInfoDto
        {
            UserId = userId,
            Role = authDto.RoleName,
            IsSuperAdmin = authDto.IsSuperAdmin,
            IsAdmin = authDto.IsAdmin,
            IsReader = authDto.IsReader,
            CanCreateUsers = authDto.CanCreateUsers,
            CanDeleteUsers = authDto.CanDeleteUsers,
            CanCreateGroups = authDto.CanCreateGroups,
            ManageableGroupIds = authDto.ManageableGroupIds,
            Permissions = permissions
        };
    }
}
