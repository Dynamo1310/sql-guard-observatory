using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Collectors;

/// <summary>
/// Umbral configurable para un collector
/// </summary>
[Table("CollectorThresholds", Schema = "dbo")]
public class CollectorThreshold
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre del collector al que pertenece
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CollectorName { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre del umbral (ej: "P95CPU_Optimal", "PLE_Ratio_Critical")
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string ThresholdName { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre para mostrar en la UI
    /// </summary>
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;
    
    /// <summary>
    /// Valor numérico del umbral
    /// </summary>
    [Column(TypeName = "decimal(18,4)")]
    public decimal ThresholdValue { get; set; }
    
    /// <summary>
    /// Operador de comparación: ">", "<", ">=", "<=", "=", "!="
    /// </summary>
    [Required]
    [MaxLength(10)]
    public string ThresholdOperator { get; set; } = ">=";
    
    /// <summary>
    /// Score resultante cuando se cumple la condición (0-100)
    /// </summary>
    public int ResultingScore { get; set; }
    
    /// <summary>
    /// Tipo de acción: "Score" (asigna score), "Cap" (limita máximo), "Penalty" (resta puntos)
    /// </summary>
    [MaxLength(20)]
    public string ActionType { get; set; } = "Score";
    
    /// <summary>
    /// Descripción del umbral para la UI
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }
    
    /// <summary>
    /// Valor por defecto (para poder hacer reset)
    /// </summary>
    [Column(TypeName = "decimal(18,4)")]
    public decimal DefaultValue { get; set; }
    
    /// <summary>
    /// Orden de evaluación (los umbrales se evalúan en orden)
    /// </summary>
    public int EvaluationOrder { get; set; } = 0;
    
    /// <summary>
    /// Grupo de umbrales (para agrupar en UI)
    /// </summary>
    [MaxLength(50)]
    public string? ThresholdGroup { get; set; }
    
    /// <summary>
    /// Si está activo
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Fecha de creación (hora local Argentina)
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.Now;
    
    /// <summary>
    /// Fecha de última modificación (hora local Argentina)
    /// </summary>
    public DateTime UpdatedAtUtc { get; set; } = DateTime.Now;
    
    // Navigation property
    [ForeignKey(nameof(CollectorName))]
    public virtual CollectorConfig? Collector { get; set; }
}

