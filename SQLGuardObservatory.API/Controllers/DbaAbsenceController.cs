using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/dba-absences")]
[Authorize]
[ViewPermission("DbaAbsences")]
public class DbaAbsenceController : ControllerBase
{
    private readonly IDbaAbsenceService _service;
    private readonly ILogger<DbaAbsenceController> _logger;

    public DbaAbsenceController(IDbaAbsenceService service, ILogger<DbaAbsenceController> logger)
    {
        _service = service;
        _logger = logger;
    }

    private string GetUserId() => User.FindFirstValue(ClaimTypes.NameIdentifier)
        ?? throw new UnauthorizedAccessException("Usuario no autenticado");

    [HttpGet]
    public async Task<ActionResult<List<DbaAbsenceDto>>> GetAll(
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? userId)
    {
        try
        {
            var result = await _service.GetAllAsync(dateFrom, dateTo, userId);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener ausencias DBA");
            return StatusCode(500, new { message = "Error al obtener las ausencias" });
        }
    }

    [HttpPost]
    public async Task<ActionResult<DbaAbsenceDto>> Create([FromBody] CreateDbaAbsenceRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.UserId))
                return BadRequest(new { message = "Debe seleccionar un DBA." });
            if (string.IsNullOrWhiteSpace(request.Reason))
                return BadRequest(new { message = "Debe indicar el motivo de ausencia." });

            var createdBy = GetUserId();
            var result = await _service.CreateAsync(request, createdBy);
            return CreatedAtAction(nameof(GetAll), null, result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al registrar ausencia DBA");
            return StatusCode(500, new { message = "Error al registrar la ausencia" });
        }
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id)
    {
        try
        {
            var deleted = await _service.DeleteAsync(id);
            if (!deleted) return NotFound(new { message = $"Ausencia {id} no encontrada." });
            return Ok(new { message = "Ausencia eliminada correctamente." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar ausencia DBA Id={Id}", id);
            return StatusCode(500, new { message = "Error al eliminar la ausencia" });
        }
    }

    [HttpGet("dbas")]
    public async Task<ActionResult<List<DbaAbsenceDbaDto>>> GetAvailableDbas()
    {
        try
        {
            var result = await _service.GetAvailableDbas();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener DBAs disponibles");
            return StatusCode(500, new { message = "Error al obtener los DBAs" });
        }
    }

    [HttpGet("stats")]
    public async Task<ActionResult<DbaAbsenceStatsDto>> GetStats(
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo)
    {
        try
        {
            var result = await _service.GetStatsAsync(dateFrom, dateTo);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener estadísticas de ausencias");
            return StatusCode(500, new { message = "Error al obtener las estadísticas" });
        }
    }
}
