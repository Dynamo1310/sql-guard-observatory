using System.Security.Cryptography;
using System.Text;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de criptografía con soporte dual-read.
/// Permite leer credenciales tanto en formato legacy (Base64) como enterprise (VARBINARY).
/// 
/// IMPORTANTE: Este servicio es transitorio y debe usarse solo durante la migración.
/// Una vez completada la migración, usar solo CryptoServiceV2.
/// </summary>
public class DualReadCryptoService : IDualReadCryptoService
{
    private readonly ICryptoService _legacyCryptoService;
    private readonly ICryptoServiceV2 _enterpriseCryptoService;
    private readonly IKeyManager _keyManager;
    private readonly ILogger<DualReadCryptoService> _logger;

    public DualReadCryptoService(
        ICryptoService legacyCryptoService,
        ICryptoServiceV2 enterpriseCryptoService,
        IKeyManager keyManager,
        ILogger<DualReadCryptoService> logger)
    {
        _legacyCryptoService = legacyCryptoService;
        _enterpriseCryptoService = enterpriseCryptoService;
        _keyManager = keyManager;
        _logger = logger;
    }

    public string DecryptCredentialPassword(
        bool isMigratedToV2,
        string? encryptedPasswordBase64,
        string? saltBase64,
        string? ivBase64,
        byte[]? encryptedPasswordBin,
        byte[]? saltBin,
        byte[]? ivBin,
        byte[]? authTagBin,
        Guid? keyId,
        int? keyVersion)
    {
        // Si está migrado, usar formato enterprise
        if (isMigratedToV2)
        {
            return DecryptEnterprise(encryptedPasswordBin, saltBin, ivBin, authTagBin, keyId, keyVersion);
        }

        // Si no está migrado, usar formato legacy
        return DecryptLegacy(encryptedPasswordBase64, saltBase64, ivBase64);
    }

    public EncryptedCredentialData EncryptWithEnterprise(string plainText, string purpose = "CredentialPassword")
    {
        // Obtener la llave activa para el propósito
        var activeKey = _keyManager.GetActiveKeyForPurpose(purpose);
        
        // Cifrar usando el servicio enterprise
        var encryptedData = _enterpriseCryptoService.Encrypt(plainText, purpose);

        return new EncryptedCredentialData
        {
            CipherText = encryptedData.CipherText,
            Salt = encryptedData.Salt,
            IV = encryptedData.IV,
            AuthTag = encryptedData.AuthTag,
            KeyId = activeKey.KeyId,
            KeyVersion = activeKey.Version
        };
    }

    public bool CanDecrypt(
        bool isMigratedToV2,
        string? encryptedPasswordBase64,
        string? saltBase64,
        string? ivBase64,
        byte[]? encryptedPasswordBin,
        byte[]? saltBin,
        byte[]? ivBin,
        byte[]? authTagBin,
        Guid? keyId,
        int? keyVersion)
    {
        try
        {
            var result = DecryptCredentialPassword(
                isMigratedToV2,
                encryptedPasswordBase64, saltBase64, ivBase64,
                encryptedPasswordBin, saltBin, ivBin, authTagBin,
                keyId, keyVersion);
            
            return !string.IsNullOrEmpty(result);
        }
        catch
        {
            return false;
        }
    }

    private string DecryptLegacy(string? cipherText, string? salt, string? iv)
    {
        if (string.IsNullOrEmpty(cipherText))
            throw new ArgumentException("EncryptedPassword (legacy) está vacío");
        if (string.IsNullOrEmpty(salt))
            throw new ArgumentException("Salt (legacy) está vacío");
        if (string.IsNullOrEmpty(iv))
            throw new ArgumentException("IV (legacy) está vacío");

        _logger.LogDebug("Descifrando credencial usando formato legacy (Base64)");
        return _legacyCryptoService.Decrypt(cipherText, salt, iv);
    }

    private string DecryptEnterprise(
        byte[]? cipherText,
        byte[]? salt,
        byte[]? iv,
        byte[]? authTag,
        Guid? keyId,
        int? keyVersion)
    {
        if (cipherText == null || cipherText.Length == 0)
            throw new ArgumentException("EncryptedPasswordBin está vacío");
        if (salt == null || salt.Length == 0)
            throw new ArgumentException("SaltBin está vacío");
        if (iv == null || iv.Length == 0)
            throw new ArgumentException("IVBin está vacío");
        if (authTag == null || authTag.Length == 0)
            throw new ArgumentException("AuthTagBin está vacío");
        if (!keyId.HasValue)
            throw new ArgumentException("KeyId es requerido para formato enterprise");
        if (!keyVersion.HasValue)
            throw new ArgumentException("KeyVersion es requerido para formato enterprise");

        _logger.LogDebug("Descifrando credencial usando formato enterprise (KeyId: {KeyId}, Version: {Version})", 
            keyId.Value, keyVersion.Value);

        var encryptedData = new EncryptedData
        {
            CipherText = cipherText,
            Salt = salt,
            IV = iv,
            AuthTag = authTag,
            KeyId = keyId.Value,
            KeyVersion = keyVersion.Value
        };

        return _enterpriseCryptoService.Decrypt(encryptedData);
    }
}

