using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del gestor de llaves de cifrado para el Vault
/// 
/// NOTA: En producción enterprise, el material de las llaves debería
/// obtenerse de Azure Key Vault, AWS KMS, o HSM on-premise.
/// Esta implementación usa la MasterKey de configuración como base.
/// </summary>
public class KeyManager : IKeyManager
{
    private readonly ApplicationDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<KeyManager> _logger;
    private readonly byte[] _masterKeyBytes;
    
    // Cache estático de llaves para evitar accesos repetidos a la base de datos
    // Esto es seguro porque las llaves no cambian durante la ejecución
    private static readonly ConcurrentDictionary<string, VaultKey> _keyCache = new();
    private static readonly object _cacheLock = new();
    
    public KeyManager(
        ApplicationDbContext context, 
        IConfiguration configuration,
        ILogger<KeyManager> logger)
    {
        _context = context ?? throw new ArgumentNullException(nameof(context));
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        
        var masterKey = _configuration["VaultSettings:MasterKey"]
            ?? throw new InvalidOperationException("VaultSettings:MasterKey no está configurada");
        
        if (masterKey.Length < 32)
        {
            throw new InvalidOperationException("VaultSettings:MasterKey debe tener al menos 32 caracteres");
        }
        
        _masterKeyBytes = Encoding.UTF8.GetBytes(masterKey);
    }
    
    /// <summary>
    /// Obtiene la llave activa para un propósito específico
    /// Usa cache estático para evitar accesos repetidos a la base de datos (thread-safe)
    /// </summary>
    public VaultKey GetActiveKeyForPurpose(string purpose)
    {
        var cacheKey = $"active:{purpose}";
        
        // Intentar obtener del cache primero (thread-safe)
        if (_keyCache.TryGetValue(cacheKey, out var cachedKey))
        {
            return cachedKey;
        }
        
        // Si no está en cache, cargar de la base de datos con lock
        lock (_cacheLock)
        {
            // Double-check después del lock
            if (_keyCache.TryGetValue(cacheKey, out cachedKey))
            {
                return cachedKey;
            }
            
            var keyRecord = _context.VaultEncryptionKeys
                .FirstOrDefault(k => k.KeyPurpose == purpose && k.IsActive);
            
            if (keyRecord == null)
            {
                throw new InvalidOperationException(
                    $"No hay llave activa para el propósito '{purpose}'. " +
                    "Ejecutar el script de migración para crear la llave inicial.");
            }
            
            var vaultKey = CreateVaultKey(keyRecord);
            
            // Cachear por propósito y también por KeyId:Version
            _keyCache.TryAdd(cacheKey, vaultKey);
            _keyCache.TryAdd($"{vaultKey.KeyId}:{vaultKey.Version}", vaultKey);
            
            _logger.LogDebug("Llave activa para '{Purpose}' cargada y cacheada", purpose);
            return vaultKey;
        }
    }
    
    /// <summary>
    /// Obtiene una llave específica por KeyId y Version
    /// Usa cache estático para evitar accesos repetidos a la base de datos (thread-safe)
    /// </summary>
    public VaultKey GetKey(Guid keyId, int version)
    {
        var cacheKey = $"{keyId}:{version}";
        
        // Intentar obtener del cache primero (thread-safe)
        if (_keyCache.TryGetValue(cacheKey, out var cachedKey))
        {
            return cachedKey;
        }
        
        // Si no está en cache, cargar de la base de datos con lock
        lock (_cacheLock)
        {
            // Double-check después del lock
            if (_keyCache.TryGetValue(cacheKey, out cachedKey))
            {
                return cachedKey;
            }
            
            var keyRecord = _context.VaultEncryptionKeys
                .FirstOrDefault(k => k.KeyId == keyId && k.KeyVersion == version);
            
            if (keyRecord == null)
            {
                throw new KeyNotFoundException(
                    $"No se encontró la llave con KeyId={keyId}, Version={version}");
            }
            
            var vaultKey = CreateVaultKey(keyRecord);
            _keyCache.TryAdd(cacheKey, vaultKey);
            
            _logger.LogDebug("Llave {KeyId}:{Version} cargada y cacheada", keyId, version);
            return vaultKey;
        }
    }
    
    /// <summary>
    /// Verifica si existe una llave
    /// </summary>
    public bool KeyExists(Guid keyId, int version)
    {
        return _context.VaultEncryptionKeys
            .Any(k => k.KeyId == keyId && k.KeyVersion == version);
    }
    
    /// <summary>
    /// Crea un VaultKey a partir del registro de base de datos
    /// Deriva el material de la llave usando el fingerprint como salt
    /// </summary>
    private VaultKey CreateVaultKey(VaultEncryptionKey keyRecord)
    {
        // Derivar el material de la llave usando PBKDF2
        // El fingerprint actúa como salt para que cada versión tenga material diferente
        var keyMaterial = DeriveKeyMaterial(keyRecord.KeyId, keyRecord.KeyVersion, keyRecord.KeyFingerprint);
        
        return new VaultKey
        {
            KeyId = keyRecord.KeyId,
            Version = keyRecord.KeyVersion,
            Purpose = keyRecord.KeyPurpose,
            Material = keyMaterial,
            Algorithm = keyRecord.Algorithm,
            IsActive = keyRecord.IsActive
        };
    }
    
    /// <summary>
    /// Deriva el material de una llave usando PBKDF2
    /// </summary>
    private byte[] DeriveKeyMaterial(Guid keyId, int keyVersion, byte[] fingerprint)
    {
        // Combinar KeyId + Version + Fingerprint como contexto único
        var context = new byte[16 + 4 + fingerprint.Length];
        Buffer.BlockCopy(keyId.ToByteArray(), 0, context, 0, 16);
        Buffer.BlockCopy(BitConverter.GetBytes(keyVersion), 0, context, 16, 4);
        Buffer.BlockCopy(fingerprint, 0, context, 20, fingerprint.Length);
        
        // Derivar usando PBKDF2-SHA512
        using var pbkdf2 = new Rfc2898DeriveBytes(
            _masterKeyBytes,
            context,
            100000, // Iteraciones para derivación de llave (diferente del KDF de cifrado)
            HashAlgorithmName.SHA512
        );
        
        return pbkdf2.GetBytes(32); // 256 bits
    }
}

