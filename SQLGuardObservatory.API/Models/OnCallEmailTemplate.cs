using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Template de email configurable para notificaciones de guardias.
/// </summary>
public class OnCallEmailTemplate
{
    public int Id { get; set; }
    
    /// <summary>
    /// Tipo de alerta al que aplica este template (ej: ScheduleGenerated, SwapRequested, etc.)
    /// </summary>
    public string AlertType { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre descriptivo del template.
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Asunto del email. Puede incluir placeholders como {{FechaInicio}}, {{FechaFin}}, etc.
    /// </summary>
    public string Subject { get; set; } = string.Empty;
    
    /// <summary>
    /// Cuerpo del email en HTML. Puede incluir placeholders.
    /// </summary>
    public string Body { get; set; } = string.Empty;
    
    /// <summary>
    /// Indica si se debe adjuntar el Excel del calendario generado (solo aplica para ScheduleGenerated).
    /// </summary>
    public bool AttachExcel { get; set; } = false;
    
    /// <summary>
    /// Indica si este template está activo.
    /// </summary>
    public bool IsEnabled { get; set; } = true;
    
    /// <summary>
    /// Indica si es el template por defecto del sistema (no se puede eliminar).
    /// </summary>
    public bool IsDefault { get; set; } = false;
    
    /// <summary>
    /// Indica si este template tiene envío programado (schedule).
    /// </summary>
    public bool IsScheduled { get; set; } = false;
    
    /// <summary>
    /// Expresión cron para el envío programado (ej: "0 12 * * 3" = miércoles 12:00).
    /// Solo aplica si IsScheduled = true.
    /// </summary>
    public string? ScheduleCron { get; set; }
    
    /// <summary>
    /// Descripción legible del schedule (ej: "Todos los miércoles a las 12:00").
    /// </summary>
    public string? ScheduleDescription { get; set; }
    
    /// <summary>
    /// Lista de emails destinatarios separados por punto y coma.
    /// Si está vacío, se usan los destinatarios de las reglas de alerta.
    /// </summary>
    public string? Recipients { get; set; }

    /// <summary>
    /// Link a la planilla de guardias de fin de semana (solo para PreWeekNotification).
    /// Se usa en el recordatorio del email "GUARDIA MAÑANA".
    /// </summary>
    public string? LinkPlanillaGuardias { get; set; }

    // Auditoría
    public string? CreatedByUserId { get; set; }
    public DateTime CreatedAt { get; set; } = LocalClockAR.Now;
    public string? UpdatedByUserId { get; set; }
    public DateTime? UpdatedAt { get; set; }
    
    // Navegación
    public ApplicationUser? CreatedByUser { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }
}

