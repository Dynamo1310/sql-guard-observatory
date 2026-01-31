using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para la configuración de parcheos (freezing y notificaciones)
/// </summary>
[ApiController]
[Route("api/patchconfig")]
[Authorize]
public class PatchConfigController : ControllerBase
{
    private readonly IPatchConfigService _patchConfigService;
    private readonly IWindowSuggesterService _windowSuggesterService;
    private readonly ILogger<PatchConfigController> _logger;

    public PatchConfigController(
        IPatchConfigService patchConfigService,
        IWindowSuggesterService windowSuggesterService,
        ILogger<PatchConfigController> logger)
    {
        _patchConfigService = patchConfigService;
        _windowSuggesterService = windowSuggesterService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    #region Freezing Configuration

    /// <summary>
    /// Obtiene la configuración de freezing
    /// </summary>
    [HttpGet("freezing")]
    [ViewPermission("PatchFreezingConfig")]
    public async Task<ActionResult<List<PatchingFreezingConfigDto>>> GetFreezingConfig()
    {
        try
        {
            var config = await _patchConfigService.GetFreezingConfigAsync();
            return Ok(config);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener configuración de freezing");
            return StatusCode(500, new { message = "Error al obtener configuración de freezing" });
        }
    }

    /// <summary>
    /// Obtiene información de freezing para un mes específico
    /// </summary>
    [HttpGet("freezing/month/{year}/{month}")]
    [ViewPermission("PatchFreezingConfig")]
    public async Task<ActionResult<FreezingMonthInfoDto>> GetFreezingMonthInfo(int year, int month)
    {
        try
        {
            if (month < 1 || month > 12)
                return BadRequest(new { message = "Mes inválido" });

            var monthInfo = await _patchConfigService.GetFreezingMonthInfoAsync(year, month);
            return Ok(monthInfo);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener información de freezing para {Year}/{Month}", year, month);
            return StatusCode(500, new { message = "Error al obtener información de freezing" });
        }
    }

    /// <summary>
    /// Actualiza la configuración de freezing
    /// </summary>
    [HttpPost("freezing")]
    [ViewPermission("PatchFreezingConfig")]
    public async Task<ActionResult> UpdateFreezingConfig([FromBody] UpdateFreezingConfigRequest request)
    {
        try
        {
            var userId = GetUserId();
            var success = await _patchConfigService.UpdateFreezingConfigAsync(request, userId);

            if (!success)
                return BadRequest(new { message = "Error al actualizar configuración de freezing" });

            _logger.LogInformation("Configuración de freezing actualizada por {User}", userId);

            return Ok(new { message = "Configuración de freezing actualizada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar configuración de freezing");
            return StatusCode(500, new { message = "Error al actualizar configuración de freezing" });
        }
    }

    /// <summary>
    /// Verifica si una fecha está en período de freezing
    /// </summary>
    [HttpGet("freezing/check")]
    public async Task<ActionResult<bool>> CheckDateFreezing([FromQuery] DateTime date)
    {
        try
        {
            var isFreezing = await _windowSuggesterService.IsDateInFreezingAsync(date);
            return Ok(new { date, isFreezing });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al verificar fecha de freezing");
            return StatusCode(500, new { message = "Error al verificar fecha de freezing" });
        }
    }

    #endregion

    #region Notification Settings

    /// <summary>
    /// Obtiene la configuración de notificaciones
    /// </summary>
    [HttpGet("notifications")]
    [ViewPermission("PatchNotificationsConfig")]
    public async Task<ActionResult<List<PatchNotificationSettingDto>>> GetNotificationSettings()
    {
        try
        {
            var settings = await _patchConfigService.GetNotificationSettingsAsync();
            return Ok(settings);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener configuración de notificaciones");
            return StatusCode(500, new { message = "Error al obtener configuración de notificaciones" });
        }
    }

    /// <summary>
    /// Actualiza una configuración de notificación
    /// </summary>
    [HttpPost("notifications")]
    [ViewPermission("PatchNotificationsConfig")]
    public async Task<ActionResult<PatchNotificationSettingDto>> UpdateNotificationSetting([FromBody] UpdateNotificationSettingRequest request)
    {
        try
        {
            var userId = GetUserId();
            var setting = await _patchConfigService.UpdateNotificationSettingAsync(request, userId);

            if (setting == null)
                return BadRequest(new { message = "Error al actualizar configuración de notificación" });

            _logger.LogInformation(
                "Configuración de notificación {Type} actualizada por {User}",
                request.NotificationType, userId);

            return Ok(setting);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar configuración de notificación");
            return StatusCode(500, new { message = "Error al actualizar configuración de notificación" });
        }
    }

    /// <summary>
    /// Obtiene historial de notificaciones enviadas
    /// </summary>
    [HttpGet("notifications/history")]
    [ViewPermission("PatchNotificationsConfig")]
    public async Task<ActionResult<List<PatchNotificationHistoryDto>>> GetNotificationHistory(
        [FromQuery] int? patchPlanId = null,
        [FromQuery] int limit = 50)
    {
        try
        {
            var history = await _patchConfigService.GetNotificationHistoryAsync(patchPlanId, limit);
            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener historial de notificaciones");
            return StatusCode(500, new { message = "Error al obtener historial de notificaciones" });
        }
    }

    /// <summary>
    /// Prueba envío de notificación (no implementado aún - próximamente)
    /// </summary>
    [HttpPost("notifications/test")]
    [ViewPermission("PatchNotificationsConfig")]
    public ActionResult TestNotification([FromBody] TestNotificationRequest request)
    {
        // TODO: Implementar envío de prueba cuando se implemente el servicio de notificaciones
        return Ok(new { message = "Funcionalidad de prueba próximamente" });
    }

    #endregion
}
