using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Reglas de alertas configurables
/// </summary>
public class OnCallAlertRule
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre de la regla
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Descripción de la regla
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Tipo de alerta
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string AlertType { get; set; } = string.Empty;
    // ScheduleGenerated, DaysRemaining, SwapRequested, SwapApproved, 
    // SwapRejected, ScheduleModified, ActivationCreated, Custom

    /// <summary>
    /// Condición en días (para alertas tipo DaysRemaining)
    /// </summary>
    public int? ConditionDays { get; set; }

    /// <summary>
    /// Indica si la regla está habilitada
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Indica si se debe adjuntar el Excel del calendario (solo para ScheduleGenerated)
    /// </summary>
    public bool AttachExcel { get; set; } = false;

    /// <summary>
    /// Usuario que creó la regla
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(CreatedByUserId))]
    public virtual ApplicationUser CreatedByUser { get; set; } = null!;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Destinatarios de esta alerta
    /// </summary>
    public virtual ICollection<OnCallAlertRecipient> Recipients { get; set; } = new List<OnCallAlertRecipient>();
}

/// <summary>
/// Destinatarios de alertas
/// </summary>
public class OnCallAlertRecipient
{
    [Key]
    public int Id { get; set; }

    public int AlertRuleId { get; set; }

    [ForeignKey(nameof(AlertRuleId))]
    public virtual OnCallAlertRule AlertRule { get; set; } = null!;

    [Required]
    [MaxLength(255)]
    public string Email { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? Name { get; set; }

    public bool IsEnabled { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}









