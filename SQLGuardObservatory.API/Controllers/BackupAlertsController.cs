using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar alertas de backups atrasados
/// </summary>
[ApiController]
[Route("api/backup-alerts")]
[Authorize]
[ViewPermission("AlertaBackups")]
public class BackupAlertsController : ControllerBase
{
    private readonly IBackupAlertService _alertService;
    private readonly ILogger<BackupAlertsController> _logger;

    public BackupAlertsController(
        IBackupAlertService alertService,
        ILogger<BackupAlertsController> logger)
    {
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
    private string GetUserDisplayName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>
    /// Obtiene la configuración de alertas de backups
    /// </summary>
    [HttpGet("config")]
    public async Task<ActionResult<BackupAlertConfigDto>> GetConfig()
    {
        try
        {
            var config = await _alertService.GetConfigAsync();
            
            if (config == null)
            {
                // Retornar configuración vacía por defecto
                return Ok(new BackupAlertConfigDto
                {
                    Id = 0,
                    Name = "Alerta de Backups Atrasados",
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

            return Ok(new BackupAlertConfigDto
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
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting backup alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Crea la configuración de alertas de backups
    /// </summary>
    [HttpPost("config")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<BackupAlertConfigDto>> CreateConfig([FromBody] CreateBackupAlertRequest request)
    {
        try
        {
            var config = await _alertService.CreateConfigAsync(request, GetUserId(), GetUserDisplayName());

            return Ok(new BackupAlertConfigDto
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
                UpdatedAt = config.UpdatedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating backup alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Actualiza la configuración de alertas de backups
    /// </summary>
    [HttpPut("config")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<BackupAlertConfigDto>> UpdateConfig([FromBody] UpdateBackupAlertRequest request)
    {
        try
        {
            var config = await _alertService.UpdateConfigAsync(request, GetUserId(), GetUserDisplayName());

            return Ok(new BackupAlertConfigDto
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
                UpdatedAt = config.UpdatedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating backup alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el historial de alertas enviadas
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<List<BackupAlertHistoryDto>>> GetHistory([FromQuery] int limit = 10)
    {
        try
        {
            var history = await _alertService.GetHistoryAsync(limit);
            
            return Ok(history.Select(h => new BackupAlertHistoryDto
            {
                Id = h.Id,
                ConfigId = h.ConfigId,
                SentAt = h.SentAt.ToString("o"),
                RecipientCount = h.RecipientCount,
                CcCount = h.CcCount,
                InstancesAffected = h.InstancesAffected?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                Success = h.Success,
                ErrorMessage = h.ErrorMessage
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting backup alert history");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el estado actual de backups (asignados vs no asignados)
    /// </summary>
    [HttpGet("status")]
    public async Task<ActionResult<BackupAlertStatusDto>> GetStatus()
    {
        try
        {
            var status = await _alertService.GetStatusAsync();
            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting backup alert status");
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
            _logger.LogError(ex, "Error sending test alert");
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
            _logger.LogError(ex, "Error running manual check");
            return StatusCode(500, new { success = false, message = "Error interno: " + ex.Message });
        }
    }
}
