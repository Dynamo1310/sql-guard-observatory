using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Maintenance", Schema = "dbo")]
public class InstanceHealthMaintenance
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
    
    // Métricas de Mantenimiento (solo las que existen en la tabla real)
    public DateTime? LastCheckdb { get; set; }
    public DateTime? LastIndexOptimize { get; set; }
    
    public bool CheckdbOk { get; set; }
    public bool IndexOptimizeOk { get; set; }
}

