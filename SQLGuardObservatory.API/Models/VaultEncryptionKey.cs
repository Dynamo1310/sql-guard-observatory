using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Registro de llave de cifrado en el Vault
/// Soporta versionado de llaves y rotación
/// </summary>
public class VaultEncryptionKey
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Identificador único del stream de llaves para este purpose
    /// </summary>
    public Guid KeyId { get; set; }
    
    /// <summary>
    /// Versión de la llave (incrementa con cada rotación)
    /// </summary>
    public int KeyVersion { get; set; }
    
    /// <summary>
    /// Propósito de la llave: CredentialPassword, CredentialNotes, GroupData
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string KeyPurpose { get; set; } = "CredentialPassword";
    
    /// <summary>
    /// Algoritmo de cifrado (ej: AES-256-GCM)
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Algorithm { get; set; } = "AES-256-GCM";
    
    /// <summary>
    /// Fingerprint de la llave (SHA-512)
    /// Usado para verificación y como contexto en derivación
    /// </summary>
    [Required]
    public byte[] KeyFingerprint { get; set; } = Array.Empty<byte>();
    
    /// <summary>
    /// Indica si esta versión de llave está activa
    /// Solo una versión puede estar activa por purpose
    /// </summary>
    public bool IsActive { get; set; }
    
    /// <summary>
    /// Fecha de activación de la llave
    /// </summary>
    public DateTimeOffset? ActivatedAt { get; set; }
    
    /// <summary>
    /// Fecha de desactivación (cuando se rotó)
    /// </summary>
    public DateTimeOffset? DeactivatedAt { get; set; }
    
    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTimeOffset CreatedAt { get; set; }
    
    /// <summary>
    /// Usuario que creó la llave
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;
}

