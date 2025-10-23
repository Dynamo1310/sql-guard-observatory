using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

[Table("InventarioDiscosSnapshot", Schema = "dbo")]
public class InventarioDiscosSnapshot
{
    [Key]
    public long Id { get; set; }
    
    [Required]
    [MaxLength(128)]
    public string InstanceName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Ambiente { get; set; }
    
    [MaxLength(50)]
    public string? Hosting { get; set; }
    
    [Required]
    [MaxLength(128)]
    public string Servidor { get; set; } = string.Empty;
    
    [Required]
    [MaxLength(255)]
    public string Drive { get; set; } = string.Empty;
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? TotalGB { get; set; }
    
    [Column(TypeName = "decimal(18,2)")]
    public decimal? LibreGB { get; set; }
    
    [Column(TypeName = "decimal(5,2)")]
    public decimal? PorcentajeLibre { get; set; }
    
    [MaxLength(20)]
    public string? Estado { get; set; }
    
    [Required]
    public DateTime CaptureDate { get; set; }
    
    [Required]
    public DateTime InsertedAtUtc { get; set; }
}

