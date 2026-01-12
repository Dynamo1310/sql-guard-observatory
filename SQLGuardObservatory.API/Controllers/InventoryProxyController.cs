using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SQLGuardObservatory.API.Data;
using SQLGuardObservatory.API.Models;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace SQLGuardObservatory.API.Controllers;

/// <summary>
/// Controller para el Inventario SQL Server con caché local
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize]
public class InventoryProxyController : ControllerBase
{
    private readonly ApplicationDbContext _context;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<InventoryProxyController> _logger;
    private const string INVENTORY_API_BASE_URL = "http://asprbm-nov-01/InventoryDBA";
    
    // SQL Server cache keys
    private const string CACHE_KEY_INSTANCES = "SqlServerInstances";
    private const string CACHE_KEY_DATABASES = "SqlServerDatabases";
    
    // PostgreSQL cache keys
    private const string CACHE_KEY_PG_INSTANCES = "PostgreSqlInstances";
    private const string CACHE_KEY_PG_DATABASES = "PostgreSqlDatabases";
    
    // Redis cache keys
    private const string CACHE_KEY_REDIS_INSTANCES = "RedisInstances";
    
    // DocumentDB cache keys
    private const string CACHE_KEY_DOCDB_INSTANCES = "DocumentDbInstances";

    public InventoryProxyController(
        ApplicationDbContext context,
        IHttpClientFactory httpClientFactory,
        ILogger<InventoryProxyController> logger)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    #region DTOs para deserialización de la API externa

