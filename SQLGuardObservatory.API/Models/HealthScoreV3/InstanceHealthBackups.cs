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
    
    // Métricas de Backups (solo las que existen en la tabla real)
    public DateTime? LastFullBackup { get; set; }
    public DateTime? LastLogBackup { get; set; }
    
    public bool FullBackupBreached { get; set; }
    public bool LogBackupBreached { get; set; }
}

