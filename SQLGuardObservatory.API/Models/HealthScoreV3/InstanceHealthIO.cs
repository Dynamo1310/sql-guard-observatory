using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_IO", Schema = "dbo")]
public class InstanceHealthIO
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
    
    // Métricas de IO
    [Column(TypeName = "decimal(10,2)")]
    public decimal AvgReadLatencyMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal AvgWriteLatencyMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal MaxReadLatencyMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal MaxWriteLatencyMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal DataFileAvgReadMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal DataFileAvgWriteMs { get; set; }
    
    [Column(TypeName = "decimal(10,2)")]
    public decimal LogFileAvgWriteMs { get; set; }
    
    public int TotalIOPS { get; set; }
    public int ReadIOPS { get; set; }
    public int WriteIOPS { get; set; }
    public string? IODetails { get; set; }
}

