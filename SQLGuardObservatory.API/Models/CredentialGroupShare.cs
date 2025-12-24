using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Permisos disponibles para compartir credenciales
/// </summary>
public static class SharePermissions
{
    public const string View = "View";
    public const string Edit = "Edit";
    public const string Admin = "Admin";
}

/// <summary>
/// Relación de compartición entre una credencial y un grupo
/// Una credencial puede estar compartida con múltiples grupos
/// </summary>
public class CredentialGroupShare
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID de la credencial compartida
    /// </summary>
    public int CredentialId { get; set; }

    /// <summary>
    /// ID del grupo con el que se comparte
    /// </summary>
    public int GroupId { get; set; }

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

    [ForeignKey("GroupId")]
    public virtual CredentialGroup? Group { get; set; }

    [ForeignKey("SharedByUserId")]
    public virtual ApplicationUser? SharedByUser { get; set; }
}

