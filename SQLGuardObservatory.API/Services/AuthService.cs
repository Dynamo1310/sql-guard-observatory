using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace SQLGuardObservatory.API.Services;

public class AuthService : IAuthService
{
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IActiveDirectoryService _adService;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        UserManager<ApplicationUser> userManager, 
        ApplicationDbContext context,
        IConfiguration configuration,
        IActiveDirectoryService adService,
        ILogger<AuthService> logger)
    {
        _userManager = userManager;
        _context = context;
        _configuration = configuration;
        _adService = adService;
        _logger = logger;
    }

    public async Task<LoginResponse?> AuthenticateAsync(string username, string password)
    {
        var user = await _userManager.Users
            .Include(u => u.AdminRole)
            .FirstOrDefaultAsync(u => u.UserName == username);
        
        if (user == null || !user.IsActive)
            return null;

        var isValidPassword = await _userManager.CheckPasswordAsync(user, password);
        
        if (!isValidPassword)
            return null;

        // Usar AdminRole como fuente principal del rol
        var roleName = user.AdminRole?.Name ?? "Reader";
        var roles = new List<string> { roleName };
        var token = GenerateJwtToken(user, roles);

        // Actualizar última conexión (horario de Argentina UTC-3)
        user.LastLoginAt = GetArgentinaTime();
        await _context.SaveChangesAsync();

        return new LoginResponse
        {
            Token = token,
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Email = user.Email,
            Allowed = user.IsActive,
            Roles = roles,
            RoleId = user.AdminRoleId,
            RoleColor = user.AdminRole?.Color,
            RoleIcon = user.AdminRole?.Icon,
            IsOnCallEscalation = user.IsOnCallEscalation,
            ProfilePhotoUrl = GetProfilePhotoUrl(user.ProfilePhoto),
            HasProfilePhoto = user.ProfilePhoto != null && user.ProfilePhoto.Length > 0
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
            .Include(u => u.AdminRole)
            .FirstOrDefaultAsync(u => u.DomainUser == username || u.UserName == username);
        
        if (user == null || !user.IsActive)
            return null;

        // Usar AdminRole como fuente principal del rol
        var roleName = user.AdminRole?.Name ?? "Reader";
        var roles = new List<string> { roleName };
        var token = GenerateJwtToken(user, roles);

        // Actualizar última conexión (horario de Argentina UTC-3)
        user.LastLoginAt = GetArgentinaTime();
        await _context.SaveChangesAsync();

        return new LoginResponse
        {
            Token = token,
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Email = user.Email,
            Allowed = user.IsActive,
            Roles = roles,
            RoleId = user.AdminRoleId,
            RoleColor = user.AdminRole?.Color,
            RoleIcon = user.AdminRole?.Icon,
            IsOnCallEscalation = user.IsOnCallEscalation,
            ProfilePhotoUrl = GetProfilePhotoUrl(user.ProfilePhoto),
            HasProfilePhoto = user.ProfilePhoto != null && user.ProfilePhoto.Length > 0
        };
    }

    public async Task<List<UserDto>> GetUsersAsync()
    {
        // Consulta directa con join para asegurar que se cargue el rol correctamente
        var usersWithRoles = await _context.Users
            .Select(u => new {
                User = u,
                Role = _context.AdminRoles.FirstOrDefault(r => r.Id == u.AdminRoleId)
            })
            .ToListAsync();

        var result = usersWithRoles.Select(ur => {
            Console.WriteLine($"[GetUsers] User: {ur.User.UserName}, AdminRoleId: {ur.User.AdminRoleId}, Role: {ur.Role?.Name ?? "NULL"}, IsActive: {ur.Role?.IsActive}");
            return new UserDto
            {
                Id = ur.User.Id,
                DomainUser = ur.User.DomainUser ?? ur.User.UserName ?? string.Empty,
                DisplayName = ur.User.DisplayName ?? string.Empty,
                Email = ur.User.Email,
                Role = ur.Role?.Name ?? "Reader",
                RoleId = ur.User.AdminRoleId,
                RoleColor = ur.Role?.Color,
                RoleIcon = ur.Role?.Icon,
                Active = ur.User.IsActive,
                CreatedAt = ur.User.CreatedAt.ToString("o"),
                ProfilePhotoUrl = GetProfilePhotoUrl(ur.User.ProfilePhoto),
                HasProfilePhoto = ur.User.ProfilePhoto != null && ur.User.ProfilePhoto.Length > 0,
                ProfilePhotoSource = ur.User.ProfilePhotoSource,
                LastLoginAt = ur.User.LastLoginAt
            };
        }).ToList();
        
        return result;
    }

    public async Task<UserDto?> GetUserByIdAsync(string userId)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
            .FirstOrDefaultAsync(u => u.Id == userId);
        
        if (user == null)
            return null;
        
        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Email = user.Email,
            Role = user.AdminRole?.Name ?? "Reader",
            RoleId = user.AdminRoleId,
            RoleColor = user.AdminRole?.Color,
            RoleIcon = user.AdminRole?.Icon,
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o"),
            ProfilePhotoUrl = GetProfilePhotoUrl(user.ProfilePhoto),
            HasProfilePhoto = user.ProfilePhoto != null && user.ProfilePhoto.Length > 0,
            ProfilePhotoSource = user.ProfilePhotoSource,
            LastLoginAt = user.LastLoginAt
        };
    }

    public async Task<UserDto?> GetUserByDomainUserAsync(string domainUser)
    {
        var user = await _context.Users
            .Include(u => u.AdminRole)
            .FirstOrDefaultAsync(u => u.DomainUser == domainUser || u.UserName == domainUser);
        
        if (user == null)
            return null;
        
        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Email = user.Email,
            Role = user.AdminRole?.Name ?? "Reader",
            RoleId = user.AdminRoleId,
            RoleColor = user.AdminRole?.Color,
            RoleIcon = user.AdminRole?.Icon,
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o"),
            ProfilePhotoUrl = GetProfilePhotoUrl(user.ProfilePhoto),
            HasProfilePhoto = user.ProfilePhoto != null && user.ProfilePhoto.Length > 0,
            ProfilePhotoSource = user.ProfilePhotoSource,
            LastLoginAt = user.LastLoginAt
        };
    }

    public async Task<UserDto?> CreateUserAsync(CreateUserRequest request)
    {
        var existingUser = await _userManager.FindByNameAsync(request.DomainUser);
        
        if (existingUser != null)
            return null;

        // Resolver el AdminRole
        AdminRole? adminRole = null;
        if (request.RoleId.HasValue)
        {
            adminRole = await _context.AdminRoles.FindAsync(request.RoleId.Value);
        }
        else if (!string.IsNullOrEmpty(request.Role))
        {
            adminRole = await _context.AdminRoles.FirstOrDefaultAsync(r => r.Name == request.Role && r.IsActive);
        }

        // Si no se encuentra rol, usar Reader por defecto
        if (adminRole == null)
        {
            adminRole = await _context.AdminRoles.FirstOrDefaultAsync(r => r.Name == "Reader" && r.IsActive);
        }

        var newUser = new ApplicationUser
        {
            UserName = request.DomainUser,
            DomainUser = request.DomainUser,
            DisplayName = request.DisplayName,
            Email = request.Email,
            IsActive = true,
            CreatedAt = DateTime.UtcNow,
            AdminRoleId = adminRole?.Id
        };

        // Crear usuario sin contraseña (autenticación de Windows)
        // Usamos un GUID aleatorio como contraseña interna (no se usará nunca)
        var dummyPassword = Guid.NewGuid().ToString() + "Aa1!";
        var result = await _userManager.CreateAsync(newUser, dummyPassword);
        
        if (!result.Succeeded)
            return null;

        // Mantener compatibilidad con Identity roles solo para roles de sistema
        var roleName = adminRole?.Name ?? request.Role ?? "Reader";
        if (adminRole?.IsSystem == true)
        {
            // Solo agregar a Identity si es un rol de sistema (SuperAdmin, Admin, Reader)
            await _userManager.AddToRoleAsync(newUser, roleName);
        }

        return new UserDto
        {
            Id = newUser.Id,
            DomainUser = newUser.DomainUser ?? string.Empty,
            DisplayName = newUser.DisplayName ?? string.Empty,
            Email = newUser.Email,
            Role = roleName,
            RoleId = newUser.AdminRoleId,
            RoleColor = adminRole?.Color,
            RoleIcon = adminRole?.Icon,
            Active = true,
            CreatedAt = newUser.CreatedAt.ToString("o"),
            LastLoginAt = null
        };
    }

    public async Task<UserDto?> UpdateUserAsync(string userId, UpdateUserRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Id == userId);
        
        if (user == null)
            return null;

        // Log para debug
        Console.WriteLine($"[UpdateUser] User: {userId}, OldRoleId: {user.AdminRoleId}, RequestRoleId: {request.RoleId}, RequestRole: {request.Role}");

        user.DisplayName = request.DisplayName;
        user.Email = request.Email;
        user.IsActive = request.Active;

        // Resolver el nuevo AdminRole
        AdminRole? newAdminRole = null;
        if (request.RoleId.HasValue)
        {
            newAdminRole = await _context.AdminRoles.FirstOrDefaultAsync(r => r.Id == request.RoleId.Value && r.IsActive);
            Console.WriteLine($"[UpdateUser] Found role by ID {request.RoleId.Value}: {newAdminRole?.Name ?? "NULL"}");
            if (newAdminRole != null)
            {
                user.AdminRoleId = newAdminRole.Id;
            }
        }
        else if (!string.IsNullOrEmpty(request.Role))
        {
            newAdminRole = await _context.AdminRoles.FirstOrDefaultAsync(r => r.Name == request.Role && r.IsActive);
            Console.WriteLine($"[UpdateUser] Found role by Name '{request.Role}': {newAdminRole?.Name ?? "NULL"}");
            if (newAdminRole != null)
            {
                user.AdminRoleId = newAdminRole.Id;
            }
        }
        else
        {
            Console.WriteLine($"[UpdateUser] No role specified in request!");
        }

        Console.WriteLine($"[UpdateUser] NewRoleId after processing: {user.AdminRoleId}");

        // Marcar explícitamente como modificado para asegurar que se guarde
        _context.Entry(user).State = EntityState.Modified;
        await _context.SaveChangesAsync();
        
        // Recargar el usuario con el rol para obtener los datos actualizados
        await _context.Entry(user).Reference(u => u.AdminRole).LoadAsync();
        
        Console.WriteLine($"[UpdateUser] Final role after save: {user.AdminRole?.Name ?? "NULL"} (ID: {user.AdminRoleId})");

        // Actualizar Identity role solo para roles de sistema (SuperAdmin, Admin, Reader)
        // Los roles personalizados solo existen en AdminRoles, no en AspNetRoles
        var roleName = user.AdminRole?.Name ?? "Reader";
        var currentRoles = await _userManager.GetRolesAsync(user);
        
        if (user.AdminRole?.IsSystem == true)
        {
            // Solo sincronizar con Identity si es un rol de sistema
            await _userManager.RemoveFromRolesAsync(user, currentRoles);
            await _userManager.AddToRoleAsync(user, roleName);
        }
        else if (currentRoles.Any())
        {
            // Si el nuevo rol no es de sistema, quitar los roles de Identity
            await _userManager.RemoveFromRolesAsync(user, currentRoles);
        }

        return new UserDto
        {
            Id = user.Id,
            DomainUser = user.DomainUser ?? user.UserName ?? string.Empty,
            DisplayName = user.DisplayName ?? string.Empty,
            Email = user.Email,
            Role = user.AdminRole?.Name ?? "Reader",
            RoleId = user.AdminRoleId,
            RoleColor = user.AdminRole?.Color,
            RoleIcon = user.AdminRole?.Icon,
            Active = user.IsActive,
            CreatedAt = user.CreatedAt.ToString("o"),
            LastLoginAt = user.LastLoginAt
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

        // Agregar AdminRoleId al token
        if (user.AdminRoleId.HasValue)
        {
            claims.Add(new Claim("adminRoleId", user.AdminRoleId.Value.ToString()));
        }

        foreach (var role in roles)
        {
            claims.Add(new Claim(ClaimTypes.Role, role));
        }

        var expirationMinutes = int.Parse(jwtSettings["ExpirationMinutes"] ?? "480");
        
        var token = new JwtSecurityToken(
            issuer: jwtSettings["Issuer"],
            audience: jwtSettings["Audience"],
            claims: claims,
            expires: DateTime.Now.AddMinutes(expirationMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    // =============================================
    // Métodos de Foto de Perfil
    // =============================================

    /// <summary>
    /// Obtiene la fecha y hora actual en horario de Argentina (UTC-3)
    /// </summary>
    private static DateTime GetArgentinaTime()
    {
        var argentinaTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Argentina Standard Time");
        return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, argentinaTimeZone);
    }

    /// <summary>
    /// Convierte bytes de imagen a URL data:image/...;base64,...
    /// Detecta automáticamente el tipo de imagen
    /// </summary>
    private static string? GetProfilePhotoUrl(byte[]? photoBytes)
    {
        if (photoBytes == null || photoBytes.Length == 0)
            return null;
        
        var mimeType = DetectImageMimeType(photoBytes);
        return $"data:{mimeType};base64,{Convert.ToBase64String(photoBytes)}";
    }

    /// <summary>
    /// Detecta el tipo MIME de una imagen basándose en sus bytes mágicos
    /// </summary>
    private static string DetectImageMimeType(byte[] imageBytes)
    {
        if (imageBytes.Length < 4)
            return "image/jpeg";

        // PNG: 89 50 4E 47
        if (imageBytes[0] == 0x89 && imageBytes[1] == 0x50 && imageBytes[2] == 0x4E && imageBytes[3] == 0x47)
            return "image/png";

        // JPEG: FF D8 FF
        if (imageBytes[0] == 0xFF && imageBytes[1] == 0xD8 && imageBytes[2] == 0xFF)
            return "image/jpeg";

        // GIF: 47 49 46 38
        if (imageBytes[0] == 0x47 && imageBytes[1] == 0x49 && imageBytes[2] == 0x46 && imageBytes[3] == 0x38)
            return "image/gif";

        // WebP: 52 49 46 46 ... 57 45 42 50
        if (imageBytes.Length >= 12 && 
            imageBytes[0] == 0x52 && imageBytes[1] == 0x49 && imageBytes[2] == 0x46 && imageBytes[3] == 0x46 &&
            imageBytes[8] == 0x57 && imageBytes[9] == 0x45 && imageBytes[10] == 0x42 && imageBytes[11] == 0x50)
            return "image/webp";

        // Default to JPEG
        return "image/jpeg";
    }

    /// <summary>
    /// Sube una foto de perfil para un usuario
    /// </summary>
    public async Task<ProfilePhotoSyncResponse> UploadUserPhotoAsync(string userId, byte[] photoBytes)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
            {
                return new ProfilePhotoSyncResponse
                {
                    Success = false,
                    Message = "Usuario no encontrado"
                };
            }

            if (photoBytes == null || photoBytes.Length == 0)
            {
                return new ProfilePhotoSyncResponse
                {
                    Success = false,
                    Message = "No se proporcionó imagen"
                };
            }

            // Validar tamaño máximo (5MB para mejor calidad)
            const int maxSize = 5 * 1024 * 1024;
            if (photoBytes.Length > maxSize)
            {
                return new ProfilePhotoSyncResponse
                {
                    Success = false,
                    Message = "La imagen es demasiado grande. Máximo 5MB."
                };
            }

            _logger.LogInformation("Subiendo foto de perfil para usuario {UserId}: {Size} bytes", 
                userId, photoBytes.Length);

            // Guardar foto en la base de datos
            user.ProfilePhoto = photoBytes;
            user.ProfilePhotoUpdatedAt = DateTime.UtcNow;
            user.ProfilePhotoSource = "Manual";

            await _context.SaveChangesAsync();

            _logger.LogInformation("Foto subida exitosamente para {UserId}: {Size} bytes", 
                userId, photoBytes.Length);

            return new ProfilePhotoSyncResponse
            {
                Success = true,
                Message = "Foto de perfil actualizada exitosamente",
                PhotoBase64 = GetProfilePhotoUrl(photoBytes),
                Source = "Manual",
                UpdatedAt = user.ProfilePhotoUpdatedAt
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al subir foto de perfil para usuario {UserId}", userId);
            
            return new ProfilePhotoSyncResponse
            {
                Success = false,
                Message = $"Error al subir la foto: {ex.Message}"
            };
        }
    }

    /// <summary>
    /// Elimina la foto de perfil de un usuario
    /// </summary>
    public async Task<bool> DeleteUserPhotoAsync(string userId)
    {
        try
        {
            var user = await _context.Users.FindAsync(userId);
            
            if (user == null)
                return false;

            user.ProfilePhoto = null;
            user.ProfilePhotoUpdatedAt = DateTime.UtcNow;
            user.ProfilePhotoSource = "None";

            await _context.SaveChangesAsync();
            
            _logger.LogInformation("Foto de perfil eliminada para usuario {UserId}", userId);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar foto de perfil del usuario {UserId}", userId);
            return false;
        }
    }
}
