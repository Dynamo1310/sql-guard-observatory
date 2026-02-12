using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Caché de datos pre-calculados para el Dashboard Overview
/// Se actualiza automáticamente por los collectors para optimizar la carga
/// </summary>
[Table("OverviewSummaryCache")]
public class OverviewSummaryCache
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Clave de caché (por defecto "Production")
    /// Permite tener múltiples cachés si se necesitan otros ambientes
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CacheKey { get; set; } = "Production";
    
    // ========================================
    // KPIs
    // ========================================
    
    /// <summary>
    /// Total de instancias de producción
    /// </summary>
    public int TotalInstances { get; set; }
    
    /// <summary>
    /// Instancias con HealthStatus = "Healthy" (score >= 90)
    /// </summary>
    public int HealthyCount { get; set; }
    
    /// <summary>
    /// Instancias con HealthStatus = "Warning" (score 75-89)
    /// </summary>
    public int WarningCount { get; set; }
    
    /// <summary>
    /// Instancias con HealthStatus = "Risk" (score 60-74)
    /// </summary>
    public int RiskCount { get; set; }
    
    /// <summary>
    /// Instancias con HealthScore menor a 60
    /// </summary>
    public int CriticalCount { get; set; }
    
    /// <summary>
    /// Cantidad de instancias AlwaysOn con estado no saludable
    /// </summary>
    public int AGUnhealthyCount { get; set; }
    
    /// <summary>
    /// Promedio de HealthScore de todas las instancias
    /// </summary>
    [Column(TypeName = "decimal(5,2)")]
    public decimal AvgScore { get; set; }
    
    /// <summary>
    /// Cantidad de instancias con backups atrasados
    /// </summary>
    public int BackupsOverdue { get; set; }
    
    /// <summary>
    /// Cantidad de discos en estado crítico (alertados)
    /// </summary>
    public int CriticalDisksCount { get; set; }
    
    /// <summary>
    /// Cantidad de instancias con mantenimiento vencido
    /// </summary>
    public int MaintenanceOverdueCount { get; set; }
    
    // ========================================
    // Listas serializadas en JSON
    // ========================================
    
    /// <summary>
    /// Lista de estados de salud AlwaysOn serializada en JSON
    /// Estructura: List&lt;OverviewAGHealthDto&gt;
    /// </summary>
    public string? AGHealthStatusesJson { get; set; }
    
    /// <summary>
    /// Lista de problemas de backup serializada en JSON
    /// Estructura: List&lt;OverviewBackupIssueDto&gt;
    /// </summary>
    public string? BackupIssuesJson { get; set; }
    
    /// <summary>
    /// Lista de discos críticos (alertados) serializada en JSON
    /// Estructura: List&lt;OverviewCriticalDiskDto&gt;
    /// </summary>
    public string? CriticalDisksJson { get; set; }
    
    /// <summary>
    /// Lista de mantenimiento vencido serializada en JSON
    /// Estructura: List&lt;OverviewMaintenanceOverdueDto&gt;
    /// </summary>
    public string? MaintenanceOverdueJson { get; set; }
    
    // ========================================
    // Metadata
    // ========================================
    
    /// <summary>
    /// Fecha y hora de la última actualización del caché (UTC)
    /// </summary>
    public DateTime LastUpdatedUtc { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Origen de la última actualización (ej: "HealthScoreConsolidator", "DiscosCollector", "OnDemand")
    /// </summary>
    [MaxLength(100)]
    public string? LastUpdatedBy { get; set; }
}
