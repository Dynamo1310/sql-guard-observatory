using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de permisos bitmask para Vault Enterprise v2.1.1
/// </summary>
public class PermissionBitMaskService : IPermissionBitMaskService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<PermissionBitMaskService> _logger;

    // Bitmask para Owner (todos los permisos)
    private const long OwnerPermissions = 
        IPermissionBitMaskService.ViewMetadata |
        IPermissionBitMaskService.RevealSecret |
        IPermissionBitMaskService.UseWithoutReveal |
        IPermissionBitMaskService.EditMetadata |
        IPermissionBitMaskService.UpdateSecret |
        IPermissionBitMaskService.ManageServers |
        IPermissionBitMaskService.ShareCredential |
        IPermissionBitMaskService.DeleteCredential |
        IPermissionBitMaskService.RestoreCredential |
        IPermissionBitMaskService.ViewAudit;

    public PermissionBitMaskService(ApplicationDbContext context, ILogger<PermissionBitMaskService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public bool HasPermission(long bitmask, long permission)
    {
        return (bitmask & permission) == permission;
    }

    public async Task<long> GetEffectivePermissionsAsync(string userId, int credentialId)
    {
        // 1. Verificar si es owner - tiene todos los permisos
        var credential = await _context.Credentials
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == credentialId && !c.IsDeleted);

        if (credential == null)
        {
            return 0;
        }

        // Owner tiene todos los permisos
        if (credential.OwnerUserId == userId)
        {
            return OwnerPermissions;
        }

        // 2. Verificar si es team shared (todos pueden ver)
        if (credential.IsTeamShared)
        {
            // Team shared da ViewMetadata + RevealSecret (comportamiento legacy)
            return IPermissionBitMaskService.ViewMetadata | IPermissionBitMaskService.RevealSecret;
        }

        long effectivePermissions = 0;

        // 3. Verificar shares directos al usuario
        var userShare = await _context.CredentialUserShares
            .AsNoTracking()
            .FirstOrDefaultAsync(us => us.CredentialId == credentialId && us.UserId == userId);

        if (userShare != null)
        {
            // Usar PermissionBitMask directamente (post Phase 8)
            effectivePermissions |= userShare.PermissionBitMask;
        }

        // 4. Verificar shares de grupo
        var userGroupIds = await _context.CredentialGroupMembers
            .AsNoTracking()
            .Where(m => m.UserId == userId)
            .Select(m => m.GroupId)
            .ToListAsync();

        if (userGroupIds.Any())
        {
            var groupShares = await _context.CredentialGroupShares
                .AsNoTracking()
                .Where(gs => gs.CredentialId == credentialId && userGroupIds.Contains(gs.GroupId))
                .ToListAsync();

            foreach (var groupShare in groupShares)
            {
                // Usar PermissionBitMask directamente (post Phase 8)
                effectivePermissions |= groupShare.PermissionBitMask;
            }
        }

        // 5. Legacy: verificar si pertenece al grupo de la credencial
        if (credential.GroupId.HasValue && userGroupIds.Contains(credential.GroupId.Value))
        {
            // Legacy group membership da ViewMetadata + RevealSecret
            effectivePermissions |= IPermissionBitMaskService.ViewMetadata | IPermissionBitMaskService.RevealSecret;
        }

        return effectivePermissions;
    }

    public async Task<bool> CanRevealAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.RevealSecret);
    }

    public async Task<bool> CanUseAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.UseWithoutReveal);
    }

    public async Task<bool> CanEditAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.EditMetadata);
    }

    public async Task<bool> CanUpdateSecretAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.UpdateSecret);
    }

    public async Task<bool> CanShareAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.ShareCredential);
    }

    public async Task<bool> CanDeleteAsync(string userId, int credentialId)
    {
        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.DeleteCredential);
    }

    public async Task<bool> CanViewAuditAsync(string userId, int credentialId)
    {
        // Owner siempre puede ver audit de sus credenciales
        var credential = await _context.Credentials
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.Id == credentialId);

        if (credential?.OwnerUserId == userId)
        {
            return true;
        }

        var permissions = await GetEffectivePermissionsAsync(userId, credentialId);
        return HasPermission(permissions, IPermissionBitMaskService.ViewAudit);
    }

    /// <summary>
    /// Mapea permisos legacy (string) a bitmask
    /// Comportamiento conservador: View incluye RevealSecret para no romper funcionalidad existente
    /// </summary>
    private static long MapLegacyPermissionToBitmask(string permission)
    {
        return permission?.ToLower() switch
        {
            "view" => IPermissionBitMaskService.ViewMetadata | IPermissionBitMaskService.RevealSecret, // Viewer
            "edit" => IPermissionBitMaskService.ViewMetadata | 
                      IPermissionBitMaskService.RevealSecret | 
                      IPermissionBitMaskService.EditMetadata | 
                      IPermissionBitMaskService.ManageServers, // Editor
            "admin" => IPermissionBitMaskService.ViewMetadata | 
                       IPermissionBitMaskService.RevealSecret | 
                       IPermissionBitMaskService.UseWithoutReveal |
                       IPermissionBitMaskService.EditMetadata | 
                       IPermissionBitMaskService.UpdateSecret |
                       IPermissionBitMaskService.ManageServers |
                       IPermissionBitMaskService.ShareCredential |
                       IPermissionBitMaskService.DeleteCredential |
                       IPermissionBitMaskService.ViewAudit, // Admin (todo excepto restore)
            _ => IPermissionBitMaskService.ViewMetadata // Fallback: solo metadata
        };
    }
}

