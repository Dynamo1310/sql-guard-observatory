namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio de criptografía con soporte dual-read para migración enterprise.
/// Lee tanto el formato legacy (Base64) como el nuevo formato (VARBINARY + KeyId/Version).
/// </summary>
public interface IDualReadCryptoService
{
    /// <summary>
    /// Descifra una credencial usando el formato apropiado (legacy o enterprise).
    /// Detecta automáticamente qué formato usar basándose en IsMigratedToV2.
    /// </summary>
    string DecryptCredentialPassword(
        bool isMigratedToV2,
        // Legacy format (Base64 strings)
        string? encryptedPasswordBase64,
        string? saltBase64,
        string? ivBase64,
        // Enterprise format (VARBINARY + key info)
        byte[]? encryptedPasswordBin,
        byte[]? saltBin,
        byte[]? ivBin,
        byte[]? authTagBin,
        Guid? keyId,
        int? keyVersion);

    /// <summary>
    /// Cifra usando el nuevo formato enterprise (VARBINARY + KeyId/Version).
    /// Retorna todos los componentes necesarios para almacenar.
    /// </summary>
    EncryptedCredentialData EncryptWithEnterprise(string plainText, string purpose = "CredentialPassword");

    /// <summary>
    /// Verifica si una credencial puede ser descifrada correctamente.
    /// </summary>
    bool CanDecrypt(
        bool isMigratedToV2,
        string? encryptedPasswordBase64,
        string? saltBase64,
        string? ivBase64,
        byte[]? encryptedPasswordBin,
        byte[]? saltBin,
        byte[]? ivBin,
        byte[]? authTagBin,
        Guid? keyId,
        int? keyVersion);
}

/// <summary>
/// Datos cifrados en formato enterprise
/// </summary>
public class EncryptedCredentialData
{
    public byte[] CipherText { get; set; } = Array.Empty<byte>();
    public byte[] Salt { get; set; } = Array.Empty<byte>();
    public byte[] IV { get; set; } = Array.Empty<byte>();
    public byte[] AuthTag { get; set; } = Array.Empty<byte>();
    public Guid KeyId { get; set; }
    public int KeyVersion { get; set; }
}

