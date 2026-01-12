using Microsoft.AspNetCore.Authentication.Negotiate;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Runtime.Versioning;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[EnableCors("AllowFrontend")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly IActiveDirectoryService _activeDirectoryService;
    private readonly IAdminAuthorizationService _adminAuthService;
    private readonly ILogger<AuthController> _logger;

    public AuthController(
        IAuthService authService, 
        IActiveDirectoryService activeDirectoryService,
        IAdminAuthorizationService adminAuthService,
        ILogger<AuthController> logger)
    {
        _authService = authService;
        _activeDirectoryService = activeDirectoryService;
        _adminAuthService = adminAuthService;
        _logger = logger;
    }
    
    private string GetCurrentUserId()
    {
        return User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "";
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
    /// Obtiene la lista de usuarios (requiere vista AdminUsers)
    /// </summary>
    [HttpGet("users")]
    [ViewPermission("AdminUsers")]
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
    /// Obtiene un usuario por ID (requiere vista AdminUsers)
    /// </summary>
    [HttpGet("users/{userId}")]
    [ViewPermission("AdminUsers")]
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
    /// Crea un nuevo usuario.
    /// Requiere capacidad Users.Create.
    /// </summary>
    [HttpPost("users")]
    [RequireCapability("Users.Create")]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede crear usuarios
            if (!await _adminAuthService.CanCreateUsersAsync(currentUserId))
            {
                return Forbid();
            }
            
            // Verificar que puede asignar el rol especificado
            bool canAssignRole = false;
            string roleInfo = "";
            
            if (request.RoleId.HasValue)
            {
                canAssignRole = await _adminAuthService.CanAssignRoleByIdAsync(currentUserId, request.RoleId.Value);
                roleInfo = $"ID: {request.RoleId.Value}";
            }
            else if (!string.IsNullOrEmpty(request.Role))
            {
                canAssignRole = await _adminAuthService.CanAssignRoleAsync(currentUserId, request.Role);
                roleInfo = request.Role;
            }
            else
            {
                // Sin rol especificado, asignar Reader por defecto
                canAssignRole = await _adminAuthService.CanAssignRoleAsync(currentUserId, "Reader");
                roleInfo = "Reader (default)";
            }
            
            if (!canAssignRole)
            {
                return StatusCode(403, new { message = $"No tiene permisos para asignar el rol {roleInfo}" });
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
    /// Actualiza un usuario.
    /// Requiere capacidad Users.Edit.
    /// </summary>
    [HttpPut("users/{userId}")]
    [RequireCapability("Users.Edit")]
    public async Task<IActionResult> UpdateUser(string userId, [FromBody] UpdateUserRequest request)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede modificar al usuario objetivo
            if (!await _adminAuthService.CanModifyUserAsync(currentUserId, userId))
            {
                return StatusCode(403, new { message = "No tiene permisos para modificar este usuario" });
            }
            
            // Verificar que puede asignar el rol especificado (si se está cambiando)
            bool canAssignRole = true;
            string roleInfo = "sin cambio";
            
            if (request.RoleId.HasValue)
            {
                canAssignRole = await _adminAuthService.CanAssignRoleByIdAsync(currentUserId, request.RoleId.Value);
                roleInfo = $"ID: {request.RoleId.Value}";
            }
            else if (!string.IsNullOrEmpty(request.Role))
            {
                canAssignRole = await _adminAuthService.CanAssignRoleAsync(currentUserId, request.Role);
                roleInfo = request.Role;
            }
            // Si no se especifica rol, no se cambia y no hay que verificar
            
            if (!canAssignRole)
            {
                return StatusCode(403, new { message = $"No tiene permisos para asignar el rol {roleInfo}" });
            }
            
            var user = await _authService.UpdateUserAsync(userId, request);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            _logger.LogInformation("Usuario {UserId} actualizado por {CurrentUser}. Rol: {Role}", 
                userId, User.Identity?.Name, roleInfo);
            return Ok(user);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar usuario");
            return StatusCode(500, new { message = "Error al actualizar el usuario" });
        }
    }

    /// <summary>
    /// Elimina un usuario.
    /// Requiere capacidad Users.Delete.
    /// </summary>
    [HttpDelete("users/{userId}")]
    [RequireCapability("Users.Delete")]
    public async Task<IActionResult> DeleteUser(string userId)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede eliminar usuarios
            if (!await _adminAuthService.CanDeleteUsersAsync(currentUserId))
            {
                return Forbid();
            }
            
            var result = await _authService.DeleteUserAsync(userId);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo eliminar el usuario. Puede ser el admin principal." });
            }

            _logger.LogInformation("Usuario {UserId} eliminado por {CurrentUser}", userId, User.Identity?.Name);
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
    [RequireCapability("Users.ImportFromAD")]
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
    /// Importa usuarios desde un grupo de Active Directory.
    /// Requiere capacidad Users.ImportFromAD.
    /// </summary>
    [HttpPost("import-from-ad-group")]
    [RequireCapability("Users.ImportFromAD")]
    [SupportedOSPlatform("windows")]
    public async Task<IActionResult> ImportFromAdGroup([FromBody] ImportUsersFromGroupRequest request)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede crear usuarios
            if (!await _adminAuthService.CanCreateUsersAsync(currentUserId))
            {
                return Forbid();
            }
            
            if (string.IsNullOrWhiteSpace(request.GroupName))
            {
                return BadRequest(new { message = "El nombre del grupo es requerido" });
            }

            if (request.SelectedUsernames == null || !request.SelectedUsernames.Any())
            {
                return BadRequest(new { message = "Debe seleccionar al menos un usuario para importar" });
            }

            // Verificar que puede asignar el rol especificado
            if (!await _adminAuthService.CanAssignRoleAsync(currentUserId, request.DefaultRole))
            {
                return StatusCode(403, new { message = $"No tiene permisos para asignar el rol {request.DefaultRole}" });
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

    // =============================================
    // Endpoints de Fotos de Perfil
    // =============================================

    /// <summary>
    /// Obtiene la foto de perfil de un usuario por su ID
    /// </summary>
    [HttpGet("users/{userId}/photo")]
    [Authorize]
    public async Task<IActionResult> GetUserPhoto(string userId)
    {
        try
        {
            var user = await _authService.GetUserByIdAsync(userId);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            if (string.IsNullOrEmpty(user.ProfilePhotoUrl))
            {
                return NotFound(new { message = "El usuario no tiene foto de perfil" });
            }

            return Ok(new { photoUrl = user.ProfilePhotoUrl });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener foto de perfil del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al obtener la foto de perfil" });
        }
    }

    /// <summary>
    /// Obtiene la foto de perfil del usuario actual
    /// </summary>
    [HttpGet("me/photo")]
    [Authorize]
    public async Task<IActionResult> GetMyPhoto()
    {
        try
        {
            var userId = GetCurrentUserId();
            
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var user = await _authService.GetUserByIdAsync(userId);
            
            if (user == null)
            {
                return NotFound(new { message = "Usuario no encontrado" });
            }

            return Ok(new 
            { 
                photoUrl = user.ProfilePhotoUrl,
                hasPhoto = user.HasProfilePhoto,
                source = user.ProfilePhotoSource
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener foto de perfil del usuario actual");
            return StatusCode(500, new { message = "Error al obtener la foto de perfil" });
        }
    }

    /// <summary>
    /// Sube la foto de perfil del usuario actual
    /// </summary>
    [HttpPost("me/photo/upload")]
    [Authorize]
    public async Task<IActionResult> UploadMyPhoto(IFormFile file)
    {
        try
        {
            var userId = GetCurrentUserId();
            
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No se proporcionó ningún archivo" });
            }

            // Validar tipo de archivo
            var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" };
            if (!allowedTypes.Contains(file.ContentType.ToLower()))
            {
                return BadRequest(new { message = "Tipo de archivo no permitido. Use JPG, PNG, GIF o WebP." });
            }

            // Validar tamaño (máximo 5MB para mejor calidad)
            if (file.Length > 5 * 1024 * 1024)
            {
                return BadRequest(new { message = "El archivo es demasiado grande. Máximo 5MB." });
            }

            // Leer bytes del archivo
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var photoBytes = memoryStream.ToArray();

            var result = await _authService.UploadUserPhotoAsync(userId, photoBytes);
            
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al subir foto de perfil");
            return StatusCode(500, new { message = "Error al subir la foto de perfil" });
        }
    }

    /// <summary>
    /// Sube la foto de perfil de un usuario específico.
    /// Requiere capacidad Users.Edit.
    /// </summary>
    [HttpPost("users/{userId}/photo/upload")]
    [RequireCapability("Users.Edit")]
    public async Task<IActionResult> UploadUserPhoto(string userId, IFormFile file)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede modificar al usuario objetivo
            if (!await _adminAuthService.CanModifyUserAsync(currentUserId, userId))
            {
                return StatusCode(403, new { message = "No tiene permisos para modificar este usuario" });
            }

            if (file == null || file.Length == 0)
            {
                return BadRequest(new { message = "No se proporcionó ningún archivo" });
            }

            // Validar tipo de archivo
            var allowedTypes = new[] { "image/jpeg", "image/png", "image/gif", "image/webp" };
            if (!allowedTypes.Contains(file.ContentType.ToLower()))
            {
                return BadRequest(new { message = "Tipo de archivo no permitido. Use JPG, PNG, GIF o WebP." });
            }

            // Validar tamaño (máximo 5MB para mejor calidad)
            if (file.Length > 5 * 1024 * 1024)
            {
                return BadRequest(new { message = "El archivo es demasiado grande. Máximo 5MB." });
            }

            // Leer bytes del archivo
            using var memoryStream = new MemoryStream();
            await file.CopyToAsync(memoryStream);
            var photoBytes = memoryStream.ToArray();

            var result = await _authService.UploadUserPhotoAsync(userId, photoBytes);
            
            _logger.LogInformation("Foto subida para usuario {UserId} por {CurrentUser}", 
                userId, User.Identity?.Name);
            
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al subir foto del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al subir la foto de perfil" });
        }
    }

    /// <summary>
    /// Elimina la foto de perfil del usuario actual
    /// </summary>
    [HttpDelete("me/photo")]
    [Authorize]
    public async Task<IActionResult> DeleteMyPhoto()
    {
        try
        {
            var userId = GetCurrentUserId();
            
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var result = await _authService.DeleteUserPhotoAsync(userId);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo eliminar la foto de perfil" });
            }

            return Ok(new { message = "Foto de perfil eliminada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar foto de perfil");
            return StatusCode(500, new { message = "Error al eliminar la foto de perfil" });
        }
    }

    /// <summary>
    /// Elimina la foto de perfil de un usuario específico.
    /// Requiere capacidad Users.Edit.
    /// </summary>
    [HttpDelete("users/{userId}/photo")]
    [RequireCapability("Users.Edit")]
    public async Task<IActionResult> DeleteUserPhoto(string userId)
    {
        try
        {
            var currentUserId = GetCurrentUserId();
            
            // Verificar que puede modificar al usuario objetivo
            if (!await _adminAuthService.CanModifyUserAsync(currentUserId, userId))
            {
                return StatusCode(403, new { message = "No tiene permisos para modificar este usuario" });
            }

            var result = await _authService.DeleteUserPhotoAsync(userId);
            
            if (!result)
            {
                return BadRequest(new { message = "No se pudo eliminar la foto de perfil" });
            }

            _logger.LogInformation("Foto eliminada para usuario {UserId} por {CurrentUser}", 
                userId, User.Identity?.Name);
            
            return Ok(new { message = "Foto de perfil eliminada exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar foto del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al eliminar la foto de perfil" });
        }
    }
}

