using Microsoft.AspNetCore.Mvc;
using System.Data;
using System.Data.SqlClient;
using System.Text.Json;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para métricas de Health Score en tiempo real
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class HealthScoreRealtimeController : ControllerBase
    {
        private readonly IConfiguration _configuration;
        private readonly ILogger<HealthScoreRealtimeController> _logger;

        public HealthScoreRealtimeController(
            IConfiguration configuration,
            ILogger<HealthScoreRealtimeController> logger)
        {
            _configuration = configuration;
            _logger = logger;
        }

        /// <summary>
        /// Obtiene el último Health Score de todas las instancias
        /// </summary>
        [HttpGet("latest")]
        public async Task<IActionResult> GetLatestHealthScores()
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("DefaultConnection");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        InstanceName,
                        HealthScore,
                        HealthStatus,
                        ConnectSuccess,
                        ConnectLatencyMs,
                        WorstFreePct,
                        AlwaysOnEnabled,
                        AlwaysOnWorstState,
                        LastFullBackup,
                        LastLogBackup,
                        FullBackupBreached,
                        LogBackupBreached,
                        LastCheckdb,
                        CheckdbOk,
                        LastIndexOptimize,
                        IndexOptimizeOk,
                        Severity20PlusCount,
                        ScoreCollectedAt,
                        RealTimeCollectedAt,
                        BackupCollectedAt,
                        MaintenanceCollectedAt
                    FROM dbo.vw_InstanceHealth_Latest
                    ORDER BY HealthScore ASC, InstanceName";

                using var command = new SqlCommand(query, connection);
                command.CommandTimeout = 30;

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        instanceName = reader["InstanceName"].ToString(),
                        healthScore = Convert.ToInt32(reader["HealthScore"]),
                        healthStatus = reader["HealthStatus"].ToString(),
                        connectSuccess = Convert.ToBoolean(reader["ConnectSuccess"]),
                        connectLatencyMs = reader["ConnectLatencyMs"] != DBNull.Value ? Convert.ToInt32(reader["ConnectLatencyMs"]) : 0,
                        worstFreePct = reader["WorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["WorstFreePct"]) : 100m,
                        alwaysOnEnabled = reader["AlwaysOnEnabled"] != DBNull.Value ? Convert.ToBoolean(reader["AlwaysOnEnabled"]) : false,
                        alwaysOnWorstState = reader["AlwaysOnWorstState"]?.ToString(),
                        lastFullBackup = reader["LastFullBackup"] != DBNull.Value ? reader["LastFullBackup"] : null,
                        lastLogBackup = reader["LastLogBackup"] != DBNull.Value ? reader["LastLogBackup"] : null,
                        fullBackupBreached = reader["FullBackupBreached"] != DBNull.Value ? Convert.ToBoolean(reader["FullBackupBreached"]) : false,
                        logBackupBreached = reader["LogBackupBreached"] != DBNull.Value ? Convert.ToBoolean(reader["LogBackupBreached"]) : false,
                        lastCheckdb = reader["LastCheckdb"] != DBNull.Value ? reader["LastCheckdb"] : null,
                        checkdbOk = reader["CheckdbOk"] != DBNull.Value ? Convert.ToBoolean(reader["CheckdbOk"]) : false,
                        lastIndexOptimize = reader["LastIndexOptimize"] != DBNull.Value ? reader["LastIndexOptimize"] : null,
                        indexOptimizeOk = reader["IndexOptimizeOk"] != DBNull.Value ? Convert.ToBoolean(reader["IndexOptimizeOk"]) : false,
                        severity20PlusCount = reader["Severity20PlusCount"] != DBNull.Value ? Convert.ToInt32(reader["Severity20PlusCount"]) : 0,
                        collectedAt = new
                        {
                            score = reader["ScoreCollectedAt"] != DBNull.Value ? reader["ScoreCollectedAt"] : null,
                            realTime = reader["RealTimeCollectedAt"] != DBNull.Value ? reader["RealTimeCollectedAt"] : null,
                            backup = reader["BackupCollectedAt"] != DBNull.Value ? reader["BackupCollectedAt"] : null,
                            maintenance = reader["MaintenanceCollectedAt"] != DBNull.Value ? reader["MaintenanceCollectedAt"] : null
                        }
                    });
                }

                return Ok(new
                {
                    success = true,
                    count = results.Count,
                    data = results,
                    timestamp = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo health scores");
                return StatusCode(500, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        /// <summary>
        /// Obtiene el historial de Health Score de una instancia específica
        /// </summary>
        [HttpGet("history/{instanceName}")]
        public async Task<IActionResult> GetInstanceHistory(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("DefaultConnection");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        HealthScore,
                        HealthStatus,
                        AvailabilityScore,
                        BackupScore,
                        DiskScore,
                        AlwaysOnScore,
                        ErrorlogScore,
                        CollectedAtUtc
                    FROM dbo.InstanceHealth_Score
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETUTCDATE())
                    ORDER BY CollectedAtUtc DESC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);
                command.CommandTimeout = 30;

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    results.Add(new
                    {
                        healthScore = Convert.ToInt32(reader["HealthScore"]),
                        healthStatus = reader["HealthStatus"].ToString(),
                        breakdown = new
                        {
                            availability = reader["AvailabilityScore"] != DBNull.Value ? Convert.ToInt32(reader["AvailabilityScore"]) : 0,
                            backup = reader["BackupScore"] != DBNull.Value ? Convert.ToInt32(reader["BackupScore"]) : 0,
                            disk = reader["DiskScore"] != DBNull.Value ? Convert.ToInt32(reader["DiskScore"]) : 0,
                            alwaysOn = reader["AlwaysOnScore"] != DBNull.Value ? Convert.ToInt32(reader["AlwaysOnScore"]) : 0,
                            errorlog = reader["ErrorlogScore"] != DBNull.Value ? Convert.ToInt32(reader["ErrorlogScore"]) : 0
                        },
                        collectedAt = reader["CollectedAtUtc"]
                    });
                }

                return Ok(new
                {
                    success = true,
                    instanceName,
                    hours,
                    count = results.Count,
                    data = results
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo historial de {Instance}", instanceName);
                return StatusCode(500, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        /// <summary>
        /// Server-Sent Events (SSE) para streaming en tiempo real
        /// Envia actualizaciones cada 5 segundos
        /// </summary>
        [HttpGet("stream")]
        public async Task StreamHealthScores(CancellationToken cancellationToken)
        {
            Response.Headers.Add("Content-Type", "text/event-stream");
            Response.Headers.Add("Cache-Control", "no-cache");
            Response.Headers.Add("Connection", "keep-alive");

            try
            {
                while (!cancellationToken.IsCancellationRequested)
                {
                    // Obtener datos actuales
                    var data = await GetHealthScoresData();

                    // Enviar como SSE
                    var json = JsonSerializer.Serialize(data);
                    await Response.WriteAsync($"data: {json}\n\n");
                    await Response.Body.FlushAsync();

                    // Esperar 5 segundos antes de la siguiente actualización
                    await Task.Delay(5000, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                // Cliente desconectado - normal
                _logger.LogInformation("Cliente desconectado del stream");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en stream SSE");
            }
        }

        /// <summary>
        /// Obtiene estadísticas agregadas por estado
        /// </summary>
        [HttpGet("stats")]
        public async Task<IActionResult> GetHealthStats()
        {
            try
            {
                var connectionString = _configuration.GetConnectionString("DefaultConnection");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    WITH LatestScores AS (
                        SELECT 
                            InstanceName,
                            HealthStatus,
                            HealthScore,
                            ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                        FROM dbo.InstanceHealth_Score
                    )
                    SELECT 
                        HealthStatus,
                        COUNT(*) AS Count,
                        AVG(HealthScore) AS AvgScore,
                        MIN(HealthScore) AS MinScore,
                        MAX(HealthScore) AS MaxScore
                    FROM LatestScores
                    WHERE rn = 1
                    GROUP BY HealthStatus";

                using var command = new SqlCommand(query, connection);
                command.CommandTimeout = 30;

                var stats = new Dictionary<string, object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var status = reader["HealthStatus"].ToString();
                    stats[status] = new
                    {
                        count = Convert.ToInt32(reader["Count"]),
                        avgScore = Convert.ToInt32(reader["AvgScore"]),
                        minScore = Convert.ToInt32(reader["MinScore"]),
                        maxScore = Convert.ToInt32(reader["MaxScore"])
                    };
                }

                return Ok(new
                {
                    success = true,
                    stats,
                    timestamp = DateTime.Now
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error obteniendo estadísticas");
                return StatusCode(500, new
                {
                    success = false,
                    error = ex.Message
                });
            }
        }

        // Método auxiliar para obtener datos (usado por SSE)
        private async Task<object> GetHealthScoresData()
        {
            var connectionString = _configuration.GetConnectionString("DefaultConnection");
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();

            var query = @"
                SELECT 
                    InstanceName,
                    HealthScore,
                    HealthStatus,
                    ConnectSuccess,
                    WorstFreePct,
                    FullBackupBreached,
                    LogBackupBreached,
                    AlwaysOnWorstState
                FROM dbo.vw_InstanceHealth_Latest
                ORDER BY HealthScore ASC";

            using var command = new SqlCommand(query, connection);
            var results = new List<object>();

            using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                results.Add(new
                {
                    instanceName = reader["InstanceName"].ToString(),
                    healthScore = Convert.ToInt32(reader["HealthScore"]),
                    healthStatus = reader["HealthStatus"].ToString(),
                    connectSuccess = Convert.ToBoolean(reader["ConnectSuccess"]),
                    worstFreePct = reader["WorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["WorstFreePct"]) : 100m,
                    backupIssues = (reader["FullBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["FullBackupBreached"])) ||
                                   (reader["LogBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["LogBackupBreached"])),
                    alwaysOnStatus = reader["AlwaysOnWorstState"]?.ToString() ?? "N/A"
                });
            }

            return new
            {
                count = results.Count,
                data = results,
                timestamp = DateTime.Now
            };
        }
    }
}

