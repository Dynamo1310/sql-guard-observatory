using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models
{
    /// <summary>
    /// Modelo para vw_CategoryScores_V2
    /// Scores de todas las categorías por instancia
    /// </summary>
    [Table("vw_CategoryScores_V2", Schema = "dbo")]
    public class CategoryScoresV2
    {
        [Key]
        public string Instance { get; set; } = string.Empty;
        
        public int Score_Backups { get; set; }
        public string Notes_Backups { get; set; } = string.Empty;
        
        public int Score_AG { get; set; }
        public string Notes_AG { get; set; } = string.Empty;
        
        public int Score_Conectividad { get; set; }
        public string Notes_Conectividad { get; set; } = string.Empty;
        
        public int Score_ErroresSev { get; set; }
        public string Notes_ErroresSev { get; set; } = string.Empty;
        
        public int Score_CPU { get; set; }
        public string Notes_CPU { get; set; } = string.Empty;
        
        public int Score_IO { get; set; }
        public string Notes_IO { get; set; } = string.Empty;
        
        public int Score_Discos { get; set; }
        public string Notes_Discos { get; set; } = string.Empty;
        
        public int Score_Memoria { get; set; }
        public string Notes_Memoria { get; set; } = string.Empty;
        
        public int Score_Mantenimiento { get; set; }
        public string Notes_Mantenimiento { get; set; } = string.Empty;
        
        public int Score_ConfigRecursos { get; set; }
        public string Notes_ConfigRecursos { get; set; } = string.Empty;
    }

    /// <summary>
    /// Modelo para vw_HealthFinal_V2
    /// Health Score final con caps aplicados
    /// </summary>
    [Table("vw_HealthFinal_V2", Schema = "dbo")]
    public class HealthFinalV2
    {
        [Key]
        public string Instance { get; set; } = string.Empty;
        
        public int HealthRaw { get; set; }
        public string? CapApplied { get; set; }
        public int HealthFinal { get; set; }
        public string Top3Penalizaciones { get; set; } = string.Empty;
        public string ColorSemaforo { get; set; } = string.Empty;
        public DateTime CalculadoAt { get; set; }
    }

    /// <summary>
    /// Modelo para vw_HealthTendencias_24h_V2
    /// Tendencias horarias últimas 24 horas
    /// </summary>
    [Table("vw_HealthTendencias_24h_V2", Schema = "dbo")]
    public class HealthTendencias24hV2
    {
        [Key]
        [Column(Order = 0)]
        public string Instance { get; set; } = string.Empty;
        
        [Key]
        [Column(Order = 1)]
        public DateTime HourBucket { get; set; }
        
        public int? HealthScore { get; set; }
    }

    /// <summary>
    /// Modelo para vw_HealthTendencias_7d_V2
    /// Tendencias diarias últimos 7 días
    /// </summary>
    [Table("vw_HealthTendencias_7d_V2", Schema = "dbo")]
    public class HealthTendencias7dV2
    {
        [Key]
        [Column(Order = 0)]
        public string Instance { get; set; } = string.Empty;
        
        [Key]
        [Column(Order = 1)]
        public DateTime DayBucket { get; set; }
        
        public int? HealthScore { get; set; }
    }

    /// <summary>
    /// Modelo para tabla dbo.HealthScoreAlertas
    /// </summary>
    [Table("HealthScoreAlertas", Schema = "dbo")]
    public class HealthScoreAlerta
    {
        [Key]
        public long AlertaID { get; set; }
        
        public string Instance { get; set; } = string.Empty;
        public string? EstadoAnterior { get; set; }
        public string EstadoNuevo { get; set; } = string.Empty;
        public int? HealthScoreAnterior { get; set; }
        public int HealthScoreNuevo { get; set; }
        public string? Causa { get; set; }
        public DateTime DetectadoAt { get; set; }
    }

    /// <summary>
    /// Modelo para logs de collectors
    /// </summary>
    [Table("CollectorLog", Schema = "dbo")]
    public class CollectorLog
    {
        [Key]
        public long LogID { get; set; }
        
        public string CollectorName { get; set; } = string.Empty;
        public string Instance { get; set; } = string.Empty;
        public string Level { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public DateTime LoggedAt { get; set; }
    }
}

