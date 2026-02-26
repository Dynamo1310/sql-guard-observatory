using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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
    /// Obtiene las vistas disponibles del sistema
    /// (Ya no se usan roles para permisos - todo se maneja por grupos)
    /// </summary>
    [HttpGet("available")]
    public async Task<IActionResult> GetAvailableViews()
    {
        try
        {
            var data = await _permissionService.GetAvailableViewsAndRolesAsync();
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener vistas disponibles");
            return StatusCode(500, new { message = "Error al obtener las vistas disponibles" });
        }
    }

    /// <summary>
    /// Obtiene los permisos del usuario autenticado basados en sus grupos
    /// </summary>
    [HttpGet("my-permissions")]
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
            var groupNames = await _permissionService.GetUserGroupNamesAsync(userId);
            return Ok(new { permissions, groupNames });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener permisos del usuario");
            return StatusCode(500, new { message = "Error al obtener los permisos del usuario" });
        }
    }
}
