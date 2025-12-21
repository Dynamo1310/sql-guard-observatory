using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Tipos de credenciales soportados por el Vault
/// </summary>
public static class CredentialTypes
{
    public const string SqlAuth = "SqlAuth";
    public const string WindowsAD = "WindowsAD";
    public const string Other = "Other";
}

/// <summary>
/// Entidad principal de credencial en el Vault DBA
/// </summary>
public class Credential
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre descriptivo de la credencial
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Tipo de credencial: SqlAuth, WindowsAD, Other
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CredentialType { get; set; } = CredentialTypes.SqlAuth;

    /// <summary>
    /// Nombre de usuario
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Password cifrado con AES-256-GCM
    /// </summary>
    [Required]
    public string EncryptedPassword { get; set; } = string.Empty;

    /// <summary>
    /// Salt único para esta credencial (Base64)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Salt { get; set; } = string.Empty;

    /// <summary>
    /// Vector de inicialización para AES-GCM (Base64)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string IV { get; set; } = string.Empty;

    /// <summary>
    /// Dominio para credenciales Windows/AD
    /// </summary>
    [MaxLength(256)]
    public string? Domain { get; set; }

    /// <summary>
    /// Descripción breve de la credencial
    /// </summary>
    [MaxLength(1000)]
    public string? Description { get; set; }

    /// <summary>
    /// Notas adicionales (documentación)
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// Fecha de expiración (opcional)
    /// </summary>
    public DateTime? ExpiresAt { get; set; }

    /// <summary>
    /// Si es true, solo el propietario puede ver esta credencial
    /// </summary>
    public bool IsPrivate { get; set; } = false;

    /// <summary>
    /// Si es true, la credencial está compartida con todo el equipo
    /// </summary>
    public bool IsTeamShared { get; set; } = false;

    /// <summary>
    /// ID del grupo al que pertenece la credencial (legacy - usar GroupShares)
    /// </summary>
    [Obsolete("Usar GroupShares para compartición múltiple")]
    public int? GroupId { get; set; }

    /// <summary>
    /// Usuario propietario de la credencial
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string OwnerUserId { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    /// <summary>
    /// Soft delete - marca la credencial como eliminada sin borrarla físicamente
    /// </summary>
    public bool IsDeleted { get; set; } = false;

    // Navegación
    [ForeignKey("OwnerUserId")]
    public virtual ApplicationUser? Owner { get; set; }

    [ForeignKey("CreatedByUserId")]
    public virtual ApplicationUser? CreatedByUser { get; set; }

    [ForeignKey("UpdatedByUserId")]
    public virtual ApplicationUser? UpdatedByUser { get; set; }

    /// <summary>
    /// Grupo al que pertenece la credencial
    /// </summary>
    [ForeignKey("GroupId")]
    public virtual CredentialGroup? Group { get; set; }

    /// <summary>
    /// Servidores asociados a esta credencial
    /// </summary>
    public virtual ICollection<CredentialServer> Servers { get; set; } = new List<CredentialServer>();

    /// <summary>
    /// Grupos con los que se comparte esta credencial
    /// </summary>
    public virtual ICollection<CredentialGroupShare> GroupShares { get; set; } = new List<CredentialGroupShare>();

    /// <summary>
    /// Usuarios individuales con los que se comparte esta credencial
    /// </summary>
    public virtual ICollection<CredentialUserShare> UserShares { get; set; } = new List<CredentialUserShare>();
}

