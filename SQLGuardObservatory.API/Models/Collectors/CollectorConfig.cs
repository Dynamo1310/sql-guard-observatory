using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Collectors;

/// <summary>
/// Configuración de un collector de métricas de HealthScore
/// </summary>
[Table("CollectorConfig", Schema = "dbo")]
public class CollectorConfig
{
    [Key]
    [MaxLength(50)]
    public string CollectorName { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre para mostrar en la UI
    /// </summary>
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;
    
    /// <summary>
    /// Descripción del collector
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }
    
    /// <summary>
    /// Si el collector está habilitado
    /// </summary>
    public bool IsEnabled { get; set; } = true;
    
    /// <summary>
    /// Intervalo de ejecución en segundos (mínimo 30s)
    /// </summary>
    public int IntervalSeconds { get; set; } = 300; // 5 minutos por defecto
    
    /// <summary>
    /// Timeout de queries en segundos
    /// </summary>
    public int TimeoutSeconds { get; set; } = 30;
    
    /// <summary>
    /// Peso en el score final (porcentaje, 0-100)
    /// </summary>
    [Column(TypeName = "decimal(5,2)")]
    public decimal Weight { get; set; }
    
    /// <summary>
    /// Grado de paralelismo para procesamiento de instancias
    /// </summary>
    public int ParallelDegree { get; set; } = 5;
    
    /// <summary>
    /// Categoría/Tab al que pertenece (Availability, Performance, Maintenance)
    /// </summary>
    [MaxLength(50)]
    public string Category { get; set; } = "Performance";
    
    /// <summary>
    /// Orden de ejecución dentro de la categoría
    /// </summary>
    public int ExecutionOrder { get; set; } = 0;
    
    /// <summary>
    /// Última ejecución exitosa
    /// </summary>
    public DateTime? LastExecutionUtc { get; set; }
    
    /// <summary>
    /// Duración de la última ejecución en milisegundos
    /// </summary>
    public long? LastExecutionDurationMs { get; set; }
    
    /// <summary>
    /// Número de instancias procesadas en la última ejecución
    /// </summary>
    public int? LastInstancesProcessed { get; set; }
    
    /// <summary>
    /// Último error ocurrido
    /// </summary>
    [MaxLength(2000)]
    public string? LastError { get; set; }
    
    /// <summary>
    /// Fecha del último error
    /// </summary>
    public DateTime? LastErrorUtc { get; set; }
    
    /// <summary>
    /// Fecha de creación (hora local Argentina)
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.Now;
    
    /// <summary>
    /// Fecha de última modificación (hora local Argentina)
    /// </summary>
    public DateTime UpdatedAtUtc { get; set; } = DateTime.Now;
    
    // Navigation properties
    public virtual ICollection<CollectorThreshold> Thresholds { get; set; } = new List<CollectorThreshold>();
    public virtual ICollection<SqlVersionQuery> VersionQueries { get; set; } = new List<SqlVersionQuery>();
}

