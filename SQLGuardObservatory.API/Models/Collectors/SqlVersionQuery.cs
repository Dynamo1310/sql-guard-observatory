using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.Collectors;

/// <summary>
/// Query T-SQL específica para una versión de SQL Server
/// </summary>
[Table("SqlVersionQueries", Schema = "dbo")]
public class SqlVersionQuery
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
    /// Nombre identificador de la query (ej: "MainQuery", "FallbackQuery")
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string QueryName { get; set; } = string.Empty;
    
    /// <summary>
    /// Versión mínima de SQL Server (9=2005, 10=2008, 11=2012, 12=2014, 13=2016, 14=2017, 15=2019, 16=2022)
    /// </summary>
    public int MinSqlVersion { get; set; } = 9;
    
    /// <summary>
    /// Versión máxima de SQL Server (NULL = sin límite superior)
    /// </summary>
    public int? MaxSqlVersion { get; set; }
    
    /// <summary>
    /// Query T-SQL a ejecutar
    /// </summary>
    [Required]
    public string QueryTemplate { get; set; } = string.Empty;
    
    /// <summary>
    /// Descripción de la variante de query
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }
    
    /// <summary>
    /// Orden de prioridad (se usa la primera que coincida con la versión)
    /// </summary>
    public int Priority { get; set; } = 0;
    
    /// <summary>
    /// Si está activa
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
    
    /// <summary>
    /// Verifica si esta query es compatible con una versión de SQL Server
    /// </summary>
    public bool IsCompatibleWith(int sqlMajorVersion)
    {
        if (sqlMajorVersion < MinSqlVersion)
            return false;
            
        if (MaxSqlVersion.HasValue && sqlMajorVersion > MaxSqlVersion.Value)
            return false;
            
        return true;
    }
}

