using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad EF Core para la tabla [SQLGuardObservatoryAuth].[dbo].[GestionBasesSinUso]
/// Almacena los datos del inventario (espejo de SqlServerDatabasesCache) junto con
/// campos adicionales para la gestión de bajas de bases de datos sin uso.
/// </summary>
[Table("GestionBasesSinUso", Schema = "dbo")]
public class GestionBasesSinUso
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    // ===========================================
    // Campos espejo del inventario (SqlServerDatabasesCache)
    // ===========================================

    public int ServerInstanceId { get; set; }

    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? ServerAmbiente { get; set; }

    public int DatabaseId { get; set; }

    [Required]
    [MaxLength(255)]
    public string DbName { get; set; } = string.Empty;

    [MaxLength(50)]
    public string? Status { get; set; }

    [MaxLength(50)]
    public string? StateDesc { get; set; }

    public int? DataFiles { get; set; }

    public int? DataMB { get; set; }

    [MaxLength(50)]
    public string? UserAccess { get; set; }

    [MaxLength(50)]
    public string? RecoveryModel { get; set; }

    [MaxLength(100)]
    public string? CompatibilityLevel { get; set; }

    public DateTime? CreationDate { get; set; }

    [MaxLength(100)]
    public string? Collation { get; set; }

    public bool? Fulltext { get; set; }

    public bool? AutoClose { get; set; }

    public bool? ReadOnly { get; set; }

    public bool? AutoShrink { get; set; }

    public bool? AutoCreateStatistics { get; set; }

    public bool? AutoUpdateStatistics { get; set; }

    public DateTime? SourceTimestamp { get; set; }

    public DateTime? CachedAt { get; set; }

    // ===========================================
    // Campos adicionales de gestión de bajas
    // ===========================================

    /// <summary>
    /// Compatibilidad del motor SQL Server (ej: 2005, 2008, 2012, 2014, 2016, 2017, 2019)
    /// </summary>
    [MaxLength(20)]
    public string? CompatibilidadMotor { get; set; }

    /// <summary>
    /// Fecha de última actividad detectada en la base de datos
    /// </summary>
    public DateTime? FechaUltimaActividad { get; set; }

    /// <summary>
    /// Indicador de baja (Offline: SI/NO)
    /// </summary>
    public bool Offline { get; set; } = false;

    /// <summary>
    /// Fecha de baja o migración
    /// </summary>
    public DateTime? FechaBajaMigracion { get; set; }

    /// <summary>
    /// Motivo: Bases sin actividad
    /// </summary>
    public bool MotivoBasesSinActividad { get; set; } = false;

    /// <summary>
    /// Motivo: Obsolescencia (proyecto recurrente anual)
    /// </summary>
    public bool MotivoObsolescencia { get; set; } = false;

    /// <summary>
    /// Motivo: Eficiencia (ARQ)
    /// </summary>
    public bool MotivoEficiencia { get; set; } = false;

    /// <summary>
    /// Motivo: Cambio de versión ambientes bajos
    /// </summary>
    public bool MotivoCambioVersionAmbBajos { get; set; } = false;

    /// <summary>
    /// Fecha del último backup realizado
    /// </summary>
    public DateTime? FechaUltimoBkp { get; set; }

    /// <summary>
    /// Ubicación del último backup
    /// </summary>
    [MaxLength(500)]
    public string? UbicacionUltimoBkp { get; set; }

    /// <summary>
    /// DBA asignado (del grupo IDD General)
    /// </summary>
    [MaxLength(255)]
    public string? DbaAsignado { get; set; }

    /// <summary>
    /// Owner de la base de datos
    /// </summary>
    [MaxLength(255)]
    public string? Owner { get; set; }

    /// <summary>
    /// Célula a la que pertenece la base de datos
    /// </summary>
    [MaxLength(255)]
    public string? Celula { get; set; }

    /// <summary>
    /// Comentarios generales
    /// </summary>
    public string? Comentarios { get; set; }

    /// <summary>
    /// Fecha de creación del registro
    /// </summary>
    public DateTime FechaCreacion { get; set; } = DateTime.Now;

    /// <summary>
    /// Fecha de última modificación del registro
    /// </summary>
    public DateTime FechaModificacion { get; set; } = DateTime.Now;
}
