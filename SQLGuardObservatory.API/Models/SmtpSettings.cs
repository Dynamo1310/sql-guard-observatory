using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración SMTP global para el envío de emails
/// </summary>
public class SmtpSettingsEntity
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(255)]
    public string Host { get; set; } = string.Empty;

    public int Port { get; set; } = 25;

    [Required]
    [MaxLength(255)]
    public string FromEmail { get; set; } = string.Empty;

    [MaxLength(100)]
    public string FromName { get; set; } = "SQL Guard Observatory";

    public bool EnableSsl { get; set; } = false;

    [MaxLength(100)]
    public string? Username { get; set; }

    [MaxLength(255)]
    public string? Password { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    [ForeignKey(nameof(UpdatedByUserId))]
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}


