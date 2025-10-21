using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace SQLGuardObservatory.API.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly IConfiguration _configuration;

    public AuthService(UserManager<ApplicationUser> userManager, IConfiguration configuration)
    {
        _userManager = userManager;
        _configuration = configuration;
    }

    public async Task<LoginResponse?> AuthenticateAsync(string username, string password)
    {
        var user = await _userManager.FindByNameAsync(username);
        
        if (user == null || !user.IsActive)
            return null;

        var isValidPassword = await _userManager.CheckPasswordAsync(user, password);
        
        if (!isValidPassword)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles.ToList());

        return new LoginResponse
        {
            Token = token,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Allowed = user.IsActive,
            Roles = roles.ToList()
        };
    }

    public async Task<LoginResponse?> AuthenticateWindowsUserAsync(string windowsIdentity)
    {
        // Extraer el nombre de usuario del formato DOMAIN\username
        var username = windowsIdentity;
        if (windowsIdentity.Contains("\\"))
        {
            var parts = windowsIdentity.Split('\\');
            username = parts[1]; // TB03260
        }
        else if (windowsIdentity.Contains("@"))
        {
            var parts = windowsIdentity.Split('@');
            username = parts[0]; // TB03260
        }

        // Verificar que el usuario esté en el dominio gscorp.ad
        if (!windowsIdentity.ToUpper().Contains("GSCORP"))
        {
            return null;
        }

        // Buscar el usuario en la lista blanca
        var user = await _userManager.Users
            .FirstOrDefaultAsync(u => u.DomainUser == username || u.UserName == username);
        
        if (user == null || !user.IsActive)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        var token = GenerateJwtToken(user, roles.ToList());

        return new LoginResponse
        {
            Token = token,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Allowed = user.IsActive,
            Roles = roles.ToList()
        };
    }

    public async Task<List<UserDto>> GetUsersAsync()
    {
        var users = await _userManager.Users.ToListAsync();
        var userDtos = new List<UserDto>();

        foreach (var user in users)
        {
            var roles = await _userManager.GetRolesAsync(user);
            userDtos.Add(new UserDto
            {
                Id = user.Id,
                DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
                DisplayName = user.DisplayName ?? string.Empty,
                Role = roles.FirstOrDefault() ?? "Reader",
                Active = user.IsActive,
                CreatedAt = user.CreatedAt.ToString("o")
            });
        }

        return userDtos;
    }

    public async Task<UserDto?> GetUserByIdAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        
        if (user == null)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        
        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Role = roles.FirstOrDefault() ?? "Reader",
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o")
        };
    }

    public async Task<UserDto?> GetUserByDomainUserAsync(string domainUser)
    {
        var user = await _userManager.Users
            .FirstOrDefaultAsync(u => u.DomainUser == domainUser || u.UserName == domainUser);
        
        if (user == null)
            return null;

        var roles = await _userManager.GetRolesAsync(user);
        
        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Role = roles.FirstOrDefault() ?? "Reader",
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o")
        };
    }

    public async Task<UserDto?> CreateUserAsync(CreateUserRequest request)
    {
        var existingUser = await _userManager.FindByNameAsync(request.DomainUser);
        
        if (existingUser != null)
            return null;

        var newUser = new ApplicationUser
        {
            UserName = request.DomainUser,
            DomainUser = request.DomainUser,
            DisplayName = request.DisplayName,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        // Crear usuario sin contraseña (autenticación de Windows)
        // Usamos un GUID aleatorio como contraseña interna (no se usará nunca)
        var dummyPassword = Guid.NewGuid().ToString() + "Aa1!";
        var result = await _userManager.CreateAsync(newUser, dummyPassword);
        
        if (!result.Succeeded)
            return null;

        await _userManager.AddToRoleAsync(newUser, request.Role);

        return new UserDto
        {
            Id = newUser.Id,
            DomainUser = newUser.DomainUser ?? string.Empty,
            DisplayName = newUser.DisplayName ?? string.Empty,
            Role = request.Role,
            Active = true,
            CreatedAt = newUser.CreatedAt.ToString("o")
        };
    }

    public async Task<UserDto?> UpdateUserAsync(string userId, UpdateUserRequest request)
    {
        var user = await _userManager.FindByIdAsync(userId);
        
        if (user == null)
            return null;

        user.DisplayName = request.DisplayName;
        user.IsActive = request.Active;

        var updateResult = await _userManager.UpdateAsync(user);
        
        if (!updateResult.Succeeded)
            return null;

        // Actualizar rol
        var currentRoles = await _userManager.GetRolesAsync(user);
        await _userManager.RemoveFromRolesAsync(user, currentRoles);
        await _userManager.AddToRoleAsync(user, request.Role);

        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Role = request.Role,
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o")
        };
    }

    public async Task<bool> DeleteUserAsync(string userId)
    {
        var user = await _userManager.FindByIdAsync(userId);
        
        if (user == null)
            return false;

        // No permitir eliminar al admin principal
        var defaultAdminUser = _configuration["DefaultAdminUser"];
        if (user.UserName == defaultAdminUser)
            return false;

        var result = await _userManager.DeleteAsync(user);
        return result.Succeeded;
    }

    public async Task<bool> ChangePasswordAsync(string userId, string currentPassword, string newPassword)
    {
        var user = await _userManager.FindByIdAsync(userId);
        
        if (user == null)
            return false;

        var result = await _userManager.ChangePasswordAsync(user, currentPassword, newPassword);
        return result.Succeeded;
    }

    private string GenerateJwtToken(ApplicationUser user, List<string> roles)
    {
        var jwtSettings = _configuration.GetSection("JwtSettings");
        var secretKey = jwtSettings["SecretKey"] ?? throw new InvalidOperationException("SecretKey no configurada");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.UserName ?? string.Empty),
            new Claim("domainUser", user.DomainUser ?? string.Empty),
            new Claim("displayName", user.DisplayName ?? string.Empty),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var expirationMinutes = int.Parse(jwtSettings["ExpirationMinutes"] ?? "480");
        
        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expirationMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

