using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.DTOs;
using SQLGuardObservatory.API.Models;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Interfaz del servicio de estado de parcheo
/// </summary>
public interface IPatchingService
{
    Task<List<ServerPatchStatusDto>> GetPatchStatusAsync(bool forceRefresh = false, int? complianceYear = null);
    Task<ServerPatchStatusDto> GetServerPatchStatusAsync(string instanceName);
    Task RefreshPatchStatusCacheAsync(int? complianceYear = null);
    
    // Configuración de compliance
    Task<List<int>> GetComplianceYearsAsync();
    Task<List<PatchComplianceConfigDto>> GetComplianceConfigsAsync(int? year = null);
    Task<PatchComplianceConfigDto> GetComplianceConfigAsync(string sqlVersion, int? year = null);
    Task<PatchComplianceConfigDto> SaveComplianceConfigAsync(PatchComplianceConfigDto config, string userId);
    Task<bool> DeleteComplianceConfigAsync(int id);
    
    // Datos de referencia
    Task<List<BuildReferenceDto>> GetAvailableBuildsForVersionAsync(string sqlVersion);
}

/// <summary>
/// Servicio para verificar el estado de parcheo de servidores SQL Server
/// </summary>
public class PatchingService : IPatchingService
{
    private readonly ILogger<PatchingService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly IWebHostEnvironment _environment;
    private readonly ApplicationDbContext _context;
    
    private const string InventoryApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/";
    private const int ConnectionTimeoutSeconds = 10;
    private const int CacheExpirationMinutes = 30; // Cache válido por 30 minutos
    
    // Cache del índice de builds (se carga una vez)
    private static BuildReferenceIndex? _buildIndex;
    private static readonly object _buildIndexLock = new();
    
    // Mapeo de versiones principales
    private static readonly Dictionary<string, string> VersionPrefixMap = new()
    {
        { "8.", "2000" },
        { "9.", "2005" },
        { "10.0", "2008" },
        { "10.5", "2008 R2" },
        { "11.", "2012" },
        { "12.", "2014" },
        { "13.", "2016" },
        { "14.", "2017" },
        { "15.", "2019" },
        { "16.", "2022" },
        { "17.", "2025" }
    };

    public PatchingService(
        ILogger<PatchingService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        IWebHostEnvironment environment,
        ApplicationDbContext context)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
        _environment = environment;
        _context = context;
        
