using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad para almacenar la planificación de parcheos de servidores
/// </summary>
public class PatchPlan
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre del servidor a parchear
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    /// <summary>
    /// Nombre de la instancia (opcional)
    /// </summary>
    [MaxLength(256)]
    public string? InstanceName { get; set; }

    /// <summary>
    /// Versión actual del servidor
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string CurrentVersion { get; set; } = string.Empty;

    /// <summary>
    /// Versión objetivo a la que se parcheará
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string TargetVersion { get; set; } = string.Empty;

    /// <summary>
    /// Indica si el parcheo está coordinado con el Product Owner
    /// </summary>
    public bool IsCoordinated { get; set; } = false;

    /// <summary>
    /// Nota del Product Owner con el que se coordinó
    /// </summary>
    [MaxLength(500)]
    public string? ProductOwnerNote { get; set; }

    /// <summary>
    /// Fecha programada para el parcheo
    /// </summary>
    public DateTime ScheduledDate { get; set; }

    /// <summary>
    /// Hora de inicio de la ventana de parcheo
    /// </summary>
    public TimeSpan WindowStartTime { get; set; }

    /// <summary>
    /// Hora de fin de la ventana de parcheo
    /// </summary>
    public TimeSpan WindowEndTime { get; set; }

    /// <summary>
    /// ID del DBA asignado para realizar el parcheo
    /// </summary>
    [MaxLength(450)]
    public string? AssignedDbaId { get; set; }

    /// <summary>
    /// Nombre del DBA asignado (para mostrar sin necesidad de join)
    /// </summary>
    [MaxLength(256)]
    public string? AssignedDbaName { get; set; }

    /// <summary>
    /// Estado del parcheo: null = pendiente, true = parcheado, false = no parcheado/falló
    /// </summary>
    public bool? WasPatched { get; set; }

    /// <summary>
    /// Fecha y hora real cuando se realizó el parcheo
    /// </summary>
    public DateTime? PatchedAt { get; set; }

    /// <summary>
    /// Usuario que marcó el parcheo como completado
    /// </summary>
    [MaxLength(450)]
    public string? PatchedByUserId { get; set; }

    /// <summary>
    /// Notas adicionales sobre el parcheo
    /// </summary>
    public string? Notes { get; set; }

    /// <summary>
    /// Usuario que creó el plan
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    /// <summary>
    /// Nombre del usuario que creó el plan
    /// </summary>
    [MaxLength(256)]
    public string? CreatedByUserName { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Usuario que actualizó el plan
    /// </summary>
    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    // ============================================
    // Nuevos campos para sistema mejorado de parcheos
    // ============================================

    /// <summary>
    /// Estado granular del plan de parcheo
    /// </summary>
    [MaxLength(50)]
    public string Status { get; set; } = PatchPlanStatus.Planificado;

    /// <summary>
    /// Modo de parcheo: Manual, Automatico, ManualNova
    /// </summary>
    [MaxLength(50)]
    public string PatchMode { get; set; } = PatchModeType.Manual;

    /// <summary>
    /// ID del owner con quien se coordina el parcheo
    /// </summary>
    [MaxLength(450)]
    public string? CoordinationOwnerId { get; set; }

    /// <summary>
    /// Nombre del owner de coordinación
    /// </summary>
    [MaxLength(256)]
    public string? CoordinationOwnerName { get; set; }

    /// <summary>
    /// Email del owner de coordinación
    /// </summary>
    [MaxLength(256)]
    public string? CoordinationOwnerEmail { get; set; }

    /// <summary>
    /// Célula/equipo responsable
    /// </summary>
    [MaxLength(100)]
    public string? CellTeam { get; set; }

    /// <summary>
    /// Duración estimada del parcheo en minutos
    /// </summary>
    public int? EstimatedDuration { get; set; }

    /// <summary>
    /// Prioridad del parcheo: Alta, Media, Baja
    /// </summary>
    [MaxLength(20)]
    public string? Priority { get; set; }

    /// <summary>
    /// Nombre del cluster (para validación de conflictos)
    /// </summary>
    [MaxLength(256)]
    public string? ClusterName { get; set; }

    /// <summary>
    /// Indica si el servidor es AlwaysOn
    /// </summary>
    public bool IsAlwaysOn { get; set; } = false;

    /// <summary>
    /// Ambiente del servidor
    /// </summary>
    [MaxLength(50)]
    public string? Ambiente { get; set; }

    /// <summary>
    /// Fecha/hora cuando se contactó al owner
    /// </summary>
    public DateTime? ContactedAt { get; set; }

    /// <summary>
    /// Fecha/hora cuando se recibió respuesta del owner
    /// </summary>
    public DateTime? ResponseReceivedAt { get; set; }

    /// <summary>
    /// Contador de veces que se ha reprogramado
    /// </summary>
    public int RescheduledCount { get; set; } = 0;

    /// <summary>
    /// Razón del waiver si aplica
    /// </summary>
    [MaxLength(500)]
    public string? WaiverReason { get; set; }

    // Navegación
    [ForeignKey("AssignedDbaId")]
    public virtual ApplicationUser? AssignedDba { get; set; }

    [ForeignKey("CreatedByUserId")]
    public virtual ApplicationUser? CreatedByUser { get; set; }

    [ForeignKey("PatchedByUserId")]
    public virtual ApplicationUser? PatchedByUser { get; set; }
}

/// <summary>
/// Estados posibles de un plan de parcheo
/// </summary>
public static class PatchPlanStatus
{
    public const string Planificado = "Planificado";
    public const string EnCoordinacion = "EnCoordinacion";
    public const string SinRespuesta = "SinRespuesta";
    public const string Aprobado = "Aprobado";
    public const string EnProceso = "EnProceso";
    public const string Parcheado = "Parcheado";
    public const string Fallido = "Fallido";
    public const string Cancelado = "Cancelado";
    public const string Reprogramado = "Reprogramado";
    
    // Backwards compatibility
    public const string Pending = "Planificado";
    public const string Patched = "Parcheado";
    public const string Failed = "Fallido";
    
    public static string GetStatus(bool? wasPatched)
    {
        return wasPatched switch
        {
            null => Planificado,
            true => Parcheado,
            false => Fallido
        };
    }

    public static readonly string[] AllStatuses = new[]
    {
        Planificado, EnCoordinacion, SinRespuesta, Aprobado, 
        EnProceso, Parcheado, Fallido, Cancelado, Reprogramado
    };

    public static readonly string[] ActiveStatuses = new[]
    {
        Planificado, EnCoordinacion, SinRespuesta, Aprobado, EnProceso
    };

    public static readonly string[] CompletedStatuses = new[]
    {
        Parcheado, Fallido, Cancelado
    };
}

/// <summary>
/// Modos de parcheo disponibles
/// </summary>
public static class PatchModeType
{
    public const string Manual = "Manual";
    public const string Automatico = "Automatico";
    public const string ManualNova = "ManualNova";

    public static readonly string[] AllModes = new[] { Manual, Automatico, ManualNova };
}

/// <summary>
/// Prioridades de parcheo
/// </summary>
public static class PatchPriority
{
    public const string Alta = "Alta";
    public const string Media = "Media";
    public const string Baja = "Baja";

    public static readonly string[] AllPriorities = new[] { Alta, Media, Baja };
}
