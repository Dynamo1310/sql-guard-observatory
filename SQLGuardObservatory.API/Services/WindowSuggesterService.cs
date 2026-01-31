using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de sugerencia de ventanas
/// </summary>
public interface IWindowSuggesterService
{
    Task<List<SuggestedWindowDto>> SuggestWindowsAsync(
        string serverName,
        int durationMinutes,
        DateTime fromDate,
        int maxSuggestions = 5);
    
    Task<bool> IsDateInFreezingAsync(DateTime date);
    Task<List<DateTime>> GetFreezingDatesInMonthAsync(int year, int month);
}

/// <summary>
/// Servicio para sugerir ventanas de parcheo disponibles
/// </summary>
public class WindowSuggesterService : IWindowSuggesterService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<WindowSuggesterService> _logger;

    // Ventana de mantenimiento por defecto (22:00 - 06:00)
    private static readonly TimeSpan DefaultWindowStart = new TimeSpan(22, 0, 0);
    private static readonly TimeSpan DefaultWindowEnd = new TimeSpan(6, 0, 0);

    // Máximo de servidores en paralelo por operador
    private const int MaxParallelServersPerOperator = 3;

    public WindowSuggesterService(
        ApplicationDbContext context,
        ILogger<WindowSuggesterService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Sugiere ventanas de parcheo disponibles
    /// </summary>
    public async Task<List<SuggestedWindowDto>> SuggestWindowsAsync(
        string serverName,
        int durationMinutes,
        DateTime fromDate,
        int maxSuggestions = 5)
    {
        var suggestions = new List<SuggestedWindowDto>();
        var currentDate = fromDate.Date;
        var endDate = currentDate.AddDays(60); // Buscar hasta 60 días adelante

        // Obtener configuración de freezing
        var freezingConfig = await _context.PatchingFreezingConfigs.ToListAsync();

        // Obtener el cluster del servidor si existe
        var serverInfo = await _context.ServerPatchStatusCache
            .FirstOrDefaultAsync(s => s.ServerName == serverName || s.InstanceName == serverName);

        // Obtener planes existentes
        var existingPlans = await _context.PatchPlans
            .Where(p => p.ScheduledDate >= currentDate && p.ScheduledDate <= endDate)
            .Where(p => p.Status != PatchPlanStatus.Cancelado && p.Status != PatchPlanStatus.Fallido)
            .ToListAsync();

        while (suggestions.Count < maxSuggestions && currentDate <= endDate)
        {
            // Verificar si el día está en freezing
            var weekOfMonth = WeekOfMonthHelper.GetWeekOfMonth(currentDate);
            var isFreezing = freezingConfig.Any(f => f.WeekOfMonth == weekOfMonth && f.IsFreezingWeek);

            if (!isFreezing)
            {
                // Verificar conflictos de cluster en ese día
                var clusterConflict = false;
                if (serverInfo != null && !string.IsNullOrEmpty(serverInfo.InstanceName))
                {
                    // Buscar si hay otro servidor del mismo cluster planificado ese día
                    clusterConflict = existingPlans.Any(p => 
                        p.ScheduledDate == currentDate && 
                        p.ClusterName == serverInfo.InstanceName);
                }

                // Verificar capacidad del operador
                var plansOnDate = existingPlans.Count(p => p.ScheduledDate == currentDate);
                var capacityAvailable = plansOnDate < MaxParallelServersPerOperator * 5; // Asumiendo 5 operadores

                if (!clusterConflict && capacityAvailable)
                {
                    // Calcular minutos disponibles en la ventana
                    var windowMinutes = CalculateWindowMinutes(DefaultWindowStart, DefaultWindowEnd);

                    var suggestion = new SuggestedWindowDto
                    {
                        Date = currentDate,
                        StartTime = DefaultWindowStart.ToString(@"hh\:mm"),
                        EndTime = DefaultWindowEnd.ToString(@"hh\:mm"),
                        AvailableMinutes = windowMinutes,
                        IsRecommended = suggestions.Count == 0 && plansOnDate < 3
                    };

                    if (plansOnDate == 0)
                    {
                        suggestion.Reason = "Sin parcheos programados este día";
                    }
                    else if (plansOnDate < 3)
                    {
                        suggestion.Reason = $"Solo {plansOnDate} parcheos programados";
                    }
                    else
                    {
                        suggestion.Reason = "Capacidad disponible";
                    }

                    suggestions.Add(suggestion);
                }
            }

            currentDate = currentDate.AddDays(1);
        }

        _logger.LogInformation(
            "Sugeridas {Count} ventanas para servidor {Server} desde {FromDate}",
            suggestions.Count, serverName, fromDate.ToShortDateString());

        return suggestions;
    }

    /// <summary>
    /// Verifica si una fecha está en período de freezing
    /// </summary>
    public async Task<bool> IsDateInFreezingAsync(DateTime date)
    {
        var weekOfMonth = WeekOfMonthHelper.GetWeekOfMonth(date);
        var freezingConfig = await _context.PatchingFreezingConfigs
            .FirstOrDefaultAsync(f => f.WeekOfMonth == weekOfMonth);

        return freezingConfig?.IsFreezingWeek ?? false;
    }

    /// <summary>
    /// Obtiene todas las fechas en freezing de un mes
    /// </summary>
    public async Task<List<DateTime>> GetFreezingDatesInMonthAsync(int year, int month)
    {
        var freezingConfig = await _context.PatchingFreezingConfigs.ToListAsync();
        return WeekOfMonthHelper.GetFreezingDatesInMonth(year, month, freezingConfig);
    }

    /// <summary>
    /// Calcula los minutos disponibles en una ventana de tiempo
    /// </summary>
    private static int CalculateWindowMinutes(TimeSpan start, TimeSpan end)
    {
        if (end < start)
        {
            // La ventana cruza medianoche (ej: 22:00 - 06:00)
            return (int)((TimeSpan.FromHours(24) - start + end).TotalMinutes);
        }
        return (int)(end - start).TotalMinutes;
    }
}
