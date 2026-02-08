using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Backups", Schema = "dbo")]
public class InstanceHealthBackups
{
    [Key]
    public long Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string InstanceName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Ambiente { get; set; }
    
    [MaxLength(50)]
    public string? HostingSite { get; set; }
    
    [MaxLength(50)]
    public string? SqlVersion { get; set; }
    
    public DateTime CollectedAtUtc { get; set; }
    
    // Métricas de Backups
    public DateTime? LastFullBackup { get; set; }
    public DateTime? LastLogBackup { get; set; }
    
    public bool FullBackupBreached { get; set; }
    public bool LogBackupBreached { get; set; }
    
    // Detalles de backup por DB (como en PowerShell)
    public string? BackupDetails { get; set; }
    
    // Campos para supresión de alertas de LOG durante FULL backup
    /// <summary>
    /// Indica si hay un backup FULL ejecutándose en la instancia
    /// </summary>
    public bool IsFullRunning { get; set; }
    
    /// <summary>
    /// Cuándo comenzó el backup FULL en ejecución
    /// </summary>
    public DateTime? FullRunningSince { get; set; }
    
    /// <summary>
    /// Indica si el chequeo de LOG está suprimido (por FULL running o grace period)
    /// </summary>
    public bool LogCheckSuppressed { get; set; }
    
    /// <summary>
    /// Razón de la supresión: "FULL_RUNNING" o "GRACE_PERIOD"
    /// </summary>
    [MaxLength(50)]
    public string? LogCheckSuppressReason { get; set; }
    
    /// <summary>
    /// Indica si el collector tiene permiso VIEW SERVER STATE para detectar backups en ejecución
    /// </summary>
    public bool HasViewServerState { get; set; } = true;
    
    /// <summary>
    /// Nombre del Availability Group al que pertenece la instancia (null si no es AG)
    /// </summary>
    [MaxLength(255)]
    public string? AGName { get; set; }
}

