using System.Data.SqlClient;
using System.Globalization;
using Dapper;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de gestión de decomiso de bases de datos
/// </summary>
public interface IDecomisoService
{
    /// <summary>
    /// Obtiene la grilla de bases sin actividad con su estado de gestión (Dapper)
    /// </summary>
    Task<DecomisoGridResponse> GetAllAsync(string? serverName = null);

    /// <summary>
    /// Actualiza o crea el estado de gestión de un decomiso (EF Core)
    /// </summary>
    Task<DecomisoGridDto?> UpdateAsync(long id, UpdateDecomisoRequest request);

    /// <summary>
    /// Crea o actualiza (upsert) el estado de gestión por ServerName + DBName (EF Core)
    /// </summary>
    Task<DecomisoGridDto?> UpsertAsync(UpdateDecomisoRequest request);
}

/// <summary>
/// Servicio para la gestión de decomiso de bases de datos sin actividad.
/// Usa Dapper para lectura (performance) y EF Core para escritura (tracking).
/// </summary>
public class DecomisoService : IDecomisoService
{
    private readonly SQLNovaDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DecomisoService> _logger;

    // Formatos conocidos para parsear ultima_actividad (varchar)
    private static readonly string[] DateFormats = new[]
    {
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss.fff",
        "MM/dd/yyyy HH:mm:ss",
        "dd/MM/yyyy HH:mm:ss",
        "yyyy-MM-ddTHH:mm:ss",
        "yyyy-MM-ddTHH:mm:ss.fff",
        "MMM dd yyyy hh:mmtt",
        "MMM  d yyyy hh:mmtt",
        "MMM dd yyyy  h:mmtt",
        "MMM  d yyyy  h:mmtt"
    };

    public DecomisoService(
        SQLNovaDbContext context,
        IConfiguration configuration,
        ILogger<DecomisoService> logger)
    {
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    /// <summary>
    /// GET - Usa Dapper para obtener la unión de ReporteBasesSinActividad + GestionDecomiso
    /// </summary>
    public async Task<DecomisoGridResponse> GetAllAsync(string? serverName = null)
    {
        const string sql = @"
            SELECT 
                g.Id AS GestionId,
                r.ServerName,
                r.DB AS DBName,
                r.host_name AS HostName,
                r.program_name AS ProgramName,
                r.login_name AS LoginName,
                r.DatabaseSizeMB,
                r.ultima_actividad AS UltimaActividadRaw,
                r.fecha_carga AS FechaCarga,
                ISNULL(g.Estado, 'Pendiente') AS Estado,
                g.TicketJira,
                g.Responsable,
                g.Observaciones,
                g.FechaModificacion
            FROM [dbo].[ReporteBasesSinActividad] r
            LEFT JOIN [dbo].[GestionDecomiso] g 
                ON r.ServerName = g.ServerName AND r.DB = g.DBName
            WHERE (@ServerName IS NULL OR r.ServerName LIKE '%' + @ServerName + '%')
            ORDER BY r.fecha_carga DESC";

        var connectionString = _configuration.GetConnectionString("SQLNova");

        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();

        var rawItems = await connection.QueryAsync<DecomisoRawDto>(sql, new { ServerName = serverName });

        var items = rawItems.Select(raw =>
        {
            // Parsear ultima_actividad (varchar) a DateTime
            DateTime? ultimaActividad = ParseFechaActividad(raw.UltimaActividadRaw);

            // Calcular días de inactividad
            int diasInactividad = 0;
            if (ultimaActividad.HasValue)
            {
                diasInactividad = (int)(DateTime.Now - ultimaActividad.Value).TotalDays;
            }

            return new DecomisoGridDto
            {
                GestionId = raw.GestionId,
                ServerName = raw.ServerName,
                DBName = raw.DBName,
                HostName = raw.HostName,
                ProgramName = raw.ProgramName,
                LoginName = raw.LoginName,
                DatabaseSizeMB = raw.DatabaseSizeMB,
                UltimaActividad = ultimaActividad,
                DiasInactividad = diasInactividad,
                Estado = raw.Estado,
                TicketJira = raw.TicketJira,
                Responsable = raw.Responsable,
                Observaciones = raw.Observaciones,
                FechaModificacion = raw.FechaModificacion,
                FechaCarga = raw.FechaCarga
            };
        }).ToList();

        // Calcular resumen para las KPI cards
        var resumen = new DecomisoResumenDto
        {
            TotalBases = items.Count,
            EspacioRecuperableGB = items.Sum(i => i.DatabaseSizeGB),
            PendientesAccion = items.Count(i => i.Estado == "Pendiente")
        };

        return new DecomisoGridResponse
        {
            Items = items,
            Resumen = resumen
        };
    }

    /// <summary>
    /// PUT - Usa EF Core para actualizar un registro de gestión existente
    /// </summary>
    public async Task<DecomisoGridDto?> UpdateAsync(long id, UpdateDecomisoRequest request)
    {
        var gestion = await _context.GestionDecomisos.FindAsync(id);
        if (gestion == null)
        {
            _logger.LogWarning("GestionDecomiso con Id {Id} no encontrado", id);
            return null;
        }

        gestion.Estado = request.Estado;
        gestion.TicketJira = request.TicketJira;
        gestion.Responsable = request.Responsable;
        gestion.Observaciones = request.Observaciones;
        gestion.FechaModificacion = DateTime.Now;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "GestionDecomiso actualizado: Id={Id}, Server={Server}, DB={DB}, Estado={Estado}, Ticket={Ticket}",
            id, gestion.ServerName, gestion.DBName, gestion.Estado, gestion.TicketJira);

        return new DecomisoGridDto
        {
            GestionId = gestion.Id,
            ServerName = gestion.ServerName,
            DBName = gestion.DBName,
            Estado = gestion.Estado,
            TicketJira = gestion.TicketJira,
            Responsable = gestion.Responsable,
            Observaciones = gestion.Observaciones,
            FechaModificacion = gestion.FechaModificacion
        };
    }

