using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

public interface IDiskAlertService
{
    /// <summary>
    /// Obtiene la configuración de alertas de discos críticos
    /// </summary>
    Task<DiskAlertConfig?> GetConfigAsync();
    
    /// <summary>
    /// Actualiza la configuración de alertas
    /// </summary>
    Task<DiskAlertConfig> UpdateConfigAsync(UpdateDiskAlertRequest request, string userId, string userDisplayName);
    
    /// <summary>
    /// Obtiene el historial de alertas enviadas
    /// </summary>
    Task<List<DiskAlertHistory>> GetHistoryAsync(int limit = 20);
    
    /// <summary>
    /// Obtiene el estado actual de discos críticos
    /// </summary>
    Task<DiskAlertStatusDto> GetStatusAsync();
    
    /// <summary>
    /// Envía un email de prueba
    /// </summary>
    Task<(bool success, string message)> TestAlertAsync();
    
    /// <summary>
    /// Ejecuta la verificación y envía alerta si hay discos críticos
    /// </summary>
    Task<(bool success, string message)> RunCheckAsync();
}

/// <summary>
/// Servicio para gestionar alertas de discos críticos por email
/// Detecta discos con IsAlerted=true desde InstanceHealth_Discos
/// </summary>
public class DiskAlertService : IDiskAlertService
{
    private readonly ApplicationDbContext _context;
    private readonly ISmtpService _smtpService;
    private readonly ILogger<DiskAlertService> _logger;

    public DiskAlertService(
        ApplicationDbContext context,
        ISmtpService smtpService,
        ILogger<DiskAlertService> logger)
    {
        _context = context;
        _smtpService = smtpService;
        _logger = logger;
    }

    public async Task<DiskAlertConfig?> GetConfigAsync()
    {
        try
        {
            var config = await _context.DiskAlertConfigs
                .Include(c => c.UpdatedByUser)
                .FirstOrDefaultAsync();

            if (config == null)
            {
                config = await CreateDefaultConfigAsync();
            }

            return config;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener configuración de alertas de discos. La tabla podría no existir aún.");
            return null;
        }
    }

    private async Task<DiskAlertConfig> CreateDefaultConfigAsync()
    {
        var config = new DiskAlertConfig
        {
            Name = "Alerta de Discos Críticos",
            Description = "Alerta automática cuando se detectan discos con espacio crítico en servidores de Producción",
            IsEnabled = false,
            CheckIntervalMinutes = 60,
            AlertIntervalMinutes = 240,
            Recipients = "",
            CcRecipients = "",
            CreatedAt = LocalClockAR.Now
        };

        _context.DiskAlertConfigs.Add(config);
        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Configuración de alerta de discos creada por defecto");
        return config;
    }

