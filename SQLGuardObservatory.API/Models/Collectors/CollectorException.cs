using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Collectors;

/// <summary>
/// Excepciones de collectors - permite excluir validaciones específicas para ciertos servidores
/// Ejemplo: Exceptuar CHECKDB para SERVER01
/// </summary>
[Table("CollectorExceptions", Schema = "dbo")]
public class CollectorException
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre del collector (ej: "Maintenance")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string CollectorName { get; set; } = string.Empty;
    
    /// <summary>
    /// Tipo de excepción (ej: "CHECKDB", "IndexOptimize")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string ExceptionType { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre del servidor o instancia exceptuada
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    /// <summary>
    /// Motivo de la excepción (opcional)
    /// </summary>
    [MaxLength(500)]
    public string? Reason { get; set; }
    
    /// <summary>
    /// Si la excepción está activa
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.Now;
    
    /// <summary>
    /// Usuario que creó la excepción
    /// </summary>
    [MaxLength(100)]
    public string? CreatedBy { get; set; }
    
    /// <summary>
    /// Fecha de expiración (opcional) - si es null, no expira
    /// </summary>
    public DateTime? ExpiresAtUtc { get; set; }
}



