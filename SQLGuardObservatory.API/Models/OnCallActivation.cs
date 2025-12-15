using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Registro de activaciones de guardia (llamados e incidentes atendidos)
/// </summary>
public class OnCallActivation
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Guardia durante la cual ocurrió la activación
    /// </summary>
    public int ScheduleId { get; set; }

    [ForeignKey(nameof(ScheduleId))]
    public virtual OnCallSchedule Schedule { get; set; } = null!;

    /// <summary>
    /// Operador que atendió la activación
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string OperatorUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(OperatorUserId))]
    public virtual ApplicationUser Operator { get; set; } = null!;

    /// <summary>
    /// Momento en que se activó la guardia
    /// </summary>
    public DateTime ActivatedAt { get; set; }

    /// <summary>
    /// Momento en que se resolvió (opcional)
    /// </summary>
    public DateTime? ResolvedAt { get; set; }

    /// <summary>
    /// Duración en minutos
    /// </summary>
    public int? DurationMinutes { get; set; }

    /// <summary>
    /// Categoría del incidente
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = "Other"; // Database, Performance, Connectivity, Backup, Security, Other

    /// <summary>
    /// Severidad del incidente
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Severity { get; set; } = "Medium"; // Low, Medium, High, Critical

    /// <summary>
    /// Título breve del incidente
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string Title { get; set; } = string.Empty;

    /// <summary>
    /// Descripción detallada
    /// </summary>
    [MaxLength(2000)]
    public string? Description { get; set; }

    /// <summary>
    /// Descripción de la resolución
    /// </summary>
    [MaxLength(2000)]
    public string? Resolution { get; set; }

    /// <summary>
    /// Instancia SQL afectada (opcional)
    /// </summary>
    [MaxLength(200)]
    public string? InstanceName { get; set; }

    /// <summary>
    /// Usuario que registró la activación
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(CreatedByUserId))]
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}


