using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Helpers;
using SQLGuardObservatory.API.Models;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// DTO para servidores del inventario (Vault)
/// </summary>
internal class VaultInventoryServerDto
{
    public string ServerName { get; set; } = string.Empty;
    public string NombreInstancia { get; set; } = string.Empty;
    public string? ambiente { get; set; }
    public string? hostingSite { get; set; }
}

/// <summary>
/// Implementación del servicio de Vault de Credenciales DBA
/// </summary>
public class VaultService : IVaultService
{
    private readonly ApplicationDbContext _context;
    private readonly SQLNovaDbContext _sqlNovaContext;
    private readonly ICryptoService _cryptoService;
    private readonly IDualReadCryptoService? _dualReadCryptoService;
    private readonly IPermissionBitMaskService _permissionBitMaskService;
    private readonly IVaultNotificationService _notificationService;
    private readonly HttpClient _httpClient;
    private readonly ILogger<VaultService> _logger;

    private const string InventoryApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/";

    public VaultService(
        ApplicationDbContext context,
        SQLNovaDbContext sqlNovaContext,
        ICryptoService cryptoService,
        IVaultNotificationService notificationService,
        IHttpClientFactory httpClientFactory,
        ILogger<VaultService> logger,
        IPermissionBitMaskService permissionBitMaskService,
        IDualReadCryptoService? dualReadCryptoService = null)
    {
        _context = context;
        _sqlNovaContext = sqlNovaContext;
        _cryptoService = cryptoService;
        _dualReadCryptoService = dualReadCryptoService;
        _permissionBitMaskService = permissionBitMaskService;
        _notificationService = notificationService;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
        _logger = logger;
    }

    // =============================================
    // Operaciones de Credenciales
    // =============================================

    public async Task<List<CredentialDto>> GetCredentialsAsync(string userId, CredentialFilterRequest? filter = null)
    {
        var includeDeleted = filter?.IncludeDeleted ?? false;
        
        // Obtener IDs de grupos a los que el usuario pertenece
        var userGroupIds = await _context.CredentialGroupMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.GroupId)
            .ToListAsync();
        
        var query = _context.Credentials
            .Include(c => c.Servers)
            .Include(c => c.Owner)
            .Include(c => c.CreatedByUser)
            .Include(c => c.UpdatedByUser)
            .Include(c => c.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.SharedByUser)
            .Include(c => c.UserShares).ThenInclude(us => us.User)
            .Include(c => c.UserShares).ThenInclude(us => us.SharedByUser)
            .Where(c => !c.IsDeleted || includeDeleted)
            // Reglas de visibilidad:
            // 1. Credenciales del propietario
            // 2. Credenciales compartidas con todo el equipo (IsTeamShared)
            // 3. Credenciales compartidas directamente con el usuario
            // 4. Credenciales compartidas con grupos del usuario
            // 5. Legacy: Credenciales de grupos (GroupId) a los que pertenece el usuario
            .Where(c => 
                c.OwnerUserId == userId ||
                c.IsTeamShared ||
                c.UserShares.Any(us => us.UserId == userId) ||
                c.GroupShares.Any(gs => userGroupIds.Contains(gs.GroupId)) ||
                (c.GroupId != null && userGroupIds.Contains(c.GroupId.Value))
            )
            .AsQueryable();

        // Aplicar filtros
        if (filter != null)
        {
            if (!string.IsNullOrEmpty(filter.SearchTerm))
            {
                var term = filter.SearchTerm.ToLower();
                query = query.Where(c =>
                    c.Name.ToLower().Contains(term) ||
                    c.Username.ToLower().Contains(term) ||
                    (c.Description != null && c.Description.ToLower().Contains(term)) ||
                    (c.Notes != null && c.Notes.ToLower().Contains(term)) ||
                    c.Servers.Any(s => s.ServerName.ToLower().Contains(term))
                );
            }

            if (!string.IsNullOrEmpty(filter.CredentialType))
            {
                query = query.Where(c => c.CredentialType == filter.CredentialType);
            }

            if (!string.IsNullOrEmpty(filter.ServerName))
            {
                query = query.Where(c => c.Servers.Any(s => s.ServerName == filter.ServerName));
            }

            if (filter.IsExpired == true)
            {
                query = query.Where(c => c.ExpiresAt != null && c.ExpiresAt < LocalClockAR.Now);
            }

            if (filter.IsExpiringSoon == true)
            {
                var thirtyDaysAhead = LocalClockAR.Now.AddDays(30);
                query = query.Where(c => c.ExpiresAt != null && c.ExpiresAt >= LocalClockAR.Now && c.ExpiresAt <= thirtyDaysAhead);
            }

            if (filter.IsPrivate.HasValue)
            {
                query = query.Where(c => c.IsPrivate == filter.IsPrivate.Value);
            }

            if (filter.GroupId.HasValue)
            {
                query = query.Where(c => c.GroupId == filter.GroupId.Value);
            }

            // Filtro para "Mis Credenciales" - solo las que el usuario creó/posee
            if (filter.OwnerOnly)
            {
                query = query.Where(c => c.OwnerUserId == userId);
            }
        }

        var credentials = await query
            .OrderByDescending(c => c.UpdatedAt ?? c.CreatedAt)
            .ToListAsync();