    /// <summary>
    /// UPSERT - Crea o actualiza un registro de gestión por ServerName + DBName
    /// Útil cuando el registro de gestión aún no existe para una base del reporte
    /// </summary>
    public async Task<DecomisoGridDto?> UpsertAsync(UpdateDecomisoRequest request)
    {
        var gestion = await _context.GestionDecomisos
            .FirstOrDefaultAsync(g => g.ServerName == request.ServerName && g.DBName == request.DBName);

        if (gestion == null)
        {
            // Crear nuevo registro de gestión
            gestion = new GestionDecomiso
            {
                ServerName = request.ServerName,
                DBName = request.DBName,
                Estado = request.Estado,
                TicketJira = request.TicketJira,
                Responsable = request.Responsable,
                Observaciones = request.Observaciones,
                FechaCreacion = DateTime.Now,
                FechaModificacion = DateTime.Now
            };

            _context.GestionDecomisos.Add(gestion);
            _logger.LogInformation(
                "GestionDecomiso creado: Server={Server}, DB={DB}, Estado={Estado}",
                gestion.ServerName, gestion.DBName, gestion.Estado);
        }
        else
        {
            // Actualizar existente
            gestion.Estado = request.Estado;
            gestion.TicketJira = request.TicketJira;
            gestion.Responsable = request.Responsable;
            gestion.Observaciones = request.Observaciones;
            gestion.FechaModificacion = DateTime.Now;

            _logger.LogInformation(
                "GestionDecomiso actualizado: Id={Id}, Server={Server}, DB={DB}, Estado={Estado}",
                gestion.Id, gestion.ServerName, gestion.DBName, gestion.Estado);
        }

        await _context.SaveChangesAsync();

        return new DecomisoGridDto
        {
            GestionId = gestion.Id,
            ServerName = gestion.ServerName,
            DBName = gestion.DBName,
            Estado = gestion.Estado,
            TicketJira = gestion.TicketJira,
            Responsable = gestion.Responsable,
            Observaciones = gestion.Observaciones,
            FechaModificacion = gestion.FechaModificacion
        };
    }

    /// <summary>
    /// Parsea la columna ultima_actividad (varchar) a DateTime
    /// Intenta múltiples formatos conocidos
    /// </summary>
    private DateTime? ParseFechaActividad(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        // Intentar parseo con formatos conocidos
        if (DateTime.TryParseExact(raw.Trim(), DateFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var result))
        {
            return result;
        }

        // Fallback: intento genérico
        if (DateTime.TryParse(raw.Trim(), CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var genericResult))
        {
            return genericResult;
        }

        _logger.LogWarning("No se pudo parsear ultima_actividad: '{Value}'", raw);
        return null;
    }
}

/// <summary>
/// DTO interno para el mapeo directo de Dapper (incluye el varchar sin parsear)
/// </summary>
internal class DecomisoRawDto
{
    public long? GestionId { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string DBName { get; set; } = string.Empty;
    public string? HostName { get; set; }
    public string? ProgramName { get; set; }
    public string? LoginName { get; set; }
    public int? DatabaseSizeMB { get; set; }
    public string? UltimaActividadRaw { get; set; }
    public DateTime FechaCarga { get; set; }
    public string Estado { get; set; } = "Pendiente";
    public string? TicketJira { get; set; }
    public string? Responsable { get; set; }
    public string? Observaciones { get; set; }
    public DateTime? FechaModificacion { get; set; }
}
