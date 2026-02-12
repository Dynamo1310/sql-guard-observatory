namespace SQLGuardObservatory.API.DTOs;

/// <summary>
/// DTO de salida para la grilla de Bases sin Uso.
/// Representa la unión (LEFT JOIN) entre SqlServerDatabasesCache y GestionBasesSinUso.
/// </summary>
public class BasesSinUsoGridDto
{
    /// <summary>
    /// Id del registro de gestión (null si no tiene gestión asociada)
    /// </summary>
    public long? GestionId { get; set; }

    // === Campos del inventario (SqlServerDatabasesCache) ===

    public int? CacheId { get; set; }
    public int ServerInstanceId { get; set; }
    public string ServerName { get; set; } = string.Empty;
    public string? ServerAmbiente { get; set; }
    public int DatabaseId { get; set; }
    public string DbName { get; set; } = string.Empty;
    public string? Status { get; set; }
    public string? StateDesc { get; set; }
    public int? DataFiles { get; set; }
    public int? DataMB { get; set; }
    public string? UserAccess { get; set; }
    public string? RecoveryModel { get; set; }
    public string? CompatibilityLevel { get; set; }
    public DateTime? CreationDate { get; set; }
    public string? Collation { get; set; }
    public bool? Fulltext { get; set; }
    public bool? AutoClose { get; set; }
    public bool? ReadOnly { get; set; }
    public bool? AutoShrink { get; set; }
    public bool? AutoCreateStatistics { get; set; }
    public bool? AutoUpdateStatistics { get; set; }
    public DateTime? SourceTimestamp { get; set; }
    public DateTime? CachedAt { get; set; }

    // === Campos de gestión de bajas ===

    public string? CompatibilidadMotor { get; set; }
    public DateTime? FechaUltimaActividad { get; set; }
    public bool Offline { get; set; }
    public DateTime? FechaBajaMigracion { get; set; }
    public bool MotivoBasesSinActividad { get; set; }
    public bool MotivoObsolescencia { get; set; }
    public bool MotivoEficiencia { get; set; }
    public bool MotivoCambioVersionAmbBajos { get; set; }
    public DateTime? FechaUltimoBkp { get; set; }
    public string? UbicacionUltimoBkp { get; set; }
    public string? DbaAsignado { get; set; }
    public string? Owner { get; set; }
    public string? Celula { get; set; }
    public string? Comentarios { get; set; }
    public DateTime? FechaCreacion { get; set; }
    public DateTime? FechaModificacion { get; set; }

    /// <summary>
    /// Indica si la base sigue presente en el inventario actual (cache)
    /// </summary>
    public bool EnInventarioActual { get; set; }

    /// <summary>
    /// Versión del motor SQL Server de la instancia (ej: "2019", "2017")
    /// Derivado de SqlServerInstancesCache.MajorVersion
    /// </summary>
    public string? EngineVersion { get; set; }

    /// <summary>
    /// Nivel de compatibilidad esperado del motor (ej: "150" para SQL 2019)
    /// </summary>
    public string? EngineCompatLevel { get; set; }
}

/// <summary>
/// DTO para el resumen del dashboard (KPI cards)
/// </summary>
public class BasesSinUsoResumenDto
{
    public int TotalBases { get; set; }
    public int BasesOffline { get; set; }
    public int BasesConGestion { get; set; }
    public int PendientesGestion { get; set; }
    public long EspacioTotalMB { get; set; }
    public long EspacioEnGestionMB { get; set; }
}

/// <summary>
/// DTO de entrada para actualizar/crear el estado de gestión
/// </summary>
public class UpdateBasesSinUsoRequest
{
    public string ServerName { get; set; } = string.Empty;
    public string DbName { get; set; } = string.Empty;

    // Campos de inventario (para upsert - se copian del cache si no existen)
    public int? ServerInstanceId { get; set; }
    public string? ServerAmbiente { get; set; }
    public int? DatabaseId { get; set; }
    public string? Status { get; set; }
    public string? StateDesc { get; set; }
    public int? DataFiles { get; set; }
    public int? DataMB { get; set; }
    public string? UserAccess { get; set; }
    public string? RecoveryModel { get; set; }
    public string? CompatibilityLevel { get; set; }
    public DateTime? CreationDate { get; set; }
    public string? Collation { get; set; }
    public bool? Fulltext { get; set; }
    public bool? AutoClose { get; set; }
    public bool? ReadOnly { get; set; }
    public bool? AutoShrink { get; set; }
    public bool? AutoCreateStatistics { get; set; }
    public bool? AutoUpdateStatistics { get; set; }
    public DateTime? SourceTimestamp { get; set; }
    public DateTime? CachedAt { get; set; }

    // Campos de gestión
    public string? CompatibilidadMotor { get; set; }
    public DateTime? FechaUltimaActividad { get; set; }
    public bool Offline { get; set; }
    public DateTime? FechaBajaMigracion { get; set; }
    public bool MotivoBasesSinActividad { get; set; }
    public bool MotivoObsolescencia { get; set; }
    public bool MotivoEficiencia { get; set; }
    public bool MotivoCambioVersionAmbBajos { get; set; }
    public DateTime? FechaUltimoBkp { get; set; }
    public string? UbicacionUltimoBkp { get; set; }
    public string? DbaAsignado { get; set; }
    public string? Owner { get; set; }
    public string? Celula { get; set; }
    public string? Comentarios { get; set; }
}

/// <summary>
/// DTO de respuesta para la grilla con resumen incluido
/// </summary>
public class BasesSinUsoGridResponse
{
    public List<BasesSinUsoGridDto> Items { get; set; } = new();
    public BasesSinUsoResumenDto Resumen { get; set; } = new();
}

/// <summary>
/// DTO para estadísticas de gráficos
/// </summary>
public class BasesSinUsoStatsDto
{
    /// <summary>
    /// Distribución por motivo de baja
    /// </summary>
    public List<ChartDataItem> PorMotivo { get; set; } = new();

    /// <summary>
    /// Distribución por ambiente
    /// </summary>
    public List<ChartDataItem> PorAmbiente { get; set; } = new();

    /// <summary>
    /// Evolución temporal de bajas (por mes)
    /// </summary>
    public List<ChartDataItem> EvolucionTemporal { get; set; } = new();

    /// <summary>
    /// Distribución por compatibilidad de motor
    /// </summary>
    public List<ChartDataItem> PorCompatibilidad { get; set; } = new();
}

/// <summary>
/// Item genérico para datos de gráficos
/// </summary>
public class ChartDataItem
{
    public string Name { get; set; } = string.Empty;
    public int Value { get; set; }
}

/// <summary>
/// DTO para DBA disponible para asignación en el módulo Bases sin Uso
/// </summary>
public class BasesSinUsoDbaDto
{
    public string UserId { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Email { get; set; }
}
