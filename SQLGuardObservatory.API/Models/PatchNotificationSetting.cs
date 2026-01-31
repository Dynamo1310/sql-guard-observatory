using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de notificaciones de parcheo
/// </summary>
public class PatchNotificationSetting
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Tipo de notificación: T48h, T2h, TFin
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string NotificationType { get; set; } = string.Empty;

    /// <summary>
    /// Si la notificación está habilitada
    /// </summary>
    public bool IsEnabled { get; set; } = true;

    /// <summary>
    /// Horas antes del parcheo para enviar la notificación (para T-Xh)
    /// </summary>
    public int? HoursBefore { get; set; }

    /// <summary>
    /// Tipo de destinatario: Operator, Cell, Owner, All
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string RecipientType { get; set; } = NotificationRecipientType.Operator;

    /// <summary>
    /// Template del asunto del email
    /// </summary>
    [MaxLength(500)]
    public string? EmailSubjectTemplate { get; set; }

    /// <summary>
    /// Template del cuerpo del email (HTML)
    /// </summary>
    public string? EmailBodyTemplate { get; set; }

    /// <summary>
    /// Descripción de la notificación
    /// </summary>
    [MaxLength(200)]
    public string? Description { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }
}

/// <summary>
/// Historial de notificaciones enviadas
/// </summary>
public class PatchNotificationHistory
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID del plan de parcheo
    /// </summary>
    public int PatchPlanId { get; set; }

    /// <summary>
    /// Tipo de notificación: T48h, T2h, TFin
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string NotificationType { get; set; } = string.Empty;

    /// <summary>
    /// Email del destinatario
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string RecipientEmail { get; set; } = string.Empty;

    /// <summary>
    /// Nombre del destinatario
    /// </summary>
    [MaxLength(256)]
    public string? RecipientName { get; set; }

    /// <summary>
    /// Asunto del email enviado
    /// </summary>
    [MaxLength(500)]
    public string? Subject { get; set; }

    /// <summary>
    /// Fecha/hora de envío
    /// </summary>
    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Si el envío fue exitoso
    /// </summary>
    public bool WasSuccessful { get; set; } = true;

    /// <summary>
    /// Mensaje de error si falló
    /// </summary>
    [MaxLength(500)]
    public string? ErrorMessage { get; set; }

    // Navegación
    [ForeignKey("PatchPlanId")]
    public virtual PatchPlan? PatchPlan { get; set; }
}

/// <summary>
/// Tipos de notificación de parcheo
/// </summary>
public static class PatchNotificationType
{
    public const string T48h = "T48h";
    public const string T2h = "T2h";
    public const string TFin = "TFin";

    public static readonly string[] AllTypes = new[] { T48h, T2h, TFin };
}

/// <summary>
/// Tipos de destinatario de notificación
/// </summary>
public static class NotificationRecipientType
{
    public const string Operator = "Operator";
    public const string Cell = "Cell";
    public const string Owner = "Owner";
    public const string All = "All";

    public static readonly string[] AllTypes = new[] { Operator, Cell, Owner, All };
}
