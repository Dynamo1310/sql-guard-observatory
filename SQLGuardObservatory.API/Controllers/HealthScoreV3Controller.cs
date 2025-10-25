using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.HealthScoreV3;

namespace SQLGuardObservatory.API.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/v3/healthscore")]
    public class HealthScoreV3Controller : ControllerBase
    {
        private readonly SQLNovaDbContext _context;
        private readonly ILogger<HealthScoreV3Controller> _logger;

        public HealthScoreV3Controller(SQLNovaDbContext context, ILogger<HealthScoreV3Controller> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene el último Health Score v3.0 de todas las instancias
        /// GET: api/v3/healthscore
        /// </summary>
        [HttpGet]
        public async Task<ActionResult<IEnumerable<HealthScoreV3Dto>>> GetAllHealthScores()
        {
            try
            {
                // Obtener el último score por instancia usando window function
                var query = @"
                    WITH RankedScores AS (
                        SELECT 
                            InstanceName,
                            Ambiente,
                            HostingSite,
                            SqlVersion,
                            CollectedAtUtc,
                            HealthScore,
                            HealthStatus,
                            BackupsScore,
                            AlwaysOnScore,
                            ConectividadScore,
                            ErroresCriticosScore,
                            CPUScore,
                            IOScore,
                            DiscosScore,
                            MemoriaScore,
                            MantenimientosScore,
                            ConfiguracionTempdbScore,
                            BackupsContribution,
                            AlwaysOnContribution,
                            ConectividadContribution,
                            ErroresCriticosContribution,
                            CPUContribution,
                            IOContribution,
                            DiscosContribution,
                            MemoriaContribution,
                            MantenimientosContribution,
                            ConfiguracionTempdbContribution,
                            GlobalCap,
                            ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                        FROM dbo.InstanceHealth_Score
                    )
                    SELECT 
                        InstanceName,
                        Ambiente,
                        HostingSite,
                        SqlVersion,
                        CollectedAtUtc AS GeneratedAtUtc,
                        HealthScore,
                        HealthStatus,
                        BackupsScore AS Score_Backups,
                        AlwaysOnScore AS Score_AlwaysOn,
                        ConectividadScore AS Score_Conectividad,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        CPUScore AS Score_CPU,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        MemoriaScore AS Score_Memoria,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb,
                        BackupsContribution AS BackupsContribution,
                        AlwaysOnContribution AS AlwaysOnContribution,
                        ConectividadContribution AS ConectividadContribution,
                        ErroresCriticosContribution AS ErroresCriticosContribution,
                        CPUContribution AS CPUContribution,
                        IOContribution AS IOContribution,
                        DiscosContribution AS DiscosContribution,
                        MemoriaContribution AS MemoriaContribution,
                        MantenimientosContribution AS MantenimientosContribution,
                        ConfiguracionTempdbContribution AS ConfiguracionTempdbContribution
                    FROM RankedScores
                    WHERE rn = 1
                    ORDER BY HealthScore ASC, InstanceName;
                ";

                var scores = await _context.Database
                    .SqlQueryRaw<HealthScoreV3Dto>(query)
                    .ToListAsync();

                return Ok(scores);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health scores v3");
                return StatusCode(500, new { error = "Error al obtener health scores" });
            }
        }

        /// <summary>
        /// Obtiene el Health Score v3.0 de una instancia específica
        /// GET: api/v3/healthscore/{instanceName}
        /// </summary>
        [HttpGet("{instanceName}")]
        public async Task<ActionResult<HealthScoreV3Dto>> GetHealthScoreDetail(string instanceName)
        {
            try
            {
                var query = @"
                    SELECT TOP 1
                        InstanceName,
                        Ambiente,
                        HostingSite,
                        SqlVersion,
                        CollectedAtUtc AS GeneratedAtUtc,
                        HealthScore,
                        HealthStatus,
                        BackupsScore AS Score_Backups,
                        AlwaysOnScore AS Score_AlwaysOn,
                        ConectividadScore AS Score_Conectividad,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        CPUScore AS Score_CPU,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        MemoriaScore AS Score_Memoria,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb
                    FROM dbo.InstanceHealth_Score
                    WHERE InstanceName = {0}
                    ORDER BY CollectedAtUtc DESC;
                ";

                var score = await _context.Database
                    .SqlQueryRaw<HealthScoreV3Dto>(query, instanceName)
                    .FirstOrDefaultAsync();

                if (score == null)
                {
                    return NotFound(new { error = $"No se encontró health score para la instancia {instanceName}" });
                }

                return Ok(score);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health score para {InstanceName}", instanceName);
                return StatusCode(500, new { error = "Error al obtener health score" });
            }
        }

        /// <summary>
        /// Obtiene resumen estadístico de Health Scores v3.0
        /// GET: api/v3/healthscore/summary
        /// </summary>
        [HttpGet("summary")]
        public async Task<ActionResult<HealthScoreV3SummaryDto>> GetSummary()
        {
            try
            {
                var query = @"
                    WITH LatestScores AS (
                        SELECT 
                            InstanceName,
                            HealthScore,
                            HealthStatus,
                            CollectedAtUtc,
                            ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                        FROM dbo.InstanceHealth_Score
                    )
                    SELECT 
                        COUNT(*) AS TotalInstances,
                        SUM(CASE WHEN HealthStatus = 'Healthy' THEN 1 ELSE 0 END) AS HealthyCount,
                        SUM(CASE WHEN HealthStatus = 'Warning' THEN 1 ELSE 0 END) AS WarningCount,
                        SUM(CASE WHEN HealthStatus = 'Risk' THEN 1 ELSE 0 END) AS RiskCount,
                        SUM(CASE WHEN HealthStatus = 'Critical' THEN 1 ELSE 0 END) AS CriticalCount,
                        AVG(CAST(HealthScore AS FLOAT)) AS AvgScore,
                        MAX(CollectedAtUtc) AS LastUpdate
                    FROM LatestScores
                    WHERE rn = 1;
                ";

                var summary = await _context.Database
                    .SqlQueryRaw<HealthScoreV3SummaryDto>(query)
                    .FirstOrDefaultAsync();

                if (summary == null)
                {
                    return Ok(new HealthScoreV3SummaryDto
                    {
                        TotalInstances = 0,
                        HealthyCount = 0,
                        WarningCount = 0,
                        RiskCount = 0,
                        CriticalCount = 0,
                        AvgScore = 0,
                        LastUpdate = null
                    });
                }

                return Ok(summary);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de health scores v3");
                return StatusCode(500, new { error = "Error al obtener resumen" });
            }
        }

        /// <summary>
        /// Obtiene el historial de Health Score de una instancia
        /// GET: api/v3/healthscore/{instanceName}/history?hours=24
        /// </summary>
        [HttpGet("{instanceName}/history")]
        public async Task<ActionResult<IEnumerable<HealthScoreHistoryDto>>> GetHistory(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                var cutoffDate = DateTime.UtcNow.AddHours(-hours);

                var query = @"
                    SELECT 
                        CollectedAtUtc AS Timestamp,
                        HealthScore,
                        HealthStatus
                    FROM dbo.InstanceHealth_Score
                    WHERE InstanceName = {0}
                        AND CollectedAtUtc >= {1}
                    ORDER BY CollectedAtUtc ASC;
                ";

                var history = await _context.Database
                    .SqlQueryRaw<HealthScoreHistoryDto>(query, instanceName, cutoffDate)
                    .ToListAsync();

                return Ok(history);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener historial para {InstanceName}", instanceName);
                return StatusCode(500, new { error = "Error al obtener historial" });
            }
        }

        /// <summary>
        /// Obtiene todos los detalles de health score y sus métricas subyacentes
        /// GET: api/v3/healthscore/{instanceName}/details
        /// </summary>
        [HttpGet("{instanceName}/details")]
        public async Task<ActionResult<HealthScoreV3DetailDto>> GetHealthScoreDetails(string instanceName)
        {
            try
            {
                // Query para obtener el score principal
                var scoreQuery = @"
                    SELECT TOP 1
                        InstanceName,
                        Ambiente,
                        HostingSite,
                        SqlVersion,
                        CollectedAtUtc AS GeneratedAtUtc,
                        HealthScore,
                        HealthStatus,
                        BackupsScore AS Score_Backups,
                        AlwaysOnScore AS Score_AlwaysOn,
                        ConectividadScore AS Score_Conectividad,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        CPUScore AS Score_CPU,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        MemoriaScore AS Score_Memoria,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb,
                        BackupsContribution,
                        AlwaysOnContribution,
                        ConectividadContribution,
                        ErroresCriticosContribution,
                        CPUContribution,
                        IOContribution,
                        DiscosContribution,
                        MemoriaContribution,
                        MantenimientosContribution,
                        ConfiguracionTempdbContribution
                    FROM dbo.InstanceHealth_Score
                    WHERE InstanceName = {0}
                    ORDER BY CollectedAtUtc DESC";

                var score = await _context.Database
                    .SqlQueryRaw<HealthScoreV3Dto>(scoreQuery, instanceName)
                    .FirstOrDefaultAsync();

                if (score == null)
                {
                    return NotFound(new { error = $"No se encontró health score para la instancia {instanceName}" });
                }

                // Obtener detalles de cada categoría
                var details = new HealthScoreV3DetailDto
                {
                    InstanceName = score.InstanceName,
                    Ambiente = score.Ambiente,
                    HostingSite = score.HostingSite,
                    SqlVersion = score.SqlVersion,
                    GeneratedAtUtc = score.GeneratedAtUtc,
                    HealthScore = score.HealthScore,
                    HealthStatus = score.HealthStatus,
                    Score_Backups = score.Score_Backups,
                    Score_AlwaysOn = score.Score_AlwaysOn,
                    Score_Conectividad = score.Score_Conectividad,
                    Score_ErroresCriticos = score.Score_ErroresCriticos,
                    Score_CPU = score.Score_CPU,
                    Score_IO = score.Score_IO,
                    Score_Discos = score.Score_Discos,
                    Score_Memoria = score.Score_Memoria,
                    Score_Maintenance = score.Score_Maintenance,
                    Score_ConfiguracionTempdb = score.Score_ConfiguracionTempdb,
                    BackupsContribution = score.BackupsContribution,
                    AlwaysOnContribution = score.AlwaysOnContribution,
                    ConectividadContribution = score.ConectividadContribution,
                    ErroresCriticosContribution = score.ErroresCriticosContribution,
                    CPUContribution = score.CPUContribution,
                    IOContribution = score.IOContribution,
                    DiscosContribution = score.DiscosContribution,
                    MemoriaContribution = score.MemoriaContribution,
                    MantenimientosContribution = score.MantenimientosContribution,
                    ConfiguracionTempdbContribution = score.ConfiguracionTempdbContribution
                };

                // Backups
                var backupsQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Backups WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.BackupsDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthBackups>(backupsQuery, instanceName)
                    .FirstOrDefaultAsync();

                // AlwaysOn
                var alwaysOnQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_AlwaysOn WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.AlwaysOnDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthAlwaysOn>(alwaysOnQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Conectividad
                var conectividadQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Conectividad WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.ConectividadDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthConectividad>(conectividadQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Errores Críticos
                var erroresQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_ErroresCriticos WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.ErroresCriticosDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthErroresCriticos>(erroresQuery, instanceName)
                    .FirstOrDefaultAsync();

                // CPU
                var cpuQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_CPU WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.CPUDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthCPU>(cpuQuery, instanceName)
                    .FirstOrDefaultAsync();

                // IO
                var ioQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_IO WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.IODetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthIO>(ioQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Discos
                var discosQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Discos WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.DiscosDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthDiscos>(discosQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Memoria
                var memoriaQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Memoria WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.MemoriaDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthMemoria>(memoriaQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Maintenance
                var maintenanceQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Maintenance WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.MaintenanceDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthMaintenance>(maintenanceQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Configuracion & TempDB
                var configQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_ConfiguracionTempdb WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.ConfiguracionTempdbDetails = await _context.Database
                    .SqlQueryRaw<Models.HealthScoreV3.InstanceHealthConfiguracionTempdb>(configQuery, instanceName)
                    .FirstOrDefaultAsync();

                return Ok(details);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener detalles de health score para {InstanceName}", instanceName);
                return StatusCode(500, new { error = "Error al obtener detalles de health score" });
            }
        }
    }

    // DTOs
    public class HealthScoreV3Dto
    {
        public string InstanceName { get; set; } = string.Empty;
        public string? Ambiente { get; set; }
        public string? HostingSite { get; set; }
        public string? SqlVersion { get; set; }
        public DateTime GeneratedAtUtc { get; set; }
        public int HealthScore { get; set; }
        public string HealthStatus { get; set; } = string.Empty;
        
        // Scores por categoría (cada uno sobre 100)
        public int Score_Backups { get; set; }
        public int Score_AlwaysOn { get; set; }
        public int Score_Conectividad { get; set; }
        public int Score_ErroresCriticos { get; set; }
        public int Score_CPU { get; set; }
        public int Score_IO { get; set; }
        public int Score_Discos { get; set; }
        public int Score_Memoria { get; set; }
        public int Score_Maintenance { get; set; }
        public int Score_ConfiguracionTempdb { get; set; }
        
        // Contribuciones ponderadas (0-peso máximo, redondeadas a entero)
        public int BackupsContribution { get; set; }
        public int AlwaysOnContribution { get; set; }
        public int ConectividadContribution { get; set; }
        public int ErroresCriticosContribution { get; set; }
        public int CPUContribution { get; set; }
        public int IOContribution { get; set; }
        public int DiscosContribution { get; set; }
        public int MemoriaContribution { get; set; }
        public int MantenimientosContribution { get; set; }
        public int ConfiguracionTempdbContribution { get; set; }
    }

    public class HealthScoreV3DetailDto : HealthScoreV3Dto
    {
        // Detalles de cada categoría
        public Models.HealthScoreV3.InstanceHealthBackups? BackupsDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthAlwaysOn? AlwaysOnDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthConectividad? ConectividadDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthErroresCriticos? ErroresCriticosDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthCPU? CPUDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthIO? IODetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthDiscos? DiscosDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthMemoria? MemoriaDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthMaintenance? MaintenanceDetails { get; set; }
        public Models.HealthScoreV3.InstanceHealthConfiguracionTempdb? ConfiguracionTempdbDetails { get; set; }
    }

    public class HealthScoreV3SummaryDto
    {
        public int TotalInstances { get; set; }
        public int HealthyCount { get; set; }
        public int WarningCount { get; set; }
        public int RiskCount { get; set; }
        public int CriticalCount { get; set; }
        public double AvgScore { get; set; }
        public DateTime? LastUpdate { get; set; }
    }

    public class HealthScoreHistoryDto
    {
        public DateTime Timestamp { get; set; }
        public int HealthScore { get; set; }
        public string HealthStatus { get; set; } = string.Empty;
    }
}
