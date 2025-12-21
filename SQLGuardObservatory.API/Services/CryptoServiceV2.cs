using System.Security.Cryptography;
using System.Text;
using SQLGuardObservatory.API.Exceptions;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Datos cifrados con metadatos de versionado de llave
/// </summary>
public record EncryptedData
{
    /// <summary>Solo el ciphertext (sin tag)</summary>
    public required byte[] CipherText { get; init; }
    
    /// <summary>Salt para KDF (32 bytes)</summary>
    public required byte[] Salt { get; init; }
    
    /// <summary>IV/Nonce para AES-GCM (12 bytes)</summary>
    public required byte[] IV { get; init; }
    
    /// <summary>Tag de autenticación (16 bytes)</summary>
    public required byte[] AuthTag { get; init; }
    
    /// <summary>Identificador del stream de llaves</summary>
    public required Guid KeyId { get; init; }
    
    /// <summary>Versión de la llave usada</summary>
    public required int KeyVersion { get; init; }
    
    /// <summary>Indica si los datos están en formato legacy (Base64 string)</summary>
    public bool IsLegacyFormat { get; init; }
}

/// <summary>
/// Servicio de cifrado V2 para el Vault de Credenciales
/// 
/// Mejoras sobre V1:
/// - Versionado de llaves (KeyId + KeyVersion)
/// - Validaciones estrictas de tamaños
/// - Soporte para datos binarios (VARBINARY)
/// - Compatibilidad con formato legacy (Base64)
/// 
/// Contrato KDF fijo (v2.1.1):
/// - Algorithm: PBKDF2
/// - PRF: HMAC-SHA512
/// - Iterations: 600,000
/// - Output Length: 32 bytes (256 bits)
/// - Salt Length: 32 bytes
/// 
/// IMPORTANTE: Estos parámetros NO se almacenan por registro.
/// Un cambio de parámetros requiere nuevo KeyVersion y re-cifrado.
/// </summary>
public class CryptoServiceV2 : ICryptoServiceV2
{
    private readonly IKeyManager _keyManager;
    private readonly ILogger<CryptoServiceV2> _logger;
    
    // Constantes públicas - contrato versionado v2.1.1
    public const int SALT_SIZE = 32;      // 256 bits para KDF
    public const int IV_SIZE = 12;        // 96 bits para GCM (NIST SP 800-38D)
    public const int TAG_SIZE = 16;       // 128 bits para autenticación
    public const int KEY_SIZE = 32;       // 256 bits para AES-256
    public const int PBKDF2_ITERATIONS = 600_000;  // OWASP 2024
    public const string PBKDF2_HASH = "SHA512";
    
    public CryptoServiceV2(IKeyManager keyManager, ILogger<CryptoServiceV2> logger)
    {
        _keyManager = keyManager ?? throw new ArgumentNullException(nameof(keyManager));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }
    
    /// <summary>
    /// Cifra texto plano usando AES-256-GCM con la llave activa para el purpose indicado
    /// </summary>
    public EncryptedData Encrypt(string plainText, string purpose = "CredentialPassword")
    {
        if (string.IsNullOrEmpty(plainText))
            throw new ArgumentException("PlainText cannot be null or empty", nameof(plainText));
        
        var activeKey = _keyManager.GetActiveKeyForPurpose(purpose);
        
        var salt = RandomNumberGenerator.GetBytes(SALT_SIZE);
        var iv = RandomNumberGenerator.GetBytes(IV_SIZE);
        var derivedKey = DeriveKey(activeKey.Material, salt);
        
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TAG_SIZE];
        
        using var aesGcm = new AesGcm(derivedKey, TAG_SIZE);
        aesGcm.Encrypt(iv, plainBytes, cipherBytes, tag);
        
        // Limpiar clave derivada de memoria
        CryptographicOperations.ZeroMemory(derivedKey);
        
        var result = new EncryptedData
        {
            CipherText = cipherBytes,
            Salt = salt,
            IV = iv,
            AuthTag = tag,
            KeyId = activeKey.KeyId,
            KeyVersion = activeKey.Version,
            IsLegacyFormat = false
        };
        
        // Validar output antes de retornar
        ValidateCryptoSizes(result.CipherText, result.Salt, result.IV, result.AuthTag);
        
