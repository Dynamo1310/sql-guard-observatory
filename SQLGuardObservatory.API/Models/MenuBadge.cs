using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Configuración de badges/indicadores para menús del sidebar
/// </summary>
public class MenuBadge
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Identificador único del menú (ej: "PatchingMenu", "OnCall", "VaultMenu")
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string MenuKey { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre para mostrar del menú
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string DisplayName { get; set; } = string.Empty;
    
    /// <summary>
    /// Indica si el badge "Nuevo" está activo
    /// </summary>
    public bool IsNew { get; set; } = false;
    
    /// <summary>
    /// Texto personalizado del badge (por defecto "Nuevo")
    /// </summary>
    [MaxLength(50)]
    public string? BadgeText { get; set; } = "Nuevo";
    
    /// <summary>
    /// Color del badge en formato CSS (ej: "green", "#10b981")
    /// </summary>
    [MaxLength(50)]
    public string? BadgeColor { get; set; } = "green";
    
    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Usuario que realizó la última actualización
    /// </summary>
    [MaxLength(100)]
    public string? UpdatedBy { get; set; }
}




