using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Exclusiones globales de servidores para alertas.
/// Cuando un servidor se da de baja (se apaga), se agrega aquí para que
/// no genere alertas de ningún tipo (servidores caídos, backups, discos, overview, etc.)
/// </summary>
[Table("ServerAlertExclusions", Schema = "dbo")]
public class ServerAlertExclusion
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// Nombre del servidor o instancia excluida
    /// </summary>
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    /// <summary>
    /// Motivo de la exclusión (opcional)
    /// </summary>
    [MaxLength(500)]
    public string? Reason { get; set; }
    
    /// <summary>
    /// Si la exclusión está activa
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Usuario que creó la exclusión
    /// </summary>
    [MaxLength(100)]
    public string? CreatedBy { get; set; }
    
    /// <summary>
    /// Fecha de expiración (opcional) - si es null, no expira
    /// </summary>
    public DateTime? ExpiresAtUtc { get; set; }
}