        var dtos = credentials.Select(c => MapToDto(c, userId)).ToList();
        return await EnrichListWithPermissionsAsync(dtos, userId);
    }

    public async Task<CredentialDto?> GetCredentialByIdAsync(int id, string userId)
    {
        var credential = await _context.Credentials
            .Include(c => c.Servers)
            .Include(c => c.Owner)
            .Include(c => c.CreatedByUser)
            .Include(c => c.UpdatedByUser)
            .Include(c => c.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.SharedByUser)
            .Include(c => c.UserShares).ThenInclude(us => us.User)
            .Include(c => c.UserShares).ThenInclude(us => us.SharedByUser)
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);

        if (credential == null)
            return null;

        // Verificar acceso
        if (!await CanUserAccessCredentialAsync(credential, userId))
            return null;

        var dto = MapToDto(credential, userId);
        return await EnrichWithPermissionsAsync(dto, userId);
    }
    
    private async Task<bool> CanUserAccessCredentialAsync(Credential credential, string userId)
    {
        // El propietario siempre puede acceder
        if (credential.OwnerUserId == userId)
            return true;
        
        // Si es privada, solo el owner
        if (credential.IsPrivate)
            return false;
        
        // Si está compartida con todo el equipo
        if (credential.IsTeamShared)
            return true;
        
        // Si está compartida directamente con el usuario
        if (credential.UserShares.Any(us => us.UserId == userId))
            return true;
        
        // Obtener grupos del usuario
        var userGroupIds = await _context.CredentialGroupMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.GroupId)
            .ToListAsync();
        
        // Si está compartida con algún grupo del usuario
        if (credential.GroupShares.Any(gs => userGroupIds.Contains(gs.GroupId)))
            return true;
        
        // Legacy: Si pertenece a un grupo (GroupId) del usuario
        if (credential.GroupId.HasValue && userGroupIds.Contains(credential.GroupId.Value))
            return true;
        
        return false;
    }

    public async Task<CredentialDto?> CreateCredentialAsync(
        CreateCredentialRequest request,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        try
        {
            // Cifrar password - usar formato enterprise si está disponible
            var credential = new Credential
            {
                Name = request.Name,
                CredentialType = request.CredentialType,
                Username = request.Username,
                Domain = request.Domain,
                Description = request.Description,
                Notes = request.Notes,
                ExpiresAt = request.ExpiresAt,
                IsPrivate = request.IsPrivate,
                OwnerUserId = userId,
                CreatedByUserId = userId,
                CreatedAt = LocalClockAR.Now
            };

            // Cifrar con formato enterprise (post Phase 8 - solo VARBINARY)
            var encryptedData = _dualReadCryptoService.EncryptWithEnterprise(request.Password);
            credential.EncryptedPassword = encryptedData.CipherText;
            credential.Salt = encryptedData.Salt;
            credential.IV = encryptedData.IV;
            credential.AuthTag = encryptedData.AuthTag;
            credential.KeyId = encryptedData.KeyId;
            credential.KeyVersion = encryptedData.KeyVersion;
            credential.IsMigratedToV2 = true;

            _context.Credentials.Add(credential);
            await _context.SaveChangesAsync();

            // Agregar servidores si se especificaron
            if (request.Servers?.Any() == true)
            {
                foreach (var server in request.Servers)
                {
                    var credentialServer = new CredentialServer
                    {
                        CredentialId = credential.Id,
                        ServerName = server.ServerName,
                        InstanceName = server.InstanceName,
                        ConnectionPurpose = server.ConnectionPurpose,
                        CreatedAt = LocalClockAR.Now
                    };
                    _context.CredentialServers.Add(credentialServer);
                }
                await _context.SaveChangesAsync();
            }

            // Compartir con grupos si se especificaron
            if (request.ShareWithGroupIds?.Any() == true)
            {
                foreach (var groupId in request.ShareWithGroupIds)
                {
                    var groupExists = await _context.CredentialGroups.AnyAsync(g => g.Id == groupId && !g.IsDeleted);
                    if (groupExists)
                    {
                        _context.CredentialGroupShares.Add(new CredentialGroupShare
                        {
                            CredentialId = credential.Id,
                            GroupId = groupId,
                            SharedByUserId = userId,
                            PermissionBitMask = 3, // ViewMetadata (1) + RevealSecret (2) = View
                            SharedAt = LocalClockAR.Now
                        });
                    }
                }
                await _context.SaveChangesAsync();
            }

            // Compartir con usuarios si se especificaron
            if (request.ShareWithUserIds?.Any() == true)
            {
                foreach (var targetUserId in request.ShareWithUserIds)
                {
                    if (targetUserId == userId) continue; // No compartir consigo mismo
                    var userExists = await _context.Users.AnyAsync(u => u.Id == targetUserId && u.IsActive);
                    if (userExists)
                    {
                        _context.CredentialUserShares.Add(new CredentialUserShare
                        {
                            CredentialId = credential.Id,
                            UserId = targetUserId,
                            SharedByUserId = userId,
                            PermissionBitMask = 3, // ViewMetadata (1) + RevealSecret (2) = View
                            SharedAt = LocalClockAR.Now
                        });
                    }
                }
                await _context.SaveChangesAsync();
            }

            // Registrar auditoría
            await LogAuditAsync(credential.Id, credential.Name, CredentialAuditActions.Created,
                null, userId, userName, ipAddress, userAgent);

            // Recargar con relaciones para retornar
            var result = await GetCredentialByIdAsync(credential.Id, userId);

            // Enviar notificaciones de "credencial compartida" a los usuarios con los que se compartió
            try
            {
                var credForNotify = await _context.Credentials
                    .Include(c => c.Owner)
                    .AsNoTracking()
                    .FirstOrDefaultAsync(c => c.Id == credential.Id);

                if (credForNotify != null)
                {
                    var sharerName = userName ?? "Usuario";

                    // Notificar a usuarios compartidos directamente
                    if (request.ShareWithUserIds?.Any() == true)
                    {
                        foreach (var targetUserId in request.ShareWithUserIds)
                        {
                            if (targetUserId == userId) continue;
                            await _notificationService.NotifyCredentialSharedAsync(credForNotify, sharerName, targetUserId);
                        }
                    }

                    // Notificar a miembros de grupos compartidos
                    if (request.ShareWithGroupIds?.Any() == true)
                    {
                        foreach (var groupId in request.ShareWithGroupIds)
                        {
                            var groupMembers = await _context.Set<CredentialGroupMember>()
                                .Where(m => m.GroupId == groupId && m.UserId != userId)
                                .Select(m => m.UserId)
                                .ToListAsync();

                            foreach (var memberId in groupMembers)
                            {
                                await _notificationService.NotifyCredentialSharedAsync(credForNotify, sharerName, memberId);
                            }
                        }
                    }
                }
            }
            catch (Exception notifyEx)
            {
                _logger.LogWarning(notifyEx, "Error al enviar notificación de credencial compartida {CredentialId}", credential.Id);
            }

            return result;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al crear credencial: {Name}", request.Name);
            return null;
        }
    }

    public async Task<CredentialDto?> UpdateCredentialAsync(
        int id,
        UpdateCredentialRequest request,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);

        if (credential == null)
            return null;

        // Verificar que sea el propietario o admin
        if (credential.OwnerUserId != userId)
            return null;

        var changedFields = new Dictionary<string, object>();

        // Registrar cambios
        if (credential.Name != request.Name)
        {
            changedFields["Name"] = new { Old = credential.Name, New = request.Name };
            credential.Name = request.Name;
        }

        if (credential.CredentialType != request.CredentialType)
        {
            changedFields["CredentialType"] = new { Old = credential.CredentialType, New = request.CredentialType };
            credential.CredentialType = request.CredentialType;
        }

        if (credential.Username != request.Username)
        {
            changedFields["Username"] = new { Old = credential.Username, New = request.Username };
            credential.Username = request.Username;
        }

        if (credential.Domain != request.Domain)
        {
            changedFields["Domain"] = new { Old = credential.Domain, New = request.Domain };
            credential.Domain = request.Domain;
        }

        if (credential.Description != request.Description)
        {
            changedFields["Description"] = "Updated";
            credential.Description = request.Description;
        }

        if (credential.Notes != request.Notes)
        {
            changedFields["Notes"] = "Updated";
            credential.Notes = request.Notes;
        }

        if (credential.ExpiresAt != request.ExpiresAt)
        {
            changedFields["ExpiresAt"] = new { Old = credential.ExpiresAt, New = request.ExpiresAt };
            credential.ExpiresAt = request.ExpiresAt;
        }

        if (credential.IsPrivate != request.IsPrivate)
        {
            changedFields["IsPrivate"] = new { Old = credential.IsPrivate, New = request.IsPrivate };
            credential.IsPrivate = request.IsPrivate;
        }

        // Actualizar password si se proporcionó uno nuevo
        if (!string.IsNullOrEmpty(request.NewPassword))
        {
            // Cifrar con formato enterprise (post Phase 8 - solo VARBINARY)
            var encryptedData = _dualReadCryptoService.EncryptWithEnterprise(request.NewPassword);
            credential.EncryptedPassword = encryptedData.CipherText;
            credential.Salt = encryptedData.Salt;
            credential.IV = encryptedData.IV;
            credential.AuthTag = encryptedData.AuthTag;
            credential.KeyId = encryptedData.KeyId;
            credential.KeyVersion = encryptedData.KeyVersion;
            credential.IsMigratedToV2 = true;
            changedFields["Password"] = "Changed";
        }

        credential.UpdatedAt = LocalClockAR.Now;
        credential.UpdatedByUserId = userId;

        var passwordChanged = changedFields.ContainsKey("Password");

        await _context.SaveChangesAsync();

        // Registrar auditoría
        await LogAuditAsync(credential.Id, credential.Name, CredentialAuditActions.Updated,
            JsonSerializer.Serialize(changedFields), userId, userName, ipAddress, userAgent);

        // Obtener el resultado para retornar
        var result = await GetCredentialByIdAsync(credential.Id, userId);

        // Enviar notificaciones de forma síncrona para evitar problemas de concurrencia con DbContext
        try
        {
            var credForNotify = await _context.Credentials
                .Include(c => c.Owner)
                .Include(c => c.Group)
                .ThenInclude(g => g!.Members)
                .ThenInclude(m => m.User)
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == credential.Id);

            if (credForNotify != null)
            {
                await _notificationService.NotifyCredentialUpdatedAsync(credForNotify, userName ?? "Usuario", passwordChanged);
            }
        }
        catch (Exception notifyEx)
        {
            _logger.LogWarning(notifyEx, "Error al enviar notificación de credencial actualizada {CredentialId}", credential.Id);
        }

        return result;
    }

    public async Task<bool> DeleteCredentialAsync(
        int id,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent,
        bool isAdmin = false)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar que sea el propietario o admin
        if (!isAdmin && credential.OwnerUserId != userId)
            return false;

        // Cargar relaciones antes del delete para notificaciones
        await _context.Entry(credential)
            .Reference(c => c.Owner)
            .LoadAsync();
        await _context.Entry(credential)
            .Reference(c => c.Group)
            .LoadAsync();
        if (credential.Group != null)
        {
            await _context.Entry(credential.Group)
                .Collection(g => g.Members)
                .LoadAsync();
            foreach (var member in credential.Group.Members)
            {
                await _context.Entry(member)
                    .Reference(m => m.User)
                    .LoadAsync();
            }
        }

        // Copiar datos para notificación antes del soft delete
        var credentialCopy = new Credential
        {
            Id = credential.Id,
            Name = credential.Name,
            CredentialType = credential.CredentialType,
            Username = credential.Username,
            Domain = credential.Domain,
            IsPrivate = credential.IsPrivate,
            OwnerUserId = credential.OwnerUserId,
            Owner = credential.Owner,
            Group = credential.Group,
            GroupId = credential.GroupId
        };

        // Soft delete
        credential.IsDeleted = true;
        credential.UpdatedAt = LocalClockAR.Now;
        credential.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        // Registrar auditoría
        await LogAuditAsync(credential.Id, credential.Name, CredentialAuditActions.Deleted,
            null, userId, userName, ipAddress, userAgent);

        // Enviar notificaciones de forma síncrona para evitar problemas de concurrencia con DbContext
        try
        {
            await _notificationService.NotifyCredentialDeletedAsync(credentialCopy, userName ?? "Usuario");
        }
        catch (Exception notifyEx)
        {
            _logger.LogWarning(notifyEx, "Error al enviar notificación de credencial eliminada {CredentialId}", credential.Id);
        }

        return true;
    }

    public async Task<RevealPasswordResponse?> RevealPasswordAsync(
        int id,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .Include(c => c.Owner)
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);

        if (credential == null)
            return null;

        // Verificar permisos de revelación (incluye owner, shares directos, shares de grupo, etc.)
        var canReveal = await _permissionBitMaskService.CanRevealAsync(userId, id);
        if (!canReveal)
        {
            _logger.LogWarning("Usuario {UserId} no tiene permisos para revelar credencial {CredentialId}", userId, id);
            return null;
        }

        try
        {
            // Post Phase 8: solo formato enterprise (VARBINARY)
            var password = _dualReadCryptoService.DecryptCredentialPassword(
                isMigratedToV2: true, // Post Phase 8, todo está migrado
                encryptedPasswordBase64: null,
                saltBase64: null,
                ivBase64: null,
                encryptedPasswordBin: credential.EncryptedPassword,
                saltBin: credential.Salt,
                ivBin: credential.IV,
                authTagBin: credential.AuthTag,
                keyId: credential.KeyId,
                keyVersion: credential.KeyVersion);

            // Registrar auditoría
            await LogAuditAsync(credential.Id, credential.Name, CredentialAuditActions.PasswordRevealed,
                null, userId, userName, ipAddress, userAgent);

            // Enviar notificación de contraseña revelada (solo si no es el propietario quien revela)
            if (credential.OwnerUserId != userId)
            {
                try
                {
                    await _notificationService.NotifyPasswordRevealedAsync(credential, userName ?? "Usuario", userId);
                }
                catch (Exception notifyEx)
                {
                    _logger.LogWarning(notifyEx, "Error al enviar notificación de contraseña revelada {CredentialId}", credential.Id);
                }
            }

            return new RevealPasswordResponse
            {
                Password = password,
                ExpiresInSeconds = 30
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al descifrar password de credencial {Id}", id);
            return null;
        }
    }

    /// <summary>
    /// Actualiza el password de una credencial (MANUAL) - Enterprise v2.1.1
    /// IMPORTANTE: NO cambia la password en el servidor destino
    /// </summary>
    public async Task<bool> UpdateCredentialPasswordAsync(
        int id,
        string newPassword,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == id && !c.IsDeleted);

        if (credential == null)
            return false;

        try
        {
            // Cifrar con formato enterprise (post Phase 8 - solo VARBINARY)
            var encryptedData = _dualReadCryptoService.EncryptWithEnterprise(newPassword);
            credential.EncryptedPassword = encryptedData.CipherText;
            credential.Salt = encryptedData.Salt;
            credential.IV = encryptedData.IV;
            credential.AuthTag = encryptedData.AuthTag;
            credential.KeyId = encryptedData.KeyId;
            credential.KeyVersion = encryptedData.KeyVersion;
            credential.IsMigratedToV2 = true;

            credential.UpdatedAt = LocalClockAR.Now;
            credential.UpdatedByUserId = userId;

            await _context.SaveChangesAsync();

            // Registrar auditoría
            await LogAuditAsync(credential.Id, credential.Name, "SecretUpdated",
                "Password actualizado manualmente", userId, userName, ipAddress, userAgent);

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al actualizar password de credencial {Id}", id);
            return false;
        }
    }

    // =============================================
    // Operaciones de Servidores
    // =============================================

    public async Task<CredentialServerDto?> AddServerToCredentialAsync(
        int credentialId,
        AddServerToCredentialRequest request,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return null;

        // Verificar permisos de edición (incluye owner, shares con permiso de edición, etc.)
        var canEdit = await _permissionBitMaskService.CanEditAsync(userId, credentialId);
        if (!canEdit)
            return null;

        // Verificar si ya existe
        var exists = await _context.CredentialServers
            .AnyAsync(cs => cs.CredentialId == credentialId &&
                           cs.ServerName == request.ServerName &&
                           cs.InstanceName == request.InstanceName);

        if (exists)
            return null;

        var server = new CredentialServer
        {
            CredentialId = credentialId,
            ServerName = request.ServerName,
            InstanceName = request.InstanceName,
            ConnectionPurpose = request.ConnectionPurpose,
            CreatedAt = LocalClockAR.Now
        };

        _context.CredentialServers.Add(server);
        await _context.SaveChangesAsync();

        // Registrar auditoría
        await LogAuditAsync(credentialId, credential.Name, CredentialAuditActions.ServerAdded,
            JsonSerializer.Serialize(new { ServerName = request.ServerName, InstanceName = request.InstanceName }),
            userId, userName, ipAddress, userAgent);

        return new CredentialServerDto
        {
            Id = server.Id,
            ServerName = server.ServerName,
            InstanceName = server.InstanceName,
            ConnectionPurpose = server.ConnectionPurpose,
            CreatedAt = server.CreatedAt
        };
    }

    public async Task<bool> RemoveServerFromCredentialAsync(
        int credentialId,
        int serverId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar permisos de edición (incluye owner, shares con permiso de edición, etc.)
        var canEdit = await _permissionBitMaskService.CanEditAsync(userId, credentialId);
        if (!canEdit)
            return false;

        var server = await _context.CredentialServers
            .FirstOrDefaultAsync(cs => cs.Id == serverId && cs.CredentialId == credentialId);

        if (server == null)
            return false;

        _context.CredentialServers.Remove(server);
        await _context.SaveChangesAsync();

        // Registrar auditoría
        await LogAuditAsync(credentialId, credential.Name, CredentialAuditActions.ServerRemoved,
            JsonSerializer.Serialize(new { ServerName = server.ServerName, InstanceName = server.InstanceName }),
            userId, userName, ipAddress, userAgent);

        return true;
    }

    public async Task<List<AvailableServerDto>> GetAvailableServersAsync()
    {
        var servers = new List<AvailableServerDto>();

        try
        {
            // Obtener servidores de la API del inventario (incluye AWS, DMZ, etc.)
            var response = await _httpClient.GetAsync(InventoryApiUrl);
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync();
            var inventoryServers = JsonSerializer.Deserialize<List<VaultInventoryServerDto>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<VaultInventoryServerDto>();
            
            servers = inventoryServers
                .Where(s => !string.IsNullOrEmpty(s.ServerName) && !string.IsNullOrEmpty(s.NombreInstancia))
                .Select(s =>
                {
                    var parts = s.NombreInstancia.Split('\\');
                    return new AvailableServerDto
                    {
                        ServerName = parts[0],
                        InstanceName = parts.Length > 1 ? parts[1] : null,
                        Environment = s.ambiente,
                        HostingSite = s.hostingSite
                    };
                })
                .GroupBy(s => new { s.ServerName, s.InstanceName })
                .Select(g => g.First())
                .OrderBy(s => s.ServerName)
                .ThenBy(s => s.InstanceName)
                .ToList();

            _logger.LogInformation("Se obtuvieron {Count} servidores del inventario para el Vault", servers.Count);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al obtener servidores del inventario, usando fallback de InstanceHealthScore");
            
            // Fallback: usar servidores de InstanceHealthScore si la API del inventario falla
            var healthScoreServers = await _sqlNovaContext.InstanceHealthScores
                .Select(s => s.InstanceName)
                .Distinct()
                .ToListAsync();

            servers = healthScoreServers
                .Where(s => !string.IsNullOrEmpty(s))
                .Select(s =>
                {
                    var parts = s.Split('\\');
                    return new AvailableServerDto
                    {
                        ServerName = parts[0],
                        InstanceName = parts.Length > 1 ? parts[1] : null
                    };
                })
                .OrderBy(s => s.ServerName)
                .ThenBy(s => s.InstanceName)
                .ToList();
        }

        return servers;
    }

    // =============================================
    // Estadísticas y Dashboard
    // =============================================

    public async Task<VaultStatsDto> GetVaultStatsAsync(string userId, bool isAdmin = false)
    {
        var query = _context.Credentials
            .Where(c => !c.IsDeleted)
            .Where(c => !c.IsPrivate || c.OwnerUserId == userId);

        var now = LocalClockAR.Now;
        var thirtyDaysAhead = now.AddDays(30);

        var total = await query.CountAsync();
        var shared = await query.CountAsync(c => !c.IsPrivate);
        var privateCount = await query.CountAsync(c => c.IsPrivate && c.OwnerUserId == userId);
        var expiring = await query.CountAsync(c => c.ExpiresAt != null && c.ExpiresAt >= now && c.ExpiresAt <= thirtyDaysAhead);
        var expired = await query.CountAsync(c => c.ExpiresAt != null && c.ExpiresAt < now);
        var sqlAuth = await query.CountAsync(c => c.CredentialType == CredentialTypes.SqlAuth);
        var windows = await query.CountAsync(c => c.CredentialType == CredentialTypes.WindowsAD);
        var other = await query.CountAsync(c => c.CredentialType == CredentialTypes.Other);
        var serversLinked = await _context.CredentialServers
            .Where(cs => query.Any(c => c.Id == cs.CredentialId))
            .CountAsync();

        var lastActivity = await _context.CredentialAuditLogs
            .OrderByDescending(a => a.PerformedAt)
            .Select(a => (DateTime?)a.PerformedAt)
            .FirstOrDefaultAsync();

        return new VaultStatsDto
        {
            TotalCredentials = total,
            SharedCredentials = shared,
            PrivateCredentials = privateCount,
            ExpiringCredentials = expiring,
            ExpiredCredentials = expired,
            SqlAuthCredentials = sqlAuth,
            WindowsCredentials = windows,
            OtherCredentials = other,
            TotalServersLinked = serversLinked,
            LastActivity = lastActivity
        };
    }

    public async Task<List<CredentialDto>> GetExpiringCredentialsAsync(string userId, int daysAhead = 30)
    {
        var deadline = LocalClockAR.Now.AddDays(daysAhead);

        // Obtener IDs de grupos del usuario
        var userGroupIds = await _context.CredentialGroupMembers
            .Where(m => m.UserId == userId)
            .Select(m => m.GroupId)
            .ToListAsync();

        var credentials = await _context.Credentials
            .Include(c => c.Servers)
            .Include(c => c.Owner)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.Group)
            .Include(c => c.UserShares).ThenInclude(us => us.User)
            .Where(c => !c.IsDeleted)
            .Where(c => c.ExpiresAt != null && c.ExpiresAt <= deadline)
            // Reglas de visibilidad
            .Where(c => 
                c.OwnerUserId == userId ||
                c.IsTeamShared ||
                c.UserShares.Any(us => us.UserId == userId) ||
                c.GroupShares.Any(gs => userGroupIds.Contains(gs.GroupId)) ||
                (c.GroupId != null && userGroupIds.Contains(c.GroupId.Value))
            )
            .OrderBy(c => c.ExpiresAt)
            .ToListAsync();

        var dtos = credentials.Select(c => MapToDto(c, userId)).ToList();
        return await EnrichListWithPermissionsAsync(dtos, userId);
    }

    // =============================================
    // Auditoría
    // =============================================

    public async Task<List<CredentialAuditLogDto>> GetCredentialAuditLogAsync(int credentialId, string userId)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == credentialId);

        if (credential == null)
            return new List<CredentialAuditLogDto>();

        // Verificar permisos para ver auditoría (incluye owner, shares con permiso de audit, etc.)
        var canViewAudit = await _permissionBitMaskService.CanViewAuditAsync(userId, credentialId);
        if (!canViewAudit)
            return new List<CredentialAuditLogDto>();

        var logs = await _context.CredentialAuditLogs
            .Where(a => a.CredentialId == credentialId)
            .OrderByDescending(a => a.PerformedAt)
            .ToListAsync();

        return logs.Select(MapAuditToDto).ToList();
    }

    public async Task<List<CredentialAuditLogDto>> GetFullAuditLogAsync(int? limit = 100)
    {
        var logs = await _context.CredentialAuditLogs
            .OrderByDescending(a => a.PerformedAt)
            .Take(limit ?? 100)
            .ToListAsync();

        return logs.Select(MapAuditToDto).ToList();
    }

    public async Task RegisterPasswordCopyAsync(
        int credentialId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == credentialId);

        if (credential == null)
            return;

        await LogAuditAsync(credentialId, credential.Name, CredentialAuditActions.PasswordCopied,
            null, userId, userName, ipAddress, userAgent);
    }

    // =============================================
    // Métodos Auxiliares
    // =============================================

    private async Task LogAuditAsync(
        int credentialId,
        string credentialName,
        string action,
        string? changedFields,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var auditLog = new CredentialAuditLog
        {
            CredentialId = credentialId,
            CredentialName = credentialName,
            Action = action,
            ChangedFields = changedFields,
            PerformedByUserId = userId,
            PerformedByUserName = userName,
            PerformedAt = LocalClockAR.Now,
            IpAddress = ipAddress,
            UserAgent = userAgent
        };

        _context.CredentialAuditLogs.Add(auditLog);
        await _context.SaveChangesAsync();
    }

    private static CredentialDto MapToDto(Credential c, string? currentUserId = null)
    {
        return new CredentialDto
        {
            Id = c.Id,
            Name = c.Name,
            CredentialType = c.CredentialType,
            Username = c.Username,
            Domain = c.Domain,
            Description = c.Description,
            Notes = c.Notes,
            ExpiresAt = c.ExpiresAt,
            IsPrivate = c.IsPrivate,
            IsTeamShared = c.IsTeamShared,
            GroupId = c.GroupId,
            GroupName = c.Group?.Name,
            GroupColor = c.Group?.Color,
            OwnerUserId = c.OwnerUserId,
            OwnerDisplayName = c.Owner?.DisplayName,
            CreatedAt = c.CreatedAt,
            UpdatedAt = c.UpdatedAt,
            CreatedByDisplayName = c.CreatedByUser?.DisplayName,
            UpdatedByDisplayName = c.UpdatedByUser?.DisplayName,
            Servers = c.Servers.Select(s => new CredentialServerDto
            {
                Id = s.Id,
                ServerName = s.ServerName,
                InstanceName = s.InstanceName,
                ConnectionPurpose = s.ConnectionPurpose,
                CreatedAt = s.CreatedAt
            }).ToList(),
            GroupShares = c.GroupShares.Select(gs => new CredentialGroupShareDto
            {
                Id = gs.Id,
                GroupId = gs.GroupId,
                GroupName = gs.Group?.Name ?? "",
                GroupColor = gs.Group?.Color,
                PermissionBitMask = gs.PermissionBitMask,
                Permission = BitmaskToPermissionString(gs.PermissionBitMask),
                SharedByUserId = gs.SharedByUserId,
                SharedByUserName = gs.SharedByUser?.DisplayName ?? gs.SharedByUser?.UserName,
                SharedAt = gs.SharedAt,
                AllowReshare = gs.AllowReshare
            }).ToList(),
            UserShares = c.UserShares.Select(us => new CredentialUserShareDto
            {
                Id = us.Id,
                UserId = us.UserId,
                UserName = us.User?.UserName ?? "",
                DisplayName = us.User?.DisplayName,
                Email = us.User?.Email,
                PermissionBitMask = us.PermissionBitMask,
                Permission = BitmaskToPermissionString(us.PermissionBitMask),
                SharedByUserId = us.SharedByUserId,
                SharedByUserName = us.SharedByUser?.DisplayName ?? us.SharedByUser?.UserName,
                SharedAt = us.SharedAt,
                AllowReshare = us.AllowReshare
            }).ToList(),
            CurrentUserPermission = GetUserPermissionForCredential(c, currentUserId)
        };
    }
    
    private static string? GetUserPermissionForCredential(Credential c, string? userId)
    {
        if (string.IsNullOrEmpty(userId)) return null;
        if (c.OwnerUserId == userId) return SharePermissions.Admin;
        
        // Verificar shares directos
        var userShare = c.UserShares.FirstOrDefault(us => us.UserId == userId);
        if (userShare != null) return BitmaskToPermissionString(userShare.PermissionBitMask);
        
        // Si es team shared, todos tienen View
        if (c.IsTeamShared) return SharePermissions.View;
        
        return null;
    }

    /// <summary>
    /// Convierte un bitmask de permisos a string legible para UI
    /// </summary>
    private static string BitmaskToPermissionString(long bitmask)
    {
        // Determinar el nivel más alto
        if ((bitmask & 128) != 0) return SharePermissions.Admin; // DeleteCredential = Admin
        if ((bitmask & 64) != 0) return SharePermissions.Admin;  // ShareCredential = Admin  
        if ((bitmask & 16) != 0) return SharePermissions.Admin;  // UpdateSecret = Admin
        if ((bitmask & 8) != 0) return SharePermissions.Edit;    // EditMetadata = Edit
        if ((bitmask & 2) != 0) return SharePermissions.View;    // RevealSecret = View
        if ((bitmask & 1) != 0) return SharePermissions.View;    // ViewMetadata = View
        return SharePermissions.View;
    }

    /// <summary>
    /// Convierte un string de permiso a bitmask
    /// </summary>
    private static long PermissionStringToBitmask(string permission)
    {
        return permission?.ToLower() switch
        {
            "view" => 3,    // ViewMetadata (1) + RevealSecret (2)
            "edit" => 11,   // ViewMetadata (1) + RevealSecret (2) + EditMetadata (8)
            "admin" => 223, // ViewMetadata + RevealSecret + UseWithoutReveal + EditMetadata + UpdateSecret + ShareCredential + DeleteCredential
            _ => 3          // Default: View
        };
    }

    /// <summary>
    /// Enriquece un DTO con permisos bitmask calculados (Enterprise v2.1.1)
    /// </summary>
    private async Task<CredentialDto> EnrichWithPermissionsAsync(CredentialDto dto, string userId)
    {
        var permissions = await _permissionBitMaskService.GetEffectivePermissionsAsync(userId, dto.Id);
        
        dto.PermissionBitMask = permissions;
        dto.CanReveal = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.RevealSecret);
        dto.CanUse = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.UseWithoutReveal);
        dto.CanEdit = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.EditMetadata);
        dto.CanUpdateSecret = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.UpdateSecret);
        dto.CanShare = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.ShareCredential);
        dto.CanDelete = _permissionBitMaskService.HasPermission(permissions, IPermissionBitMaskService.DeleteCredential);
        dto.CanViewAudit = await _permissionBitMaskService.CanViewAuditAsync(userId, dto.Id);
        
        // Calcular CanReshare: es owner, o tiene AllowReshare en su share
        dto.CanReshare = await CanUserReshareCredentialAsync(dto.Id, userId);
        
        return dto;
    }
    
    /// <summary>
    /// Verifica si el usuario puede re-compartir una credencial
    /// </summary>
    private async Task<bool> CanUserReshareCredentialAsync(int credentialId, string userId)
    {
        var credential = await _context.Credentials
            .Include(c => c.UserShares)
            .Include(c => c.GroupShares)
            .FirstOrDefaultAsync(c => c.Id == credentialId);
            
        if (credential == null) return false;
        
        // El owner siempre puede re-compartir
        if (credential.OwnerUserId == userId) return true;
        
        // Verificar si tiene AllowReshare en un UserShare directo
        var userShare = credential.UserShares.FirstOrDefault(us => us.UserId == userId);
        if (userShare?.AllowReshare == true) return true;
        
        // Verificar si tiene AllowReshare en algún GroupShare donde es miembro
        var userGroupIds = await _context.CredentialGroupMembers
            .Where(cgm => cgm.UserId == userId)
            .Select(cgm => cgm.GroupId)
            .ToListAsync();
            
        var hasGroupReshare = credential.GroupShares
            .Any(gs => userGroupIds.Contains(gs.GroupId) && gs.AllowReshare);
            
        return hasGroupReshare;
    }

    /// <summary>
    /// Enriquece una lista de DTOs con permisos bitmask
    /// </summary>
    private async Task<List<CredentialDto>> EnrichListWithPermissionsAsync(List<CredentialDto> dtos, string userId)
    {
        foreach (var dto in dtos)
        {
            await EnrichWithPermissionsAsync(dto, userId);
        }
        return dtos;
    }

    private static CredentialAuditLogDto MapAuditToDto(CredentialAuditLog a)
    {
        return new CredentialAuditLogDto
        {
            Id = a.Id,
            CredentialId = a.CredentialId,
            CredentialName = a.CredentialName,
            Action = a.Action,
            ChangedFields = a.ChangedFields,
            PerformedByUserId = a.PerformedByUserId,
            PerformedByUserName = a.PerformedByUserName,
            PerformedAt = a.PerformedAt,
            IpAddress = a.IpAddress
        };
    }

    // =============================================
    // Operaciones de Grupos
    // =============================================

    public async Task<List<CredentialGroupDto>> GetGroupsAsync(string userId)
    {
        var groups = await _context.CredentialGroups
            .Include(g => g.Owner)
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .Include(g => g.Credentials.Where(c => !c.IsDeleted))
            .Where(g => !g.IsDeleted)
            .Where(g => g.OwnerUserId == userId || g.Members.Any(m => m.UserId == userId))
            .OrderBy(g => g.Name)
            .ToListAsync();

        return groups.Select(g => MapGroupToDto(g, userId)).ToList();
    }

    public async Task<CredentialGroupDto?> GetGroupByIdAsync(int id, string userId)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Owner)
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .Include(g => g.Members)
            .ThenInclude(m => m.AddedByUser)
            .Include(g => g.Credentials.Where(c => !c.IsDeleted))
            .FirstOrDefaultAsync(g => g.Id == id && !g.IsDeleted);

        if (group == null)
            return null;

        // Verificar acceso
        if (group.OwnerUserId != userId && !group.Members.Any(m => m.UserId == userId))
            return null;

        return MapGroupToDto(group, userId);
    }

    public async Task<CredentialGroupDto?> CreateGroupAsync(CreateCredentialGroupRequest request, string userId, string? userName)
    {
        var group = new CredentialGroup
        {
            Name = request.Name,
            Description = request.Description,
            Color = request.Color,
            Icon = request.Icon,
            OwnerUserId = userId,
            CreatedAt = LocalClockAR.Now
        };

        // Agregar al creador como Owner del grupo
        group.Members.Add(new CredentialGroupMember
        {
            UserId = userId,
            Role = CredentialGroupRoles.Owner,
            ReceiveNotifications = true,
            AddedAt = LocalClockAR.Now
        });

        // Agregar miembros iniciales
        foreach (var memberReq in request.InitialMembers)
        {
            if (memberReq.UserId != userId) // No duplicar al owner
            {
                group.Members.Add(new CredentialGroupMember
                {
                    UserId = memberReq.UserId,
                    Role = memberReq.Role,
                    ReceiveNotifications = memberReq.ReceiveNotifications,
                    AddedByUserId = userId,
                    AddedAt = LocalClockAR.Now
                });
            }
        }

        _context.CredentialGroups.Add(group);
        await _context.SaveChangesAsync();

        // Notificar a los miembros agregados
        foreach (var member in group.Members.Where(m => m.UserId != userId))
        {
            try
            {
                await _notificationService.NotifyAddedToGroupAsync(group, userName ?? "Usuario", member.UserId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error al notificar al usuario {UserId} sobre su adición al grupo {GroupId}", member.UserId, group.Id);
            }
        }

        // Recargar con includes
        var createdGroup = await _context.CredentialGroups
            .Include(g => g.Owner)
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Id == group.Id);

        return createdGroup != null ? MapGroupToDto(createdGroup, userId) : null;
    }

    public async Task<CredentialGroupDto?> UpdateGroupAsync(int id, UpdateCredentialGroupRequest request, string userId, string? userName)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == id && !g.IsDeleted);

        if (group == null)
            return null;

        // Verificar permisos: solo owner o admin pueden actualizar
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        if (group.OwnerUserId != userId && (userMember == null || !CredentialGroupRoles.CanManageMembers(userMember.Role)))
            return null;

        group.Name = request.Name;
        group.Description = request.Description;
        group.Color = request.Color;
        group.Icon = request.Icon;
        group.UpdatedAt = LocalClockAR.Now;
        group.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        // Recargar con includes
        var updatedGroup = await _context.CredentialGroups
            .Include(g => g.Owner)
            .Include(g => g.Members)
            .ThenInclude(m => m.User)
            .FirstOrDefaultAsync(g => g.Id == group.Id);

        return updatedGroup != null ? MapGroupToDto(updatedGroup, userId) : null;
    }

    public async Task<bool> DeleteGroupAsync(int id, string userId, string? userName)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .Include(g => g.Credentials)
            .FirstOrDefaultAsync(g => g.Id == id && !g.IsDeleted);

        if (group == null)
            return false;

        // Solo el owner puede eliminar el grupo
        if (group.OwnerUserId != userId)
            return false;

        // Quitar credenciales del grupo (no eliminarlas)
        foreach (var credential in group.Credentials)
        {
            credential.GroupId = null;
        }

        group.IsDeleted = true;
        group.UpdatedAt = LocalClockAR.Now;
        group.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<CredentialGroupMemberDto?> AddGroupMemberAsync(int groupId, AddGroupMemberRequest request, string userId, string? userName)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return null;

        // Verificar permisos
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        if (group.OwnerUserId != userId && (userMember == null || !CredentialGroupRoles.CanManageMembers(userMember.Role)))
            return null;

        // Verificar si el usuario ya es miembro
        if (group.Members.Any(m => m.UserId == request.UserId))
            return null;

        var newMember = new CredentialGroupMember
        {
            GroupId = groupId,
            UserId = request.UserId,
            Role = request.Role,
            ReceiveNotifications = request.ReceiveNotifications,
            AddedByUserId = userId,
            AddedAt = LocalClockAR.Now
        };

        _context.CredentialGroupMembers.Add(newMember);
        await _context.SaveChangesAsync();

        // Notificar al usuario agregado
        try
        {
            await _notificationService.NotifyAddedToGroupAsync(group, userName ?? "Usuario", request.UserId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al notificar al usuario {UserId} sobre su adición al grupo {GroupId}", request.UserId, groupId);
        }

        // Recargar con includes
        var addedMember = await _context.CredentialGroupMembers
            .Include(m => m.User)
            .Include(m => m.AddedByUser)
            .FirstOrDefaultAsync(m => m.Id == newMember.Id);

        return addedMember != null ? MapMemberToDto(addedMember) : null;
    }

    public async Task<CredentialGroupMemberDto?> UpdateGroupMemberAsync(int groupId, int memberId, UpdateGroupMemberRequest request, string userId)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return null;

        // Verificar permisos
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        if (group.OwnerUserId != userId && (userMember == null || !CredentialGroupRoles.CanManageMembers(userMember.Role)))
            return null;

        var targetMember = group.Members.FirstOrDefault(m => m.Id == memberId);
        if (targetMember == null)
            return null;

        // No permitir cambiar el rol del owner
        if (targetMember.Role == CredentialGroupRoles.Owner)
            return null;

        targetMember.Role = request.Role;
        if (request.ReceiveNotifications.HasValue)
            targetMember.ReceiveNotifications = request.ReceiveNotifications.Value;

        await _context.SaveChangesAsync();

        // Recargar con includes
        var updatedMember = await _context.CredentialGroupMembers
            .Include(m => m.User)
            .Include(m => m.AddedByUser)
            .FirstOrDefaultAsync(m => m.Id == memberId);

        return updatedMember != null ? MapMemberToDto(updatedMember) : null;
    }

    public async Task<bool> RemoveGroupMemberAsync(int groupId, int memberId, string userId, string? userName)
    {
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return false;

        // Verificar permisos
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        if (group.OwnerUserId != userId && (userMember == null || !CredentialGroupRoles.CanManageMembers(userMember.Role)))
            return false;

        var targetMember = group.Members.FirstOrDefault(m => m.Id == memberId);
        if (targetMember == null)
            return false;

        // No permitir eliminar al owner
        if (targetMember.Role == CredentialGroupRoles.Owner)
            return false;

        var removedUserId = targetMember.UserId;
        _context.CredentialGroupMembers.Remove(targetMember);
        await _context.SaveChangesAsync();

        // Notificar al usuario removido
        try
        {
            await _notificationService.NotifyRemovedFromGroupAsync(group, userName ?? "Usuario", removedUserId);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error al notificar al usuario {UserId} sobre su remoción del grupo {GroupId}", removedUserId, groupId);
        }

        return true;
    }

    // =============================================
    // Credenciales de Grupo
    // =============================================

    public async Task<List<CredentialDto>?> GetGroupCredentialsAsync(int groupId, string userId)
    {
        // Verificar que el grupo existe y el usuario tiene acceso
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return null;

        // Verificar que el usuario es miembro del grupo o es el owner
        var isMember = group.OwnerUserId == userId || group.Members.Any(m => m.UserId == userId);
        if (!isMember)
            return null;

        // Obtener credenciales compartidas con el grupo
        var credentials = await _context.CredentialGroupShares
            .Where(cgs => cgs.GroupId == groupId)
            .Include(cgs => cgs.Credential)
                .ThenInclude(c => c!.Owner)
            .Include(cgs => cgs.Credential)
                .ThenInclude(c => c!.Servers)
            .Include(cgs => cgs.Credential)
                .ThenInclude(c => c!.GroupShares)
                    .ThenInclude(gs => gs.Group)
            .Include(cgs => cgs.Credential)
                .ThenInclude(c => c!.UserShares)
                    .ThenInclude(us => us.User)
            .Where(cgs => cgs.Credential != null && !cgs.Credential.IsDeleted)
            .Select(cgs => cgs.Credential!)
            .Distinct()
            .ToListAsync();

        var dtos = credentials.Select(c => MapToDto(c, userId)).ToList();
        return await EnrichListWithPermissionsAsync(dtos, userId);
    }

    public async Task<bool> AddCredentialToGroupAsync(int groupId, int credentialId, string permission, bool allowReshare, string userId, string? userName, string? ipAddress, string? userAgent)
    {
        // Verificar que el grupo existe
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return false;

        // Verificar que el usuario puede gestionar el grupo
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        var canManage = group.OwnerUserId == userId || (userMember != null && CredentialGroupRoles.CanManageMembers(userMember.Role));
        if (!canManage)
            return false;

        // Verificar que la credencial existe y pertenece al usuario o puede compartirla
        var credential = await _context.Credentials
            .Include(c => c.GroupShares)
            .Include(c => c.UserShares)
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar que el usuario puede compartir la credencial (owner o tiene AllowReshare)
        if (!await CanUserShareCredentialAsync(credential, userId))
            return false;

        // Verificar que no está ya compartida con el grupo
        if (credential.GroupShares.Any(gs => gs.GroupId == groupId))
            return false;

        // Crear el share
        var share = new CredentialGroupShare
        {
            CredentialId = credentialId,
            GroupId = groupId,
            SharedByUserId = userId,
            PermissionBitMask = PermissionStringToBitmask(permission),
            SharedAt = LocalClockAR.Now,
            AllowReshare = allowReshare
        };

        _context.CredentialGroupShares.Add(share);
        await _context.SaveChangesAsync();

        // Auditar
        await LogAuditAsync(credentialId, credential.Name, "SharedWithGroup", $"Compartida con grupo {group.Name}", userId, userName, ipAddress, userAgent);

        return true;
    }

    public async Task<bool> RemoveCredentialFromGroupAsync(int groupId, int credentialId, string userId, string? userName, string? ipAddress, string? userAgent)
    {
        // Verificar que el grupo existe
        var group = await _context.CredentialGroups
            .Include(g => g.Members)
            .FirstOrDefaultAsync(g => g.Id == groupId && !g.IsDeleted);

        if (group == null)
            return false;

        // Verificar que el usuario puede gestionar el grupo o es el owner de la credencial
        var userMember = group.Members.FirstOrDefault(m => m.UserId == userId);
        var canManageGroup = group.OwnerUserId == userId || (userMember != null && CredentialGroupRoles.CanManageMembers(userMember.Role));

        var credential = await _context.Credentials
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        var isCredentialOwner = credential.OwnerUserId == userId;

        // Debe poder gestionar el grupo O ser el owner de la credencial
        if (!canManageGroup && !isCredentialOwner)
            return false;

        // Buscar y eliminar el share
        var share = await _context.CredentialGroupShares
            .FirstOrDefaultAsync(s => s.GroupId == groupId && s.CredentialId == credentialId);

        if (share == null)
            return false;

        _context.CredentialGroupShares.Remove(share);
        await _context.SaveChangesAsync();

        // Auditar
        await LogAuditAsync(credentialId, credential.Name, "UnsharedFromGroup", $"Removida del grupo {group.Name}", userId, userName, ipAddress, userAgent);

        return true;
    }

    public async Task<List<CredentialDto>> GetMyShareableCredentialsAsync(string userId)
    {
        // Obtener credenciales propias que no son privadas
        var credentials = await _context.Credentials
            .Include(c => c.Owner)
            .Include(c => c.Servers)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.Group)
            .Include(c => c.UserShares).ThenInclude(us => us.User)
            .Where(c => !c.IsDeleted && c.OwnerUserId == userId && !c.IsPrivate)
            .OrderBy(c => c.Name)
            .ToListAsync();

        var dtos = credentials.Select(c => MapToDto(c, userId)).ToList();
        return await EnrichListWithPermissionsAsync(dtos, userId);
    }

    public async Task<List<VaultUserDto>> GetAvailableUsersAsync()
    {
        var users = await _context.Users
            .Where(u => u.IsActive)
            .Select(u => new VaultUserDto
            {
                Id = u.Id,
                UserName = u.UserName ?? "",
                DisplayName = u.DisplayName,
                Email = u.Email
            })
            .OrderBy(u => u.DisplayName ?? u.UserName)
            .ToListAsync();

        return users;
    }

    // =============================================
    // Mapeo de Grupos
    // =============================================

    private static CredentialGroupDto MapGroupToDto(CredentialGroup g, string userId)
    {
        var userMember = g.Members.FirstOrDefault(m => m.UserId == userId);
        
        return new CredentialGroupDto
        {
            Id = g.Id,
            Name = g.Name,
            Description = g.Description,
            Color = g.Color,
            Icon = g.Icon,
            OwnerUserId = g.OwnerUserId,
            OwnerUserName = g.Owner?.DisplayName ?? g.Owner?.UserName ?? "Unknown",
            CreatedAt = g.CreatedAt,
            UpdatedAt = g.UpdatedAt,
            CredentialsCount = g.Credentials.Count,
            MembersCount = g.Members.Count,
            Members = g.Members.Select(MapMemberToDto).ToList(),
            UserRole = g.OwnerUserId == userId ? CredentialGroupRoles.Owner : (userMember?.Role ?? "")
        };
    }

    private static CredentialGroupMemberDto MapMemberToDto(CredentialGroupMember m)
    {
        return new CredentialGroupMemberDto
        {
            Id = m.Id,
            UserId = m.UserId,
            UserName = m.User?.UserName ?? "",
            DisplayName = m.User?.DisplayName,
            Email = m.User?.Email,
            Role = m.Role,
            ReceiveNotifications = m.ReceiveNotifications,
            AddedAt = m.AddedAt,
            AddedByUserName = m.AddedByUser?.DisplayName ?? m.AddedByUser?.UserName
        };
    }

    // =============================================
    // Compartición de Credenciales
    // =============================================

    public async Task<bool> ShareCredentialAsync(
        int credentialId,
        ShareCredentialRequest request,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .Include(c => c.GroupShares)
            .Include(c => c.UserShares)
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar que el usuario puede compartir (owner o admin del grupo)
        if (!await CanUserShareCredentialAsync(credential, userId))
        {
            _logger.LogWarning("Usuario {UserId} intentó compartir credencial {CredentialId} sin permiso", userId, credentialId);
            return false;
        }

        var changes = new List<string>();

        // Compartir con grupos
        if (request.GroupIds != null && request.GroupIds.Any())
        {
            foreach (var groupId in request.GroupIds)
            {
                // Verificar que el grupo existe
                var groupExists = await _context.CredentialGroups.AnyAsync(g => g.Id == groupId && !g.IsDeleted);
                if (!groupExists) continue;

                // Verificar que no esté ya compartida con este grupo
                var newBitmask = PermissionStringToBitmask(request.Permission);
                var existingShare = credential.GroupShares.FirstOrDefault(gs => gs.GroupId == groupId);
                if (existingShare != null)
                {
                    // Actualizar permiso si es diferente
                    if (existingShare.PermissionBitMask != newBitmask)
                    {
                        existingShare.PermissionBitMask = newBitmask;
                        changes.Add($"Grupo {groupId} permiso actualizado a {request.Permission}");
                    }
                }
                else
                {
                    // Crear nueva compartición
                    var share = new CredentialGroupShare
                    {
                        CredentialId = credentialId,
                        GroupId = groupId,
                        SharedByUserId = userId,
                        PermissionBitMask = newBitmask,
                        SharedAt = LocalClockAR.Now,
                        AllowReshare = request.AllowReshare
                    };
                    _context.CredentialGroupShares.Add(share);
                    changes.Add($"Compartida con grupo {groupId}");
                }
            }
        }

        // Compartir con usuarios
        if (request.UserIds != null && request.UserIds.Any())
        {
            foreach (var targetUserId in request.UserIds)
            {
                // No compartir consigo mismo
                if (targetUserId == userId) continue;

                // Verificar que el usuario existe
                var userExists = await _context.Users.AnyAsync(u => u.Id == targetUserId && u.IsActive);
                if (!userExists) continue;

                // Verificar que no esté ya compartida con este usuario
                var userNewBitmask = PermissionStringToBitmask(request.Permission);
                var existingShare = credential.UserShares.FirstOrDefault(us => us.UserId == targetUserId);
                if (existingShare != null)
                {
                    // Actualizar permiso si es diferente
                    if (existingShare.PermissionBitMask != userNewBitmask)
                    {
                        existingShare.PermissionBitMask = userNewBitmask;
                        changes.Add($"Usuario {targetUserId} permiso actualizado a {request.Permission}");
                    }
                }
                else
                {
                    // Crear nueva compartición
                    var share = new CredentialUserShare
                    {
                        CredentialId = credentialId,
                        UserId = targetUserId,
                        SharedByUserId = userId,
                        PermissionBitMask = userNewBitmask,
                        SharedAt = LocalClockAR.Now,
                        AllowReshare = request.AllowReshare
                    };
                    _context.CredentialUserShares.Add(share);
                    changes.Add($"Compartida con usuario {targetUserId}");
                }
            }
        }

        credential.UpdatedAt = LocalClockAR.Now;
        credential.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        // Registrar auditoría
        if (changes.Any())
        {
            await LogAuditAsync(credential.Id, credential.Name, "Shared", string.Join("; ", changes), userId, userName, ipAddress, userAgent);
        }

        // Enviar notificaciones a los usuarios con los que se compartió
        try
        {
            var sharerName = userName ?? "Usuario";

            // Notificar a usuarios compartidos directamente (solo los nuevos)
            if (request.UserIds != null && request.UserIds.Any())
            {
                foreach (var targetUserId in request.UserIds)
                {
                    if (targetUserId == userId) continue;
                    // Solo notificar si es una nueva compartición (no actualización de permisos)
                    if (changes.Any(c => c.Contains($"Compartida con usuario {targetUserId}")))
                    {
                        await _notificationService.NotifyCredentialSharedAsync(credential, sharerName, targetUserId);
                    }
                }
            }

            // Notificar a miembros de grupos compartidos (solo los nuevos)
            if (request.GroupIds != null && request.GroupIds.Any())
            {
                foreach (var groupId in request.GroupIds)
                {
                    // Solo notificar si es una nueva compartición con el grupo
                    if (changes.Any(c => c.Contains($"Compartida con grupo {groupId}")))
                    {
                        var groupMembers = await _context.Set<CredentialGroupMember>()
                            .Where(m => m.GroupId == groupId && m.UserId != userId)
                            .Select(m => m.UserId)
                            .ToListAsync();

                        foreach (var memberId in groupMembers)
                        {
                            await _notificationService.NotifyCredentialSharedAsync(credential, sharerName, memberId);
                        }
                    }
                }
            }
        }
        catch (Exception notifyEx)
        {
            _logger.LogWarning(notifyEx, "Error al enviar notificación de credencial compartida {CredentialId}", credential.Id);
        }

        return true;
    }

    public async Task<bool> UnshareFromGroupAsync(
        int credentialId,
        int groupId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .Include(c => c.GroupShares)
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar que el usuario puede descompartir
        if (!await CanUserShareCredentialAsync(credential, userId))
            return false;

        var share = credential.GroupShares.FirstOrDefault(gs => gs.GroupId == groupId);
        if (share == null)
            return false;

        _context.CredentialGroupShares.Remove(share);
        credential.UpdatedAt = LocalClockAR.Now;
        credential.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        await LogAuditAsync(credential.Id, credential.Name, "Unshared", $"Removida de grupo {groupId}", userId, userName, ipAddress, userAgent);

        return true;
    }

    public async Task<bool> UnshareFromUserAsync(
        int credentialId,
        string targetUserId,
        string userId,
        string? userName,
        string? ipAddress,
        string? userAgent)
    {
        var credential = await _context.Credentials
            .Include(c => c.UserShares)
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
            return false;

        // Verificar que el usuario puede descompartir
        if (!await CanUserShareCredentialAsync(credential, userId))
            return false;

        var share = credential.UserShares.FirstOrDefault(us => us.UserId == targetUserId);
        if (share == null)
            return false;

        _context.CredentialUserShares.Remove(share);
        credential.UpdatedAt = LocalClockAR.Now;
        credential.UpdatedByUserId = userId;

        await _context.SaveChangesAsync();

        await LogAuditAsync(credential.Id, credential.Name, "Unshared", $"Removida de usuario {targetUserId}", userId, userName, ipAddress, userAgent);

        return true;
    }

    public async Task<List<SharedWithMeCredentialDto>> GetCredentialsSharedWithMeAsync(string userId)
    {
        // Obtener credenciales compartidas directamente con el usuario
        var credentials = await _context.Credentials
            .Include(c => c.Servers)
            .Include(c => c.Owner)
            .Include(c => c.CreatedByUser)
            .Include(c => c.UpdatedByUser)
            .Include(c => c.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.Group)
            .Include(c => c.GroupShares).ThenInclude(gs => gs.SharedByUser)
            .Include(c => c.UserShares).ThenInclude(us => us.User)
            .Include(c => c.UserShares).ThenInclude(us => us.SharedByUser)
            .Where(c => !c.IsDeleted && c.OwnerUserId != userId)
            .Where(c => c.UserShares.Any(us => us.UserId == userId))
            .OrderByDescending(c => c.UserShares.Max(us => us.SharedAt))
            .ToListAsync();

        var result = new List<SharedWithMeCredentialDto>();
        foreach (var c in credentials)
        {
            var userShare = c.UserShares.First(us => us.UserId == userId);
            var dto = MapToDto(c, userId);
            var enrichedDto = await EnrichWithPermissionsAsync(dto, userId);
            
            result.Add(new SharedWithMeCredentialDto
            {
                Id = enrichedDto.Id,
                Name = enrichedDto.Name,
                CredentialType = enrichedDto.CredentialType,
                Username = enrichedDto.Username,
                Domain = enrichedDto.Domain,
                Description = enrichedDto.Description,
                Notes = enrichedDto.Notes,
                ExpiresAt = enrichedDto.ExpiresAt,
                IsPrivate = enrichedDto.IsPrivate,
                IsTeamShared = enrichedDto.IsTeamShared,
                GroupId = enrichedDto.GroupId,
                GroupName = enrichedDto.GroupName,
                GroupColor = enrichedDto.GroupColor,
                OwnerUserId = enrichedDto.OwnerUserId,
                OwnerDisplayName = enrichedDto.OwnerDisplayName,
                CreatedAt = enrichedDto.CreatedAt,
                UpdatedAt = enrichedDto.UpdatedAt,
                CreatedByDisplayName = enrichedDto.CreatedByDisplayName,
                UpdatedByDisplayName = enrichedDto.UpdatedByDisplayName,
                Servers = enrichedDto.Servers,
                GroupShares = enrichedDto.GroupShares,
                UserShares = enrichedDto.UserShares,
                CurrentUserPermission = enrichedDto.CurrentUserPermission,
                // Campos bitmask
                PermissionBitMask = enrichedDto.PermissionBitMask,
                CanReveal = enrichedDto.CanReveal,
                CanUse = enrichedDto.CanUse,
                CanEdit = enrichedDto.CanEdit,
                CanUpdateSecret = enrichedDto.CanUpdateSecret,
                CanShare = enrichedDto.CanShare,
                CanDelete = enrichedDto.CanDelete,
                CanViewAudit = enrichedDto.CanViewAudit,
                CanReshare = enrichedDto.CanReshare,
                // Campos específicos de SharedWithMe
                SharedByUserId = userShare.SharedByUserId,
                SharedByUserName = userShare.SharedByUser?.DisplayName ?? userShare.SharedByUser?.UserName,
                SharedAt = userShare.SharedAt,
                MyPermission = BitmaskToPermissionString(userShare.PermissionBitMask)
            });
        }
        return result;
    }

    private async Task<bool> CanUserShareCredentialAsync(Credential credential, string userId)
    {
        // El propietario siempre puede compartir
        if (credential.OwnerUserId == userId)
            return true;

        // Verificar si tiene AllowReshare en un UserShare directo
        var userShare = credential.UserShares.FirstOrDefault(us => us.UserId == userId);
        if (userShare?.AllowReshare == true)
            return true;

        // Verificar si tiene AllowReshare en algún GroupShare donde es miembro
        foreach (var groupShare in credential.GroupShares)
        {
            if (groupShare.AllowReshare)
            {
                var isMember = await _context.CredentialGroupMembers
                    .AnyAsync(m => m.GroupId == groupShare.GroupId && m.UserId == userId);
                if (isMember)
                    return true;
            }
        }

        // Verificar si es admin en algún grupo donde está compartida la credencial (permiso legacy)
        foreach (var groupShare in credential.GroupShares)
        {
            // ShareCredential (64) indica permiso Admin
            if ((groupShare.PermissionBitMask & 64) != 0)
            {
                var isGroupAdmin = await _context.CredentialGroupMembers
                    .AnyAsync(m => m.GroupId == groupShare.GroupId && 
                                   m.UserId == userId && 
                                   (m.Role == CredentialGroupRoles.Owner || m.Role == CredentialGroupRoles.Admin));
                if (isGroupAdmin)
                    return true;
            }
        }

        return false;
    }
}

