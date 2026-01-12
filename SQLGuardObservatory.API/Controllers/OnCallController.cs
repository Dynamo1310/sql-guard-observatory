using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/oncall")]
[Authorize]
[ViewPermission("OnCall")]
public class OnCallController : ControllerBase
{
    private readonly IOnCallService _onCallService;
    private readonly IOnCallAlertService _alertService;
    private readonly ILogger<OnCallController> _logger;

    public OnCallController(
        IOnCallService onCallService, 
        IOnCallAlertService alertService,
        ILogger<OnCallController> logger)
    {
        _onCallService = onCallService;
        _alertService = alertService;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier) 
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    // ==================== OPERATORS ====================

    /// <summary>
    /// Obtiene la lista de operadores de guardia
    /// </summary>
    [HttpGet("operators")]
    public async Task<ActionResult<List<OnCallOperatorDto>>> GetOperators()
    {
        try
        {
            var operators = await _onCallService.GetOperatorsAsync();
            return Ok(operators);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener operadores");
            return StatusCode(500, new { message = "Error al obtener operadores" });
        }
    }

    /// <summary>
    /// Agrega un usuario como operador de guardia (solo escalamiento)
    /// </summary>
    [HttpPost("operators")]
    public async Task<ActionResult<OnCallOperatorDto>> AddOperator([FromBody] AddOperatorRequest request)
    {
        try
        {
            var operador = await _onCallService.AddOperatorAsync(request.UserId, GetUserId(), request.ColorCode, request.PhoneNumber);
            return CreatedAtAction(nameof(GetOperators), operador);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar operador");
            return StatusCode(500, new { message = "Error al agregar operador" });
        }
    }

    /// <summary>
    /// Actualiza el color de un operador de guardia
    /// </summary>
    [HttpPut("operators/{id}/color")]
    public async Task<ActionResult> UpdateOperatorColor(int id, [FromBody] UpdateOperatorColorRequest request)
    {
        try
        {
            await _onCallService.UpdateOperatorColorAsync(id, request.ColorCode, GetUserId());
            return Ok(new { message = "Color actualizado exitosamente" });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar color del operador");
            return StatusCode(500, new { message = "Error al actualizar color" });
        }
    }

    /// <summary>
    /// Actualiza el teléfono de un operador
    /// </summary>
    [HttpPut("operators/{id}/phone")]
    public async Task<ActionResult> UpdateOperatorPhone(int id, [FromBody] UpdateOperatorPhoneRequest request)
    {
        try
        {
            await _onCallService.UpdateOperatorPhoneAsync(id, request.PhoneNumber, GetUserId());
            return Ok(new { message = "Teléfono actualizado exitosamente" });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar teléfono del operador");
            return StatusCode(500, new { message = "Error al actualizar teléfono" });
        }
    }

    /// <summary>
    /// Elimina un operador de guardia (solo escalamiento)
    /// </summary>
    [HttpDelete("operators/{id}")]
    public async Task<ActionResult> RemoveOperator(int id)
    {
        try
        {
            await _onCallService.RemoveOperatorAsync(id, GetUserId());
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar operador");
            return StatusCode(500, new { message = "Error al eliminar operador" });
        }
    }

    /// <summary>
    /// Reordena los operadores de guardia (solo escalamiento)
    /// </summary>
    [HttpPut("operators/reorder")]
    public async Task<ActionResult> ReorderOperators([FromBody] ReorderOperatorsRequest request)
    {
        try
        {
            await _onCallService.ReorderOperatorsAsync(request.Orders, GetUserId());
            return NoContent();
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al reordenar operadores");
            return StatusCode(500, new { message = "Error al reordenar operadores" });
        }
    }

    // ==================== SCHEDULE ====================

    /// <summary>
    /// Obtiene el calendario de guardias para un mes específico
    /// </summary>
    [HttpGet("calendar/{year}/{month}")]
    public async Task<ActionResult<MonthCalendarDto>> GetMonthCalendar(int year, int month)
    {
        try
        {
            if (month < 1 || month > 12)
            {
                return BadRequest(new { message = "Mes inválido" });
            }

            var calendar = await _onCallService.GetMonthCalendarAsync(year, month);
            return Ok(calendar);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener calendario");
            return StatusCode(500, new { message = "Error al obtener calendario" });
        }
    }

