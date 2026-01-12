namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa un permiso asignado a un grupo de seguridad.
/// Los permisos del grupo se combinan aditivamente con los permisos del rol del usuario.
/// </summary>
public class GroupPermission
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID del grupo al que pertenece este permiso
    /// </summary>
    public int GroupId { get; set; }
    public SecurityGroup? Group { get; set; }
    
    /// <summary>
    /// Nombre de la vista/permiso (ej: "Overview", "Jobs", "Backups")
    /// </summary>
    public string ViewName { get; set; } = string.Empty;
    
    /// <summary>
    /// Indica si el permiso está habilitado para este grupo
    /// </summary>
    public bool Enabled { get; set; } = true;
    
    /// <summary>
    /// Fecha de creación del permiso
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
}




