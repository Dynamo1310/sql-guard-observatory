using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller optimizado para la página Overview.
/// Proporciona todos los datos necesarios en una sola llamada API.
/// </summary>
[Authorize]
[ViewPermission("HealthScore")]
[ApiController]
[Route("api/overview-data")]
public class OverviewController : ControllerBase
{
    private readonly IOverviewService _overviewService;
    private readonly ILogger<OverviewController> _logger;

    public OverviewController(IOverviewService overviewService, ILogger<OverviewController> logger)
    {
        _overviewService = overviewService;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todos los datos necesarios para la página Overview en una sola llamada.
    /// Incluye: KPIs, instancias críticas, backups atrasados, discos críticos y mantenimiento vencido.
    /// Solo incluye datos de PRODUCCIÓN.
    /// GET: api/overview-data
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<OverviewPageDataDto>> GetOverviewData()
    {
        try
        {
            var data = await _overviewService.GetOverviewDataAsync();
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener datos del Overview");
            return StatusCode(500, new { error = "Error al obtener datos del Overview" });
        }
    }
}
