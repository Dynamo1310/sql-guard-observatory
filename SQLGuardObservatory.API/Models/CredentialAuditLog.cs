using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Acciones auditables en el Vault
/// </summary>
public static class CredentialAuditActions
{
    public const string Created = "Created";
    public const string Updated = "Updated";
    public const string Deleted = "Deleted";
    public const string Viewed = "Viewed";
    public const string PasswordRevealed = "PasswordRevealed";
    public const string PasswordCopied = "PasswordCopied";
    public const string ServerAdded = "ServerAdded";
    public const string ServerRemoved = "ServerRemoved";
}

/// <summary>
/// Registro de auditoría para operaciones en el Vault
/// </summary>
public class CredentialAuditLog
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID de la credencial afectada
    /// </summary>
    public int CredentialId { get; set; }

    /// <summary>
    /// Nombre de la credencial al momento de la acción (para historial)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string CredentialName { get; set; } = string.Empty;

    /// <summary>
    /// Acción realizada (Created, Updated, Deleted, Viewed, PasswordRevealed, PasswordCopied)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty;

    /// <summary>
    /// JSON con los campos modificados (para Updated)
    /// </summary>
    public string? ChangedFields { get; set; }

    /// <summary>
    /// ID del usuario que realizó la acción
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string PerformedByUserId { get; set; } = string.Empty;

    /// <summary>
    /// Nombre del usuario que realizó la acción (para historial)
    /// </summary>
    [MaxLength(256)]
    public string? PerformedByUserName { get; set; }

    /// <summary>
    /// Fecha y hora de la acción
    /// </summary>
    public DateTime PerformedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Dirección IP del cliente
    /// </summary>
    [MaxLength(50)]
    public string? IpAddress { get; set; }

    /// <summary>
    /// User-Agent del cliente
    /// </summary>
    [MaxLength(500)]
    public string? UserAgent { get; set; }
}




