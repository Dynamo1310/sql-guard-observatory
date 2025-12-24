namespace SQLGuardObservatory.API.Services;

/// <summary>
/// DTO para credencial de sistema (sin password)
/// </summary>
public class SystemCredentialDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public bool IsActive { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime? UpdatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
    public string? UpdatedByUserName { get; set; }
    public List<SystemCredentialAssignmentDto> Assignments { get; set; } = new();
}

/// <summary>
/// DTO para asignación de credencial de sistema
/// </summary>
public class SystemCredentialAssignmentDto
{
    public int Id { get; set; }
    public int SystemCredentialId { get; set; }
    public string AssignmentType { get; set; } = string.Empty;
    public string AssignmentValue { get; set; } = string.Empty;
    public int Priority { get; set; }
    public DateTime CreatedAt { get; set; }
    public string? CreatedByUserName { get; set; }
}

/// <summary>
/// Request para crear credencial de sistema
/// </summary>
public class CreateSystemCredentialRequest
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string Password { get; set; } = string.Empty;
}

/// <summary>
/// Request para actualizar credencial de sistema
/// </summary>
public class UpdateSystemCredentialRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? Username { get; set; }
    public string? Domain { get; set; }
    public string? Password { get; set; } // Si es null, no se actualiza
    public bool? IsActive { get; set; }
}

/// <summary>
/// Request para agregar asignación
/// </summary>
public class AddSystemCredentialAssignmentRequest
{
    public string AssignmentType { get; set; } = string.Empty;
    public string AssignmentValue { get; set; } = string.Empty;
    public int Priority { get; set; } = 100;
}

/// <summary>
/// Credencial de sistema para uso en conexiones (con password descifrado)
/// </summary>
public class SystemCredentialForConnection
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string Password { get; set; } = string.Empty;
    
    /// <summary>
    /// Tipo de asignación que matcheó
    /// </summary>
    public string MatchedAssignmentType { get; set; } = string.Empty;
    
    /// <summary>
    /// Valor de asignación que matcheó
    /// </summary>
    public string MatchedAssignmentValue { get; set; } = string.Empty;
}

/// <summary>
/// Request para probar conexión con credencial
/// </summary>
public class TestSystemCredentialConnectionRequest
{
    public string ServerName { get; set; } = string.Empty;
    public string? InstanceName { get; set; }
    /// <summary>
    /// Puerto TCP (opcional, default 1433). Requerido para servidores RDS/Azure.
    /// </summary>
    public int? Port { get; set; }
}

/// <summary>
/// Response de prueba de conexión
/// </summary>
public class TestSystemCredentialConnectionResponse
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public string? SqlVersion { get; set; }
    public string? CredentialUsed { get; set; }
    public string? MatchedAssignment { get; set; }
}

