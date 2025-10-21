using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "WhitelistOnly")]
public class JobsController : ControllerBase
{
    private readonly IJobsService _jobsService;
    private readonly ILogger<JobsController> _logger;

    public JobsController(IJobsService jobsService, ILogger<JobsController> logger)
    {
        _jobsService = jobsService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene la lista de jobs con filtros opcionales
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetJobs(
        [FromQuery] string? ambiente = null, 
        [FromQuery] string? hosting = null,
        [FromQuery] string? instance = null)
    {
        try
        {
            var jobs = await _jobsService.GetJobsAsync(ambiente, hosting, instance);
            return Ok(jobs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener jobs");
            return StatusCode(500, new { message = "Error al obtener los jobs" });
        }
    }

    /// <summary>
    /// Obtiene el resumen de jobs (KPIs) con filtros opcionales
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetJobsSummary(
        [FromQuery] string? ambiente = null,
        [FromQuery] string? hosting = null,
        [FromQuery] string? instance = null)
    {
        try
        {
            var summary = await _jobsService.GetJobsSummaryAsync(ambiente, hosting, instance);
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de jobs");
            return StatusCode(500, new { message = "Error al obtener el resumen de jobs" });
        }
    }

    /// <summary>
    /// Obtiene los valores disponibles para los filtros
    /// </summary>
    [HttpGet("filters")]
    public async Task<IActionResult> GetFilters()
    {
        try
        {
            var filters = await _jobsService.GetAvailableFiltersAsync();
            return Ok(filters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener filtros");
            return StatusCode(500, new { message = "Error al obtener los filtros" });
        }
    }
}
