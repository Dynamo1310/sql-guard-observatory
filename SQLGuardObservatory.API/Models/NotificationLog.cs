using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Log de notificaciones enviadas
/// </summary>
public class NotificationLog
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Tipo de notificación
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string NotificationType { get; set; } = string.Empty;

    /// <summary>
    /// Email del destinatario
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string ToEmail { get; set; } = string.Empty;

    /// <summary>
    /// Nombre del destinatario
    /// </summary>
    [MaxLength(100)]
    public string? ToName { get; set; }

    /// <summary>
    /// Asunto del email
    /// </summary>
    [Required]
    [MaxLength(500)]
    public string Subject { get; set; } = string.Empty;

    /// <summary>
    /// Cuerpo del email (HTML)
    /// </summary>
    public string? Body { get; set; }

    /// <summary>
    /// Estado del envío
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Pending"; // Sent, Failed, Pending

    /// <summary>
    /// Mensaje de error si falló
    /// </summary>
    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }

    /// <summary>
    /// Tipo de referencia (Schedule, SwapRequest, Activation, etc.)
    /// </summary>
    [MaxLength(50)]
    public string? ReferenceType { get; set; }

    /// <summary>
    /// ID de la referencia
    /// </summary>
    public int? ReferenceId { get; set; }

    /// <summary>
    /// Momento del envío
    /// </summary>
    public DateTime SentAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Cantidad de reintentos
    /// </summary>
    public int RetryCount { get; set; } = 0;
}


