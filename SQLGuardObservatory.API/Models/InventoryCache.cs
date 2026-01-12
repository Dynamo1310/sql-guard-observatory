using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace SQLGuardObservatory.API.Models;

/// <summary>
/// Caché de instancias SQL Server
/// </summary>
[Table("SqlServerInstancesCache")]
public class SqlServerInstanceCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? LocalNetAddress { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string NombreInstancia { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? MajorVersion { get; set; }
    
    [MaxLength(50)]
    public string? ProductLevel { get; set; }
    
    [MaxLength(255)]
    public string? Edition { get; set; }
    
    [MaxLength(50)]
    public string? ProductUpdateLevel { get; set; }
    
    [MaxLength(50)]
    public string? ProductVersion { get; set; }
    
    [MaxLength(50)]
    public string? ProductUpdateReference { get; set; }
    
    [MaxLength(100)]
    public string? Collation { get; set; }
    
    [MaxLength(20)]
    public string? AlwaysOn { get; set; }
    
    [MaxLength(100)]
    public string? HostingSite { get; set; }
    
    [MaxLength(100)]
    public string? HostingType { get; set; }
    
    [MaxLength(100)]
    public string? Ambiente { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Caché de bases de datos SQL Server
/// </summary>
[Table("SqlServerDatabasesCache")]
public class SqlServerDatabaseCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    // Referencia a la instancia
    public int ServerInstanceId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? ServerAmbiente { get; set; }
    
    // Datos de la base de datos
    public int DatabaseId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string DbName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Status { get; set; }
    
    [MaxLength(50)]
    public string? StateDesc { get; set; }
    
    public int? DataFiles { get; set; }
    
    public int? DataMB { get; set; }
    
    [MaxLength(50)]
    public string? UserAccess { get; set; }
    
    [MaxLength(50)]
    public string? RecoveryModel { get; set; }
    
    [MaxLength(100)]
    public string? CompatibilityLevel { get; set; }
    
    public DateTime? CreationDate { get; set; }
    
    [MaxLength(100)]
    public string? Collation { get; set; }
    
    public bool? Fulltext { get; set; }
    
    public bool? AutoClose { get; set; }
    
    public bool? ReadOnly { get; set; }
    
    public bool? AutoShrink { get; set; }
    
    public bool? AutoCreateStatistics { get; set; }
    
    public bool? AutoUpdateStatistics { get; set; }
    
    public DateTime? SourceTimestamp { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Metadatos del caché de inventario
/// </summary>
[Table("InventoryCacheMetadata")]
public class InventoryCacheMetadata
{
    [Key]
    [MaxLength(100)]
    public string CacheKey { get; set; } = string.Empty;
    
    public DateTime LastUpdatedAt { get; set; }
    
    [MaxLength(450)]
    public string? UpdatedByUserId { get; set; }
    
    [MaxLength(255)]
    public string? UpdatedByUserName { get; set; }
    
    public int? RecordCount { get; set; }
    
    public string? ErrorMessage { get; set; }
}

// ============================================================
// PostgreSQL Cache Models
// ============================================================

/// <summary>
/// Caché de instancias PostgreSQL
/// </summary>
[Table("PostgreSqlInstancesCache")]
public class PostgreSqlInstanceCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? LocalNetAddress { get; set; }
    
    [Required]
    [MaxLength(500)]
    public string NombreInstancia { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? MajorVersion { get; set; }
    
    [MaxLength(50)]
    public string? ProductLevel { get; set; }
    
    [MaxLength(100)]
    public string? Edition { get; set; }
    
    [MaxLength(50)]
    public string? ProductVersion { get; set; }
    
    [MaxLength(20)]
    public string? AlwaysOn { get; set; }
    
    [MaxLength(100)]
    public string? HostingSite { get; set; }
    
    [MaxLength(100)]
    public string? HostingType { get; set; }
    
    [MaxLength(100)]
    public string? Ambiente { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Caché de bases de datos PostgreSQL
/// </summary>
[Table("PostgreSqlDatabasesCache")]
public class PostgreSqlDatabaseCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    // Referencia a la instancia
    public int ServerInstanceId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    [MaxLength(100)]
    public string? ServerAmbiente { get; set; }
    
    // Datos de la base de datos
    public int DatabaseId { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string DbName { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? Status { get; set; }
    
    public int? DataMB { get; set; }
    
    public bool? AllowConnections { get; set; }
    
    [MaxLength(50)]
    public string? DatabaseType { get; set; }
    
    [MaxLength(50)]
    public string? Encoding { get; set; }
    
    [MaxLength(100)]
    public string? Collation { get; set; }
    
    public DateTime? SourceTimestamp { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

// ============================================================
// Redis Cache Models
// ============================================================

/// <summary>
/// Caché de instancias Redis
/// </summary>
[Table("RedisInstancesCache")]
public class RedisInstanceCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    [MaxLength(500)]
    public string? Description { get; set; }
    
    public bool ClusterModeEnabled { get; set; }
    
    [Required]
    [MaxLength(500)]
    public string NombreInstancia { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? ProductVersion { get; set; }
    
    [MaxLength(100)]
    public string? Engine { get; set; }
    
    [MaxLength(100)]
    public string? HostingSite { get; set; }
    
    [MaxLength(100)]
    public string? HostingType { get; set; }
    
    [MaxLength(100)]
    public string? Ambiente { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

// ============================================================
// DocumentDB Cache Models
// ============================================================

/// <summary>
/// Caché de instancias DocumentDB
/// </summary>
[Table("DocumentDbInstancesCache")]
public class DocumentDbInstanceCache
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.None)]
    public int Id { get; set; }
    
    [Required]
    [MaxLength(255)]
    public string ServerName { get; set; } = string.Empty;
    
    public bool ClusterModeEnabled { get; set; }
    
    [Required]
    [MaxLength(500)]
    public string NombreInstancia { get; set; } = string.Empty;
    
    [MaxLength(50)]
    public string? ProductVersion { get; set; }
    
    [MaxLength(100)]
    public string? Engine { get; set; }
    
    [MaxLength(100)]
    public string? HostingSite { get; set; }
    
    [MaxLength(100)]
    public string? HostingType { get; set; }
    
    [MaxLength(100)]
    public string? Ambiente { get; set; }
    
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;
}

