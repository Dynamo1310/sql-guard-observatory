using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_ConfiguracionTempdb", Schema = "dbo")]
public class InstanceHealthConfiguracionTempdb
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
    
    // Métricas de TempDB
    public int TempDBFileCount { get; set; }
    public bool TempDBAllSameSize { get; set; }
    public bool TempDBAllSameGrowth { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal TempDBAvgLatencyMs { get; set; }
    
    public int TempDBPageLatchWaits { get; set; }
    public int TempDBContentionScore { get; set; }
    
    // Métricas de Configuración
    public int MaxServerMemoryMB { get; set; }
    public int TotalPhysicalMemoryMB { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal MaxMemoryPctOfPhysical { get; set; }
    
    public bool MaxMemoryWithinOptimal { get; set; }
    public int CPUCount { get; set; }
    public string? ConfigDetails { get; set; }
}

