using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Tipo de alerta de backup: FULL o LOG
/// </summary>
public enum BackupAlertType
{
    /// <summary>
    /// Alertas para backups FULL atrasados
    /// </summary>
    Full = 1,
    
    /// <summary>
    /// Alertas para backups LOG atrasados
    /// </summary>
    Log = 2
}

/// <summary>
/// Configuración de alertas por email para backups atrasados
/// </summary>
[Table("BackupAlertConfig")]
public class BackupAlertConfig
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Tipo de alerta: Full o Log (cada tipo tiene su propia configuración)
    /// </summary>
    public BackupAlertType AlertType { get; set; } = BackupAlertType.Full;
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "Alerta de Backups Atrasados";
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsEnabled { get; set; } = false;
    
    /// <summary>
    /// Intervalo en minutos para verificar backups atrasados (default: 60 minutos)
    /// </summary>
    public int CheckIntervalMinutes { get; set; } = 60;
    
    /// <summary>
    /// Intervalo en minutos entre alertas si siguen atrasados (default: 240 minutos = 4 horas)
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
/// Historial de alertas de backups enviadas
/// </summary>
[Table("BackupAlertHistory")]
public class BackupAlertHistory
{
    [Key]
    public int Id { get; set; }
    
    public int ConfigId { get; set; }
    
    [ForeignKey(nameof(ConfigId))]
    public virtual BackupAlertConfig? Config { get; set; }
    
    /// <summary>
    /// Tipo de alerta: Full o Log
    /// </summary>
    public BackupAlertType AlertType { get; set; } = BackupAlertType.Full;
    
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
    /// Lista de instancias afectadas separadas por coma
    /// </summary>
    [MaxLength(4000)]
    public string InstancesAffected { get; set; } = "";
    
    public bool Success { get; set; }
    
    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }
}
