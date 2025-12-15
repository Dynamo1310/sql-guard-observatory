using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/oncall")]
[Authorize]
public class OnCallController : ControllerBase
{
    private readonly IOnCallService _onCallService;
    private readonly ILogger<OnCallController> _logger;

    public OnCallController(IOnCallService onCallService, ILogger<OnCallController> logger)
    {
        _onCallService = onCallService;
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
            var operador = await _onCallService.AddOperatorAsync(request.UserId, GetUserId());
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
    public async Task<ActionResult> AddEscalationUser([FromBody] AddOperatorRequest request)
    {
        try
        {
            await _onCallService.AddEscalationUserAsync(request.UserId, GetUserId());
            return Ok(new { message = "Usuario agregado como guardia de escalamiento" });
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
}

