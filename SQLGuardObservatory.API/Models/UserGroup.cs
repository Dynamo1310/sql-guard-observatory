namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Representa la membresía de un usuario en un grupo de seguridad.
/// Un usuario puede pertenecer a múltiples grupos.
/// </summary>
public class UserGroup
{
    public int Id { get; set; }
    
    /// <summary>
    /// ID del usuario (ApplicationUser)
    /// </summary>
    public string UserId { get; set; } = string.Empty;
    public ApplicationUser? User { get; set; }
    
    /// <summary>
    /// ID del grupo de seguridad
    /// </summary>
    public int GroupId { get; set; }
    public SecurityGroup? Group { get; set; }
    
    /// <summary>
    /// Fecha en que el usuario fue agregado al grupo
    /// </summary>
    public DateTime AddedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Usuario que agregó a este miembro al grupo
    /// </summary>
    public string? AddedByUserId { get; set; }
    public ApplicationUser? AddedByUser { get; set; }
}

