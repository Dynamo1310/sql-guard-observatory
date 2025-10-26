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
    
    // Scores por Categoría (cada uno sobre 100) - 12 CATEGORÍAS
    // TAB 1: Availability & DR (40%)
    public int BackupsScore { get; set; }           // 18%
    public int AlwaysOnScore { get; set; }          // 14%
    public int LogChainScore { get; set; }          // 5%
    public int DatabaseStatesScore { get; set; }    // 3%
    
    // TAB 2: Performance (35%)
    public int CPUScore { get; set; }               // 10%
    public int MemoriaScore { get; set; }           // 8%
    public int IOScore { get; set; }                // 10%
    public int DiscosScore { get; set; }            // 7%
    
    // TAB 3: Maintenance & Config (25%)
    public int ErroresCriticosScore { get; set; }   // 7%
    public int MantenimientosScore { get; set; }    // 5%
    public int ConfiguracionTempdbScore { get; set; } // 8%
    public int AutogrowthScore { get; set; }        // 5%
    
    // Contribuciones Ponderadas (0-peso máximo: Score × Peso, redondeadas a entero)
    // TAB 1: Availability & DR
    public int BackupsContribution { get; set; }           // Max: 18
    public int AlwaysOnContribution { get; set; }          // Max: 14
    public int LogChainContribution { get; set; }          // Max: 5
    public int DatabaseStatesContribution { get; set; }    // Max: 3
    
    // TAB 2: Performance
    public int CPUContribution { get; set; }               // Max: 10
    public int MemoriaContribution { get; set; }           // Max: 8
    public int IOContribution { get; set; }                // Max: 10
    public int DiscosContribution { get; set; }            // Max: 7
    
    // TAB 3: Maintenance & Config
    public int ErroresCriticosContribution { get; set; }   // Max: 7
    public int MantenimientosContribution { get; set; }    // Max: 5
    public int ConfiguracionTempdbContribution { get; set; } // Max: 8
    public int AutogrowthContribution { get; set; }        // Max: 5
    
    // Cap Global
    public int GlobalCap { get; set; } = 100;
}

