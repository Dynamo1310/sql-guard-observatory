using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IBackupAlertService
{
    Task<BackupAlertConfig?> GetConfigAsync();
    Task<BackupAlertConfig> CreateConfigAsync(CreateBackupAlertRequest request, string userId, string userDisplayName);
    Task<BackupAlertConfig> UpdateConfigAsync(UpdateBackupAlertRequest request, string userId, string userDisplayName);
    Task<List<BackupAlertHistory>> GetHistoryAsync(int limit = 20);
    Task<BackupAlertStatusDto> GetStatusAsync();
    Task<(bool success, string message)> TestAlertAsync();
    Task<(bool success, string message)> RunCheckAsync();
}

/// <summary>
/// Servicio para gestionar alertas de backups atrasados
/// </summary>
public class BackupAlertService : IBackupAlertService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<BackupAlertService> _logger;

    public BackupAlertService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        ILogger<BackupAlertService> logger)
    {
        _context = context;
        _smtpService = smtpService;
        _logger = logger;
    }

    public async Task<BackupAlertConfig?> GetConfigAsync()
    {
        return await _context.BackupAlertConfigs
            .Include(c => c.UpdatedByUser)
            .FirstOrDefaultAsync();
    }

    public async Task<BackupAlertConfig> CreateConfigAsync(CreateBackupAlertRequest request, string userId, string userDisplayName)
    {
        var config = new BackupAlertConfig
        {
            Name = request.Name,
            Description = request.Description,
            CheckIntervalMinutes = request.CheckIntervalMinutes,
            AlertIntervalMinutes = request.AlertIntervalMinutes,
            Recipients = string.Join(",", request.Recipients),
            CcRecipients = string.Join(",", request.CcRecipients),
            CreatedAt = DateTime.UtcNow,
            UpdatedByUserId = userId
        };

        _context.BackupAlertConfigs.Add(config);
        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<BackupAlertConfig> UpdateConfigAsync(UpdateBackupAlertRequest request, string userId, string userDisplayName)
    {
        var config = await _context.BackupAlertConfigs.FirstOrDefaultAsync();
        
        if (config == null)
        {
            config = new BackupAlertConfig();
            _context.BackupAlertConfigs.Add(config);
        }

        if (request.Name != null) config.Name = request.Name;
        if (request.Description != null) config.Description = request.Description;
        if (request.IsEnabled.HasValue) config.IsEnabled = request.IsEnabled.Value;
        if (request.CheckIntervalMinutes.HasValue) config.CheckIntervalMinutes = request.CheckIntervalMinutes.Value;
        if (request.AlertIntervalMinutes.HasValue) config.AlertIntervalMinutes = request.AlertIntervalMinutes.Value;
        if (request.Recipients != null) config.Recipients = string.Join(",", request.Recipients);
        if (request.CcRecipients != null) config.CcRecipients = string.Join(",", request.CcRecipients);
        
        config.UpdatedAt = DateTime.UtcNow;
        config.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<List<BackupAlertHistory>> GetHistoryAsync(int limit = 20)
    {
        return await _context.BackupAlertHistories
            .OrderByDescending(h => h.SentAt)
            .Take(limit)
            .ToListAsync();
    }

    /// <summary>
    /// Obtiene el estado actual de backups (asignados vs no asignados)
    /// </summary>
    public async Task<BackupAlertStatusDto> GetStatusAsync()
    {
        // Obtener backups atrasados del caché
        var backupIssues = await GetBackupIssuesFromCacheAsync();
        
        // Obtener asignaciones activas de tipo Backup
        var assignments = await _context.OverviewIssueAssignments
            .Include(a => a.AssignedToUser)
            .Where(a => a.IssueType == "Backup" && a.ResolvedAt == null)
            .ToListAsync();

        var assignedInstanceNames = assignments.Select(a => a.InstanceName).ToHashSet();

        var result = new BackupAlertStatusDto
        {
            UnassignedIssues = backupIssues
                .Where(b => !assignedInstanceNames.Contains(b.InstanceName))
                .Select(b => new BackupIssueSummaryDto
                {
                    InstanceName = b.InstanceName,
                    FullBackupBreached = b.FullBackupBreached,
                    LogBackupBreached = b.LogBackupBreached
                })
                .ToList(),
            AssignedIssues = backupIssues
                .Where(b => assignedInstanceNames.Contains(b.InstanceName))
                .Select(b => 
                {
                    var assignment = assignments.FirstOrDefault(a => a.InstanceName == b.InstanceName);
                    return new BackupIssueSummaryDto
                    {
                        InstanceName = b.InstanceName,
                        FullBackupBreached = b.FullBackupBreached,
                        LogBackupBreached = b.LogBackupBreached,
                        AssignedToUserName = assignment?.AssignedToUser?.DisplayName ?? assignment?.AssignedToUser?.DomainUser,
                        AssignedAt = assignment?.AssignedAt.ToString("o")
                    };
                })
                .ToList()
        };

        return result;
    }

    /// <summary>
    /// Envía un email de prueba con la lista actual de backups atrasados
    /// </summary>
    public async Task<(bool success, string message)> TestAlertAsync()
    {
        var config = await GetConfigAsync();
        if (config == null)
        {
            return (false, "No hay configuración de alertas");
        }

        var recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();
        var ccRecipients = config.CcRecipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();

        if (recipients.Count == 0)
        {
            return (false, "No hay destinatarios configurados");
        }

        var status = await GetStatusAsync();
        var htmlBody = GenerateAlertEmailBody(status.UnassignedIssues, isTest: true);

        var success = await _smtpService.SendEmailWithCcAsync(
            recipients,
            ccRecipients,
            "[SQLNova] TEST - Alerta de Backups Atrasados",
            htmlBody,
            "BackupAlertTest"
        );

        return success 
            ? (true, $"Email de prueba enviado a {recipients.Count} destinatarios y {ccRecipients.Count} en CC")
            : (false, "Error al enviar email de prueba");
    }

    /// <summary>
    /// Ejecuta la verificación y envía alerta si hay backups atrasados sin asignar
    /// </summary>
    public async Task<(bool success, string message)> RunCheckAsync()
    {
        var config = await GetConfigAsync();
        if (config == null || !config.IsEnabled)
        {
            return (false, "Alerta no está habilitada");
        }

        // Actualizar última ejecución
        config.LastRunAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        // Obtener estado actual
        var status = await GetStatusAsync();
        
        if (status.UnassignedIssues.Count == 0)
        {
            _logger.LogInformation("No hay backups atrasados sin asignar");
            return (true, "No hay backups atrasados sin asignar");
        }

        // Verificar si debe enviar alerta (respetando AlertIntervalMinutes)
        if (config.LastAlertSentAt.HasValue)
        {
            var minutesSinceLastAlert = (DateTime.UtcNow - config.LastAlertSentAt.Value).TotalMinutes;
            if (minutesSinceLastAlert < config.AlertIntervalMinutes)
            {
                _logger.LogInformation(
                    "Hay {Count} backups atrasados sin asignar, pero aún no se cumple el intervalo de alerta ({Minutes} minutos desde la última)",
                    status.UnassignedIssues.Count, (int)minutesSinceLastAlert);
                return (true, $"Hay {status.UnassignedIssues.Count} backups atrasados, próxima alerta en {config.AlertIntervalMinutes - (int)minutesSinceLastAlert} minutos");
            }
        }

        // Enviar alerta
        var recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();
        var ccRecipients = config.CcRecipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();

        if (recipients.Count == 0)
        {
            _logger.LogWarning("No hay destinatarios configurados para alertas de backup");
            return (false, "No hay destinatarios configurados");
        }

        var htmlBody = GenerateAlertEmailBody(status.UnassignedIssues, isTest: false);

        var success = await _smtpService.SendEmailWithCcAsync(
            recipients,
            ccRecipients,
            $"[SQLNova] Alerta: {status.UnassignedIssues.Count} Backup(s) Atrasado(s)",
            htmlBody,
            "BackupAlert"
        );

        // Registrar en historial
        var history = new BackupAlertHistory
        {
            ConfigId = config.Id,
            SentAt = DateTime.UtcNow,
            RecipientCount = recipients.Count,
            CcCount = ccRecipients.Count,
            InstancesAffected = string.Join(",", status.UnassignedIssues.Select(i => i.InstanceName)),
            Success = success,
            ErrorMessage = success ? null : "Error al enviar email"
        };

        _context.BackupAlertHistories.Add(history);
        
        if (success)
        {
            config.LastAlertSentAt = DateTime.UtcNow;
        }
        
        await _context.SaveChangesAsync();

        return success
            ? (true, $"Alerta enviada a {recipients.Count} destinatarios para {status.UnassignedIssues.Count} backups atrasados")
            : (false, "Error al enviar alerta");
    }

    /// <summary>
    /// Obtiene los backups atrasados del caché de Overview
    /// </summary>
    private async Task<List<OverviewBackupIssueDto>> GetBackupIssuesFromCacheAsync()
    {
        var cache = await _context.OverviewSummaryCache
            .FirstOrDefaultAsync(c => c.CacheKey == "Production");

        if (cache == null || string.IsNullOrEmpty(cache.BackupIssuesJson))
        {
            return new List<OverviewBackupIssueDto>();
        }

        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var backupIssues = JsonSerializer.Deserialize<List<OverviewBackupIssueDto>>(cache.BackupIssuesJson, options);
            return backupIssues ?? new List<OverviewBackupIssueDto>();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deserializando caché de backups");
            return new List<OverviewBackupIssueDto>();
        }
    }

    /// <summary>
    /// Genera el HTML del email de alerta
    /// </summary>
    private string GenerateAlertEmailBody(List<BackupIssueSummaryDto> issues, bool isTest)
    {
        var testBanner = isTest ? @"
            <div style='background-color: #f59e0b; color: white; padding: 10px; text-align: center; font-weight: bold;'>
                EMAIL DE PRUEBA - Este es un email de prueba del sistema de alertas
            </div>" : "";

        var issueRows = string.Join("", issues.Select(i => $@"
            <tr>
                <td style='padding: 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace;'>{i.InstanceName}</td>
                <td style='padding: 12px; border-bottom: 1px solid #e2e8f0; text-align: center;'>
                    {(i.FullBackupBreached && i.LogBackupBreached 
                        ? "<span style='background-color: #dc2626; color: white; padding: 2px 8px; border-radius: 4px;'>FULL + LOG</span>"
                        : i.FullBackupBreached 
                            ? "<span style='background-color: #dc2626; color: white; padding: 2px 8px; border-radius: 4px;'>FULL</span>"
                            : "<span style='background-color: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px;'>LOG</span>")}
                </td>
            </tr>"));

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='utf-8'>
    <style>
        body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }}
        .container {{ max-width: 700px; margin: 0 auto; }}
        .header {{ background-color: #dc2626; color: white; padding: 20px; text-align: center; }}
        .header h1 {{ margin: 0; font-size: 24px; }}
        .content {{ background-color: #ffffff; padding: 20px; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 20px; }}
        .stat-card {{ background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 15px; flex: 1; text-align: center; }}
        .stat-value {{ font-size: 32px; font-weight: bold; color: #dc2626; }}
        .stat-label {{ color: #991b1b; font-size: 12px; }}
        table {{ width: 100%; border-collapse: collapse; margin-top: 20px; }}
        th {{ background-color: #1e293b; color: white; padding: 12px; text-align: left; }}
        .footer {{ background-color: #1e293b; color: #94a3b8; padding: 15px; text-align: center; font-size: 12px; }}
        .note {{ background-color: #f8fafc; border-left: 4px solid #3b82f6; padding: 15px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class='container'>
        {testBanner}
        <div class='header'>
            <h1>Alerta de Backups Atrasados</h1>
        </div>
        <div class='content'>
            <div class='stats'>
                <div class='stat-card'>
                    <div class='stat-value'>{issues.Count}</div>
                    <div class='stat-label'>INSTANCIAS CON BACKUPS ATRASADOS</div>
                </div>
            </div>
            
            <p>Las siguientes instancias de <strong>Producción</strong> tienen backups vencidos y requieren atención:</p>
            
            <table>
                <thead>
                    <tr>
                        <th>Instancia</th>
                        <th style='text-align: center;'>Tipo de Backup</th>
                    </tr>
                </thead>
                <tbody>
                    {issueRows}
                </tbody>
            </table>
            
            <div class='note'>
                <strong>Nota:</strong> Esta alerta no incluye instancias que ya tienen un responsable asignado en el Overview de SQLNova.
                Para dejar de recibir alertas sobre una instancia específica, asigne un responsable desde el panel de Overview.
            </div>
        </div>
        <div class='footer'>
            SQLNova App - Sistema de Monitoreo DBA<br/>
            {DateTime.Now:dd/MM/yyyy HH:mm:ss}
        </div>
    </div>
</body>
</html>";
    }
}
