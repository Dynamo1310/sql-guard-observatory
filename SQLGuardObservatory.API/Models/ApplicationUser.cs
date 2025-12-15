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
}

