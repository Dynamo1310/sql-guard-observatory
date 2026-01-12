using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un operador de guardia DBA con su orden de rotación
/// </summary>
public class OnCallOperator
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    [ForeignKey(nameof(UserId))]
    public virtual ApplicationUser User { get; set; } = null!;

    /// <summary>
    /// Orden en la rotación de guardias (1, 2, 3, etc.)
    /// </summary>
    public int RotationOrder { get; set; }

    /// <summary>
    /// Indica si el operador está activo en la rotación
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Color asignado al operador para mostrar en el calendario (formato hexadecimal #RRGGBB)
    /// </summary>
    [MaxLength(7)]
    public string? ColorCode { get; set; }

    /// <summary>
    /// Número de teléfono del operador para contacto
    /// </summary>
    [MaxLength(20)]
    public string? PhoneNumber { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }
}







