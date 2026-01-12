using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración general del módulo de guardias DBA
/// </summary>
public class OnCallConfig
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Indica si el calendario generado requiere aprobación del líder
    /// </summary>
    public bool RequiresApproval { get; set; } = false;

    /// <summary>
    /// ID del usuario aprobador (si RequiresApproval es true)
    /// </summary>
    [MaxLength(450)]
    public string? ApproverId { get; set; }

    [ForeignKey(nameof(ApproverId))]
    public virtual ApplicationUser? Approver { get; set; }

    /// <summary>
    /// ID del grupo cuyos miembros pueden ser aprobadores
    /// </summary>
    public int? ApproverGroupId { get; set; }

    [ForeignKey(nameof(ApproverGroupId))]
    public virtual SecurityGroup? ApproverGroup { get; set; }

    /// <summary>
    /// Días mínimos de anticipación para que operadores soliciten intercambios
    /// </summary>
    public int MinDaysForSwapRequest { get; set; } = 7;

    /// <summary>
    /// Días mínimos de anticipación para que escalamiento modifique guardias (0 = sin restricción)
    /// </summary>
    public int MinDaysForEscalationModify { get; set; } = 0;

    /// <summary>
    /// Fecha de última modificación
    /// </summary>
    public DateTime UpdatedAt { get; set; } = LocalClockAR.Now;

    /// <summary>
    /// Usuario que realizó la última modificación
    /// </summary>
    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    [ForeignKey(nameof(UpdatedByUserId))]
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}

