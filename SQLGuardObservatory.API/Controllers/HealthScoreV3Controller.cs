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
        /// Obtiene el último Health Score v3.0 FINAL (12 categorías) de todas las instancias
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
                            LogChainScore,
                            DatabaseStatesScore,
                            CPUScore,
                            MemoriaScore,
                            IOScore,
                            DiscosScore,
                            ErroresCriticosScore,
                            MantenimientosScore,
                            ConfiguracionTempdbScore,
                            AutogrowthScore,
                            BackupsContribution,
                            AlwaysOnContribution,
                            LogChainContribution,
                            DatabaseStatesContribution,
                            CPUContribution,
                            MemoriaContribution,
                            IOContribution,
                            DiscosContribution,
                            ErroresCriticosContribution,
                            MantenimientosContribution,
                            ConfiguracionTempdbContribution,
                            AutogrowthContribution,
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
                        LogChainScore AS Score_LogChain,
                        DatabaseStatesScore AS Score_DatabaseStates,
                        CPUScore AS Score_CPU,
                        MemoriaScore AS Score_Memoria,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb,
                        AutogrowthScore AS Score_Autogrowth,
                        BackupsContribution,
                        AlwaysOnContribution,
                        LogChainContribution,
                        DatabaseStatesContribution,
                        CPUContribution,
                        MemoriaContribution,
                        IOContribution,
                        DiscosContribution,
                        ErroresCriticosContribution,
                        MantenimientosContribution,
                        ConfiguracionTempdbContribution,
                        AutogrowthContribution
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
                        LogChainScore AS Score_LogChain,
                        DatabaseStatesScore AS Score_DatabaseStates,
                        CPUScore AS Score_CPU,
                        MemoriaScore AS Score_Memoria,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb,
                        AutogrowthScore AS Score_Autogrowth
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
        /// Obtiene todos los detalles de health score y sus métricas subyacentes (12 categorías)
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
                        LogChainScore AS Score_LogChain,
                        DatabaseStatesScore AS Score_DatabaseStates,
                        CPUScore AS Score_CPU,
                        MemoriaScore AS Score_Memoria,
                        IOScore AS Score_IO,
                        DiscosScore AS Score_Discos,
                        ErroresCriticosScore AS Score_ErroresCriticos,
                        MantenimientosScore AS Score_Maintenance,
                        ConfiguracionTempdbScore AS Score_ConfiguracionTempdb,
                        AutogrowthScore AS Score_Autogrowth,
                        BackupsContribution,
                        AlwaysOnContribution,
                        LogChainContribution,
                        DatabaseStatesContribution,
                        CPUContribution,
                        MemoriaContribution,
                        IOContribution,
                        DiscosContribution,
                        ErroresCriticosContribution,
                        MantenimientosContribution,
                        ConfiguracionTempdbContribution,
                        AutogrowthContribution
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
                    Score_LogChain = score.Score_LogChain,
                    Score_DatabaseStates = score.Score_DatabaseStates,
                    Score_CPU = score.Score_CPU,
                    Score_Memoria = score.Score_Memoria,
                    Score_IO = score.Score_IO,
                    Score_Discos = score.Score_Discos,
                    Score_ErroresCriticos = score.Score_ErroresCriticos,
                    Score_Maintenance = score.Score_Maintenance,
                    Score_ConfiguracionTempdb = score.Score_ConfiguracionTempdb,
                    Score_Autogrowth = score.Score_Autogrowth,
                    BackupsContribution = score.BackupsContribution,
                    AlwaysOnContribution = score.AlwaysOnContribution,
                    LogChainContribution = score.LogChainContribution,
                    DatabaseStatesContribution = score.DatabaseStatesContribution,
                    CPUContribution = score.CPUContribution,
                    MemoriaContribution = score.MemoriaContribution,
                    IOContribution = score.IOContribution,
                    DiscosContribution = score.DiscosContribution,
                    ErroresCriticosContribution = score.ErroresCriticosContribution,
                    MantenimientosContribution = score.MantenimientosContribution,
                    ConfiguracionTempdbContribution = score.ConfiguracionTempdbContribution,
                    AutogrowthContribution = score.AutogrowthContribution
                };

                // Backups
                var backupsQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Backups WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.BackupsDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthBackups>(backupsQuery, instanceName)
                    .FirstOrDefaultAsync();

                // AlwaysOn
                var alwaysOnQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_AlwaysOn WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.AlwaysOnDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthAlwaysOn>(alwaysOnQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Log Chain
                var logChainQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_LogChain WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.LogChainDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthLogChain>(logChainQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Database States
                var databaseStatesQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_DatabaseStates WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.DatabaseStatesDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthDatabaseStates>(databaseStatesQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Errores Críticos
                var erroresQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_ErroresCriticos WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.ErroresCriticosDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthErroresCriticos>(erroresQuery, instanceName)
                    .FirstOrDefaultAsync();

                // CPU
                var cpuQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_CPU WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.CPUDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthCPU>(cpuQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Memoria
                var memoriaQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Memoria WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.MemoriaDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthMemoria>(memoriaQuery, instanceName)
                    .FirstOrDefaultAsync();

                // IO
                var ioQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_IO WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.IODetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthIO>(ioQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Discos
                var discosQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Discos WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.DiscosDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthDiscos>(discosQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Maintenance
                var maintenanceQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Maintenance WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.MaintenanceDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthMaintenance>(maintenanceQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Configuracion & TempDB
                var configQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_ConfiguracionTempdb WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.ConfiguracionTempdbDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthConfiguracionTempdb>(configQuery, instanceName)
                    .FirstOrDefaultAsync();

                // Autogrowth
                var autogrowthQuery = "SELECT TOP 1 * FROM dbo.InstanceHealth_Autogrowth WHERE InstanceName = {0} ORDER BY CollectedAtUtc DESC";
                details.AutogrowthDetails = await _context.Database
                    .SqlQueryRaw<InstanceHealthAutogrowth>(autogrowthQuery, instanceName)
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
        
        // Scores por categoría (cada uno sobre 100) - 12 CATEGORÍAS
        // TAB 1: Availability & DR (40%)
        public int Score_Backups { get; set; }           // 18%
        public int Score_AlwaysOn { get; set; }          // 14%
        public int Score_LogChain { get; set; }          // 5%
        public int Score_DatabaseStates { get; set; }    // 3%
        
        // TAB 2: Performance (35%)
        public int Score_CPU { get; set; }               // 10%
        public int Score_Memoria { get; set; }           // 8%
        public int Score_IO { get; set; }                // 10%
        public int Score_Discos { get; set; }            // 7%
        
        // TAB 3: Maintenance & Config (25%)
        public int Score_ErroresCriticos { get; set; }   // 7%
        public int Score_Maintenance { get; set; }       // 5%
        public int Score_ConfiguracionTempdb { get; set; } // 8%
        public int Score_Autogrowth { get; set; }        // 5%
        
        // Contribuciones ponderadas (0-peso máximo, redondeadas a entero)
        // TAB 1: Availability & DR
        public int BackupsContribution { get; set; }           // Max: 18
        public int AlwaysOnContribution { get; set; }          // Max: 14
        public int LogChainContribution { get; set; }          // Max: 5
        public int DatabaseStatesContribution { get; set; }    // Max: 3
        
        // TAB 2: Performance
        public int CPUContribution { get; set; }               // Max: 10
        public int MemoriaContribution { get; set; }           // Max: 8
        public int IOContribution { get; set; }                // Max: 10
        public int DiscosContribution { get; set; }            // Max: 7
        
        // TAB 3: Maintenance & Config
        public int ErroresCriticosContribution { get; set; }   // Max: 7
        public int MantenimientosContribution { get; set; }    // Max: 5
        public int ConfiguracionTempdbContribution { get; set; } // Max: 8
        public int AutogrowthContribution { get; set; }        // Max: 5
    }

    public class HealthScoreV3DetailDto : HealthScoreV3Dto
    {
        // Detalles de cada categoría (12 categorías)
        // TAB 1: Availability & DR
        public InstanceHealthBackups? BackupsDetails { get; set; }
        public InstanceHealthAlwaysOn? AlwaysOnDetails { get; set; }
        public InstanceHealthLogChain? LogChainDetails { get; set; }
        public InstanceHealthDatabaseStates? DatabaseStatesDetails { get; set; }
        
        // TAB 2: Performance
        public InstanceHealthCPU? CPUDetails { get; set; }
        public InstanceHealthMemoria? MemoriaDetails { get; set; }
        public InstanceHealthIO? IODetails { get; set; }
        public InstanceHealthDiscos? DiscosDetails { get; set; }
        
        // TAB 3: Maintenance & Config
        public InstanceHealthErroresCriticos? ErroresCriticosDetails { get; set; }
        public InstanceHealthMaintenance? MaintenanceDetails { get; set; }
        public InstanceHealthConfiguracionTempdb? ConfiguracionTempdbDetails { get; set; }
        public InstanceHealthAutogrowth? AutogrowthDetails { get; set; }
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
