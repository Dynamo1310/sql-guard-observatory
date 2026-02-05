using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
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
        try
        {
            return await _context.BackupAlertConfigs
                .Include(c => c.UpdatedByUser)
                .FirstOrDefaultAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener configuración de alertas de backup. La tabla podría no existir aún.");
            return null;
        }
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
            CreatedAt = LocalClockAR.Now,
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
        
        config.UpdatedAt = LocalClockAR.Now;
        config.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();
        return config;
    }

    public async Task<List<BackupAlertHistory>> GetHistoryAsync(int limit = 20)
    {
        try
        {
            return await _context.BackupAlertHistories
                .OrderByDescending(h => h.SentAt)
                .Take(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener historial de alertas de backup. La tabla podría no existir aún.");
            return new List<BackupAlertHistory>();
        }
    }

    /// <summary>
    /// Obtiene el estado actual de backups (asignados vs no asignados)
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

            var assignedInstanceNames = assignments.Select(a => a.InstanceName).ToHashSet();

            var result = new BackupAlertStatusDto
            {
                UnassignedIssues = backupIssues
                    .Where(b => !assignedInstanceNames.Contains(b.InstanceName))
                    .Select(b => new BackupIssueSummaryDto
                    {
                        InstanceName = b.InstanceName,
                        FullBackupBreached = b.FullBackupBreached,
                        LogBackupBreached = b.LogBackupBreached,
                        LogCheckSuppressed = b.LogCheckSuppressed,
                        LogCheckSuppressReason = b.LogCheckSuppressReason
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
            "[DBA] Alerta de Backups - PRUEBA",
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

        // Actualizar última ejecución (hora Argentina)
        config.LastRunAt = LocalClockAR.Now;
        await _context.SaveChangesAsync();

        // Obtener estado actual
        var status = await GetStatusAsync();
        
        // Filtrar issues que solo tienen LOG breach pero está suprimido
        // Estas instancias no deben generar alerta
        var effectiveIssues = status.UnassignedIssues
            .Where(i => i.FullBackupBreached || (i.LogBackupBreached && !i.LogCheckSuppressed))
            .ToList();
        
        if (effectiveIssues.Count == 0)
        {
            var suppressedCount = status.UnassignedIssues.Count - effectiveIssues.Count;
            if (suppressedCount > 0)
            {
                _logger.LogInformation(
                    "No hay backups atrasados sin asignar que requieran alerta ({SuppressedCount} instancias con LOG suprimido por FULL en ejecución)",
                    suppressedCount);
            }
            else
            {
                _logger.LogInformation("No hay backups atrasados sin asignar");
            }
            return (true, "No hay backups atrasados sin asignar");
        }

        // Verificar si debe enviar alerta (respetando AlertIntervalMinutes)
        if (config.LastAlertSentAt.HasValue)
        {
            var minutesSinceLastAlert = (LocalClockAR.Now - config.LastAlertSentAt.Value).TotalMinutes;
            if (minutesSinceLastAlert < config.AlertIntervalMinutes)
            {
                _logger.LogInformation(
                    "Hay {Count} backups atrasados sin asignar, pero aún no se cumple el intervalo de alerta ({Minutes} minutos desde la última)",
                    effectiveIssues.Count, (int)minutesSinceLastAlert);
                return (true, $"Hay {effectiveIssues.Count} backups atrasados, próxima alerta en {config.AlertIntervalMinutes - (int)minutesSinceLastAlert} minutos");
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

        var htmlBody = GenerateAlertEmailBody(effectiveIssues, isTest: false);

        var success = await _smtpService.SendEmailWithCcAsync(
            recipients,
            ccRecipients,
            $"[DBA] Alerta: {effectiveIssues.Count} Instancia(s) con Backups Atrasados",
            htmlBody,
            "BackupAlert"
        );

        // Registrar en historial (hora Argentina)
        var history = new BackupAlertHistory
        {
            ConfigId = config.Id,
            SentAt = LocalClockAR.Now,
            RecipientCount = recipients.Count,
            CcCount = ccRecipients.Count,
            InstancesAffected = string.Join(",", effectiveIssues.Select(i => i.InstanceName)),
            Success = success,
            ErrorMessage = success ? null : "Error al enviar email"
        };

        _context.BackupAlertHistories.Add(history);
        
        if (success)
        {
            config.LastAlertSentAt = LocalClockAR.Now;
        }
        
        await _context.SaveChangesAsync();

        return success
            ? (true, $"Alerta enviada a {recipients.Count} destinatarios para {effectiveIssues.Count} backups atrasados")
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
    /// Genera el HTML del email de alerta - Formato minimalista y profesional
    /// Nota: No incluye alertas de LOG cuando LogCheckSuppressed es true (FULL en ejecución o grace period)
    /// </summary>
    private string GenerateAlertEmailBody(List<BackupIssueSummaryDto> issues, bool isTest)
    {
        var now = LocalClockAR.Now;
        var testNotice = isTest ? "<p style='color: #856404; background-color: #fff3cd; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px;'><strong>Nota:</strong> Este es un email de prueba.</p>" : "";

        var issueRows = string.Join("", issues.Select(issue => 
        {
            // Si LOG está suprimido (FULL running o grace period), no incluir LOG en el tipo de backup
            var effectiveLogBreached = issue.LogBackupBreached && !issue.LogCheckSuppressed;
            
            // Determinar el tipo de backup a mostrar
            string backupType;
            if (issue.FullBackupBreached && effectiveLogBreached)
            {
                backupType = "Full + Log";
            }
            else if (issue.FullBackupBreached)
            {
                backupType = "Full";
            }
            else if (effectiveLogBreached)
            {
                backupType = "Log";
            }
            else
            {
                // Si no hay ningún breach efectivo, esta instancia no debería estar en la lista
                // pero por seguridad, retornamos vacío
                return "";
            }
            
            return $@"
                <tr>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0;'>{issue.InstanceName}</td>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0; text-align: center;'>{backupType}</td>
                </tr>";
        }));

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Calibri, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;'>
    
    {testNotice}
    
    <p>Hola,</p>
    
    <p>Se detectaron <strong>{issues.Count} instancia(s)</strong> de SQL Server en Producción con backups atrasados:</p>
    
    <table style='border-collapse: collapse; margin: 16px 0; font-size: 13px;' cellpadding='0' cellspacing='0'>
        <thead>
            <tr style='background-color: #f5f5f5;'>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>Instancia</th>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: center; font-weight: 600;'>Tipo</th>
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
        Alerta automática generada el {now:dd/MM/yyyy} a las {now:HH:mm} hs (Argentina)
    </p>
    
</body>
</html>";
    }
}
