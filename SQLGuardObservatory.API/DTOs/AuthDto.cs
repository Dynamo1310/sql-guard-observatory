namespace SQLGuardObservatory.API.DTOs;

public class LoginRequest
{
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
}

public class ADLoginRequest
{
    public string Domain { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set} = string.Empty;
}

public class LoginResponse
{
    public string Token { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public bool Allowed { get; set; }
    public List<string> Roles { get; set; } = new();
}

public class UserDto
{
    public string Id { get; set; } = string.Empty;
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool Active { get; set; }
    public string CreatedAt { get; set; } = string.Empty;
}

public class CreateUserRequest
{
    public string DomainUser { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string Role { get; set; } = "Reader";
}

public class UpdateUserRequest
{
    public string DisplayName { get; set; } = string.Empty;
    public string Role { get; set; } = string.Empty;
    public bool Active { get; set; }
}

