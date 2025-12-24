namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para registrar accesos a credenciales (Vault Enterprise v2.1.1)
/// AccessLog registra accesos al secreto - SIEMPRE, incluso denegados
/// Soporta tanto credenciales del Vault como credenciales de sistema
/// </summary>
public interface ICredentialAccessLogService
{
    // ==================== Vault Credentials ====================
    
    /// <summary>
    /// Registra un intento de revelar el secreto (Vault)
    /// </summary>
    Task LogRevealAsync(int credentialId, string userId, bool success, string? denialReason = null);

    /// <summary>
    /// Registra un uso de credencial sin revelar (UseWithoutReveal) (Vault)
    /// </summary>
    Task LogUseAsync(int credentialId, string userId, string? targetServer, string? targetInstance, bool success, string? denialReason = null);

    /// <summary>
    /// Registra copia al clipboard (Vault)
    /// </summary>
    Task LogCopyAsync(int credentialId, string userId);

    /// <summary>
    /// Registra un intento denegado - OBLIGATORIO para cualquier acción sin permiso (Vault)
    /// </summary>
    Task LogDeniedAsync(int credentialId, string userId, string attemptedAction, string reason);

    /// <summary>
    /// Obtiene el historial de accesos de una credencial del Vault
    /// </summary>
    Task<List<CredentialAccessLogDto>> GetAccessLogAsync(int credentialId, int limit = 100);

    // ==================== System Credentials ====================
    
    /// <summary>
    /// Registra un intento de revelar el secreto de una credencial de sistema
    /// </summary>
    Task LogSystemCredentialRevealAsync(int systemCredentialId, string userId, bool success, string? denialReason = null);

    /// <summary>
    /// Registra copia al clipboard de una credencial de sistema
    /// </summary>
    Task LogSystemCredentialCopyAsync(int systemCredentialId, string userId);

    /// <summary>
    /// Registra uso de credencial de sistema para conexión
    /// </summary>
    Task LogSystemCredentialUseAsync(int systemCredentialId, string userId, string? targetServer, bool success, string? serviceName = null);

    /// <summary>
    /// Obtiene el historial de accesos de una credencial de sistema
    /// </summary>
    Task<List<CredentialAccessLogDto>> GetSystemCredentialAccessLogAsync(int systemCredentialId, int limit = 100);

    /// <summary>
    /// Obtiene todos los logs de acceso (Vault + Sistema)
    /// </summary>
    Task<List<CredentialAccessLogDto>> GetAllAccessLogsAsync(int limit = 100);

    /// <summary>
    /// Establece el contexto HTTP para capturar IP/UserAgent
    /// </summary>
    void SetHttpContext(HttpContext? httpContext);
}

/// <summary>
/// DTO para mostrar logs de acceso
/// </summary>
public class CredentialAccessLogDto
{
    public long Id { get; set; }
    /// <summary>
    /// ID de credencial del Vault (null si es SystemCredential)
    /// </summary>
    public int? CredentialId { get; set; }
    /// <summary>
    /// ID de credencial de sistema (null si es Vault)
    /// </summary>
    public int? SystemCredentialId { get; set; }
    /// <summary>
    /// Nombre de la credencial (Vault o Sistema)
    /// </summary>
    public string? CredentialName { get; set; }
    /// <summary>
    /// Tipo de fuente: "Vault" o "System"
    /// </summary>
    public string CredentialSource { get; set; } = "Vault";
    public string AccessType { get; set; } = string.Empty;
    public string AccessResult { get; set; } = string.Empty;
    public string? DenialReason { get; set; }
    public string? TargetServerName { get; set; }
    public string UserId { get; set; } = string.Empty;
    public string? UserName { get; set; }
    public DateTime AccessedAt { get; set; }
    public string? IpAddress { get; set; }
}

