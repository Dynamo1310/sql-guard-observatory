using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.HealthScoreV3;

namespace SQLGuardObservatory.API.Controllers;

[Authorize]
[ApiController]
[Route("api/healthscore/v3")]
public class HealthScoreV3Controller : ControllerBase
{
    private readonly SQLNovaDbContext _context;
    private readonly ILogger<HealthScoreV3Controller> _logger;

    public HealthScoreV3Controller(
        SQLNovaDbContext context,
        ILogger<HealthScoreV3Controller> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Score General

    /// <summary>
    /// Obtiene el último Health Score para todas las instancias
    /// </summary>
    [HttpGet("scores/latest")]
    public async Task<ActionResult> GetLatestScores()
    {
        try
        {
            var latestScores = await _context.InstanceHealthScores
                .GroupBy(x => x.InstanceName)
                .Select(g => g.OrderByDescending(x => x.CollectedAtUtc).FirstOrDefault())
                .Where(x => x != null)
                .OrderBy(x => x.HealthScore)
                .ToListAsync();

            return Ok(latestScores);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener últimos scores");
            return StatusCode(500, new { message = "Error al obtener scores" });
        }
    }

    /// <summary>
    /// Obtiene el Health Score de una instancia específica
    /// </summary>
    [HttpGet("scores/{instanceName}")]
    public async Task<ActionResult> GetScoreByInstance(string instanceName)
    {
        try
        {
            var score = await _context.InstanceHealthScores
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            if (score == null)
                return NotFound(new { message = "Instancia no encontrada" });

            return Ok(score);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener score de instancia {Instance}", instanceName);
            return StatusCode(500, new { message = "Error al obtener score" });
        }
    }

    /// <summary>
    /// Obtiene el historial de Health Score de una instancia
    /// </summary>
    [HttpGet("scores/{instanceName}/history")]
    public async Task<ActionResult> GetScoreHistory(
        string instanceName,
        [FromQuery] int hours = 24)
    {
        try
        {
            var since = DateTime.UtcNow.AddHours(-hours);

            var history = await _context.InstanceHealthScores
                .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= since)
                .OrderBy(x => x.CollectedAtUtc)
                .ToListAsync();

            return Ok(history);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener historial de {Instance}", instanceName);
            return StatusCode(500, new { message = "Error al obtener historial" });
        }
    }

    /// <summary>
    /// Obtiene resumen agregado por ambiente
    /// </summary>
    [HttpGet("scores/summary")]
    public async Task<ActionResult> GetSummary()
    {
        try
        {
            var latestScores = await _context.InstanceHealthScores
                .GroupBy(x => x.InstanceName)
                .Select(g => g.OrderByDescending(x => x.CollectedAtUtc).FirstOrDefault())
                .Where(x => x != null)
                .ToListAsync();

            var summary = latestScores
                .GroupBy(x => x.Ambiente)
                .Select(g => new
                {
                    Ambiente = g.Key,
                    TotalInstances = g.Count(),
                    AvgHealthScore = Math.Round(g.Average(x => x.HealthScore), 2),
                    OptimoCount = g.Count(x => x.HealthScore >= 85),
                    AdvertenciaCount = g.Count(x => x.HealthScore >= 75 && x.HealthScore < 85),
                    RiesgoCount = g.Count(x => x.HealthScore >= 65 && x.HealthScore < 75),
                    CriticoCount = g.Count(x => x.HealthScore < 65)
                })
                .ToList();

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener resumen");
            return StatusCode(500, new { message = "Error al obtener resumen" });
        }
    }

    #endregion

    #region Categorías Individuales

    /// <summary>
    /// Obtiene métricas de Conectividad para una instancia
    /// </summary>
    [HttpGet("{instanceName}/conectividad")]
    public async Task<ActionResult> GetConectividad(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthConectividad
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener conectividad");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de AlwaysOn para una instancia
    /// </summary>
    [HttpGet("{instanceName}/alwayson")]
    public async Task<ActionResult> GetAlwaysOn(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthAlwaysOn
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener AlwaysOn");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de Errores Críticos para una instancia
    /// </summary>
    [HttpGet("{instanceName}/errores")]
    public async Task<ActionResult> GetErroresCriticos(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthErroresCriticos
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener errores críticos");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de CPU para una instancia
    /// </summary>
    [HttpGet("{instanceName}/cpu")]
    public async Task<ActionResult> GetCPU(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthCPU
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener CPU");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de IO para una instancia
    /// </summary>
    [HttpGet("{instanceName}/io")]
    public async Task<ActionResult> GetIO(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthIO
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener IO");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de Discos para una instancia
    /// </summary>
    [HttpGet("{instanceName}/discos")]
    public async Task<ActionResult> GetDiscos(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthDiscos
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener discos");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de Memoria para una instancia
    /// </summary>
    [HttpGet("{instanceName}/memoria")]
    public async Task<ActionResult> GetMemoria(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthMemoria
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener memoria");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene métricas de Configuración & TempDB para una instancia
    /// </summary>
    [HttpGet("{instanceName}/configuracion")]
    public async Task<ActionResult> GetConfiguracionTempdb(
        string instanceName,
        [FromQuery] int limit = 10)
    {
        try
        {
            var data = await _context.InstanceHealthConfiguracionTempdb
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .Take(limit)
                .ToListAsync();

            return Ok(data);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener configuración/tempdb");
            return StatusCode(500, new { message = "Error al obtener datos" });
        }
    }

    /// <summary>
    /// Obtiene vista completa detallada de una instancia (todas las categorías)
    /// </summary>
    [HttpGet("{instanceName}/complete")]
    public async Task<ActionResult> GetCompleteView(string instanceName)
    {
        try
        {
            var score = await _context.InstanceHealthScores
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            if (score == null)
                return NotFound(new { message = "Instancia no encontrada" });

            var conectividad = await _context.InstanceHealthConectividad
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var alwaysOn = await _context.InstanceHealthAlwaysOn
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var errores = await _context.InstanceHealthErroresCriticos
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var cpu = await _context.InstanceHealthCPU
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var io = await _context.InstanceHealthIO
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var discos = await _context.InstanceHealthDiscos
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var memoria = await _context.InstanceHealthMemoria
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var config = await _context.InstanceHealthConfiguracionTempdb
                .Where(x => x.InstanceName == instanceName)
                .OrderByDescending(x => x.CollectedAtUtc)
                .FirstOrDefaultAsync();

            var result = new
            {
                InstanceName = instanceName,
                Score = score,
                Conectividad = conectividad,
                AlwaysOn = alwaysOn,
                ErroresCriticos = errores,
                CPU = cpu,
                IO = io,
                Discos = discos,
                Memoria = memoria,
                ConfiguracionTempdb = config
            };

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener vista completa de {Instance}", instanceName);
            return StatusCode(500, new { message = "Error al obtener datos completos" });
        }
    }

    #endregion
}

