using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Relación de compartición entre una credencial y un usuario individual
/// Permite compartir credenciales directamente con usuarios específicos
/// </summary>
public class CredentialUserShare
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID de la credencial compartida
    /// </summary>
    public int CredentialId { get; set; }

    /// <summary>
    /// ID del usuario con el que se comparte
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Usuario que compartió la credencial
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string SharedByUserId { get; set; } = string.Empty;

    /// <summary>
    /// Bitmask de permisos (post Phase 8)
    /// </summary>
    public long PermissionBitMask { get; set; } = 3; // Default: ViewMetadata (1) + RevealSecret (2)

    /// <summary>
    /// Fecha en que se compartió
    /// </summary>
    public DateTime SharedAt { get; set; } = DateTime.UtcNow;

    // Navegación
    [ForeignKey("CredentialId")]
    public virtual Credential? Credential { get; set; }

    [ForeignKey("UserId")]
    public virtual ApplicationUser? User { get; set; }

    [ForeignKey("SharedByUserId")]
    public virtual ApplicationUser? SharedByUser { get; set; }
}

