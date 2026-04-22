using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IBackupAlertService
{
    /// <summary>
    /// Obtiene la configuración de alertas por tipo (FULL o LOG)
    /// </summary>
    Task<BackupAlertConfig?> GetConfigAsync(BackupAlertType alertType);
    
    /// <summary>
    /// Actualiza la configuración de alertas por tipo
    /// </summary>
    Task<BackupAlertConfig> UpdateConfigAsync(BackupAlertType alertType, UpdateBackupAlertRequest request, string userId, string userDisplayName);
    
    /// <summary>
    /// Obtiene el historial de alertas por tipo
    /// </summary>
    Task<List<BackupAlertHistory>> GetHistoryAsync(BackupAlertType alertType, int limit = 20);
    
    /// <summary>
    /// Obtiene el estado actual de backups (combinado FULL y LOG)
    /// </summary>
    Task<BackupAlertStatusDto> GetStatusAsync();
    
    /// <summary>
    /// Envía un email de prueba por tipo
    /// </summary>
    Task<(bool success, string message)> TestAlertAsync(BackupAlertType alertType);
    
    /// <summary>
    /// Ejecuta la verificación y envía alerta por tipo
    /// </summary>
    Task<(bool success, string message)> RunCheckAsync(BackupAlertType alertType);
}

