namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio para evaluar permisos usando bitmask (Vault Enterprise v2.1.1)
/// </summary>
public interface IPermissionBitMaskService
{
    // Constantes de bits - deben coincidir con PermissionTypes.BitFlag en DB
    const long ViewMetadata = 1;
    const long RevealSecret = 2;
    const long UseWithoutReveal = 4;
    const long EditMetadata = 8;
    const long UpdateSecret = 16;       // Permiso para actualizar password guardado (manual)
    const long ManageServers = 32;
    const long ShareCredential = 64;
    const long DeleteCredential = 128;
    const long RestoreCredential = 256;
    const long ViewAudit = 512;

    /// <summary>
    /// Verifica si un bitmask incluye un permiso específico
    /// </summary>
    bool HasPermission(long bitmask, long permission);

    /// <summary>
    /// Obtiene los permisos efectivos de un usuario sobre una credencial
    /// Considera: owner, shares directos, shares de grupo
    /// </summary>
    Task<long> GetEffectivePermissionsAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede revelar el secreto
    /// </summary>
    Task<bool> CanRevealAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede usar sin revelar
    /// </summary>
    Task<bool> CanUseAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede editar metadata
    /// </summary>
    Task<bool> CanEditAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede actualizar el secreto guardado
    /// </summary>
    Task<bool> CanUpdateSecretAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede compartir la credencial
    /// </summary>
    Task<bool> CanShareAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede eliminar la credencial
    /// </summary>
    Task<bool> CanDeleteAsync(string userId, int credentialId);

    /// <summary>
    /// Verifica si el usuario puede ver audit logs
    /// </summary>
    Task<bool> CanViewAuditAsync(string userId, int credentialId);
}

