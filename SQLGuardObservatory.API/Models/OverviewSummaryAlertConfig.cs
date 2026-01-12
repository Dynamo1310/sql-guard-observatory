using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración principal de la alerta de resumen Overview
/// </summary>
[Table("OverviewSummaryAlertConfig")]
public class OverviewSummaryAlertConfig
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "Alerta Resumen Overview";
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsEnabled { get; set; } = false;
    
    /// <summary>
    /// Lista de emails separados por coma
    /// </summary>
    [MaxLength(2000)]
    public string Recipients { get; set; } = "";
    
    /// <summary>
    /// Si es true, solo incluye datos de Producción en el resumen
    /// </summary>
    public bool IncludeOnlyProduction { get; set; } = true;
    
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    
    public DateTime? UpdatedAt { get; set; }
    
    [MaxLength(100)]
    public string? UpdatedBy { get; set; }
    
    [MaxLength(200)]
    public string? UpdatedByDisplayName { get; set; }
    
    // Navigation property
    public virtual ICollection<OverviewSummaryAlertSchedule> Schedules { get; set; } = new List<OverviewSummaryAlertSchedule>();
}

/// <summary>
/// Horarios programados para enviar el resumen
/// </summary>
[Table("OverviewSummaryAlertSchedule")]
public class OverviewSummaryAlertSchedule
{
    [Key]
    public int Id { get; set; }
    
    public int ConfigId { get; set; }
    
    /// <summary>
    /// Hora del día para enviar el resumen (ej: 08:00, 14:00, 20:00)
    /// </summary>
    public TimeSpan TimeOfDay { get; set; }
    
    public bool IsEnabled { get; set; } = true;
    
    /// <summary>
    /// Días de la semana separados por coma (0=Domingo, 1=Lunes, ..., 6=Sábado)
    /// Ejemplo: "1,2,3,4,5" = Lunes a Viernes
    /// </summary>
    [MaxLength(20)]
    public string DaysOfWeek { get; set; } = "1,2,3,4,5";
    
    /// <summary>
    /// Última vez que se envió el resumen para este schedule
    /// </summary>
    public DateTime? LastSentAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    
    // Navigation property
    [ForeignKey("ConfigId")]
    public virtual OverviewSummaryAlertConfig? Config { get; set; }
}

/// <summary>
/// Historial de alertas de resumen enviadas
/// </summary>
[Table("OverviewSummaryAlertHistory")]
public class OverviewSummaryAlertHistory
{
    [Key]
    public int Id { get; set; }
    
    public int ConfigId { get; set; }
    
    /// <summary>
    /// ID del schedule que disparó el envío (null si fue manual o prueba)
    /// </summary>
    public int? ScheduleId { get; set; }
    
    public DateTime SentAt { get; set; } = DateTime.Now;
    
    public int RecipientCount { get; set; }
    
    public bool Success { get; set; }
    
    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// JSON con los datos del resumen enviado para referencia
    /// </summary>
    public string? SummaryData { get; set; }
    
    /// <summary>
    /// Tipo de trigger: Scheduled, Manual, Test
    /// </summary>
    [MaxLength(50)]
    public string TriggerType { get; set; } = "Scheduled";
    
    // Navigation properties
    [ForeignKey("ConfigId")]
    public virtual OverviewSummaryAlertConfig? Config { get; set; }
    
    [ForeignKey("ScheduleId")]
    public virtual OverviewSummaryAlertSchedule? Schedule { get; set; }
}




