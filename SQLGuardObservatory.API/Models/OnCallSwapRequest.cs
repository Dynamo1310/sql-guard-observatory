using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una solicitud de intercambio de guardia entre operadores.
/// Requiere aprobación del usuario destino y mínimo 7 días de anticipación
/// (excepto para usuarios de escalamiento).
/// </summary>
public class OnCallSwapRequest
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Usuario que solicita el intercambio
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string RequesterId { get; set; } = string.Empty;

    [ForeignKey(nameof(RequesterId))]
    public virtual ApplicationUser Requester { get; set; } = null!;

    /// <summary>
    /// Usuario al que se le solicita cubrir la guardia
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string TargetUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(TargetUserId))]
    public virtual ApplicationUser TargetUser { get; set; } = null!;

    /// <summary>
    /// Guardia original que se quiere intercambiar
    /// </summary>
    public int OriginalScheduleId { get; set; }

    [ForeignKey(nameof(OriginalScheduleId))]
    public virtual OnCallSchedule OriginalSchedule { get; set; } = null!;

    /// <summary>
    /// Guardia que se ofrece a cambio (opcional, puede ser solo cobertura)
    /// </summary>
    public int? SwapScheduleId { get; set; }

    [ForeignKey(nameof(SwapScheduleId))]
    public virtual OnCallSchedule? SwapSchedule { get; set; }

    /// <summary>
    /// Estado de la solicitud: Pending, Approved, Rejected, Cancelled
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending";

    /// <summary>
    /// Razón del rechazo (si aplica)
    /// </summary>
    [MaxLength(500)]
    public string? RejectionReason { get; set; }

    /// <summary>
    /// Comentario o razón de la solicitud
    /// </summary>
    [MaxLength(500)]
    public string? RequestReason { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public DateTime? RespondedAt { get; set; }

    /// <summary>
    /// Indica si la solicitud fue creada por un usuario de escalamiento
    /// (en cuyo caso no requiere aprobación)
    /// </summary>
    public bool IsEscalationOverride { get; set; } = false;
}


