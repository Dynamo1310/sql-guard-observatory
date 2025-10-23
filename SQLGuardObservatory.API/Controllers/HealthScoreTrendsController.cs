using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data;
using System.Data.SqlClient;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para gráficos de tendencias de Health Score
    /// </summary>
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class HealthScoreTrendsController : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<HealthScoreTrendsController> _logger;

        public HealthScoreTrendsController(
            IConfiguration configuration,
            ILogger<HealthScoreTrendsController> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene tendencia de HealthScore para una instancia
        /// </summary>
        [HttpGet("healthscore/{instanceName}")]
        public async Task<IActionResult> GetHealthScoreTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("SQLNova");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        HealthScore,
                        HealthStatus,
                        AvailabilityScore,
                        BackupScore,
                        DiskScore,
                        AlwaysOnScore,
                        ErrorlogScore
                    FROM SQLNova.dbo.InstanceHealth_Score
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETUTCDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        healthScore = Convert.ToInt32(reader["HealthScore"]),
                        healthStatus = reader["HealthStatus"].ToString(),
                        breakdown = new
                        {
                            availability = reader["AvailabilityScore"] != DBNull.Value ? Convert.ToInt32(reader["AvailabilityScore"]) : 0,
                            backup = reader["BackupScore"] != DBNull.Value ? Convert.ToInt32(reader["BackupScore"]) : 0,
                            disk = reader["DiskScore"] != DBNull.Value ? Convert.ToInt32(reader["DiskScore"]) : 0,
                            alwaysOn = reader["AlwaysOnScore"] != DBNull.Value ? Convert.ToInt32(reader["AlwaysOnScore"]) : 0,
                            errorlog = reader["ErrorlogScore"] != DBNull.Value ? Convert.ToInt32(reader["ErrorlogScore"]) : 0
                        }
                    });
                }

                return Ok(new
                {
                    success = true,
                    instanceName,
                    hours,
                    dataPoints = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo tendencia de HealthScore para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene tendencia de latencia de conexión
        /// </summary>
        [HttpGet("latency/{instanceName}")]
        public async Task<IActionResult> GetLatencyTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("SQLNova");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        ConnectSuccess,
                        ConnectLatencyMs
                    FROM SQLNova.dbo.InstanceHealth_Critical
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETUTCDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        connectSuccess = Convert.ToBoolean(reader["ConnectSuccess"]),
                        latencyMs = Convert.ToInt32(reader["ConnectLatencyMs"])
                    });
                }

                return Ok(new
                {
                    success = true,
                    instanceName,
                    hours,
                    dataPoints = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo tendencia de latencia para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene tendencia de espacio en disco
        /// </summary>
        [HttpGet("disk/{instanceName}")]
        public async Task<IActionResult> GetDiskTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("SQLNova");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        DiskWorstFreePct
                    FROM SQLNova.dbo.InstanceHealth_Critical
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETUTCDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        freePct = reader["DiskWorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["DiskWorstFreePct"]) : 100m
                    });
                }

                return Ok(new
                {
                    success = true,
                    instanceName,
                    hours,
                    dataPoints = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo tendencia de disco para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene heatmap de estado de backups
        /// </summary>
        [HttpGet("backups/{instanceName}")]
        public async Task<IActionResult> GetBackupTrend(
            string instanceName,
            [FromQuery] int days = 7)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("SQLNova");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        LastFullBackup,
                        LastLogBackup,
                        FullBackupBreached,
                        LogBackupBreached
                    FROM SQLNova.dbo.InstanceHealth_Backups
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(DAY, -@Days, GETUTCDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Days", days);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        lastFullBackup = reader["LastFullBackup"] != DBNull.Value ? reader["LastFullBackup"] : null,
                        lastLogBackup = reader["LastLogBackup"] != DBNull.Value ? reader["LastLogBackup"] : null,
                        fullBackupBreached = reader["FullBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["FullBackupBreached"]),
                        logBackupBreached = reader["LogBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["LogBackupBreached"])
                    });
                }

                return Ok(new
                {
                    success = true,
                    instanceName,
                    days,
                    dataPoints = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo tendencia de backups para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene resumen de tendencias generales (todos las instancias)
        /// </summary>
        [HttpGet("overview")]
        public async Task<IActionResult> GetOverviewTrends([FromQuery] int hours = 24)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("SQLNova");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        DATEADD(MINUTE, DATEDIFF(MINUTE, 0, CollectedAtUtc) / 15 * 15, 0) AS TimeSlot,
                        AVG(HealthScore) AS AvgHealthScore,
                        COUNT(*) AS InstanceCount,
                        SUM(CASE WHEN HealthScore >= 90 THEN 1 ELSE 0 END) AS HealthyCount,
                        SUM(CASE WHEN HealthScore >= 70 AND HealthScore < 90 THEN 1 ELSE 0 END) AS WarningCount,
                        SUM(CASE WHEN HealthScore < 70 THEN 1 ELSE 0 END) AS CriticalCount
                    FROM SQLNova.dbo.InstanceHealth_Score
                    WHERE CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETUTCDATE())
                    GROUP BY DATEADD(MINUTE, DATEDIFF(MINUTE, 0, CollectedAtUtc) / 15 * 15, 0)
                    ORDER BY TimeSlot ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        timestamp = reader["TimeSlot"],
                        avgHealthScore = reader["AvgHealthScore"] != DBNull.Value ? Convert.ToInt32(reader["AvgHealthScore"]) : 0,
                        instanceCount = Convert.ToInt32(reader["InstanceCount"]),
                        healthy = Convert.ToInt32(reader["HealthyCount"]),
                        warning = Convert.ToInt32(reader["WarningCount"]),
                        critical = Convert.ToInt32(reader["CriticalCount"])
                    });
                }

                return Ok(new
                {
                    success = true,
                    hours,
                    dataPoints = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo tendencias generales");
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }
    }
}

