using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers
{
    [Authorize]
    [ViewPermission("HealthScore")]
    [ApiController]
    [Route("api/[controller]")]
    public class HealthScoreController : ControllerBase
    {
        private readonly IHealthScoreService _healthScoreService;
        private readonly ILogger<HealthScoreController> _logger;

        public HealthScoreController(
            IHealthScoreService healthScoreService,
            ILogger<HealthScoreController> logger)
        {
            _healthScoreService = healthScoreService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<HealthScoreDto>>> GetHealthScores()
        {
            try
            {
                var healthScores = await _healthScoreService.GetLatestHealthScoresAsync();
                return Ok(healthScores);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health scores");
                return StatusCode(500, new { message = "Error al obtener health scores" });
            }
        }

        [HttpGet("summary")]
        public async Task<ActionResult<HealthScoreSummaryDto>> GetSummary()
        {
            try
            {
                var summary = await _healthScoreService.GetSummaryAsync();
                return Ok(summary);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de health scores");
                return StatusCode(500, new { message = "Error al obtener resumen" });
            }
        }

        [HttpGet("overview")]
        public async Task<ActionResult<OverviewDataDto>> GetOverviewData()
        {
            try
            {
                var overviewData = await _healthScoreService.GetOverviewDataAsync();
                return Ok(overviewData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener datos del overview");
                return StatusCode(500, new { message = "Error al obtener datos del overview" });
            }
        }
    }
}

