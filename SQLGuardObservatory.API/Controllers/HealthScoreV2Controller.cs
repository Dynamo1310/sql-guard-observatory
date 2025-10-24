using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Services;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para Health Score V2
    /// Endpoints para sistema de scoring basado en 10 categorías con caps
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/v2/healthscore")]
    public class HealthScoreV2Controller : ControllerBase
    {
        private readonly IHealthScoreV2Service _healthScoreService;
        private readonly ILogger<HealthScoreV2Controller> _logger;

        public HealthScoreV2Controller(
            IHealthScoreV2Service healthScoreService,
            ILogger<HealthScoreV2Controller> logger)
        {
            _healthScoreService = healthScoreService;
            _logger = logger;
        }

        /// <summary>
        /// GET /api/v2/healthscore
        /// Obtiene el Health Score de todas las instancias
        /// </summary>
        [HttpGet]
        [ProducesResponseType(typeof(IEnumerable<HealthScoreV2Dto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<HealthScoreV2Dto>>> GetAllHealthScores()
        {
            try
            {
                var healthScores = await _healthScoreService.GetAllHealthScoresAsync();
                return Ok(healthScores);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health scores V2");
                return StatusCode(500, new { message = "Error al obtener health scores", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/{instance}
        /// Obtiene el detalle completo de una instancia (categorías + tendencias)
        /// </summary>
        [HttpGet("{instance}")]
        [ProducesResponseType(typeof(HealthScoreDetailV2Dto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<HealthScoreDetailV2Dto>> GetHealthScoreDetail(string instance)
        {
            try
            {
                var detail = await _healthScoreService.GetHealthScoreDetailAsync(instance);
                
                if (detail == null)
                    return NotFound(new { message = $"No se encontró la instancia '{instance}'" });

                return Ok(detail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener detalle de health score para {Instance}", instance);
                return StatusCode(500, new { message = "Error al obtener detalle", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/{instance}/categories
        /// Obtiene solo las categorías y sus scores de una instancia
        /// </summary>
        [HttpGet("{instance}/categories")]
        [ProducesResponseType(typeof(IEnumerable<CategoryScoreDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status404NotFound)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<CategoryScoreDto>>> GetCategoryScores(string instance)
        {
            try
            {
                var categories = await _healthScoreService.GetCategoryScoresAsync(instance);
                
                if (!categories.Any())
                    return NotFound(new { message = $"No se encontraron categorías para la instancia '{instance}'" });

                return Ok(categories);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener categorías para {Instance}", instance);
                return StatusCode(500, new { message = "Error al obtener categorías", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/{instance}/trends/24h
        /// Obtiene tendencias de las últimas 24 horas
        /// </summary>
        [HttpGet("{instance}/trends/24h")]
        [ProducesResponseType(typeof(IEnumerable<HealthTrendPointDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<HealthTrendPointDto>>> GetTrends24h(string instance)
        {
            try
            {
                var trends = await _healthScoreService.GetTrends24hAsync(instance);
                return Ok(trends);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener tendencias 24h para {Instance}", instance);
                return StatusCode(500, new { message = "Error al obtener tendencias", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/{instance}/trends/7d
        /// Obtiene tendencias de los últimos 7 días
        /// </summary>
        [HttpGet("{instance}/trends/7d")]
        [ProducesResponseType(typeof(IEnumerable<HealthTrendPointDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<HealthTrendPointDto>>> GetTrends7d(string instance)
        {
            try
            {
                var trends = await _healthScoreService.GetTrends7dAsync(instance);
                return Ok(trends);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener tendencias 7d para {Instance}", instance);
                return StatusCode(500, new { message = "Error al obtener tendencias", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/summary
        /// Obtiene resumen general para el dashboard
        /// </summary>
        [HttpGet("summary")]
        [ProducesResponseType(typeof(HealthScoreSummaryV2Dto), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<HealthScoreSummaryV2Dto>> GetSummary()
        {
            try
            {
                var summary = await _healthScoreService.GetSummaryAsync();
                return Ok(summary);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de health scores V2");
                return StatusCode(500, new { message = "Error al obtener resumen", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/alerts
        /// Obtiene alertas recientes
        /// </summary>
        [HttpGet("alerts")]
        [ProducesResponseType(typeof(IEnumerable<AlertaRecienteDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<AlertaRecienteDto>>> GetAlerts([FromQuery] int top = 10)
        {
            try
            {
                var alerts = await _healthScoreService.GetRecentAlertsAsync(top);
                return Ok(alerts);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener alertas recientes");
                return StatusCode(500, new { message = "Error al obtener alertas", error = ex.Message });
            }
        }

        /// <summary>
        /// GET /api/v2/healthscore/collectors/logs
        /// Obtiene logs de collectors
        /// </summary>
        [HttpGet("collectors/logs")]
        [ProducesResponseType(typeof(IEnumerable<CollectorLogDto>), StatusCodes.Status200OK)]
        [ProducesResponseType(StatusCodes.Status500InternalServerError)]
        public async Task<ActionResult<IEnumerable<CollectorLogDto>>> GetCollectorLogs(
            [FromQuery] string? instance = null,
            [FromQuery] string? level = null,
            [FromQuery] int top = 50)
        {
            try
            {
                var logs = await _healthScoreService.GetCollectorLogsAsync(instance, level, top);
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener logs de collectors");
                return StatusCode(500, new { message = "Error al obtener logs", error = ex.Message });
            }
        }
    }
}

