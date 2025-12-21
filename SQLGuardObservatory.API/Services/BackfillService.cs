using System.Diagnostics;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de backfill para migrar credenciales al formato enterprise.
/// 
/// IMPORTANTE: Ejecutar este servicio durante la ventana de mantenimiento.
/// El proceso es idempotente y puede ejecutarse múltiples veces.
/// </summary>
public class BackfillService : IBackfillService
{
    private readonly ApplicationDbContext _context;
    private readonly ICryptoService _legacyCryptoService;
    private readonly IDualReadCryptoService _dualReadCryptoService;
    private readonly IKeyManager _keyManager;
    private readonly ILogger<BackfillService> _logger;

    public BackfillService(
        ApplicationDbContext context,
        ICryptoService legacyCryptoService,
        IDualReadCryptoService dualReadCryptoService,
        IKeyManager keyManager,
        ILogger<BackfillService> logger)
    {
        _context = context;
        _legacyCryptoService = legacyCryptoService;
        _dualReadCryptoService = dualReadCryptoService;
        _keyManager = keyManager;
        _logger = logger;
    }

    public async Task<BackfillResult> ExecuteBackfillAsync(int batchSize = 100, CancellationToken cancellationToken = default)
    {
        var result = new BackfillResult();
        var stopwatch = Stopwatch.StartNew();

        _logger.LogInformation("Iniciando backfill de credenciales. BatchSize: {BatchSize}", batchSize);

        try
        {
            // Verificar que existe una llave activa
            var activeKey = _keyManager.GetActiveKeyForPurpose("CredentialPassword");
            _logger.LogInformation("Usando KeyId: {KeyId}, Version: {Version}", activeKey.KeyId, activeKey.Version);

            // Procesar en lotes
            int processed = 0;
            bool hasMore = true;

            while (hasMore && !cancellationToken.IsCancellationRequested)
            {
                // Obtener credenciales pendientes de migración
                var pendingCredentials = await _context.Credentials
                    .Where(c => !c.IsMigratedToV2 && !c.IsDeleted)
                    .OrderBy(c => c.Id)
                    .Take(batchSize)
                    .ToListAsync(cancellationToken);

                if (pendingCredentials.Count == 0)
                {
                    hasMore = false;
                    continue;
                }

                foreach (var credential in pendingCredentials)
                {
                    try
                    {
                        await MigrateCredentialAsync(credential, activeKey);
                        result.Successful++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error migrando credencial {CredentialId}: {Name}", 
                            credential.Id, credential.Name);
                        
                        result.Failed++;
                        result.Errors.Add(new BackfillError
                        {
                            CredentialId = credential.Id,
                            CredentialName = credential.Name,
                            ErrorMessage = ex.Message,
                            OccurredAt = DateTime.UtcNow
                        });
                    }

                    processed++;
                    result.TotalProcessed = processed;

                    if (processed % 50 == 0)
                    {
                        _logger.LogInformation("Progreso: {Processed} credenciales procesadas", processed);
                    }
                }

                // Guardar cambios del lote
                await _context.SaveChangesAsync(cancellationToken);

                if (pendingCredentials.Count < batchSize)
                {
                    hasMore = false;
                }
            }

            result.IsComplete = !hasMore;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fatal durante el backfill");
            throw;
        }
        finally
        {
            stopwatch.Stop();
            result.Duration = stopwatch.Elapsed;
            
            _logger.LogInformation(
                "Backfill completado. Total: {Total}, Exitosos: {Success}, Fallidos: {Failed}, Duración: {Duration}",
                result.TotalProcessed, result.Successful, result.Failed, result.Duration);
        }