    private class ExternalInstanceDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("local_net_address")]
        public string? LocalNetAddress { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("MajorVersion")]
        public string? MajorVersion { get; set; }
        
        [JsonPropertyName("ProductLevel")]
        public string? ProductLevel { get; set; }
        
        [JsonPropertyName("Edition")]
        public string? Edition { get; set; }
        
        [JsonPropertyName("ProductUpdateLevel")]
        public string? ProductUpdateLevel { get; set; }
        
        [JsonPropertyName("ProductVersion")]
        public string? ProductVersion { get; set; }
        
        [JsonPropertyName("ProductUpdateReference")]
        public string? ProductUpdateReference { get; set; }
        
        [JsonPropertyName("Collation")]
        public string? Collation { get; set; }
        
        [JsonPropertyName("AlwaysOn")]
        public string? AlwaysOn { get; set; }
        
        [JsonPropertyName("hostingSite")]
        public string? HostingSite { get; set; }
        
        [JsonPropertyName("hostingType")]
        public string? HostingType { get; set; }
        
        [JsonPropertyName("ambiente")]
        public string? Ambiente { get; set; }
    }

    private class ExternalDatabaseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public ExternalInstanceDto? ServerName { get; set; }
        
        [JsonPropertyName("database_id")]
        public int DatabaseId { get; set; }
        
        [JsonPropertyName("dbName")]
        public string DbName { get; set; } = string.Empty;
        
        [JsonPropertyName("status")]
        public string? Status { get; set; }
        
        [JsonPropertyName("stateDesc")]
        public string? StateDesc { get; set; }
        
        [JsonPropertyName("dataFiles")]
        public int? DataFiles { get; set; }
        
        [JsonPropertyName("data_MB")]
        public int? DataMB { get; set; }
        
        [JsonPropertyName("userAccess")]
        public string? UserAccess { get; set; }
        
        [JsonPropertyName("recoveryModel")]
        public string? RecoveryModel { get; set; }
        
        [JsonPropertyName("compatibilityLevel")]
        public string? CompatibilityLevel { get; set; }
        
        [JsonPropertyName("creationDate")]
        public DateTime? CreationDate { get; set; }
        
        [JsonPropertyName("collation")]
        public string? Collation { get; set; }
        
        [JsonPropertyName("fulltext")]
        public bool? Fulltext { get; set; }
        
        [JsonPropertyName("autoClose")]
        public bool? AutoClose { get; set; }
        
        [JsonPropertyName("readOnly")]
        public bool? ReadOnly { get; set; }
        
        [JsonPropertyName("autoShrink")]
        public bool? AutoShrink { get; set; }
        
        [JsonPropertyName("autoCreateStatistics")]
        public bool? AutoCreateStatistics { get; set; }
        
        [JsonPropertyName("autoUpdateStatistics")]
        public bool? AutoUpdateStatistics { get; set; }
        
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    // ============================================================
    // PostgreSQL DTOs
    // ============================================================

    private class ExternalPgInstanceDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("local_net_address")]
        public string? LocalNetAddress { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("MajorVersion")]
        public string? MajorVersion { get; set; }
        
        [JsonPropertyName("ProductLevel")]
        public string? ProductLevel { get; set; }
        
        [JsonPropertyName("Edition")]
        public string? Edition { get; set; }
        
        [JsonPropertyName("ProductVersion")]
        public string? ProductVersion { get; set; }
        
        [JsonPropertyName("AlwaysOn")]
        public string? AlwaysOn { get; set; }
        
        [JsonPropertyName("hostingSite")]
        public string? HostingSite { get; set; }
        
        [JsonPropertyName("hostingType")]
        public string? HostingType { get; set; }
        
        [JsonPropertyName("ambiente")]
        public string? Ambiente { get; set; }
    }

    private class ExternalPgDatabaseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public ExternalPgInstanceDto? ServerName { get; set; }
        
        [JsonPropertyName("database_id")]
        public int DatabaseId { get; set; }
        
        [JsonPropertyName("dbName")]
        public string DbName { get; set; } = string.Empty;
        
        [JsonPropertyName("status")]
        public string? Status { get; set; }
        
        [JsonPropertyName("data_MB")]
        public int? DataMB { get; set; }
        
        [JsonPropertyName("allowConnections")]
        public bool? AllowConnections { get; set; }
        
        [JsonPropertyName("databaseType")]
        public string? DatabaseType { get; set; }
        
        [JsonPropertyName("encoding")]
        public string? Encoding { get; set; }
        
        [JsonPropertyName("collation")]
        public string? Collation { get; set; }
        
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    // ============================================================
    // Redis DTOs
    // ============================================================

    private class ExternalRedisInstanceDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("Description")]
        public string? Description { get; set; }
        
        [JsonPropertyName("ClusterModeEnabled")]
        public bool ClusterModeEnabled { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string? ProductVersion { get; set; }
        
        [JsonPropertyName("Engine")]
        public string? Engine { get; set; }
        
        [JsonPropertyName("hostingSite")]
        public string? HostingSite { get; set; }
        
        [JsonPropertyName("hostingType")]
        public string? HostingType { get; set; }
        
        [JsonPropertyName("ambiente")]
        public string? Ambiente { get; set; }
    }

    // ============================================================
    // DocumentDB DTOs
    // ============================================================

    private class ExternalDocDbInstanceDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("ClusterModeEnabled")]
        public bool ClusterModeEnabled { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string? ProductVersion { get; set; }
        
        [JsonPropertyName("Engine")]
        public string? Engine { get; set; }
        
        [JsonPropertyName("hostingSite")]
        public string? HostingSite { get; set; }
        
        [JsonPropertyName("hostingType")]
        public string? HostingType { get; set; }
        
        [JsonPropertyName("ambiente")]
        public string? Ambiente { get; set; }
    }

    #endregion

    #region DTOs de respuesta

    public class InstanceResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("local_net_address")]
        public string LocalNetAddress { get; set; } = string.Empty;
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("MajorVersion")]
        public string MajorVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductLevel")]
        public string ProductLevel { get; set; } = string.Empty;
        
        [JsonPropertyName("Edition")]
        public string Edition { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductUpdateLevel")]
        public string ProductUpdateLevel { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string ProductVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductUpdateReference")]
        public string ProductUpdateReference { get; set; } = string.Empty;
        
        [JsonPropertyName("Collation")]
        public string Collation { get; set; } = string.Empty;
        
        [JsonPropertyName("AlwaysOn")]
        public string AlwaysOn { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingSite")]
        public string HostingSite { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingType")]
        public string HostingType { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
    }

    public class DatabaseResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public InstanceResponseDto ServerName { get; set; } = new();
        
        [JsonPropertyName("database_id")]
        public int DatabaseId { get; set; }
        
        [JsonPropertyName("dbName")]
        public string DbName { get; set; } = string.Empty;
        
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
        
        [JsonPropertyName("stateDesc")]
        public string StateDesc { get; set; } = string.Empty;
        
        [JsonPropertyName("dataFiles")]
        public int DataFiles { get; set; }
        
        [JsonPropertyName("data_MB")]
        public int DataMB { get; set; }
        
        [JsonPropertyName("userAccess")]
        public string UserAccess { get; set; } = string.Empty;
        
        [JsonPropertyName("recoveryModel")]
        public string RecoveryModel { get; set; } = string.Empty;
        
        [JsonPropertyName("compatibilityLevel")]
        public string CompatibilityLevel { get; set; } = string.Empty;
        
        [JsonPropertyName("creationDate")]
        public DateTime? CreationDate { get; set; }
        
        [JsonPropertyName("collation")]
        public string Collation { get; set; } = string.Empty;
        
        [JsonPropertyName("fulltext")]
        public bool Fulltext { get; set; }
        
        [JsonPropertyName("autoClose")]
        public bool AutoClose { get; set; }
        
        [JsonPropertyName("readOnly")]
        public bool ReadOnly { get; set; }
        
        [JsonPropertyName("autoShrink")]
        public bool AutoShrink { get; set; }
        
        [JsonPropertyName("autoCreateStatistics")]
        public bool AutoCreateStatistics { get; set; }
        
        [JsonPropertyName("autoUpdateStatistics")]
        public bool AutoUpdateStatistics { get; set; }
        
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    // ============================================================
    // PostgreSQL Response DTOs
    // ============================================================

    public class PgInstanceResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("local_net_address")]
        public string LocalNetAddress { get; set; } = string.Empty;
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("MajorVersion")]
        public string MajorVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductLevel")]
        public string ProductLevel { get; set; } = string.Empty;
        
        [JsonPropertyName("Edition")]
        public string Edition { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string ProductVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("AlwaysOn")]
        public string AlwaysOn { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingSite")]
        public string HostingSite { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingType")]
        public string HostingType { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
    }

    public class PgDatabaseResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public PgInstanceResponseDto ServerName { get; set; } = new();
        
        [JsonPropertyName("database_id")]
        public int DatabaseId { get; set; }
        
        [JsonPropertyName("dbName")]
        public string DbName { get; set; } = string.Empty;
        
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
        
        [JsonPropertyName("data_MB")]
        public int DataMB { get; set; }
        
        [JsonPropertyName("allowConnections")]
        public bool AllowConnections { get; set; }
        
        [JsonPropertyName("databaseType")]
        public string DatabaseType { get; set; } = string.Empty;
        
        [JsonPropertyName("encoding")]
        public string Encoding { get; set; } = string.Empty;
        
        [JsonPropertyName("collation")]
        public string Collation { get; set; } = string.Empty;
        
        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }
    }

    // ============================================================
    // Redis Response DTOs
    // ============================================================

    public class RedisInstanceResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("Description")]
        public string Description { get; set; } = string.Empty;
        
        [JsonPropertyName("ClusterModeEnabled")]
        public bool ClusterModeEnabled { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string ProductVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("Engine")]
        public string Engine { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingSite")]
        public string HostingSite { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingType")]
        public string HostingType { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
    }

    // ============================================================
    // DocumentDB Response DTOs
    // ============================================================

    public class DocDbInstanceResponseDto
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }
        
        [JsonPropertyName("ServerName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("ClusterModeEnabled")]
        public bool ClusterModeEnabled { get; set; }
        
        [JsonPropertyName("NombreInstancia")]
        public string NombreInstancia { get; set; } = string.Empty;
        
        [JsonPropertyName("ProductVersion")]
        public string ProductVersion { get; set; } = string.Empty;
        
        [JsonPropertyName("Engine")]
        public string Engine { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingSite")]
        public string HostingSite { get; set; } = string.Empty;
        
        [JsonPropertyName("hostingType")]
        public string HostingType { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
    }

    public class CacheMetadataDto
    {
        [JsonPropertyName("lastUpdatedAt")]
        public DateTime? LastUpdatedAt { get; set; }
        
        [JsonPropertyName("updatedByUserName")]
        public string? UpdatedByUserName { get; set; }
        
        [JsonPropertyName("recordCount")]
        public int? RecordCount { get; set; }
    }

    public class CachedDataResponse<T>
    {
        [JsonPropertyName("data")]
        public List<T> Data { get; set; } = new();
        
        [JsonPropertyName("cacheInfo")]
        public CacheMetadataDto CacheInfo { get; set; } = new();
        
        [JsonPropertyName("pagination")]
        public PaginationDto Pagination { get; set; } = new();
    }

    public class PaginationDto
    {
        [JsonPropertyName("page")]
        public int Page { get; set; } = 1;
        
        [JsonPropertyName("pageSize")]
        public int PageSize { get; set; } = 50;
        
        [JsonPropertyName("totalRecords")]
        public int TotalRecords { get; set; }
        
        [JsonPropertyName("totalPages")]
        public int TotalPages { get; set; }
    }

    // DTOs para exportación
    public class ServerSummaryDto
    {
        [JsonPropertyName("serverName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
        
        [JsonPropertyName("instanceId")]
        public int InstanceId { get; set; }
        
        [JsonPropertyName("databaseCount")]
        public int DatabaseCount { get; set; }
    }

    public class DatabaseExportDto
    {
        [JsonPropertyName("dbName")]
        public string DbName { get; set; } = string.Empty;
        
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
        
        [JsonPropertyName("dataMB")]
        public int DataMB { get; set; }
        
        [JsonPropertyName("recoveryModel")]
        public string RecoveryModel { get; set; } = string.Empty;
        
        [JsonPropertyName("compatibilityLevel")]
        public string CompatibilityLevel { get; set; } = string.Empty;
        
        [JsonPropertyName("collation")]
        public string Collation { get; set; } = string.Empty;
        
        [JsonPropertyName("creationDate")]
        public DateTime? CreationDate { get; set; }
        
        [JsonPropertyName("dataFiles")]
        public int DataFiles { get; set; }
        
        [JsonPropertyName("userAccess")]
        public string UserAccess { get; set; } = string.Empty;
        
        [JsonPropertyName("readOnly")]
        public bool ReadOnly { get; set; }
        
        [JsonPropertyName("autoShrink")]
        public bool AutoShrink { get; set; }
        
        [JsonPropertyName("autoClose")]
        public bool AutoClose { get; set; }
    }

    public class ServerDatabasesExportDto
    {
        [JsonPropertyName("serverName")]
        public string ServerName { get; set; } = string.Empty;
        
        [JsonPropertyName("ambiente")]
        public string Ambiente { get; set; } = string.Empty;
        
        [JsonPropertyName("databases")]
        public List<DatabaseExportDto> Databases { get; set; } = new();
    }

    public class ExportDataResponse
    {
        [JsonPropertyName("servers")]
        public List<ServerDatabasesExportDto> Servers { get; set; } = new();
        
        [JsonPropertyName("exportedAt")]
        public DateTime ExportedAt { get; set; }
        
        [JsonPropertyName("totalDatabases")]
        public int TotalDatabases { get; set; }
    }

    #endregion

    /// <summary>
    /// Obtiene las instancias SQL Server desde el caché con paginación
    /// GET /api/inventoryproxy/sqlserver/instances?page=1&pageSize=50&search=&ambiente=&version=&alwaysOn=
    /// </summary>
    [HttpGet("sqlserver/instances")]
    public async Task<ActionResult<CachedDataResponse<InstanceResponseDto>>> GetSqlServerInstances(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? ambiente = null,
        [FromQuery] string? version = null,
        [FromQuery] string? alwaysOn = null)
    {
        try
        {
            // Query base
            var query = _context.SqlServerInstancesCache.AsQueryable();

            // Aplicar filtros
            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(i => 
                    i.ServerName.ToLower().Contains(searchLower) ||
                    i.NombreInstancia.ToLower().Contains(searchLower) ||
                    (i.Edition != null && i.Edition.ToLower().Contains(searchLower)));
            }

            if (!string.IsNullOrWhiteSpace(ambiente) && ambiente != "All")
            {
                query = query.Where(i => i.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(version) && version != "All")
            {
                query = query.Where(i => i.MajorVersion != null && i.MajorVersion.Contains(version));
            }

            if (!string.IsNullOrWhiteSpace(alwaysOn) && alwaysOn != "All")
            {
                query = query.Where(i => i.AlwaysOn == alwaysOn);
            }

            // Contar total
            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            // Aplicar paginación
            var instances = await query
                .OrderBy(i => i.Ambiente)
                .ThenBy(i => i.ServerName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_INSTANCES);

            var response = new CachedDataResponse<InstanceResponseDto>
            {
                Data = instances.Select(i => new InstanceResponseDto
                {
                    Id = i.Id,
                    ServerName = i.ServerName,
                    LocalNetAddress = i.LocalNetAddress ?? string.Empty,
                    NombreInstancia = i.NombreInstancia,
                    MajorVersion = i.MajorVersion ?? string.Empty,
                    ProductLevel = i.ProductLevel ?? string.Empty,
                    Edition = i.Edition ?? string.Empty,
                    ProductUpdateLevel = i.ProductUpdateLevel ?? string.Empty,
                    ProductVersion = i.ProductVersion ?? string.Empty,
                    ProductUpdateReference = i.ProductUpdateReference ?? string.Empty,
                    Collation = i.Collation ?? string.Empty,
                    AlwaysOn = i.AlwaysOn ?? string.Empty,
                    HostingSite = i.HostingSite ?? string.Empty,
                    HostingType = i.HostingType ?? string.Empty,
                    Ambiente = i.Ambiente ?? string.Empty,
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias SQL Server del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de instancias SQL Server desde la API externa
    /// POST /api/inventoryproxy/sqlserver/instances/refresh
    /// </summary>
    [HttpPost("sqlserver/instances/refresh")]
    public async Task<ActionResult<CachedDataResponse<InstanceResponseDto>>> RefreshSqlServerInstances()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de instancias SQL Server", userName);

            // Obtener datos de la API externa
            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventario/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener instancias desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalInstanceDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            // Limpiar caché existente
            _context.SqlServerInstancesCache.RemoveRange(_context.SqlServerInstancesCache);

            // Insertar nuevos datos
            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new SqlServerInstanceCache
            {
                Id = e.Id,
                ServerName = e.ServerName,
                LocalNetAddress = e.LocalNetAddress,
                NombreInstancia = e.NombreInstancia,
                MajorVersion = e.MajorVersion,
                ProductLevel = e.ProductLevel,
                Edition = e.Edition,
                ProductUpdateLevel = e.ProductUpdateLevel,
                ProductVersion = e.ProductVersion,
                ProductUpdateReference = e.ProductUpdateReference,
                Collation = e.Collation,
                AlwaysOn = e.AlwaysOn,
                HostingSite = e.HostingSite,
                HostingType = e.HostingType,
                Ambiente = e.Ambiente,
                CachedAt = now
            }).ToList();

            _context.SqlServerInstancesCache.AddRange(cacheEntries);

            // Actualizar metadatos
            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_INSTANCES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_INSTANCES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de instancias SQL Server actualizado: {Count} registros", cacheEntries.Count);

            // Devolver los datos actualizados
            return await GetSqlServerInstances();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar instancias SQL Server");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar instancias SQL Server");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }

    /// <summary>
    /// Obtiene las bases de datos SQL Server desde el caché con paginación
    /// GET /api/inventoryproxy/sqlserver/databases?page=1&pageSize=50&search=&server=&status=&recoveryModel=
    /// </summary>
    [HttpGet("sqlserver/databases")]
    public async Task<ActionResult<CachedDataResponse<DatabaseResponseDto>>> GetSqlServerDatabases(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? server = null,
        [FromQuery] string? status = null,
        [FromQuery] string? recoveryModel = null)
    {
        try
        {
            // Query base
            var query = _context.SqlServerDatabasesCache.AsQueryable();

            // Aplicar filtros
            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(d => 
                    d.DbName.ToLower().Contains(searchLower) ||
                    d.ServerName.ToLower().Contains(searchLower));
            }

            if (!string.IsNullOrWhiteSpace(server) && server != "All")
            {
                query = query.Where(d => d.ServerName == server);
            }

            if (!string.IsNullOrWhiteSpace(status) && status != "All")
            {
                query = query.Where(d => d.Status == status);
            }

            if (!string.IsNullOrWhiteSpace(recoveryModel) && recoveryModel != "All")
            {
                query = query.Where(d => d.RecoveryModel == recoveryModel);
            }

            // Contar total
            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            // Aplicar paginación
            var databases = await query
                .OrderBy(d => d.ServerName)
                .ThenBy(d => d.DbName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_DATABASES);

            // Obtener instancias para completar la información del servidor
            var serverIds = databases.Select(d => d.ServerInstanceId).Distinct().ToList();
            var instancesDict = await _context.SqlServerInstancesCache
                .Where(i => serverIds.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id);

            var response = new CachedDataResponse<DatabaseResponseDto>
            {
                Data = databases.Select(d => {
                    instancesDict.TryGetValue(d.ServerInstanceId, out var instance);
                    return new DatabaseResponseDto
                    {
                        Id = d.Id,
                        ServerName = instance != null ? new InstanceResponseDto
                        {
                            Id = instance.Id,
                            ServerName = instance.ServerName,
                            LocalNetAddress = instance.LocalNetAddress ?? string.Empty,
                            NombreInstancia = instance.NombreInstancia,
                            MajorVersion = instance.MajorVersion ?? string.Empty,
                            ProductLevel = instance.ProductLevel ?? string.Empty,
                            Edition = instance.Edition ?? string.Empty,
                            ProductUpdateLevel = instance.ProductUpdateLevel ?? string.Empty,
                            ProductVersion = instance.ProductVersion ?? string.Empty,
                            ProductUpdateReference = instance.ProductUpdateReference ?? string.Empty,
                            Collation = instance.Collation ?? string.Empty,
                            AlwaysOn = instance.AlwaysOn ?? string.Empty,
                            HostingSite = instance.HostingSite ?? string.Empty,
                            HostingType = instance.HostingType ?? string.Empty,
                            Ambiente = instance.Ambiente ?? string.Empty,
                        } : new InstanceResponseDto
                        {
                            Id = d.ServerInstanceId,
                            ServerName = d.ServerName,
                            Ambiente = d.ServerAmbiente ?? string.Empty
                        },
                        DatabaseId = d.DatabaseId,
                        DbName = d.DbName,
                        Status = d.Status ?? string.Empty,
                        StateDesc = d.StateDesc ?? string.Empty,
                        DataFiles = d.DataFiles ?? 0,
                        DataMB = d.DataMB ?? 0,
                        UserAccess = d.UserAccess ?? string.Empty,
                        RecoveryModel = d.RecoveryModel ?? string.Empty,
                        CompatibilityLevel = d.CompatibilityLevel ?? string.Empty,
                        CreationDate = d.CreationDate,
                        Collation = d.Collation ?? string.Empty,
                        Fulltext = d.Fulltext ?? false,
                        AutoClose = d.AutoClose ?? false,
                        ReadOnly = d.ReadOnly ?? false,
                        AutoShrink = d.AutoShrink ?? false,
                        AutoCreateStatistics = d.AutoCreateStatistics ?? true,
                        AutoUpdateStatistics = d.AutoUpdateStatistics ?? true,
                        Timestamp = d.SourceTimestamp
                    };
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener bases de datos SQL Server del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de bases de datos SQL Server desde la API externa
    /// POST /api/inventoryproxy/sqlserver/databases/refresh
    /// </summary>
    [HttpPost("sqlserver/databases/refresh")]
    public async Task<ActionResult<CachedDataResponse<DatabaseResponseDto>>> RefreshSqlServerDatabases()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de bases de datos SQL Server", userName);

            // Obtener datos de la API externa
            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventarioDB/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener bases de datos desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalDatabaseDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            // Limpiar caché existente
            _context.SqlServerDatabasesCache.RemoveRange(_context.SqlServerDatabasesCache);

            // Insertar nuevos datos
            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new SqlServerDatabaseCache
            {
                Id = e.Id,
                ServerInstanceId = e.ServerName?.Id ?? 0,
                ServerName = e.ServerName?.ServerName ?? string.Empty,
                ServerAmbiente = e.ServerName?.Ambiente,
                DatabaseId = e.DatabaseId,
                DbName = e.DbName,
                Status = e.Status,
                StateDesc = e.StateDesc,
                DataFiles = e.DataFiles,
                DataMB = e.DataMB,
                UserAccess = e.UserAccess,
                RecoveryModel = e.RecoveryModel,
                CompatibilityLevel = e.CompatibilityLevel,
                CreationDate = e.CreationDate,
                Collation = e.Collation,
                Fulltext = e.Fulltext,
                AutoClose = e.AutoClose,
                ReadOnly = e.ReadOnly,
                AutoShrink = e.AutoShrink,
                AutoCreateStatistics = e.AutoCreateStatistics,
                AutoUpdateStatistics = e.AutoUpdateStatistics,
                SourceTimestamp = e.Timestamp,
                CachedAt = now
            }).ToList();

            _context.SqlServerDatabasesCache.AddRange(cacheEntries);

            // Actualizar metadatos
            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_DATABASES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_DATABASES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de bases de datos SQL Server actualizado: {Count} registros", cacheEntries.Count);

            // Devolver los datos actualizados
            return await GetSqlServerDatabases();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar bases de datos SQL Server");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar bases de datos SQL Server");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }

    /// <summary>
    /// Obtiene la lista de servidores SQL Server únicos para filtros y exportación
    /// GET /api/inventoryproxy/sqlserver/servers
    /// </summary>
    [HttpGet("sqlserver/servers")]
    public async Task<ActionResult<List<ServerSummaryDto>>> GetSqlServerServers()
    {
        try
        {
            var servers = await _context.SqlServerDatabasesCache
                .GroupBy(d => new { d.ServerName, d.ServerAmbiente, d.ServerInstanceId })
                .Select(g => new ServerSummaryDto
                {
                    ServerName = g.Key.ServerName,
                    Ambiente = g.Key.ServerAmbiente ?? string.Empty,
                    InstanceId = g.Key.ServerInstanceId,
                    DatabaseCount = g.Count()
                })
                .OrderBy(s => s.Ambiente)
                .ThenBy(s => s.ServerName)
                .ToListAsync();

            return Ok(servers);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener lista de servidores SQL Server");
            return StatusCode(500, new { message = "Error al obtener lista de servidores" });
        }
    }

    /// <summary>
    /// Exporta las bases de datos SQL Server de servidores específicos (sin paginación)
    /// GET /api/inventoryproxy/sqlserver/databases/export?servers=server1,server2
    /// </summary>
    [HttpGet("sqlserver/databases/export")]
    public async Task<ActionResult<ExportDataResponse>> GetSqlServerDatabasesForExport(
        [FromQuery] string servers)
    {
        try
        {
            if (string.IsNullOrWhiteSpace(servers))
            {
                return BadRequest(new { message = "Debe especificar al menos un servidor" });
            }

            var serverList = servers.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();

            if (serverList.Count == 0)
            {
                return BadRequest(new { message = "Debe especificar al menos un servidor" });
            }

            // Obtener todas las bases de datos de los servidores seleccionados
            var databases = await _context.SqlServerDatabasesCache
                .Where(d => serverList.Contains(d.ServerName))
                .OrderBy(d => d.ServerName)
                .ThenBy(d => d.DbName)
                .ToListAsync();

            // Obtener información de las instancias
            var serverIds = databases.Select(d => d.ServerInstanceId).Distinct().ToList();
            var instancesDict = await _context.SqlServerInstancesCache
                .Where(i => serverIds.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id);

            // Agrupar por servidor
            var groupedData = databases
                .GroupBy(d => d.ServerName)
                .Select(g => new ServerDatabasesExportDto
                {
                    ServerName = g.Key,
                    Ambiente = g.FirstOrDefault()?.ServerAmbiente ?? string.Empty,
                    Databases = g.Select(d => {
                        instancesDict.TryGetValue(d.ServerInstanceId, out var instance);
                        return new DatabaseExportDto
                        {
                            DbName = d.DbName,
                            Status = d.Status ?? string.Empty,
                            DataMB = d.DataMB ?? 0,
                            RecoveryModel = d.RecoveryModel ?? string.Empty,
                            CompatibilityLevel = d.CompatibilityLevel ?? string.Empty,
                            Collation = d.Collation ?? string.Empty,
                            CreationDate = d.CreationDate,
                            DataFiles = d.DataFiles ?? 0,
                            UserAccess = d.UserAccess ?? string.Empty,
                            ReadOnly = d.ReadOnly ?? false,
                            AutoShrink = d.AutoShrink ?? false,
                            AutoClose = d.AutoClose ?? false
                        };
                    }).ToList()
                })
                .ToList();

            var response = new ExportDataResponse
            {
                Servers = groupedData,
                ExportedAt = DateTime.UtcNow,
                TotalDatabases = databases.Count
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al exportar bases de datos SQL Server");
            return StatusCode(500, new { message = "Error al exportar datos" });
        }
    }

    // ============================================================
    // POSTGRESQL ENDPOINTS
    // ============================================================

    /// <summary>
    /// Obtiene las instancias PostgreSQL desde el caché con paginación
    /// GET /api/inventoryproxy/postgresql/instances
    /// </summary>
    [HttpGet("postgresql/instances")]
    public async Task<ActionResult<CachedDataResponse<PgInstanceResponseDto>>> GetPostgreSqlInstances(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? ambiente = null,
        [FromQuery] string? version = null)
    {
        try
        {
            var query = _context.PostgreSqlInstancesCache.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(i => 
                    i.ServerName.ToLower().Contains(searchLower) ||
                    i.NombreInstancia.ToLower().Contains(searchLower));
            }

            if (!string.IsNullOrWhiteSpace(ambiente) && ambiente != "All")
            {
                query = query.Where(i => i.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(version) && version != "All")
            {
                query = query.Where(i => i.MajorVersion != null && i.MajorVersion.Contains(version));
            }

            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            var instances = await query
                .OrderBy(i => i.Ambiente)
                .ThenBy(i => i.ServerName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_PG_INSTANCES);

            var response = new CachedDataResponse<PgInstanceResponseDto>
            {
                Data = instances.Select(i => new PgInstanceResponseDto
                {
                    Id = i.Id,
                    ServerName = i.ServerName,
                    LocalNetAddress = i.LocalNetAddress ?? string.Empty,
                    NombreInstancia = i.NombreInstancia,
                    MajorVersion = i.MajorVersion ?? string.Empty,
                    ProductLevel = i.ProductLevel ?? string.Empty,
                    Edition = i.Edition ?? string.Empty,
                    ProductVersion = i.ProductVersion ?? string.Empty,
                    AlwaysOn = i.AlwaysOn ?? string.Empty,
                    HostingSite = i.HostingSite ?? string.Empty,
                    HostingType = i.HostingType ?? string.Empty,
                    Ambiente = i.Ambiente ?? string.Empty,
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias PostgreSQL del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de instancias PostgreSQL desde la API externa
    /// POST /api/inventoryproxy/postgresql/instances/refresh
    /// </summary>
    [HttpPost("postgresql/instances/refresh")]
    public async Task<ActionResult<CachedDataResponse<PgInstanceResponseDto>>> RefreshPostgreSqlInstances()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de instancias PostgreSQL", userName);

            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventarioPG/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener instancias PostgreSQL desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalPgInstanceDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            _context.PostgreSqlInstancesCache.RemoveRange(_context.PostgreSqlInstancesCache);

            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new PostgreSqlInstanceCache
            {
                Id = e.Id,
                ServerName = e.ServerName,
                LocalNetAddress = e.LocalNetAddress,
                NombreInstancia = e.NombreInstancia,
                MajorVersion = e.MajorVersion,
                ProductLevel = e.ProductLevel,
                Edition = e.Edition,
                ProductVersion = e.ProductVersion,
                AlwaysOn = e.AlwaysOn,
                HostingSite = e.HostingSite,
                HostingType = e.HostingType,
                Ambiente = e.Ambiente,
                CachedAt = now
            }).ToList();

            _context.PostgreSqlInstancesCache.AddRange(cacheEntries);

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_PG_INSTANCES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_PG_INSTANCES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de instancias PostgreSQL actualizado: {Count} registros", cacheEntries.Count);

            return await GetPostgreSqlInstances();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar instancias PostgreSQL");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar instancias PostgreSQL");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }

    /// <summary>
    /// Obtiene las bases de datos PostgreSQL desde el caché con paginación
    /// GET /api/inventoryproxy/postgresql/databases
    /// </summary>
    [HttpGet("postgresql/databases")]
    public async Task<ActionResult<CachedDataResponse<PgDatabaseResponseDto>>> GetPostgreSqlDatabases(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? server = null,
        [FromQuery] string? status = null)
    {
        try
        {
            var query = _context.PostgreSqlDatabasesCache.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(d => 
                    d.DbName.ToLower().Contains(searchLower) ||
                    d.ServerName.ToLower().Contains(searchLower));
            }

            if (!string.IsNullOrWhiteSpace(server) && server != "All")
            {
                query = query.Where(d => d.ServerName == server);
            }

            if (!string.IsNullOrWhiteSpace(status) && status != "All")
            {
                query = query.Where(d => d.Status == status);
            }

            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            var databases = await query
                .OrderBy(d => d.ServerName)
                .ThenBy(d => d.DbName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_PG_DATABASES);

            var serverIds = databases.Select(d => d.ServerInstanceId).Distinct().ToList();
            var instancesDict = await _context.PostgreSqlInstancesCache
                .Where(i => serverIds.Contains(i.Id))
                .ToDictionaryAsync(i => i.Id);

            var response = new CachedDataResponse<PgDatabaseResponseDto>
            {
                Data = databases.Select(d => {
                    instancesDict.TryGetValue(d.ServerInstanceId, out var instance);
                    return new PgDatabaseResponseDto
                    {
                        Id = d.Id,
                        ServerName = instance != null ? new PgInstanceResponseDto
                        {
                            Id = instance.Id,
                            ServerName = instance.ServerName,
                            LocalNetAddress = instance.LocalNetAddress ?? string.Empty,
                            NombreInstancia = instance.NombreInstancia,
                            MajorVersion = instance.MajorVersion ?? string.Empty,
                            ProductLevel = instance.ProductLevel ?? string.Empty,
                            Edition = instance.Edition ?? string.Empty,
                            ProductVersion = instance.ProductVersion ?? string.Empty,
                            AlwaysOn = instance.AlwaysOn ?? string.Empty,
                            HostingSite = instance.HostingSite ?? string.Empty,
                            HostingType = instance.HostingType ?? string.Empty,
                            Ambiente = instance.Ambiente ?? string.Empty,
                        } : new PgInstanceResponseDto
                        {
                            Id = d.ServerInstanceId,
                            ServerName = d.ServerName,
                            Ambiente = d.ServerAmbiente ?? string.Empty
                        },
                        DatabaseId = d.DatabaseId,
                        DbName = d.DbName,
                        Status = d.Status ?? string.Empty,
                        DataMB = d.DataMB ?? 0,
                        AllowConnections = d.AllowConnections ?? true,
                        DatabaseType = d.DatabaseType ?? string.Empty,
                        Encoding = d.Encoding ?? string.Empty,
                        Collation = d.Collation ?? string.Empty,
                        Timestamp = d.SourceTimestamp
                    };
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener bases de datos PostgreSQL del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de bases de datos PostgreSQL desde la API externa
    /// POST /api/inventoryproxy/postgresql/databases/refresh
    /// </summary>
    [HttpPost("postgresql/databases/refresh")]
    public async Task<ActionResult<CachedDataResponse<PgDatabaseResponseDto>>> RefreshPostgreSqlDatabases()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de bases de datos PostgreSQL", userName);

            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventarioDBPG/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener bases de datos PostgreSQL desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalPgDatabaseDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            _context.PostgreSqlDatabasesCache.RemoveRange(_context.PostgreSqlDatabasesCache);

            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new PostgreSqlDatabaseCache
            {
                Id = e.Id,
                ServerInstanceId = e.ServerName?.Id ?? 0,
                ServerName = e.ServerName?.ServerName ?? string.Empty,
                ServerAmbiente = e.ServerName?.Ambiente,
                DatabaseId = e.DatabaseId,
                DbName = e.DbName,
                Status = e.Status,
                DataMB = e.DataMB,
                AllowConnections = e.AllowConnections,
                DatabaseType = e.DatabaseType,
                Encoding = e.Encoding,
                Collation = e.Collation,
                SourceTimestamp = e.Timestamp,
                CachedAt = now
            }).ToList();

            _context.PostgreSqlDatabasesCache.AddRange(cacheEntries);

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_PG_DATABASES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_PG_DATABASES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de bases de datos PostgreSQL actualizado: {Count} registros", cacheEntries.Count);

            return await GetPostgreSqlDatabases();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar bases de datos PostgreSQL");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar bases de datos PostgreSQL");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }

    // ============================================================
    // REDIS ENDPOINTS
    // ============================================================

    /// <summary>
    /// Obtiene las instancias Redis desde el caché con paginación
    /// GET /api/inventoryproxy/redis/instances
    /// </summary>
    [HttpGet("redis/instances")]
    public async Task<ActionResult<CachedDataResponse<RedisInstanceResponseDto>>> GetRedisInstances(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? ambiente = null,
        [FromQuery] string? version = null,
        [FromQuery] string? clusterMode = null)
    {
        try
        {
            var query = _context.RedisInstancesCache.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(i => 
                    i.ServerName.ToLower().Contains(searchLower) ||
                    i.NombreInstancia.ToLower().Contains(searchLower) ||
                    (i.Description != null && i.Description.ToLower().Contains(searchLower)));
            }

            if (!string.IsNullOrWhiteSpace(ambiente) && ambiente != "All")
            {
                query = query.Where(i => i.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(version) && version != "All")
            {
                query = query.Where(i => i.ProductVersion != null && i.ProductVersion.Contains(version));
            }

            if (!string.IsNullOrWhiteSpace(clusterMode) && clusterMode != "All")
            {
                var isCluster = clusterMode == "Enabled";
                query = query.Where(i => i.ClusterModeEnabled == isCluster);
            }

            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            var instances = await query
                .OrderBy(i => i.Ambiente)
                .ThenBy(i => i.ServerName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_REDIS_INSTANCES);

            var response = new CachedDataResponse<RedisInstanceResponseDto>
            {
                Data = instances.Select(i => new RedisInstanceResponseDto
                {
                    Id = i.Id,
                    ServerName = i.ServerName,
                    Description = i.Description ?? string.Empty,
                    ClusterModeEnabled = i.ClusterModeEnabled,
                    NombreInstancia = i.NombreInstancia,
                    ProductVersion = i.ProductVersion ?? string.Empty,
                    Engine = i.Engine ?? string.Empty,
                    HostingSite = i.HostingSite ?? string.Empty,
                    HostingType = i.HostingType ?? string.Empty,
                    Ambiente = i.Ambiente ?? string.Empty,
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias Redis del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de instancias Redis desde la API externa
    /// POST /api/inventoryproxy/redis/instances/refresh
    /// </summary>
    [HttpPost("redis/instances/refresh")]
    public async Task<ActionResult<CachedDataResponse<RedisInstanceResponseDto>>> RefreshRedisInstances()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de instancias Redis", userName);

            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventarioREDIS/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener instancias Redis desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalRedisInstanceDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            _context.RedisInstancesCache.RemoveRange(_context.RedisInstancesCache);

            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new RedisInstanceCache
            {
                Id = e.Id,
                ServerName = e.ServerName,
                Description = e.Description,
                ClusterModeEnabled = e.ClusterModeEnabled,
                NombreInstancia = e.NombreInstancia,
                ProductVersion = e.ProductVersion,
                Engine = e.Engine,
                HostingSite = e.HostingSite,
                HostingType = e.HostingType,
                Ambiente = e.Ambiente,
                CachedAt = now
            }).ToList();

            _context.RedisInstancesCache.AddRange(cacheEntries);

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_REDIS_INSTANCES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_REDIS_INSTANCES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de instancias Redis actualizado: {Count} registros", cacheEntries.Count);

            return await GetRedisInstances();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar instancias Redis");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar instancias Redis");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }

    // ============================================================
    // DOCUMENTDB ENDPOINTS
    // ============================================================

    /// <summary>
    /// Obtiene las instancias DocumentDB desde el caché con paginación
    /// GET /api/inventoryproxy/documentdb/instances
    /// </summary>
    [HttpGet("documentdb/instances")]
    public async Task<ActionResult<CachedDataResponse<DocDbInstanceResponseDto>>> GetDocumentDbInstances(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        [FromQuery] string? search = null,
        [FromQuery] string? ambiente = null,
        [FromQuery] string? version = null,
        [FromQuery] string? clusterMode = null)
    {
        try
        {
            var query = _context.DocumentDbInstancesCache.AsQueryable();

            if (!string.IsNullOrWhiteSpace(search))
            {
                var searchLower = search.ToLower();
                query = query.Where(i => 
                    i.ServerName.ToLower().Contains(searchLower) ||
                    i.NombreInstancia.ToLower().Contains(searchLower));
            }

            if (!string.IsNullOrWhiteSpace(ambiente) && ambiente != "All")
            {
                query = query.Where(i => i.Ambiente == ambiente);
            }

            if (!string.IsNullOrWhiteSpace(version) && version != "All")
            {
                query = query.Where(i => i.ProductVersion != null && i.ProductVersion.Contains(version));
            }

            if (!string.IsNullOrWhiteSpace(clusterMode) && clusterMode != "All")
            {
                var isCluster = clusterMode == "Enabled";
                query = query.Where(i => i.ClusterModeEnabled == isCluster);
            }

            var totalRecords = await query.CountAsync();
            var totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);

            var instances = await query
                .OrderBy(i => i.Ambiente)
                .ThenBy(i => i.ServerName)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .ToListAsync();

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_DOCDB_INSTANCES);

            var response = new CachedDataResponse<DocDbInstanceResponseDto>
            {
                Data = instances.Select(i => new DocDbInstanceResponseDto
                {
                    Id = i.Id,
                    ServerName = i.ServerName,
                    ClusterModeEnabled = i.ClusterModeEnabled,
                    NombreInstancia = i.NombreInstancia,
                    ProductVersion = i.ProductVersion ?? string.Empty,
                    Engine = i.Engine ?? string.Empty,
                    HostingSite = i.HostingSite ?? string.Empty,
                    HostingType = i.HostingType ?? string.Empty,
                    Ambiente = i.Ambiente ?? string.Empty,
                }).ToList(),
                CacheInfo = new CacheMetadataDto
                {
                    LastUpdatedAt = metadata?.LastUpdatedAt,
                    UpdatedByUserName = metadata?.UpdatedByUserName,
                    RecordCount = metadata?.RecordCount
                },
                Pagination = new PaginationDto
                {
                    Page = page,
                    PageSize = pageSize,
                    TotalRecords = totalRecords,
                    TotalPages = totalPages
                }
            };

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error al obtener instancias DocumentDB del caché");
            return StatusCode(500, new { message = "Error al obtener datos del caché" });
        }
    }

    /// <summary>
    /// Actualiza el caché de instancias DocumentDB desde la API externa
    /// POST /api/inventoryproxy/documentdb/instances/refresh
    /// </summary>
    [HttpPost("documentdb/instances/refresh")]
    public async Task<ActionResult<CachedDataResponse<DocDbInstanceResponseDto>>> RefreshDocumentDbInstances()
    {
        try
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name) ?? User.FindFirstValue("name") ?? "Unknown";

            _logger.LogInformation("Usuario {UserName} solicita actualización del caché de instancias DocumentDB", userName);

            var client = _httpClientFactory.CreateClient();
            var response = await client.GetAsync($"{INVENTORY_API_BASE_URL}/inventarioDOCDB/");

            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("Error al obtener instancias DocumentDB desde API externa: {StatusCode}", response.StatusCode);
                return StatusCode((int)response.StatusCode, new { message = "Error al conectar con el servicio de inventario" });
            }

            var content = await response.Content.ReadAsStringAsync();
            var externalData = JsonSerializer.Deserialize<List<ExternalDocDbInstanceDto>>(content);

            if (externalData == null)
            {
                return BadRequest(new { message = "No se pudieron deserializar los datos de la API externa" });
            }

            _context.DocumentDbInstancesCache.RemoveRange(_context.DocumentDbInstancesCache);

            var now = DateTime.UtcNow;
            var cacheEntries = externalData.Select(e => new DocumentDbInstanceCache
            {
                Id = e.Id,
                ServerName = e.ServerName,
                ClusterModeEnabled = e.ClusterModeEnabled,
                NombreInstancia = e.NombreInstancia,
                ProductVersion = e.ProductVersion,
                Engine = e.Engine,
                HostingSite = e.HostingSite,
                HostingType = e.HostingType,
                Ambiente = e.Ambiente,
                CachedAt = now
            }).ToList();

            _context.DocumentDbInstancesCache.AddRange(cacheEntries);

            var metadata = await _context.InventoryCacheMetadata
                .FirstOrDefaultAsync(m => m.CacheKey == CACHE_KEY_DOCDB_INSTANCES);

            if (metadata == null)
            {
                metadata = new InventoryCacheMetadata { CacheKey = CACHE_KEY_DOCDB_INSTANCES };
                _context.InventoryCacheMetadata.Add(metadata);
            }

            metadata.LastUpdatedAt = now;
            metadata.UpdatedByUserId = userId;
            metadata.UpdatedByUserName = userName;
            metadata.RecordCount = cacheEntries.Count;
            metadata.ErrorMessage = null;

            await _context.SaveChangesAsync();

            _logger.LogInformation("Caché de instancias DocumentDB actualizado: {Count} registros", cacheEntries.Count);

            return await GetDocumentDbInstances();
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Error de conexión al actualizar instancias DocumentDB");
            return StatusCode(503, new { message = "No se pudo conectar con el servicio de inventario" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error inesperado al actualizar instancias DocumentDB");
            return StatusCode(500, new { message = "Error interno del servidor" });
        }
    }
}
