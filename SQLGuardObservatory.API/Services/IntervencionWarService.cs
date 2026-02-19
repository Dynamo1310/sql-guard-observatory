using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de Intervenciones War
/// </summary>
public interface IIntervencionWarService
{
    Task<IntervencionWarGridResponse> GetAllAsync();
    Task<IntervencionWarDto?> GetByIdAsync(long id);
    Task<IntervencionWarDto> CreateAsync(CreateUpdateIntervencionWarRequest request, string? userId);
    Task<IntervencionWarDto?> UpdateAsync(long id, CreateUpdateIntervencionWarRequest request);
    Task<bool> DeleteAsync(long id);
    Task<IntervencionWarStatsDto> GetStatsAsync();
    Task<List<string>> SearchDatabaseNamesAsync(string query, int maxResults = 20);
}

/// <summary>
/// Servicio para la gestión de Intervenciones War (seguimiento de incidencias DBA)
/// </summary>
public class IntervencionWarService : IIntervencionWarService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<IntervencionWarService> _logger;

    public IntervencionWarService(
        ApplicationDbContext context,
        ILogger<IntervencionWarService> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// Obtiene todas las intervenciones con resumen KPI
    /// </summary>
    public async Task<IntervencionWarGridResponse> GetAllAsync()
    {
        var items = await _context.IntervencionesWar
            .OrderByDescending(i => i.FechaHora)
            .Select(i => MapToDto(i))
            .ToListAsync();

        var now = DateTime.Now;
        var inicioMes = new DateTime(now.Year, now.Month, 1);

        var resumen = new IntervencionWarResumenDto
        {
            TotalIntervenciones = items.Count,
            TotalHoras = items.Sum(i => i.DuracionMinutos) / 60,
            TotalMinutos = items.Sum(i => i.DuracionMinutos) % 60,
            IntervencionesEsteMes = items.Count(i => i.FechaHora >= inicioMes),
            HorasEsteMes = items.Where(i => i.FechaHora >= inicioMes).Sum(i => i.DuracionMinutos) / 60,
            MinutosEsteMes = items.Where(i => i.FechaHora >= inicioMes).Sum(i => i.DuracionMinutos) % 60,
            DbasUnicos = items
                .SelectMany(i => i.DbaParticipantes.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Count(),
            IntervencionesWar = items.Count(i => string.Equals(i.TipoIntervencion, "War", StringComparison.OrdinalIgnoreCase))
        };

        return new IntervencionWarGridResponse
        {
            Items = items,
            Resumen = resumen
        };
    }

    /// <summary>
    /// Obtiene una intervención por ID
    /// </summary>
    public async Task<IntervencionWarDto?> GetByIdAsync(long id)
    {
        var entity = await _context.IntervencionesWar.FindAsync(id);
        return entity == null ? null : MapToDto(entity);
    }

    /// <summary>
    /// Crea una nueva intervención
    /// </summary>
    public async Task<IntervencionWarDto> CreateAsync(CreateUpdateIntervencionWarRequest request, string? userId)
    {
        var entity = new IntervencionWar
        {
            FechaHora = request.FechaHora,
            DuracionMinutos = request.DuracionMinutos,
            DbaParticipantes = request.DbaParticipantes,
            TipoIntervencion = request.TipoIntervencion,
            NumeroIncidente = request.NumeroIncidente,
            IncidenteLink = request.IncidenteLink,
            Servidores = request.Servidores,
            BaseDatos = request.BaseDatos,
            Celula = request.Celula,
            Referente = request.Referente,
            Comentarios = request.Comentarios,
            IntervencionesRelacionadas = request.IntervencionesRelacionadas,
            EsProblema = request.EsProblema,
            RecomendacionMejoraEnviada = request.RecomendacionMejoraEnviada,
            FechaCreacion = DateTime.Now,
            FechaModificacion = DateTime.Now,
            CreadoPor = userId
        };

        _context.IntervencionesWar.Add(entity);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Intervención War creada: Id={Id}, Incidente={Inc}, DBA={Dba}",
            entity.Id, entity.NumeroIncidente, entity.DbaParticipantes);

        return MapToDto(entity);
    }

    /// <summary>
    /// Actualiza una intervención existente
    /// </summary>
    public async Task<IntervencionWarDto?> UpdateAsync(long id, CreateUpdateIntervencionWarRequest request)
    {
        var entity = await _context.IntervencionesWar.FindAsync(id);
        if (entity == null)
        {
            _logger.LogWarning("Intervención War con Id {Id} no encontrada", id);
            return null;
        }

        entity.FechaHora = request.FechaHora;
        entity.DuracionMinutos = request.DuracionMinutos;
        entity.DbaParticipantes = request.DbaParticipantes;
        entity.TipoIntervencion = request.TipoIntervencion;
        entity.NumeroIncidente = request.NumeroIncidente;
        entity.IncidenteLink = request.IncidenteLink;
        entity.Servidores = request.Servidores;
        entity.BaseDatos = request.BaseDatos;
        entity.Celula = request.Celula;
        entity.Referente = request.Referente;
        entity.Comentarios = request.Comentarios;
        entity.IntervencionesRelacionadas = request.IntervencionesRelacionadas;
        entity.EsProblema = request.EsProblema;
        entity.RecomendacionMejoraEnviada = request.RecomendacionMejoraEnviada;
        entity.FechaModificacion = DateTime.Now;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Intervención War actualizada: Id={Id}, Incidente={Inc}",
            entity.Id, entity.NumeroIncidente);

        return MapToDto(entity);
    }

    /// <summary>
    /// Elimina una intervención
    /// </summary>
    public async Task<bool> DeleteAsync(long id)
    {
        var entity = await _context.IntervencionesWar.FindAsync(id);
        if (entity == null) return false;

        _context.IntervencionesWar.Remove(entity);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Intervención War eliminada: Id={Id}", id);
        return true;
    }

    /// <summary>
    /// Obtiene estadísticas para gráficos
    /// </summary>
    public async Task<IntervencionWarStatsDto> GetStatsAsync()
    {
        var items = await _context.IntervencionesWar.ToListAsync();
        var stats = new IntervencionWarStatsDto();

        // Por Tipo de Intervención (cantidad)
        stats.PorTipo = items
            .Where(i => !string.IsNullOrWhiteSpace(i.TipoIntervencion))
            .GroupBy(i => i.TipoIntervencion!)
            .Select(g => new ChartDataItem
            {
                Name = g.Key,
                Value = g.Count()
            })
            .OrderByDescending(x => x.Value)
            .ToList();

        // Por DBA (horas) — cada DBA separado
        stats.PorDba = items
            .SelectMany(i => i.DbaParticipantes
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(dba => new { Dba = dba, i.DuracionMinutos }))
            .GroupBy(x => x.Dba, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChartDataItem
            {
                Name = g.Key,
                Value = g.Sum(x => x.DuracionMinutos) / 60
            })
            .OrderByDescending(x => x.Value)
            .ToList();

        // Evolución mensual (horas por mes)
        stats.EvolucionMensual = items
            .GroupBy(i => i.FechaHora.ToString("yyyy-MM"))
            .Select(g => new ChartDataItem
            {
                Name = g.Key,
                Value = g.Sum(x => x.DuracionMinutos) / 60
            })
            .OrderBy(x => x.Name)
            .ToList();

        // Por Célula (cantidad de intervenciones)
        stats.PorCelula = items
            .Where(i => !string.IsNullOrWhiteSpace(i.Celula))
            .GroupBy(i => i.Celula!)
            .Select(g => new ChartDataItem
            {
                Name = g.Key,
                Value = g.Count()
            })
            .OrderByDescending(x => x.Value)
            .ToList();

        // Por Base de Datos (cantidad de intervenciones)
        stats.PorBaseDatos = items
            .Where(i => !string.IsNullOrWhiteSpace(i.BaseDatos))
            .SelectMany(i => i.BaseDatos!
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(db => db))
            .GroupBy(db => db, StringComparer.OrdinalIgnoreCase)
            .Select(g => new ChartDataItem
            {
                Name = g.Key,
                Value = g.Count()
            })
            .OrderByDescending(x => x.Value)
            .Take(15)
            .ToList();

        return stats;
    }

    /// <summary>
    /// Busca nombres de bases de datos en el inventario (SqlServerDatabasesCache)
    /// para autocompletado. Devuelve nombres únicos que coincidan con el término de búsqueda.
    /// </summary>
    public async Task<List<string>> SearchDatabaseNamesAsync(string query, int maxResults = 20)
    {
        if (string.IsNullOrWhiteSpace(query) || query.Length < 2)
            return new List<string>();

        var results = await _context.SqlServerDatabasesCache
            .Where(d => d.DbName.Contains(query))
            .Select(d => d.DbName)
            .Distinct()
            .OrderBy(n => n)
            .Take(maxResults)
            .ToListAsync();

        return results;
    }

    /// <summary>
    /// Mapea entidad a DTO
    /// </summary>
    private static IntervencionWarDto MapToDto(IntervencionWar entity) => new()
    {
        Id = entity.Id,
        FechaHora = entity.FechaHora,
        DuracionMinutos = entity.DuracionMinutos,
        DbaParticipantes = entity.DbaParticipantes,
        TipoIntervencion = entity.TipoIntervencion,
        NumeroIncidente = entity.NumeroIncidente,
        IncidenteLink = entity.IncidenteLink,
        Servidores = entity.Servidores,
        BaseDatos = entity.BaseDatos,
        Celula = entity.Celula,
        Referente = entity.Referente,
        Comentarios = entity.Comentarios,
        IntervencionesRelacionadas = entity.IntervencionesRelacionadas,
        EsProblema = entity.EsProblema,
        RecomendacionMejoraEnviada = entity.RecomendacionMejoraEnviada,
        FechaCreacion = entity.FechaCreacion,
        FechaModificacion = entity.FechaModificacion,
        CreadoPor = entity.CreadoPor
    };
}

