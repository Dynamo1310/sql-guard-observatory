using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models.HealthScoreV3;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Servicio consolidador que calcula el HealthScore final
/// basado en los datos recolectados por cada collector
/// </summary>
public class HealthScoreConsolidator : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<HealthScoreConsolidator> _logger;
    private readonly TimeSpan _consolidationInterval = TimeSpan.FromMinutes(5);

    // Pesos por categoría (suma = 100%)
    private static readonly Dictionary<string, decimal> CategoryWeights = new()
    {
        ["Backups"] = 18m,
        ["AlwaysOn"] = 14m,
        ["LogChain"] = 5m,
        ["DatabaseStates"] = 3m,
        ["CPU"] = 10m,
        ["Memoria"] = 8m,
        ["IO"] = 10m,
        ["Discos"] = 7m,
        ["ErroresCriticos"] = 7m,
        ["Mantenimientos"] = 5m,
        ["ConfiguracionTempdb"] = 8m,
        ["Autogrowth"] = 5m
    };

    public HealthScoreConsolidator(
        IServiceProvider serviceProvider,
        ILogger<HealthScoreConsolidator> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("HealthScoreConsolidator starting...");
        
        // Esperar a que los collectors empiecen a generar datos
        await Task.Delay(TimeSpan.FromMinutes(2), stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await ConsolidateScoresAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error consolidating health scores");
            }

            await Task.Delay(_consolidationInterval, stoppingToken);
        }
    }

    public async Task ConsolidateScoresAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var instanceProvider = scope.ServiceProvider.GetRequiredService<IInstanceProvider>();

        var instances = await instanceProvider.GetFilteredInstancesAsync(ct: ct);
        _logger.LogInformation("Consolidating scores for {Count} instances", instances.Count);

        foreach (var instance in instances)
        {
            try
            {
                await ConsolidateInstanceScoreAsync(context, instance.InstanceName, ct);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error consolidating score for {Instance}", instance.InstanceName);
            }
        }
    }

    private async Task ConsolidateInstanceScoreAsync(ApplicationDbContext context, string instanceName, CancellationToken ct)
    {
        // Obtener los datos más recientes de cada collector
        var cutoffTime = DateTime.Now.AddHours(-1); // Solo considerar datos de la última hora

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

        var dbStatesData = await context.InstanceHealthDatabaseStates
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var erroresData = await context.InstanceHealthErroresCriticos
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var maintenanceData = await context.InstanceHealthMaintenance
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var tempdbData = await context.InstanceHealthConfiguracionTempdb
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        var autogrowthData = await context.InstanceHealthAutogrowth
            .Where(x => x.InstanceName == instanceName && x.CollectedAtUtc >= cutoffTime)
            .OrderByDescending(x => x.CollectedAtUtc)
            .FirstOrDefaultAsync(ct);

        // Si no hay datos recientes, salir
        if (cpuData == null && memoriaData == null && backupsData == null)
        {
            _logger.LogDebug("No recent data for {Instance}, skipping consolidation", instanceName);
            return;
        }

        // Calcular scores individuales (usando lógica similar a PowerShell)
        var scores = new Dictionary<string, int>
        {
            ["CPU"] = CalculateCPUScore(cpuData),
            ["Memoria"] = CalculateMemoriaScore(memoriaData),
            ["IO"] = CalculateIOScore(ioData),
            ["Discos"] = CalculateDiscosScore(discosData),
            ["Backups"] = CalculateBackupsScore(backupsData),
            ["AlwaysOn"] = CalculateAlwaysOnScore(alwaysOnData),
            ["LogChain"] = CalculateLogChainScore(logChainData),
            ["DatabaseStates"] = CalculateDatabaseStatesScore(dbStatesData),
            ["ErroresCriticos"] = CalculateErroresScore(erroresData),
            ["Mantenimientos"] = CalculateMaintenanceScore(maintenanceData),
            ["ConfiguracionTempdb"] = CalculateTempDBScore(tempdbData),
            ["Autogrowth"] = CalculateAutogrowthScore(autogrowthData)
        };

        // Aplicar penalizaciones selectivas
        ApplySelectivePenalties(scores, discosData, autogrowthData, alwaysOnData);

        // Calcular contribuciones ponderadas
        var contributions = new Dictionary<string, decimal>();
        decimal totalScore = 0;

        foreach (var (category, score) in scores)
        {
            if (CategoryWeights.TryGetValue(category, out var weight))
            {
                var contribution = (score * weight) / 100m;
                contributions[category] = contribution;
                totalScore += contribution;
            }
        }

        // Crear registro consolidado
        var healthScore = new InstanceHealthScore
        {
            InstanceName = instanceName,
            Ambiente = cpuData?.Ambiente ?? backupsData?.Ambiente,
            HostingSite = cpuData?.HostingSite ?? backupsData?.HostingSite,
            SqlVersion = cpuData?.SqlVersion ?? backupsData?.SqlVersion,
            CollectedAtUtc = DateTime.Now,
            HealthScore = (int)Math.Round(totalScore),
            HealthStatus = GetHealthStatus((int)Math.Round(totalScore)),
            
            // Scores individuales
            BackupsScore = scores["Backups"],
            AlwaysOnScore = scores["AlwaysOn"],
            LogChainScore = scores["LogChain"],
            DatabaseStatesScore = scores["DatabaseStates"],
            CPUScore = scores["CPU"],
            MemoriaScore = scores["Memoria"],
            IOScore = scores["IO"],
            DiscosScore = scores["Discos"],
            ErroresCriticosScore = scores["ErroresCriticos"],
            MantenimientosScore = scores["Mantenimientos"],
            ConfiguracionTempdbScore = scores["ConfiguracionTempdb"],
            AutogrowthScore = scores["Autogrowth"],
            
            // Contribuciones (scores ponderados)
            BackupsContribution = (int)contributions.GetValueOrDefault("Backups"),
            AlwaysOnContribution = (int)contributions.GetValueOrDefault("AlwaysOn"),
            LogChainContribution = (int)contributions.GetValueOrDefault("LogChain"),
            DatabaseStatesContribution = (int)contributions.GetValueOrDefault("DatabaseStates"),
            CPUContribution = (int)contributions.GetValueOrDefault("CPU"),
            MemoriaContribution = (int)contributions.GetValueOrDefault("Memoria"),
            IOContribution = (int)contributions.GetValueOrDefault("IO"),
            DiscosContribution = (int)contributions.GetValueOrDefault("Discos"),
            ErroresCriticosContribution = (int)contributions.GetValueOrDefault("ErroresCriticos"),
            MantenimientosContribution = (int)contributions.GetValueOrDefault("Mantenimientos"),
            ConfiguracionTempdbContribution = (int)contributions.GetValueOrDefault("ConfiguracionTempdb"),
            AutogrowthContribution = (int)contributions.GetValueOrDefault("Autogrowth")
        };

        context.InstanceHealthScores.Add(healthScore);
        await context.SaveChangesAsync(ct);

        _logger.LogDebug("Consolidated score for {Instance}: {Score}", instanceName, healthScore.HealthScore);
    }

    private void ApplySelectivePenalties(
        Dictionary<string, int> scores,
        InstanceHealthDiscos? discosData,
        InstanceHealthAutogrowth? autogrowthData,
        InstanceHealthAlwaysOn? alwaysOnData)
    {
        // Penalización por Autogrowth crítico afecta Discos, IO, AlwaysOn
        if (scores["Autogrowth"] < 50)
        {
            var penaltyFactor = scores["Autogrowth"] / 100m;
            scores["Discos"] = (int)(scores["Discos"] * (0.7m + penaltyFactor * 0.3m));
            scores["IO"] = (int)(scores["IO"] * (0.8m + penaltyFactor * 0.2m));
        }

        // Penalización por LogChain rota afecta Backups
        if (scores["LogChain"] < 50)
        {
            scores["Backups"] = Math.Min(scores["Backups"], 60);
        }

        // Penalización por Database States crítico afecta todo
        if (scores["DatabaseStates"] < 20)
        {
            foreach (var key in scores.Keys.ToList())
            {
                if (key != "DatabaseStates")
                {
                    scores[key] = Math.Min(scores[key], 50);
                }
            }
        }
    }

    private static string GetHealthStatus(int score) => score switch
    {
        >= 80 => "Healthy",
        >= 60 => "Warning",
        _ => "Critical"
    };

    // Métodos de cálculo de score por categoría
    private static int CalculateCPUScore(InstanceHealthCPU? data)
    {
        if (data == null) return 100;
        
        var score = data.P95CPUPercent switch
        {
            <= 80 => 100,
            <= 90 => 70,
            _ => 40
        };

        if (data.RunnableTasks > 1)
            score = Math.Min(score, 70);

        return score;
    }

    private static int CalculateMemoriaScore(InstanceHealthMemoria? data)
    {
        if (data == null) return 100;

        var pleRatio = data.PLETarget > 0 ? (data.PageLifeExpectancy * 100.0m) / data.PLETarget : 100m;
        
        var score = pleRatio switch
        {
            >= 100 => 100,
            >= 70 => 80,
            >= 50 => 60,
            >= 30 => 40,
            _ => 20
        };

        if (data.MemoryGrantsPending > 10)
            score = Math.Min(score, 60);

        return score;
    }

    private static int CalculateIOScore(InstanceHealthIO? data)
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

        if (data.LogFileAvgWriteMs > 20)
            score = Math.Min(score, 70);

        return score;
    }

    private static int CalculateDiscosScore(InstanceHealthDiscos? data)
    {
        if (data == null) return 100;

        return data.WorstFreePct switch
        {
            >= 20 => 100,
            >= 15 => 80,
            >= 10 => 60,
            >= 5 => 40,
            _ => 0
        };
    }

    private static int CalculateBackupsScore(InstanceHealthBackups? data)
    {
        if (data == null) return 0; // Sin datos = sin backup

        if (data.LogBackupBreached)
            return 0;
        if (data.FullBackupBreached)
            return 0;
        return 100;
    }

    private static int CalculateAlwaysOnScore(InstanceHealthAlwaysOn? data)
    {
        if (data == null || !data.AlwaysOnEnabled)
            return 100; // No aplica

        if (data.SuspendedCount > 0)
            return 0;
        if (data.SynchronizedCount < data.DatabaseCount)
            return 50;
        
        var score = 100;
        if (data.MaxSendQueueKB > 100000)
            score -= 30;
        if (data.MaxRedoQueueKB > 100000)
            score -= 20;

        return Math.Max(0, score);
    }

    private static int CalculateLogChainScore(InstanceHealthLogChain? data)
    {
        if (data == null) return 100;

        if (data.MaxHoursSinceLogBackup > 24 && data.BrokenChainCount > 0)
            return 0;
        if (data.BrokenChainCount > 2)
            return 20;
        if (data.BrokenChainCount > 0)
            return 80;
        return 100;
    }

    private static int CalculateDatabaseStatesScore(InstanceHealthDatabaseStates? data)
    {
        if (data == null) return 100;

        if (data.SuspectCount > 0 || data.EmergencyCount > 0)
            return 0;
        if (data.OfflineCount > 0)
            return 0;
        if (data.SuspectPageCount > 0)
            return 40;
        if (data.RecoveryPendingCount > 0)
            return 40;
        return 100;
    }

    private static int CalculateErroresScore(InstanceHealthErroresCriticos? data)
    {
        if (data == null) return 100;

        var score = 100 - (data.Severity20PlusCount * 10);
        if (score < 60) score = 60;

        if (data.Severity20PlusLast1h > 0)
            score = Math.Min(score, 70);

        return score;
    }

    private static int CalculateMaintenanceScore(InstanceHealthMaintenance? data)
    {
        if (data == null) return 50; // Sin datos = posible problema

        if (data.CheckdbOk)
            return 100;

        // Calcular días desde último CHECKDB
        if (data.LastCheckdb.HasValue)
        {
            var days = (DateTime.Now - data.LastCheckdb.Value).TotalDays;
            return days switch
            {
                <= 7 => 100,
                <= 14 => 80,
                <= 30 => 50,
                _ => 0
            };
        }

        return 0;
    }

    private static int CalculateTempDBScore(InstanceHealthConfiguracionTempdb? data)
    {
        if (data == null) return 100;

        var score = 100;
        
        // Contención
        if (data.TempDBContentionScore > 50)
            score -= 30;
        else if (data.TempDBContentionScore > 20)
            score -= 15;
            
        // Latencia
        if (data.TempDBAvgWriteLatencyMs > 50)
            score -= 30;
        else if (data.TempDBAvgWriteLatencyMs > 20)
            score -= 15;
            
        // Configuración
        if (!data.TempDBAllSameSize)
            score -= 10;
        if (!data.TempDBGrowthConfigOK)
            score -= 10;
            
        // Espacio
        if (data.TempDBFreeSpacePct < 10)
            score -= 20;
        else if (data.TempDBFreeSpacePct < 20)
            score -= 10;

        return Math.Clamp(score, 0, 100);
    }

    private static int CalculateAutogrowthScore(InstanceHealthAutogrowth? data)
    {
        if (data == null) return 100;

        var score = data.AutogrowthEventsLast24h switch
        {
            <= 10 => 100,
            <= 50 => 80,
            <= 100 => 60,
            _ => 40
        };

        if (data.FilesNearLimit > 0)
            score -= 30;
        if (data.WorstPercentOfMax > 90)
            score = 0;

        return Math.Max(0, score);
    }
}

