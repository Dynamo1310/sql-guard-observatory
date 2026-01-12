using Microsoft.AspNetCore.Identity;

namespace SQLGuardObservatory.API.Models;

public class ApplicationUser : IdentityUser
{
    public string? DomainUser { get; set; }
    public string? DisplayName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Indica si el usuario es guardia de escalamiento.
    /// Los usuarios de escalamiento pueden modificar cualquier guardia sin límite de tiempo.
    /// </summary>
    public bool IsOnCallEscalation { get; set; } = false;

    /// <summary>
    /// Orden de prioridad del usuario en la lista de escalamiento.
    /// </summary>
    public int? EscalationOrder { get; set; }

    /// <summary>
    /// ID del rol administrativo asignado al usuario.
    /// Define las capacidades administrativas del usuario.
    /// </summary>
    public int? AdminRoleId { get; set; }
    public AdminRole? AdminRole { get; set; }

    // =============================================
    // Foto de Perfil
    // =============================================

    /// <summary>
    /// Foto de perfil del usuario almacenada como bytes (obtenida de AD thumbnailPhoto).
    /// Límite recomendado: 100KB.
    /// </summary>
    public byte[]? ProfilePhoto { get; set; }

    /// <summary>
    /// Fecha de la última actualización de la foto de perfil.
    /// </summary>
    public DateTime? ProfilePhotoUpdatedAt { get; set; }

    /// <summary>
    /// Origen de la foto de perfil: AD (Active Directory), Manual, o None.
    /// </summary>
    public string? ProfilePhotoSource { get; set; } = "None";

    // =============================================
    // Última Conexión
    // =============================================

    /// <summary>
    /// Fecha y hora de la última conexión del usuario.
    /// </summary>
    public DateTime? LastLoginAt { get; set; }
}

