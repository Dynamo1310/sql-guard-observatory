using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para Intervenciones War - seguimiento de incidencias DBA.
/// CRUD completo + estadísticas para gráficos.
/// </summary>
[ApiController]
[Route("api/intervenciones-war")]
[Authorize]
[ViewPermission("IntervencionesWar")]
public class IntervencionWarController : ControllerBase
{
    private readonly IIntervencionWarService _service;
    private readonly ILogger<IntervencionWarController> _logger;

    public IntervencionWarController(
        IIntervencionWarService service,
        ILogger<IntervencionWarController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/intervenciones-war
    /// Retorna todas las intervenciones con resumen KPI.
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IntervencionWarGridResponse>> GetAll()
    {
        try
        {
            var result = await _service.GetAllAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener intervenciones War");
            return StatusCode(500, new { message = "Error al obtener las intervenciones", detail = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/intervenciones-war/{id}
    /// Retorna una intervención por ID.
    /// </summary>
    [HttpGet("{id:long}")]
    public async Task<ActionResult<IntervencionWarDto>> GetById(long id)
    {
        try
        {
            var result = await _service.GetByIdAsync(id);
            if (result == null) return NotFound(new { message = $"Intervención {id} no encontrada." });
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener intervención War Id={Id}", id);
            return StatusCode(500, new { message = "Error al obtener la intervención", detail = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/intervenciones-war
    /// Crea una nueva intervención.
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<IntervencionWarDto>> Create([FromBody] CreateUpdateIntervencionWarRequest request)
    {
        try
        {
            var errors = ValidateRequest(request);
            if (errors.Count > 0)
                return BadRequest(new { message = string.Join(" ", errors) });

            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                         ?? User.FindFirst("sub")?.Value;

            var result = await _service.CreateAsync(request, userId);
            return CreatedAtAction(nameof(GetById), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear intervención War");
            return StatusCode(500, new { message = "Error al crear la intervención", detail = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/intervenciones-war/{id}
    /// Actualiza una intervención existente.
    /// </summary>
    [HttpPut("{id:long}")]
    public async Task<ActionResult<IntervencionWarDto>> Update(long id, [FromBody] CreateUpdateIntervencionWarRequest request)
    {
        try
        {
            var errors = ValidateRequest(request);
            if (errors.Count > 0)
                return BadRequest(new { message = string.Join(" ", errors) });

            var result = await _service.UpdateAsync(id, request);
            if (result == null) return NotFound(new { message = $"Intervención {id} no encontrada." });
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar intervención War Id={Id}", id);
            return StatusCode(500, new { message = "Error al actualizar la intervención", detail = ex.Message });
        }
    }

    /// <summary>
    /// DELETE /api/intervenciones-war/{id}
    /// Elimina una intervención.
    /// </summary>
    [HttpDelete("{id:long}")]
    public async Task<ActionResult> Delete(long id)
    {
        try
        {
            var deleted = await _service.DeleteAsync(id);
            if (!deleted) return NotFound(new { message = $"Intervención {id} no encontrada." });
            return Ok(new { message = "Intervención eliminada correctamente." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al eliminar intervención War Id={Id}", id);
            return StatusCode(500, new { message = "Error al eliminar la intervención", detail = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/intervenciones-war/stats
    /// Retorna estadísticas para gráficos.
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<IntervencionWarStatsDto>> GetStats()
    {
        try
        {
            var result = await _service.GetStatsAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener estadísticas de intervenciones War");
            return StatusCode(500, new { message = "Error al obtener las estadísticas", detail = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/intervenciones-war/search-databases?q=nombre
    /// Búsqueda de bases de datos para autocompletado.
    /// </summary>
    [HttpGet("search-databases")]
    public async Task<ActionResult<List<string>>> SearchDatabases([FromQuery] string q)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(q) || q.Length < 2)
                return Ok(new List<string>());

            var results = await _service.SearchDatabaseNamesAsync(q, 20);
            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al buscar bases de datos con query={Query}", q);
            return StatusCode(500, new { message = "Error en la búsqueda", detail = ex.Message });
        }
    }

    /// <summary>
    /// Valida los campos obligatorios del request.
    /// </summary>
    private static List<string> ValidateRequest(CreateUpdateIntervencionWarRequest request)
    {
        var errors = new List<string>();
        if (request.DuracionMinutos <= 0)
            errors.Add("La duración debe ser mayor a 0 minutos.");
        if (string.IsNullOrWhiteSpace(request.DbaParticipantes))
            errors.Add("Debe indicar al menos un DBA participante.");
        if (string.IsNullOrWhiteSpace(request.Servidores))
            errors.Add("Debe indicar al menos un servidor.");
        if (string.IsNullOrWhiteSpace(request.BaseDatos))
            errors.Add("Debe indicar al menos una base de datos.");
        if (string.IsNullOrWhiteSpace(request.Referente))
            errors.Add("Debe indicar un referente.");
        return errors;
    }
}

