using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

[Table("ProductionAlertConfig")]
public class ProductionAlertConfig
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string Name { get; set; } = "Alerta de Servidores Caídos";
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool IsEnabled { get; set; } = false;
    
    /// <summary>
    /// Intervalo en minutos para verificar conexiones (default: 1 minuto)
    /// </summary>
    public int CheckIntervalMinutes { get; set; } = 1;
    
    /// <summary>
    /// Intervalo en minutos para enviar alertas si sigue caído (default: 15 minutos)
    /// </summary>
    public int AlertIntervalMinutes { get; set; } = 15;
    
    /// <summary>
    /// Cantidad de chequeos fallidos consecutivos requeridos antes de enviar la primera alerta (default: 1)
    /// Esto evita falsos positivos por micro cortes de red
    /// </summary>
    public int FailedChecksBeforeAlert { get; set; } = 1;
    
    /// <summary>
    /// Lista de emails separados por coma
    /// </summary>
    [MaxLength(2000)]
    public string Recipients { get; set; } = "";
    
    /// <summary>
    /// Ambientes a monitorear separados por coma (Produccion,Desarrollo,Testing)
    /// </summary>
    [MaxLength(200)]
    public string Ambientes { get; set; } = "Produccion";
    
    public DateTime? LastRunAt { get; set; }
    
    public DateTime? LastAlertSentAt { get; set; }
    
    public DateTime CreatedAt { get; set; } = DateTime.Now;
    
    public DateTime? UpdatedAt { get; set; }
    
    [MaxLength(100)]
    public string? UpdatedBy { get; set; }
    
    [MaxLength(200)]
    public string? UpdatedByDisplayName { get; set; }
}

[Table("ProductionAlertHistory")]
public class ProductionAlertHistory
{
    [Key]
    public int Id { get; set; }
    
    public int ConfigId { get; set; }
    
    public DateTime SentAt { get; set; } = DateTime.Now;
    
    public int RecipientCount { get; set; }
    
    /// <summary>
    /// Lista de instancias caídas separadas por coma
    /// </summary>
    [MaxLength(4000)]
    public string InstancesDown { get; set; } = "";
    
    public bool Success { get; set; }
    
    [MaxLength(1000)]
    public string? ErrorMessage { get; set; }
}

[Table("ProductionInstanceStatus")]
public class ProductionInstanceStatus
{
    [Key]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(200)]
    public string InstanceName { get; set; } = "";
    
    [MaxLength(200)]
    public string? ServerName { get; set; }
    
    [MaxLength(100)]
    public string? Ambiente { get; set; }
    
    [MaxLength(100)]
    public string? HostingSite { get; set; }
    
    public bool IsConnected { get; set; } = true;
    
    public DateTime? LastCheckedAt { get; set; }
    
    [MaxLength(1000)]
    public string? LastError { get; set; }
    
    public DateTime? DownSince { get; set; }
    
    /// <summary>
    /// Última vez que se envió alerta por esta instancia
    /// </summary>
    public DateTime? LastAlertSentAt { get; set; }
    
    /// <summary>
    /// Contador de chequeos fallidos consecutivos para esta instancia
    /// </summary>
    public int ConsecutiveFailures { get; set; } = 0;
}

