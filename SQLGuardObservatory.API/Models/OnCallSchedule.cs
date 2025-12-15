using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una asignación de guardia semanal.
/// Las guardias inician los miércoles a las 19:00 y finalizan los miércoles a las 07:00.
/// </summary>
public class OnCallSchedule
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [ForeignKey(nameof(UserId))]
    public virtual ApplicationUser User { get; set; } = null!;

    /// <summary>
    /// Fecha y hora de inicio de la guardia (Miércoles 19:00)
    /// </summary>
    public DateTime WeekStartDate { get; set; }

    /// <summary>
    /// Fecha y hora de fin de la guardia (Miércoles siguiente 07:00)
    /// </summary>
    public DateTime WeekEndDate { get; set; }

    /// <summary>
    /// Indica si esta asignación fue modificada manualmente (override)
    /// </summary>
    public bool IsOverride { get; set; } = false;

    /// <summary>
    /// Usuario que realizó la modificación manual (si aplica)
    /// </summary>
    [MaxLength(450)]
    public string? ModifiedByUserId { get; set; }

    [ForeignKey(nameof(ModifiedByUserId))]
    public virtual ApplicationUser? ModifiedByUser { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Número de semana del año para facilitar búsquedas
    /// </summary>
    public int WeekNumber { get; set; }

    /// <summary>
    /// Año de la guardia
    /// </summary>
    public int Year { get; set; }
}


