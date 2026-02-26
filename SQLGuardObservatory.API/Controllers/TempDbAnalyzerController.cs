using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/tempdb-analyzer")]
[Authorize]
[ViewPermission("TempDbAnalyzer")]
public class TempDbAnalyzerController : ControllerBase
{
    private readonly ITempDbAnalyzerService _analyzerService;
    private readonly ILogger<TempDbAnalyzerController> _logger;

    public TempDbAnalyzerController(
        ITempDbAnalyzerService analyzerService,
        ILogger<TempDbAnalyzerController> logger)
    {
        _analyzerService = analyzerService;
        _logger = logger;
    }

    [HttpGet]
    public async Task<ActionResult<TempDbAnalysisResponse>> GetCachedResults(CancellationToken ct)
    {
        try
        {
            var results = await _analyzerService.GetCachedResultsAsync(ct);
            return Ok(results);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resultados cacheados de TempDB Analyzer");
            return StatusCode(500, new { message = "Error al obtener resultados: " + ex.Message });
        }
    }

    [HttpPost("analyze-all")]
    public async Task<ActionResult<TempDbAnalysisResponse>> AnalyzeAll(CancellationToken ct)
    {
        try
        {
            _logger.LogInformation("Iniciando análisis TempDB en todas las instancias");
            var results = await _analyzerService.AnalyzeAllInstancesAsync(ct);
            return Ok(results);
        }
        catch (OperationCanceledException)
        {
            return StatusCode(499, new { message = "La operación fue cancelada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al ejecutar análisis TempDB en todas las instancias");
            return StatusCode(500, new { message = "Error al analizar: " + ex.Message });
        }
    }

    [HttpPost("analyze/{instanceName}")]
    public async Task<ActionResult<TempDbCheckResultDto>> AnalyzeInstance(
        string instanceName, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(instanceName))
            return BadRequest(new { message = "Debe especificar el nombre de la instancia" });

        try
        {
            var result = await _analyzerService.AnalyzeInstanceAsync(instanceName, ct);
            return Ok(result);
        }
        catch (OperationCanceledException)
        {
            return StatusCode(499, new { message = "La operación fue cancelada" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al analizar TempDB en {Instance}", instanceName);
            return StatusCode(500, new { message = $"Error al analizar {instanceName}: " + ex.Message });
        }
    }
}
