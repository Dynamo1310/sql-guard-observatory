using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize] // Requiere autenticación para todos los endpoints
public class PermissionsController : ControllerBase
{
    private readonly IPermissionService _permissionService;
    private readonly ILogger<PermissionsController> _logger;

    public PermissionsController(IPermissionService permissionService, ILogger<PermissionsController> logger)
    {
        _permissionService = permissionService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los permisos de todos los roles
    /// SuperAdmin: ve todos los roles
    /// Admin: solo ve el rol Reader
    /// </summary>
    [HttpGet]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> GetAllPermissions()
    {
        try
        {
            var permissions = await _permissionService.GetAllRolePermissionsAsync();
            
            // Si es Admin (no SuperAdmin), solo mostrar permisos de Reader
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin"))
            {
                permissions = permissions.Where(p => p.Role == "Reader").ToList();
            }
            
            return Ok(permissions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener permisos");
            return StatusCode(500, new { message = "Error al obtener los permisos" });
        }
    }

    /// <summary>
    /// Obtiene los permisos de un rol específico
    /// SuperAdmin: puede ver cualquier rol
    /// Admin: solo puede ver el rol Reader
    /// </summary>
    [HttpGet("{role}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> GetRolePermissions(string role)
    {
        try
        {
            // Si es Admin (no SuperAdmin), solo puede ver permisos de Reader
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && role != "Reader")
            {
                return Forbid();
            }
            
            var permissions = await _permissionService.GetRolePermissionsAsync(role);
            if (permissions == null)
            {
                return NotFound(new { message = "Rol no encontrado" });
            }
            return Ok(permissions);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener permisos del rol");
            return StatusCode(500, new { message = "Error al obtener los permisos del rol" });
        }
    }

    /// <summary>
    /// Actualiza los permisos de un rol
    /// SuperAdmin: puede actualizar cualquier rol
    /// Admin: solo puede actualizar el rol Reader
    /// </summary>
    [HttpPut("{role}")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> UpdateRolePermissions(string role, [FromBody] UpdateRolePermissionsRequest request)
    {
        try
        {
            // Si es Admin (no SuperAdmin), solo puede actualizar permisos de Reader
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin") && role != "Reader")
            {
                return StatusCode(403, new { message = "Solo puedes editar permisos del rol Reader" });
            }
            
            var result = await _permissionService.UpdateRolePermissionsAsync(role, request.Permissions);
            if (!result)
            {
                return BadRequest(new { message = "No se pudieron actualizar los permisos" });
            }
            
            _logger.LogInformation("Permisos del rol {Role} actualizados por {User}", role, User.Identity?.Name);
            return Ok(new { message = "Permisos actualizados exitosamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar permisos");
            return StatusCode(500, new { message = "Error al actualizar los permisos" });
        }
    }

    /// <summary>
    /// Obtiene las vistas disponibles y los roles
    /// SuperAdmin: ve todos los roles
    /// Admin: solo ve el rol Reader
    /// </summary>
    [HttpGet("available")]
    [Authorize(Roles = "Admin,SuperAdmin")]
    public async Task<IActionResult> GetAvailableViewsAndRoles()
    {
        try
        {
            var data = await _permissionService.GetAvailableViewsAndRolesAsync();
            
            // Si es Admin (no SuperAdmin), solo mostrar rol Reader
            if (!User.IsInRole("SuperAdmin") && User.IsInRole("Admin"))
            {
                data.Roles = data.Roles.Where(r => r == "Reader").ToList();
            }
            
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener vistas y roles disponibles");
            return StatusCode(500, new { message = "Error al obtener las vistas y roles disponibles" });
        }
    }

    /// <summary>
    /// Obtiene los permisos del usuario autenticado (Todos los usuarios autenticados)
    /// </summary>
    [HttpGet("my-permissions")]
    // Hereda [Authorize] del controlador - disponible para todos los usuarios autenticados
    public async Task<IActionResult> GetMyPermissions()
    {
        try
        {
            var userId = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var permissions = await _permissionService.GetUserPermissionsAsync(userId);
            return Ok(new { permissions });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener permisos del usuario");
            return StatusCode(500, new { message = "Error al obtener los permisos del usuario" });
        }
    }
}