        return result;
    }

    private async Task MigrateCredentialAsync(Credential credential, VaultKey activeKey)
    {
        // 1. Descifrar usando el formato legacy
        string plainPassword;
        try
        {
            plainPassword = _legacyCryptoService.Decrypt(
                credential.EncryptedPassword,
                credential.Salt,
                credential.IV);
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException(
                $"No se pudo descifrar la credencial {credential.Id} con formato legacy: {ex.Message}", ex);
        }

        // 2. Re-cifrar usando el formato enterprise
        var encryptedData = _dualReadCryptoService.EncryptWithEnterprise(plainPassword, "CredentialPassword");

        // 3. Actualizar la credencial con el nuevo formato
        credential.EncryptedPasswordBin = encryptedData.CipherText;
        credential.SaltBin = encryptedData.Salt;
        credential.IVBin = encryptedData.IV;
        credential.AuthTagBin = encryptedData.AuthTag;
        credential.KeyId = encryptedData.KeyId;
        credential.KeyVersion = encryptedData.KeyVersion;
        credential.IsMigratedToV2 = true;

        // 4. Verificar que se puede descifrar el nuevo formato
        try
        {
            var verifyPassword = _dualReadCryptoService.DecryptCredentialPassword(
                true,
                null, null, null,
                credential.EncryptedPasswordBin,
                credential.SaltBin,
                credential.IVBin,
                credential.AuthTagBin,
                credential.KeyId,
                credential.KeyVersion);

            if (verifyPassword != plainPassword)
            {
                throw new InvalidOperationException("La verificación post-cifrado falló: los passwords no coinciden");
            }
        }
        catch (Exception ex)
        {
            // Revertir cambios si la verificación falla
            credential.EncryptedPasswordBin = null;
            credential.SaltBin = null;
            credential.IVBin = null;
            credential.AuthTagBin = null;
            credential.KeyId = null;
            credential.KeyVersion = null;
            credential.IsMigratedToV2 = false;

            throw new InvalidOperationException(
                $"Verificación post-migración falló para credencial {credential.Id}: {ex.Message}", ex);
        }

        _logger.LogDebug("Credencial {Id} migrada exitosamente", credential.Id);
    }

    public async Task<BackfillStatus> GetStatusAsync()
    {
        var total = await _context.Credentials.CountAsync(c => !c.IsDeleted);
        var migrated = await _context.Credentials.CountAsync(c => !c.IsDeleted && c.IsMigratedToV2);
        var pending = total - migrated;

        return new BackfillStatus
        {
            TotalCredentials = total,
            MigratedCredentials = migrated,
            PendingCredentials = pending,
            LastBackfillAt = null // Se podría obtener de VaultMigrationLog
        };
    }

    public async Task<ValidationResult> ValidateMigratedCredentialsAsync()
    {
        var result = new ValidationResult();
        
        var migratedCredentials = await _context.Credentials
            .Where(c => c.IsMigratedToV2 && !c.IsDeleted)
            .ToListAsync();

        foreach (var credential in migratedCredentials)
        {
            result.TotalValidated++;

            bool canDecryptLegacy = false;
            bool canDecryptEnterprise = false;

            // Verificar descifrado legacy
            try
            {
                _legacyCryptoService.Decrypt(
                    credential.EncryptedPassword,
                    credential.Salt,
                    credential.IV);
                canDecryptLegacy = true;
            }
            catch
            {
                // Legacy puede fallar si ya se limpiaron los datos
            }

            // Verificar descifrado enterprise
            try
            {
                if (credential.EncryptedPasswordBin != null &&
                    credential.SaltBin != null &&
                    credential.IVBin != null &&
                    credential.AuthTagBin != null &&
                    credential.KeyId.HasValue &&
                    credential.KeyVersion.HasValue)
                {
                    _dualReadCryptoService.DecryptCredentialPassword(
                        true,
                        null, null, null,
                        credential.EncryptedPasswordBin,
                        credential.SaltBin,
                        credential.IVBin,
                        credential.AuthTagBin,
                        credential.KeyId,
                        credential.KeyVersion);
                    canDecryptEnterprise = true;
                }
            }
            catch (Exception ex)
            {
                result.InvalidCount++;
                result.Errors.Add(new ValidationError
                {
                    CredentialId = credential.Id,
                    CredentialName = credential.Name,
                    ValidationError_ = ex.Message,
                    CanDecryptLegacy = canDecryptLegacy,
                    CanDecryptEnterprise = canDecryptEnterprise
                });
                continue;
            }

            if (canDecryptEnterprise)
            {
                result.ValidCount++;
            }
            else
            {
                result.InvalidCount++;
                result.Errors.Add(new ValidationError
                {
                    CredentialId = credential.Id,
                    CredentialName = credential.Name,
                    ValidationError_ = "No se pudo descifrar con formato enterprise",
                    CanDecryptLegacy = canDecryptLegacy,
                    CanDecryptEnterprise = false
                });
            }
        }

        _logger.LogInformation(
            "Validación completada. Total: {Total}, Válidas: {Valid}, Inválidas: {Invalid}",
            result.TotalValidated, result.ValidCount, result.InvalidCount);

        return result;
    }

    public async Task<bool> RevertCredentialAsync(int credentialId)
    {
        var credential = await _context.Credentials.FindAsync(credentialId);
        if (credential == null) return false;

        // Verificar que podemos descifrar el formato legacy antes de revertir
        try
        {
            _legacyCryptoService.Decrypt(
                credential.EncryptedPassword,
                credential.Salt,
                credential.IV);
        }
        catch
        {
            _logger.LogError("No se puede revertir credencial {Id}: el formato legacy no es válido", credentialId);
            return false;
        }

        // Limpiar campos enterprise
        credential.EncryptedPasswordBin = null;
        credential.SaltBin = null;
        credential.IVBin = null;
        credential.AuthTagBin = null;
        credential.KeyId = null;
        credential.KeyVersion = null;
        credential.IsMigratedToV2 = false;

        await _context.SaveChangesAsync();
        
        _logger.LogInformation("Credencial {Id} revertida al formato legacy", credentialId);
        return true;
    }
}

