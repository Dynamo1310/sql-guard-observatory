using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using SQLGuardObservatory.API.Models.Collectors;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IOverviewSummaryCacheService
{
    /// <summary>
    /// Recalcula y guarda el caché del Overview
    /// </summary>
    /// <param name="triggeredBy">Identificador del origen (ej: "HealthScoreConsolidator", "DiscosCollector")</param>
    /// <param name="ct">Token de cancelación</param>
    Task RefreshCacheAsync(string triggeredBy, CancellationToken ct = default);
    
    /// <summary>
    /// Obtiene los datos cacheados del Overview
    /// </summary>
    /// <returns>Datos del caché o null si no existe</returns>
    Task<OverviewSummaryCache?> GetCachedDataAsync(CancellationToken ct = default);
    
    /// <summary>
    /// Mapea los datos del caché al DTO de respuesta
    /// </summary>
    OverviewPageDataDto MapCacheToDto(OverviewSummaryCache cache);
}

/// <summary>
/// Servicio que gestiona el caché de datos del Overview.
/// Calcula y almacena los KPIs y listas para optimizar la carga del dashboard.
/// </summary>
public class OverviewSummaryCacheService : IOverviewSummaryCacheService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<OverviewSummaryCacheService> _logger;
    private readonly string _connectionString;
    private static readonly SemaphoreSlim _refreshLock = new(1, 1);
    
    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false
    };

    public OverviewSummaryCacheService(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<OverviewSummaryCacheService> logger)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _connectionString = configuration.GetConnectionString("ApplicationDb")
            ?? throw new InvalidOperationException("ApplicationDb connection string not configured");
    }

    public async Task RefreshCacheAsync(string triggeredBy, CancellationToken ct = default)
    {
        // Evitar ejecuciones concurrentes
        if (!await _refreshLock.WaitAsync(TimeSpan.FromSeconds(5), ct))
        {
            _logger.LogDebug("RefreshCacheAsync skipped - another refresh is in progress");
            return;
        }

        try
        {
            var startTime = DateTime.UtcNow;
            _logger.LogDebug("Refreshing Overview cache triggered by {TriggeredBy}...", triggeredBy);

            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

            // Ejecutar las 4 queries en paralelo
            var healthScoresTask = GetProductionHealthScoresAsync(ct);
            var criticalDisksTask = GetProductionCriticalDisksAsync(ct);
            var maintenanceTask = GetProductionMaintenanceOverdueAsync(context, ct);
            var backupBreachesTask = GetProductionBackupBreachesAsync(ct);

            await Task.WhenAll(healthScoresTask, criticalDisksTask, maintenanceTask, backupBreachesTask);

            var healthScores = healthScoresTask.Result;
            var criticalDisks = criticalDisksTask.Result;
            var maintenanceOverdue = maintenanceTask.Result;
            var backupBreaches = backupBreachesTask.Result;

            // Calcular KPIs
            var totalInstances = healthScores.Count;
            var healthyCount = healthScores.Count(s => s.HealthStatus == "Healthy");
            var warningCount = healthScores.Count(s => s.HealthStatus == "Warning");
            var riskCount = healthScores.Count(s => s.HealthStatus == "Risk");
            var criticalCount = healthScores.Count(s => s.HealthScore < 60);
            var avgScore = healthScores.Count > 0
                ? Math.Round((decimal)healthScores.Average(s => s.HealthScore), 2)
                : 0;

            // Backups atrasados - usar datos reales de la tabla InstanceHealth_Backups
            var backupIssues = backupBreaches.Select(b => new OverviewBackupIssueDto
            {
                InstanceName = b.InstanceName,
                Score = healthScores.FirstOrDefault(h => h.InstanceName.Equals(b.InstanceName, StringComparison.OrdinalIgnoreCase))?.BackupsScore ?? 0,
                FullBackupBreached = b.FullBackupBreached,
                LogBackupBreached = b.LogBackupBreached,
                LastFullBackup = b.LastFullBackup,
                LastLogBackup = b.LastLogBackup,
                Issues = BuildBackupIssuesList(b),
                BreachedDatabases = ParseBreachedDatabases(b.BackupDetails, b.FullBackupBreached, b.LogBackupBreached)
            })
            .OrderBy(b => b.Score)
            .ThenByDescending(b => b.FullBackupBreached) // FULL breach primero (más crítico)
            .ToList();

            // Instancias críticas (score < 60)
            var criticalInstances = healthScores
                .Where(s => s.HealthScore < 60)
                .Select(s => new OverviewCriticalInstanceDto
                {
                    InstanceName = s.InstanceName,
                    Ambiente = s.Ambiente,
                    HealthScore = s.HealthScore,
                    Score_Backups = s.BackupsScore,
                    Score_AlwaysOn = s.AlwaysOnScore,
                    Score_CPU = s.CPUScore,
                    Score_Memoria = s.MemoriaScore,
                    Score_Discos = s.DiscosScore,
                    Score_Maintenance = s.MantenimientosScore,
                    Issues = GetIssuesFromScores(s)
                })
                .OrderBy(i => i.HealthScore)
                .ToList();

            // Buscar o crear el registro de caché
            var cache = await context.OverviewSummaryCache
                .FirstOrDefaultAsync(c => c.CacheKey == "Production", ct);

            if (cache == null)
            {
                cache = new OverviewSummaryCache { CacheKey = "Production" };
                context.OverviewSummaryCache.Add(cache);
            }

            // Actualizar valores
            cache.TotalInstances = totalInstances;
            cache.HealthyCount = healthyCount;
            cache.WarningCount = warningCount;
            cache.RiskCount = riskCount;
            cache.CriticalCount = criticalCount;
            cache.AvgScore = avgScore;
            cache.BackupsOverdue = backupIssues.Count;
            cache.CriticalDisksCount = criticalDisks.Count;
            cache.MaintenanceOverdueCount = maintenanceOverdue.Count;

            // Serializar listas a JSON
            cache.CriticalInstancesJson = JsonSerializer.Serialize(criticalInstances, _jsonOptions);
            cache.BackupIssuesJson = JsonSerializer.Serialize(backupIssues, _jsonOptions);
            cache.CriticalDisksJson = JsonSerializer.Serialize(criticalDisks, _jsonOptions);
            cache.MaintenanceOverdueJson = JsonSerializer.Serialize(maintenanceOverdue, _jsonOptions);

            // Metadata
            cache.LastUpdatedUtc = DateTime.UtcNow;
            cache.LastUpdatedBy = triggeredBy;

            await context.SaveChangesAsync(ct);

            var elapsed = (DateTime.UtcNow - startTime).TotalMilliseconds;
            _logger.LogInformation(
                "Overview cache refreshed in {Elapsed}ms by {TriggeredBy}: {Total} instancias, {Critical} críticas, {Disks} discos, {Maint} mant.",
                elapsed, triggeredBy, totalInstances, criticalCount, criticalDisks.Count, maintenanceOverdue.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refreshing Overview cache");
            throw;
        }
        finally
        {
            _refreshLock.Release();
        }
    }

    public async Task<OverviewSummaryCache?> GetCachedDataAsync(CancellationToken ct = default)
    {
        using var scope = _serviceProvider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

        return await context.OverviewSummaryCache
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.CacheKey == "Production", ct);
    }

    public OverviewPageDataDto MapCacheToDto(OverviewSummaryCache cache)
    {
        var result = new OverviewPageDataDto
        {
            TotalInstances = cache.TotalInstances,
            HealthyCount = cache.HealthyCount,
            WarningCount = cache.WarningCount,
            RiskCount = cache.RiskCount,
            CriticalCount = cache.CriticalCount,
            AvgScore = (double)cache.AvgScore,
            BackupsOverdue = cache.BackupsOverdue,
            CriticalDisksCount = cache.CriticalDisksCount,
            MaintenanceOverdueCount = cache.MaintenanceOverdueCount,
            LastUpdate = cache.LastUpdatedUtc
        };

        // Deserializar listas
        if (!string.IsNullOrEmpty(cache.CriticalInstancesJson))
        {
            result.CriticalInstances = JsonSerializer.Deserialize<List<OverviewCriticalInstanceDto>>(
                cache.CriticalInstancesJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.BackupIssuesJson))
        {
            result.BackupIssues = JsonSerializer.Deserialize<List<OverviewBackupIssueDto>>(
                cache.BackupIssuesJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.CriticalDisksJson))
        {
            result.CriticalDisks = JsonSerializer.Deserialize<List<OverviewCriticalDiskDto>>(
                cache.CriticalDisksJson, _jsonOptions) ?? new();
        }

        if (!string.IsNullOrEmpty(cache.MaintenanceOverdueJson))
        {
            result.MaintenanceOverdue = JsonSerializer.Deserialize<List<OverviewMaintenanceOverdueDto>>(
                cache.MaintenanceOverdueJson, _jsonOptions) ?? new();
        }

        return result;
    }

    #region Private Query Methods

    /// <summary>
    /// Obtiene los health scores más recientes de producción
    /// </summary>
    private async Task<List<OverviewHealthScoreRaw>> GetProductionHealthScoresAsync(CancellationToken ct)
    {
        var results = new List<OverviewHealthScoreRaw>();

        var query = @"
            WITH RankedScores AS (
                SELECT 
                    InstanceName,
                    Ambiente,
                    HealthScore,
                    HealthStatus,
                    BackupsScore,
                    AlwaysOnScore,
                    CPUScore,
                    MemoriaScore,
                    DiscosScore,
                    MantenimientosScore,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Score
                WHERE Ambiente = 'Produccion'
            )
            SELECT 
                InstanceName,
                Ambiente,
                HealthScore,
                HealthStatus,
                BackupsScore,
                AlwaysOnScore,
                CPUScore,
                MemoriaScore,
                DiscosScore,
                MantenimientosScore
            FROM RankedScores 
            WHERE rn = 1
            ORDER BY HealthScore ASC";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 30;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new OverviewHealthScoreRaw
            {
                InstanceName = reader.GetString(0),
                Ambiente = reader.IsDBNull(1) ? null : reader.GetString(1),
                HealthScore = reader.GetInt32(2),
                HealthStatus = reader.IsDBNull(3) ? "Unknown" : reader.GetString(3),
                BackupsScore = reader.IsDBNull(4) ? 100 : reader.GetInt32(4),
                AlwaysOnScore = reader.IsDBNull(5) ? 100 : reader.GetInt32(5),
                CPUScore = reader.IsDBNull(6) ? 100 : reader.GetInt32(6),
                MemoriaScore = reader.IsDBNull(7) ? 100 : reader.GetInt32(7),
                DiscosScore = reader.IsDBNull(8) ? 100 : reader.GetInt32(8),
                MantenimientosScore = reader.IsDBNull(9) ? 100 : reader.GetInt32(9)
            });
        }

        return results;
    }

    /// <summary>
    /// Obtiene los discos críticos (alertados) de producción
    /// </summary>
    private async Task<List<OverviewCriticalDiskDto>> GetProductionCriticalDisksAsync(CancellationToken ct)
    {
        var results = new List<OverviewCriticalDiskDto>();

        var query = @"
            WITH LatestDiscos AS (
                SELECT 
                    InstanceName,
                    VolumesJson,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Discos
                WHERE Ambiente = 'Produccion'
            )
            SELECT InstanceName, VolumesJson
            FROM LatestDiscos
            WHERE rn = 1";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 60;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            var instanceName = reader.GetString(0);
            var volumesJson = reader.IsDBNull(1) ? null : reader.GetString(1);

            if (!string.IsNullOrEmpty(volumesJson))
            {
                try
                {
                    var volumes = JsonSerializer.Deserialize<List<DiskVolumeJson>>(volumesJson,
                        new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                    if (volumes != null)
                    {
                        foreach (var vol in volumes.Where(v => v.IsAlerted == true))
                        {
                            results.Add(new OverviewCriticalDiskDto
                            {
                                InstanceName = instanceName,
                                Drive = vol.MountPoint ?? vol.VolumeName ?? "N/A",
                                PorcentajeLibre = vol.FreePct ?? 0,
                                RealPorcentajeLibre = vol.RealFreePct ?? vol.FreePct ?? 0,
                                LibreGB = vol.FreeGB ?? 0,
                                RealLibreGB = vol.RealFreeGB ?? vol.FreeGB ?? 0,
                                EspacioInternoEnArchivosGB = vol.FreeSpaceInGrowableFilesGB ?? 0,
                                Estado = "Critico"
                            });
                        }
                    }
                }
                catch (JsonException ex)
                {
                    _logger.LogWarning(ex, "Error parseando VolumesJson para {Instance}", instanceName);
                }
            }
        }

        return results.OrderBy(d => d.RealPorcentajeLibre).ToList();
    }

    /// <summary>
    /// Obtiene el mantenimiento vencido de producción
    /// </summary>
    private async Task<List<OverviewMaintenanceOverdueDto>> GetProductionMaintenanceOverdueAsync(
        ApplicationDbContext context, CancellationToken ct)
    {
        var results = new List<OverviewMaintenanceOverdueDto>();
        var agProcessed = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            // 1. Cargar excepciones activas para Maintenance
            var checkdbExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var indexOptimizeExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            var exceptions = await context.Set<CollectorException>()
                .AsNoTracking()
                .Where(e => e.CollectorName == "Maintenance" && e.IsActive)
                .ToListAsync(ct);

            foreach (var ex in exceptions)
            {
                if (ex.ExceptionType.Equals("CHECKDB", StringComparison.OrdinalIgnoreCase))
                {
                    checkdbExceptions.Add(ex.ServerName);
                }
                else if (ex.ExceptionType.Equals("IndexOptimize", StringComparison.OrdinalIgnoreCase))
                {
                    indexOptimizeExceptions.Add(ex.ServerName);
                }
            }

            // 2. Query optimizada para mantenimiento vencido
            var query = @"
                WITH LatestMaintenance AS (
                    SELECT 
                        m.InstanceName,
                        m.CheckdbOk,
                        m.IndexOptimizeOk,
                        m.AGName,
                        m.LastCheckdb,
                        m.LastIndexOptimize,
                        ROW_NUMBER() OVER (PARTITION BY m.InstanceName ORDER BY m.CollectedAtUtc DESC) AS rn
                    FROM dbo.InstanceHealth_Maintenance m
                    WHERE m.Ambiente = 'Produccion'
                )
                SELECT InstanceName, CheckdbOk, IndexOptimizeOk, AGName, LastCheckdb, LastIndexOptimize
                FROM LatestMaintenance
                WHERE rn = 1 AND (CheckdbOk = 0 OR IndexOptimizeOk = 0)";

            await using var connection = new SqlConnection(_connectionString);
            await connection.OpenAsync(ct);

            await using var command = new SqlCommand(query, connection);
            command.CommandTimeout = 30;
            
            await using var reader = await command.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct))
            {
                var instanceName = reader.GetString(0);
                var checkdbOk = !reader.IsDBNull(1) && reader.GetBoolean(1);
                var indexOptimizeOk = !reader.IsDBNull(2) && reader.GetBoolean(2);
                var agName = reader.IsDBNull(3) ? null : reader.GetString(3);
                var lastCheckdb = reader.IsDBNull(4) ? (DateTime?)null : reader.GetDateTime(4);
                var lastIndexOptimize = reader.IsDBNull(5) ? (DateTime?)null : reader.GetDateTime(5);

                // Si pertenece a un AG y ya lo procesamos, saltar
                if (!string.IsNullOrEmpty(agName) && agProcessed.Contains(agName))
                {
                    continue;
                }

                // Verificar excepciones
                var hostname = instanceName.Split('\\')[0];
                var shortName = hostname.Split('.')[0];

                var isCheckdbExcepted = checkdbExceptions.Contains(instanceName)
                                     || checkdbExceptions.Contains(hostname)
                                     || checkdbExceptions.Contains(shortName);

                var isIndexOptimizeExcepted = indexOptimizeExceptions.Contains(instanceName)
                                           || indexOptimizeExceptions.Contains(hostname)
                                           || indexOptimizeExceptions.Contains(shortName);

                var checkdbVencido = !checkdbOk && !isCheckdbExcepted;
                var indexOptimizeVencido = !indexOptimizeOk && !isIndexOptimizeExcepted;

                if (!checkdbVencido && !indexOptimizeVencido)
                {
                    continue;
                }

                string tipo;
                if (checkdbVencido && indexOptimizeVencido)
                {
                    tipo = "CHECKDB e IndexOptimize";
                }
                else if (checkdbVencido)
                {
                    tipo = "CHECKDB";
                }
                else
                {
                    tipo = "IndexOptimize";
                }

                if (!string.IsNullOrEmpty(agName))
                {
                    agProcessed.Add(agName);
                }

                results.Add(new OverviewMaintenanceOverdueDto
                {
                    InstanceName = instanceName,
                    DisplayName = !string.IsNullOrEmpty(agName) ? agName : instanceName,
                    Tipo = tipo,
                    LastCheckdb = lastCheckdb,
                    LastIndexOptimize = lastIndexOptimize,
                    CheckdbVencido = checkdbVencido,
                    IndexOptimizeVencido = indexOptimizeVencido,
                    AgName = agName
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo mantenimiento atrasado");
        }

        return results
            .OrderByDescending(m => m.CheckdbVencido && m.IndexOptimizeVencido)
            .ThenBy(m => m.DisplayName)
            .ToList();
    }

    /// <summary>
    /// Determina los problemas de una instancia basándose en sus scores
    /// </summary>
    private static List<string> GetIssuesFromScores(OverviewHealthScoreRaw score)
    {
        var issues = new List<string>();
        
        if (score.BackupsScore < 100) issues.Add("Backups");
        if (score.AlwaysOnScore < 100) issues.Add("AlwaysOn");
        if (score.CPUScore < 50) issues.Add("CPU Alto");
        if (score.MemoriaScore < 50) issues.Add("Memoria");
        if (score.DiscosScore < 50) issues.Add("Discos");
        if (score.MantenimientosScore < 100) issues.Add("Mantenimiento");
        
        if (issues.Count == 0) issues.Add("Score bajo");
        
        return issues;
    }

    /// <summary>
    /// Obtiene los backups con breach de producción consultando datos reales
    /// </summary>
    private async Task<List<OverviewBackupBreachRaw>> GetProductionBackupBreachesAsync(CancellationToken ct)
    {
        var results = new List<OverviewBackupBreachRaw>();

        var query = @"
            WITH LatestBackups AS (
                SELECT 
                    InstanceName,
                    FullBackupBreached,
                    LogBackupBreached,
                    LastFullBackup,
                    LastLogBackup,
                    BackupDetails,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Backups
                WHERE Ambiente = 'Produccion'
            )
            SELECT InstanceName, FullBackupBreached, LogBackupBreached, 
                   LastFullBackup, LastLogBackup, BackupDetails
            FROM LatestBackups
            WHERE rn = 1 AND (FullBackupBreached = 1 OR LogBackupBreached = 1)";

        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(ct);

        await using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 30;
        
        await using var reader = await command.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            results.Add(new OverviewBackupBreachRaw
            {
                InstanceName = reader.GetString(0),
                FullBackupBreached = !reader.IsDBNull(1) && reader.GetBoolean(1),
                LogBackupBreached = !reader.IsDBNull(2) && reader.GetBoolean(2),
                LastFullBackup = reader.IsDBNull(3) ? null : reader.GetDateTime(3),
                LastLogBackup = reader.IsDBNull(4) ? null : reader.GetDateTime(4),
                BackupDetails = reader.IsDBNull(5) ? null : reader.GetString(5)
            });
        }

        return results;
    }

    /// <summary>
    /// Construye la lista de issues de backup basada en los flags de breach
    /// </summary>
    private static List<string> BuildBackupIssuesList(OverviewBackupBreachRaw backup)
    {
        var issues = new List<string>();
        
        if (backup.FullBackupBreached)
            issues.Add("FULL vencido");
        if (backup.LogBackupBreached)
            issues.Add("LOG vencido");
        
        return issues;
    }

    /// <summary>
    /// Parsea el BackupDetails para obtener las bases de datos con breach
    /// Formato esperado: "DBName:FULL=Xh|DBName2:LOG=Yh..."
    /// </summary>
    private static List<string> ParseBreachedDatabases(string? backupDetails, bool fullBreached, bool logBreached)
    {
        var breachedDbs = new List<string>();
        
        if (string.IsNullOrEmpty(backupDetails))
        {
            // Si no hay detalles pero hay breach, mostrar mensaje genérico
            if (fullBreached)
                breachedDbs.Add("Backup FULL atrasado (sin detalle de DBs)");
            if (logBreached)
                breachedDbs.Add("Backup LOG atrasado (sin detalle de DBs)");
            return breachedDbs;
        }

        // Parsear el formato "DBName:FULL=Xh|DBName2:LOG=Yh..."
        var entries = backupDetails.Split('|', StringSplitOptions.RemoveEmptyEntries);
        
        foreach (var entry in entries)
        {
            // Ignorar marcadores especiales
            if (entry.Contains("SYNCED_FROM_AG") || entry.Contains("VM_BACKUP"))
                continue;

            // Formato: "DBName:FULL=Xh" o "DBName:LOG=Xh"
            var parts = entry.Split(':');
            if (parts.Length >= 2)
            {
                var dbName = parts[0];
                var backupInfo = parts[1];
                
                // Determinar si es FULL o LOG
                var isFullType = backupInfo.StartsWith("FULL", StringComparison.OrdinalIgnoreCase);
                var isLogType = backupInfo.StartsWith("LOG", StringComparison.OrdinalIgnoreCase);
                
                // Extraer horas del backup
                var hoursMatch = System.Text.RegularExpressions.Regex.Match(backupInfo, @"=(\d+)h");
                if (hoursMatch.Success && int.TryParse(hoursMatch.Groups[1].Value, out int hours))
                {
                    if (isFullType && fullBreached)
                    {
                        breachedDbs.Add($"{dbName} (FULL: {hours}h)");
                    }
                    else if (isLogType && logBreached)
                    {
                        breachedDbs.Add($"{dbName} (LOG: {hours}h)");
                    }
                }
            }
        }

        return breachedDbs;
    }

    #endregion

    /// <summary>
    /// Clase auxiliar para deserializar JSON de volúmenes
    /// </summary>
    private class DiskVolumeJson
    {
        public string? MountPoint { get; set; }
        public string? VolumeName { get; set; }
        public decimal? TotalGB { get; set; }
        public decimal? FreeGB { get; set; }
        public decimal? FreePct { get; set; }
        public decimal? RealFreeGB { get; set; }
        public decimal? RealFreePct { get; set; }
        public decimal? FreeSpaceInGrowableFilesGB { get; set; }
        public bool? IsAlerted { get; set; }
        public int? FilesWithGrowth { get; set; }
    }
}
