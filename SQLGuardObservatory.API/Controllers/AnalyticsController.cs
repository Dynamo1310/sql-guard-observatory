using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;
using System.Security.Claims;

namespace SQLGuardObservatory.API.Controllers;

[Authorize]
[ApiController]
[Route("api/analytics")]
public class AnalyticsController : ControllerBase
{
    private readonly IAnalyticsService _analyticsService;
    private readonly ILogger<AnalyticsController> _logger;

    public AnalyticsController(IAnalyticsService analyticsService, ILogger<AnalyticsController> logger)
    {
        _analyticsService = analyticsService;
        _logger = logger;
    }

    /// <summary>
    /// Ingesta batch de eventos de telemetría (max 50 por request).
    /// Cualquier usuario autenticado puede enviar eventos.
    /// </summary>
    [HttpPost("events")]
    public async Task<IActionResult> IngestEvents([FromBody] AnalyticsIngestRequest request)
    {
        try
        {
            if (request.Events == null || request.Events.Count == 0)
                return BadRequest(new { error = "No events provided" });

            if (request.Events.Count > 50)
                return BadRequest(new { error = "Maximum 50 events per request" });

            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "unknown";
            await _analyticsService.IngestEventsAsync(request.Events, userId, request.SessionId);

            return Ok(new { received = request.Events.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error ingesting analytics events");
            return StatusCode(500, new { error = "Error processing analytics events" });
        }
    }

    /// <summary>
    /// DAU/WAU/MAU, sesiones, top rutas y acciones.
    /// </summary>
    [HttpGet("overview")]
    [RequireCapability("System.ViewAnalytics")]
    public async Task<ActionResult<AnalyticsOverviewDto>> GetOverview(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        try
        {
            var range = GetDateRange(from, to);
            var data = await _analyticsService.GetOverviewAsync(range.from, range.to);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting analytics overview");
            return StatusCode(500, new { error = "Error getting analytics overview" });
        }
    }

    /// <summary>
    /// Top errores, empty states, screens lentas, endpoints lentos.
    /// </summary>
    [HttpGet("friction")]
    [RequireCapability("System.ViewAnalytics")]
    public async Task<ActionResult<AnalyticsFrictionDto>> GetFriction(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        try
        {
            var range = GetDateRange(from, to);
            var data = await _analyticsService.GetFrictionAsync(range.from, range.to);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting friction report");
            return StatusCode(500, new { error = "Error getting friction report" });
        }
    }

    /// <summary>
    /// Funnels y paths comunes de navegación.
    /// </summary>
    [HttpGet("journeys")]
    [RequireCapability("System.ViewAnalytics")]
    public async Task<ActionResult<AnalyticsJourneysDto>> GetJourneys(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        try
        {
            var range = GetDateRange(from, to);
            var data = await _analyticsService.GetJourneysAsync(range.from, range.to);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting journeys");
            return StatusCode(500, new { error = "Error getting user journeys" });
        }
    }

    /// <summary>
    /// Heatmap de uso por día de la semana y hora.
    /// </summary>
    [HttpGet("heatmap")]
    [RequireCapability("System.ViewAnalytics")]
    public async Task<ActionResult<AnalyticsHeatmapDto>> GetHeatmap(
        [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        try
        {
            var range = GetDateRange(from, to);
            var data = await _analyticsService.GetHeatmapAsync(range.from, range.to);
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting heatmap");
            return StatusCode(500, new { error = "Error getting heatmap" });
        }
    }

    /// <summary>
    /// Detalle de un usuario específico.
    /// </summary>
    [HttpGet("user/{userId}")]
    [RequireCapability("System.ViewAnalytics")]
    public async Task<ActionResult<AnalyticsUserDetailDto>> GetUserDetail(
        string userId, [FromQuery] DateTime? from, [FromQuery] DateTime? to)
    {
        try
        {
            var range = GetDateRange(from, to);
            var data = await _analyticsService.GetUserDetailAsync(userId, range.from, range.to);
            if (data == null)
                return NotFound(new { error = "No analytics data for this user" });
            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting user detail for {UserId}", userId);
            return StatusCode(500, new { error = "Error getting user detail" });
        }
    }

    private static (DateTime from, DateTime to) GetDateRange(DateTime? from, DateTime? to)
    {
        var toDate = to ?? DateTime.UtcNow;
        var fromDate = from ?? toDate.AddDays(-30);
        return (fromDate, toDate);
    }
}
