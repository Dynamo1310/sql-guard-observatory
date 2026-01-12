using Microsoft.EntityFrameworkCore;
using Microsoft.Data.SqlClient;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public class OverviewSummaryAlertService : IOverviewSummaryAlertService
{
    private readonly ApplicationDbContext _appContext;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<OverviewSummaryAlertService> _logger;
    private readonly string _appDbConnectionString;

    public OverviewSummaryAlertService(
        ApplicationDbContext appContext,
        ISmtpService smtpService,
        IConfiguration configuration,
        ILogger<OverviewSummaryAlertService> logger)
    {
        _appContext = appContext;
        _smtpService = smtpService;
        _logger = logger;
        // Las métricas ahora están en SQLGuardObservatoryAuth (ApplicationDb)
        _appDbConnectionString = configuration.GetConnectionString("ApplicationDb") 
            ?? throw new InvalidOperationException("ApplicationDb connection string not configured");
    }

    #region Configuration

    public async Task<OverviewSummaryAlertConfig?> GetConfigAsync()
    {
        return await _appContext.Set<OverviewSummaryAlertConfig>()
            .Include(c => c.Schedules)
            .FirstOrDefaultAsync();
    }

    public async Task<OverviewSummaryAlertConfig> UpdateConfigAsync(
        UpdateOverviewSummaryAlertConfigRequest request, 
        string userId, 
        string userDisplayName)
    {
        var config = await GetConfigAsync();
        
        if (config == null)
        {
            config = new OverviewSummaryAlertConfig();
            _appContext.Set<OverviewSummaryAlertConfig>().Add(config);
        }

        if (request.Name != null) config.Name = request.Name;
        if (request.Description != null) config.Description = request.Description;
        if (request.IsEnabled.HasValue) config.IsEnabled = request.IsEnabled.Value;
        if (request.IncludeOnlyProduction.HasValue) config.IncludeOnlyProduction = request.IncludeOnlyProduction.Value;
        if (request.Recipients != null) config.Recipients = string.Join(",", request.Recipients);
        
        config.UpdatedAt = DateTime.Now;
        config.UpdatedBy = userId;
        config.UpdatedByDisplayName = userDisplayName;

        await _appContext.SaveChangesAsync();
        return config;
    }

    #endregion

    #region Schedules

    public async Task<List<OverviewSummaryAlertSchedule>> GetSchedulesAsync()
    {
        var config = await GetConfigAsync();
        if (config == null) return new List<OverviewSummaryAlertSchedule>();
        
        return await _appContext.Set<OverviewSummaryAlertSchedule>()
            .Where(s => s.ConfigId == config.Id)
            .OrderBy(s => s.TimeOfDay)
            .ToListAsync();
    }

    public async Task<OverviewSummaryAlertSchedule> AddScheduleAsync(CreateOverviewSummaryAlertScheduleRequest request)
    {
        var config = await GetConfigAsync();
        if (config == null)
        {
            // Crear configuración si no existe
            config = new OverviewSummaryAlertConfig();
            _appContext.Set<OverviewSummaryAlertConfig>().Add(config);
            await _appContext.SaveChangesAsync();
        }

        // Parsear hora
        if (!TimeSpan.TryParse(request.TimeOfDay, out var timeOfDay))
        {
            throw new ArgumentException($"Formato de hora inválido: {request.TimeOfDay}. Use HH:mm");
        }

        var schedule = new OverviewSummaryAlertSchedule
        {
            ConfigId = config.Id,
            TimeOfDay = timeOfDay,
            IsEnabled = request.IsEnabled,
            DaysOfWeek = string.Join(",", request.DaysOfWeek),
            CreatedAt = DateTime.Now
        };

        _appContext.Set<OverviewSummaryAlertSchedule>().Add(schedule);
        await _appContext.SaveChangesAsync();
        
        _logger.LogInformation("Schedule agregado: {Time} en días {Days}", 
            request.TimeOfDay, schedule.DaysOfWeek);
        
        return schedule;
    }

    public async Task<OverviewSummaryAlertSchedule?> UpdateScheduleAsync(
        int scheduleId, 
        UpdateOverviewSummaryAlertScheduleRequest request)
    {
        var schedule = await _appContext.Set<OverviewSummaryAlertSchedule>()
            .FirstOrDefaultAsync(s => s.Id == scheduleId);
        
        if (schedule == null) return null;

        if (request.TimeOfDay != null)
        {
            if (!TimeSpan.TryParse(request.TimeOfDay, out var timeOfDay))
            {
                throw new ArgumentException($"Formato de hora inválido: {request.TimeOfDay}. Use HH:mm");
            }
            schedule.TimeOfDay = timeOfDay;
        }
        
        if (request.IsEnabled.HasValue) schedule.IsEnabled = request.IsEnabled.Value;
        if (request.DaysOfWeek != null) schedule.DaysOfWeek = string.Join(",", request.DaysOfWeek);

        await _appContext.SaveChangesAsync();
        return schedule;
    }

    public async Task<bool> DeleteScheduleAsync(int scheduleId)
    {
        var schedule = await _appContext.Set<OverviewSummaryAlertSchedule>()
            .FirstOrDefaultAsync(s => s.Id == scheduleId);
        
        if (schedule == null) return false;

        // Desvincular los registros del historial antes de eliminar el schedule
        var historyRecords = await _appContext.Set<OverviewSummaryAlertHistory>()
            .Where(h => h.ScheduleId == scheduleId)
            .ToListAsync();
        
        foreach (var record in historyRecords)
        {
            record.ScheduleId = null;
        }

        _appContext.Set<OverviewSummaryAlertSchedule>().Remove(schedule);
        await _appContext.SaveChangesAsync();
        
        _logger.LogInformation("Schedule eliminado: Id={Id}, registros de historial desvinculados: {Count}", 
            scheduleId, historyRecords.Count);
        return true;
    }

    #endregion

    #region History

    public async Task<List<OverviewSummaryAlertHistory>> GetHistoryAsync(int limit = 20)
    {
        return await _appContext.Set<OverviewSummaryAlertHistory>()
            .Include(h => h.Schedule)
            .OrderByDescending(h => h.SentAt)
            .Take(limit)
            .ToListAsync();
    }

    #endregion

    #region Summary Generation

    public async Task<OverviewSummaryDataDto> GenerateSummaryDataAsync()
    {
        _logger.LogInformation("Generando datos de resumen Overview...");
        
        var summary = new OverviewSummaryDataDto
        {
            GeneratedAt = DateTime.Now
        };

        try
        {
            // 1. Obtener Health Scores más recientes (solo Producción)
            var healthScores = await GetLatestHealthScoresAsync();
            
            // Log para debug: mostrar ambientes únicos en health scores
            var uniqueHealthAmbientes = healthScores.Select(s => s.Ambiente).Distinct().ToList();
            _logger.LogInformation("Ambientes únicos en health scores: [{Ambientes}]", string.Join(", ", uniqueHealthAmbientes.Select(a => $"'{a}'")));
            
            var productionScores = healthScores
                .Where(s => string.Equals(s.Ambiente, "Produccion", StringComparison.OrdinalIgnoreCase))
                .ToList();
            
            _logger.LogInformation("Health Scores: Total={Total}, Producción={Prod}", healthScores.Count, productionScores.Count);

            summary.TotalInstances = productionScores.Count;
            summary.HealthyCount = productionScores.Count(s => s.HealthStatus == "Healthy");
            summary.WarningCount = productionScores.Count(s => s.HealthStatus == "Warning");
            summary.RiskCount = productionScores.Count(s => s.HealthStatus == "Risk");
            summary.CriticalCount = productionScores.Count(s => s.HealthScore < 60);
            summary.AverageHealthScore = productionScores.Count > 0 
                ? (int)Math.Round(productionScores.Average(s => s.HealthScore)) 
                : 0;

            // 2. Instancias críticas (score < 60)
            summary.CriticalInstances = productionScores
                .Where(s => s.HealthScore < 60)
                .OrderBy(s => s.HealthScore)
                .Select(s => new CriticalInstanceSummary
                {
                    InstanceName = s.InstanceName,
                    HealthScore = s.HealthScore,
                    Issues = GetIssuesFromScore(s)
                })
                .ToList();

            // 3. Backups atrasados
            var backupsOverdue = productionScores.Where(s => s.BackupsScore < 100).ToList();
            summary.BackupsOverdue = backupsOverdue.Count;
            summary.BackupIssues = backupsOverdue
                .OrderBy(s => s.BackupsScore)
                .Select(s => new BackupIssueSummary
                {
                    InstanceName = s.InstanceName,
                    Score = s.BackupsScore,
                    Issues = s.BackupsScore < 50 
                        ? new List<string> { "FULL vencido" } 
                        : new List<string> { "LOG vencido" }
                })
                .ToList();

            // 4. Discos críticos - Obtener directamente de la BD usando el mismo contexto
            var criticalDisks = await GetCriticalDisksAsync();
            
            _logger.LogInformation("Discos críticos encontrados: {Count}", criticalDisks.Count);
            
            foreach (var disk in criticalDisks)
            {
                _logger.LogInformation("  -> Disco crítico: {Instance} {Drive}: {Pct:F1}% libre", 
                    disk.InstanceName, disk.Drive, disk.RealPorcentajeLibre);
            }
            
            summary.CriticalDisks = criticalDisks.Count;
            summary.CriticalDisksList = criticalDisks;

            // 5. Mantenimiento atrasado - Obtener TODOS de una sola vez para evitar problemas de conexión
            var maintenanceOverdueList = await GetMaintenanceOverdueAsync(productionScores.Select(s => s.InstanceName).ToList());
            
            _logger.LogInformation("Mantenimiento atrasado encontrado: {Count}", maintenanceOverdueList.Count);
            foreach (var m in maintenanceOverdueList)
            {
                _logger.LogInformation("  -> Mantenimiento: {Display} - {Tipo}", m.DisplayName, m.Tipo);
            }
            
            summary.MaintenanceOverdue = maintenanceOverdueList.Count;
            summary.MaintenanceOverdueList = maintenanceOverdueList
                .OrderByDescending(m => m.Tipo.Contains("CHECKDB") && m.Tipo.Contains("IndexOptimize"))
                .ThenBy(m => m.DisplayName)
                .ToList();
            
            _logger.LogInformation("Mantenimiento atrasado: {Count} instancias/AGs", maintenanceOverdueList.Count);

            _logger.LogInformation(
                "=== RESUMEN FINAL ===: Total={Total}, Promedio={Avg}, Críticas={Critical}, Discos={Discos}, Maint={Maint}, Backups={Backups}",
                summary.TotalInstances, summary.AverageHealthScore, summary.CriticalCount, 
                summary.CriticalDisks, summary.MaintenanceOverdue, summary.BackupsOverdue);
            
            _logger.LogInformation("Listas: CriticalDisksList.Count={DiskCount}, MaintenanceOverdueList.Count={MaintCount}",
                summary.CriticalDisksList?.Count ?? -1, summary.MaintenanceOverdueList?.Count ?? -1);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "!!! ERROR generando datos de resumen - el email mostrará datos vacíos !!!");
        }

        return summary;
    }

    private async Task<List<HealthScoreSummary>> GetLatestHealthScoresAsync()
    {
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
                    ErroresCriticosScore,
                    MantenimientosScore,
                    ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
                FROM dbo.InstanceHealth_Score
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
                ErroresCriticosScore,
                MantenimientosScore
            FROM RankedScores 
            WHERE rn = 1";

        var results = new List<HealthScoreSummary>();

        // Usar SqlConnection directa para no interferir con la conexión del DbContext
        await using var connection = new SqlConnection(_appDbConnectionString);
        await connection.OpenAsync();

        await using var command = new SqlCommand(query, connection);
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            results.Add(new HealthScoreSummary
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
                ErroresCriticosScore = reader.IsDBNull(9) ? 100 : reader.GetInt32(9),
                MantenimientosScore = reader.IsDBNull(10) ? 100 : reader.GetInt32(10)
            });
        }

        return results;
    }

    private List<string> GetIssuesFromScore(HealthScoreSummary score)
    {
        var issues = new List<string>();
        if (score.BackupsScore < 100) issues.Add("Backups");
        if (score.AlwaysOnScore < 100) issues.Add("AlwaysOn");
        if (score.CPUScore < 50) issues.Add("CPU Alto");
        if (score.MemoriaScore < 50) issues.Add("Memoria");
        if (score.DiscosScore < 50) issues.Add("Discos");
        if (score.ErroresCriticosScore < 100) issues.Add("Errores Críticos");
        if (score.MantenimientosScore < 100) issues.Add("Mantenimiento");
        if (issues.Count == 0) issues.Add("Score bajo");
        return issues;
    }
    /// <summary>
    /// Obtiene el mantenimiento atrasado de producción en UNA SOLA consulta
    /// Criterio: CheckdbOk=false O IndexOptimizeOk=false
    /// RESPETA las excepciones configuradas en CollectorExceptions
    /// </summary>
    private async Task<List<MaintenanceOverdueSummary>> GetMaintenanceOverdueAsync(List<string> productionInstances)
    {
        var results = new List<MaintenanceOverdueSummary>();
        var agProcessed = new HashSet<string>();
        
        try
        {
            // 1. Cargar excepciones activas para Maintenance
            var checkdbExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var indexOptimizeExceptions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            
            var exceptions = await _appContext.Set<Models.Collectors.CollectorException>()
                .AsNoTracking()
                .Where(e => e.CollectorName == "Maintenance" && e.IsActive)
                .ToListAsync();
            
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
            
            _logger.LogDebug("Excepciones cargadas para Overview: CHECKDB={CheckdbCount} ({Checkdb}), IndexOptimize={IndexCount}",
                checkdbExceptions.Count, string.Join(", ", checkdbExceptions), indexOptimizeExceptions.Count);

            // 2. Obtener TODOS los registros de mantenimiento de producción en una sola consulta
            var query = @"
                WITH LatestMaintenance AS (
                    SELECT 
                        m.InstanceName,
                        m.CheckdbOk,
                        m.IndexOptimizeOk,
                        m.AGName,
                        ROW_NUMBER() OVER (PARTITION BY m.InstanceName ORDER BY m.CollectedAtUtc DESC) AS rn
                    FROM dbo.InstanceHealth_Maintenance m
                    WHERE m.Ambiente = 'Produccion'
                )
                SELECT InstanceName, CheckdbOk, IndexOptimizeOk, AGName
                FROM LatestMaintenance
                WHERE rn = 1 AND (CheckdbOk = 0 OR IndexOptimizeOk = 0)";

            // Crear conexión nueva con la cadena de conexión guardada
            await using var connection = new SqlConnection(_appDbConnectionString);
            await connection.OpenAsync();

            await using var command = new SqlCommand(query, connection);
            await using var reader = await command.ExecuteReaderAsync();
            
            while (await reader.ReadAsync())
            {
                var instanceName = reader.GetString(0);
                var checkdbOk = !reader.IsDBNull(1) && reader.GetBoolean(1);
                var indexOptimizeOk = !reader.IsDBNull(2) && reader.GetBoolean(2);
                var agName = reader.IsDBNull(3) ? null : reader.GetString(3);
                
                // Si pertenece a un AG y ya lo procesamos, saltar
                if (!string.IsNullOrEmpty(agName) && agProcessed.Contains(agName))
                {
                    continue;
                }
                
                // 3. Verificar excepciones (soporta hostname, shortname, FQDN)
                var hostname = instanceName.Split('\\')[0];
                var shortName = hostname.Split('.')[0];
                
                var isCheckdbExcepted = checkdbExceptions.Contains(instanceName)
                                     || checkdbExceptions.Contains(hostname)
                                     || checkdbExceptions.Contains(shortName);
                
                var isIndexOptimizeExcepted = indexOptimizeExceptions.Contains(instanceName)
                                           || indexOptimizeExceptions.Contains(hostname)
                                           || indexOptimizeExceptions.Contains(shortName);
                
                // Aplicar excepciones: si está exceptuado, considerarlo OK
                var checkdbVencido = !checkdbOk && !isCheckdbExcepted;
                var indexOptimizeVencido = !indexOptimizeOk && !isIndexOptimizeExcepted;
                
                // Si ambos están OK (o exceptuados), no hay problema que reportar
                if (!checkdbVencido && !indexOptimizeVencido)
                {
                    if (isCheckdbExcepted || isIndexOptimizeExcepted)
                    {
                        _logger.LogDebug("✅ {Instance} omitido del reporte Overview (excepciones aplicadas: CHECKDB={C}, IndexOptimize={I})",
                            instanceName, isCheckdbExcepted, isIndexOptimizeExcepted);
                    }
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
                
                results.Add(new MaintenanceOverdueSummary
                {
                    InstanceName = instanceName,
                    DisplayName = !string.IsNullOrEmpty(agName) ? agName : instanceName,
                    Tipo = tipo,
                    AgName = agName
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo mantenimiento atrasado");
        }

        return results;
    }

    /// <summary>
    /// Obtiene los discos críticos de producción directamente de la BD
    /// Criterio v3.4: Usa el campo IsAlerted del JSON que ya incluye:
    /// - Discos con growth + espacio real <= 10%
    /// - Discos de LOGS con growth + % físico < 10% (aunque tengan espacio interno)
    /// </summary>
    private async Task<List<CriticalDiskSummary>> GetCriticalDisksAsync()
    {
        var results = new List<CriticalDiskSummary>();
        
        try
        {
            // Consulta directa a la tabla de discos - obtener los más recientes por instancia
            var query = @"
                WITH LatestDiscos AS (
                    SELECT 
                        d.InstanceName,
                        d.Ambiente,
                        d.VolumesJson,
                        ROW_NUMBER() OVER (PARTITION BY d.InstanceName ORDER BY d.CollectedAtUtc DESC) AS rn
                    FROM dbo.InstanceHealth_Discos d
                    WHERE d.Ambiente = 'Produccion'
                )
                SELECT InstanceName, VolumesJson
                FROM LatestDiscos
                WHERE rn = 1";

            // Crear conexión nueva con la cadena de conexión guardada (SQLGuardObservatoryAuth)
            await using var connection = new SqlConnection(_appDbConnectionString);
            await connection.OpenAsync();

            await using var command = new SqlCommand(query, connection);
            await using var reader = await command.ExecuteReaderAsync();
            while (await reader.ReadAsync())
            {
                var instanceName = reader.GetString(0);
                var volumesJson = reader.IsDBNull(1) ? null : reader.GetString(1);
                
                if (!string.IsNullOrEmpty(volumesJson))
                {
                    try
                    {
                        var volumes = System.Text.Json.JsonSerializer.Deserialize<List<DiskVolumeData>>(volumesJson, 
                            new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                        
                        if (volumes != null)
                        {
                            foreach (var vol in volumes)
                            {
                                var freePct = vol.FreePct ?? 100;  // % físico libre
                                var freeGB = vol.FreeGB ?? 0;      // GB físicos libres
                                var isAlerted = vol.IsAlerted ?? false;
                                
                                // v3.4: Usar IsAlerted del JSON que ya tiene toda la lógica:
                                // - Growth + espacio real <= 10%
                                // - Discos de LOGS con growth + % físico < 10%
                                if (isAlerted)
                                {
                                    results.Add(new CriticalDiskSummary
                                    {
                                        InstanceName = instanceName,
                                        Drive = vol.MountPoint ?? vol.VolumeName ?? "N/A",
                                        RealPorcentajeLibre = (decimal)freePct,  // Usar % físico
                                        RealLibreGB = (decimal)freeGB            // Usar GB físicos
                                    });
                                    
                                    _logger.LogDebug("Disco crítico detectado (IsAlerted=true): {Instance} {Drive}: {Pct:F1}% libre físico",
                                        instanceName, vol.MountPoint, freePct);
                                }
                            }
                        }
                    }
                    catch (Exception jsonEx)
                    {
                        _logger.LogWarning(jsonEx, "Error parseando VolumesJson para {Instance}", instanceName);
                    }
                }
            }
            
            // Ordenar por porcentaje libre (menor primero)
            results = results.OrderBy(d => d.RealPorcentajeLibre).ToList();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo discos críticos");
        }

        return results;
    }

    #endregion

    #region Email Sending

    public async Task<OverviewSummaryAlertResult> SendSummaryAsync(int? scheduleId = null, string triggerType = "Manual")
    {
        var config = await GetConfigAsync();
        if (config == null)
        {
            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = "No hay configuración de alertas"
            };
        }

        var recipients = config.Recipients.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (!recipients.Any())
        {
            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = "No hay destinatarios configurados"
            };
        }

        try
        {
            // Generar datos del resumen
            var summaryData = await GenerateSummaryDataAsync();
            
            // Generar HTML del email
            var subject = GenerateEmailSubject(summaryData);
            var body = GenerateEmailBody(summaryData);

            // Enviar a cada destinatario
            var successCount = 0;
            foreach (var recipient in recipients)
            {
                var sent = await _smtpService.SendEmailAsync(recipient, null, subject, body, "OverviewSummary");
                if (sent) successCount++;
            }

            // Actualizar LastSentAt del schedule si corresponde
            if (scheduleId.HasValue)
            {
                var schedule = await _appContext.Set<OverviewSummaryAlertSchedule>()
                    .FirstOrDefaultAsync(s => s.Id == scheduleId);
                if (schedule != null)
                {
                    schedule.LastSentAt = DateTime.Now;
                    await _appContext.SaveChangesAsync();
                }
            }

            // Registrar en historial
            var history = new OverviewSummaryAlertHistory
            {
                ConfigId = config.Id,
                ScheduleId = scheduleId,
                SentAt = DateTime.Now,
                RecipientCount = recipients.Count,
                Success = successCount > 0,
                TriggerType = triggerType,
                SummaryData = JsonSerializer.Serialize(summaryData)
            };
            _appContext.Set<OverviewSummaryAlertHistory>().Add(history);
            await _appContext.SaveChangesAsync();

            _logger.LogInformation(
                "Resumen enviado a {Success}/{Total} destinatarios. Trigger: {Trigger}",
                successCount, recipients.Count, triggerType);

            return new OverviewSummaryAlertResult
            {
                Success = true,
                Message = $"Resumen enviado a {successCount} de {recipients.Count} destinatario(s)"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando resumen Overview");

            // Registrar error en historial
            var history = new OverviewSummaryAlertHistory
            {
                ConfigId = config.Id,
                ScheduleId = scheduleId,
                SentAt = DateTime.Now,
                RecipientCount = recipients.Count,
                Success = false,
                ErrorMessage = ex.Message,
                TriggerType = triggerType
            };
            _appContext.Set<OverviewSummaryAlertHistory>().Add(history);
            await _appContext.SaveChangesAsync();

            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = $"Error al enviar: {ex.Message}"
            };
        }
    }

    public async Task<OverviewSummaryAlertResult> SendTestEmailAsync()
    {
        var config = await GetConfigAsync();
        if (config == null)
        {
            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = "No hay configuración de alertas"
            };
        }

        var recipients = config.Recipients.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
        if (!recipients.Any())
        {
            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = "No hay destinatarios configurados"
            };
        }

        try
        {
            var subject = "[PRUEBA] Resumen Overview - SQLNova";
            var body = $@"
<html>
<body style='font-family: Arial, sans-serif;'>
<h2 style='color: #2563eb;'>🔔 Email de Prueba - Resumen Overview</h2>
<p>Este es un email de prueba del sistema de alertas de resumen Overview.</p>
<p><strong>Configuración actual:</strong></p>
<ul>
<li>Estado: {(config.IsEnabled ? "Activo" : "Inactivo")}</li>
<li>Destinatarios: {recipients.Count}</li>
<li>Schedules configurados: {config.Schedules?.Count ?? 0}</li>
</ul>
<p style='color: #666; font-size: 12px;'>Enviado desde SQLNova - {DateTime.Now:dd/MM/yyyy HH:mm:ss}</p>
</body>
</html>";

            var successCount = 0;
            foreach (var recipient in recipients)
            {
                var sent = await _smtpService.SendEmailAsync(recipient, null, subject, body, "OverviewSummaryTest");
                if (sent) successCount++;
            }

            // Registrar en historial
            var history = new OverviewSummaryAlertHistory
            {
                ConfigId = config.Id,
                SentAt = DateTime.Now,
                RecipientCount = recipients.Count,
                Success = successCount > 0,
                TriggerType = "Test"
            };
            _appContext.Set<OverviewSummaryAlertHistory>().Add(history);
            await _appContext.SaveChangesAsync();

            return new OverviewSummaryAlertResult
            {
                Success = true,
                Message = $"Email de prueba enviado a {successCount} de {recipients.Count} destinatario(s)"
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error enviando email de prueba");
            return new OverviewSummaryAlertResult
            {
                Success = false,
                Message = $"Error: {ex.Message}"
            };
        }
    }

    private string GenerateEmailSubject(OverviewSummaryDataDto data)
    {
        return $"📊 Resumen SQLNova: {data.TotalInstances} instancias producción on premise | {DateTime.Now:dd/MM/yyyy HH:mm}";
    }

    private string GenerateEmailBody(OverviewSummaryDataDto data)
    {
        var backupIssuesHtml = data.BackupIssues.Count > 0
            ? string.Join("", data.BackupIssues.Select(b => 
                $"<li><strong>{b.InstanceName}</strong>: {string.Join(", ", b.Issues)}</li>"))
            : "<li style='color: #22c55e;'>✅ Todos los backups están al día</li>";

        var criticalDisksHtml = data.CriticalDisksList.Count > 0
            ? string.Join("", data.CriticalDisksList.Select(d => 
                $"<li><strong>{d.InstanceName}</strong> ({d.Drive}): {d.RealPorcentajeLibre:F1}% libre ({d.RealLibreGB:F1} GB)</li>"))
            : "<li style='color: #22c55e;'>✅ No hay discos críticos</li>";

        var maintenanceHtml = data.MaintenanceOverdueList.Count > 0
            ? string.Join("", data.MaintenanceOverdueList.Select(m => 
                $"<li><strong>{m.DisplayName}</strong>: {m.Tipo}</li>"))
            : "<li style='color: #22c55e;'>✅ Todo el mantenimiento está al día</li>";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px;'>
    <div style='background: linear-gradient(135deg, #e0e7ff 0%, #dbeafe 100%); padding: 30px; border-radius: 10px 10px 0 0; border-bottom: 3px solid #2563eb;'>
        <h1 style='color: #1e3a5f; margin: 0; font-size: 24px;'>📊 Resumen SQLNova</h1>
        <p style='color: #475569; margin: 5px 0 0 0;'>Estado de la plataforma productiva - {data.TotalInstances} instancias producción on premise</p>
    </div>
    
    <div style='background: #f8fafc; padding: 20px; border: 1px solid #e2e8f0;'>
        <!-- Backups Atrasados -->
        <div style='background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;'>
            <h3 style='margin: 0 0 10px 0; color: #f59e0b;'>💾 Backups Atrasados ({data.BackupsOverdue})</h3>
            <ul style='margin: 0; padding-left: 20px;'>
                {backupIssuesHtml}
            </ul>
        </div>

        <!-- Discos Críticos -->
        <div style='background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;'>
            <h3 style='margin: 0 0 10px 0; color: #f97316;'>💿 Discos Críticos ({data.CriticalDisks})</h3>
            <ul style='margin: 0; padding-left: 20px;'>
                {criticalDisksHtml}
            </ul>
        </div>

        <!-- Mantenimiento Atrasado -->
        <div style='background: white; padding: 15px; border-radius: 8px; margin-bottom: 15px;'>
            <h3 style='margin: 0 0 10px 0; color: #8b5cf6;'>🔧 Mantenimiento Atrasado ({data.MaintenanceOverdue})</h3>
            <ul style='margin: 0; padding-left: 20px;'>
                {maintenanceHtml}
            </ul>
        </div>
    </div>

    <div style='background: #1e293b; color: white; padding: 15px; border-radius: 0 0 10px 10px; font-size: 12px; text-align: center;'>
        <p style='margin: 0;'>Generado: {data.GeneratedAt:dd/MM/yyyy HH:mm:ss}</p>
        <p style='margin: 5px 0 0 0; opacity: 0.7;'>SQLNova - Sistema de Monitoreo SQL Server</p>
    </div>
</body>
</html>";
    }

    #endregion

    #region Schedule Checking

    public async Task CheckAndExecuteSchedulesAsync()
    {
        var config = await GetConfigAsync();
        if (config == null || !config.IsEnabled)
        {
            return;
        }

        var now = DateTime.Now;
        var currentTimeOfDay = now.TimeOfDay;
        var currentDayOfWeek = (int)now.DayOfWeek;

        var schedules = await _appContext.Set<OverviewSummaryAlertSchedule>()
            .Where(s => s.ConfigId == config.Id && s.IsEnabled)
            .ToListAsync();

        foreach (var schedule in schedules)
        {
            // Verificar si es el día correcto
            var allowedDays = schedule.DaysOfWeek
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(d => int.Parse(d.Trim()))
                .ToList();

            if (!allowedDays.Contains(currentDayOfWeek))
            {
                continue;
            }

            // Verificar si es la hora correcta (con tolerancia de 1 minuto)
            var scheduledTime = schedule.TimeOfDay;
            var timeDiff = Math.Abs((currentTimeOfDay - scheduledTime).TotalMinutes);
            
            if (timeDiff > 1)
            {
                continue;
            }

            // Verificar que no se haya enviado ya hoy a esta hora
            if (schedule.LastSentAt.HasValue)
            {
                var lastSentDate = schedule.LastSentAt.Value.Date;
                var lastSentTime = schedule.LastSentAt.Value.TimeOfDay;
                
                if (lastSentDate == now.Date && Math.Abs((lastSentTime - scheduledTime).TotalMinutes) < 5)
                {
                    // Ya se envió hoy a esta hora
                    continue;
                }
            }

            // Ejecutar el envío
            _logger.LogInformation(
                "Ejecutando schedule {Id} programado para {Time}",
                schedule.Id, schedule.TimeOfDay);

            await SendSummaryAsync(schedule.Id, "Scheduled");
        }
    }

    #endregion
}

// Clase auxiliar para mapear resultados de HealthScore
internal class HealthScoreSummary
{
    public string InstanceName { get; set; } = "";
    public string? Ambiente { get; set; }
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = "";
    public int BackupsScore { get; set; }
    public int AlwaysOnScore { get; set; }
    public int CPUScore { get; set; }
    public int MemoriaScore { get; set; }
    public int DiscosScore { get; set; }
    public int ErroresCriticosScore { get; set; }
    public int MantenimientosScore { get; set; }
}

// Clase auxiliar para parsear el JSON de volúmenes de disco
internal class DiskVolumeData
{
    public string? MountPoint { get; set; }
    public string? VolumeName { get; set; }
    public decimal? TotalGB { get; set; }
    public decimal? FreeGB { get; set; }
    public decimal? FreePct { get; set; }
    public decimal? RealFreeGB { get; set; }
    public decimal? RealFreePct { get; set; }
    public bool? IsAlerted { get; set; }
    public int? FilesWithGrowth { get; set; }
}

