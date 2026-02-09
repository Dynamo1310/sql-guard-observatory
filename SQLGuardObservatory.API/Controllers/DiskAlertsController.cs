using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar alertas de discos críticos
/// </summary>
[ApiController]
[Route("api/disk-alerts")]
[Authorize]
[ViewPermission("AlertaDiscosCriticos")]
public class DiskAlertsController : ControllerBase
{
    private readonly IDiskAlertService _alertService;
    private readonly ILogger<DiskAlertsController> _logger;

    public DiskAlertsController(
        IDiskAlertService alertService,
        ILogger<DiskAlertsController> logger)
    {
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
    private string GetUserDisplayName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>
    /// Mapea DiskAlertConfig a DiskAlertConfigDto
    /// </summary>
    private DiskAlertConfigDto MapConfigToDto(DiskAlertConfig config)
    {
        return new DiskAlertConfigDto
        {
            Id = config.Id,
            Name = config.Name,
            Description = config.Description,
            IsEnabled = config.IsEnabled,
            CheckIntervalMinutes = config.CheckIntervalMinutes,
            AlertIntervalMinutes = config.AlertIntervalMinutes,
            Recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
            CcRecipients = config.CcRecipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
            LastRunAt = config.LastRunAt?.ToString("o"),
            LastAlertSentAt = config.LastAlertSentAt?.ToString("o"),
            CreatedAt = config.CreatedAt,
            UpdatedAt = config.UpdatedAt,
            UpdatedByDisplayName = config.UpdatedByUser?.DisplayName
        };
    }

    /// <summary>
    /// Obtiene la configuración de alertas de discos
    /// </summary>
    [HttpGet("config")]
    public async Task<ActionResult<DiskAlertConfigDto>> GetConfig()
    {
        try
        {
            var config = await _alertService.GetConfigAsync();
            
            if (config == null)
            {
                return Ok(new DiskAlertConfigDto
                {
                    Id = 0,
                    Name = "Alerta de Discos Críticos",
                    Description = "",
                    IsEnabled = false,
                    CheckIntervalMinutes = 60,
                    AlertIntervalMinutes = 240,
                    Recipients = new List<string>(),
                    CcRecipients = new List<string>(),
                    LastRunAt = null,
                    LastAlertSentAt = null,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = null,
                    UpdatedByDisplayName = null
                });
            }

            return Ok(MapConfigToDto(config));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting disk alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Actualiza la configuración de alertas de discos
    /// </summary>
    [HttpPut("config")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<DiskAlertConfigDto>> UpdateConfig([FromBody] UpdateDiskAlertRequest request)
    {
        try
        {
            var config = await _alertService.UpdateConfigAsync(request, GetUserId(), GetUserDisplayName());
            return Ok(MapConfigToDto(config));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating disk alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el historial de alertas enviadas
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<List<DiskAlertHistoryDto>>> GetHistory([FromQuery] int limit = 10)
    {
        try
        {
            var history = await _alertService.GetHistoryAsync(limit);
            
            return Ok(history.Select(h => new DiskAlertHistoryDto
            {
                Id = h.Id,
                ConfigId = h.ConfigId,
                SentAt = h.SentAt.ToString("o"),
                RecipientCount = h.RecipientCount,
                CcCount = h.CcCount,
                DisksAffected = h.DisksAffected?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                CriticalDiskCount = h.CriticalDiskCount,
                Success = h.Success,
                ErrorMessage = h.ErrorMessage
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting disk alert history");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el estado actual de discos críticos
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<DiskAlertStatusDto>> GetStatus()
    {
        try
        {
            var status = await _alertService.GetStatusAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting disk alert status");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Envía un email de prueba
    /// </summary>
    [HttpPost("test")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> TestAlert()
    {
        try
        {
            var result = await _alertService.TestAlertAsync();
            return Ok(new { success = result.success, message = result.message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test disk alert");
            return StatusCode(500, new { success = false, message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Ejecuta una verificación manualmente
    /// </summary>
    [HttpPost("run")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> RunNow()
    {
        try
        {
            var result = await _alertService.RunCheckAsync();
            return Ok(new { success = result.success, message = result.message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error running manual disk alert check");
            return StatusCode(500, new { success = false, message = "Error interno: " + ex.Message });
        }
    }
}
