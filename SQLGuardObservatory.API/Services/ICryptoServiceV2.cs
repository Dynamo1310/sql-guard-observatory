namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Servicio de cifrado V2 para el Vault de Credenciales
/// Soporta versionado de llaves y validaciones estrictas
/// </summary>
public interface ICryptoServiceV2
{
    /// <summary>
    /// Cifra texto plano usando AES-256-GCM
    /// </summary>
    /// <param name="plainText">Texto a cifrar</param>
    /// <param name="purpose">Propósito de la llave (default: CredentialPassword)</param>
    /// <returns>Datos cifrados con metadatos de versionado</returns>
    EncryptedData Encrypt(string plainText, string purpose = "CredentialPassword");
    
    /// <summary>
    /// Descifra datos cifrados con AES-256-GCM
    /// </summary>
    /// <param name="data">Datos cifrados con metadatos</param>
    /// <returns>Texto descifrado</returns>
    string Decrypt(EncryptedData data);
    
    /// <summary>
    /// Descifra datos en formato legacy (Base64 strings)
    /// Para compatibilidad con datos existentes antes de la migración
    /// </summary>
    /// <param name="cipherTextBase64">CipherText+Tag concatenados en Base64</param>
    /// <param name="saltBase64">Salt en Base64</param>
    /// <param name="ivBase64">IV en Base64</param>
    /// <param name="keyId">Identificador de la llave</param>
    /// <param name="keyVersion">Versión de la llave</param>
    /// <returns>Texto descifrado</returns>
    string DecryptLegacy(string cipherTextBase64, string saltBase64, string ivBase64, Guid keyId, int keyVersion);
    
    /// <summary>
    /// Valida que los tamaños de los componentes criptográficos sean correctos
    /// </summary>
    /// <exception cref="Exceptions.CryptoValidationException">Si algún tamaño es incorrecto</exception>
    void ValidateCryptoSizes(byte[]? cipherText, byte[]? salt, byte[]? iv, byte[]? tag);
    
    /// <summary>
    /// Genera un salt criptográficamente seguro (32 bytes)
    /// </summary>
    byte[] GenerateSalt();
    
    /// <summary>
    /// Genera un IV criptográficamente seguro para AES-GCM (12 bytes)
    /// </summary>
    byte[] GenerateIV();
}