        LoadBuildIndex();
    }

    /// <summary>
    /// Carga el archivo JSON de builds de dbatools
    /// </summary>
    private void LoadBuildIndex()
    {
        if (_buildIndex != null) return;
        
        lock (_buildIndexLock)
        {
            if (_buildIndex != null) return;
            
            try
            {
                var possiblePaths = new[]
                {
                    Path.Combine(_environment.ContentRootPath, "Data", "dbatools-buildref-index.json"),
                    Path.Combine(_environment.ContentRootPath, "dbatools-buildref-index.json"),
                    Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Data", "dbatools-buildref-index.json"),
                    @"C:\Apps\SQLGuardObservatory\Data\dbatools-buildref-index.json"
                };
                
                string? jsonPath = possiblePaths.FirstOrDefault(File.Exists);
                
                if (jsonPath == null)
                {
                    _logger.LogWarning("No se encontró el archivo dbatools-buildref-index.json");
                    return;
                }
                
                var jsonContent = File.ReadAllText(jsonPath);
                _buildIndex = JsonSerializer.Deserialize<BuildReferenceIndex>(jsonContent, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                });
                
                _logger.LogInformation("Índice de builds cargado: {Count} entradas", _buildIndex?.Data?.Count ?? 0);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error cargando el índice de builds");
            }
        }
    }

    #region Patch Status

    /// <summary>
    /// Obtiene el estado de parcheo desde cache o refresca si es necesario
    /// </summary>
    public async Task<List<ServerPatchStatusDto>> GetPatchStatusAsync(bool forceRefresh = false, int? complianceYear = null)
    {
        var targetYear = complianceYear ?? DateTime.Now.Year;
        
        // Verificar si hay cache válido
        var cacheExpiration = DateTime.Now.AddMinutes(-CacheExpirationMinutes);
        var cachedData = await _context.ServerPatchStatusCache
            .Where(s => s.LastChecked > cacheExpiration)
            .Where(s => s.ConnectionSuccess) // Solo servidores con conexión exitosa
            .ToListAsync();
        
        if (!forceRefresh && cachedData.Any())
        {
            _logger.LogInformation("Devolviendo {Count} servidores desde cache para compliance {Year}", cachedData.Count, targetYear);
            // Recalcular el estado de compliance basado en el año seleccionado
            var complianceConfigs = await GetComplianceConfigsDictionary(targetYear);
            return cachedData.Select(c => {
                var dto = MapCacheToDto(c);
                RecalculateComplianceStatus(dto, complianceConfigs);
                return dto;
            }).OrderByStatus().ToList();
        }
        
        // Refrescar cache
        await RefreshPatchStatusCacheAsync(targetYear);
        
        // Devolver datos actualizados (solo los que tienen conexión exitosa)
        var freshData = await _context.ServerPatchStatusCache
            .Where(s => s.ConnectionSuccess)
            .ToListAsync();
        
        var configs = await GetComplianceConfigsDictionary(targetYear);
        return freshData.Select(c => {
            var dto = MapCacheToDto(c);
            RecalculateComplianceStatus(dto, configs);
            return dto;
        }).OrderByStatus().ToList();
    }
    
    private async Task<Dictionary<string, PatchComplianceConfig>> GetComplianceConfigsDictionary(int year)
    {
        var configs = await _context.PatchComplianceConfigs
            .Where(c => c.ComplianceYear == year && c.IsActive)
            .ToListAsync();
        
        return configs.ToDictionary(c => c.SqlVersion, c => c);
    }
    
    private void RecalculateComplianceStatus(ServerPatchStatusDto dto, Dictionary<string, PatchComplianceConfig> complianceConfigs)
    {
        if (string.IsNullOrEmpty(dto.CurrentBuild) || string.IsNullOrEmpty(dto.MajorVersion))
        {
            return; // Mantener el estado actual
        }
        
        if (complianceConfigs.TryGetValue(dto.MajorVersion, out var config))
        {
            dto.RequiredBuild = config.RequiredBuild;
            dto.RequiredCU = config.RequiredCU ?? string.Empty;
            
            var complianceComparison = CompareVersions(dto.CurrentBuild, config.RequiredBuild);
            
            if (complianceComparison >= 0)
            {
                // Está en compliance
                var latestComparison = CompareVersions(dto.CurrentBuild, dto.LatestBuild);
                if (latestComparison >= 0)
                {
                    dto.PatchStatus = "Updated";
                    dto.PendingCUsForCompliance = 0;
                }
                else
                {
                    dto.PatchStatus = "Compliant";
                    dto.PendingCUsForCompliance = 0;
                }
            }
            else
            {
                // No está en compliance
                dto.PatchStatus = "NonCompliant";
                dto.PendingCUsForCompliance = CalculatePendingCUs(dto.CurrentBuild, config.RequiredBuild, dto.MajorVersion);
            }
        }
    }

    /// <summary>
    /// Obtiene el estado de parcheo de un servidor específico
    /// </summary>
    public async Task<ServerPatchStatusDto> GetServerPatchStatusAsync(string instanceName)
    {
        var cached = await _context.ServerPatchStatusCache
            .FirstOrDefaultAsync(s => s.InstanceName == instanceName);
        
        if (cached != null)
        {
            return MapCacheToDto(cached);
        }
        
        return new ServerPatchStatusDto
        {
            InstanceName = instanceName,
            PatchStatus = "Unknown",
            ErrorMessage = "Servidor no encontrado en cache"
        };
    }

    /// <summary>
    /// Refresca el cache de estado de parcheo
    /// </summary>
    public async Task RefreshPatchStatusCacheAsync(int? complianceYear = null)
    {
        var targetYear = complianceYear ?? DateTime.Now.Year;
        _logger.LogInformation("Iniciando refresh del cache de estado de parcheo para año {Year}", targetYear);
        
        try
        {
            // Obtener configuración de compliance para el año especificado
            var complianceConfigs = await _context.PatchComplianceConfigs
                .Where(c => c.IsActive && c.ComplianceYear == targetYear)
                .ToDictionaryAsync(c => c.SqlVersion, c => c);
            
            // Obtener servidores del inventario
            var servers = await GetFilteredServersFromInventoryAsync();
            
            // Contar tipos de servidores
            var dmzServers = servers.Where(s => IsDmzServer(s)).ToList();
            var awsServers = servers.Where(s => IsAwsServer(s)).ToList();
            _logger.LogInformation("Procesando {Count} servidores: {DmzCount} DMZ, {AwsCount} AWS, {OtherCount} otros", 
                servers.Count, dmzServers.Count, awsServers.Count, servers.Count - dmzServers.Count - awsServers.Count);
            
            // Log de servidores DMZ encontrados
            foreach (var dmz in dmzServers)
            {
                _logger.LogDebug("DMZ encontrado: {Instance}", dmz.NombreInstancia);
            }
            
            // Procesar en paralelo
            var semaphore = new SemaphoreSlim(10);
            var tasks = servers.Select(async server =>
            {
                await semaphore.WaitAsync();
                try
                {
                    return await ProcessServerPatchStatusAsync(server, complianceConfigs);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Error procesando servidor {Instance}", server.NombreInstancia);
                    return new ServerPatchStatusDto
                    {
                        ServerName = server.ServerName,
                        InstanceName = server.NombreInstancia,
                        Ambiente = server.ambiente,
                        HostingSite = server.hostingSite,
                        ConnectionSuccess = false,
                        PatchStatus = "Error",
                        ErrorMessage = ex.Message,
                        LastChecked = DateTime.Now
                    };
                }
                finally
                {
                    semaphore.Release();
                }
            });
            
            var results = await Task.WhenAll(tasks);
            
            // Actualizar cache en base de datos - uno por uno con manejo de errores
            int savedCount = 0;
            int errorCount = 0;
            
            // Procesar resultados únicos (por si acaso)
            var uniqueResults = results
                .GroupBy(r => r.InstanceName, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.First())
                .ToList();
            
            foreach (var result in uniqueResults)
            {
                try
                {
                    var existing = await _context.ServerPatchStatusCache
                        .FirstOrDefaultAsync(s => s.InstanceName == result.InstanceName);
                    
                    if (existing != null)
                    {
                        // Actualizar existente
                        UpdateCacheEntity(existing, result);
                    }
                    else
                    {
                        // Crear nuevo
                        _context.ServerPatchStatusCache.Add(MapDtoToCache(result));
                    }
                    
                    await _context.SaveChangesAsync();
                    savedCount++;
                    
                    // Limpiar tracking para evitar conflictos
                    _context.ChangeTracker.Clear();
                }
                catch (Exception ex)
                {
                    errorCount++;
                    _logger.LogWarning(ex, "Error guardando cache para {Instance}: {Message}", 
                        result.InstanceName, ex.InnerException?.Message ?? ex.Message);
                    
                    // Limpiar tracking en caso de error también
                    _context.ChangeTracker.Clear();
                }
            }
            
            _logger.LogInformation("Cache actualizado: {SavedCount} guardados, {ErrorCount} errores", savedCount, errorCount);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error refrescando cache de parcheo");
            throw;
        }
    }

    private async Task<ServerPatchStatusDto> ProcessServerPatchStatusAsync(
        InventoryServerForPatchingDto server, 
        Dictionary<string, PatchComplianceConfig> complianceConfigs)
    {
        var result = new ServerPatchStatusDto
        {
            ServerName = server.ServerName,
            InstanceName = server.NombreInstancia,
            Ambiente = server.ambiente,
            HostingSite = server.hostingSite,
            LastChecked = DateTime.Now
        };
        
        // Verificar si es servidor DMZ - usar datos del inventario
        if (IsDmzServer(server))
        {
            ProcessDmzServerFromInventory(server, result);
        }
        else
        {
            // Intentar conectarse al servidor (para servidores no-DMZ)
            await ConnectAndGetServerInfoAsync(server, result);
        }
        
        // Comparar con compliance y último disponible
        DetermineComplianceStatus(result, complianceConfigs);
        
        return result;
    }
    
    private async Task ConnectAndGetServerInfoAsync(InventoryServerForPatchingDto server, ServerPatchStatusDto result)
    {
        try
        {
            // Conectarse al servidor (usar credenciales SQL para AWS)
            var isAws = IsAwsServer(server);
            var connectionString = BuildConnectionString(server.NombreInstancia, isAws);
            
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            
            using var command = connection.CreateCommand();
            command.CommandText = @"
                SELECT 
                    SERVERPROPERTY('ProductVersion') AS ProductVersion,
                    SERVERPROPERTY('ProductLevel') AS ProductLevel,
                    SERVERPROPERTY('ProductUpdateLevel') AS ProductUpdateLevel,
                    SERVERPROPERTY('ProductUpdateReference') AS ProductUpdateReference,
                    SERVERPROPERTY('ProductMajorVersion') AS ProductMajorVersion,
                    SERVERPROPERTY('ProductMinorVersion') AS ProductMinorVersion";
            command.CommandTimeout = ConnectionTimeoutSeconds;
            
            using var reader = await command.ExecuteReaderAsync();
            if (await reader.ReadAsync())
            {
                result.CurrentBuild = reader["ProductVersion"]?.ToString() ?? string.Empty;
                result.CurrentSP = reader["ProductLevel"]?.ToString() ?? "RTM";
                result.CurrentCU = reader["ProductUpdateLevel"]?.ToString() ?? string.Empty;
                result.KBReference = reader["ProductUpdateReference"]?.ToString() ?? string.Empty;
                
                // Obtener versión mayor directamente del servidor
                var majorVersionNumber = reader["ProductMajorVersion"]?.ToString() ?? string.Empty;
                var minorVersionNumber = reader["ProductMinorVersion"]?.ToString() ?? string.Empty;
                result.MajorVersion = MapMajorVersionNumber(majorVersionNumber, minorVersionNumber);
            }
            
            // Si no se pudo obtener la versión mayor, detectarla desde el build
            if (string.IsNullOrEmpty(result.MajorVersion) || result.MajorVersion == "Unknown")
            {
                result.MajorVersion = GetMajorVersionName(result.CurrentBuild) ?? "Unknown";
            }
            
            result.ConnectionSuccess = true;
        }
        catch (Exception ex)
        {
            _logger.LogDebug("Error conectando a {Instance}: {Message}", server.NombreInstancia, ex.Message);
            result.ConnectionSuccess = false;
            result.ErrorMessage = ex.Message;
        }
    }

    private void DetermineComplianceStatus(ServerPatchStatusDto result, Dictionary<string, PatchComplianceConfig> complianceConfigs)
    {
        if (string.IsNullOrEmpty(result.CurrentBuild))
        {
            result.PatchStatus = "Unknown";
            return;
        }
        
        // Obtener configuración de compliance para esta versión
        PatchComplianceConfig? complianceConfig = null;
        if (!string.IsNullOrEmpty(result.MajorVersion))
        {
            complianceConfigs.TryGetValue(result.MajorVersion, out complianceConfig);
        }
        
        // Encontrar última CU disponible en el índice
        var latestEntry = FindLatestCUForVersion(result.MajorVersion);
        if (latestEntry != null)
        {
            result.LatestBuild = NormalizeVersionTo4Parts(latestEntry.Version ?? string.Empty);
            result.LatestCU = latestEntry.CU ?? latestEntry.SP ?? string.Empty;
            result.LatestKBReference = GetKBFromEntry(latestEntry);
        }
        
        // Determinar estado de compliance
        if (complianceConfig != null)
        {
            result.RequiredBuild = complianceConfig.RequiredBuild;
            result.RequiredCU = complianceConfig.RequiredCU ?? string.Empty;
            
            var complianceComparison = CompareVersions(result.CurrentBuild, complianceConfig.RequiredBuild);
            
            if (complianceComparison >= 0)
            {
                // Está en compliance
                if (!string.IsNullOrEmpty(result.LatestBuild))
                {
                    var latestComparison = CompareVersions(result.CurrentBuild, result.LatestBuild);
                    if (latestComparison >= 0)
                    {
                        result.PatchStatus = "Updated";
                        result.PendingCUsForCompliance = 0;
                        result.PendingCUsForLatest = 0;
                    }
                    else
                    {
                        result.PatchStatus = "Compliant";
                        result.PendingCUsForCompliance = 0;
                        result.PendingCUsForLatest = CalculatePendingCUs(result.CurrentBuild, result.LatestBuild, result.MajorVersion);
                    }
                }
                else
                {
                    result.PatchStatus = "Compliant";
                }
            }
            else
            {
                // No está en compliance
                result.PatchStatus = "NonCompliant";
                result.PendingCUsForCompliance = CalculatePendingCUs(result.CurrentBuild, complianceConfig.RequiredBuild, result.MajorVersion);
                result.PendingCUsForLatest = !string.IsNullOrEmpty(result.LatestBuild) 
                    ? CalculatePendingCUs(result.CurrentBuild, result.LatestBuild, result.MajorVersion)
                    : result.PendingCUsForCompliance;
            }
        }
        else
        {
            // Sin configuración de compliance, comparar con última disponible
            if (!string.IsNullOrEmpty(result.LatestBuild))
            {
                var comparison = CompareVersions(result.CurrentBuild, result.LatestBuild);
                if (comparison >= 0)
                {
                    result.PatchStatus = "Updated";
                }
                else
                {
                    result.PendingCUsForLatest = CalculatePendingCUs(result.CurrentBuild, result.LatestBuild, result.MajorVersion);
                    result.PatchStatus = result.PendingCUsForLatest >= 3 ? "Critical" : "Outdated";
                }
            }
            else
            {
                result.PatchStatus = "Unknown";
            }
        }
    }

    #endregion

    #region Compliance Configuration

    public async Task<List<int>> GetComplianceYearsAsync()
    {
        var years = await _context.PatchComplianceConfigs
            .Select(c => c.ComplianceYear)
            .Distinct()
            .OrderByDescending(y => y)
            .ToListAsync();
        
        // Si no hay años configurados, devolver el año actual
        if (!years.Any())
        {
            years.Add(DateTime.Now.Year);
        }
        
        return years;
    }

    public async Task<List<PatchComplianceConfigDto>> GetComplianceConfigsAsync(int? year = null)
    {
        var targetYear = year ?? DateTime.Now.Year;
        
        var configs = await _context.PatchComplianceConfigs
            .Where(c => c.ComplianceYear == targetYear)
            .OrderBy(c => c.SqlVersion)
            .ToListAsync();
        
        return configs.Select(c => new PatchComplianceConfigDto
        {
            Id = c.Id,
            ComplianceYear = c.ComplianceYear,
            SqlVersion = c.SqlVersion,
            RequiredBuild = c.RequiredBuild,
            RequiredCU = c.RequiredCU,
            RequiredKB = c.RequiredKB,
            Description = c.Description,
            IsActive = c.IsActive,
            UpdatedAt = c.UpdatedAt,
            UpdatedBy = c.UpdatedBy
        }).ToList();
    }

    public async Task<PatchComplianceConfigDto> GetComplianceConfigAsync(string sqlVersion, int? year = null)
    {
        var targetYear = year ?? DateTime.Now.Year;
        
        var config = await _context.PatchComplianceConfigs
            .FirstOrDefaultAsync(c => c.SqlVersion == sqlVersion && c.ComplianceYear == targetYear);
        
        if (config == null)
        {
            return new PatchComplianceConfigDto { SqlVersion = sqlVersion, ComplianceYear = targetYear };
        }
        
        return new PatchComplianceConfigDto
        {
            Id = config.Id,
            ComplianceYear = config.ComplianceYear,
            SqlVersion = config.SqlVersion,
            RequiredBuild = config.RequiredBuild,
            RequiredCU = config.RequiredCU,
            RequiredKB = config.RequiredKB,
            Description = config.Description,
            IsActive = config.IsActive,
            UpdatedAt = config.UpdatedAt,
            UpdatedBy = config.UpdatedBy
        };
    }

    public async Task<PatchComplianceConfigDto> SaveComplianceConfigAsync(PatchComplianceConfigDto dto, string userId)
    {
        PatchComplianceConfig config;
        
        if (dto.Id > 0)
        {
            config = await _context.PatchComplianceConfigs.FindAsync(dto.Id)
                ?? throw new InvalidOperationException("Configuración no encontrada");
        }
        else
        {
            // Verificar si ya existe para esta versión y año
            config = await _context.PatchComplianceConfigs
                .FirstOrDefaultAsync(c => c.SqlVersion == dto.SqlVersion && c.ComplianceYear == dto.ComplianceYear);
            
            if (config == null)
            {
                config = new PatchComplianceConfig();
                _context.PatchComplianceConfigs.Add(config);
            }
        }
        
        config.ComplianceYear = dto.ComplianceYear;
        config.SqlVersion = dto.SqlVersion;
        config.RequiredBuild = NormalizeVersionTo4Parts(dto.RequiredBuild);
        config.RequiredCU = dto.RequiredCU;
        config.RequiredKB = dto.RequiredKB;
        config.Description = dto.Description;
        config.IsActive = dto.IsActive;
        config.UpdatedAt = DateTime.Now;
        config.UpdatedBy = userId;
        
        await _context.SaveChangesAsync();
        
        dto.Id = config.Id;
        dto.UpdatedAt = config.UpdatedAt;
        dto.UpdatedBy = config.UpdatedBy;
        
        return dto;
    }

    public async Task<bool> DeleteComplianceConfigAsync(int id)
    {
        var config = await _context.PatchComplianceConfigs.FindAsync(id);
        if (config == null) return false;
        
        _context.PatchComplianceConfigs.Remove(config);
        await _context.SaveChangesAsync();
        return true;
    }

    #endregion

    #region Build Reference

    public async Task<List<BuildReferenceDto>> GetAvailableBuildsForVersionAsync(string sqlVersion)
    {
        return await Task.Run(() =>
        {
            if (_buildIndex?.Data == null) return new List<BuildReferenceDto>();
            
            var allEntries = GetEntriesForMajorVersion(sqlVersion)
                .Where(e => !string.IsNullOrEmpty(e.Version))
                .OrderByDescending(e => e.Version)
                .ToList();
            
            // Devolver TODAS las versiones disponibles (CU, SP, GDR, hotfixes, etc.)
            var results = allEntries
                .Take(200)
                .Select(e => {
                    // Construir el nombre completo del update (RTM-CU31-GDR, SP2-CU15, etc.)
                    var fullUpdateName = BuildFullUpdateName(e, allEntries);
                    
                    return new BuildReferenceDto
                    {
                        Version = NormalizeVersionTo4Parts(e.Version ?? string.Empty),
                        CU = fullUpdateName, // Ahora contiene el nombre completo
                        SP = e.SP,
                        KB = GetKBFromEntry(e)
                    };
                })
                .ToList();
            
            return results;
        });
    }
    
    /// <summary>
    /// Busca el CU base para una versión que solo tiene KB (GDR)
    /// </summary>
    private string? FindBaseCUForVersion(string? version, List<BuildEntry> allEntries)
    {
        if (string.IsNullOrEmpty(version)) return null;
        
        // Buscar el CU más reciente que sea menor o igual a esta versión
        var baseCU = allEntries
            .Where(e => !string.IsNullOrEmpty(e.CU))
            .Where(e => CompareVersions(e.Version ?? "", version) <= 0)
            .OrderByDescending(e => e.Version)
            .FirstOrDefault();
        
        return baseCU?.CU;
    }
    
    /// <summary>
    /// Busca el SP base para una versión (RTM si no tiene SP)
    /// </summary>
    private string FindBaseSPForVersion(string? version, List<BuildEntry> allEntries)
    {
        if (string.IsNullOrEmpty(version)) return "RTM";
        
        // Buscar el SP más reciente que sea menor o igual a esta versión
        var baseSP = allEntries
            .Where(e => !string.IsNullOrEmpty(e.SP) && e.SP != "RC") // Excluir Release Candidates
            .Where(e => CompareVersions(e.Version ?? "", version) <= 0)
            .OrderByDescending(e => e.Version)
            .FirstOrDefault();
        
        return baseSP?.SP ?? "RTM";
    }
    
    /// <summary>
    /// Construye el nombre completo del update (ej: RTM-CU31-GDR, SP2-CU15, etc.)
    /// </summary>
    private string BuildFullUpdateName(BuildEntry entry, List<BuildEntry> allEntries)
    {
        var parts = new List<string>();
        
        // 1. Determinar el SP base
        var baseSP = FindBaseSPForVersion(entry.Version, allEntries);
        parts.Add(baseSP);
        
        // 2. Si tiene CU, agregarlo
        if (!string.IsNullOrEmpty(entry.CU))
        {
            parts.Add(entry.CU);
        }
        else if (!string.IsNullOrEmpty(entry.SP))
        {
            // Si es un SP directo, ya lo tenemos en baseSP
            // No agregar nada más
        }
        else if (!string.IsNullOrEmpty(GetKBFromEntry(entry)))
        {
            // Es un GDR - buscar el CU base
            var baseCU = FindBaseCUForVersion(entry.Version, allEntries);
            if (!string.IsNullOrEmpty(baseCU))
            {
                parts.Add(baseCU);
                parts.Add("GDR");
            }
            else
            {
                // GDR directo sobre RTM o SP (sin CU intermedio)
                parts.Add("GDR");
            }
        }
        
        return string.Join("-", parts);
    }
    
    /// <summary>
    /// Retorna la versión tal como está en el archivo de referencia.
    /// No se agrega el cuarto componente artificialmente porque puede variar (.1, .2, etc.)
    /// </summary>
    private string NormalizeVersionTo4Parts(string version)
    {
        // Retornar la versión tal como está - no agregar .0 artificialmente
        // porque el cuarto componente real puede ser .1, .2, etc.
        return version ?? string.Empty;
    }

    #endregion

    #region Helper Methods

    private async Task<List<InventoryServerForPatchingDto>> GetFilteredServersFromInventoryAsync()
    {
        var response = await _httpClient.GetAsync(InventoryApiUrl);
        response.EnsureSuccessStatusCode();
        
        var json = await response.Content.ReadAsStringAsync();
        var allServers = JsonSerializer.Deserialize<List<InventoryServerForPatchingDto>>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<InventoryServerForPatchingDto>();
        
        // Incluir todos los servidores (AWS, DMZ, etc.) - filtrar vacíos y eliminar duplicados por NombreInstancia
        return allServers
            .Where(s => !string.IsNullOrEmpty(s.ServerName) && !string.IsNullOrEmpty(s.NombreInstancia))
            .GroupBy(s => s.NombreInstancia, StringComparer.OrdinalIgnoreCase)
            .Select(g => g.First()) // Tomar solo el primero de cada grupo de duplicados
            .ToList();
    }
    
    /// <summary>
    /// Verifica si un servidor es DMZ (no se puede conectar directamente)
    /// </summary>
    private bool IsDmzServer(InventoryServerForPatchingDto server)
    {
        return server.ServerName.Contains("DMZ", StringComparison.OrdinalIgnoreCase) ||
               server.NombreInstancia.Contains("DMZ", StringComparison.OrdinalIgnoreCase);
    }
    
    /// <summary>
    /// Procesa servidores DMZ usando datos del inventario (no se puede conectar directamente)
    /// </summary>
    private void ProcessDmzServerFromInventory(
        InventoryServerForPatchingDto server,
        ServerPatchStatusDto result)
    {
        _logger.LogInformation("Procesando servidor DMZ desde inventario: {Instance}, ProductVersion: {Version}", 
            server.NombreInstancia, server.ProductVersion ?? "(vacío)");
        
        // Usar datos del inventario
        result.CurrentBuild = server.ProductVersion ?? string.Empty;
        result.CurrentSP = server.ProductLevel ?? "RTM";
        result.CurrentCU = server.ProductUpdateLevel ?? string.Empty;
        result.KBReference = server.ProductUpdateReference ?? string.Empty;
        
        // Obtener la versión mayor del inventario o derivarla del build
        if (!string.IsNullOrEmpty(server.MajorVersion))
        {
            // Normalizar: extraer solo el año (ej: "Microsoft SQL Server 2014" -> "2014")
            result.MajorVersion = ExtractMajorVersion(server.MajorVersion);
        }
        else if (!string.IsNullOrEmpty(result.CurrentBuild))
        {
            result.MajorVersion = GetMajorVersionName(result.CurrentBuild) ?? "Unknown";
        }
        else
        {
            result.MajorVersion = "Unknown";
        }
        
        // Marcar como conectado exitosamente (datos del inventario)
        result.ConnectionSuccess = true;
        result.IsDmzServer = true; // Flag para identificar que es DMZ
        
        _logger.LogInformation("DMZ procesado: {Instance}, MajorVersion: {MajorVersion}, CurrentBuild: {Build}, ConnectionSuccess: {Success}", 
            result.InstanceName, result.MajorVersion, result.CurrentBuild, result.ConnectionSuccess);
    }

    private List<BuildEntry> GetEntriesForMajorVersion(string? majorVersion)
    {
        if (_buildIndex?.Data == null || string.IsNullOrEmpty(majorVersion)) 
            return new List<BuildEntry>();
        
        var versionPrefix = majorVersion switch
        {
            "2000" => "8.",
            "2005" => "9.",
            "2008" => "10.0",
            "2008 R2" => "10.5",
            "2012" => "11.",
            "2014" => "12.",
            "2016" => "13.",
            "2017" => "14.",
            "2019" => "15.",
            "2022" => "16.",
            "2025" => "17.",
            _ => null
        };
        
        if (versionPrefix == null) return new List<BuildEntry>();
        
        return _buildIndex.Data
            .Where(e => e.Version?.StartsWith(versionPrefix) == true)
            .ToList();
    }

    private BuildEntry? FindLatestCUForVersion(string? majorVersion)
    {
        var entries = GetEntriesForMajorVersion(majorVersion);
        
        return entries
            .Where(e => !string.IsNullOrEmpty(e.CU))
            .OrderByDescending(e => e.Version)
            .FirstOrDefault();
    }

    private int CalculatePendingCUs(string currentBuild, string targetBuild, string? majorVersion)
    {
        var entries = GetEntriesForMajorVersion(majorVersion);
        var currentVersion = NormalizeVersion(currentBuild);
        var targetVersion = NormalizeVersion(targetBuild);
        
        return entries
            .Where(e => !string.IsNullOrEmpty(e.CU))
            .Where(e => CompareVersions(e.Version ?? "", currentVersion) > 0)
            .Where(e => CompareVersions(e.Version ?? "", targetVersion) <= 0)
            .Count();
    }

    private int CompareVersions(string v1, string v2)
    {
        try
        {
            var n1 = NormalizeVersion(v1);
            var n2 = NormalizeVersion(v2);
            
            var parts1 = n1.Split('.').Select(p => int.TryParse(p, out var n) ? n : 0).ToArray();
            var parts2 = n2.Split('.').Select(p => int.TryParse(p, out var n) ? n : 0).ToArray();
            
            var maxLength = Math.Max(parts1.Length, parts2.Length);
            
            for (int i = 0; i < maxLength; i++)
            {
                var p1 = i < parts1.Length ? parts1[i] : 0;
                var p2 = i < parts2.Length ? parts2[i] : 0;
                
                if (p1 < p2) return -1;
                if (p1 > p2) return 1;
            }
            
            return 0;
        }
        catch
        {
            return string.Compare(v1, v2, StringComparison.OrdinalIgnoreCase);
        }
    }

    private string NormalizeVersion(string version)
    {
        var parts = version.Split('.');
        return parts.Length == 4 ? string.Join(".", parts.Take(3)) : version;
    }

    private string? GetMajorVersionName(string build)
    {
        if (string.IsNullOrEmpty(build)) return null;
        
        // Ordenar por longitud de clave descendente para evitar coincidencias parciales
        // (ej: "10.5" debe verificarse antes que "10.")
        foreach (var kvp in VersionPrefixMap.OrderByDescending(x => x.Key.Length))
        {
            if (build.StartsWith(kvp.Key)) return kvp.Value;
        }
        return null;
    }
    
    /// <summary>
    /// Mapea el número de versión mayor de SQL Server al nombre de la versión
    /// </summary>
    private string MapMajorVersionNumber(string majorVersionNumber, string minorVersionNumber = "")
    {
        // SQL Server 2008 R2 tiene major=10, minor=50
        if (majorVersionNumber == "10" && minorVersionNumber == "50")
        {
            return "2008 R2";
        }
        
        return majorVersionNumber switch
        {
            "8" => "2000",
            "9" => "2005",
            "10" => "2008",
            "11" => "2012",
            "12" => "2014",
            "13" => "2016",
            "14" => "2017",
            "15" => "2019",
            "16" => "2022",
            "17" => "2025",
            _ => "Unknown"
        };
    }

    private string ExtractMajorVersion(string majorVersion)
    {
        var match = Regex.Match(majorVersion, @"\d{4}( R2)?");
        return match.Success ? match.Value : majorVersion;
    }

    private string GetKBFromEntry(BuildEntry entry)
    {
        if (entry.KBList == null) return string.Empty;
        
        if (entry.KBList is string kb) return $"KB{kb}";
        
        if (entry.KBList is JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.String)
                return $"KB{element.GetString()}";
            if (element.ValueKind == JsonValueKind.Array && element.GetArrayLength() > 0)
                return $"KB{element[0].GetString()}";
        }
        
        return string.Empty;
    }

    private string BuildConnectionString(string instanceName, bool isAws = false)
    {
        if (isAws)
        {
            // Para servidores AWS usar autenticación SQL
            return $"Server={instanceName};Database=master;User Id=ScriptExec;Password=M1gr4rD5DB%!;TrustServerCertificate=True;Connect Timeout={ConnectionTimeoutSeconds};Application Name=SQLGuardObservatory-Patching";
        }
        
        // Para servidores on-premise usar autenticación Windows
        return $"Server={instanceName};Database=master;Integrated Security=True;TrustServerCertificate=True;Connect Timeout={ConnectionTimeoutSeconds};Application Name=SQLGuardObservatory-Patching";
    }
    
    private bool IsAwsServer(InventoryServerForPatchingDto server)
    {
        return string.Equals(server.hostingSite, "AWS", StringComparison.OrdinalIgnoreCase);
    }

    private ServerPatchStatusDto MapCacheToDto(ServerPatchStatusCache cache)
    {
        return new ServerPatchStatusDto
        {
            ServerName = cache.ServerName,
            InstanceName = cache.InstanceName,
            Ambiente = cache.Ambiente ?? string.Empty,
            HostingSite = cache.HostingSite ?? string.Empty,
            MajorVersion = cache.MajorVersion ?? string.Empty,
            CurrentBuild = cache.CurrentBuild ?? string.Empty,
            CurrentCU = cache.CurrentCU ?? string.Empty,
            CurrentSP = cache.CurrentSP ?? string.Empty,
            KBReference = cache.KBReference ?? string.Empty,
            RequiredBuild = cache.RequiredBuild ?? string.Empty,
            RequiredCU = cache.RequiredCU ?? string.Empty,
            LatestBuild = cache.LatestBuild ?? string.Empty,
            LatestCU = cache.LatestCU ?? string.Empty,
            LatestKBReference = cache.LatestKBReference ?? string.Empty,
            PendingCUsForCompliance = cache.PendingCUsForCompliance,
            PendingCUsForLatest = cache.PendingCUsForLatest,
            PatchStatus = cache.PatchStatus,
            ConnectionSuccess = cache.ConnectionSuccess,
            IsDmzServer = cache.IsDmzServer,
            ErrorMessage = cache.ErrorMessage,
            LastChecked = cache.LastChecked
        };
    }

    private ServerPatchStatusCache MapDtoToCache(ServerPatchStatusDto dto)
    {
        return new ServerPatchStatusCache
        {
            ServerName = dto.ServerName,
            InstanceName = dto.InstanceName,
            Ambiente = dto.Ambiente,
            HostingSite = dto.HostingSite,
            MajorVersion = dto.MajorVersion,
            CurrentBuild = dto.CurrentBuild,
            CurrentCU = dto.CurrentCU,
            CurrentSP = dto.CurrentSP,
            KBReference = dto.KBReference,
            RequiredBuild = dto.RequiredBuild,
            RequiredCU = dto.RequiredCU,
            LatestBuild = dto.LatestBuild,
            LatestCU = dto.LatestCU,
            LatestKBReference = dto.LatestKBReference,
            PendingCUsForCompliance = dto.PendingCUsForCompliance,
            PendingCUsForLatest = dto.PendingCUsForLatest,
            PatchStatus = dto.PatchStatus,
            ConnectionSuccess = dto.ConnectionSuccess,
            IsDmzServer = dto.IsDmzServer,
            ErrorMessage = dto.ErrorMessage,
            LastChecked = dto.LastChecked ?? DateTime.Now,
            CreatedAt = DateTime.Now
        };
    }

    private void UpdateCacheEntity(ServerPatchStatusCache entity, ServerPatchStatusDto dto)
    {
        entity.ServerName = dto.ServerName;
        entity.Ambiente = dto.Ambiente;
        entity.HostingSite = dto.HostingSite;
        entity.MajorVersion = dto.MajorVersion;
        entity.CurrentBuild = dto.CurrentBuild;
        entity.CurrentCU = dto.CurrentCU;
        entity.CurrentSP = dto.CurrentSP;
        entity.KBReference = dto.KBReference;
        entity.RequiredBuild = dto.RequiredBuild;
        entity.RequiredCU = dto.RequiredCU;
        entity.LatestBuild = dto.LatestBuild;
        entity.LatestCU = dto.LatestCU;
        entity.LatestKBReference = dto.LatestKBReference;
        entity.PendingCUsForCompliance = dto.PendingCUsForCompliance;
        entity.PendingCUsForLatest = dto.PendingCUsForLatest;
        entity.PatchStatus = dto.PatchStatus;
        entity.ConnectionSuccess = dto.ConnectionSuccess;
        entity.IsDmzServer = dto.IsDmzServer;
        entity.ErrorMessage = dto.ErrorMessage;
        entity.LastChecked = dto.LastChecked ?? DateTime.Now;
    }

    #endregion
}

/// <summary>
/// Extensiones para ordenar resultados
/// </summary>
public static class PatchStatusExtensions
{
    public static IEnumerable<ServerPatchStatusDto> OrderByStatus(this IEnumerable<ServerPatchStatusDto> source)
    {
        return source
            .OrderBy(r => r.PatchStatus switch
            {
                "NonCompliant" => 0,
                "Critical" => 1,
                "Outdated" => 2,
                "Error" => 3,
                "Unknown" => 4,
                "Compliant" => 5,
                "Updated" => 6,
                _ => 7
            })
            .ThenByDescending(r => r.PendingCUsForCompliance)
            .ThenBy(r => r.Ambiente)
            .ThenBy(r => r.ServerName);
    }
}
