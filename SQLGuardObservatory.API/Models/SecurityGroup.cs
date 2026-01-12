namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un grupo de seguridad para organizar usuarios por equipo/departamento.
/// Los grupos pueden tener permisos específicos que se combinan (aditivamente) con los permisos del rol del usuario.
/// </summary>
public class SecurityGroup
{
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre único del grupo (ej: "DBA Team", "Desarrollo", "QA")
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Descripción del propósito del grupo
    /// </summary>
    public string? Description { get; set; }
    
    /// <summary>
    /// Color en formato hexadecimal para identificar visualmente el grupo (ej: "#3b82f6")
    /// </summary>
    public string? Color { get; set; }
    
    /// <summary>
    /// Icono del grupo (nombre de Lucide icon)
    /// </summary>
    public string? Icon { get; set; }
    
    /// <summary>
    /// Indica si el grupo está activo. Los grupos inactivos no otorgan permisos.
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Indica si el grupo fue eliminado (soft delete)
    /// </summary>
    public bool IsDeleted { get; set; } = false;
    
    /// <summary>
    /// Fecha de creación del grupo
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Usuario que creó el grupo
    /// </summary>
    public string? CreatedByUserId { get; set; }
    public ApplicationUser? CreatedByUser { get; set; }
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
    
    /// <summary>
    /// Usuario que realizó la última actualización
    /// </summary>
    public string? UpdatedByUserId { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }
    
    // Navegación
    public ICollection<UserGroup> Members { get; set; } = new List<UserGroup>();
    public ICollection<GroupPermission> Permissions { get; set; } = new List<GroupPermission>();
    public ADGroupSync? ADSync { get; set; }
}




