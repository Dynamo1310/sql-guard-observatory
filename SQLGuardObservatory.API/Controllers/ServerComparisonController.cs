using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para comparar objetos entre instancias SQL Server.
/// Permite detectar duplicados (databases, logins, linked servers, jobs)
/// antes de consolidar servidores en un nuevo entorno.
/// </summary>
[ApiController]
[Route("api/server-comparison")]
[Authorize]
[ViewPermission("ServerComparison")]
public class ServerComparisonController : ControllerBase
{
    private readonly IServerComparisonService _comparisonService;
    private readonly ILogger<ServerComparisonController> _logger;

    public ServerComparisonController(
        IServerComparisonService comparisonService,
        ILogger<ServerComparisonController> logger)
    {
        _comparisonService = comparisonService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene las instancias SQL Server disponibles para comparar.
    /// GET: api/server-comparison/instances
    /// </summary>
    [HttpGet("instances")]
    public async Task<ActionResult<List<ComparisonInstanceDto>>> GetInstances(CancellationToken ct)
    {
        try
        {
            var instances = await _comparisonService.GetAvailableInstancesAsync(ct);
            return Ok(instances);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias para comparación");
            return StatusCode(500, new { message = "Error al obtener instancias: " + ex.Message });
        }
    }

    /// <summary>
    /// Compara objetos entre las instancias seleccionadas.
    /// POST: api/server-comparison/compare
    /// </summary>
    [HttpPost("compare")]
    public async Task<ActionResult<ServerComparisonResponse>> Compare(
        [FromBody] ServerComparisonRequest request,
        CancellationToken ct)
    {
        if (request.InstanceNames == null || request.InstanceNames.Count < 2)
        {
            return BadRequest(new { message = "Debe seleccionar al menos 2 instancias para comparar" });
        }

        if (request.InstanceNames.Count > 10)
        {
            return BadRequest(new { message = "No se pueden comparar más de 10 instancias a la vez" });
        }

        try
        {
            _logger.LogInformation("Usuario solicita comparación de servidores: {Servers}",
                string.Join(", ", request.InstanceNames));

            var result = await _comparisonService.CompareServersAsync(request.InstanceNames, ct);
            return Ok(result);
        }
        catch (OperationCanceledException)
        {
            return StatusCode(499, new { message = "La operación fue cancelada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al comparar servidores");
            return StatusCode(500, new { message = "Error al comparar servidores: " + ex.Message });
        }
    }
}
