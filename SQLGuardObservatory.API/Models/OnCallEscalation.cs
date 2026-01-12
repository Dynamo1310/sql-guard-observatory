using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un usuario de escalamiento de guardia DBA
/// </summary>
public class OnCallEscalation
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [ForeignKey(nameof(UserId))]
    public virtual ApplicationUser User { get; set; } = null!;

    /// <summary>
    /// Orden de prioridad en el escalamiento (1, 2, 3, etc.)
    /// </summary>
    public int EscalationOrder { get; set; }

    /// <summary>
    /// Color asignado al usuario de escalamiento (formato hexadecimal #RRGGBB)
    /// </summary>
    [MaxLength(7)]
    public string? ColorCode { get; set; }

    /// <summary>
    /// Número de teléfono para contacto
    /// </summary>
    [MaxLength(20)]
    public string? PhoneNumber { get; set; }

    /// <summary>
    /// Indica si el usuario de escalamiento está activo
    /// </summary>
    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}



