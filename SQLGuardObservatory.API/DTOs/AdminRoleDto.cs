namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO para transferir información de un rol administrativo
/// </summary>
public class AdminRoleDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = "#6b7280";
    public string Icon { get; set; } = "Shield";
    public int Priority { get; set; }
    public bool IsSystem { get; set; }
    public bool IsActive { get; set; }
    public int UsersCount { get; set; }
    public List<string> EnabledCapabilities { get; set; } = new();
    public List<int> AssignableRoleIds { get; set; } = new();
    public string? CreatedAt { get; set; }
    public string? UpdatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
}

/// <summary>
/// DTO para crear un nuevo rol
/// </summary>
public class CreateAdminRoleRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Color { get; set; } = "#6b7280";
    public string Icon { get; set; } = "Shield";
    public int Priority { get; set; } = 200;
    public List<string> EnabledCapabilities { get; set; } = new();
    public List<int> AssignableRoleIds { get; set; } = new();
}

/// <summary>
/// DTO para actualizar un rol existente
/// </summary>
public class UpdateAdminRoleRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Color { get; set; }
    public string? Icon { get; set; }
    public int? Priority { get; set; }
    public bool? IsActive { get; set; }
    public List<string>? EnabledCapabilities { get; set; }
    public List<int>? AssignableRoleIds { get; set; }
}

/// <summary>
/// DTO para información de una capacidad
/// </summary>
public class CapabilityDto
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public bool IsEnabled { get; set; }
}

/// <summary>
/// DTO para agrupar capacidades por categoría
/// </summary>
public class CapabilityCategoryDto
{
    public string Category { get; set; } = string.Empty;
    public List<CapabilityDto> Capabilities { get; set; } = new();
}

/// <summary>
/// DTO para la información de autorización del usuario actual
/// </summary>
public class UserAuthorizationDto
{
    public string UserId { get; set; } = string.Empty;
    public int? RoleId { get; set; }
    public string RoleName { get; set; } = string.Empty;
    public string RoleColor { get; set; } = "#6b7280";
    public string RoleIcon { get; set; } = "Shield";
    public int RolePriority { get; set; }
    
    // Capacidades habilitadas
    public List<string> Capabilities { get; set; } = new();
    
    // Roles que puede asignar
    public List<AdminRoleDto> AssignableRoles { get; set; } = new();
    
    // IDs de grupos que puede gestionar
    public List<int> ManageableGroupIds { get; set; } = new();
    
    // Helpers de compatibilidad (calculados)
    public bool IsSuperAdmin { get; set; }
    public bool IsAdmin { get; set; }
    public bool IsReader { get; set; }
    public bool CanCreateUsers { get; set; }
    public bool CanDeleteUsers { get; set; }
    public bool CanCreateGroups { get; set; }
}

/// <summary>
/// DTO simplificado de rol para asignación en usuarios
/// </summary>
public class AdminRoleSimpleDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#6b7280";
    public string Icon { get; set; } = "Shield";
    public int Priority { get; set; }
}




