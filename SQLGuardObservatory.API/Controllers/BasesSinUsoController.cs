using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para Racionalización SQL (ex Bases sin Uso).
/// GET lee de tabla cache pre-calculada (RacionalizacionSQLCache).
/// PUT usa EF Core para escritura + refresco automático del cache.
/// </summary>
[ApiController]
[Route("api/bases-sin-uso")]
[Authorize]
[ViewPermission("BasesSinUso")]
public class BasesSinUsoController : ControllerBase
{
    private readonly IBasesSinUsoService _service;
    private readonly ILogger<BasesSinUsoController> _logger;

    public BasesSinUsoController(
        IBasesSinUsoService service,
        ILogger<BasesSinUsoController> logger)
    {
        _service = service;
        _logger = logger;
    }

    /// <summary>
    /// GET /api/bases-sin-uso
    /// Retorna la unión de SqlServerDatabasesCache + GestionBasesSinUso con resumen KPI.
    /// </summary>
    /// <param name="serverName">Filtro opcional por nombre de servidor</param>
    /// <param name="ambiente">Filtro opcional por ambiente</param>
    [HttpGet]
    public async Task<ActionResult<BasesSinUsoGridResponse>> GetAll(
        [FromQuery] string? serverName,
        [FromQuery] string? ambiente)
    {
        try
        {
            var result = await _service.GetAllAsync(serverName, ambiente);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener la grilla de Bases sin Uso");
            return StatusCode(500, new { message = "Error al obtener los datos de Bases sin Uso", detail = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/bases-sin-uso/{id}
    /// Actualiza los campos de gestión de un registro existente.
    /// </summary>
    [HttpPut("{id:long}")]
    public async Task<ActionResult<BasesSinUsoGridDto>> Update(long id, [FromBody] UpdateBasesSinUsoRequest request)
    {
        try
        {
            var result = await _service.UpdateAsync(id, request);
            if (result == null)
            {
                return NotFound(new { message = $"No se encontró el registro de gestión con Id {id}." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar Bases sin Uso Id={Id}", id);
            return StatusCode(500, new { message = "Error al actualizar el registro", detail = ex.Message });
        }
    }

    /// <summary>
    /// PUT /api/bases-sin-uso/upsert
    /// Crea o actualiza el estado de gestión por ServerName + DbName.
    /// </summary>
    [HttpPut("upsert")]
    public async Task<ActionResult<BasesSinUsoGridDto>> Upsert([FromBody] UpdateBasesSinUsoRequest request)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(request.ServerName) || string.IsNullOrWhiteSpace(request.DbName))
            {
                return BadRequest(new { message = "ServerName y DbName son obligatorios." });
            }

            var result = await _service.UpsertAsync(request);
            if (result == null)
            {
                return StatusCode(500, new { message = "Error al procesar la solicitud de upsert." });
            }

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error en upsert Bases sin Uso Server={Server}, DB={DB}",
                request.ServerName, request.DbName);
            return StatusCode(500, new { message = "Error al procesar el registro", detail = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/bases-sin-uso/dbas
    /// Retorna la lista de DBAs disponibles del grupo IDD (General).
    /// </summary>
    [HttpGet("dbas")]
    public async Task<ActionResult<List<BasesSinUsoDbaDto>>> GetAvailableDbas()
    {
        try
        {
            var result = await _service.GetAvailableDbas();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener DBAs disponibles");
            return StatusCode(500, new { message = "Error al obtener los DBAs disponibles", detail = ex.Message });
        }
    }

    /// <summary>
    /// GET /api/bases-sin-uso/stats
    /// Retorna estadísticas para gráficos del proyecto Racionalización SQL.
    /// </summary>
    [HttpGet("stats")]
    public async Task<ActionResult<BasesSinUsoStatsDto>> GetStats()
    {
        try
        {
            var result = await _service.GetStatsAsync();
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener estadísticas de Racionalización SQL");
            return StatusCode(500, new { message = "Error al obtener las estadísticas", detail = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/bases-sin-uso/refresh-cache
    /// Fuerza el refresco completo de la tabla de cache pre-calculada.
    /// Útil cuando se modifican datos fuera de la app (SQL manual, inventario, etc.)
    /// </summary>
    [HttpPost("refresh-cache")]
    public async Task<ActionResult> RefreshCache()
    {
        try
        {
            var (totalRows, refreshedAt) = await _service.RefreshCacheAsync();
            return Ok(new
            {
                message = $"Cache refrescado exitosamente: {totalRows} registros.",
                totalRows,
                refreshedAt
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al refrescar cache de Racionalización SQL");
            return StatusCode(500, new { message = "Error al refrescar el cache", detail = ex.Message });
        }
    }
}
