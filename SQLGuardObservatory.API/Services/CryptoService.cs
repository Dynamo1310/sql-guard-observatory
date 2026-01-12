using System.Security.Cryptography;
using System.Text;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación de cifrado AES-256-GCM para el Vault de Credenciales
/// 
/// Mejores prácticas implementadas (NIST/OWASP 2024):
/// - AES-256-GCM (Galois/Counter Mode) para cifrado autenticado
/// - PBKDF2-SHA512 con 600,000 iteraciones para derivación de clave
/// - Salt único de 32 bytes por credencial
/// - IV/Nonce de 12 bytes generado aleatoriamente
/// - Tag de autenticación de 16 bytes (128 bits)
/// </summary>
public class CryptoService : ICryptoService
{
    private readonly string _masterKey;
    private const int PBKDF2_ITERATIONS = 600000; // OWASP 2024 recommendation
    private const int KEY_SIZE = 32; // 256 bits for AES-256
    private const int SALT_SIZE = 32; // 256 bits
    private const int IV_SIZE = 12; // 96 bits recommended for GCM
    private const int TAG_SIZE = 16; // 128 bits authentication tag

    public CryptoService(IConfiguration configuration)
    {
        _masterKey = configuration["VaultSettings:MasterKey"] 
            ?? throw new InvalidOperationException("VaultSettings:MasterKey no está configurada");
        
        if (_masterKey.Length < 32)
        {
            throw new InvalidOperationException("VaultSettings:MasterKey debe tener al menos 32 caracteres");
        }
    }

    public (string CipherText, string Salt, string IV) Encrypt(string plainText)
    {
        if (string.IsNullOrEmpty(plainText))
            throw new ArgumentNullException(nameof(plainText));

        // Generar salt y IV únicos para esta operación
        var salt = RandomNumberGenerator.GetBytes(SALT_SIZE);
        var iv = RandomNumberGenerator.GetBytes(IV_SIZE);

        // Derivar clave usando PBKDF2-SHA512
        var key = DeriveKey(salt);

        // Cifrar con AES-GCM
        var plainBytes = Encoding.UTF8.GetBytes(plainText);
        var cipherBytes = new byte[plainBytes.Length];
        var tag = new byte[TAG_SIZE];

        using var aesGcm = new AesGcm(key, TAG_SIZE);
        aesGcm.Encrypt(iv, plainBytes, cipherBytes, tag);

        // Combinar ciphertext + tag para almacenamiento
        var combined = new byte[cipherBytes.Length + tag.Length];
        Buffer.BlockCopy(cipherBytes, 0, combined, 0, cipherBytes.Length);
        Buffer.BlockCopy(tag, 0, combined, cipherBytes.Length, tag.Length);

        return (
            Convert.ToBase64String(combined),
            Convert.ToBase64String(salt),
            Convert.ToBase64String(iv)
        );
    }

    public string Decrypt(string cipherText, string salt, string iv)
    {
        if (string.IsNullOrEmpty(cipherText))
            throw new ArgumentNullException(nameof(cipherText));
        if (string.IsNullOrEmpty(salt))
            throw new ArgumentNullException(nameof(salt));
        if (string.IsNullOrEmpty(iv))
            throw new ArgumentNullException(nameof(iv));

        var combined = Convert.FromBase64String(cipherText);
        var saltBytes = Convert.FromBase64String(salt);
        var ivBytes = Convert.FromBase64String(iv);

        // Separar ciphertext y tag
        var cipherBytes = new byte[combined.Length - TAG_SIZE];
        var tag = new byte[TAG_SIZE];
        Buffer.BlockCopy(combined, 0, cipherBytes, 0, cipherBytes.Length);
        Buffer.BlockCopy(combined, cipherBytes.Length, tag, 0, TAG_SIZE);

        // Derivar clave
        var key = DeriveKey(saltBytes);

        // Descifrar
        var plainBytes = new byte[cipherBytes.Length];

        using var aesGcm = new AesGcm(key, TAG_SIZE);
        aesGcm.Decrypt(ivBytes, cipherBytes, tag, plainBytes);

        return Encoding.UTF8.GetString(plainBytes);
    }

    public string GenerateSalt(int size = SALT_SIZE)
    {
        var salt = RandomNumberGenerator.GetBytes(size);
        return Convert.ToBase64String(salt);
    }

    public string GenerateIV()
    {
        var iv = RandomNumberGenerator.GetBytes(IV_SIZE);
        return Convert.ToBase64String(iv);
    }

    /// <summary>
    /// Deriva una clave de cifrado usando PBKDF2-SHA512
    /// </summary>
    private byte[] DeriveKey(byte[] salt)
    {
        using var pbkdf2 = new Rfc2898DeriveBytes(
            _masterKey,
            salt,
            PBKDF2_ITERATIONS,
            HashAlgorithmName.SHA512
        );
        
        return pbkdf2.GetBytes(KEY_SIZE);
    }
}




