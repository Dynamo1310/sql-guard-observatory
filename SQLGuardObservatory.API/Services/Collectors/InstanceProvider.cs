using System.Text.Json;

namespace SQLGuardObservatory.API.Services.Collectors;

/// <summary>
/// Implementación del proveedor de instancias que obtiene datos de la API de inventario
/// </summary>
public class InstanceProvider : IInstanceProvider
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly ILogger<InstanceProvider> _logger;
    
    // Cache de instancias con TTL de 5 minutos
    private static List<SqlInstanceInfo>? _cachedInstances;
    private static DateTime _cacheExpiration = DateTime.MinValue;
    private static readonly SemaphoreSlim _cacheLock = new(1, 1);

    public InstanceProvider(
        IHttpClientFactory httpClientFactory,
        IConfiguration configuration,
        ILogger<InstanceProvider> logger)
    {
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task<List<SqlInstanceInfo>> GetActiveInstancesAsync(CancellationToken ct = default)
    {
        await _cacheLock.WaitAsync(ct);
        try
        {
            if (_cachedInstances != null && DateTime.Now < _cacheExpiration)
            {
                return _cachedInstances;
            }

            var instances = await FetchInstancesFromApiAsync(ct);
            _cachedInstances = instances;
            _cacheExpiration = DateTime.Now.AddMinutes(5);
            
            return instances;
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    public async Task<List<SqlInstanceInfo>> GetFilteredInstancesAsync(
        bool includeDMZ = false, 
        bool includeAWS = false, 
        bool onlyAWS = false,
        CancellationToken ct = default)
    {
        var instances = await GetActiveInstancesAsync(ct);
        
        var filtered = instances.AsEnumerable();
        
        // Excluir DMZ si no se especifica incluirlas
        if (!includeDMZ)
        {
            filtered = filtered.Where(i => !i.IsDMZ);
        }
        
        // Filtrar AWS según configuración
        if (onlyAWS)
        {
            filtered = filtered.Where(i => i.IsAWS);
        }
        else if (!includeAWS)
        {
            filtered = filtered.Where(i => !i.IsAWS);
        }
        
        // Excluir instancias dadas de baja (hardcoded por ahora, podría ser configurable)
        var excludedInstances = new[] { "SSISC-01" };
        filtered = filtered.Where(i => !excludedInstances.Contains(i.InstanceName));
        
        return filtered.ToList();
    }

    public async Task<SqlInstanceInfo?> GetInstanceInfoAsync(string instanceName, CancellationToken ct = default)
    {
        var instances = await GetActiveInstancesAsync(ct);
        return instances.FirstOrDefault(i => 
            i.InstanceName.Equals(instanceName, StringComparison.OrdinalIgnoreCase));
    }

    public async Task UpdateInstanceVersionAsync(string instanceName, int sqlMajorVersion, string versionString, CancellationToken ct = default)
    {
        // Actualizar en cache si existe
        await _cacheLock.WaitAsync(ct);
        try
        {
            if (_cachedInstances != null)
            {
                var instance = _cachedInstances.FirstOrDefault(i => 
                    i.InstanceName.Equals(instanceName, StringComparison.OrdinalIgnoreCase));
                
                if (instance != null)
                {
                    instance.SqlMajorVersion = sqlMajorVersion;
                    instance.SqlVersionString = versionString;
                }
            }
        }
        finally
        {
            _cacheLock.Release();
        }
    }

    private async Task<List<SqlInstanceInfo>> FetchInstancesFromApiAsync(CancellationToken ct)
    {
        var apiUrl = _configuration["InventoryApi:Url"] ?? "http://asprbm-nov-01/InventoryDBA/inventario/";
        
        try
        {
            var client = _httpClientFactory.CreateClient("InventoryApi");
            client.Timeout = TimeSpan.FromSeconds(30);
            
            var response = await client.GetAsync(apiUrl, ct);
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync(ct);
            var instances = ParseInventoryResponse(json);
            
            _logger.LogInformation("Fetched {Count} instances from inventory API", instances.Count);
            return instances;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to fetch instances from inventory API at {Url}", apiUrl);
            
            // Si falla, devolver lista vacía (o podríamos usar fallback a DB)
            return new List<SqlInstanceInfo>();
        }
    }

    private List<SqlInstanceInfo> ParseInventoryResponse(string json)
    {
        var instances = new List<SqlInstanceInfo>();
        
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            
            // La API devuelve un array directamente
            if (root.ValueKind == JsonValueKind.Array)
            {
                foreach (var element in root.EnumerateArray())
                {
                    var instance = ParseInstanceElement(element);
                    if (instance != null)
                    {
                        instances.Add(instance);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to parse inventory API response");
        }
        
        return instances;
    }

    private SqlInstanceInfo? ParseInstanceElement(JsonElement element)
    {
        try
        {
            var instanceName = GetStringProperty(element, "NombreInstancia") ?? 
                               GetStringProperty(element, "nombreInstancia");
            
            if (string.IsNullOrEmpty(instanceName))
                return null;
            
            var hostingSite = GetStringProperty(element, "hostingSite") ?? 
                              GetStringProperty(element, "HostingSite");
            
            var ambiente = GetStringProperty(element, "ambiente") ?? 
                           GetStringProperty(element, "Ambiente");
            
            var majorVersionStr = GetStringProperty(element, "MajorVersion") ?? 
                                  GetStringProperty(element, "majorVersion");
            
            var alwaysOnStr = GetStringProperty(element, "AlwaysOn") ?? 
                              GetStringProperty(element, "alwaysOn");
            
            int.TryParse(majorVersionStr, out var majorVersion);
            if (majorVersion == 0) majorVersion = 11; // Default to SQL 2012
            
            return new SqlInstanceInfo
            {
                InstanceName = instanceName,
                Ambiente = ambiente,
                HostingSite = hostingSite,
                SqlMajorVersion = majorVersion,
                SqlVersionString = majorVersionStr,
                IsAlwaysOnEnabled = alwaysOnStr?.Equals("Enabled", StringComparison.OrdinalIgnoreCase) ?? false,
                IsDMZ = instanceName.Contains("DMZ", StringComparison.OrdinalIgnoreCase),
                IsAWS = hostingSite?.Equals("AWS", StringComparison.OrdinalIgnoreCase) ?? false
            };
        }
        catch
        {
            return null;
        }
    }

    private static string? GetStringProperty(JsonElement element, string propertyName)
    {
        if (element.TryGetProperty(propertyName, out var prop))
        {
            return prop.ValueKind == JsonValueKind.String ? prop.GetString() : prop.ToString();
        }
        return null;
    }

    /// <summary>
    /// Invalida el cache forzando recarga en la próxima consulta
    /// </summary>
    public static void InvalidateCache()
    {
        _cacheExpiration = DateTime.MinValue;
    }
}