        return result;
    }
    
    /// <summary>
    /// Descifra datos cifrados con AES-256-GCM
    /// Soporta tanto formato nuevo (binario) como legacy (Base64)
    /// </summary>
    public string Decrypt(EncryptedData data)
    {
        if (data == null)
            throw new ArgumentNullException(nameof(data));
        
        // Validar ANTES de descifrar
        ValidateCryptoSizes(data.CipherText, data.Salt, data.IV, data.AuthTag);
        
        var key = _keyManager.GetKey(data.KeyId, data.KeyVersion);
        var derivedKey = DeriveKey(key.Material, data.Salt);
        
        try
        {
            var plainBytes = new byte[data.CipherText.Length];
            using var aesGcm = new AesGcm(derivedKey, TAG_SIZE);
            aesGcm.Decrypt(data.IV, data.CipherText, data.AuthTag, plainBytes);
            
            return Encoding.UTF8.GetString(plainBytes);
        }
        finally
        {
            // Limpiar clave derivada de memoria
            CryptographicOperations.ZeroMemory(derivedKey);
        }
    }
    
    /// <summary>
    /// Descifra datos en formato legacy (Base64 strings, ciphertext+tag concatenados)
    /// Para compatibilidad con datos existentes antes de la migración
    /// </summary>
    public string DecryptLegacy(string cipherTextBase64, string saltBase64, string ivBase64, Guid keyId, int keyVersion)
    {
        if (string.IsNullOrEmpty(cipherTextBase64))
            throw new ArgumentException("CipherText cannot be null or empty", nameof(cipherTextBase64));
        if (string.IsNullOrEmpty(saltBase64))
            throw new ArgumentException("Salt cannot be null or empty", nameof(saltBase64));
        if (string.IsNullOrEmpty(ivBase64))
            throw new ArgumentException("IV cannot be null or empty", nameof(ivBase64));
        
        // Decodificar Base64
        var combined = Convert.FromBase64String(cipherTextBase64);
        var salt = Convert.FromBase64String(saltBase64);
        var iv = Convert.FromBase64String(ivBase64);
        
        // Validar tamaños básicos
        if (combined.Length <= TAG_SIZE)
            throw new CryptoValidationException($"Combined ciphertext+tag too short: {combined.Length} bytes");
        if (salt.Length != SALT_SIZE)
            throw new CryptoValidationException($"Salt must be exactly {SALT_SIZE} bytes, got {salt.Length}");
        if (iv.Length != IV_SIZE)
            throw new CryptoValidationException($"IV must be exactly {IV_SIZE} bytes, got {iv.Length}");
        
        // Separar ciphertext y tag (formato legacy: ciphertext || tag)
        var cipherBytes = new byte[combined.Length - TAG_SIZE];
        var tag = new byte[TAG_SIZE];
        Buffer.BlockCopy(combined, 0, cipherBytes, 0, cipherBytes.Length);
        Buffer.BlockCopy(combined, cipherBytes.Length, tag, 0, TAG_SIZE);
        
        var data = new EncryptedData
        {
            CipherText = cipherBytes,
            Salt = salt,
            IV = iv,
            AuthTag = tag,
            KeyId = keyId,
            KeyVersion = keyVersion,
            IsLegacyFormat = true
        };
        
        return Decrypt(data);
    }
    
    /// <summary>
    /// Valida que los tamaños de los componentes criptográficos sean correctos
    /// </summary>
    /// <exception cref="CryptoValidationException">Si algún tamaño es incorrecto</exception>
    public void ValidateCryptoSizes(byte[]? cipherText, byte[]? salt, byte[]? iv, byte[]? tag)
    {
        if (cipherText == null || cipherText.Length == 0)
            throw new CryptoValidationException("CipherText cannot be null or empty");
        
        if (salt == null || salt.Length != SALT_SIZE)
            throw new CryptoValidationException($"Salt must be exactly {SALT_SIZE} bytes, got {salt?.Length ?? 0}");
        
        if (iv == null || iv.Length != IV_SIZE)
            throw new CryptoValidationException($"IV must be exactly {IV_SIZE} bytes, got {iv?.Length ?? 0}");
        
        if (tag == null || tag.Length != TAG_SIZE)
            throw new CryptoValidationException($"AuthTag must be exactly {TAG_SIZE} bytes, got {tag?.Length ?? 0}");
    }
    
    /// <summary>
    /// Deriva una clave de cifrado usando PBKDF2-HMAC-SHA512
    /// Parámetros fijos: 600,000 iteraciones, 32 bytes output
    /// </summary>
    private byte[] DeriveKey(byte[] masterKey, byte[] salt)
    {
        using var pbkdf2 = new Rfc2898DeriveBytes(
            masterKey,
            salt,
            PBKDF2_ITERATIONS,
            HashAlgorithmName.SHA512  // Fijo, no parametrizable
        );
        return pbkdf2.GetBytes(KEY_SIZE);
    }
    
    /// <summary>
    /// Genera un salt criptográficamente seguro
    /// </summary>
    public byte[] GenerateSalt()
    {
        return RandomNumberGenerator.GetBytes(SALT_SIZE);
    }
    
    /// <summary>
    /// Genera un IV criptográficamente seguro para AES-GCM
    /// </summary>
    public byte[] GenerateIV()
    {
        return RandomNumberGenerator.GetBytes(IV_SIZE);
    }
}

