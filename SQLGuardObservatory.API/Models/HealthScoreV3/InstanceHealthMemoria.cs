using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Memoria", Schema = "dbo")]
public class InstanceHealthMemoria
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
    
    // Métricas de Memoria
    public int PageLifeExpectancy { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal BufferCacheHitRatio { get; set; }
    
    public int TotalServerMemoryMB { get; set; }
    public int TargetServerMemoryMB { get; set; }
    public int MaxServerMemoryMB { get; set; }
    public int BufferPoolSizeMB { get; set; }
    public int MemoryGrantsPending { get; set; }
    public int MemoryGrantsActive { get; set; }
    public int PLETarget { get; set; }
    public bool MemoryPressure { get; set; }
    
    /// <summary>
    /// Stolen Server Memory: memoria usada por objetos fuera del buffer pool
    /// (Lock Manager, Connection Memory, Thread stacks, Memory Clerks, etc.)
    /// </summary>
    public int StolenServerMemoryMB { get; set; }
    
    /// <summary>
    /// Porcentaje de stolen memory respecto al buffer pool
    /// </summary>
    [NotMapped]
    public decimal StolenMemoryPct => BufferPoolSizeMB > 0 
        ? Math.Round((decimal)StolenServerMemoryMB / BufferPoolSizeMB * 100, 2) 
        : 0;
}

