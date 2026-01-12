using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un rol administrativo personalizable en el sistema.
/// Los roles definen qué capacidades administrativas tienen los usuarios.
/// Modelo estilo Google Workspace / Azure AD.
/// </summary>
public class AdminRole
{
    public int Id { get; set; }

    /// <summary>
    /// Nombre del rol (ej: "SuperAdmin", "User Manager", "Group Admin")
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Descripción del rol y sus responsabilidades
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Color para mostrar en la UI (hex, ej: "#8b5cf6")
    /// </summary>
    [MaxLength(20)]
    public string Color { get; set; } = "#6b7280";

    /// <summary>
    /// Icono del rol (nombre de Lucide icon)
    /// </summary>
    [MaxLength(50)]
    public string Icon { get; set; } = "Shield";

    /// <summary>
    /// Prioridad del rol. Mayor número = más privilegios.
    /// Se usa para determinar qué roles puede asignar un usuario.
    /// Un usuario solo puede asignar roles con prioridad menor o igual a la suya.
    /// </summary>
    public int Priority { get; set; } = 0;

    /// <summary>
    /// Indica si es un rol de sistema (no se puede eliminar ni renombrar)
    /// Los roles SuperAdmin, Admin y Reader son de sistema.
    /// </summary>
    public bool IsSystem { get; set; } = false;

    /// <summary>
    /// Indica si el rol está activo y puede ser asignado
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Usuario que creó el rol
    /// </summary>
    public string? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }

    /// <summary>
    /// Usuario que actualizó el rol por última vez
    /// </summary>
    public string? UpdatedByUserId { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }

    // Navegación
    public ICollection<AdminRoleCapability> Capabilities { get; set; } = new List<AdminRoleCapability>();
    public ICollection<AdminRoleAssignableRole> AssignableRoles { get; set; } = new List<AdminRoleAssignableRole>();
    public ICollection<ApplicationUser> Users { get; set; } = new List<ApplicationUser>();
}




