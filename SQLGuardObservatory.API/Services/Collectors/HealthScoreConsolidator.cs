using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.Collectors;
using SQLGuardObservatory.API.Models.HealthScoreV3;
using SQLGuardObservatory.API.Services;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Servicio consolidador que calcula el HealthScore final
/// 
/// Caracteristicas:
/// - 8 categorias con pesos configurables desde BD (total = 100%)
/// - Penalizaciones SELECTIVAS (NO caps globales)
/// - Health Status: Healthy (>=90), Warning (75-89), Risk (60-74), Critical (menos de 60)
/// 
/// Categorias ELIMINADAS (ya no se recolectan ni ponderan):
/// - DatabaseStates, ErroresCriticos, ConfiguracionTempdb, Autogrowth
/// </summary>
public class HealthScoreConsolidator : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HealthScoreConsolidator> _logger;
    private readonly TimeSpan _consolidationInterval = TimeSpan.FromMinutes(5);

    // Pesos por defecto (se sobrescriben con valores de BD si existen)
    // 8 categorias activas - Total: 100%
    private static readonly Dictionary<string, decimal> DefaultWeights = new()
    {
        ["Backups"] = 23m,
        ["AlwaysOn"] = 17m,
        ["CPU"] = 12m,
        ["Memoria"] = 10m,
        ["IO"] = 13m,
        ["Discos"] = 9m,
        ["Waits"] = 10m,
        ["Maintenance"] = 6m
    };

    public HealthScoreConsolidator(
        IServiceProvider serviceProvider,
        ILogger<HealthScoreConsolidator> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene los pesos de cada collector desde la BD
    /// </summary>
    private async Task<Dictionary<string, decimal>> GetCategoryWeightsAsync(ApplicationDbContext context, CancellationToken ct)
    {
        var configs = await context.CollectorConfigs
            .Where(c => c.IsEnabled && c.Weight > 0)
            .ToListAsync(ct);

        var weights = new Dictionary<string, decimal>(DefaultWeights);

        foreach (var config in configs)
        {
            // Mapear nombre del collector a categoria
            var category = config.CollectorName switch
            {
                "Maintenance" => "Maintenance",
                _ => config.CollectorName
            };

            if (weights.ContainsKey(category))
            {
                weights[category] = config.Weight;
            }
        }

        // Normalizar pesos para que sumen 100%
        var total = weights.Values.Sum();
        if (total > 0 && Math.Abs(total - 100m) > 0.01m)
        {
            var factor = 100m / total;
            foreach (var key in weights.Keys.ToList())
            {
                weights[key] = Math.Round(weights[key] * factor, 2);
            }
        }

        return weights;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("HealthScoreConsolidator starting...");
        
        // Pre-poblar el caché del Overview inmediatamente si hay datos previos
        // Esto evita que la primera carga después del login sea lenta
        await PrePopulateOverviewCacheAsync(stoppingToken);
        
        // Esperar a que los collectors empiecen a generar datos
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConsolidateScoresAsync(stoppingToken);
                
                // Actualizar el caché del Overview después de consolidar los scores
                await RefreshOverviewCacheAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error consolidating health scores");
            }

            await Task.Delay(_consolidationInterval, stoppingToken);
        }
    }

    /// <summary>
    /// Pre-pobla el caché del Overview al iniciar el backend.
    /// Usa datos existentes de collectors previos para tener datos disponibles inmediatamente.
    /// </summary>
    private async Task PrePopulateOverviewCacheAsync(CancellationToken ct)
    {
        try
        {
            _logger.LogInformation("Pre-poblando caché del Overview...");
            
            using var scope = _serviceProvider.CreateScope();
            var cacheService = scope.ServiceProvider.GetService<IOverviewSummaryCacheService>();
            
            if (cacheService != null)
            {
                // Verificar si ya hay caché reciente (menos de 10 minutos)
                var existingCache = await cacheService.GetCachedDataAsync(ct);
                if (existingCache != null && existingCache.LastUpdatedUtc > DateTime.UtcNow.AddMinutes(-10))
                {
                    _logger.LogInformation("Caché del Overview ya existe y es reciente, saltando pre-población");
                    return;
                }
                
                await cacheService.RefreshCacheAsync("StartupPrePopulate", ct);
                _logger.LogInformation("Caché del Overview pre-poblado exitosamente");
            }
        }
        catch (Exception ex)
        {
            // No es crítico si falla - el caché se poblará cuando se solicite
            _logger.LogWarning(ex, "Error pre-poblando caché del Overview (se poblará en demanda)");
        }
    }

    /// <summary>
    /// Actualiza el caché del Overview Dashboard
    /// </summary>
    private async Task RefreshOverviewCacheAsync(CancellationToken ct)
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var cacheService = scope.ServiceProvider.GetService<IOverviewSummaryCacheService>();
            
            if (cacheService != null)
            {
                await cacheService.RefreshCacheAsync("HealthScoreConsolidator", ct);
            }
        }
        catch (Exception ex)
        {
            // No propagar el error para no afectar el ciclo de consolidación
            _logger.LogWarning(ex, "Error refreshing Overview cache after consolidation");
        }
    }

    public async Task ConsolidateScoresAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var instanceProvider = scope.ServiceProvider.GetRequiredService<IInstanceProvider>();

        // Cargar excepciones de mantenimiento activas
        var maintenanceExceptions = await LoadMaintenanceExceptionsAsync(context, ct);
        _logger.LogDebug("Excepciones de mantenimiento cargadas: CHECKDB={CheckdbCount}, IndexOptimize={IndexCount}",
            maintenanceExceptions.CheckdbExceptions.Count, maintenanceExceptions.IndexOptimizeExceptions.Count);

        var instances = await instanceProvider.GetFilteredInstancesAsync(ct: ct);
        _logger.LogInformation("Consolidating scores for {Count} instances", instances.Count);

        foreach (var instance in instances)
        {
            try
            {
                await ConsolidateInstanceScoreAsync(context, instance.InstanceName, maintenanceExceptions, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error consolidating score for {Instance}", instance.InstanceName);
            }
        }
    }

    /// <summary>
    /// Carga las excepciones de mantenimiento activas desde la BD
    /// </summary>
    private async Task<MaintenanceExceptions> LoadMaintenanceExceptionsAsync(ApplicationDbContext context, CancellationToken ct)
    {
        var exceptions = await context.Set<CollectorException>()
            .AsNoTracking()
            .Where(e => e.CollectorName == "Maintenance" && e.IsActive)
            .ToListAsync(ct);

        var result = new MaintenanceExceptions();

        foreach (var ex in exceptions)
        {
            if (ex.ExceptionType.Equals("CHECKDB", StringComparison.OrdinalIgnoreCase))
            {
                result.CheckdbExceptions.Add(ex.ServerName);
            }
            else if (ex.ExceptionType.Equals("IndexOptimize", StringComparison.OrdinalIgnoreCase))
            {
                result.IndexOptimizeExceptions.Add(ex.ServerName);
            }
        }

        return result;
    }

    /// <summary>
    /// Verifica si una instancia está exceptuada de un tipo de mantenimiento
    /// Soporta nombre de instancia completo, hostname y nombre corto (sin FQDN)
    /// </summary>
    private static bool IsExcepted(string instanceName, HashSet<string> exceptions)
    {
        if (exceptions.Count == 0) return false;

        var hostname = instanceName.Split('\\')[0];
        var shortName = hostname.Split('.')[0];

        return exceptions.Contains(instanceName)
            || exceptions.Contains(hostname)
            || exceptions.Contains(shortName);
    }

    private async Task ConsolidateInstanceScoreAsync(ApplicationDbContext context, string instanceName, MaintenanceExceptions maintenanceExceptions, CancellationToken ct)
    {
        // Obtener los datos más recientes de cada collector
        var cutoffTime = DateTime.Now.AddHours(-1);

        var cpuData = await context.InstanceHealthCPU
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var memoriaData = await context.InstanceHealthMemoria
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var ioData = await context.InstanceHealthIO
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var discosData = await context.InstanceHealthDiscos
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var backupsData = await context.InstanceHealthBackups
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var alwaysOnData = await context.InstanceHealthAlwaysOn
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var logChainData = await context.InstanceHealthLogChain
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        // NOTA: DatabaseStates, ErroresCriticos, ConfiguracionTempdb y Autogrowth fueron eliminados del HealthScore

        var maintenanceData = await context.InstanceHealthMaintenance
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var waitsData = await context.InstanceHealthWaits
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        // Si no hay datos recientes, salir
        if (cpuData == null && memoriaData == null && backupsData == null)
        {
            _logger.LogDebug("No recent data for {Instance}, skipping consolidation", instanceName);
            return;
        }

        // Obtener pesos configurados desde la BD
        var categoryWeights = await GetCategoryWeightsAsync(context, ct);

        // Verificar excepciones de mantenimiento para esta instancia
        var isCheckdbExcepted = IsExcepted(instanceName, maintenanceExceptions.CheckdbExceptions);
        var isIndexOptimizeExcepted = IsExcepted(instanceName, maintenanceExceptions.IndexOptimizeExceptions);

        // Calcular scores individuales (8 categorias activas)
        var scores = new Dictionary<string, int>
        {
            ["CPU"] = CalculateCPUScore(cpuData, waitsData),
            ["Memoria"] = CalculateMemoriaScore(memoriaData, waitsData),
            ["IO"] = CalculateIOScore(ioData, waitsData),
            ["Discos"] = CalculateDiscosScore(discosData),
            ["Waits"] = CalculateWaitsScore(waitsData),
            ["Backups"] = CalculateBackupsScore(backupsData),
            ["AlwaysOn"] = CalculateAlwaysOnScore(alwaysOnData),
            ["Maintenance"] = CalculateMaintenanceScore(maintenanceData, isCheckdbExcepted, isIndexOptimizeExcepted)
        };

        // LogChain se calcula pero NO se pondera (guardamos para historial)
        var logChainScore = CalculateLogChainScore(logChainData);

        // Calcular contribuciones base usando pesos de BD
        var contributions = new Dictionary<string, decimal>();
        foreach (var (category, score) in scores)
        {
            if (categoryWeights.TryGetValue(category, out var weight))
            {
                contributions[category] = Math.Round((score * weight) / 100m, 0);
            }
        }

        // Aplicar PENALIZACIONES SELECTIVAS simplificadas (sin las categorías eliminadas)
        ApplySelectivePenalties(contributions, scores, discosData);

        // Calcular score final (suma de contribuciones con penalizaciones)
        var totalScore = (int)contributions.Values.Sum();

        // Crear registro consolidado
        var healthScore = new InstanceHealthScore
        {
            InstanceName = instanceName,
            Ambiente = cpuData?.Ambiente ?? backupsData?.Ambiente,
            HostingSite = cpuData?.HostingSite ?? backupsData?.HostingSite,
            SqlVersion = cpuData?.SqlVersion ?? backupsData?.SqlVersion,
            CollectedAtUtc = DateTime.Now,
            HealthScore = totalScore,
            HealthStatus = GetHealthStatus(totalScore),
            
            // Scores individuales (0-100) - 8 categorías activas
            BackupsScore = scores["Backups"],
            AlwaysOnScore = scores["AlwaysOn"],
            LogChainScore = logChainScore,  // Se guarda pero NO se pondera
            DatabaseStatesScore = 0,  // ELIMINADO - ya no se recolecta
            CPUScore = scores["CPU"],
            MemoriaScore = scores["Memoria"],
            IOScore = scores["IO"],
            DiscosScore = scores["Discos"],
            WaitsScore = scores["Waits"],
            ErroresCriticosScore = 0,  // ELIMINADO - ya no se recolecta
            MantenimientosScore = scores["Maintenance"],
            ConfiguracionTempdbScore = 0,  // ELIMINADO - ya no se recolecta
            AutogrowthScore = 0,  // ELIMINADO - ya no se recolecta
            
            // Diagnostico inteligente de I/O (deshabilitado sin TempDB data)
            TempDBIODiagnosis = null,
            TempDBIOSuggestion = null,
            TempDBIOSeverity = "OK",
            
            // Contribuciones ponderadas (8 categorías activas)
            BackupsContribution = (int)contributions.GetValueOrDefault("Backups"),
            AlwaysOnContribution = (int)contributions.GetValueOrDefault("AlwaysOn"),
            LogChainContribution = 0,  // Ya no se pondera
            DatabaseStatesContribution = 0,  // ELIMINADO
            CPUContribution = (int)contributions.GetValueOrDefault("CPU"),
            MemoriaContribution = (int)contributions.GetValueOrDefault("Memoria"),
            IOContribution = (int)contributions.GetValueOrDefault("IO"),
            DiscosContribution = (int)contributions.GetValueOrDefault("Discos"),
            WaitsContribution = (int)contributions.GetValueOrDefault("Waits"),
            ErroresCriticosContribution = 0,  // ELIMINADO
            MantenimientosContribution = (int)contributions.GetValueOrDefault("Maintenance"),
            ConfiguracionTempdbContribution = 0,  // ELIMINADO
            AutogrowthContribution = 0,  // ELIMINADO
            
            GlobalCap = 100 // No usamos cap global, solo penalizaciones selectivas
        };

        context.InstanceHealthScores.Add(healthScore);
        await context.SaveChangesAsync(ct);

        _logger.LogDebug("Consolidated score for {Instance}: {Score}", instanceName, healthScore.HealthScore);
    }

    /// <summary>
    /// Aplica penalizaciones SELECTIVAS simplificadas (8 categorías)
    /// En lugar de un cap global que penaliza TODO, penalizamos solo categorías RELACIONADAS
    /// </summary>
    private void ApplySelectivePenalties(
        Dictionary<string, decimal> contributions,
        Dictionary<string, int> scores,
        InstanceHealthDiscos? discosData)
    {
        // PENALIZACION SELECTIVA 1: Backups criticos
        if (scores["Backups"] == 0)
        {
            contributions["AlwaysOn"] = Math.Round(contributions["AlwaysOn"] * 0.8m);  // -20% (DR complementario)
        }

        // PENALIZACIÓN SELECTIVA 2: Discos críticos (< 10% libre)
        if (scores["Discos"] < 30)
        {
            contributions["IO"] = Math.Round(contributions["IO"] * 0.7m);  // -30% (disco lleno afecta I/O)
        }
    }

    // NOTA: GetIODiagnosisForTempDB fue eliminado (ConfiguracionTempdb desactivado)

    private static string GetHealthStatus(int score) => score switch
    {
        >= 90 => "Healthy",
        >= 75 => "Warning",
        >= 60 => "Risk",
        _ => "Critical"
    };

    #region Métodos de cálculo de score por categoría (lógica exacta del PowerShell)

    private static int CalculateCPUScore(InstanceHealthCPU? data, InstanceHealthWaits? waitsData)
    {
        if (data == null) return 100;
        
        var score = data.P95CPUPercent switch
        {
            <= 80 => 100,
            <= 90 => 70,
            _ => 40
        };

        var cap = 100;

        // RunnableTask >1 sostenido => cap 70
        if (data.RunnableTasks > 1)
            cap = 70;

        // Waits de CPU
        if (waitsData != null && waitsData.TotalWaitMs > 0)
        {
            var parallelismMs = waitsData.CXPacketWaitMs + waitsData.CXConsumerWaitMs;
            var parallelismPct = (parallelismMs * 100m) / waitsData.TotalWaitMs;
            
            if (parallelismPct > 15)
                score = Math.Min(score, 50);
            else if (parallelismPct > 10)
                score = Math.Min(score, 70);

            var sosYieldMs = waitsData.SOSSchedulerYieldMs;
            var sosYieldPct = (sosYieldMs * 100m) / waitsData.TotalWaitMs;

            if (sosYieldPct > 15)
            {
                score = Math.Min(score, 40);
                cap = Math.Min(cap, 70);
            }
            else if (sosYieldPct > 10)
                score = Math.Min(score, 60);
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    private static int CalculateMemoriaScore(InstanceHealthMemoria? data, InstanceHealthWaits? waitsData)
    {
        if (data == null) return 100;

        // PLE Score (60% del score)
        int pleScore;
        if (data.PLETarget > 0)
        {
            var pleRatio = (decimal)data.PageLifeExpectancy / data.PLETarget;
            pleScore = pleRatio switch
            {
                >= 1.0m => 100,
                >= 0.7m => 80,
                >= 0.5m => 60,
                >= 0.3m => 40,
                _ => 20
            };
        }
        else
        {
            pleScore = data.PageLifeExpectancy switch
            {
                >= 300 => 100,
                >= 200 => 80,
                >= 100 => 60,
                _ => 40
            };
        }

        // Memory Grants Score (25%)
        var grantsScore = data.MemoryGrantsPending switch
        {
            0 => 100,
            <= 5 => 80,
            <= 10 => 50,
            _ => 0
        };

        // Uso de Memoria Score (15%)
        var usoScore = 100;
        if (data.MaxServerMemoryMB > 0)
        {
            var usoRatio = (decimal)data.TotalServerMemoryMB / data.MaxServerMemoryMB;
            usoScore = usoRatio switch
            {
                >= 0.95m => 100,
                >= 0.80m => 90,
                >= 0.60m => 70,
                _ => 50
            };
        }

        var score = (int)((pleScore * 0.6m) + (grantsScore * 0.25m) + (usoScore * 0.15m));
        var cap = 100;

        // Waits de memoria
        if (waitsData != null && waitsData.TotalWaitMs > 0)
        {
            var resSemMs = waitsData.ResourceSemaphoreWaitMs;
            var resSemPct = (resSemMs * 100m) / waitsData.TotalWaitMs;

            if (resSemPct > 5)
            {
                score = Math.Min(score, 40);
                cap = Math.Min(cap, 60);
            }
            else if (resSemPct > 2)
                score = Math.Min(score, 60);
        }

        // Stolen Memory
        if (data.TotalServerMemoryMB > 0 && data.StolenServerMemoryMB > 0)
        {
            var stolenPct = (data.StolenServerMemoryMB * 100m) / data.TotalServerMemoryMB;

            if (stolenPct > 50)
            {
                score = Math.Min(score, 50);
                cap = Math.Min(cap, 70);
            }
            else if (stolenPct > 30)
                score = Math.Min(score, 70);
        }

        // Caps adicionales
        if (data.PLETarget > 0 && data.PageLifeExpectancy < (data.PLETarget * 0.15))
            cap = Math.Min(cap, 60);
        if (data.MemoryGrantsPending > 10)
            cap = Math.Min(cap, 60);

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    private static int CalculateIOScore(InstanceHealthIO? data, InstanceHealthWaits? waitsData)
    {
        if (data == null) return 100;

        var avgLatency = (data.DataFileAvgReadMs + data.DataFileAvgWriteMs + data.LogFileAvgWriteMs) / 3m;
        
        var score = avgLatency switch
        {
            <= 5 => 100,
            <= 10 => 80,
            <= 20 => 60,
            _ => 40
        };

        var cap = 100;

        // Log p95 >20ms => cap 70
        if (data.LogFileAvgWriteMs > 20)
            cap = 70;

        // Waits de I/O
        if (waitsData != null && waitsData.TotalWaitMs > 0)
        {
            var pageIOLatchMs = waitsData.PageIOLatchWaitMs;
            var pageIOLatchPct = (pageIOLatchMs * 100m) / waitsData.TotalWaitMs;

            if (pageIOLatchPct > 10)
            {
                score = Math.Min(score, 40);
                cap = Math.Min(cap, 60);
            }
            else if (pageIOLatchPct > 5)
                score = Math.Min(score, 60);

            var writeLogMs = waitsData.WriteLogWaitMs;
            var writeLogPct = (writeLogMs * 100m) / waitsData.TotalWaitMs;

            if (writeLogPct > 10)
            {
                score = Math.Min(score, 50);
                cap = Math.Min(cap, 70);
            }
            else if (writeLogPct > 5)
                score = Math.Min(score, 70);

            var asyncIOMs = waitsData.AsyncIOCompletionMs;
            var asyncIOPct = (asyncIOMs * 100m) / waitsData.TotalWaitMs;

            if (asyncIOPct > 20)
                score = Math.Min(score, 80);
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    private static int CalculateDiscosScore(InstanceHealthDiscos? data)
    {
        if (data == null) return 100;

        // Usar WorstFreePct (el PowerShell usa WorstRealFreePct si está disponible)
        var worstFreePct = data.WorstFreePct;

        var score = worstFreePct switch
        {
            >= 20 => 100,
            >= 15 => 80,
            >= 10 => 60,
            >= 5 => 40,
            _ => 0
        };

        // Analizar volúmenes para alertas reales (v3.3)
        if (!string.IsNullOrEmpty(data.VolumesJson))
        {
            try
            {
                var volumes = JsonSerializer.Deserialize<List<VolumeInfoForDiagnosis>>(data.VolumesJson);
                var alertedVolumes = volumes?.Where(v => v.IsAlerted).ToList() ?? new();

                if (alertedVolumes.Count > 0)
                {
                    var worstAlertedPct = alertedVolumes.Min(v => v.RealFreePct ?? 100);

                    if (worstAlertedPct <= 5)
                        score = 0;
                    else if (worstAlertedPct <= 10)
                        score = Math.Min(score, 30);
                }
                else if (worstFreePct < 10)
                {
                    var hasAnyGrowthFiles = volumes?.Any(v => v.FilesWithGrowth > 0) ?? false;
                    if (!hasAnyGrowthFiles)
                        score = Math.Min(100, score + 20);
                }
            }
            catch { /* Ignorar errores de parseo */ }
        }

        return Math.Clamp(score, 0, 100);
    }

    private static int CalculateBackupsScore(InstanceHealthBackups? data)
    {
        if (data == null) return 0;

        if (data.LogBackupBreached)
            return 0;
        if (data.FullBackupBreached)
            return 0;
        return 100;
    }

    private static int CalculateAlwaysOnScore(InstanceHealthAlwaysOn? data)
    {
        if (data == null || !data.AlwaysOnEnabled)
            return 100;

        var score = 100;
        var cap = 100;

        if (data.SuspendedCount > 0)
        {
            score = 0;
            cap = 60;
        }
        else if (data.SynchronizedCount < data.DatabaseCount)
        {
            score = 50;
            cap = 60;
        }
        else if (data.MaxSendQueueKB > 100000)
            score = 70;
        else if (data.MaxRedoQueueKB > 100000)
            score = 80;

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    private static int CalculateLogChainScore(InstanceHealthLogChain? data)
    {
        if (data == null) return 100;

        if (data.MaxHoursSinceLogBackup > 24 && data.BrokenChainCount > 0)
            return 0;
        if (data.BrokenChainCount > 2)
            return 20;
        if (data.BrokenChainCount == 1)
            return 50;
        if (data.FullDBsWithoutLogBackup == 1)
            return 80;
        return 100;
    }

    // NOTA: CalculateDatabaseStatesScore y CalculateErroresScore fueron eliminados (categorías desactivadas)

    /// <summary>
    /// Calcula el score de mantenimiento considerando excepciones configuradas
    /// Si CHECKDB está exceptuado, no penaliza por falta de CHECKDB
    /// Si IndexOptimize está exceptuado, no penaliza por falta de IndexOptimize
    /// </summary>
    private static int CalculateMaintenanceScore(InstanceHealthMaintenance? data, bool isCheckdbExcepted, bool isIndexOptimizeExcepted)
    {
        // Si está completamente exceptuado, score perfecto
        if (isCheckdbExcepted && isIndexOptimizeExcepted)
            return 100;

        // Si no hay datos y no está exceptuado de CHECKDB, score 0
        if (data == null)
            return isCheckdbExcepted ? 100 : 0;

        var score = 100;

        // Evaluar CHECKDB (solo si NO está exceptuado)
        if (!isCheckdbExcepted)
        {
            if (data.LastCheckdb == null)
            {
                score -= 50; // Sin CHECKDB = -50 puntos
            }
            else
            {
                var checkdbDays = (DateTime.Now - data.LastCheckdb.Value).TotalDays;
                if (checkdbDays > 30)
                    score -= 50;
                else if (checkdbDays > 14)
                    score -= 25;
                else if (checkdbDays > 7)
                    score -= 10;
            }
        }

        // Evaluar IndexOptimize (solo si NO está exceptuado)
        if (!isIndexOptimizeExcepted)
        {
            if (data.LastIndexOptimize == null)
            {
                score -= 30; // Sin IndexOptimize = -30 puntos
            }
            else
            {
                var indexDays = (DateTime.Now - data.LastIndexOptimize.Value).TotalDays;
                if (indexDays > 30)
                    score -= 30;
                else if (indexDays > 14)
                    score -= 15;
                else if (indexDays > 7)
                    score -= 5;
            }
        }

        return Math.Clamp(score, 0, 100);
    }

    // NOTA: CalculateTempDBScore y CalculateAutogrowthScore fueron eliminados (categorías desactivadas)

    /// <summary>
    /// Calcula el score de Waits (NUEVO - reemplaza LogChain en ponderacion)
    /// Evalua la salud del servidor basado en esperas de SQL Server
    /// </summary>
    private static int CalculateWaitsScore(InstanceHealthWaits? data)
    {
        if (data == null) return 100;

        var score = 100;
        var cap = 100;

        // Si no hay waits significativos, score perfecto
        if (data.TotalWaitMs == 0) return 100;

        // Evaluar blocking (mas critico)
        if (data.BlockedSessionCount > 10 || data.MaxBlockTimeSeconds > 60)
        {
            score = 30;
            cap = 50;
        }
        else if (data.BlockedSessionCount > 5 || data.MaxBlockTimeSeconds > 30)
        {
            score = 50;
            cap = 70;
        }
        else if (data.BlockedSessionCount > 0 || data.MaxBlockTimeSeconds > 10)
        {
            score = Math.Min(score, 70);
        }

        // Evaluar waits de I/O (PAGEIOLATCH)
        var pageIOPct = data.TotalWaitMs > 0 
            ? (data.PageIOLatchWaitMs * 100m) / data.TotalWaitMs 
            : 0;
        
        if (pageIOPct > 20)
        {
            score = Math.Min(score, 40);
            cap = Math.Min(cap, 60);
        }
        else if (pageIOPct > 10)
        {
            score = Math.Min(score, 60);
        }
        else if (pageIOPct > 5)
        {
            score = Math.Min(score, 80);
        }

        // Evaluar waits de CPU (CXPACKET, SOS_SCHEDULER_YIELD)
        var cpuWaitMs = data.CXPacketWaitMs + data.CXConsumerWaitMs + data.SOSSchedulerYieldMs;
        var cpuWaitPct = data.TotalWaitMs > 0 
            ? (cpuWaitMs * 100m) / data.TotalWaitMs 
            : 0;

        if (cpuWaitPct > 30)
        {
            score = Math.Min(score, 50);
            cap = Math.Min(cap, 70);
        }
        else if (cpuWaitPct > 20)
        {
            score = Math.Min(score, 70);
        }
        else if (cpuWaitPct > 10)
        {
            score = Math.Min(score, 85);
        }

        // Evaluar waits de memoria (RESOURCE_SEMAPHORE)
        var memWaitPct = data.TotalWaitMs > 0 
            ? (data.ResourceSemaphoreWaitMs * 100m) / data.TotalWaitMs 
            : 0;

        if (memWaitPct > 10)
        {
            score = Math.Min(score, 40);
            cap = Math.Min(cap, 60);
        }
        else if (memWaitPct > 5)
        {
            score = Math.Min(score, 60);
        }
        else if (memWaitPct > 2)
        {
            score = Math.Min(score, 80);
        }

        // Evaluar waits de log (WRITELOG)
        var logWaitPct = data.TotalWaitMs > 0 
            ? (data.WriteLogWaitMs * 100m) / data.TotalWaitMs 
            : 0;

        if (logWaitPct > 15)
        {
            score = Math.Min(score, 50);
            cap = Math.Min(cap, 70);
        }
        else if (logWaitPct > 10)
        {
            score = Math.Min(score, 70);
        }
        else if (logWaitPct > 5)
        {
            score = Math.Min(score, 85);
        }

        return Math.Clamp(Math.Min(score, cap), 0, 100);
    }

    #endregion

    private class VolumeInfoForDiagnosis
    {
        public string? MountPoint { get; set; }
        public string? MediaType { get; set; }
        public string? HealthStatus { get; set; }
        public int DatabaseCount { get; set; }
        public bool IsAlerted { get; set; }
        public decimal? RealFreePct { get; set; }
        public int FilesWithGrowth { get; set; }
        /// <summary>
        /// v3.5: Indica si es un disco crítico del sistema (C, E, F, G, H)
        /// </summary>
        public bool IsCriticalSystemDisk { get; set; }
    }

    /// <summary>
    /// Clase auxiliar para almacenar excepciones de mantenimiento cargadas de la BD
    /// </summary>
    private class MaintenanceExceptions
    {
        public HashSet<string> CheckdbExceptions { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> IndexOptimizeExceptions { get; } = new(StringComparer.OrdinalIgnoreCase);
    }
}
