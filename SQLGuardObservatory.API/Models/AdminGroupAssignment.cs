namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa una asignación que permite a un usuario Admin gestionar un grupo de seguridad específico.
/// Solo los usuarios con rol SuperAdmin pueden crear/modificar estas asignaciones.
/// </summary>
public class AdminGroupAssignment
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID del usuario Admin que recibe la asignación
    /// </summary>
    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }
    
    /// <summary>
    /// ID del grupo que puede administrar
    /// </summary>
    public int GroupId { get; set; }
    public SecurityGroup? Group { get; set; }
    
    /// <summary>
    /// Puede editar el grupo (nombre, descripción, color, etc.)
    /// </summary>
    public bool CanEdit { get; set; } = true;
    
    /// <summary>
    /// Puede eliminar el grupo
    /// </summary>
    public bool CanDelete { get; set; } = false;
    
    /// <summary>
    /// Puede agregar/quitar miembros del grupo
    /// </summary>
    public bool CanManageMembers { get; set; } = true;
    
    /// <summary>
    /// Puede modificar los permisos de vistas del grupo
    /// </summary>
    public bool CanManagePermissions { get; set; } = true;
    
    /// <summary>
    /// ID del SuperAdmin que creó esta asignación
    /// </summary>
    public string? AssignedByUserId { get; set; }
    public ApplicationUser? AssignedByUser { get; set; }
    
    /// <summary>
    /// Fecha de creación de la asignación
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }
    
    /// <summary>
    /// Usuario que realizó la última actualización
    /// </summary>
    public string? UpdatedByUserId { get; set; }
    public ApplicationUser? UpdatedByUser { get; set; }
}




