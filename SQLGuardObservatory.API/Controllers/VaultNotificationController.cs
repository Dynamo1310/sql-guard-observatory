using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controlador para gestionar las preferencias de notificaciones del Vault
/// </summary>
[Authorize]
[ViewPermission("VaultNotifications")]
[ApiController]
[Route("api/vault/notifications")]
public class VaultNotificationController : ControllerBase
{
    private readonly IVaultNotificationService _notificationService;
    private readonly ILogger<VaultNotificationController> _logger;

    public VaultNotificationController(
        IVaultNotificationService notificationService,
        ILogger<VaultNotificationController> logger)
    {
        _notificationService = notificationService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene los tipos de notificación disponibles
    /// </summary>
    [HttpGet("types")]
    public async Task<ActionResult<List<VaultNotificationTypeDto>>> GetNotificationTypes()
    {
        try
        {
            var types = await _notificationService.GetNotificationTypesAsync();
            return Ok(types);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener tipos de notificación");
            return StatusCode(500, new { message = "Error al obtener tipos de notificación" });
        }
    }

    /// <summary>
    /// Obtiene las preferencias de notificación del usuario actual
    /// </summary>
    [HttpGet("preferences")]
    public async Task<ActionResult<List<VaultNotificationPreferenceDto>>> GetUserPreferences()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var preferences = await _notificationService.GetUserPreferencesAsync(userId);
            return Ok(preferences);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener preferencias de notificación");
            return StatusCode(500, new { message = "Error al obtener preferencias de notificación" });
        }
    }

    /// <summary>
    /// Actualiza las preferencias de notificación del usuario actual
    /// </summary>
    [HttpPut("preferences")]
    public async Task<ActionResult> UpdateUserPreferences([FromBody] List<NotificationPreferenceUpdateDto> preferences)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            if (preferences == null || !preferences.Any())
            {
                return BadRequest(new { message = "Se requiere al menos una preferencia" });
            }

            await _notificationService.UpdateUserPreferencesAsync(userId, preferences);

            _logger.LogInformation("Usuario {UserId} actualizó sus preferencias de notificación del Vault", userId);

            return Ok(new { message = "Preferencias actualizadas correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar preferencias de notificación");
            return StatusCode(500, new { message = "Error al actualizar preferencias de notificación" });
        }
    }

    /// <summary>
    /// Actualiza una preferencia de notificación específica
    /// </summary>
    [HttpPut("preferences/{notificationType}")]
    public async Task<ActionResult> UpdateSinglePreference(string notificationType, [FromBody] SinglePreferenceUpdateRequest request)
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            await _notificationService.UpdateUserPreferencesAsync(userId, new List<NotificationPreferenceUpdateDto>
            {
                new NotificationPreferenceUpdateDto
                {
                    NotificationType = notificationType,
                    IsEnabled = request.IsEnabled
                }
            });

            _logger.LogInformation("Usuario {UserId} actualizó preferencia {NotificationType} a {IsEnabled}", 
                userId, notificationType, request.IsEnabled);

            return Ok(new { message = "Preferencia actualizada correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar preferencia de notificación {NotificationType}", notificationType);
            return StatusCode(500, new { message = "Error al actualizar preferencia de notificación" });
        }
    }

    /// <summary>
    /// Habilita todas las notificaciones del usuario
    /// </summary>
    [HttpPost("preferences/enable-all")]
    public async Task<ActionResult> EnableAllNotifications()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var types = await _notificationService.GetNotificationTypesAsync();
            var preferences = types.Select(t => new NotificationPreferenceUpdateDto
            {
                NotificationType = t.Code,
                IsEnabled = true
            }).ToList();

            await _notificationService.UpdateUserPreferencesAsync(userId, preferences);

            _logger.LogInformation("Usuario {UserId} habilitó todas las notificaciones del Vault", userId);

            return Ok(new { message = "Todas las notificaciones habilitadas" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al habilitar todas las notificaciones");
            return StatusCode(500, new { message = "Error al habilitar todas las notificaciones" });
        }
    }

    /// <summary>
    /// Deshabilita todas las notificaciones del usuario
    /// </summary>
    [HttpPost("preferences/disable-all")]
    public async Task<ActionResult> DisableAllNotifications()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var types = await _notificationService.GetNotificationTypesAsync();
            var preferences = types.Select(t => new NotificationPreferenceUpdateDto
            {
                NotificationType = t.Code,
                IsEnabled = false
            }).ToList();

            await _notificationService.UpdateUserPreferencesAsync(userId, preferences);

            _logger.LogInformation("Usuario {UserId} deshabilitó todas las notificaciones del Vault", userId);

            return Ok(new { message = "Todas las notificaciones deshabilitadas" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al deshabilitar todas las notificaciones");
            return StatusCode(500, new { message = "Error al deshabilitar todas las notificaciones" });
        }
    }

    /// <summary>
    /// Restablece las preferencias a sus valores por defecto
    /// </summary>
    [HttpPost("preferences/reset")]
    public async Task<ActionResult> ResetToDefaults()
    {
        try
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrEmpty(userId))
            {
                return Unauthorized(new { message = "Usuario no autenticado" });
            }

            var types = await _notificationService.GetNotificationTypesAsync();
            var preferences = types.Select(t => new NotificationPreferenceUpdateDto
            {
                NotificationType = t.Code,
                IsEnabled = t.DefaultEnabled
            }).ToList();

            await _notificationService.UpdateUserPreferencesAsync(userId, preferences);

            _logger.LogInformation("Usuario {UserId} restableció las preferencias de notificación del Vault a los valores por defecto", userId);

            return Ok(new { message = "Preferencias restablecidas a los valores por defecto" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al restablecer preferencias de notificación");
            return StatusCode(500, new { message = "Error al restablecer preferencias de notificación" });
        }
    }
}

/// <summary>
/// Request para actualizar una preferencia individual
/// </summary>
public class SinglePreferenceUpdateRequest
{
    public bool IsEnabled { get; set; }
}

