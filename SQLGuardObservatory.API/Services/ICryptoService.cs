namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio de cifrado para el Vault de Credenciales
/// Implementa AES-256-GCM según mejores prácticas NIST/OWASP 2024
/// </summary>
public interface ICryptoService
{
    /// <summary>
    /// Cifra un texto plano usando AES-256-GCM
    /// </summary>
    /// <param name="plainText">Texto a cifrar</param>
    /// <returns>Tupla con (cipherText en Base64, salt en Base64, IV en Base64)</returns>
    (string CipherText, string Salt, string IV) Encrypt(string plainText);

    /// <summary>
    /// Descifra un texto cifrado usando AES-256-GCM
    /// </summary>
    /// <param name="cipherText">Texto cifrado en Base64</param>
    /// <param name="salt">Salt en Base64</param>
    /// <param name="iv">IV en Base64</param>
    /// <returns>Texto descifrado</returns>
    string Decrypt(string cipherText, string salt, string iv);

    /// <summary>
    /// Genera un salt criptográficamente seguro
    /// </summary>
    /// <param name="size">Tamaño en bytes (default: 32)</param>
    /// <returns>Salt en Base64</returns>
    string GenerateSalt(int size = 32);

    /// <summary>
    /// Genera un IV criptográficamente seguro para AES-GCM
    /// </summary>
    /// <returns>IV en Base64 (12 bytes para GCM)</returns>
    string GenerateIV();
}




