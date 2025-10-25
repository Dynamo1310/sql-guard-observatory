using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_AlwaysOn", Schema = "dbo")]
public class InstanceHealthAlwaysOn
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
    
    // Métricas AlwaysOn
    public bool AlwaysOnEnabled { get; set; }
    
    [MaxLength(50)]
    public string? AlwaysOnWorstState { get; set; }
    
    public int DatabaseCount { get; set; }
    public int SynchronizedCount { get; set; }
    public int SuspendedCount { get; set; }
    public int AvgSendQueueKB { get; set; }
    public int MaxSendQueueKB { get; set; }
    public int AvgRedoQueueKB { get; set; }
    public int MaxRedoQueueKB { get; set; }
    public int MaxSecondsBehind { get; set; }
    public string? AlwaysOnDetails { get; set; }
}

