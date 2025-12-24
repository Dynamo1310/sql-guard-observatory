using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Collectors;

/// <summary>
/// Log de ejecución de collectors para auditoría y debugging
/// </summary>
[Table("CollectorExecutionLog", Schema = "dbo")]
public class CollectorExecutionLog
{
    [Key]
    public long Id { get; set; }
    
    /// <summary>
    /// Nombre del collector
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CollectorName { get; set; } = string.Empty;
    
    /// <summary>
    /// Inicio de la ejecución
    /// </summary>
    public DateTime StartedAtUtc { get; set; }
    
    /// <summary>
    /// Fin de la ejecución
    /// </summary>
    public DateTime? CompletedAtUtc { get; set; }
    
    /// <summary>
    /// Duración en milisegundos
    /// </summary>
    public long? DurationMs { get; set; }
    
    /// <summary>
    /// Estado: Running, Completed, Failed, Cancelled
    /// </summary>
    [MaxLength(20)]
    public string Status { get; set; } = "Running";
    
    /// <summary>
    /// Total de instancias a procesar
    /// </summary>
    public int TotalInstances { get; set; }
    
    /// <summary>
    /// Instancias procesadas exitosamente
    /// </summary>
    public int SuccessCount { get; set; }
    
    /// <summary>
    /// Instancias con error
    /// </summary>
    public int ErrorCount { get; set; }
    
    /// <summary>
    /// Instancias omitidas (sin conexión, etc.)
    /// </summary>
    public int SkippedCount { get; set; }
    
    /// <summary>
    /// Mensaje de error si falló
    /// </summary>
    [MaxLength(4000)]
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// Stack trace del error
    /// </summary>
    public string? ErrorStackTrace { get; set; }
    
    /// <summary>
    /// Tipo de trigger: Scheduled, Manual, OnDemand
    /// </summary>
    [MaxLength(20)]
    public string TriggerType { get; set; } = "Scheduled";
    
    /// <summary>
    /// Usuario que disparó la ejecución (para Manual)
    /// </summary>
    [MaxLength(100)]
    public string? TriggeredBy { get; set; }
}

