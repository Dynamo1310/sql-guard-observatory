using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;
using System.Text.Json;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/overview-alerts")]
[Authorize]
public class OverviewSummaryAlertsController : ControllerBase
{
    private readonly IOverviewSummaryAlertService _alertService;
    private readonly ILogger<OverviewSummaryAlertsController> _logger;

    public OverviewSummaryAlertsController(
        IOverviewSummaryAlertService alertService,
        ILogger<OverviewSummaryAlertsController> logger)
    {
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "unknown";
    private string GetUserDisplayName() => User.FindFirst(ClaimTypes.Name)?.Value ?? User.Identity?.Name ?? "unknown";

    /// <summary>
    /// Obtiene la configuración de alertas de resumen Overview
    /// </summary>
    [HttpGet("config")]
    public async Task<ActionResult<OverviewSummaryAlertConfigDto>> GetConfig()
    {
        try
        {
            var config = await _alertService.GetConfigAsync();
            
            if (config == null)
            {
                // Retornar configuración vacía por defecto
                return Ok(new OverviewSummaryAlertConfigDto
                {
                    Id = 0,
                    Name = "Alerta Resumen Overview",
                    Description = "Envía un resumen del estado de la plataforma productiva por email",
                    IsEnabled = false,
                    Recipients = new List<string>(),
                    IncludeOnlyProduction = true,
                    Schedules = new List<OverviewSummaryAlertScheduleDto>(),
                    CreatedAt = DateTime.Now,
                    UpdatedAt = null,
                    UpdatedByDisplayName = null
                });
            }

            return Ok(MapConfigToDto(config));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting overview summary alert config");
            return StatusCode(500, new { message = "Error interno: " + ex.Message });
        }
    }

    /// <summary>
    /// Actualiza la configuración de alertas
    /// </summary>
    [HttpPut("config")]
    public async Task<ActionResult<OverviewSummaryAlertConfigDto>> UpdateConfig([FromBody] UpdateOverviewSummaryAlertConfigRequest request)
    {
        try
        {
            var config = await _alertService.UpdateConfigAsync(request, GetUserId(), GetUserDisplayName());
            
            // Recargar con schedules
            var fullConfig = await _alertService.GetConfigAsync();
            return Ok(MapConfigToDto(fullConfig!));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating overview summary alert config");
            return StatusCode(500, new { message = "Error al actualizar configuración: " + ex.Message });
        }
    }

    /// <summary>
    /// Agrega un nuevo horario de envío
    /// </summary>
    [HttpPost("schedules")]
    public async Task<ActionResult<OverviewSummaryAlertScheduleDto>> AddSchedule([FromBody] CreateOverviewSummaryAlertScheduleRequest request)
    {
        try
        {
            var schedule = await _alertService.AddScheduleAsync(request);
            return Ok(MapScheduleToDto(schedule));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error adding schedule");
            return StatusCode(500, new { message = "Error al agregar schedule: " + ex.Message });
        }
    }

    /// <summary>
    /// Actualiza un horario existente
    /// </summary>
    [HttpPut("schedules/{id}")]
    public async Task<ActionResult<OverviewSummaryAlertScheduleDto>> UpdateSchedule(int id, [FromBody] UpdateOverviewSummaryAlertScheduleRequest request)
    {
        try
        {
            var schedule = await _alertService.UpdateScheduleAsync(id, request);
            if (schedule == null)
            {
                return NotFound(new { message = "Schedule no encontrado" });
            }
            return Ok(MapScheduleToDto(schedule));
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating schedule");
            return StatusCode(500, new { message = "Error al actualizar schedule: " + ex.Message });
        }
    }

    /// <summary>
    /// Elimina un horario
    /// </summary>
    [HttpDelete("schedules/{id}")]
    public async Task<ActionResult> DeleteSchedule(int id)
    {
        try
        {
            var deleted = await _alertService.DeleteScheduleAsync(id);
            if (!deleted)
            {
                return NotFound(new { message = "Schedule no encontrado" });
            }
            return Ok(new { success = true, message = "Schedule eliminado" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting schedule");
            return StatusCode(500, new { message = "Error al eliminar schedule: " + ex.Message });
        }
    }

    /// <summary>
    /// Obtiene el historial de alertas enviadas
    /// </summary>
    [HttpGet("history")]
    public async Task<ActionResult<List<OverviewSummaryAlertHistoryDto>>> GetHistory([FromQuery] int limit = 20)
    {
        try
        {
            var history = await _alertService.GetHistoryAsync(limit);

            return Ok(history.Select(h => new OverviewSummaryAlertHistoryDto
            {
                Id = h.Id,
                ConfigId = h.ConfigId,
                ScheduleId = h.ScheduleId,
                ScheduleTime = h.Schedule?.TimeOfDay.ToString(@"hh\:mm"),
                SentAt = h.SentAt,
                RecipientCount = h.RecipientCount,
                Success = h.Success,
                ErrorMessage = h.ErrorMessage,
                TriggerType = h.TriggerType,
                SummaryData = !string.IsNullOrEmpty(h.SummaryData) 
                    ? JsonSerializer.Deserialize<OverviewSummaryDataDto>(h.SummaryData) 
                    : null
            }).ToList());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting history");
            return StatusCode(500, new { message = "Error al obtener historial: " + ex.Message });
        }
    }

    /// <summary>
    /// Genera y devuelve los datos del resumen sin enviar email
    /// </summary>
    [HttpGet("preview")]
    public async Task<ActionResult<OverviewSummaryDataDto>> GetPreview()
    {
        try
        {
            _logger.LogInformation("=== INICIANDO PREVIEW ===");
            var summary = await _alertService.GenerateSummaryDataAsync();
            
            _logger.LogInformation("=== PREVIEW COMPLETADO ===");
            _logger.LogInformation("Resultados: TotalInstancias={Total}, Críticas={Criticas}, Discos críticos={Discos}, Mantenimiento atrasado={Maint}, Backups atrasados={Backups}", 
                summary.TotalInstances, summary.CriticalCount, summary.CriticalDisks, summary.MaintenanceOverdue, summary.BackupsOverdue);
            
            // Log detallado de las listas
            if (summary.CriticalDisksList?.Count > 0)
            {
                foreach (var disk in summary.CriticalDisksList)
                {
                    _logger.LogInformation("  -> Disco crítico: {Instance} {Drive} {Pct}%", disk.InstanceName, disk.Drive, disk.RealPorcentajeLibre);
                }
            }
            if (summary.MaintenanceOverdueList?.Count > 0)
            {
                foreach (var maint in summary.MaintenanceOverdueList)
                {
                    _logger.LogInformation("  -> Mantenimiento: {Name} - {Tipo}", maint.DisplayName, maint.Tipo);
                }
            }
            
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generating preview");
            return StatusCode(500, new { message = "Error al generar preview: " + ex.Message });
        }
    }

    /// <summary>
    /// Envía un email de prueba a todos los destinatarios configurados
    /// </summary>
    [HttpPost("test")]
    public async Task<ActionResult<OverviewSummaryAlertResult>> SendTestEmail()
    {
        try
        {
            var result = await _alertService.SendTestEmailAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending test email");
            return StatusCode(500, new { success = false, message = "Error: " + ex.Message });
        }
    }

    /// <summary>
    /// Ejecuta el envío del resumen ahora (manual)
    /// </summary>
    [HttpPost("run")]
    public async Task<ActionResult<OverviewSummaryAlertResult>> RunNow()
    {
        try
        {
            var result = await _alertService.SendSummaryAsync(null, "Manual");
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error running summary alert");
            return StatusCode(500, new { success = false, message = "Error: " + ex.Message });
        }
    }

    #region Helpers

    private OverviewSummaryAlertConfigDto MapConfigToDto(Models.OverviewSummaryAlertConfig config)
    {
        return new OverviewSummaryAlertConfigDto
        {
            Id = config.Id,
            Name = config.Name,
            Description = config.Description,
            IsEnabled = config.IsEnabled,
            Recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>(),
            IncludeOnlyProduction = config.IncludeOnlyProduction,
            Schedules = config.Schedules?.Select(MapScheduleToDto).ToList() ?? new List<OverviewSummaryAlertScheduleDto>(),
            CreatedAt = config.CreatedAt,
            UpdatedAt = config.UpdatedAt,
            UpdatedByDisplayName = config.UpdatedByDisplayName
        };
    }

    private OverviewSummaryAlertScheduleDto MapScheduleToDto(Models.OverviewSummaryAlertSchedule schedule)
    {
        return new OverviewSummaryAlertScheduleDto
        {
            Id = schedule.Id,
            ConfigId = schedule.ConfigId,
            TimeOfDay = schedule.TimeOfDay.ToString(@"hh\:mm"),
            IsEnabled = schedule.IsEnabled,
            DaysOfWeek = schedule.DaysOfWeek?
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(d => int.Parse(d.Trim()))
                .ToList() ?? new List<int> { 1, 2, 3, 4, 5 },
            LastSentAt = schedule.LastSentAt,
            CreatedAt = schedule.CreatedAt
        };
    }

    #endregion
}

