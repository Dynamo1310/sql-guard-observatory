using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de configuración de parcheos
/// </summary>
public interface IPatchConfigService
{
    // Freezing
    Task<List<PatchingFreezingConfigDto>> GetFreezingConfigAsync();
    Task<FreezingMonthInfoDto> GetFreezingMonthInfoAsync(int year, int month);
    Task<bool> UpdateFreezingConfigAsync(UpdateFreezingConfigRequest request, string userId);
    
    // Notificaciones
    Task<List<PatchNotificationSettingDto>> GetNotificationSettingsAsync();
    Task<PatchNotificationSettingDto?> UpdateNotificationSettingAsync(UpdateNotificationSettingRequest request, string userId);
    Task<List<PatchNotificationHistoryDto>> GetNotificationHistoryAsync(int? patchPlanId = null, int limit = 50);
}

/// <summary>
/// Servicio para gestionar la configuración de parcheos
/// </summary>
public class PatchConfigService : IPatchConfigService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<PatchConfigService> _logger;

    public PatchConfigService(
        ApplicationDbContext context,
        ILogger<PatchConfigService> logger)
    {
        _context = context;
        _logger = logger;
    }

    #region Freezing Configuration

    /// <summary>
    /// Obtiene la configuración de freezing
    /// </summary>
    public async Task<List<PatchingFreezingConfigDto>> GetFreezingConfigAsync()
    {
        var configs = await _context.PatchingFreezingConfigs
            .OrderBy(c => c.WeekOfMonth)
            .ToListAsync();

        // Si no hay datos, crear los valores por defecto
        if (!configs.Any())
        {
            await InitializeDefaultFreezingConfigAsync();
            configs = await _context.PatchingFreezingConfigs
                .OrderBy(c => c.WeekOfMonth)
                .ToListAsync();
        }

        return configs.Select(c => new PatchingFreezingConfigDto
        {
            Id = c.Id,
            WeekOfMonth = c.WeekOfMonth,
            IsFreezingWeek = c.IsFreezingWeek,
            Description = c.Description,
            UpdatedAt = c.UpdatedAt
        }).ToList();
    }

    /// <summary>
    /// Obtiene información del mes para freezing
    /// </summary>
    public async Task<FreezingMonthInfoDto> GetFreezingMonthInfoAsync(int year, int month)
    {
        var configs = await GetFreezingConfigAsync();
        var weekRanges = WeekOfMonthHelper.GetWeekRanges(year, month);

        var monthInfo = new FreezingMonthInfoDto
        {
            Year = year,
            Month = month,
            MonthName = new DateTime(year, month, 1).ToString("MMMM yyyy"),
            Weeks = weekRanges.Select(wr =>
            {
                var config = configs.FirstOrDefault(c => c.WeekOfMonth == wr.Key);
                return new FreezingWeekInfoDto
                {
                    WeekOfMonth = wr.Key,
                    StartDate = wr.Value.Start,
                    EndDate = wr.Value.End,
                    IsFreezingWeek = config?.IsFreezingWeek ?? false,
                    Description = config?.Description,
                    DaysInWeek = (wr.Value.End - wr.Value.Start).Days + 1
                };
            }).ToList()
        };

        return monthInfo;
    }

    /// <summary>
    /// Actualiza la configuración de freezing
    /// </summary>
    public async Task<bool> UpdateFreezingConfigAsync(UpdateFreezingConfigRequest request, string userId)
    {
        foreach (var weekConfig in request.Weeks)
        {
            var existing = await _context.PatchingFreezingConfigs
                .FirstOrDefaultAsync(c => c.WeekOfMonth == weekConfig.WeekOfMonth);

            if (existing != null)
            {
                existing.IsFreezingWeek = weekConfig.IsFreezingWeek;
                existing.Description = weekConfig.Description;
                existing.UpdatedAt = DateTime.UtcNow;
                existing.UpdatedByUserId = userId;
            }
            else
            {
                _context.PatchingFreezingConfigs.Add(new PatchingFreezingConfig
                {
                    WeekOfMonth = weekConfig.WeekOfMonth,
                    IsFreezingWeek = weekConfig.IsFreezingWeek,
                    Description = weekConfig.Description,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedByUserId = userId
                });
            }
        }

        await _context.SaveChangesAsync();

        _logger.LogInformation("Configuración de freezing actualizada por usuario {UserId}", userId);

        return true;
    }

    /// <summary>
    /// Inicializa la configuración de freezing por defecto
    /// </summary>
    private async Task InitializeDefaultFreezingConfigAsync()
    {
        var defaults = new List<PatchingFreezingConfig>
        {
            new() { WeekOfMonth = 1, IsFreezingWeek = true, Description = "Primera semana - Freezing por cierre contable" },
            new() { WeekOfMonth = 2, IsFreezingWeek = true, Description = "Segunda semana - Freezing" },
            new() { WeekOfMonth = 3, IsFreezingWeek = false, Description = "Tercera semana - Disponible para parcheos" },
            new() { WeekOfMonth = 4, IsFreezingWeek = false, Description = "Cuarta semana - Disponible para parcheos" },
            new() { WeekOfMonth = 5, IsFreezingWeek = false, Description = "Quinta semana - Disponible (si aplica)" }
        };

        _context.PatchingFreezingConfigs.AddRange(defaults);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Configuración de freezing inicializada con valores por defecto");
    }

    #endregion

    #region Notification Settings

    /// <summary>
    /// Obtiene la configuración de notificaciones
    /// </summary>
    public async Task<List<PatchNotificationSettingDto>> GetNotificationSettingsAsync()
    {
        var settings = await _context.PatchNotificationSettings
            .OrderBy(s => s.NotificationType)
            .ToListAsync();

        // Si no hay datos, crear los valores por defecto
        if (!settings.Any())
        {
            await InitializeDefaultNotificationSettingsAsync();
            settings = await _context.PatchNotificationSettings
                .OrderBy(s => s.NotificationType)
                .ToListAsync();
        }

        return settings.Select(s => new PatchNotificationSettingDto
        {
            Id = s.Id,
            NotificationType = s.NotificationType,
            IsEnabled = s.IsEnabled,
            HoursBefore = s.HoursBefore,
            RecipientType = s.RecipientType,
            EmailSubjectTemplate = s.EmailSubjectTemplate,
            EmailBodyTemplate = s.EmailBodyTemplate,
            Description = s.Description,
            UpdatedAt = s.UpdatedAt
        }).ToList();
    }

    /// <summary>
    /// Actualiza una configuración de notificación
    /// </summary>
    public async Task<PatchNotificationSettingDto?> UpdateNotificationSettingAsync(UpdateNotificationSettingRequest request, string userId)
    {
        var setting = await _context.PatchNotificationSettings
            .FirstOrDefaultAsync(s => s.NotificationType == request.NotificationType);

        if (setting == null)
        {
            setting = new PatchNotificationSetting
            {
                NotificationType = request.NotificationType,
                CreatedAt = DateTime.UtcNow
            };
            _context.PatchNotificationSettings.Add(setting);
        }

        setting.IsEnabled = request.IsEnabled;
        setting.HoursBefore = request.HoursBefore;
        setting.RecipientType = request.RecipientType;
        setting.EmailSubjectTemplate = request.EmailSubjectTemplate;
        setting.EmailBodyTemplate = request.EmailBodyTemplate;
        setting.Description = request.Description;
        setting.UpdatedAt = DateTime.UtcNow;
        setting.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Configuración de notificación {Type} actualizada por usuario {UserId}",
            request.NotificationType, userId);

        return new PatchNotificationSettingDto
        {
            Id = setting.Id,
            NotificationType = setting.NotificationType,
            IsEnabled = setting.IsEnabled,
            HoursBefore = setting.HoursBefore,
            RecipientType = setting.RecipientType,
            EmailSubjectTemplate = setting.EmailSubjectTemplate,
            EmailBodyTemplate = setting.EmailBodyTemplate,
            Description = setting.Description,
            UpdatedAt = setting.UpdatedAt
        };
    }

    /// <summary>
    /// Obtiene historial de notificaciones
    /// </summary>
    public async Task<List<PatchNotificationHistoryDto>> GetNotificationHistoryAsync(int? patchPlanId = null, int limit = 50)
    {
        var query = _context.PatchNotificationHistories
            .Include(h => h.PatchPlan)
            .AsQueryable();

        if (patchPlanId.HasValue)
        {
            query = query.Where(h => h.PatchPlanId == patchPlanId.Value);
        }

        var history = await query
            .OrderByDescending(h => h.SentAt)
            .Take(limit)
            .ToListAsync();

        return history.Select(h => new PatchNotificationHistoryDto
        {
            Id = h.Id,
            PatchPlanId = h.PatchPlanId,
            ServerName = h.PatchPlan?.ServerName ?? "",
            NotificationType = h.NotificationType,
            RecipientEmail = h.RecipientEmail,
            RecipientName = h.RecipientName,
            Subject = h.Subject,
            SentAt = h.SentAt,
            WasSuccessful = h.WasSuccessful,
            ErrorMessage = h.ErrorMessage
        }).ToList();
    }

    /// <summary>
    /// Inicializa la configuración de notificaciones por defecto
    /// </summary>
    private async Task InitializeDefaultNotificationSettingsAsync()
    {
        var defaults = new List<PatchNotificationSetting>
        {
            new()
            {
                NotificationType = PatchNotificationType.T48h,
                IsEnabled = true,
                HoursBefore = 48,
                RecipientType = NotificationRecipientType.All,
                EmailSubjectTemplate = "[SQL Nova] Recordatorio: Parcheo programado en 48 horas - {ServerName}",
                Description = "Recordatorio 48 horas antes del parcheo"
            },
            new()
            {
                NotificationType = PatchNotificationType.T2h,
                IsEnabled = true,
                HoursBefore = 2,
                RecipientType = NotificationRecipientType.Operator,
                EmailSubjectTemplate = "[SQL Nova] ALERTA: Parcheo en 2 horas - {ServerName}",
                Description = "Alerta 2 horas antes del parcheo"
            },
            new()
            {
                NotificationType = PatchNotificationType.TFin,
                IsEnabled = true,
                HoursBefore = 0,
                RecipientType = NotificationRecipientType.Operator,
                EmailSubjectTemplate = "[SQL Nova] Parcheo finalizado - Validación requerida - {ServerName}",
                Description = "Notificación al finalizar la ventana de parcheo"
            }
        };

        _context.PatchNotificationSettings.AddRange(defaults);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Configuración de notificaciones inicializada con valores por defecto");
    }

    #endregion
}
