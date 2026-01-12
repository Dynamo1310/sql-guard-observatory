using SQLGuardObservatory.API.DTOs;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para gestión del Vault de Credenciales DBA
/// </summary>
public interface IVaultService
{
    // =============================================
    // Operaciones de Credenciales
    // =============================================

    /// <summary>
    /// Obtiene todas las credenciales visibles para el usuario
    /// </summary>
    Task<List<CredentialDto>> GetCredentialsAsync(string userId, CredentialFilterRequest? filter = null);

    /// <summary>
    /// Obtiene una credencial por ID (sin password)
    /// </summary>
    Task<CredentialDto?> GetCredentialByIdAsync(int id, string userId);

    /// <summary>
    /// Crea una nueva credencial
    /// </summary>
    Task<CredentialDto?> CreateCredentialAsync(CreateCredentialRequest request, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Actualiza una credencial existente
    /// </summary>
    Task<CredentialDto?> UpdateCredentialAsync(int id, UpdateCredentialRequest request, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Elimina una credencial (soft delete)
    /// </summary>
    Task<bool> DeleteCredentialAsync(int id, string userId, string? userName, string? ipAddress, string? userAgent, bool isAdmin = false);

    /// <summary>
    /// Revela el password de una credencial (audita la acción)
    /// </summary>
    Task<RevealPasswordResponse?> RevealPasswordAsync(int id, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Actualiza el password de una credencial (MANUAL) - Enterprise v2.1.1
    /// IMPORTANTE: NO cambia la password en el servidor destino
    /// </summary>
    Task<bool> UpdateCredentialPasswordAsync(int id, string newPassword, string userId, string? userName, string? ipAddress, string? userAgent);

    // =============================================
    // Operaciones de Servidores
    // =============================================

    /// <summary>
    /// Agrega un servidor a una credencial
    /// </summary>
    Task<CredentialServerDto?> AddServerToCredentialAsync(int credentialId, AddServerToCredentialRequest request, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Elimina un servidor de una credencial
    /// </summary>
    Task<bool> RemoveServerFromCredentialAsync(int credentialId, int serverId, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Obtiene la lista de servidores disponibles para asociar (del inventario, incluye AWS y DMZ)
    /// </summary>
    Task<List<AvailableServerDto>> GetAvailableServersAsync();

    // =============================================
    // Operaciones de Grupos
    // =============================================

    /// <summary>
    /// Obtiene todos los grupos visibles para el usuario
    /// </summary>
    Task<List<CredentialGroupDto>> GetGroupsAsync(string userId);

    /// <summary>
    /// Obtiene un grupo por ID
    /// </summary>
    Task<CredentialGroupDto?> GetGroupByIdAsync(int id, string userId);

    /// <summary>
    /// Crea un nuevo grupo
    /// </summary>
    Task<CredentialGroupDto?> CreateGroupAsync(CreateCredentialGroupRequest request, string userId, string? userName);

    /// <summary>
    /// Actualiza un grupo existente
    /// </summary>
    Task<CredentialGroupDto?> UpdateGroupAsync(int id, UpdateCredentialGroupRequest request, string userId, string? userName);

    /// <summary>
    /// Elimina un grupo (soft delete)
    /// </summary>
    Task<bool> DeleteGroupAsync(int id, string userId, string? userName);

    /// <summary>
    /// Agrega un miembro a un grupo
    /// </summary>
    Task<CredentialGroupMemberDto?> AddGroupMemberAsync(int groupId, AddGroupMemberRequest request, string userId, string? userName);

    /// <summary>
    /// Actualiza el rol de un miembro
    /// </summary>
    Task<CredentialGroupMemberDto?> UpdateGroupMemberAsync(int groupId, int memberId, UpdateGroupMemberRequest request, string userId);

    /// <summary>
    /// Elimina un miembro de un grupo
    /// </summary>
    Task<bool> RemoveGroupMemberAsync(int groupId, int memberId, string userId, string? userName);

    /// <summary>
    /// Obtiene las credenciales compartidas con un grupo
    /// </summary>
    Task<List<CredentialDto>?> GetGroupCredentialsAsync(int groupId, string userId);

    /// <summary>
    /// Agrega una credencial a un grupo (la comparte)
    /// </summary>
    Task<bool> AddCredentialToGroupAsync(int groupId, int credentialId, string permission, bool allowReshare, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Remueve una credencial de un grupo
    /// </summary>
    Task<bool> RemoveCredentialFromGroupAsync(int groupId, int credentialId, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Obtiene las credenciales propias del usuario que se pueden compartir (no privadas)
    /// </summary>
    Task<List<CredentialDto>> GetMyShareableCredentialsAsync(string userId);

    /// <summary>
    /// Obtiene los usuarios disponibles para agregar a grupos
    /// </summary>
    Task<List<VaultUserDto>> GetAvailableUsersAsync();

    // =============================================
    // Estadísticas y Dashboard
    // =============================================

    /// <summary>
    /// Obtiene estadísticas del Vault para el usuario
    /// </summary>
    Task<VaultStatsDto> GetVaultStatsAsync(string userId, bool isAdmin = false);

    /// <summary>
    /// Obtiene credenciales próximas a expirar
    /// </summary>
    Task<List<CredentialDto>> GetExpiringCredentialsAsync(string userId, int daysAhead = 30);

    // =============================================
    // Auditoría
    // =============================================

    /// <summary>
    /// Obtiene el historial de auditoría de una credencial
    /// </summary>
    Task<List<CredentialAuditLogDto>> GetCredentialAuditLogAsync(int credentialId, string userId);

    /// <summary>
    /// Obtiene el historial de auditoría completo (solo admin)
    /// </summary>
    Task<List<CredentialAuditLogDto>> GetFullAuditLogAsync(int? limit = 100);

    /// <summary>
    /// Registra una acción de copia de password
    /// </summary>
    Task RegisterPasswordCopyAsync(int credentialId, string userId, string? userName, string? ipAddress, string? userAgent);

    // =============================================
    // Operaciones de Compartición
    // =============================================

    /// <summary>
    /// Comparte una credencial con grupos y/o usuarios
    /// </summary>
    Task<bool> ShareCredentialAsync(int credentialId, ShareCredentialRequest request, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Deja de compartir una credencial con un grupo
    /// </summary>
    Task<bool> UnshareFromGroupAsync(int credentialId, int groupId, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Deja de compartir una credencial con un usuario
    /// </summary>
    Task<bool> UnshareFromUserAsync(int credentialId, string targetUserId, string userId, string? userName, string? ipAddress, string? userAgent);

    /// <summary>
    /// Obtiene las credenciales compartidas directamente con el usuario
    /// </summary>
    Task<List<SharedWithMeCredentialDto>> GetCredentialsSharedWithMeAsync(string userId);
}

/// <summary>
/// DTO simple de usuario para selección en el Vault
/// </summary>
public class VaultUserDto
{
    public string Id { get; set; } = string.Empty;
    public string UserName { get; set; } = string.Empty;
    public string? DisplayName { get; set; }
    public string? Email { get; set; }
}