    /// <summary>
    /// Obtiene las guardias para un rango de fechas
    /// </summary>
    [HttpGet("schedule")]
    public async Task<ActionResult<List<OnCallScheduleDto>>> GetSchedules(
        [FromQuery] DateTime? startDate,
        [FromQuery] DateTime? endDate)
    {
        try
        {
            var start = startDate ?? DateTime.Now.AddMonths(-1);
            var end = endDate ?? DateTime.Now.AddMonths(12);

            var schedules = await _onCallService.GetSchedulesAsync(start, end);
            return Ok(schedules);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener guardias");
            return StatusCode(500, new { message = "Error al obtener guardias" });
        }
    }

    /// <summary>
    /// Genera el calendario de guardias automáticamente (solo escalamiento)
    /// </summary>
    [HttpPost("schedule/generate")]
    public async Task<ActionResult> GenerateSchedule([FromBody] GenerateScheduleRequest request)
    {
        try
        {
            var weeksToGenerate = request.WeeksToGenerate ?? 52; // Default: 1 año
            await _onCallService.GenerateScheduleAsync(request.StartDate, weeksToGenerate, GetUserId());
            return Ok(new { message = $"Calendario generado exitosamente: {weeksToGenerate} semanas" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al generar calendario");
            return StatusCode(500, new { message = "Error al generar calendario" });
        }
    }

    /// <summary>
    /// Actualiza una guardia específica (solo escalamiento o dueño con 7 días)
    /// </summary>
    [HttpPut("schedule/{id}")]
    public async Task<ActionResult> UpdateSchedule(int id, [FromBody] UpdateScheduleRequest request)
    {
        try
        {
            await _onCallService.UpdateScheduleAsync(id, request.UserId, GetUserId(), request.Reason);
            return Ok(new { message = "Guardia actualizada exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar guardia");
            return StatusCode(500, new { message = "Error al actualizar guardia" });
        }
    }

    /// <summary>
    /// Obtiene las guardias futuras de un usuario específico
    /// </summary>
    [HttpGet("schedule/user/{userId}")]
    public async Task<ActionResult<List<OnCallScheduleDto>>> GetUserSchedules(string userId)
    {
        try
        {
            var schedules = await _onCallService.GetUserSchedulesAsync(userId);
            return Ok(schedules);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener guardias del usuario {UserId}", userId);
            return StatusCode(500, new { message = "Error al obtener guardias del usuario" });
        }
    }

    /// <summary>
    /// Obtiene quién está de guardia actualmente
    /// </summary>
    [HttpGet("current")]
    public async Task<ActionResult<OnCallCurrentDto>> GetCurrentOnCall()
    {
        try
        {
            var current = await _onCallService.GetCurrentOnCallAsync();
            return Ok(current);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener guardia actual");
            return StatusCode(500, new { message = "Error al obtener guardia actual" });
        }
    }

    /// <summary>
    /// Obtiene la guardia para una fecha específica
    /// </summary>
    [HttpGet("schedule-by-date")]
    public async Task<ActionResult<OnCallScheduleDto>> GetScheduleByDate([FromQuery] DateTime date)
    {
        try
        {
            var schedule = await _onCallService.GetScheduleByDateAsync(date);
            if (schedule == null)
            {
                return NotFound(new { message = "No hay guardia asignada para esa fecha" });
            }
            return Ok(schedule);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener guardia para fecha {Date}", date);
            return StatusCode(500, new { message = "Error al obtener guardia para la fecha especificada" });
        }
    }

    // ==================== SWAP REQUESTS ====================

    /// <summary>
    /// Obtiene las solicitudes de intercambio
    /// </summary>
    [HttpGet("swap-requests")]
    public async Task<ActionResult<List<OnCallSwapRequestDto>>> GetSwapRequests()
    {
        try
        {
            var requests = await _onCallService.GetSwapRequestsAsync(GetUserId());
            return Ok(requests);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener solicitudes de intercambio");
            return StatusCode(500, new { message = "Error al obtener solicitudes" });
        }
    }

    /// <summary>
    /// Crea una solicitud de intercambio
    /// </summary>
    [HttpPost("swap-requests")]
    public async Task<ActionResult<OnCallSwapRequestDto>> CreateSwapRequest([FromBody] CreateSwapRequestDto request)
    {
        try
        {
            var swapRequest = await _onCallService.CreateSwapRequestAsync(request, GetUserId());
            return CreatedAtAction(nameof(GetSwapRequests), swapRequest);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear solicitud de intercambio");
            return StatusCode(500, new { message = "Error al crear solicitud" });
        }
    }

    /// <summary>
    /// Aprueba una solicitud de intercambio
    /// </summary>
    [HttpPost("swap-requests/{id}/approve")]
    public async Task<ActionResult> ApproveSwapRequest(int id)
    {
        try
        {
            await _onCallService.ApproveSwapRequestAsync(id, GetUserId());
            return Ok(new { message = "Solicitud aprobada exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al aprobar solicitud");
            return StatusCode(500, new { message = "Error al aprobar solicitud" });
        }
    }

    /// <summary>
    /// Rechaza una solicitud de intercambio
    /// </summary>
    [HttpPost("swap-requests/{id}/reject")]
    public async Task<ActionResult> RejectSwapRequest(int id, [FromBody] RejectSwapRequestDto request)
    {
        try
        {
            await _onCallService.RejectSwapRequestAsync(id, GetUserId(), request.Reason);
            return Ok(new { message = "Solicitud rechazada" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al rechazar solicitud");
            return StatusCode(500, new { message = "Error al rechazar solicitud" });
        }
    }

    // ==================== UTILITIES ====================

    /// <summary>
    /// Obtiene todos los usuarios de la lista blanca
    /// </summary>
    [HttpGet("whitelist-users")]
    public async Task<ActionResult<List<WhitelistUserDto>>> GetWhitelistUsers()
    {
        try
        {
            var users = await _onCallService.GetWhitelistUsersAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios de lista blanca");
            return StatusCode(500, new { message = "Error al obtener usuarios" });
        }
    }

    /// <summary>
    /// Verifica si el usuario actual es de escalamiento
    /// </summary>
    [HttpGet("is-escalation")]
    public async Task<ActionResult<bool>> IsEscalationUser()
    {
        try
        {
            var isEscalation = await _onCallService.IsEscalationUserAsync(GetUserId());
            return Ok(new { isEscalation });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al verificar usuario de escalamiento");
            return StatusCode(500, new { message = "Error al verificar permisos" });
        }
    }

    // ==================== ESCALATION MANAGEMENT ====================

    /// <summary>
    /// Obtiene los usuarios de escalamiento
    /// </summary>
    [HttpGet("escalation-users")]
    public async Task<ActionResult<List<EscalationUserDto>>> GetEscalationUsers()
    {
        try
        {
            var users = await _onCallService.GetEscalationUsersAsync();
            return Ok(users);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener usuarios de escalamiento");
            return StatusCode(500, new { message = "Error al obtener usuarios de escalamiento" });
        }
    }

    /// <summary>
    /// Agrega un usuario como guardia de escalamiento (solo escalamiento)
    /// </summary>
    [HttpPost("escalation-users")]
    public async Task<ActionResult<EscalationUserDto>> AddEscalationUser([FromBody] AddEscalationUserRequest request)
    {
        try
        {
            var result = await _onCallService.AddEscalationUserAsync(request.UserId, GetUserId(), request.ColorCode, request.PhoneNumber);
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return Conflict(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al agregar usuario de escalamiento");
            return StatusCode(500, new { message = "Error al agregar usuario de escalamiento" });
        }
    }

    /// <summary>
    /// Actualiza el orden de los usuarios de escalamiento
    /// </summary>
    [HttpPut("escalation-users/order")]
    public async Task<ActionResult> UpdateEscalationOrder([FromBody] UpdateEscalationOrderRequest request)
    {
        try
        {
            await _onCallService.UpdateEscalationOrderAsync(request.UserIds, GetUserId());
            return Ok(new { message = "Orden de escalamiento actualizado" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar orden de escalamiento");
            return StatusCode(500, new { message = "Error al actualizar orden de escalamiento" });
        }
    }

    /// <summary>
    /// Actualiza un usuario de escalamiento (color y/o teléfono)
    /// </summary>
    [HttpPut("escalation-users/{id}")]
    public async Task<ActionResult> UpdateEscalationUser(int id, [FromBody] UpdateEscalationUserRequest request)
    {
        try
        {
            await _onCallService.UpdateEscalationUserAsync(id, request, GetUserId());
            return Ok(new { message = "Usuario de escalamiento actualizado" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar usuario de escalamiento");
            return StatusCode(500, new { message = "Error al actualizar usuario de escalamiento" });
        }
    }

    /// <summary>
    /// Quita un usuario de guardia de escalamiento (solo escalamiento o SuperAdmin)
    /// </summary>
    [HttpDelete("escalation-users/{userId}")]
    public async Task<ActionResult> RemoveEscalationUser(string userId)
    {
        try
        {
            await _onCallService.RemoveEscalationUserAsync(userId, GetUserId());
            return Ok(new { message = "Usuario removido de guardia de escalamiento" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al remover usuario de escalamiento");
            return StatusCode(500, new { message = "Error al remover usuario de escalamiento" });
        }
    }

    // ==================== CONFIGURATION ====================

    /// <summary>
    /// Obtiene la configuración de guardias
    /// </summary>
    [HttpGet("config")]
    public async Task<ActionResult<OnCallConfigDto>> GetConfig()
    {
        try
        {
            var config = await _onCallService.GetConfigAsync();
            return Ok(config);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener configuración");
            return StatusCode(500, new { message = "Error al obtener configuración" });
        }
    }

    /// <summary>
    /// Actualiza la configuración de guardias
    /// </summary>
    [HttpPut("config")]
    public async Task<ActionResult> UpdateConfig([FromBody] UpdateOnCallConfigRequest request)
    {
        try
        {
            await _onCallService.UpdateConfigAsync(request, GetUserId());
            return Ok(new { message = "Configuración actualizada exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar configuración");
            return StatusCode(500, new { message = "Error al actualizar configuración" });
        }
    }

    // ==================== HOLIDAYS ====================

    /// <summary>
    /// Obtiene la lista de feriados
    /// </summary>
    [HttpGet("holidays")]
    public async Task<ActionResult<List<OnCallHolidayDto>>> GetHolidays()
    {
        try
        {
            var holidays = await _onCallService.GetHolidaysAsync();
            return Ok(holidays);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener feriados");
            return StatusCode(500, new { message = "Error al obtener feriados" });
        }
    }

    /// <summary>
    /// Crea un nuevo feriado
    /// </summary>
    [HttpPost("holidays")]
    public async Task<ActionResult<OnCallHolidayDto>> CreateHoliday([FromBody] CreateHolidayRequest request)
    {
        try
        {
            var holiday = await _onCallService.CreateHolidayAsync(request, GetUserId());
            return CreatedAtAction(nameof(GetHolidays), holiday);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear feriado");
            return StatusCode(500, new { message = "Error al crear feriado" });
        }
    }

    /// <summary>
    /// Actualiza un feriado existente
    /// </summary>
    [HttpPut("holidays/{id}")]
    public async Task<ActionResult> UpdateHoliday(int id, [FromBody] UpdateHolidayRequest request)
    {
        try
        {
            await _onCallService.UpdateHolidayAsync(id, request, GetUserId());
            return Ok(new { message = "Feriado actualizado exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar feriado");
            return StatusCode(500, new { message = "Error al actualizar feriado" });
        }
    }

    /// <summary>
    /// Elimina un feriado
    /// </summary>
    [HttpDelete("holidays/{id}")]
    public async Task<ActionResult> DeleteHoliday(int id)
    {
        try
        {
            await _onCallService.DeleteHolidayAsync(id, GetUserId());
            return Ok(new { message = "Feriado eliminado exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar feriado");
            return StatusCode(500, new { message = "Error al eliminar feriado" });
        }
    }

    // ==================== DAY OVERRIDES (Coberturas por día) ====================

    /// <summary>
    /// Obtiene las coberturas de días para un rango de fechas
    /// </summary>
    [HttpGet("day-overrides")]
    public async Task<ActionResult<List<OnCallDayOverrideDto>>> GetDayOverrides(
        [FromQuery] DateTime? startDate = null,
        [FromQuery] DateTime? endDate = null)
    {
        try
        {
            var start = startDate ?? DateTime.Today.AddMonths(-1);
            var end = endDate ?? DateTime.Today.AddMonths(12);
            
            var overrides = await _onCallService.GetDayOverridesAsync(start, end);
            return Ok(overrides);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener coberturas de días");
            return StatusCode(500, new { message = "Error al obtener coberturas" });
        }
    }

    /// <summary>
    /// Crea una cobertura para un día específico (solo Team Escalamiento)
    /// </summary>
    [HttpPost("day-overrides")]
    public async Task<ActionResult<OnCallDayOverrideDto>> CreateDayOverride([FromBody] CreateDayOverrideRequest request)
    {
        try
        {
            var result = await _onCallService.CreateDayOverrideAsync(request, GetUserId());
            return Ok(result);
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear cobertura de día");
            return StatusCode(500, new { message = "Error al crear cobertura" });
        }
    }

    /// <summary>
    /// Elimina/desactiva una cobertura de día específico (solo Team Escalamiento)
    /// </summary>
    [HttpDelete("day-overrides/{id}")]
    public async Task<ActionResult> DeleteDayOverride(int id)
    {
        try
        {
            await _onCallService.DeleteDayOverrideAsync(id, GetUserId());
            return Ok(new { message = "Cobertura eliminada exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar cobertura de día");
            return StatusCode(500, new { message = "Error al eliminar cobertura" });
        }
    }

    // ==================== EMAIL TEMPLATES ====================

    /// <summary>
    /// Obtiene todos los templates de email
    /// </summary>
    [HttpGet("email-templates")]
    public async Task<ActionResult<List<OnCallEmailTemplateDto>>> GetEmailTemplates()
    {
        try
        {
            var templates = await _onCallService.GetEmailTemplatesAsync();
            return Ok(templates);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener templates de email");
            return StatusCode(500, new { message = "Error al obtener templates" });
        }
    }

    /// <summary>
    /// Obtiene un template de email por ID
    /// </summary>
    [HttpGet("email-templates/{id}")]
    public async Task<ActionResult<OnCallEmailTemplateDto>> GetEmailTemplate(int id)
    {
        try
        {
            var template = await _onCallService.GetEmailTemplateAsync(id);
            if (template == null)
                return NotFound(new { message = "Template no encontrado" });
            return Ok(template);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener template de email");
            return StatusCode(500, new { message = "Error al obtener template" });
        }
    }

    /// <summary>
    /// Obtiene información de placeholders disponibles para cada tipo de template
    /// Hay 3 templates: Calendario Generado, Notificación Semanal (miércoles), Aviso Previo (martes)
    /// </summary>
    [HttpGet("email-templates/placeholders")]
    public ActionResult<List<EmailTemplatePlaceholderInfo>> GetPlaceholderInfo()
    {
        // Placeholders comunes disponibles en todos los templates de guardia
        var guardiaPlaceholders = new List<PlaceholderDto>
        {
            // Operador que ENTRA de guardia
            new PlaceholderDto { Key = "{{Tecnico}}", Description = "Nombre del técnico/operador de guardia", Example = "Quiroga Javier" },
            new PlaceholderDto { Key = "{{Movil}}", Description = "Teléfono móvil del operador", Example = "11 2392-7579" },
            new PlaceholderDto { Key = "{{Inicio}}", Description = "Fecha y hora de inicio de la guardia", Example = "27/08/2025 19:00" },
            new PlaceholderDto { Key = "{{Fin}}", Description = "Fecha y hora de fin de la guardia", Example = "03/09/2025 07:00" },
            
            // Team Escalamiento como tabla HTML
            new PlaceholderDto { Key = "{{TablaEscalamiento}}", Description = "Tabla HTML con contactos de escalamiento", Example = "<table>...</table>" },
            new PlaceholderDto { Key = "{{TeamEscalamiento}}", Description = "Lista de nombres del team de escalamiento", Example = "Pablo Morixe, Pablo Rodriguez, Rodrigo Tissera" },
        };

        var placeholders = new List<EmailTemplatePlaceholderInfo>
        {
            new EmailTemplatePlaceholderInfo
            {
                AlertType = "ScheduleGenerated",
                AlertTypeName = "Calendario Generado",
                Placeholders = new List<PlaceholderDto>
                {
                    new PlaceholderDto { Key = "{{FechaInicio}}", Description = "Fecha de inicio del calendario generado", Example = "Miércoles 17 de diciembre de 2025" },
                    new PlaceholderDto { Key = "{{FechaFin}}", Description = "Fecha de fin del calendario generado", Example = "Miércoles 16 de diciembre de 2026" },
                    new PlaceholderDto { Key = "{{Semanas}}", Description = "Número de semanas generadas", Example = "52" },
                    new PlaceholderDto { Key = "{{PrimerOperador}}", Description = "Nombre del primer operador en la rotación", Example = "Juan Pérez" },
                    new PlaceholderDto { Key = "{{PrimerOperadorTelefono}}", Description = "Teléfono del primer operador", Example = "11-1234-5678" },
                    new PlaceholderDto { Key = "{{ResumenCalendario}}", Description = "Resumen de las primeras semanas", Example = "• 17/12 - 24/12: Juan Pérez\n• 24/12 - 31/12: Ana Silva" },
                    new PlaceholderDto { Key = "{{LinkPlanificador}}", Description = "Link al planificador de guardias", Example = "http://app.ejemplo.com/oncall/schedule" },
                }
            },
            new EmailTemplatePlaceholderInfo
            {
                AlertType = "WeeklyNotification",
                AlertTypeName = "Notificación Semanal (Miércoles 12:00)",
                Placeholders = guardiaPlaceholders.ToList()
            },
            new EmailTemplatePlaceholderInfo
            {
                AlertType = "PreWeekNotification",
                AlertTypeName = "Aviso Previo (Martes 16:00)",
                Placeholders = guardiaPlaceholders.ToList()
            }
        };
        
        return Ok(placeholders);
    }

    /// <summary>
    /// Crea un nuevo template de email
    /// </summary>
    [HttpPost("email-templates")]
    public async Task<ActionResult<OnCallEmailTemplateDto>> CreateEmailTemplate([FromBody] CreateEmailTemplateRequest request)
    {
        try
        {
            var template = await _onCallService.CreateEmailTemplateAsync(request, GetUserId());
            return Ok(template);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear template de email");
            return StatusCode(500, new { message = "Error al crear template" });
        }
    }

    /// <summary>
    /// Actualiza un template de email existente
    /// </summary>
    [HttpPut("email-templates/{id}")]
    public async Task<ActionResult<OnCallEmailTemplateDto>> UpdateEmailTemplate(int id, [FromBody] UpdateEmailTemplateRequest request)
    {
        try
        {
            var template = await _onCallService.UpdateEmailTemplateAsync(id, request, GetUserId());
            return Ok(template);
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar template de email");
            return StatusCode(500, new { message = "Error al actualizar template" });
        }
    }

    /// <summary>
    /// Elimina un template de email (no se pueden eliminar templates por defecto)
    /// </summary>
    [HttpDelete("email-templates/{id}")]
    public async Task<ActionResult> DeleteEmailTemplate(int id)
    {
        try
        {
            await _onCallService.DeleteEmailTemplateAsync(id);
            return Ok(new { message = "Template eliminado exitosamente" });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar template de email");
            return StatusCode(500, new { message = "Error al eliminar template" });
        }
    }

    // ==================== SCHEDULE BATCHES (APROBACIÓN) ====================

    /// <summary>
    /// Obtiene todos los lotes de generación de calendario
    /// </summary>
    [HttpGet("batches")]
    public async Task<ActionResult<List<OnCallScheduleBatchDto>>> GetScheduleBatches()
    {
        try
        {
            var batches = await _onCallService.GetScheduleBatchesAsync();
            return Ok(batches);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener lotes de calendario");
            return StatusCode(500, new { message = "Error al obtener lotes" });
        }
    }

    /// <summary>
    /// Obtiene los lotes pendientes de aprobación
    /// </summary>
    [HttpGet("batches/pending")]
    public async Task<ActionResult<List<OnCallScheduleBatchDto>>> GetPendingBatches()
    {
        try
        {
            var batches = await _onCallService.GetPendingBatchesAsync();
            return Ok(batches);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener lotes pendientes");
            return StatusCode(500, new { message = "Error al obtener lotes pendientes" });
        }
    }

    /// <summary>
    /// Aprueba un lote de calendario
    /// </summary>
    [HttpPost("batches/{id}/approve")]
    public async Task<ActionResult> ApproveScheduleBatch(int id)
    {
        try
        {
            await _onCallService.ApproveScheduleBatchAsync(id, GetUserId());
            return Ok(new { message = "Calendario aprobado exitosamente" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al aprobar lote de calendario");
            return StatusCode(500, new { message = "Error al aprobar calendario" });
        }
    }

    /// <summary>
    /// Rechaza un lote de calendario
    /// </summary>
    [HttpPost("batches/{id}/reject")]
    public async Task<ActionResult> RejectScheduleBatch(int id, [FromBody] RejectScheduleBatchRequest request)
    {
        try
        {
            await _onCallService.RejectScheduleBatchAsync(id, GetUserId(), request.Reason);
            return Ok(new { message = "Calendario rechazado" });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { message = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al rechazar lote de calendario");
            return StatusCode(500, new { message = "Error al rechazar calendario" });
        }
    }

    // ==================== NOTIFICACIONES PROGRAMADAS ====================

    /// <summary>
    /// Envía manualmente la notificación semanal de guardias (normalmente se envía miércoles 12:00)
    /// </summary>
    [HttpPost("notifications/weekly/send")]
    public async Task<ActionResult> SendWeeklyNotification()
    {
        try
        {
            await _alertService.SendWeeklyNotificationAsync();
            return Ok(new { message = "Notificación semanal enviada correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar notificación semanal");
            return StatusCode(500, new { message = $"Error al enviar notificación: {ex.Message}" });
        }
    }

    /// <summary>
    /// Envía manualmente el aviso previo de guardias (normalmente se envía martes 16:00)
    /// </summary>
    [HttpPost("notifications/preweek/send")]
    public async Task<ActionResult> SendPreWeekNotification()
    {
        try
        {
            await _alertService.SendPreWeekNotificationAsync();
            return Ok(new { message = "Aviso previo enviado correctamente" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar aviso previo");
            return StatusCode(500, new { message = $"Error al enviar aviso: {ex.Message}" });
        }
    }

    /// <summary>
    /// Envía un email de prueba del template especificado a una dirección de email específica
    /// </summary>
    [HttpPost("notifications/test/{templateId}")]
    public async Task<ActionResult> SendTestEmail(int templateId, [FromBody] SendTestEmailRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.TestEmail))
                return BadRequest(new { message = "Debe especificar un email de destino" });

            await _alertService.SendTestEmailAsync(templateId, request.TestEmail);
            return Ok(new { message = $"Email de prueba enviado a {request.TestEmail}" });
        }
        catch (ArgumentException ex)
        {
            return NotFound(new { message = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al enviar email de prueba");
            return StatusCode(500, new { message = $"Error al enviar email de prueba: {ex.Message}" });
        }
    }
}