/// <summary>
/// Servicio para gestionar alertas de backups atrasados (FULL y LOG independientes)
/// </summary>
public class BackupAlertService : IBackupAlertService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly IServerExclusionService _serverExclusionService;
    private readonly ILogger<BackupAlertService> _logger;

    public BackupAlertService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        IServerExclusionService serverExclusionService,
        ILogger<BackupAlertService> logger)
    {
        _context = context;
        _smtpService = smtpService;
        _serverExclusionService = serverExclusionService;
        _logger = logger;
    }

    public async Task<BackupAlertConfig?> GetConfigAsync(BackupAlertType alertType)
    {
        try
        {
            var config = await _context.BackupAlertConfigs
                .Include(c => c.UpdatedByUser)
                .FirstOrDefaultAsync(c => c.AlertType == alertType);

            // Si no existe, crear una configuración por defecto
            if (config == null)
            {
                config = await CreateDefaultConfigAsync(alertType);
            }

            return config;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener configuración de alertas de backup tipo {AlertType}. La tabla podría no existir aún.", alertType);
            return null;
        }
    }

    /// <summary>
    /// Crea una configuración por defecto para el tipo especificado
    /// </summary>
    private async Task<BackupAlertConfig> CreateDefaultConfigAsync(BackupAlertType alertType)
    {
        var config = new BackupAlertConfig
        {
            AlertType = alertType,
            Name = alertType == BackupAlertType.Full 
                ? "Alerta de Backups FULL Atrasados" 
                : "Alerta de Backups LOG Atrasados",
            Description = alertType == BackupAlertType.Full
                ? "Alerta automática cuando se detectan backups FULL vencidos"
                : "Alerta automática cuando se detectan backups LOG vencidos",
            IsEnabled = false,
            CheckIntervalMinutes = 60,
            AlertIntervalMinutes = 240,
            Recipients = "",
            CcRecipients = "",
            CreatedAt = LocalClockAR.Now
        };

        _context.BackupAlertConfigs.Add(config);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Configuración de alerta {AlertType} creada por defecto", alertType);
        return config;
    }

    public async Task<BackupAlertConfig> UpdateConfigAsync(BackupAlertType alertType, UpdateBackupAlertRequest request, string userId, string userDisplayName)
    {
        var config = await _context.BackupAlertConfigs.FirstOrDefaultAsync(c => c.AlertType == alertType);
        
        if (config == null)
        {
            config = await CreateDefaultConfigAsync(alertType);
        }

        if (request.Name != null) config.Name = request.Name;
        if (request.Description != null) config.Description = request.Description;
        if (request.IsEnabled.HasValue) config.IsEnabled = request.IsEnabled.Value;
        if (request.CheckIntervalMinutes.HasValue) config.CheckIntervalMinutes = request.CheckIntervalMinutes.Value;
        if (request.AlertIntervalMinutes.HasValue) config.AlertIntervalMinutes = request.AlertIntervalMinutes.Value;
        if (request.Recipients != null) config.Recipients = string.Join(",", request.Recipients);
        if (request.CcRecipients != null) config.CcRecipients = string.Join(",", request.CcRecipients);
        if (request.DmzRecipients != null) config.DmzRecipients = string.Join(",", request.DmzRecipients);
        if (request.DmzCcRecipients != null) config.DmzCcRecipients = string.Join(",", request.DmzCcRecipients);

        config.UpdatedAt = LocalClockAR.Now;
        config.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<List<BackupAlertHistory>> GetHistoryAsync(BackupAlertType alertType, int limit = 20)
    {
        try
        {
            return await _context.BackupAlertHistories
                .Where(h => h.AlertType == alertType)
                .OrderByDescending(h => h.SentAt)
                .Take(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener historial de alertas de backup tipo {AlertType}. La tabla podría no existir aún.", alertType);
            return new List<BackupAlertHistory>();
        }
    }

    /// <summary>
    /// Obtiene el estado actual de backups (asignados vs no asignados) - Combinado para FULL y LOG
    /// </summary>
    public async Task<BackupAlertStatusDto> GetStatusAsync()
    {
        try
        {
            // Obtener backups atrasados del caché
            var backupIssues = await GetBackupIssuesFromCacheAsync();
            
            // Obtener asignaciones activas de tipo Backup
            List<OverviewIssueAssignment> assignments;
            try
            {
                assignments = await _context.OverviewIssueAssignments
                    .Include(a => a.AssignedToUser)
                    .Where(a => a.IssueType == "Backup" && a.ResolvedAt == null)
                    .ToListAsync();
            }
            catch
            {
                // Tabla de asignaciones podría no existir
                assignments = new List<OverviewIssueAssignment>();
            }

            // Usar DisplayName como clave de asignación (AGName para AGs, InstanceName para standalone)
            var assignedKeys = assignments.Select(a => a.InstanceName).ToHashSet(StringComparer.OrdinalIgnoreCase);

            var result = new BackupAlertStatusDto
            {
                UnassignedIssues = backupIssues
                    .Where(b => !assignedKeys.Contains(b.DisplayName) && !assignedKeys.Contains(b.InstanceName))
                    .Select(b => new BackupIssueSummaryDto
                    {
                        InstanceName = b.InstanceName,
                        DisplayName = b.DisplayName,
                        FullBackupBreached = b.FullBackupBreached,
                        LogBackupBreached = b.LogBackupBreached,
                        LogCheckSuppressed = b.LogCheckSuppressed,
                        LogCheckSuppressReason = b.LogCheckSuppressReason
                    })
                    .ToList(),
                AssignedIssues = backupIssues
                    .Where(b => assignedKeys.Contains(b.DisplayName) || assignedKeys.Contains(b.InstanceName))
                    .Select(b => 
                    {
                        var assignment = assignments.FirstOrDefault(a => 
                            a.InstanceName.Equals(b.DisplayName, StringComparison.OrdinalIgnoreCase) ||
                            a.InstanceName.Equals(b.InstanceName, StringComparison.OrdinalIgnoreCase));
                        return new BackupIssueSummaryDto
                        {
                            InstanceName = b.InstanceName,
                            DisplayName = b.DisplayName,
                            FullBackupBreached = b.FullBackupBreached,
                            LogBackupBreached = b.LogBackupBreached,
                            LogCheckSuppressed = b.LogCheckSuppressed,
                            LogCheckSuppressReason = b.LogCheckSuppressReason,
                            AssignedToUserName = assignment?.AssignedToUser?.DisplayName ?? assignment?.AssignedToUser?.DomainUser,
                            AssignedAt = assignment?.AssignedAt.ToString("dd/MM/yyyy HH:mm")
                        };
                    })
                    .ToList()
            };

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener estado de backups");
            return new BackupAlertStatusDto();
        }
    }

    /// <summary>
    /// Envía un email de prueba para el tipo especificado. Manda dos mails si hay
    /// destinatarios DMZ configurados: uno de prueba a Red y otro a DMZ.
    /// </summary>
    public async Task<(bool success, string message)> TestAlertAsync(BackupAlertType alertType)
    {
        var config = await GetConfigAsync(alertType);
        if (config == null)
        {
            return (false, "No hay configuración de alertas");
        }

        var networkRecipients = SplitEmails(config.Recipients);
        var networkCc = SplitEmails(config.CcRecipients);
        var dmzRecipients = SplitEmails(config.DmzRecipients);
        var dmzCc = SplitEmails(config.DmzCcRecipients);

        if (networkRecipients.Count == 0 && dmzRecipients.Count == 0)
        {
            return (false, "No hay destinatarios configurados (ni red ni DMZ)");
        }

        var status = await GetStatusAsync();
        var filtered = FilterIssuesByType(status.UnassignedIssues, alertType);
        var (networkIssues, dmzIssues) = PartitionByDmz(filtered);
        var typeName = alertType == BackupAlertType.Full ? "FULL" : "LOG";

        var summary = new List<string>();
        var anyFailure = false;

        if (networkRecipients.Count > 0)
        {
            var body = GenerateAlertEmailBody(networkIssues, alertType, isTest: true, scopeLabel: "Red");
            var ok = await _smtpService.SendEmailWithCcAsync(
                networkRecipients, networkCc,
                $"[DBA] Alerta de Backups {typeName} (Red) - PRUEBA",
                body,
                $"BackupAlert{typeName}NetworkTest");
            if (ok) summary.Add($"Red: {networkRecipients.Count} TO / {networkCc.Count} CC");
            else { anyFailure = true; summary.Add("Red: error al enviar"); }
        }

        if (dmzRecipients.Count > 0)
        {
            var body = GenerateAlertEmailBody(dmzIssues, alertType, isTest: true, scopeLabel: "DMZ");
            var ok = await _smtpService.SendEmailWithCcAsync(
                dmzRecipients, dmzCc,
                $"[DBA] Alerta de Backups {typeName} (DMZ) - PRUEBA",
                body,
                $"BackupAlert{typeName}DmzTest");
            if (ok) summary.Add($"DMZ: {dmzRecipients.Count} TO / {dmzCc.Count} CC");
            else { anyFailure = true; summary.Add("DMZ: error al enviar"); }
        }

        return anyFailure
            ? (false, $"Prueba {typeName}: " + string.Join(" | ", summary))
            : (true,  $"Prueba {typeName} enviada — " + string.Join(" | ", summary));
    }

    /// <summary>
    /// Ejecuta la verificación y envía alertas. Separa los issues por red vs DMZ y
    /// emite hasta dos mails independientes, cada uno con sus propios destinatarios.
    /// Si DmzRecipients está vacío, los backups DMZ atrasados NO generan mail.
    /// </summary>
    public async Task<(bool success, string message)> RunCheckAsync(BackupAlertType alertType)
    {
        var config = await GetConfigAsync(alertType);
        if (config == null || !config.IsEnabled)
        {
            return (false, $"Alerta {alertType} no está habilitada");
        }

        var typeName = alertType == BackupAlertType.Full ? "FULL" : "LOG";

        // Actualizar última ejecución (hora Argentina)
        config.LastRunAt = LocalClockAR.Now;
        await _context.SaveChangesAsync();

        // Obtener estado actual y particionar
        var status = await GetStatusAsync();
        var effectiveIssues = FilterIssuesByType(status.UnassignedIssues, alertType);

        if (effectiveIssues.Count == 0)
        {
            _logger.LogInformation("No hay backups {Type} atrasados sin asignar", typeName);
            return (true, $"No hay backups {typeName} atrasados sin asignar");
        }

        // Verificar si debe enviar alerta (respetando AlertIntervalMinutes)
        if (config.LastAlertSentAt.HasValue)
        {
            var minutesSinceLastAlert = (LocalClockAR.Now - config.LastAlertSentAt.Value).TotalMinutes;
            if (minutesSinceLastAlert < config.AlertIntervalMinutes)
            {
                _logger.LogInformation(
                    "Hay {Count} backups {Type} atrasados sin asignar, pero aún no se cumple el intervalo de alerta ({Minutes} minutos desde la última)",
                    effectiveIssues.Count, typeName, (int)minutesSinceLastAlert);
                return (true, $"Hay {effectiveIssues.Count} backups {typeName} atrasados, próxima alerta en {config.AlertIntervalMinutes - (int)minutesSinceLastAlert} minutos");
            }
        }

        var (networkIssues, dmzIssues) = PartitionByDmz(effectiveIssues);
        var networkRecipients = SplitEmails(config.Recipients);
        var networkCc = SplitEmails(config.CcRecipients);
        var dmzRecipients = SplitEmails(config.DmzRecipients);
        var dmzCc = SplitEmails(config.DmzCcRecipients);

        var anyMailSent = false;
        var anyMailFailed = false;
        var summary = new List<string>();

        // Mail 1: Red — solo si hay instancias de red Y destinatarios configurados.
        if (networkIssues.Count > 0 && networkRecipients.Count > 0)
        {
            var body = GenerateAlertEmailBody(networkIssues, alertType, isTest: false, scopeLabel: "Red");
            var ok = await _smtpService.SendEmailWithCcAsync(
                networkRecipients, networkCc,
                $"[DBA] Alerta: {networkIssues.Count} Instancia(s) en Red con Backups {typeName} Atrasados",
                body,
                $"BackupAlert{typeName}Network");

            await RegisterHistoryAsync(config.Id, alertType, networkRecipients.Count, networkCc.Count, networkIssues, ok, "Red");
            if (ok) { anyMailSent = true; summary.Add($"Red: {networkIssues.Count} instancias → {networkRecipients.Count} TO"); }
            else    { anyMailFailed = true; summary.Add("Red: error al enviar"); }
        }
        else if (networkIssues.Count > 0)
        {
            _logger.LogWarning("Hay {Count} backups {Type} atrasados en red pero no hay destinatarios configurados", networkIssues.Count, typeName);
            summary.Add($"Red: {networkIssues.Count} instancias sin destinatarios (no se envió)");
        }

        // Mail 2: DMZ — solo si hay instancias DMZ Y destinatarios DMZ configurados.
        // Si DmzRecipients está vacío, se omite intencionalmente (decisión del usuario).
        if (dmzIssues.Count > 0 && dmzRecipients.Count > 0)
        {
            var body = GenerateAlertEmailBody(dmzIssues, alertType, isTest: false, scopeLabel: "DMZ");
            var ok = await _smtpService.SendEmailWithCcAsync(
                dmzRecipients, dmzCc,
                $"[DBA] Alerta: {dmzIssues.Count} Instancia(s) DMZ con Backups {typeName} Atrasados",
                body,
                $"BackupAlert{typeName}Dmz");

            await RegisterHistoryAsync(config.Id, alertType, dmzRecipients.Count, dmzCc.Count, dmzIssues, ok, "DMZ");
            if (ok) { anyMailSent = true; summary.Add($"DMZ: {dmzIssues.Count} instancias → {dmzRecipients.Count} TO"); }
            else    { anyMailFailed = true; summary.Add("DMZ: error al enviar"); }
        }
        else if (dmzIssues.Count > 0)
        {
            _logger.LogInformation(
                "Hay {Count} backups {Type} atrasados en DMZ pero no hay destinatarios DMZ configurados (no se envía)",
                dmzIssues.Count, typeName);
            summary.Add($"DMZ: {dmzIssues.Count} instancias sin destinatarios DMZ (omitido)");
        }

        if (anyMailSent)
        {
            config.LastAlertSentAt = LocalClockAR.Now;
            await _context.SaveChangesAsync();
        }

        if (summary.Count == 0)
        {
            return (true, $"Alerta {typeName}: nada que notificar");
        }

        var summaryText = $"Alerta {typeName}: " + string.Join(" | ", summary);
        return anyMailFailed ? (false, summaryText) : (true, summaryText);
    }

    private async Task RegisterHistoryAsync(
        int configId, BackupAlertType alertType,
        int recipientCount, int ccCount,
        List<BackupIssueSummaryDto> issues, bool success, string scopeLabel)
    {
        _context.BackupAlertHistories.Add(new BackupAlertHistory
        {
            ConfigId = configId,
            AlertType = alertType,
            SentAt = LocalClockAR.Now,
            RecipientCount = recipientCount,
            CcCount = ccCount,
            InstancesAffected = $"[{scopeLabel}] " + string.Join(",",
                issues.Select(i => !string.IsNullOrEmpty(i.DisplayName) ? i.DisplayName : i.InstanceName)),
            Success = success,
            ErrorMessage = success ? null : $"Error al enviar email ({scopeLabel})"
        });
        await _context.SaveChangesAsync();
    }

    private static List<string> SplitEmails(string? commaSeparated) =>
        commaSeparated?.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList()
            ?? new List<string>();

    private static (List<BackupIssueSummaryDto> network, List<BackupIssueSummaryDto> dmz) PartitionByDmz(
        List<BackupIssueSummaryDto> issues)
    {
        var network = new List<BackupIssueSummaryDto>();
        var dmz = new List<BackupIssueSummaryDto>();
        foreach (var issue in issues)
        {
            var name = !string.IsNullOrEmpty(issue.DisplayName) ? issue.DisplayName : issue.InstanceName;
            if (name.Contains("DMZ", StringComparison.OrdinalIgnoreCase)
                || issue.InstanceName.Contains("DMZ", StringComparison.OrdinalIgnoreCase))
                dmz.Add(issue);
            else
                network.Add(issue);
        }
        return (network, dmz);
    }

    /// <summary>
    /// Filtra los issues por tipo de alerta (FULL o LOG)
    /// </summary>
    private List<BackupIssueSummaryDto> FilterIssuesByType(List<BackupIssueSummaryDto> issues, BackupAlertType alertType)
    {
        if (alertType == BackupAlertType.Full)
        {
            // Solo instancias con FULL backup breach
            return issues.Where(i => i.FullBackupBreached).ToList();
        }
        else
        {
            // Solo instancias con LOG backup breach Y que no esté suprimido
            return issues.Where(i => i.LogBackupBreached && !i.LogCheckSuppressed).ToList();
        }
    }

    /// <summary>
    /// Obtiene los backups atrasados del caché de Overview
    /// Filtra servidores excluidos globalmente (dados de baja)
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
            
            if (backupIssues == null)
                return new List<OverviewBackupIssueDto>();

            // Filtrar servidores excluidos globalmente (dados de baja)
            var excludedServers = await _serverExclusionService.GetExcludedServerNamesAsync();
            if (excludedServers.Count > 0)
            {
                var beforeCount = backupIssues.Count;
                backupIssues = backupIssues
                    .Where(b => !excludedServers.Contains(b.InstanceName) 
                             && !excludedServers.Contains(b.InstanceName.Split('\\')[0]))
                    .ToList();
                
                if (beforeCount != backupIssues.Count)
                {
                    _logger.LogInformation("Excluded {Count} backup issues from alert (server alert exclusions)", 
                        beforeCount - backupIssues.Count);
                }
            }

            return backupIssues;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deserializando caché de backups");
            return new List<OverviewBackupIssueDto>();
        }
    }

    /// <summary>
    /// Genera el HTML del email de alerta - Formato minimalista y profesional.
    /// scopeLabel ("Red" o "DMZ") distingue visualmente qué grupo de instancias incluye.
    /// </summary>
    private string GenerateAlertEmailBody(List<BackupIssueSummaryDto> issues, BackupAlertType alertType, bool isTest, string scopeLabel = "Red")
    {
        var now = LocalClockAR.Now;
        var typeName = alertType == BackupAlertType.Full ? "FULL" : "LOG";
        var testNotice = isTest
            ? "<p style='color: #856404; background-color: #fff3cd; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px;'><strong>Nota:</strong> Este es un email de prueba.</p>"
            : "";

        var issueRows = string.Join("", issues.Select(issue =>
        {
            // Usar DisplayName (nombre del AG si aplica, sino InstanceName)
            var displayName = !string.IsNullOrEmpty(issue.DisplayName) ? issue.DisplayName : issue.InstanceName;
            return $@"
                <tr>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0;'>{displayName}</td>
                </tr>";
        }));

        var scopeDescription = scopeLabel == "DMZ"
            ? "en servidores DMZ"
            : "en servidores en red";
        var description = alertType == BackupAlertType.Full
            ? $"backups FULL (completos) atrasados {scopeDescription}"
            : $"backups de LOG (transaccionales) atrasados {scopeDescription}";

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Calibri, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;'>
    
    {testNotice}
    
    <p>Hola,</p>
    
    <p>Se detectaron <strong>{issues.Count} instancia(s)</strong> de SQL Server en Producción con {description}:</p>
    
    <table style='border-collapse: collapse; margin: 16px 0; font-size: 13px;' cellpadding='0' cellspacing='0'>
        <thead>
            <tr style='background-color: #f5f5f5;'>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>Instancia</th>
            </tr>
        </thead>
        <tbody>
            {issueRows}
        </tbody>
    </table>
    
    <p>Por favor revisar a la brevedad.</p>
    
    <p>Saludos,<br>
    <strong>Equipo DBA</strong></p>
    
    <hr style='border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;'>
    
    <p style='font-size: 11px; color: #888;'>
        Alerta automática de Backups {typeName} ({scopeLabel}) generada el {now:dd/MM/yyyy} a las {now:HH:mm} hs (Argentina)
    </p>
    
</body>
</html>";
    }
}
