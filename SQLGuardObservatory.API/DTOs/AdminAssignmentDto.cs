namespace SQLGuardObservatory.API.DTOs;

// =============================================
// DTOs para Asignaciones de Grupos a Admins
// =============================================

/// <summary>
/// DTO para mostrar una asignación de grupo a admin
/// </summary>
public class AdminGroupAssignmentDto
{
    public int Id { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserDisplayName { get; set; } = string.Empty;
    public string? UserEmail { get; set; }
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? GroupColor { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanManageMembers { get; set; }
    public bool CanManagePermissions { get; set; }
    public string? AssignedByDisplayName { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}

/// <summary>
/// DTO para mostrar los grupos asignados a un usuario Admin
/// </summary>
public class UserAdminAssignmentsDto
{
    public string UserId { get; set; } = string.Empty;
    public string UserDisplayName { get; set; } = string.Empty;
    public string? UserRole { get; set; }
    public List<AssignedGroupDto> AssignedGroups { get; set; } = new();
}

/// <summary>
/// DTO para mostrar un grupo asignado con sus permisos
/// </summary>
public class AssignedGroupDto
{
    public int AssignmentId { get; set; }
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public string? GroupColor { get; set; }
    public string? GroupIcon { get; set; }
    public int MemberCount { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanManageMembers { get; set; }
    public bool CanManagePermissions { get; set; }
}

/// <summary>
/// DTO para mostrar los administradores de un grupo
/// </summary>
public class GroupAdminsDto
{
    public int GroupId { get; set; }
    public string GroupName { get; set; } = string.Empty;
    public List<GroupAdminDto> Admins { get; set; } = new();
}

/// <summary>
/// DTO para mostrar un admin de un grupo
/// </summary>
public class GroupAdminDto
{
    public int AssignmentId { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string UserDisplayName { get; set; } = string.Empty;
    public string? UserEmail { get; set; }
    public bool CanEdit { get; set; }
    public bool CanDelete { get; set; }
    public bool CanManageMembers { get; set; }
    public bool CanManagePermissions { get; set; }
    public string? AssignedByDisplayName { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}

/// <summary>
/// Request para asignar grupos a un usuario Admin
/// </summary>
public class AssignGroupsToUserRequest
{
    /// <summary>
    /// Lista de asignaciones a crear/actualizar
    /// </summary>
    public List<GroupAssignmentRequest> Assignments { get; set; } = new();
}

/// <summary>
/// Request para una asignación individual de grupo
/// </summary>
public class GroupAssignmentRequest
{
    public int GroupId { get; set; }
    public bool CanEdit { get; set; } = true;
    public bool CanDelete { get; set; } = false;
    public bool CanManageMembers { get; set; } = true;
    public bool CanManagePermissions { get; set; } = true;
}

/// <summary>
/// Request para asignar administradores a un grupo
/// </summary>
public class AssignAdminsToGroupRequest
{
    /// <summary>
    /// Lista de asignaciones de admins para este grupo
    /// </summary>
    public List<AdminAssignmentRequest> Admins { get; set; } = new();
}

/// <summary>
/// Request para una asignación individual de admin
/// </summary>
public class AdminAssignmentRequest
{
    public string UserId { get; set; } = string.Empty;
    public bool CanEdit { get; set; } = true;
    public bool CanDelete { get; set; } = false;
    public bool CanManageMembers { get; set; } = true;
    public bool CanManagePermissions { get; set; } = true;
}

/// <summary>
/// DTO para mostrar usuarios disponibles para asignar como admin de un grupo
/// </summary>
public class AvailableAdminDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool IsAlreadyAssigned { get; set; }
}

/// <summary>
/// DTO extendido para información de autorización del usuario actual
/// </summary>
public class UserAuthorizationInfoDto
{
    public string UserId { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool IsSuperAdmin { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsReader { get; set; }
    public bool CanCreateUsers { get; set; }
    public bool CanDeleteUsers { get; set; }
    public bool CanCreateGroups { get; set; }
    public List<int> ManageableGroupIds { get; set; } = new();
    public List<string> Permissions { get; set; } = new();
}




