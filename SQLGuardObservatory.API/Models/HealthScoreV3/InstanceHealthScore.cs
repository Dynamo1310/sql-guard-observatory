using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models.HealthScoreV3;

[Table("InstanceHealth_Score", Schema = "dbo")]
public class InstanceHealthScore
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
    
    // Score Total (100 puntos)
    public int HealthScore { get; set; }
    
    [Required]
    [MaxLength(50)]
    public string HealthStatus { get; set; } = string.Empty;
    
    // Scores por Categoría (cada uno sobre 100)
    public int BackupsScore { get; set; }           // 18%
    public int AlwaysOnScore { get; set; }          // 14%
    public int ConectividadScore { get; set; }      // 10%
    public int ErroresCriticosScore { get; set; }   // 7%
    public int CPUScore { get; set; }               // 10%
    public int IOScore { get; set; }                // 10%
    public int DiscosScore { get; set; }            // 8%
    public int MemoriaScore { get; set; }           // 7%
    public int MantenimientosScore { get; set; }    // 6%
    public int ConfiguracionTempdbScore { get; set; } // 10%
    
    // Cap Global
    public int GlobalCap { get; set; } = 100;
}

