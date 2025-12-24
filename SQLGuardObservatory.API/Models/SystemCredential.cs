using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Credencial de sistema utilizada por la aplicación para conectarse a servidores SQL
/// </summary>
public class SystemCredential
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// Nombre descriptivo de la credencial (ej: "AWS SQL Auth", "Producción Windows")
    /// </summary>
    [Required]
    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Descripción opcional
    /// </summary>
    [MaxLength(500)]
    public string? Description { get; set; }

    /// <summary>
    /// Nombre de usuario SQL o Windows
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string Username { get; set; } = string.Empty;

    /// <summary>
    /// Dominio para Windows Authentication (opcional)
    /// </summary>
    [MaxLength(256)]
    public string? Domain { get; set; }

    /// <summary>
    /// Password cifrado con AES-256-GCM (Enterprise)
    /// </summary>
    public byte[]? EncryptedPassword { get; set; }

    /// <summary>
    /// Salt para el cifrado
    /// </summary>
    public byte[]? Salt { get; set; }

    /// <summary>
    /// Vector de inicialización para AES-GCM
    /// </summary>
    public byte[]? IV { get; set; }

    /// <summary>
    /// Tag de autenticación AES-GCM
    /// </summary>
    public byte[]? AuthTag { get; set; }

    /// <summary>
    /// ID de la clave de cifrado
    /// </summary>
    public Guid? KeyId { get; set; }

    /// <summary>
    /// Versión de la clave de cifrado
    /// </summary>
    public int KeyVersion { get; set; } = 1;

    /// <summary>
    /// Si la credencial está activa
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Fecha de última actualización
    /// </summary>
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// Usuario que creó la credencial
    /// </summary>
    [MaxLength(450)]
    public string? CreatedByUserId { get; set; }

    /// <summary>
    /// Usuario que actualizó la credencial por última vez
    /// </summary>
    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }

    // Navegación
    [ForeignKey("CreatedByUserId")]
    public virtual ApplicationUser? CreatedByUser { get; set; }

    [ForeignKey("UpdatedByUserId")]
    public virtual ApplicationUser? UpdatedByUser { get; set; }

    /// <summary>
    /// Asignaciones de esta credencial a servidores/grupos
    /// </summary>
    public virtual ICollection<SystemCredentialAssignment> Assignments { get; set; } = new List<SystemCredentialAssignment>();
}

/// <summary>
/// Asignación de una credencial de sistema a un servidor, grupo o patrón
/// </summary>
public class SystemCredentialAssignment
{
    [Key]
    public int Id { get; set; }

    /// <summary>
    /// ID de la credencial
    /// </summary>
    public int SystemCredentialId { get; set; }

    /// <summary>
    /// Tipo de asignación: Server, HostingSite, Environment, Pattern
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string AssignmentType { get; set; } = string.Empty;

    /// <summary>
    /// Valor de la asignación según el tipo:
    /// - Server: "SQLPROD01\INST01"
    /// - HostingSite: "AWS", "OnPremise", "DMZ"
    /// - Environment: "Produccion", "Testing", "Desarrollo"
    /// - Pattern: ".*AWS.*" (regex)
    /// </summary>
    [Required]
    [MaxLength(256)]
    public string AssignmentValue { get; set; } = string.Empty;

    /// <summary>
    /// Prioridad de la asignación (menor = mayor prioridad)
    /// </summary>
    public int Priority { get; set; } = 100;

    /// <summary>
    /// Fecha de creación
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>
    /// Usuario que creó la asignación
    /// </summary>
    [MaxLength(450)]
    public string? CreatedByUserId { get; set; }

    // Navegación
    [ForeignKey("SystemCredentialId")]
    public virtual SystemCredential? SystemCredential { get; set; }

    [ForeignKey("CreatedByUserId")]
    public virtual ApplicationUser? CreatedByUser { get; set; }
}

/// <summary>
/// Tipos de asignación de credenciales de sistema
/// </summary>
public static class SystemCredentialAssignmentTypes
{
    /// <summary>
    /// Asignación a un servidor específico (ej: "SQLPROD01\INST01")
    /// </summary>
    public const string Server = "Server";

    /// <summary>
    /// Asignación por hosting site (ej: "AWS", "OnPremise")
    /// </summary>
    public const string HostingSite = "HostingSite";

    /// <summary>
    /// Asignación por ambiente (ej: "Produccion", "Testing")
    /// </summary>
    public const string Environment = "Environment";

    /// <summary>
    /// Asignación por patrón regex (ej: ".*AWS.*")
    /// </summary>
    public const string Pattern = "Pattern";
}

