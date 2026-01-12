using SQLGuardObservatory.API.Helpers;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Categoría configurable para activaciones de guardia.
/// </summary>
public class OnCallActivationCategory
{
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre de la categoría (ej: "Backups", "Conectividad", "Rendimiento").
    /// </summary>
    public string Name { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre del ícono Lucide a usar (ej: "Database", "Wifi", "Zap").
    /// </summary>
    public string? Icon { get; set; }
    
    /// <summary>
    /// Indica si es una categoría por defecto del sistema.
    /// </summary>
    public bool IsDefault { get; set; } = false;
    
    /// <summary>
    /// Indica si la categoría está activa.
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Orden de visualización.
    /// </summary>
    public int Order { get; set; }
    
    // Auditoría
    public DateTime CreatedAt { get; set; } = LocalClockAR.Now;
    public string? CreatedByUserId { get; set; }
    
    // Navegación
    public ApplicationUser? CreatedByUser { get; set; }
}

