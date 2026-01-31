using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de semanas de freezing para parcheos
/// </summary>
public class PatchingFreezingConfig
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Semana del mes (1-5)
    /// </summary>
    [Required]
    [Range(1, 5)]
    public int WeekOfMonth { get; set; }

    /// <summary>
    /// Indica si esta semana está en freezing
    /// </summary>
    public bool IsFreezingWeek { get; set; } = false;

    /// <summary>
    /// Descripción opcional de la semana
    /// </summary>
    [MaxLength(200)]
    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }
}

/// <summary>
/// Helper para calcular semanas del mes
/// </summary>
public static class WeekOfMonthHelper
{
    /// <summary>
    /// Obtiene la semana del mes para una fecha dada (1-5)
    /// </summary>
    public static int GetWeekOfMonth(DateTime date)
    {
        return (date.Day - 1) / 7 + 1;
    }

    /// <summary>
    /// Verifica si una fecha está en una semana de freezing
    /// </summary>
    public static bool IsDateInFreezing(DateTime date, IEnumerable<PatchingFreezingConfig> freezingConfig)
    {
        var weekOfMonth = GetWeekOfMonth(date);
        return freezingConfig.Any(f => f.WeekOfMonth == weekOfMonth && f.IsFreezingWeek);
    }

    /// <summary>
    /// Obtiene todas las fechas de un mes que están en freezing
    /// </summary>
    public static List<DateTime> GetFreezingDatesInMonth(int year, int month, IEnumerable<PatchingFreezingConfig> freezingConfig)
    {
        var freezingDates = new List<DateTime>();
        var daysInMonth = DateTime.DaysInMonth(year, month);

        for (int day = 1; day <= daysInMonth; day++)
        {
            var date = new DateTime(year, month, day);
            if (IsDateInFreezing(date, freezingConfig))
            {
                freezingDates.Add(date);
            }
        }

        return freezingDates;
    }

    /// <summary>
    /// Obtiene el rango de fechas para cada semana del mes
    /// </summary>
    public static Dictionary<int, (DateTime Start, DateTime End)> GetWeekRanges(int year, int month)
    {
        var ranges = new Dictionary<int, (DateTime Start, DateTime End)>();
        var daysInMonth = DateTime.DaysInMonth(year, month);

        for (int week = 1; week <= 5; week++)
        {
            var startDay = (week - 1) * 7 + 1;
            var endDay = Math.Min(week * 7, daysInMonth);

            if (startDay <= daysInMonth)
            {
                ranges[week] = (
                    new DateTime(year, month, startDay),
                    new DateTime(year, month, endDay)
                );
            }
        }

        return ranges;
    }
}
