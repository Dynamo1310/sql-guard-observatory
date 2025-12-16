using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad para almacenar tareas de reinicio de servidores SQL
/// </summary>
public class ServerRestartTask
{
    [Key]
    public int Id { get; set; }
    
    public Guid TaskId { get; set; } = Guid.NewGuid();
    
    /// <summary>
    /// JSON array con la lista de servidores a reiniciar
    /// </summary>
    [Required]
    public string Servers { get; set; } = "[]";
    
    /// <summary>
    /// Cantidad de servidores en la tarea
    /// </summary>
    public int ServerCount { get; set; }
    
    /// <summary>
    /// Estado de la tarea: Pending, Running, Completed, Failed, Cancelled
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "Pending";
    
    public DateTime StartedAt { get; set; } = DateTime.Now;
    
    public DateTime? CompletedAt { get; set; }
    
    [Required]
    [MaxLength(450)]
    public string InitiatedByUserId { get; set; } = string.Empty;
    
    [MaxLength(256)]
    public string? InitiatedByUserName { get; set; }
    
    /// <summary>
    /// Log completo del output del script
    /// </summary>
    public string? OutputLog { get; set; }
    
    /// <summary>
    /// Resumen JSON con resultados por servidor
    /// </summary>
    public string? Summary { get; set; }
    
    public string? ErrorMessage { get; set; }
    
    /// <summary>
    /// Cantidad de servidores reiniciados exitosamente
    /// </summary>
    public int SuccessCount { get; set; }
    
    /// <summary>
    /// Cantidad de servidores con error
    /// </summary>
    public int FailureCount { get; set; }
    
    /// <summary>
    /// PID del proceso PowerShell para poder cancelarlo
    /// </summary>
    public int? ProcessId { get; set; }
    
    // Navegación
    [ForeignKey("InitiatedByUserId")]
    public virtual ApplicationUser? InitiatedByUser { get; set; }
    
    public virtual ICollection<ServerRestartDetail> Details { get; set; } = new List<ServerRestartDetail>();
}

/// <summary>
/// Detalle de reinicio por servidor individual
/// </summary>
public class ServerRestartDetail
{
    [Key]
    public int Id { get; set; }
    
    public int TaskId { get; set; }
    
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;
    
    /// <summary>
    /// Estado: Pending, Restarting, Success, Failed, Skipped
    /// </summary>
    [MaxLength(50)]
    public string Status { get; set; } = "Pending";
    
    public DateTime? StartedAt { get; set; }
    
    public DateTime? CompletedAt { get; set; }
    
    public string? ErrorMessage { get; set; }
    
    // Resultados específicos del script
    [MaxLength(50)]
    public string? RestartResult { get; set; }
    
    [MaxLength(50)]
    public string? PingResult { get; set; }
    
    [MaxLength(50)]
    public string? ServicioOSResult { get; set; }
    
    [MaxLength(50)]
    public string? DiscosResult { get; set; }
    
    [MaxLength(50)]
    public string? ServicioMSSQLSERVERResult { get; set; }
    
    [MaxLength(50)]
    public string? ServicioSQLSERVERAGENTResult { get; set; }
    
    // Navegación
    [ForeignKey("TaskId")]
    public virtual ServerRestartTask? Task { get; set; }
}

/// <summary>
/// Estados posibles de una tarea de reinicio
/// </summary>
public static class RestartTaskStatus
{
    public const string Pending = "Pending";
    public const string Running = "Running";
    public const string Completed = "Completed";
    public const string Failed = "Failed";
    public const string Cancelled = "Cancelled";
}

/// <summary>
/// Estados posibles para un servidor individual
/// </summary>
public static class RestartServerStatus
{
    public const string Pending = "Pending";
    public const string Restarting = "Restarting";
    public const string Success = "Success";
    public const string Failed = "Failed";
    public const string Skipped = "Skipped";
}

