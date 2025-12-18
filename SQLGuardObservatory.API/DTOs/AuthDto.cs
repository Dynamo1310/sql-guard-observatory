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
    /// <summary>
    /// Indica si el usuario es guardia de escalamiento.
    /// Los usuarios de escalamiento tienen acceso a la configuración de operaciones.
    /// </summary>
    public bool IsOnCallEscalation { get; set; }
}

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
    public bool Active { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}

public class CreateUserRequest
{
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = "Reader";
}

public class UpdateUserRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
    public string Role { get; set; } = string.Empty;
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

