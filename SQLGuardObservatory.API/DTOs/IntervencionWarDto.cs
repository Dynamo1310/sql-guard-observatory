namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO de salida para la grilla de Intervenciones War
/// </summary>
public class IntervencionWarDto
{
    public long Id { get; set; }
    public DateTime FechaHora { get; set; }
    public int DuracionMinutos { get; set; }
    public string DbaParticipantes { get; set; } = string.Empty;
    public string? TipoIntervencion { get; set; }
    public string? NumeroIncidente { get; set; }
    public string? IncidenteLink { get; set; }
    public string? Servidores { get; set; }
    public string? BaseDatos { get; set; }
    public string? Celula { get; set; }
    public string? Referente { get; set; }
    public string? Comentarios { get; set; }
    public string? IntervencionesRelacionadas { get; set; }
    public bool EsProblema { get; set; }
    public bool RecomendacionMejoraEnviada { get; set; }
    public DateTime FechaCreacion { get; set; }
    public DateTime FechaModificacion { get; set; }
    public string? CreadoPor { get; set; }

    /// <summary>
    /// Duración formateada (ej: "1h 30m")
    /// </summary>
    public string DuracionFormateada =>
        DuracionMinutos >= 60
            ? $"{DuracionMinutos / 60}h {DuracionMinutos % 60}m"
            : $"{DuracionMinutos}m";
}

/// <summary>
/// DTO de entrada para crear o actualizar una intervención
/// </summary>
public class CreateUpdateIntervencionWarRequest
{
    public DateTime FechaHora { get; set; }
    public int DuracionMinutos { get; set; }
    public string DbaParticipantes { get; set; } = string.Empty;
    public string? TipoIntervencion { get; set; }
    public string? NumeroIncidente { get; set; }
    public string? IncidenteLink { get; set; }
    public string? Servidores { get; set; }
    public string? BaseDatos { get; set; }
    public string? Celula { get; set; }
    public string? Referente { get; set; }
    public string? Comentarios { get; set; }
    public string? IntervencionesRelacionadas { get; set; }
    public bool EsProblema { get; set; }
    public bool RecomendacionMejoraEnviada { get; set; }
}

/// <summary>
/// DTO de respuesta con paginación
/// </summary>
public class IntervencionWarGridResponse
{
    public List<IntervencionWarDto> Items { get; set; } = new();
    public IntervencionWarResumenDto Resumen { get; set; } = new();
}

/// <summary>
/// DTO para KPI cards / resumen
/// </summary>
public class IntervencionWarResumenDto
{
    public int TotalIntervenciones { get; set; }
    public int TotalHoras { get; set; }
    public int TotalMinutos { get; set; }
    public int IntervencionesEsteMes { get; set; }
    public int HorasEsteMes { get; set; }
    public int MinutosEsteMes { get; set; }
    public int DbasUnicos { get; set; }
    public int IntervencionesWar { get; set; }
}

/// <summary>
/// DTO para estadísticas de gráficos
/// </summary>
public class IntervencionWarStatsDto
{
    /// <summary>
    /// Intervenciones por tipo (War, Degradación, Chat, Llamado, Mail)
    /// </summary>
    public List<ChartDataItem> PorTipo { get; set; } = new();

    /// <summary>
    /// Horas de intervención por DBA
    /// </summary>
    public List<ChartDataItem> PorDba { get; set; } = new();

    /// <summary>
    /// Evolución mensual (horas por mes)
    /// </summary>
    public List<ChartDataItem> EvolucionMensual { get; set; } = new();

    /// <summary>
    /// Cantidad de intervenciones por célula
    /// </summary>
    public List<ChartDataItem> PorCelula { get; set; } = new();

    /// <summary>
    /// Cantidad de intervenciones por base de datos
    /// </summary>
    public List<ChartDataItem> PorBaseDatos { get; set; } = new();
}

