using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Runtime.Versioning;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableCors("AllowFrontend")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IActiveDirectoryService _activeDirectoryService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService, 
        IActiveDirectoryService activeDirectoryService,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _activeDirectoryService = activeDirectoryService;
        _logger = logger;
    }

    /// <summary>
    /// Login de usuario (deprecado - mantener para compatibilidad)
    /// </summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        try
        {
            var result = await _authService.AuthenticateAsync(request.Username, request.Password);
            
            if (result == null)
            {
                return Unauthorized(new { message = "Usuario o contraseña incorrectos, o usuario no autorizado" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en login");
            return StatusCode(500, new { message = "Error al procesar el login" });
        }
    }

    /// <summary>
    /// Preflight OPTIONS para windows-login (requerido por CORS)
    /// </summary>
    [HttpOptions("windows-login")]
    [AllowAnonymous]
    public IActionResult WindowsLoginOptions()
    {
        return Ok();
    }

    /// <summary>
    /// Autenticación con Windows (autenticación automática)
    /// Usa Negotiate authentication para obtener credenciales de Windows
    /// </summary>
    [HttpGet("windows-login")]
    [Authorize(AuthenticationSchemes = NegotiateDefaults.AuthenticationScheme)]
    public async Task<IActionResult> WindowsLogin()
    {
        try
        {
            // Obtener la identidad de Windows del usuario actual
            var windowsIdentity = User.Identity?.Name;
            
            _logger.LogInformation($"Intento de login con Windows Identity: {windowsIdentity}");

            if (string.IsNullOrEmpty(windowsIdentity))
            {
                return Unauthorized(new { message = "No se pudo obtener la identidad de Windows. Asegúrate de que Windows Authentication esté habilitado en IIS." });
            }

            var result = await _authService.AuthenticateWindowsUserAsync(windowsIdentity);
            
            if (result == null)
            {
                return Unauthorized(new { message = "Usuario no autorizado. El usuario debe estar en la lista blanca de la aplicación y pertenecer al dominio gscorp.ad" });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en login de Windows");
            return StatusCode(500, new { message = "Error al procesar el login con Windows" });
        }
    }

    /// <summary>
    /// Endpoint alternativo para obtener el usuario de Windows actual
    /// Útil para diagnóstico cuando hay problemas con Negotiate
    /// </summary>
    [HttpGet("windows-identity")]
    [AllowAnonymous]
    public IActionResult GetWindowsIdentity()
    {
        try
        {
            var identity = System.Security.Principal.WindowsIdentity.GetCurrent();
            return Ok(new 
            { 
                name = identity.Name,
                isAuthenticated = identity.IsAuthenticated,
                authenticationType = identity.AuthenticationType
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener Windows Identity");
            return StatusCode(500, new { message = ex.Message });
        }
    }

    /// <summary>
    /// Obtiene la lista de usuarios (solo admin)
    /// </summary>
    [HttpGet("users")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUsers()
    {
        try
        {
            var users = await _authService.GetUsersAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios");
            return StatusCode(500, new { message = "Error al obtener los usuarios" });
        }
    }

    /// <summary>
    /// Obtiene un usuario por ID (solo admin)
    /// </summary>
    [HttpGet("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> GetUser(string userId)
    {
        try
        {
            var user = await _authService.GetUserByIdAsync(userId);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuario");
            return StatusCode(500, new { message = "Error al obtener el usuario" });
        }
    }

    /// <summary>
    /// Crea un nuevo usuario (solo admin)
    /// Admin solo puede asignar roles Reader y Admin
    /// SuperAdmin puede asignar cualquier rol
    /// </summary>
    [HttpPost("users")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        try
        {
            // Si el usuario es Admin (no SuperAdmin) y está intentando crear un SuperAdmin, denegar
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && request.Role == "SuperAdmin")
            {
                return StatusCode(403, new { message = "Los usuarios Admin no pueden asignar el rol SuperAdmin" });
            }
            
            var user = await _authService.CreateUserAsync(request);
            
            if (user == null)
            {
                return BadRequest(new { message = "No se pudo crear el usuario. Puede que ya exista." });
            }

            _logger.LogInformation("Usuario {DomainUser} creado con rol {Role} por {CurrentUser}", 
                request.DomainUser, request.Role, User.Identity?.Name);
            return CreatedAtAction(nameof(GetUser), new { userId = user.Id }, user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear usuario");
            return StatusCode(500, new { message = "Error al crear el usuario" });
        }
    }

    /// <summary>
    /// Actualiza un usuario (solo admin)
    /// Admin solo puede asignar roles Reader y Admin
    /// SuperAdmin puede asignar cualquier rol
    /// </summary>
    [HttpPut("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateUser(string userId, [FromBody] UpdateUserRequest request)
    {
        try
        {
            // Si el usuario es Admin (no SuperAdmin) y está intentando asignar SuperAdmin, denegar
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && request.Role == "SuperAdmin")
            {
                return StatusCode(403, new { message = "Los usuarios Admin no pueden asignar el rol SuperAdmin" });
            }
            
            // Obtener el usuario actual para verificar si está intentando cambiar el rol de un SuperAdmin
            var existingUser = await _authService.GetUserByIdAsync(userId);
            if (existingUser != null && !User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && existingUser.Role == "SuperAdmin")
            {
                return StatusCode(403, new { message = "Los usuarios Admin no pueden modificar usuarios SuperAdmin" });
            }
            
            var user = await _authService.UpdateUserAsync(userId, request);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            _logger.LogInformation("Usuario {UserId} actualizado por {CurrentUser}. Nuevo rol: {Role}", 
                userId, User.Identity?.Name, request.Role);
            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar usuario");
            return StatusCode(500, new { message = "Error al actualizar el usuario" });
        }
    }

    /// <summary>
    /// Elimina un usuario (solo admin)
    /// </summary>
    [HttpDelete("users/{userId}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> DeleteUser(string userId)
    {
        try
        {
            var result = await _authService.DeleteUserAsync(userId);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo eliminar el usuario. Puede ser el admin principal." });
            }

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar usuario");
            return StatusCode(500, new { message = "Error al eliminar el usuario" });
        }
    }

    /// <summary>
    /// Cambia la contraseña del usuario autenticado
    /// </summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest request)
    {
        try
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var result = await _authService.ChangePasswordAsync(userId, request.CurrentPassword, request.NewPassword);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo cambiar la contraseña. Verifica que la contraseña actual sea correcta." });
            }

            return Ok(new { message = "Contraseña cambiada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al cambiar contraseña");
            return StatusCode(500, new { message = "Error al cambiar la contraseña" });
        }
    }


    /// <summary>
    /// Obtiene los miembros de un grupo de Active Directory
    /// </summary>
    [HttpGet("ad-group-members")]
    [Authorize(Policy = "AdminOnly")]
    [SupportedOSPlatform("windows")]
    public async Task<IActionResult> GetAdGroupMembers([FromQuery] string groupName)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(groupName))
            {
                return BadRequest(new { message = "El nombre del grupo es requerido" });
            }

            _logger.LogInformation($"Consultando miembros del grupo AD: {groupName}");
            
            var members = await _activeDirectoryService.GetGroupMembersAsync(groupName);
            
            return Ok(new { 
                groupName = groupName, 
                count = members.Count,
                members = members 
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error al obtener miembros del grupo AD: {groupName}");
            return StatusCode(500, new { message = $"Error al consultar Active Directory: {ex.Message}" });
        }
    }

    /// <summary>
    /// Importa usuarios desde un grupo de Active Directory
    /// Admin solo puede asignar roles Reader y Admin
    /// SuperAdmin puede asignar cualquier rol
    /// </summary>
    [HttpPost("import-from-ad-group")]
    [Authorize(Policy = "AdminOnly")]
    [SupportedOSPlatform("windows")]
    public async Task<IActionResult> ImportFromAdGroup([FromBody] ImportUsersFromGroupRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.GroupName))
            {
                return BadRequest(new { message = "El nombre del grupo es requerido" });
            }

            if (request.SelectedUsernames == null || !request.SelectedUsernames.Any())
            {
                return BadRequest(new { message = "Debe seleccionar al menos un usuario para importar" });
            }

            // Si el usuario es Admin (no SuperAdmin) y está intentando importar con rol SuperAdmin, denegar
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && request.DefaultRole == "SuperAdmin")
            {
                return StatusCode(403, new { message = "Los usuarios Admin no pueden asignar el rol SuperAdmin" });
            }

            _logger.LogInformation($"Importando {request.SelectedUsernames.Count} usuarios del grupo {request.GroupName} con rol {request.DefaultRole}");

            // Obtener los miembros del grupo para validar
            var groupMembers = await _activeDirectoryService.GetGroupMembersAsync(request.GroupName);
            
            var importedCount = 0;
            var skippedCount = 0;
            var errors = new List<string>();

            foreach (var username in request.SelectedUsernames)
            {
                try
                {
                    // Verificar que el usuario existe en el grupo
                    var adUser = groupMembers.FirstOrDefault(u => u.SamAccountName.Equals(username, StringComparison.OrdinalIgnoreCase));
                    
                    if (adUser == null)
                    {
                        errors.Add($"{username}: No encontrado en el grupo AD");
                        skippedCount++;
                        continue;
                    }

                    // Verificar si el usuario ya existe en la base de datos
                    var existingUser = await _authService.GetUserByDomainUserAsync(username);
                    
                    if (existingUser != null)
                    {
                        _logger.LogInformation($"Usuario {username} ya existe, se omite");
                        skippedCount++;
                        continue;
                    }

                    // Crear el usuario (incluyendo email del AD)
                    var createRequest = new CreateUserRequest
                    {
                        DomainUser = adUser.SamAccountName,
                        DisplayName = adUser.DisplayName,
                        Email = adUser.Email,
                        Role = request.DefaultRole
                    };

                    var created = await _authService.CreateUserAsync(createRequest);
                    
                    if (created != null)
                    {
                        importedCount++;
                        _logger.LogInformation($"Usuario {username} importado exitosamente");
                    }
                    else
                    {
                        errors.Add($"{username}: Error al crear en la base de datos");
                        skippedCount++;
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, $"Error al importar usuario {username}");
                    errors.Add($"{username}: {ex.Message}");
                    skippedCount++;
                }
            }

            return Ok(new
            {
                message = $"Importación completada: {importedCount} usuarios importados, {skippedCount} omitidos",
                imported = importedCount,
                skipped = skippedCount,
                errors = errors
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al importar usuarios desde grupo AD");
            return StatusCode(500, new { message = $"Error al importar usuarios: {ex.Message}" });
        }
    }
}

