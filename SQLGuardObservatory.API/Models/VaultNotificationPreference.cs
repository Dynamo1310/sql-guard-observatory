using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Preferencia de notificación del Vault para un usuario específico
/// </summary>
public class VaultNotificationPreference
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID del usuario al que pertenece esta preferencia
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Tipo de notificación (ej: VaultCredentialCreated, VaultCredentialShared, etc.)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string NotificationType { get; set; } = string.Empty;

    /// <summary>
    /// Si la notificación está habilitada para este usuario
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Fecha de creación de la preferencia
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }

    // Navegación
    [ForeignKey("UserId")]
    public virtual ApplicationUser? User { get; set; }

    // Nota: No agregamos navegación a VaultNotificationType porque la relación
    // es por el campo Code (string), no por Id. Los joins se hacen manualmente en el servicio.
}

/// <summary>
/// Tipo de notificación disponible en el Vault
/// </summary>
public class VaultNotificationType
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Código único del tipo (usado internamente)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// Nombre para mostrar en la UI
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;

    /// <summary>
    /// Descripción detallada del tipo de notificación
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string Description { get; set; } = string.Empty;

    /// <summary>
    /// Si está habilitado por defecto para nuevos usuarios
    /// </summary>
    public bool DefaultEnabled { get; set; } = true;

    /// <summary>
    /// Orden de visualización en la UI
    /// </summary>
    public int DisplayOrder { get; set; } = 0;

    /// <summary>
    /// Categoría de la notificación (Credenciales, Grupos, Compartir, Alertas, Seguridad)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Category { get; set; } = "General";

    /// <summary>
    /// Si el tipo está activo en el sistema
    /// </summary>
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Códigos de tipos de notificación del Vault
/// </summary>
public static class VaultNotificationTypeCodes
{
    public const string CredentialCreated = "VaultCredentialCreated";
    public const string CredentialUpdated = "VaultCredentialUpdated";
    public const string CredentialDeleted = "VaultCredentialDeleted";
    public const string CredentialShared = "VaultCredentialShared";
    public const string GroupMemberAdded = "VaultGroupMemberAdded";
    public const string GroupMemberRemoved = "VaultGroupMemberRemoved";
    public const string CredentialExpiring = "VaultCredentialExpiring";
    public const string PasswordRevealed = "VaultPasswordRevealed";
    public const string ShareRevoked = "VaultShareRevoked";
}

