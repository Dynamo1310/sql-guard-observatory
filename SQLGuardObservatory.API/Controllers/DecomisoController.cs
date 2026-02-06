using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para la gestión de decomiso de bases de datos sin actividad.
/// GET usa Dapper (performance), PUT usa EF Core (tracking).
/// </summary>
[ApiController]
[Route("api/decomisos")]
[Authorize]
[ViewPermission("GestionDecomiso")]
public class DecomisoController : ControllerBase
{
    private readonly IDecomisoService _decomisoService;
    private readonly ILogger<DecomisoController> _logger;

    public DecomisoController(
        IDecomisoService decomisoService,
        ILogger<DecomisoController> logger)
    {
        _decomisoService = decomisoService;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/decomisos
    /// Retorna la unión de ReporteBasesSinActividad + GestionDecomiso con resumen KPI.
    /// </summary>
    /// <param name="serverName">Filtro opcional por nombre de servidor</param>
    [HttpGet]
    public async Task<ActionResult<DecomisoGridResponse>> GetAll([FromQuery] string? serverName)
    {
        try
        {
            var result = await _decomisoService.GetAllAsync(serverName);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener la grilla de decomisos");
            return StatusCode(500, new { message = "Error al obtener los datos de decomiso", detail = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/decomisos/{id}
    /// Actualiza el estado de gestión de un decomiso existente.
    /// </summary>
    [HttpPut("{id:long}")]
    public async Task<ActionResult<DecomisoGridDto>> Update(long id, [FromBody] UpdateDecomisoRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Estado))
            {
                return BadRequest(new { message = "El campo Estado es obligatorio." });
            }

            var result = await _decomisoService.UpdateAsync(id, request);
            if (result == null)
            {
                return NotFound(new { message = $"No se encontró el registro de gestión con Id {id}." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar decomiso Id={Id}", id);
            return StatusCode(500, new { message = "Error al actualizar el decomiso", detail = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/decomisos/upsert
    /// Crea o actualiza el estado de gestión por ServerName + DBName.
    /// Útil cuando no existe aún registro de gestión para una base del reporte.
    /// </summary>
    [HttpPut("upsert")]
    public async Task<ActionResult<DecomisoGridDto>> Upsert([FromBody] UpdateDecomisoRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.Estado))
            {
                return BadRequest(new { message = "El campo Estado es obligatorio." });
            }

            if (string.IsNullOrWhiteSpace(request.ServerName) || string.IsNullOrWhiteSpace(request.DBName))
            {
                return BadRequest(new { message = "ServerName y DBName son obligatorios." });
            }

            var result = await _decomisoService.UpsertAsync(request);
            if (result == null)
            {
                return StatusCode(500, new { message = "Error al procesar la solicitud de upsert." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en upsert decomiso Server={Server}, DB={DB}",
                request.ServerName, request.DBName);
            return StatusCode(500, new { message = "Error al procesar el decomiso", detail = ex.Message });
        }
    }
}
