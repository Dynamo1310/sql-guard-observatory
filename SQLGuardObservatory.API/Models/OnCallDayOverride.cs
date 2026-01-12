using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una cobertura de guardia para un día específico.
/// Permite que Team Escalamiento asigne a un operador diferente solo para un día particular.
/// </summary>
public class OnCallDayOverride
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Fecha del día que se está cubriendo
    /// </summary>
    [Required]
    public DateTime Date { get; set; }

    /// <summary>
    /// ID del operador original que tenía la guardia ese día
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string OriginalUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(OriginalUserId))]
    public virtual ApplicationUser OriginalUser { get; set; } = null!;

    /// <summary>
    /// ID del operador que cubrirá ese día
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string CoverUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(CoverUserId))]
    public virtual ApplicationUser CoverUser { get; set; } = null!;

    /// <summary>
    /// Motivo de la cobertura
    /// </summary>
    [MaxLength(500)]
    public string? Reason { get; set; }

    /// <summary>
    /// ID del schedule original al que pertenece este día
    /// </summary>
    public int? OriginalScheduleId { get; set; }

    [ForeignKey(nameof(OriginalScheduleId))]
    public virtual OnCallSchedule? OriginalSchedule { get; set; }

    /// <summary>
    /// Usuario de escalamiento que creó esta cobertura
    /// </summary>
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(CreatedByUserId))]
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = LocalClockAR.Now;

    /// <summary>
    /// Indica si la cobertura está activa
    /// </summary>
    public bool IsActive { get; set; } = true;
}

