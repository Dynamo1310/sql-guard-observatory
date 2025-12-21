namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Representa una llave de cifrado del Vault
/// </summary>
public record VaultKey
{
    /// <summary>Identificador único del stream de llaves</summary>
    public required Guid KeyId { get; init; }
    
    /// <summary>Versión de la llave</summary>
    public required int Version { get; init; }
    
    /// <summary>Propósito de la llave</summary>
    public required string Purpose { get; init; }
    
    /// <summary>Material de la llave (bytes)</summary>
    public required byte[] Material { get; init; }
    
    /// <summary>Algoritmo de cifrado</summary>
    public required string Algorithm { get; init; }
    
    /// <summary>Si la llave está activa</summary>
    public required bool IsActive { get; init; }
}

/// <summary>
/// Gestor de llaves de cifrado para el Vault
/// </summary>
public interface IKeyManager
{
    /// <summary>
    /// Obtiene la llave activa para un propósito específico
    /// </summary>
    /// <param name="purpose">Propósito de la llave (ej: CredentialPassword)</param>
    /// <returns>Llave activa</returns>
    /// <exception cref="InvalidOperationException">Si no hay llave activa para el propósito</exception>
    VaultKey GetActiveKeyForPurpose(string purpose);
    
    /// <summary>
    /// Obtiene una llave específica por KeyId y Version
    /// Para descifrar datos con versiones anteriores
    /// </summary>
    /// <param name="keyId">Identificador de la llave</param>
    /// <param name="version">Versión de la llave</param>
    /// <returns>Llave solicitada</returns>
    /// <exception cref="KeyNotFoundException">Si la llave no existe</exception>
    VaultKey GetKey(Guid keyId, int version);
    
    /// <summary>
    /// Verifica si existe una llave para un KeyId y Version
    /// </summary>
    bool KeyExists(Guid keyId, int version);
}