/// <summary>
/// Response de revelar password
/// </summary>
public class RevealSystemCredentialPasswordResponse
{
    public string Password { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string CredentialName { get; set; } = string.Empty;
}

/// <summary>
/// DTO para log de auditoría de credencial de sistema
/// </summary>
public class SystemCredentialAuditLogDto
{
    public int Id { get; set; }
    public int SystemCredentialId { get; set; }
    public string? CredentialName { get; set; }
    public string Action { get; set; } = string.Empty;
    public string? Details { get; set; }
    public string? ServerName { get; set; }
    public string? ServiceName { get; set; }
    public string? UserId { get; set; }
    public string? UserName { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Servicio para gestión de credenciales de sistema
/// </summary>
public interface ISystemCredentialService
{
    // ==================== CRUD ====================
    
    /// <summary>
    /// Obtiene todas las credenciales de sistema
    /// </summary>
    Task<List<SystemCredentialDto>> GetAllAsync();
    
    /// <summary>
    /// Obtiene una credencial de sistema por ID
    /// </summary>
    Task<SystemCredentialDto?> GetByIdAsync(int id);
    
    /// <summary>
    /// Crea una nueva credencial de sistema
    /// </summary>
    Task<SystemCredentialDto?> CreateAsync(CreateSystemCredentialRequest request, string userId, string? userName);
    
    /// <summary>
    /// Actualiza una credencial de sistema
    /// </summary>
    Task<bool> UpdateAsync(int id, UpdateSystemCredentialRequest request, string userId, string? userName);
    
    /// <summary>
    /// Elimina una credencial de sistema
    /// </summary>
    Task<bool> DeleteAsync(int id, string userId, string? userName);
    
    // ==================== Asignaciones ====================
    
    /// <summary>
    /// Agrega una asignación a una credencial
    /// </summary>
    Task<SystemCredentialAssignmentDto?> AddAssignmentAsync(int credentialId, AddSystemCredentialAssignmentRequest request, string userId, string? userName);
    
    /// <summary>
    /// Elimina una asignación
    /// </summary>
    Task<bool> RemoveAssignmentAsync(int credentialId, int assignmentId, string userId, string? userName);
    
    // ==================== Uso por servicios ====================
    
    /// <summary>
    /// Obtiene la credencial apropiada para un servidor (usado por PatchingService, etc.)
    /// Busca por: servidor exacto, hostingSite, ambiente, patrón regex
    /// </summary>
    Task<SystemCredentialForConnection?> GetCredentialForServerAsync(
        string serverName, 
        string? instanceName = null,
        string? hostingSite = null, 
        string? environment = null);
    
    /// <summary>
    /// Construye un connection string para un servidor usando credenciales de sistema
    /// Si no hay credencial asignada, usa Windows Authentication
    /// </summary>
    Task<string> BuildConnectionStringAsync(
        string instanceName,
        string? hostingSite = null,
        string? environment = null,
        string? database = "master",
        int timeoutSeconds = 30,
        string? applicationName = null);
    
    /// <summary>
    /// Prueba la conexión a un servidor con una credencial específica
    /// </summary>
    Task<TestSystemCredentialConnectionResponse> TestConnectionAsync(
        int credentialId,
        TestSystemCredentialConnectionRequest request,
        string userId);
    
    /// <summary>
    /// Revela el password de una credencial de sistema (requiere auditoría)
    /// </summary>
    Task<RevealSystemCredentialPasswordResponse?> RevealPasswordAsync(
        int credentialId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent);
    
    /// <summary>
    /// Registra que el password fue copiado al portapapeles
    /// </summary>
    Task<bool> RegisterPasswordCopyAsync(
        int credentialId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent);
    
    /// <summary>
    /// Obtiene los logs de auditoría de una credencial específica
    /// </summary>
    Task<List<SystemCredentialAuditLogDto>> GetAuditLogsAsync(int credentialId, int? limit = 50);
    
    /// <summary>
    /// Obtiene todos los logs de auditoría de credenciales de sistema
    /// </summary>
    Task<List<SystemCredentialAuditLogDto>> GetAllAuditLogsAsync(int? limit = 100);
    
    /// <summary>
    /// Registra el uso de una credencial de sistema (para auditoría)
    /// </summary>
    Task LogCredentialUsageAsync(
        int credentialId,
        string serverName,
        string serviceName,
        string? userId = null);
    
    // ==================== Batch Operations (para procesamiento paralelo) ====================
    
    /// <summary>
    /// Pre-carga todas las asignaciones de credenciales activas para uso en batch.
    /// Retorna los datos necesarios para buscar credenciales sin acceder a DbContext.
    /// </summary>
    Task<PreloadedCredentialAssignments> PreloadAssignmentsAsync();
    
    /// <summary>
    /// Construye un connection string usando datos pre-cargados (thread-safe, no accede a DbContext).
    /// Ideal para procesamiento en paralelo.
    /// </summary>
    string BuildConnectionStringFromPreloaded(
        PreloadedCredentialAssignments preloaded,
        string instanceName,
        string? hostingSite = null,
        string? environment = null,
        string? database = "master",
        int timeoutSeconds = 30,
        string? applicationName = null);
}

/// <summary>
/// Datos pre-cargados de credenciales para uso en batch (thread-safe)
/// </summary>
public class PreloadedCredentialAssignments
{
    public List<PreloadedAssignment> Assignments { get; set; } = new();
}

/// <summary>
/// Asignación pre-cargada con credencial descifrada
/// </summary>
public class PreloadedAssignment
{
    public int CredentialId { get; set; }
    public string CredentialName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? Domain { get; set; }
    public string Password { get; set; } = string.Empty;
    public string AssignmentType { get; set; } = string.Empty;
    public string AssignmentValue { get; set; } = string.Empty;
    public int Priority { get; set; }
}

