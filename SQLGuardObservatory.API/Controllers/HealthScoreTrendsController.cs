using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SQLGuardObservatory.API.Authorization;
using System.Data;
using System.Data.SqlClient;

namespace SQLGuardObservatory.API.Controllers
{
    /// <summary>
    /// Controlador para gráficos de tendencias de Health Score
    /// </summary>
    [Authorize]
    [ViewPermission("HealthScore")]
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
        [HttpGet("{instanceName}")]
        [HttpGet("healthscore/{instanceName}")]
        public async Task<IActionResult> GetHealthScoreTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        HealthScore,
                        HealthStatus,
                        AlwaysOnScore,
                        BackupsScore,
                        ErroresCriticosScore,
                        CPUScore,
                        IOScore,
                        DiscosScore,
                        MemoriaScore,
                        ConfiguracionTempdbScore,
                        MantenimientosScore,
                        LogChainScore,
                        DatabaseStatesScore,
                        AutogrowthScore
                    FROM dbo.InstanceHealth_Score
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
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
                        // Breakdown por categoría (v3.0 con 12 categorías)
                        breakdown = new
                        {
                            alwaysOn = reader["AlwaysOnScore"] != DBNull.Value ? Convert.ToInt32(reader["AlwaysOnScore"]) : 0,
                            backups = reader["BackupsScore"] != DBNull.Value ? Convert.ToInt32(reader["BackupsScore"]) : 0,
                            logChain = reader["LogChainScore"] != DBNull.Value ? Convert.ToInt32(reader["LogChainScore"]) : 0,
                            databaseStates = reader["DatabaseStatesScore"] != DBNull.Value ? Convert.ToInt32(reader["DatabaseStatesScore"]) : 0,
                            erroresCriticos = reader["ErroresCriticosScore"] != DBNull.Value ? Convert.ToInt32(reader["ErroresCriticosScore"]) : 0,
                            cpu = reader["CPUScore"] != DBNull.Value ? Convert.ToInt32(reader["CPUScore"]) : 0,
                            io = reader["IOScore"] != DBNull.Value ? Convert.ToInt32(reader["IOScore"]) : 0,
                            discos = reader["DiscosScore"] != DBNull.Value ? Convert.ToInt32(reader["DiscosScore"]) : 0,
                            memoria = reader["MemoriaScore"] != DBNull.Value ? Convert.ToInt32(reader["MemoriaScore"]) : 0,
                            tempdb = reader["ConfiguracionTempdbScore"] != DBNull.Value ? Convert.ToInt32(reader["ConfiguracionTempdbScore"]) : 0,
                            mantenimientos = reader["MantenimientosScore"] != DBNull.Value ? Convert.ToInt32(reader["MantenimientosScore"]) : 0,
                            autogrowth = reader["AutogrowthScore"] != DBNull.Value ? Convert.ToInt32(reader["AutogrowthScore"]) : 0
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
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        ConnectSuccess,
                        ConnectLatencyMs
                    FROM dbo.InstanceHealth_Critical_Availability
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
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
        /// Obtiene tendencia de espacio en disco (todos los volúmenes)
        /// </summary>
        [HttpGet("disk/{instanceName}")]
        public async Task<IActionResult> GetDiskTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        WorstFreePct,
                        DataDiskAvgFreePct,
                        LogDiskAvgFreePct,
                        TempDBDiskFreePct,
                        VolumesJson
                    FROM dbo.InstanceHealth_Discos
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
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
                        worstFreePct = reader["WorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["WorstFreePct"]) : 100m,
                        dataDiskAvgFreePct = reader["DataDiskAvgFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["DataDiskAvgFreePct"]) : 100m,
                        logDiskAvgFreePct = reader["LogDiskAvgFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["LogDiskAvgFreePct"]) : 100m,
                        tempDBDiskFreePct = reader["TempDBDiskFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["TempDBDiskFreePct"]) : 100m,
                        volumesJson = reader["VolumesJson"] != DBNull.Value ? reader["VolumesJson"].ToString() : null
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
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        LastFullBackup,
                        LastLogBackup,
                        FullBackupBreached,
                        LogBackupBreached
                    FROM dbo.InstanceHealth_Backups
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(DAY, -@Days, GETDATE())
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
        /// Obtiene tendencia de uso de CPU
        /// </summary>
        [HttpGet("cpu/{instanceName}")]
        public async Task<IActionResult> GetCpuTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        SQLProcessUtilization,
                        SystemIdleProcess,
                        OtherProcessUtilization
                    FROM dbo.InstanceHealth_CPU
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var sqlCpu = reader["SQLProcessUtilization"] != DBNull.Value ? Convert.ToInt32(reader["SQLProcessUtilization"]) : 0;
                    var otherCpu = reader["OtherProcessUtilization"] != DBNull.Value ? Convert.ToInt32(reader["OtherProcessUtilization"]) : 0;
                    var cpuTotal = sqlCpu + otherCpu;
                    
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        cpuTotal = cpuTotal,
                        sqlServerCpu = sqlCpu,
                        otherProcessesCpu = otherCpu
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
                _logger.LogError(ex, "Error obteniendo tendencia de CPU para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene tendencia de uso de memoria
        /// </summary>
        [HttpGet("memory/{instanceName}")]
        public async Task<IActionResult> GetMemoryTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        TotalServerMemoryMB,
                        MaxServerMemoryMB,
                        BufferCacheHitRatio,
                        PageLifeExpectancy,
                        MemoryGrantsPending
                    FROM dbo.InstanceHealth_Memoria
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
                    ORDER BY CollectedAtUtc ASC";

                using var command = new SqlCommand(query, connection);
                command.Parameters.AddWithValue("@InstanceName", instanceName);
                command.Parameters.AddWithValue("@Hours", hours);

                var results = new List<object>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var totalMemory = reader["TotalServerMemoryMB"] != DBNull.Value ? Convert.ToInt32(reader["TotalServerMemoryMB"]) : 0;
                    var maxMemory = reader["MaxServerMemoryMB"] != DBNull.Value ? Convert.ToInt32(reader["MaxServerMemoryMB"]) : 1;
                    var memoryUsedPct = maxMemory > 0 ? (decimal)totalMemory / maxMemory * 100 : 0;
                    
                    results.Add(new
                    {
                        timestamp = reader["CollectedAtUtc"],
                        memoryUsedPct = Math.Round(memoryUsedPct, 1),
                        bufferCacheHitRatio = reader["BufferCacheHitRatio"] != DBNull.Value ? Convert.ToDecimal(reader["BufferCacheHitRatio"]) : 0m,
                        pageLifeExpectancy = reader["PageLifeExpectancy"] != DBNull.Value ? Convert.ToInt32(reader["PageLifeExpectancy"]) : 0,
                        memoryGrantsPending = reader["MemoryGrantsPending"] != DBNull.Value ? Convert.ToInt32(reader["MemoryGrantsPending"]) : 0
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
                _logger.LogError(ex, "Error obteniendo tendencia de memoria para {Instance}", instanceName);
                return StatusCode(500, new { success = false, error = ex.Message });
            }
        }

        /// <summary>
        /// Obtiene tendencia de latencia de I/O
        /// </summary>
        [HttpGet("io/{instanceName}")]
        public async Task<IActionResult> GetIOTrend(
            string instanceName,
            [FromQuery] int hours = 24)
        {
            try
            {
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
                using var connection = new SqlConnection(connectionString);
                await connection.OpenAsync();

                var query = @"
                    SELECT 
                        CollectedAtUtc,
                        AvgReadLatencyMs,
                        AvgWriteLatencyMs,
                        LogFileAvgWriteMs,
                        DataFileAvgReadMs,
                        IODetails
                    FROM dbo.InstanceHealth_IO
                    WHERE InstanceName = @InstanceName
                      AND CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
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
                        avgReadLatency = reader["AvgReadLatencyMs"] != DBNull.Value ? Convert.ToDecimal(reader["AvgReadLatencyMs"]) : 0m,
                        avgWriteLatency = reader["AvgWriteLatencyMs"] != DBNull.Value ? Convert.ToDecimal(reader["AvgWriteLatencyMs"]) : 0m,
                        logFileAvgWrite = reader["LogFileAvgWriteMs"] != DBNull.Value ? Convert.ToDecimal(reader["LogFileAvgWriteMs"]) : 0m,
                        dataFileAvgRead = reader["DataFileAvgReadMs"] != DBNull.Value ? Convert.ToDecimal(reader["DataFileAvgReadMs"]) : 0m,
                        ioByVolumeJson = reader["IODetails"] != DBNull.Value ? reader["IODetails"].ToString() : null
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
                _logger.LogError(ex, "Error obteniendo tendencia de I/O para {Instance}", instanceName);
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
                // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
                var connectionString = _configuration.GetConnectionString("ApplicationDb");
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
                    FROM dbo.InstanceHealth_Score
                    WHERE CollectedAtUtc >= DATEADD(HOUR, -@Hours, GETDATE())
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

