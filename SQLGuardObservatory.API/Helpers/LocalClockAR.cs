namespace SQLGuardObservatory.API.Helpers;

/// <summary>
/// Reloj local Argentina (UTC-3).
/// El sistema opera en hora local, NO en UTC.
/// 
/// Consistencia DB ↔ Backend:
/// - SQL Server usa GETDATE() / SYSDATETIME() (hora local del server en UTC-3)
/// - Backend C# usa LocalClockAR.Now
/// - Frontend recibe string y muestra tal cual
/// </summary>
public static class LocalClockAR
{
    // Argentina Standard Time = UTC-3 (sin horario de verano desde 2009)
    private static readonly TimeZoneInfo _argentinaTimeZone;

    static LocalClockAR()
    {
        try
        {
            // Windows: "Argentina Standard Time"
            // Linux: "America/Buenos_Aires"
            _argentinaTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Argentina Standard Time");
        }
        catch (TimeZoneNotFoundException)
        {
            try
            {
                // Fallback para Linux
                _argentinaTimeZone = TimeZoneInfo.FindSystemTimeZoneById("America/Buenos_Aires");
            }
            catch (TimeZoneNotFoundException)
            {
                // Último fallback: crear zona horaria manualmente
                _argentinaTimeZone = TimeZoneInfo.CreateCustomTimeZone(
                    "Argentina Standard Time",
                    TimeSpan.FromHours(-3),
                    "Argentina Standard Time",
                    "Argentina Standard Time"
                );
            }
        }
    }

    /// <summary>
    /// Hora local Argentina actual (UTC-3)
    /// </summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, _argentinaTimeZone);

    /// <summary>
    /// Fecha local Argentina actual (sin hora, a las 00:00:00)
    /// </summary>
    public static DateTime Today => Now.Date;

    /// <summary>
    /// Convierte una fecha UTC a hora local Argentina
    /// </summary>
    public static DateTime FromUtc(DateTime utcDateTime)
    {
        return TimeZoneInfo.ConvertTimeFromUtc(utcDateTime, _argentinaTimeZone);
    }

    /// <summary>
    /// Convierte una fecha local Argentina a UTC
    /// </summary>
    public static DateTime ToUtc(DateTime localDateTime)
    {
        return TimeZoneInfo.ConvertTimeToUtc(localDateTime, _argentinaTimeZone);
    }
}




