namespace SQLGuardObservatory.API.DTOs;

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public bool Allowed { get; set; }
    public List<string> Roles { get; set; } = new();
    public int? RoleId { get; set; }
    public string? RoleColor { get; set; }
    public string? RoleIcon { get; set; }
    /// <summary>
    /// Indica si el usuario es guardia de escalamiento.
    /// Los usuarios de escalamiento tienen acceso a la configuración de operaciones.
    /// </summary>
    public bool IsOnCallEscalation { get; set; }
    
    /// <summary>
    /// URL de la foto de perfil del usuario (data:image/jpeg;base64,... o endpoint)
    /// </summary>
    public string? ProfilePhotoUrl { get; set; }
    
    /// <summary>
    /// Indica si el usuario tiene foto de perfil
    /// </summary>
    public bool HasProfilePhoto { get; set; }
}

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public int? RoleId { get; set; }
    public string? RoleColor { get; set; }
    public string? RoleIcon { get; set; }
    public bool Active { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
    
    /// <summary>
    /// URL de la foto de perfil del usuario
    /// </summary>
    public string? ProfilePhotoUrl { get; set; }
    
    /// <summary>
    /// Indica si el usuario tiene foto de perfil
    /// </summary>
    public bool HasProfilePhoto { get; set; }
    
    /// <summary>
    /// Origen de la foto: AD, Manual, None
    /// </summary>
    public string? ProfilePhotoSource { get; set; }
    
    /// <summary>
    /// Fecha y hora de la última conexión del usuario
    /// </summary>
    public DateTime? LastLoginAt { get; set; }
}

public class CreateUserRequest
{
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    /// <summary>
    /// Nombre del rol (para compatibilidad). Se ignora si RoleId está presente.
    /// </summary>
    public string Role { get; set; } = "Reader";
    /// <summary>
    /// ID del rol administrativo a asignar (preferido sobre Role)
    /// </summary>
    public int? RoleId { get; set; }
}

public class UpdateUserRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    /// <summary>
    /// Nombre del rol (para compatibilidad). Se ignora si RoleId está presente.
    /// </summary>
    public string Role { get; set; } = string.Empty;
    /// <summary>
    /// ID del rol administrativo a asignar (preferido sobre Role)
    /// </summary>
    public int? RoleId { get; set; }
    public bool Active { get; set; }
}

public class ChangePasswordRequest
{
    public string CurrentPassword { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}

// DTOs para Active Directory
public class ActiveDirectoryUserDto
{
    public string SamAccountName { get; set; } = string.Empty; // Ej: TB03260
    public string DisplayName { get; set; } = string.Empty;     // Ej: Tobias Garcia
    public string Email { get; set; } = string.Empty;
    public string DistinguishedName { get; set; } = string.Empty;
}

public class GetGroupMembersRequest
{
    public string GroupName { get; set; } = string.Empty; // Ej: GSCORP\SQL_admins o SQL_admins
}

public class ImportUsersFromGroupRequest
{
    public string GroupName { get; set; } = string.Empty;
    public List<string> SelectedUsernames { get; set; } = new(); // Lista de SamAccountNames seleccionados
    public string DefaultRole { get; set; } = "Reader"; // Rol por defecto para todos los usuarios importados
}

// =============================================
// DTOs para Fotos de Perfil
// =============================================

/// <summary>
/// Respuesta de sincronización de foto de perfil
/// </summary>
public class ProfilePhotoSyncResponse
{
    public bool Success { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? PhotoBase64 { get; set; }
    public string? Source { get; set; }
    public DateTime? UpdatedAt { get; set; }
}


