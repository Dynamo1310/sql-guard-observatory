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
    /// Obtiene la lista de jobs
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetJobs([FromQuery] string? ambiente = null, [FromQuery] string? hosting = null)
    {
        try
        {
            var jobs = await _jobsService.GetJobsAsync(ambiente, hosting);
            return Ok(jobs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener jobs");
            return StatusCode(500, new { message = "Error al obtener los jobs" });
        }
    }

    /// <summary>
    /// Obtiene el resumen de jobs (KPIs)
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetJobsSummary()
    {
        try
        {
            var summary = await _jobsService.GetJobsSummaryAsync();
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de jobs");
            return StatusCode(500, new { message = "Error al obtener el resumen de jobs" });
        }
    }

    /// <summary>
    /// Obtiene los jobs fallidos recientes
    /// </summary>
    [HttpGet("failed")]
    public async Task<IActionResult> GetFailedJobs([FromQuery] int limit = 5)
    {
        try
        {
            var jobs = await _jobsService.GetFailedJobsAsync(limit);
            return Ok(jobs);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener jobs fallidos");
            return StatusCode(500, new { message = "Error al obtener los jobs fallidos" });
        }
    }
}