    public async Task<DiskAlertConfig> UpdateConfigAsync(UpdateDiskAlertRequest request, string userId, string userDisplayName)
    {
        var config = await _context.DiskAlertConfigs.FirstOrDefaultAsync();
        
        if (config == null)
        {
            config = await CreateDefaultConfigAsync();
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

    public async Task<List<DiskAlertHistory>> GetHistoryAsync(int limit = 20)
    {
        try
        {
            return await _context.DiskAlertHistories
                .OrderByDescending(h => h.SentAt)
                .Take(limit)
                .ToListAsync();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener historial de alertas de discos. La tabla podría no existir aún.");
            return new List<DiskAlertHistory>();
        }
    }

    /// <summary>
    /// Obtiene los discos críticos actuales desde InstanceHealth_Discos (solo Producción)
    /// Separa los discos en asignados (con responsable) y sin asignar (generan alerta)
    /// </summary>
    public async Task<DiskAlertStatusDto> GetStatusAsync()
    {
        var allCriticalDisks = new List<CriticalDiskIssueSummaryDto>();

        try
        {
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

            var rawData = await _context.Database
                .SqlQueryRaw<DiskAlertRawData>(query)
                .ToListAsync();

            var jsonOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

            foreach (var row in rawData)
            {
                if (string.IsNullOrEmpty(row.VolumesJson))
                    continue;

                try
                {
                    var volumes = JsonSerializer.Deserialize<List<DiskAlertVolumeJson>>(row.VolumesJson, jsonOptions);
                    if (volumes == null) continue;

                    foreach (var vol in volumes)
                    {
                        var isAlerted = vol.IsAlerted ?? false;
                        if (!isAlerted) continue;

                        allCriticalDisks.Add(new CriticalDiskIssueSummaryDto
                        {
                            InstanceName = row.InstanceName,
                            Drive = vol.MountPoint ?? "N/A",
                            PorcentajeLibre = vol.FreePct ?? 0,
                            LibreGB = vol.FreeGB ?? 0,
                            TotalGB = vol.TotalGB,
                            RealPorcentajeLibre = vol.RealFreePct ?? vol.FreePct,
                            RealLibreGB = vol.RealFreeGB ?? vol.FreeGB,
                            IsCriticalSystemDisk = vol.IsCriticalSystemDisk ?? false
                        });
                    }
                }
                catch (JsonException jsonEx)
                {
                    _logger.LogWarning(jsonEx, "Error parseando VolumesJson para {Instance}", row.InstanceName);
                }
            }

            // Obtener asignaciones activas de tipo Disk
            List<OverviewIssueAssignment> assignments;
            try
            {
                assignments = await _context.OverviewIssueAssignments
                    .Include(a => a.AssignedToUser)
                    .Where(a => a.IssueType == "Disk" && a.ResolvedAt == null)
                    .ToListAsync();
            }
            catch
            {
                assignments = new List<OverviewIssueAssignment>();
            }

            // Crear set de claves asignadas: "InstanceName|Drive"
            var assignedKeys = assignments
                .Select(a => $"{a.InstanceName}|{a.DriveOrTipo ?? ""}".ToUpperInvariant())
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            // Separar en asignados y sin asignar
            var unassigned = new List<CriticalDiskIssueSummaryDto>();
            var assigned = new List<CriticalDiskIssueSummaryDto>();

            foreach (var disk in allCriticalDisks)
            {
                var key = $"{disk.InstanceName}|{disk.Drive}".ToUpperInvariant();
                var assignment = assignments.FirstOrDefault(a =>
                    a.InstanceName.Equals(disk.InstanceName, StringComparison.OrdinalIgnoreCase) &&
                    (a.DriveOrTipo ?? "").Equals(disk.Drive, StringComparison.OrdinalIgnoreCase));

                if (assignment != null)
                {
                    disk.AssignedToUserName = assignment.AssignedToUser?.DisplayName ?? assignment.AssignedToUser?.DomainUser;
                    disk.AssignedAt = assignment.AssignedAt.ToString("dd/MM/yyyy HH:mm");
                    assigned.Add(disk);
                }
                else
                {
                    unassigned.Add(disk);
                }
            }

            return new DiskAlertStatusDto
            {
                UnassignedDisks = unassigned.OrderBy(d => d.PorcentajeLibre).ThenBy(d => d.InstanceName).ToList(),
                AssignedDisks = assigned.OrderBy(d => d.PorcentajeLibre).ThenBy(d => d.InstanceName).ToList(),
                TotalCriticalDisks = allCriticalDisks.Count
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo discos críticos para alertas");
            return new DiskAlertStatusDto();
        }
    }

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
        // Test muestra solo los no asignados (lo mismo que enviaría el alertado real)
        var htmlBody = GenerateAlertEmailBody(status.UnassignedDisks, isTest: true);

        var success = await _smtpService.SendEmailWithCcAsync(
            recipients,
            ccRecipients,
            "[DBA] Alerta de Discos Críticos - PRUEBA",
            htmlBody,
            "DiskAlertTest"
        );

        return success 
            ? (true, $"Email de prueba enviado a {recipients.Count} destinatarios y {ccRecipients.Count} en CC")
            : (false, "Error al enviar email de prueba");
    }

    public async Task<(bool success, string message)> RunCheckAsync()
    {
        var config = await GetConfigAsync();
        if (config == null || !config.IsEnabled)
        {
            return (false, "Alerta de discos no está habilitada");
        }

        // Actualizar última ejecución (hora Argentina)
        config.LastRunAt = LocalClockAR.Now;
        await _context.SaveChangesAsync();

        // Obtener estado actual
        var status = await GetStatusAsync();
        
        // Solo alertar sobre discos SIN asignar
        var effectiveDisks = status.UnassignedDisks;
        
        if (effectiveDisks.Count == 0)
        {
            _logger.LogInformation("No hay discos críticos sin asignar en Producción (total: {Total}, asignados: {Assigned})",
                status.TotalCriticalDisks, status.AssignedDisks.Count);
            return (true, status.AssignedDisks.Count > 0
                ? $"No hay discos críticos sin asignar ({status.AssignedDisks.Count} con responsable asignado)"
                : "No hay discos críticos en Producción");
        }

        // Verificar si debe enviar alerta (respetando AlertIntervalMinutes)
        if (config.LastAlertSentAt.HasValue)
        {
            var minutesSinceLastAlert = (LocalClockAR.Now - config.LastAlertSentAt.Value).TotalMinutes;
            if (minutesSinceLastAlert < config.AlertIntervalMinutes)
            {
                _logger.LogInformation(
                    "Hay {Count} discos críticos sin asignar, pero aún no se cumple el intervalo de alerta ({Minutes} minutos desde la última)",
                    effectiveDisks.Count, (int)minutesSinceLastAlert);
                return (true, $"Hay {effectiveDisks.Count} discos críticos sin asignar, próxima alerta en {config.AlertIntervalMinutes - (int)minutesSinceLastAlert} minutos");
            }
        }

        // Enviar alerta
        var recipients = config.Recipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();
        var ccRecipients = config.CcRecipients?.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList() ?? new List<string>();

        if (recipients.Count == 0)
        {
            _logger.LogWarning("No hay destinatarios configurados para alertas de discos");
            return (false, "No hay destinatarios configurados");
        }

        var htmlBody = GenerateAlertEmailBody(effectiveDisks, isTest: false);

        var success = await _smtpService.SendEmailWithCcAsync(
            recipients,
            ccRecipients,
            $"[DBA] Alerta: {effectiveDisks.Count} Disco(s) Crítico(s) en Producción",
            htmlBody,
            "DiskAlert"
        );

        // Registrar en historial
        var history = new DiskAlertHistory
        {
            ConfigId = config.Id,
            SentAt = LocalClockAR.Now,
            RecipientCount = recipients.Count,
            CcCount = ccRecipients.Count,
            DisksAffected = string.Join(",", effectiveDisks.Select(d => $"{d.InstanceName}|{d.Drive}")),
            CriticalDiskCount = effectiveDisks.Count,
            Success = success,
            ErrorMessage = success ? null : "Error al enviar email"
        };

        _context.DiskAlertHistories.Add(history);
        
        if (success)
        {
            config.LastAlertSentAt = LocalClockAR.Now;
        }
        
        await _context.SaveChangesAsync();

        return success
            ? (true, $"Alerta enviada a {recipients.Count} destinatarios para {effectiveDisks.Count} discos críticos sin asignar")
            : (false, "Error al enviar alerta");
    }

    /// <summary>
    /// Genera el HTML del email de alerta - Formato minimalista (mismo estilo que backups)
    /// </summary>
    private string GenerateAlertEmailBody(List<CriticalDiskIssueSummaryDto> disks, bool isTest)
    {
        var now = LocalClockAR.Now;
        var testNotice = isTest 
            ? "<p style='color: #856404; background-color: #fff3cd; padding: 8px 12px; border-radius: 4px; margin-bottom: 16px;'><strong>Nota:</strong> Este es un email de prueba.</p>" 
            : "";

        var issueRows = string.Join("", disks.Select(disk => 
        {
            var pctColor = disk.PorcentajeLibre < 5 ? "#dc2626" : "#ea580c";
            return $@"
                <tr>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0;'>{disk.InstanceName}</td>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0;'>{disk.Drive}</td>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0; color: {pctColor}; font-weight: 600;'>{disk.PorcentajeLibre:F1}%</td>
                    <td style='padding: 6px 12px; border-bottom: 1px solid #e0e0e0;'>{disk.LibreGB:F1} GB</td>
                </tr>";
        }));

        var diskCount = disks.Count;
        var instanceCount = disks.Select(d => d.InstanceName).Distinct().Count();

        return $@"
<!DOCTYPE html>
<html>
<head>
    <meta charset='UTF-8'>
</head>
<body style='font-family: Calibri, Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5; margin: 0; padding: 20px;'>
    
    {testNotice}
    
    <p>Hola,</p>
    
    <p>Se detectaron <strong>{diskCount} disco(s) crítico(s)</strong> en <strong>{instanceCount} instancia(s)</strong> de SQL Server en Producción con espacio bajo:</p>
    
    <table style='border-collapse: collapse; margin: 16px 0; font-size: 13px;' cellpadding='0' cellspacing='0'>
        <thead>
            <tr style='background-color: #f5f5f5;'>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>Instancia</th>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>Disco</th>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>% Libre</th>
                <th style='padding: 8px 12px; border: 1px solid #e0e0e0; text-align: left; font-weight: 600;'>GB Libre</th>
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
        Alerta automática de Discos Críticos generada el {now:dd/MM/yyyy} a las {now:HH:mm} hs (Argentina)
    </p>
    
</body>
</html>";
    }
}

// Clase auxiliar para la query raw
public class DiskAlertRawData
{
    public string InstanceName { get; set; } = "";
    public string? VolumesJson { get; set; }
}

// Clase auxiliar para deserializar el JSON de volúmenes
internal class DiskAlertVolumeJson
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
    public bool? IsCriticalSystemDisk { get; set; }
}
