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
    
    // Métricas de Memory Clerks (v3.1)
    /// <summary>
    /// Tipo del memory clerk que más memoria consume
    /// </summary>
    [MaxLength(128)]
    public string? TopMemoryClerk { get; set; }
    
    /// <summary>
    /// MB consumidos por el top memory clerk
    /// </summary>
    public int TopMemoryClerkMB { get; set; }
    
    // Métricas de Plan Cache (v3.1)
    /// <summary>
    /// Tamaño total del plan cache en MB
    /// </summary>
    public int PlanCacheSizeMB { get; set; }
    
    /// <summary>
    /// Número de planes en cache
    /// </summary>
    public int PlanCacheCount { get; set; }
    
    // Métricas de Memory Pressure (v3.1)
    /// <summary>
    /// Tiempo acumulado esperando memoria (RESOURCE_SEMAPHORE)
    /// </summary>
    public long ResourceSemaphoreWaitMs { get; set; }
    
    /// <summary>
    /// Número de tareas esperando memoria
    /// </summary>
    public long ResourceSemaphoreWaitCount { get; set; }
    
    /// <summary>
    /// Porcentaje de stolen memory respecto al buffer pool
    /// </summary>
    [NotMapped]
    public decimal StolenMemoryPct => BufferPoolSizeMB > 0 
        ? Math.Round((decimal)StolenServerMemoryMB / BufferPoolSizeMB * 100, 2) 
        : 0;
}

