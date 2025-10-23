using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services
{
    public class HealthScoreService : IHealthScoreService
    {
        private readonly SQLNovaDbContext _context;
        private readonly ILogger<HealthScoreService> _logger;

        public HealthScoreService(SQLNovaDbContext context, ILogger<HealthScoreService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<IEnumerable<HealthScoreDto>> GetLatestHealthScoresAsync()
        {
            try
            {
                // v2.0: Leer de la vista consolidada que une las 5 tablas nuevas
                var query = @"
                    SELECT 
                        -- Score y Status
                        InstanceName,
                        HealthScore,
                        HealthStatus,
                        ScoreCollectedAt,
                        
                        -- Breakdown por Tiers (100 puntos)
                        Tier1_Availability,
                        Tier2_Continuity,
                        Tier3_Resources,
                        Tier4_Maintenance,
                        
                        -- Breakdown detallado (v3.0 - 100 puntos)
                        ConnectivityScore,
                        MemoryScore,
                        AlwaysOnScore,
                        FullBackupScore,
                        LogBackupScore,
                        DiskSpaceScore,
                        CheckdbScore,
                        IndexOptimizeScore,
                        ErrorlogScore,
                        
                        -- Métricas raw - Availability
                        ConnectSuccess,
                        ConnectLatencyMs,
                        BlockingCount,
                        MaxBlockTimeSeconds,
                        PageLifeExpectancy,
                        BufferCacheHitRatio,
                        AlwaysOnEnabled,
                        AlwaysOnWorstState,
                        
                        -- Métricas raw - Resources
                        DiskWorstFreePct,
                        AvgReadLatencyMs,
                        AvgWriteLatencyMs,
                        MaxReadLatencyMs,
                        TotalIOPS,
                        SlowQueriesCount,
                        LongRunningQueriesCount,
                        
                        -- Métricas raw - Backups
                        LastFullBackup,
                        LastLogBackup,
                        FullBackupBreached,
                        LogBackupBreached,
                        
                        -- Métricas raw - Maintenance
                        LastCheckdb,
                        CheckdbOk,
                        LastIndexOptimize,
                        IndexOptimizeOk,
                        Severity20PlusCount
                    FROM dbo.vw_InstanceHealth_Latest
                    ORDER BY HealthScore ASC";

                var connection = _context.Database.GetDbConnection();
                await connection.OpenAsync();

                using var command = connection.CreateCommand();
                command.CommandText = query;

                var result = new List<HealthScoreDto>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    var dto = new HealthScoreDto
                    {
                        InstanceName = reader["InstanceName"].ToString(),
                        HealthScore = Convert.ToInt32(reader["HealthScore"]),
                        HealthStatus = reader["HealthStatus"].ToString(),
                        ConnectSuccess = reader["ConnectSuccess"] != DBNull.Value && Convert.ToBoolean(reader["ConnectSuccess"]),
                        ConnectLatencyMs = reader["ConnectLatencyMs"] != DBNull.Value ? Convert.ToInt32(reader["ConnectLatencyMs"]) : null,
                        GeneratedAtUtc = Convert.ToDateTime(reader["ScoreCollectedAt"]),
                        
                        // v2.0: Breakdown por Tiers
                        Tier1_Availability = reader["Tier1_Availability"] != DBNull.Value ? Convert.ToInt32(reader["Tier1_Availability"]) : null,
                        Tier2_Continuity = reader["Tier2_Continuity"] != DBNull.Value ? Convert.ToInt32(reader["Tier2_Continuity"]) : null,
                        Tier3_Resources = reader["Tier3_Resources"] != DBNull.Value ? Convert.ToInt32(reader["Tier3_Resources"]) : null,
                        Tier4_Maintenance = reader["Tier4_Maintenance"] != DBNull.Value ? Convert.ToInt32(reader["Tier4_Maintenance"]) : null,
                        
                        // v3.0: Breakdown detallado (100 puntos)
                        ConnectivityScore = reader["ConnectivityScore"] != DBNull.Value ? Convert.ToInt32(reader["ConnectivityScore"]) : null,
                        MemoryScore = reader["MemoryScore"] != DBNull.Value ? Convert.ToInt32(reader["MemoryScore"]) : null,
                        AlwaysOnScore = reader["AlwaysOnScore"] != DBNull.Value ? Convert.ToInt32(reader["AlwaysOnScore"]) : null,
                        FullBackupScore = reader["FullBackupScore"] != DBNull.Value ? Convert.ToInt32(reader["FullBackupScore"]) : null,
                        LogBackupScore = reader["LogBackupScore"] != DBNull.Value ? Convert.ToInt32(reader["LogBackupScore"]) : null,
                        DiskSpaceScore = reader["DiskSpaceScore"] != DBNull.Value ? Convert.ToInt32(reader["DiskSpaceScore"]) : null,
                        CheckdbScore = reader["CheckdbScore"] != DBNull.Value ? Convert.ToInt32(reader["CheckdbScore"]) : null,
                        IndexOptimizeScore = reader["IndexOptimizeScore"] != DBNull.Value ? Convert.ToInt32(reader["IndexOptimizeScore"]) : null,
                        ErrorlogScore = reader["ErrorlogScore"] != DBNull.Value ? Convert.ToInt32(reader["ErrorlogScore"]) : null,
                        
                        // Backups
                        BackupSummary = new BackupSummary
                        {
                            LastFullBackup = reader["LastFullBackup"] != DBNull.Value ? Convert.ToDateTime(reader["LastFullBackup"]) : null,
                            LastLogBackup = reader["LastLogBackup"] != DBNull.Value ? Convert.ToDateTime(reader["LastLogBackup"]) : null,
                            Breaches = new List<string>() // TODO: agregar lógica si necesitas detalles
                        },
                        
                        // Mantenimiento
                        MaintenanceSummary = new MaintenanceSummary
                        {
                            LastCheckdb = reader["LastCheckdb"] != DBNull.Value ? Convert.ToDateTime(reader["LastCheckdb"]).ToString("yyyy-MM-dd HH:mm:ss") : null,
                            CheckdbOk = reader["CheckdbOk"] != DBNull.Value && Convert.ToBoolean(reader["CheckdbOk"]),
                            LastIndexOptimize = reader["LastIndexOptimize"] != DBNull.Value ? Convert.ToDateTime(reader["LastIndexOptimize"]).ToString("yyyy-MM-dd HH:mm:ss") : null,
                            IndexOptimizeOk = reader["IndexOptimizeOk"] != DBNull.Value && Convert.ToBoolean(reader["IndexOptimizeOk"])
                        },
                        
                        // Discos
                        DiskSummary = new DiskSummary
                        {
                            WorstFreePct = reader["DiskWorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["DiskWorstFreePct"]) : 100,
                            Volumes = ParseDiskDetails(reader["DiskDetails"]?.ToString())
                        },
                        
                        // Recursos (v2.0: Incluye nuevas métricas)
                        ResourceSummary = new ResourceSummary
                        {
                            BlockingCount = reader["BlockingCount"] != DBNull.Value ? Convert.ToInt32(reader["BlockingCount"]) : null,
                            MaxBlockTimeSeconds = reader["MaxBlockTimeSeconds"] != DBNull.Value ? Convert.ToInt32(reader["MaxBlockTimeSeconds"]) : null,
                            PageLifeExpectancy = reader["PageLifeExpectancy"] != DBNull.Value ? Convert.ToInt32(reader["PageLifeExpectancy"]) : null,
                            BufferCacheHitRatio = reader["BufferCacheHitRatio"] != DBNull.Value ? Convert.ToDecimal(reader["BufferCacheHitRatio"]) : null,
                            AvgReadLatencyMs = reader["AvgReadLatencyMs"] != DBNull.Value ? Convert.ToDecimal(reader["AvgReadLatencyMs"]) : null,
                            AvgWriteLatencyMs = reader["AvgWriteLatencyMs"] != DBNull.Value ? Convert.ToDecimal(reader["AvgWriteLatencyMs"]) : null,
                            MaxReadLatencyMs = reader["MaxReadLatencyMs"] != DBNull.Value ? Convert.ToDecimal(reader["MaxReadLatencyMs"]) : null,
                            TotalIOPS = reader["TotalIOPS"] != DBNull.Value ? Convert.ToDecimal(reader["TotalIOPS"]) : null,
                            SlowQueriesCount = reader["SlowQueriesCount"] != DBNull.Value ? Convert.ToInt32(reader["SlowQueriesCount"]) : null,
                            LongRunningQueriesCount = reader["LongRunningQueriesCount"] != DBNull.Value ? Convert.ToInt32(reader["LongRunningQueriesCount"]) : null,
                            CpuHighFlag = false, // TODO: agregar si es necesario
                            MemoryPressureFlag = reader["PageLifeExpectancy"] != DBNull.Value && Convert.ToInt32(reader["PageLifeExpectancy"]) < 300
                        },
                        
                        // AlwaysOn
                        AlwaysOnSummary = new AlwaysOnSummary
                        {
                            Enabled = reader["AlwaysOnEnabled"] != DBNull.Value && Convert.ToBoolean(reader["AlwaysOnEnabled"]),
                            WorstState = reader["AlwaysOnWorstState"]?.ToString() ?? "OK"
                        },
                        
                        // Errorlog
                        ErrorlogSummary = new ErrorlogSummary
                        {
                            Severity20PlusCount24h = reader["Severity20PlusCount"] != DBNull.Value ? Convert.ToInt32(reader["Severity20PlusCount"]) : 0
                        }
                    };

                    result.Add(dto);
                }

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener health scores desde nuevas tablas");
                throw;
            }
        }

        public async Task<HealthScoreSummaryDto> GetSummaryAsync()
        {
            try
            {
                // v3.0: Leer directamente de la vista consolidada (umbrales de 100 puntos)
                var query = @"
                    SELECT 
                        COUNT(*) AS TotalInstances,
                        SUM(CASE WHEN HealthScore >= 90 THEN 1 ELSE 0 END) AS HealthyCount,      -- 90% de 100
                        SUM(CASE WHEN HealthScore >= 70 AND HealthScore < 90 THEN 1 ELSE 0 END) AS WarningCount, -- 70-89%
                        SUM(CASE WHEN HealthScore < 70 THEN 1 ELSE 0 END) AS CriticalCount,      -- <70%
                        AVG(HealthScore) AS AvgScore,
                        MAX(ScoreCollectedAt) AS LastUpdate
                    FROM dbo.vw_InstanceHealth_Latest";

                var connection = _context.Database.GetDbConnection();
                await connection.OpenAsync();

                using var command = connection.CreateCommand();
                command.CommandText = query;

                using var reader = await command.ExecuteReaderAsync();
                if (await reader.ReadAsync())
                {
                    return new HealthScoreSummaryDto
                    {
                        TotalInstances = Convert.ToInt32(reader["TotalInstances"]),
                        HealthyCount = Convert.ToInt32(reader["HealthyCount"]),
                        WarningCount = Convert.ToInt32(reader["WarningCount"]),
                        CriticalCount = Convert.ToInt32(reader["CriticalCount"]),
                        AvgScore = reader["AvgScore"] != DBNull.Value ? Convert.ToInt32(reader["AvgScore"]) : 0,
                        LastUpdate = reader["LastUpdate"] != DBNull.Value ? Convert.ToDateTime(reader["LastUpdate"]) : null
                    };
                }

                return new HealthScoreSummaryDto(); // Retornar vacío si no hay datos
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener resumen de health scores desde nuevas tablas");
                throw;
            }
        }

        public async Task<OverviewDataDto> GetOverviewDataAsync()
        {
            try
            {
                // v2.0: Leer directamente de la vista consolidada (ya tiene todo)
                var query = @"
                    SELECT 
                        InstanceName,
                        NULL AS Ambiente,  -- TODO: agregar Ambiente a la vista si es necesario
                        HealthScore,
                        HealthStatus,
                        DiskWorstFreePct,
                        FullBackupBreached,
                        LogBackupBreached,
                        LastFullBackup,
                        LastLogBackup,
                        CheckdbOk,
                        IndexOptimizeOk
                    FROM dbo.vw_InstanceHealth_Latest";

                var connection = _context.Database.GetDbConnection();
                await connection.OpenAsync();

                using var command = connection.CreateCommand();
                command.CommandText = query;

                // Contadores
                int totalInstances = 0;
                int healthyCount = 0;
                int warningCount = 0;
                int criticalCount = 0;
                int totalScore = 0;
                DateTime? lastUpdate = null;
                
                int criticalDisksCount = 0;
                int backupsOverdueCount = 0;
                int maintenanceOverdueCount = 0;
                
                var criticalInstances = new List<CriticalInstanceDto>();
                var backupIssues = new List<BackupIssueDto>();

                using var reader = await command.ExecuteReaderAsync();
                while (await reader.ReadAsync())
                {
                    totalInstances++;
                    var healthScore = Convert.ToInt32(reader["HealthScore"]);
                    totalScore += healthScore;
                    
                    // v3.0: Umbrales de 100 puntos
                    if (healthScore >= 90) healthyCount++;      // 90% de 100
                    else if (healthScore >= 70) warningCount++; // 70-89% de 100
                    else criticalCount++;                       // <70% de 100
                    
                    var diskWorstFreePct = reader["DiskWorstFreePct"] != DBNull.Value ? Convert.ToDecimal(reader["DiskWorstFreePct"]) : 100m;
                    var fullBackupBreached = reader["FullBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["FullBackupBreached"]);
                    var logBackupBreached = reader["LogBackupBreached"] != DBNull.Value && Convert.ToBoolean(reader["LogBackupBreached"]);
                    var checkdbOk = reader["CheckdbOk"] != DBNull.Value && Convert.ToBoolean(reader["CheckdbOk"]);
                    var indexOptimizeOk = reader["IndexOptimizeOk"] != DBNull.Value && Convert.ToBoolean(reader["IndexOptimizeOk"]);

                    // Discos críticos (< 15% libre)
                    if (diskWorstFreePct < 15)
                    {
                        criticalDisksCount++;
                    }

                    // Backups atrasados
                    if (fullBackupBreached || logBackupBreached)
                    {
                        backupsOverdueCount++;
                        var breaches = new List<string>();
                        if (fullBackupBreached) breaches.Add("FULL atrasado");
                        if (logBackupBreached) breaches.Add("LOG atrasado");
                        
                        backupIssues.Add(new BackupIssueDto
                        {
                            InstanceName = reader["InstanceName"].ToString(),
                            Ambiente = reader["Ambiente"]?.ToString(),
                            Breaches = breaches,
                            LastFullBackup = reader["LastFullBackup"] != DBNull.Value ? Convert.ToDateTime(reader["LastFullBackup"]) : null,
                            LastLogBackup = reader["LastLogBackup"] != DBNull.Value ? Convert.ToDateTime(reader["LastLogBackup"]) : null
                        });
                    }

                    // Mantenimiento atrasado
                    if (!checkdbOk || !indexOptimizeOk)
                    {
                        maintenanceOverdueCount++;
                    }

                    // Instancias críticas (HealthScore < 70 = <70% de 100)
                    if (healthScore < 70)
                    {
                        var issues = new List<string>();
                        
                        if (diskWorstFreePct < 15)
                            issues.Add($"Disco crítico ({diskWorstFreePct:F1}% libre)");
                        
                        if (fullBackupBreached || logBackupBreached)
                            issues.Add("Backups atrasados");
                        
                        if (!checkdbOk)
                            issues.Add("CHECKDB atrasado");
                        
                        if (!indexOptimizeOk)
                            issues.Add("IndexOptimize atrasado");

                        criticalInstances.Add(new CriticalInstanceDto
                        {
                            InstanceName = reader["InstanceName"].ToString(),
                            Ambiente = reader["Ambiente"]?.ToString(),
                            HealthScore = healthScore,
                            HealthStatus = reader["HealthStatus"].ToString(),
                            Issues = issues
                        });
                    }
                }

                // Health Summary
                var healthSummary = new HealthScoreSummaryDto
                {
                    TotalInstances = totalInstances,
                    HealthyCount = healthyCount,
                    WarningCount = warningCount,
                    CriticalCount = criticalCount,
                    AvgScore = totalInstances > 0 ? totalScore / totalInstances : 0,
                    LastUpdate = DateTime.UtcNow // Simplificado - podrías obtenerlo de la vista
                };
                
                // Ordenar instancias críticas
                var orderedCriticalInstances = criticalInstances
                    .OrderBy(i => GetAmbientePriority(i.Ambiente))
                    .ThenBy(i => i.HealthScore)
                    .Take(10)
                    .ToList();

                // Ordenar backup issues
                var orderedBackupIssues = backupIssues
                    .OrderBy(b => GetAmbientePriority(b.Ambiente))
                    .ThenByDescending(b => b.Breaches.Count)
                    .Take(10)
                    .ToList();

                return new OverviewDataDto
                {
                    HealthSummary = healthSummary,
                    CriticalDisksCount = criticalDisksCount,
                    BackupsOverdueCount = backupsOverdueCount,
                    MaintenanceOverdueCount = maintenanceOverdueCount,
                    FailedJobsCount = 0, // Requiere integración con Jobs
                    CriticalInstances = orderedCriticalInstances,
                    BackupIssues = orderedBackupIssues
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener datos del overview desde nuevas tablas");
                throw;
            }
        }

        private int GetAmbientePriority(string? ambiente)
        {
            if (string.IsNullOrWhiteSpace(ambiente))
                return 99; // Sin ambiente definido, última prioridad

            var ambienteLower = ambiente.ToLower();

            if (ambienteLower.Contains("prod"))
                return 1; // Producción - máxima prioridad

            if (ambienteLower.Contains("test") || ambienteLower.Contains("qa"))
                return 2; // Testing/QA - segunda prioridad

            if (ambienteLower.Contains("dev") || ambienteLower.Contains("desarrollo"))
                return 3; // Desarrollo - tercera prioridad

            return 10; // Otros ambientes
        }

        private T? ParseJson<T>(string? json) where T : class
        {
            if (string.IsNullOrWhiteSpace(json))
                return null;

            try
            {
                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                };
                return JsonSerializer.Deserialize<T>(json, options);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error al parsear JSON: {Json}", json?.Substring(0, Math.Min(100, json.Length)));
                return null;
            }
        }

        private static List<VolumeInfo>? ParseDiskDetails(string? diskDetails)
        {
            if (string.IsNullOrWhiteSpace(diskDetails))
                return null;

            try
            {
                // Formato: C:\|500.5|125.2|25,D:\|1000|750|75
                var volumes = new List<VolumeInfo>();
                var diskEntries = diskDetails.Split(',', StringSplitOptions.RemoveEmptyEntries);

                foreach (var entry in diskEntries)
                {
                    var parts = entry.Split('|', StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 4)
                    {
                        volumes.Add(new VolumeInfo
                        {
                            Drive = parts[0].Trim(),
                            TotalGB = decimal.TryParse(parts[1], out var total) ? total : 0,
                            FreeGB = decimal.TryParse(parts[2], out var free) ? free : 0,
                            FreePct = decimal.TryParse(parts[3], out var pct) ? pct : 0
                        });
                    }
                }

                return volumes.Count > 0 ? volumes : null;
            }
            catch
            {
                return null;
            }
        }
    }
}

