using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Discos", Schema = "dbo")]
public class InstanceHealthDiscos
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
    
    // Métricas de Discos
    [Column(TypeName = "decimal(5,2)")]
    public decimal WorstFreePct { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal DataDiskAvgFreePct { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal LogDiskAvgFreePct { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal TempDBDiskFreePct { get; set; }
    
    public string? VolumesJson { get; set; }
}

