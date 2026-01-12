using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un lote de generación de calendario de guardias.
/// Permite gestionar la aprobación de calendarios generados.
/// </summary>
public class OnCallScheduleBatch
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Fecha de inicio del calendario generado
    /// </summary>
    public DateTime StartDate { get; set; }

    /// <summary>
    /// Fecha de fin del calendario generado
    /// </summary>
    public DateTime EndDate { get; set; }

    /// <summary>
    /// Número de semanas generadas
    /// </summary>
    public int WeeksGenerated { get; set; }

    /// <summary>
    /// Estado del lote: PendingApproval, Approved, Rejected
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Status { get; set; } = "Approved"; // Por defecto aprobado (si no requiere aprobación)

    /// <summary>
    /// Usuario que generó el calendario
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string GeneratedByUserId { get; set; } = string.Empty;

    [ForeignKey(nameof(GeneratedByUserId))]
    public virtual ApplicationUser GeneratedByUser { get; set; } = null!;

    public DateTime GeneratedAt { get; set; } = LocalClockAR.Now;

    /// <summary>
    /// Usuario aprobador asignado (si requiere aprobación)
    /// </summary>
    [MaxLength(450)]
    public string? ApproverUserId { get; set; }

    [ForeignKey(nameof(ApproverUserId))]
    public virtual ApplicationUser? ApproverUser { get; set; }

    /// <summary>
    /// Fecha de aprobación/rechazo
    /// </summary>
    public DateTime? ApprovedAt { get; set; }

    /// <summary>
    /// Usuario que aprobó/rechazó
    /// </summary>
    [MaxLength(450)]
    public string? ApprovedByUserId { get; set; }

    [ForeignKey(nameof(ApprovedByUserId))]
    public virtual ApplicationUser? ApprovedByUser { get; set; }

    /// <summary>
    /// Motivo del rechazo (si aplica)
    /// </summary>
    [MaxLength(500)]
    public string? RejectionReason { get; set; }

    /// <summary>
    /// Plan de generación en formato JSON (UserIds de operadores en orden de rotación).
    /// Se usa para crear las guardias cuando se aprueba el calendario.
    /// </summary>
    public string? SchedulePlan { get; set; }
}

/// <summary>
/// Estados posibles de un lote de calendario
/// </summary>
public static class ScheduleBatchStatus
{
    public const string PendingApproval = "PendingApproval";
    public const string Approved = "Approved";
    public const string Rejected = "Rejected";
}

/// <summary>
/// Representa el plan de generación de guardias (para almacenar en JSON)
/// </summary>
public class SchedulePlanData
{
    /// <summary>
    /// Lista de UserIds de operadores en orden de rotación
    /// </summary>
    public List<string> OperatorUserIds { get; set; } = new();
    
    /// <summary>
    /// Índice del operador inicial (para continuar la rotación)
    /// </summary>
    public int StartingOperatorIndex { get; set; }
}



