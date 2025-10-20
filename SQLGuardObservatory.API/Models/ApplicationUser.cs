using Microsoft.AspNetCore.Identity;

namespace SQLGuardObservatory.API.Models;

public class ApplicationUser : IdentityUser
{
    public string? DomainUser { get; set; }
    public string? DisplayName { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

