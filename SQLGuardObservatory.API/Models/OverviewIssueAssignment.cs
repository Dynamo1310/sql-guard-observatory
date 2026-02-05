using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una asignación de un problema del Overview a un usuario del grupo IDD
/// </summary>
[Table("OverviewIssueAssignments")]
public class OverviewIssueAssignment
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Tipo de problema: 'Backup', 'Disk', 'Maintenance'
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string IssueType { get; set; } = "";
    
    /// <summary>
    /// Nombre de la instancia con el problema
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string InstanceName { get; set; } = "";
    
    /// <summary>
    /// Identificador adicional: Drive para discos (ej: "C:"), Tipo para mantenimiento (ej: "CHECKDB")
    /// </summary>
    [MaxLength(100)]
    public string? DriveOrTipo { get; set; }
    
    /// <summary>
    /// Usuario al que se asignó el problema
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string AssignedToUserId { get; set; } = "";
    
    [ForeignKey(nameof(AssignedToUserId))]
    public virtual ApplicationUser? AssignedToUser { get; set; }
    
    /// <summary>
    /// Usuario que realizó la asignación
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string AssignedByUserId { get; set; } = "";
    
    [ForeignKey(nameof(AssignedByUserId))]
    public virtual ApplicationUser? AssignedByUser { get; set; }
    
    /// <summary>
    /// Fecha/hora de la asignación
    /// </summary>
    public DateTime AssignedAt { get; set; } = LocalClockAR.Now;
    
    /// <summary>
    /// Fecha/hora en que se resolvió el problema (null = activo)
    /// </summary>
    public DateTime? ResolvedAt { get; set; }
    
    /// <summary>
    /// Notas opcionales sobre la asignación
    /// </summary>
    [MaxLength(500)]
    public string? Notes { get; set; }
}
