namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Define qué roles puede asignar un rol específico.
/// Esto permite control granular sobre la delegación de roles.
/// Por ejemplo: un "User Manager" puede asignar "Reader" pero no "Admin".
/// </summary>
public class AdminRoleAssignableRole
{
    public int Id { get; set; }

    /// <summary>
    /// ID del rol que tiene el permiso de asignar
    /// </summary>
    public int RoleId { get; set; }
    public AdminRole Role { get; set; } = null!;

    /// <summary>
    /// ID del rol que puede ser asignado por el rol padre
    /// </summary>
    public int AssignableRoleId { get; set; }
    public AdminRole AssignableRole { get; set; } = null!;
}




