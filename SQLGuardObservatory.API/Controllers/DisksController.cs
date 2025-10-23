using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "WhitelistOnly")]
public class DisksController : ControllerBase
{
    private readonly IDisksService _disksService;
    private readonly ILogger<DisksController> _logger;

    public DisksController(IDisksService disksService, ILogger<DisksController> logger)
    {
        _disksService = disksService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene la lista de discos con filtros opcionales
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetDisks(
        [FromQuery] string? ambiente = null,
        [FromQuery] string? hosting = null,
        [FromQuery] string? instance = null,
        [FromQuery] string? estado = null)
    {
        try
        {
            var disks = await _disksService.GetDisksAsync(ambiente, hosting, instance, estado);
            return Ok(disks);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener discos");
            return StatusCode(500, new { message = "Error al obtener los discos" });
        }
    }

    /// <summary>
    /// Obtiene el resumen de discos (KPIs) con filtros opcionales
    /// </summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetDisksSummary(
        [FromQuery] string? ambiente = null,
        [FromQuery] string? hosting = null,
        [FromQuery] string? instance = null,
        [FromQuery] string? estado = null)
    {
        try
        {
            var summary = await _disksService.GetDisksSummaryAsync(ambiente, hosting, instance, estado);
            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen de discos");
            return StatusCode(500, new { message = "Error al obtener el resumen de discos" });
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
            var filters = await _disksService.GetAvailableFiltersAsync();
            return Ok(filters);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener filtros");
            return StatusCode(500, new { message = "Error al obtener los filtros" });
        }
    }
}

