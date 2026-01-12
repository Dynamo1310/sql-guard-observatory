using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Grupo de credenciales para organizar contraseñas
/// </summary>
public class CredentialGroup
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre del grupo
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Descripción del grupo
    /// </summary>
    [MaxLength(1000)]
    public string? Description { get; set; }

    /// <summary>
    /// Color del grupo para UI (formato hex: #RRGGBB)
    /// </summary>
    [MaxLength(7)]
    public string? Color { get; set; }

    /// <summary>
    /// Icono del grupo (nombre del icono de Lucide)
    /// </summary>
    [MaxLength(50)]
    public string? Icon { get; set; }

    /// <summary>
    /// Usuario propietario del grupo (quien lo creó)
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string OwnerUserId { get; set; } = string.Empty;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public DateTime? UpdatedAt { get; set; }

    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    public bool IsDeleted { get; set; } = false;

    // Navegación
    [ForeignKey("OwnerUserId")]
    public virtual ApplicationUser? Owner { get; set; }

    [ForeignKey("UpdatedByUserId")]
    public virtual ApplicationUser? UpdatedByUser { get; set; }

    /// <summary>
    /// Miembros que tienen acceso al grupo
    /// </summary>
    public virtual ICollection<CredentialGroupMember> Members { get; set; } = new List<CredentialGroupMember>();

    /// <summary>
    /// Credenciales en este grupo
    /// </summary>
    public virtual ICollection<Credential> Credentials { get; set; } = new List<Credential>();
}

/// <summary>
/// Miembro de un grupo de credenciales (define quién puede ver el grupo)
/// </summary>
public class CredentialGroupMember
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID del grupo
    /// </summary>
    public int GroupId { get; set; }

    /// <summary>
    /// ID del usuario miembro
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;

    /// <summary>
    /// Rol del miembro: Owner, Admin, Member
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string Role { get; set; } = "Member";

    /// <summary>
    /// Si el usuario recibe notificaciones de cambios en el grupo
    /// </summary>
    public bool ReceiveNotifications { get; set; } = true;

    public DateTime AddedAt { get; set; } = DateTime.UtcNow;

    [MaxLength(450)]
    public string? AddedByUserId { get; set; }

    // Navegación
    [ForeignKey("GroupId")]
    public virtual CredentialGroup? Group { get; set; }

    [ForeignKey("UserId")]
    public virtual ApplicationUser? User { get; set; }

    [ForeignKey("AddedByUserId")]
    public virtual ApplicationUser? AddedByUser { get; set; }
}

/// <summary>
/// Roles disponibles para miembros de grupos
/// Simplificado: Owner (implícito al crear), Admin y Member
/// </summary>
public static class CredentialGroupRoles
{
    /// <summary>
    /// Propietario del grupo - control total (asignado automáticamente al creador)
    /// </summary>
    public const string Owner = "Owner";
    
    /// <summary>
    /// Admin del grupo - puede agregar/eliminar miembros y credenciales
    /// </summary>
    public const string Admin = "Admin";
    
    /// <summary>
    /// Miembro - puede ver y revelar credenciales
    /// </summary>
    public const string Member = "Member";

    /// <summary>
    /// Roles válidos que pueden ser asignados (Owner es implícito)
    /// </summary>
    public static readonly string[] AssignableRoles = { Admin, Member };

    /// <summary>
    /// Todos los roles válidos incluyendo Owner
    /// </summary>
    public static readonly string[] AllRoles = { Owner, Admin, Member };

    /// <summary>
    /// Valida si un rol es válido para asignación manual
    /// </summary>
    public static bool IsValidAssignableRole(string role) => 
        role == Admin || role == Member;

    /// <summary>
    /// Valida si un rol es válido (incluyendo Owner)
    /// </summary>
    public static bool IsValidRole(string role) => 
        role == Owner || role == Admin || role == Member;

    public static bool CanManageMembers(string role) => 
        role == Owner || role == Admin;

    public static bool CanManageCredentials(string role) => 
        role == Owner || role == Admin || role == Member;

    public static bool CanRevealPasswords(string role) => 
        role == Owner || role == Admin || role == Member;
}

