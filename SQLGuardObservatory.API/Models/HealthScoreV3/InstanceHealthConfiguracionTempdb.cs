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
    
    // TempDB - Archivos
    public int TempDBFileCount { get; set; }
    public bool TempDBAllSameSize { get; set; }
    public bool TempDBAllSameGrowth { get; set; }
    public int TempDBTotalSizeMB { get; set; }
    public int TempDBUsedSpaceMB { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal TempDBFreeSpacePct { get; set; }
    
    // TempDB - Rendimiento
    [Column(TypeName = "decimal(10,2)")]
    public decimal TempDBAvgReadLatencyMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal TempDBAvgWriteLatencyMs { get; set; }
    
    public int TempDBPageLatchWaits { get; set; }
    public int TempDBContentionScore { get; set; }
    public int TempDBVersionStoreMB { get; set; }
    
    // TempDB - Configuración
    public int TempDBAvgFileSizeMB { get; set; }
    public int TempDBMinFileSizeMB { get; set; }
    public int TempDBMaxFileSizeMB { get; set; }
    public bool TempDBGrowthConfigOK { get; set; }
    
    // Métricas de Configuración
    public int MaxServerMemoryMB { get; set; }
    public int TotalPhysicalMemoryMB { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal MaxMemoryPctOfPhysical { get; set; }
    
    public bool MaxMemoryWithinOptimal { get; set; }
    public int CPUCount { get; set; }
    public string? ConfigDetails { get; set; }
}

