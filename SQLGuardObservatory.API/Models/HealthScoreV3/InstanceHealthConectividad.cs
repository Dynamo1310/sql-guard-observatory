using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Conectividad", Schema = "dbo")]
public class InstanceHealthConectividad
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
    
    // Métricas
    public bool ConnectSuccess { get; set; }
    public int ConnectLatencyMs { get; set; }
    
    [MaxLength(50)]
    public string? AuthType { get; set; }
    
    public int LoginFailuresLast1h { get; set; }
    public string? ErrorMessage { get; set; }
}

