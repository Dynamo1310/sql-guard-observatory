using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Entidad para almacenar servidores habilitados para operaciones controladas
/// (Reinicios, Failovers, Parcheos, etc.)
/// </summary>
public class OperationalServer
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre del servidor (ej: SQLPROD01)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    /// <summary>
    /// Nombre de instancia si aplica
    /// </summary>
    [MaxLength(256)]
    public string? InstanceName { get; set; }

    /// <summary>
    /// Descripción opcional del servidor
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Ambiente: Producción, Testing, Desarrollo
    /// </summary>
    [MaxLength(100)]
    public string? Ambiente { get; set; }

    /// <summary>
    /// Indica si el servidor viene del inventario o fue agregado manualmente
    /// </summary>
    public bool IsFromInventory { get; set; } = true;

    /// <summary>
    /// Indica si el servidor está habilitado para operaciones
    /// </summary>
    public bool Enabled { get; set; } = true;

    /// <summary>
    /// Habilitado para operaciones de reinicio
    /// </summary>
    public bool EnabledForRestart { get; set; } = true;

    /// <summary>
    /// Habilitado para operaciones de failover
    /// </summary>
    public bool EnabledForFailover { get; set; } = false;

    /// <summary>
    /// Habilitado para operaciones de parcheo
    /// </summary>
    public bool EnabledForPatching { get; set; } = false;

    public DateTime CreatedAt { get; set; } = DateTime.Now;

    [Required]
    [MaxLength(450)]
    public string CreatedByUserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? CreatedByUserName { get; set; }

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    [MaxLength(256)]
    public string? UpdatedByUserName { get; set; }

    /// <summary>
    /// Notas adicionales
    /// </summary>
    public string? Notes { get; set; }

    // Navegación
    [ForeignKey("CreatedByUserId")]
    public virtual ApplicationUser? CreatedByUser { get; set; }

    [ForeignKey("UpdatedByUserId")]
    public virtual ApplicationUser? UpdatedByUser { get; set; }
}

/// <summary>
/// Entidad para auditoría de cambios en servidores operacionales
/// </summary>
public class OperationalServerAudit
{
    [Key]
    public int Id { get; set; }

    public int OperationalServerId { get; set; }

    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    /// <summary>
    /// Acción realizada: Created, Updated, Deleted, Enabled, Disabled
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Action { get; set; } = string.Empty;

    public DateTime ChangedAt { get; set; } = DateTime.Now;

    [Required]
    [MaxLength(450)]
    public string ChangedByUserId { get; set; } = string.Empty;

    [MaxLength(256)]
    public string? ChangedByUserName { get; set; }

    /// <summary>
    /// JSON con valores anteriores
    /// </summary>
    public string? OldValues { get; set; }

    /// <summary>
    /// JSON con valores nuevos
    /// </summary>
    public string? NewValues { get; set; }

    // Navegación
    [ForeignKey("ChangedByUserId")]
    public virtual ApplicationUser? ChangedByUser { get; set; }
}

/// <summary>
/// Constantes para acciones de auditoría
/// </summary>
public static class OperationalServerAuditAction
{
    public const string Created = "Created";
    public const string Updated = "Updated";
    public const string Deleted = "Deleted";
    public const string Enabled = "Enabled";
    public const string Disabled = "Disabled";
}




