using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/migration-simulator")]
[Authorize]
[ViewPermission("MigrationSimulator")]
public class MigrationSimulatorController : ControllerBase
{
    private readonly IMigrationSimulatorService _simulatorService;
    private readonly ILogger<MigrationSimulatorController> _logger;

    public MigrationSimulatorController(
        IMigrationSimulatorService simulatorService,
        ILogger<MigrationSimulatorController> logger)
    {
        _simulatorService = simulatorService;
        _logger = logger;
    }

    [HttpGet("instances")]
    public async Task<ActionResult<List<ComparisonInstanceDto>>> GetInstances(CancellationToken ct)
    {
        try
        {
            var instances = await _simulatorService.GetAvailableInstancesAsync(ct);
            return Ok(instances);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias para simulador de migración");
            return StatusCode(500, new { message = "Error al obtener instancias: " + ex.Message });
        }
    }

    [HttpPost("sources")]
    public async Task<ActionResult<MigrationSourceResponse>> GetSourceDatabases(
        [FromBody] MigrationSourceRequest request,
        CancellationToken ct)
    {
        if (request.InstanceNames == null || request.InstanceNames.Count == 0)
            return BadRequest(new { message = "Debe seleccionar al menos una instancia origen" });

        if (request.InstanceNames.Count > 10)
            return BadRequest(new { message = "No se pueden consultar más de 10 instancias a la vez" });

        try
        {
            var result = await _simulatorService.GetSourceDatabasesAsync(request.InstanceNames, ct);
            return Ok(result);
        }
        catch (OperationCanceledException)
        {
            return StatusCode(499, new { message = "La operación fue cancelada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener databases de servidores origen");
            return StatusCode(500, new { message = "Error al obtener databases: " + ex.Message });
        }
    }

    [HttpGet("naming-suggestion")]
    public async Task<ActionResult<NamingSuggestionResponse>> GetNamingSuggestion(
        [FromQuery] string targetVersion,
        [FromQuery] string environment,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(targetVersion))
            return BadRequest(new { message = "Debe especificar la versión destino" });

        if (string.IsNullOrWhiteSpace(environment))
            return BadRequest(new { message = "Debe especificar el entorno (DS, TS, PR)" });

        try
        {
            var result = await _simulatorService.GetNamingSuggestionAsync(targetVersion, environment, ct);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener sugerencia de naming para {Version}/{Env}", targetVersion, environment);
            return StatusCode(500, new { message = "Error al obtener sugerencia de naming: " + ex.Message });
        }
    }
}
