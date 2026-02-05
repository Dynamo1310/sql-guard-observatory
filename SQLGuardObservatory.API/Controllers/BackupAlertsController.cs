using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para gestionar alertas de backups atrasados (FULL y LOG independientes)
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
    /// Convierte string "full"/"log" a BackupAlertType
    /// </summary>
    private BackupAlertType ParseAlertType(string type)
    {
        return type?.ToLower() switch
        {
            "full" => BackupAlertType.Full,
            "log" => BackupAlertType.Log,
            _ => throw new ArgumentException($"Tipo de alerta inválido: {type}. Debe ser 'full' o 'log'.")
        };
    }

    /// <summary>
    /// Convierte BackupAlertType a string
    /// </summary>
    private string AlertTypeToString(BackupAlertType type) => type == BackupAlertType.Full ? "full" : "log";

    /// <summary>
    /// Mapea BackupAlertConfig a BackupAlertConfigDto
    /// </summary>
    private BackupAlertConfigDto MapConfigToDto(BackupAlertConfig config)
    {
        return new BackupAlertConfigDto
        {
            Id = config.Id,
            AlertType = AlertTypeToString(config.AlertType),
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
    /// Obtiene la configuración de alertas por tipo (full o log)
    /// </summary>
    [HttpGet("config/{type}")]
    public async Task<ActionResult<BackupAlertConfigDto>> GetConfig(string type)
    {
        try
        {
            var alertType = ParseAlertType(type);
            var config = await _alertService.GetConfigAsync(alertType);
            
            if (config == null)
            {
                // Retornar configuración vacía por defecto
                return Ok(new BackupAlertConfigDto
                {
                    Id = 0,
                    AlertType = type.ToLower(),
                    Name = alertType == BackupAlertType.Full 
                        ? "Alerta de Backups FULL Atrasados" 
                        : "Alerta de Backups LOG Atrasados",
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
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting backup alert config for type {Type}", type);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Actualiza la configuración de alertas por tipo (full o log)
    /// </summary>
    [HttpPut("config/{type}")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult<BackupAlertConfigDto>> UpdateConfig(string type, [FromBody] UpdateBackupAlertRequest request)
    {
        try
        {
            var alertType = ParseAlertType(type);
            var config = await _alertService.UpdateConfigAsync(alertType, request, GetUserId(), GetUserDisplayName());

            return Ok(MapConfigToDto(config));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating backup alert config for type {Type}", type);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el historial de alertas enviadas por tipo (full o log)
    /// </summary>
    [HttpGet("history/{type}")]
    public async Task<ActionResult<List<BackupAlertHistoryDto>>> GetHistory(string type, [FromQuery] int limit = 10)
    {
        try
        {
            var alertType = ParseAlertType(type);
            var history = await _alertService.GetHistoryAsync(alertType, limit);
            
            return Ok(history.Select(h => new BackupAlertHistoryDto
            {
                Id = h.Id,
                ConfigId = h.ConfigId,
                AlertType = AlertTypeToString(h.AlertType),
                SentAt = h.SentAt.ToString("o"),
                RecipientCount = h.RecipientCount,
                CcCount = h.CcCount,
                InstancesAffected = h.InstancesAffected?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
                Success = h.Success,
                ErrorMessage = h.ErrorMessage
            }).ToList());
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting backup alert history for type {Type}", type);
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el estado actual de backups (asignados vs no asignados) - Combinado para FULL y LOG
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
    /// Envía un email de prueba por tipo (full o log)
    /// </summary>
    [HttpPost("test/{type}")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> TestAlert(string type)
    {
        try
        {
            var alertType = ParseAlertType(type);
            var result = await _alertService.TestAlertAsync(alertType);
            return Ok(new { success = result.success, message = result.message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test alert for type {Type}", type);
            return StatusCode(500, new { success = false, message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Ejecuta una verificación manualmente por tipo (full o log)
    /// </summary>
    [HttpPost("run/{type}")]
    [RequireCapability("System.ConfigureAlerts")]
    public async Task<ActionResult> RunNow(string type)
    {
        try
        {
            var alertType = ParseAlertType(type);
            var result = await _alertService.RunCheckAsync(alertType);
            return Ok(new { success = result.success, message = result.message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { success = false, message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error running manual check for type {Type}", type);
            return StatusCode(500, new { success = false, message = "Error interno: " + ex.Message });
        }
    }
}
