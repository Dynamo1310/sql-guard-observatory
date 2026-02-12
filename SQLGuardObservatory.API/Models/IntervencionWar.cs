using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad EF Core para la tabla [SQLGuardObservatoryAuth].[dbo].[IntervencionesWar]
/// Registra las intervenciones del equipo DBA en incidencias diarias.
/// </summary>
[Table("IntervencionesWar", Schema = "dbo")]
public class IntervencionWar
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public long Id { get; set; }

    /// <summary>
    /// Fecha y hora de inicio de la intervención
    /// </summary>
    public DateTime FechaHora { get; set; }

    /// <summary>
    /// Duración de la intervención en minutos
    /// </summary>
    public int DuracionMinutos { get; set; }

    /// <summary>
    /// DBA(s) que participaron en la intervención (separados por coma si son varios)
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string DbaParticipantes { get; set; } = string.Empty;

    /// <summary>
    /// Número de incidente (ej: INC0012345)
    /// </summary>
    [MaxLength(100)]
    public string? NumeroIncidente { get; set; }

    /// <summary>
    /// Link al incidente en la herramienta de gestión
    /// </summary>
    [MaxLength(1000)]
    public string? IncidenteLink { get; set; }

    /// <summary>
    /// Link al Problem (cuando el incidente se convierte en reiterativo)
    /// </summary>
    [MaxLength(1000)]
    public string? ProblemLink { get; set; }

    /// <summary>
    /// Aplicación o solución afectada
    /// </summary>
    [MaxLength(255)]
    public string? AplicacionSolucion { get; set; }

    /// <summary>
    /// Servidor(es) involucrado(s) (separados por coma si son varios)
    /// </summary>
    [MaxLength(1000)]
    public string? Servidores { get; set; }

    /// <summary>
    /// Base(s) de datos involucrada(s) (separadas por coma si son varias)
    /// </summary>
    [MaxLength(1000)]
    public string? BaseDatos { get; set; }

    /// <summary>
    /// Célula a la que pertenece la aplicación/incidencia
    /// </summary>
    [MaxLength(255)]
    public string? Celula { get; set; }

    /// <summary>
    /// Referente del área o de la aplicación
    /// </summary>
    [MaxLength(255)]
    public string? Referente { get; set; }

    /// <summary>
    /// Comentarios y notas de la intervención
    /// </summary>
    public string? Comentarios { get; set; }

    /// <summary>
    /// IDs de intervenciones relacionadas (separados por coma, ej: "12,45,78")
    /// </summary>
    [MaxLength(500)]
    public string? IntervencionesRelacionadas { get; set; }

    /// <summary>
    /// Fecha de creación del registro
    /// </summary>
    public DateTime FechaCreacion { get; set; } = DateTime.Now;

    /// <summary>
    /// Fecha de última modificación
    /// </summary>
    public DateTime FechaModificacion { get; set; } = DateTime.Now;

    /// <summary>
    /// Usuario que creó el registro
    /// </summary>
    [MaxLength(255)]
    public string? CreadoPor { get; set; }
}

