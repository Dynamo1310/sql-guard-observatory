using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de alertas por email para discos críticos
/// </summary>
[Table("DiskAlertConfig")]
public class DiskAlertConfig
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "Alerta de Discos Críticos";
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsEnabled { get; set; } = false;
    
    /// <summary>
    /// Intervalo en minutos para verificar discos críticos (default: 60 minutos)
    /// </summary>
    public int CheckIntervalMinutes { get; set; } = 60;
    
    /// <summary>
    /// Intervalo en minutos entre alertas si siguen en estado crítico (default: 240 minutos = 4 horas)
    /// </summary>
    public int AlertIntervalMinutes { get; set; } = 240;
    
    /// <summary>
    /// Lista de emails de destinatarios (TO) separados por coma
    /// </summary>
    [MaxLength(2000)]
    public string Recipients { get; set; } = "";
    
    /// <summary>
    /// Lista de emails en copia (CC) separados por coma
    /// </summary>
    [MaxLength(2000)]
    public string CcRecipients { get; set; } = "";
    
    public DateTime? LastRunAt { get; set; }
    
    public DateTime? LastAlertSentAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = LocalClockAR.Now;
    
    public DateTime? UpdatedAt { get; set; }
    
    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }
    
    [ForeignKey(nameof(UpdatedByUserId))]
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}

/// <summary>
/// Historial de alertas de discos críticos enviadas
/// </summary>
[Table("DiskAlertHistory")]
public class DiskAlertHistory
{
    [Key]
    public int Id { get; set; }
    
    public int ConfigId { get; set; }
    
    [ForeignKey(nameof(ConfigId))]
    public virtual DiskAlertConfig? Config { get; set; }
    
    public DateTime SentAt { get; set; } = LocalClockAR.Now;
    
    /// <summary>
    /// Cantidad de destinatarios (TO)
    /// </summary>
    public int RecipientCount { get; set; }
    
    /// <summary>
    /// Cantidad de destinatarios en copia (CC)
    /// </summary>
    public int CcCount { get; set; } = 0;
    
    /// <summary>
    /// Lista de discos afectados separados por coma (formato: Instancia-Disco)
    /// </summary>
    [MaxLength(4000)]
    public string DisksAffected { get; set; } = "";
    
    /// <summary>
    /// Cantidad de discos críticos detectados
    /// </summary>
    public int CriticalDiskCount { get; set; }
    
    public bool Success { get; set; }
    
    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }
}
