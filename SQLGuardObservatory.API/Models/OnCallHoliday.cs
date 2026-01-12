using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un feriado que afecta al calendario de guardias
/// </summary>
public class OnCallHoliday
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Fecha del feriado
    /// </summary>
    public DateTime Date { get; set; }

    /// <summary>
    /// Nombre o descripción del feriado
    /// </summary>
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Indica si el feriado se repite cada año (feriado fijo)
    /// </summary>
    public bool IsRecurring { get; set; } = false;

    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Usuario que creó el feriado
    /// </summary>
    [MaxLength(450)]
    public string? CreatedByUserId { get; set; }

    [ForeignKey(nameof(CreatedByUserId))]
    public virtual ApplicationUser? CreatedByUser { get; set; }
}



