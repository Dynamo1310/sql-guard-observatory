namespace SQLGuardObservatory.API.DTOs;

// =============================================
// DTOs para Grupos de Seguridad
// =============================================

/// <summary>
/// DTO para mostrar información de un grupo de seguridad
/// </summary>
public class SecurityGroupDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public bool IsActive { get; set; }
    public int MemberCount { get; set; }
    public int PermissionCount { get; set; }
    public bool HasADSync { get; set; }
    public string? ADGroupName { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public string? CreatedByUserName { get; set; }
    public string? UpdatedAt { get; set; }
}

/// <summary>
/// DTO con información detallada del grupo incluyendo miembros y permisos
/// </summary>
public class SecurityGroupDetailDto : SecurityGroupDto
{
    public List<GroupMemberDto> Members { get; set; } = new();
    public Dictionary<string, bool> Permissions { get; set; } = new();
    public ADSyncConfigDto? ADSyncConfig { get; set; }
}

/// <summary>
/// Request para crear un nuevo grupo
/// </summary>
public class CreateGroupRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// IDs de usuarios a agregar al grupo al crearlo (opcional)
    /// </summary>
    public List<string>? InitialMemberIds { get; set; }
    
    /// <summary>
    /// Permisos iniciales del grupo (opcional)
    /// </summary>
    public Dictionary<string, bool>? InitialPermissions { get; set; }
}

/// <summary>
/// Request para actualizar un grupo existente
/// </summary>
public class UpdateGroupRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>
/// DTO para mostrar información de un miembro del grupo
/// </summary>
public class GroupMemberDto
{
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Role { get; set; }
    public string AddedAt { get; set; } = string.Empty;
    public string? AddedByUserName { get; set; }
}

/// <summary>
/// Request para agregar miembros a un grupo
/// </summary>
public class AddMembersRequest
{
    public List<string> UserIds { get; set; } = new();
}

/// <summary>
/// DTO para mostrar permisos del grupo
/// </summary>
public class GroupPermissionDto
{
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public Dictionary<string, bool> Permissions { get; set; } = new();
}

/// <summary>
/// Request para actualizar permisos del grupo
/// </summary>
public class UpdateGroupPermissionsRequest
{
    public Dictionary<string, bool> Permissions { get; set; } = new();
}

/// <summary>
/// DTO para configuración de sincronización con Active Directory
/// </summary>
public class ADSyncConfigDto
{
    public int? Id { get; set; }
    public int GroupId { get; set; }
    public string ADGroupName { get; set; } = string.Empty;
    public bool AutoSync { get; set; }
    public int SyncIntervalHours { get; set; } = 24;
    public string? LastSyncAt { get; set; }
    public string? LastSyncResult { get; set; }
    public int? LastSyncAddedCount { get; set; }
    public int? LastSyncRemovedCount { get; set; }
}

/// <summary>
/// Request para configurar sincronización con AD
/// </summary>
public class UpdateADSyncConfigRequest
{
    public string ADGroupName { get; set; } = string.Empty;
    public bool AutoSync { get; set; }
    public int SyncIntervalHours { get; set; } = 24;
}

/// <summary>
/// Resultado de una sincronización con AD
/// </summary>
public class ADSyncResultDto
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public int AddedCount { get; set; }
    public int RemovedCount { get; set; }
    public int SkippedCount { get; set; }
    public List<string> AddedUsers { get; set; } = new();
    public List<string> RemovedUsers { get; set; } = new();
    public List<string> Errors { get; set; } = new();
    public string SyncedAt { get; set; } = string.Empty;
}

/// <summary>
/// DTO para listar grupos de un usuario
/// </summary>
public class UserGroupMembershipDto
{
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? GroupColor { get; set; }
    public string? GroupIcon { get; set; }
    public string AddedAt { get; set; } = string.Empty;
}

/// <summary>
/// DTO para mostrar usuarios disponibles para agregar a un grupo
/// </summary>
public class AvailableUserDto
{
    public string UserId { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string? Role { get; set; }
    public bool IsAlreadyMember { get; set; }
}

/// <summary>
/// DTO para mostrar grupos en los que un usuario es miembro (para la página de usuarios)
/// </summary>
public class UserWithGroupsDto
{
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool Active { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    public List<UserGroupMembershipDto> Groups { get; set; } = new();
}

