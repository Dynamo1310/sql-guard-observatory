using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Relación muchos-a-muchos entre Credenciales y Servidores
/// </summary>
public class CredentialServer
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID de la credencial asociada
    /// </summary>
    public int CredentialId { get; set; }

    /// <summary>
    /// Nombre del servidor (ej: SQLPROD01)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string ServerName { get; set; } = string.Empty;

    /// <summary>
    /// Nombre de la instancia si aplica (ej: MSSQLSERVER, INST01)
    /// </summary>
    [MaxLength(256)]
    public string? InstanceName { get; set; }

    /// <summary>
    /// Propósito de la conexión (ej: "Conexión principal", "Backup", "Monitoreo")
    /// </summary>
    [MaxLength(256)]
    public string? ConnectionPurpose { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // Navegación
    [ForeignKey("CredentialId")]
    public virtual Credential? Credential { get; set; }
}

