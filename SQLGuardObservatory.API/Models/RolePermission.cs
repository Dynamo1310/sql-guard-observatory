using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

public class RolePermission
{
    [Key]
    public int Id { get; set; }

    [Required]
    [MaxLength(50)]
    public string Role { get; set; } = string.Empty;

    [Required]
    [MaxLength(50)]
    public string ViewName { get; set; } = string.Empty;

    public bool Enabled { get; set; } = true;

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }
}

