using System.ComponentModel.DataAnnotations;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Tipos de acceso a credenciales
/// </summary>
public static class CredentialAccessTypes
{
    public const string Reveal = "Reveal";
    public const string UseForConnection = "UseForConnection";
    public const string CopyToClipboard = "CopyToClipboard";
    public const string Export = "Export";
}

/// <summary>
/// Resultados de acceso
/// </summary>
public static class AccessResults
{
    public const string Success = "Success";
    public const string Denied = "Denied";
    public const string Failed = "Failed";
}

/// <summary>
/// Registro de acceso a credenciales (alto volumen)
/// Tabla separada de CredentialAuditLog para mejor performance
/// </summary>
public class CredentialAccessLog
{
    public long Id { get; set; }
    
    /// <summary>
    /// ID de la credencial accedida
    /// </summary>
    public int CredentialId { get; set; }
    
    /// <summary>
    /// Tipo de acceso: Reveal, UseForConnection, CopyToClipboard
    /// </summary>
    [Required]
    [MaxLength(30)]
    public string AccessType { get; set; } = string.Empty;
    
    /// <summary>
    /// Resultado: Success, Denied, Failed
    /// </summary>
    [Required]
    [MaxLength(20)]
    public string AccessResult { get; set; } = AccessResults.Success;
    
    /// <summary>
    /// Razón de denegación (si aplica)
    /// </summary>
    [MaxLength(100)]
    public string? DenialReason { get; set; }
    
    /// <summary>
    /// Servidor destino (para UseForConnection)
    /// </summary>
    [MaxLength(256)]
    public string? TargetServerName { get; set; }
    
    /// <summary>
    /// Instancia destino (para UseForConnection)
    /// </summary>
    [MaxLength(256)]
    public string? TargetInstanceName { get; set; }
    
    /// <summary>
    /// Usuario que realizó el acceso
    /// </summary>
    [Required]
    [MaxLength(450)]
    public string UserId { get; set; } = string.Empty;
    
    /// <summary>
    /// Nombre del usuario (para historial)
    /// </summary>
    [MaxLength(256)]
    public string? UserName { get; set; }
    
    /// <summary>
    /// Fecha y hora del acceso (con timezone Argentina UTC-3)
    /// </summary>
    public DateTimeOffset AccessedAt { get; set; }
    
    /// <summary>
    /// IP del cliente
    /// </summary>
    [MaxLength(50)]
    public string? IpAddress { get; set; }
    
    /// <summary>
    /// User-Agent del cliente
    /// </summary>
    [MaxLength(500)]
    public string? UserAgent { get; set; }
    
    /// <summary>
    /// ID de sesión (para correlación)
    /// </summary>
    [MaxLength(100)]
    public string? SessionId { get; set; }
}

