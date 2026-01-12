using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_ErroresCriticos", Schema = "dbo")]
public class InstanceHealthErroresCriticos
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
    
    // Métricas de Errores
    public int Severity20PlusCount { get; set; }
    public int Severity20PlusLast1h { get; set; }
    public DateTime? MostRecentError { get; set; }
    public string? ErrorDetails { get; set; }
    
    // v3.1: Errores categorizados
    public int IOErrorCount { get; set; }       // Errores 823, 824, 825 (I/O, corrupción)
    public int DeadlockCount { get; set; }      // Errores 1205 (deadlocks)
    public int LogFullCount { get; set; }       // Errores 9002 (log lleno)
    public int CorruptionCount { get; set; }    // Errores de corrupción detectados
}

