namespace SQLGuardObservatory.API.DTOs;

// ==================== INSTANCE & DATABASE ====================

/// <summary>
/// Instancia del inventario filtrada para análisis de índices
/// </summary>
public class IndexAnalysisInstanceDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string ServerName { get; set; } = string.Empty;
    public string Ambiente { get; set; } = string.Empty;
    public string HostingSite { get; set; } = string.Empty;
    public string? MajorVersion { get; set; }
    public string? Edition { get; set; }
}

/// <summary>
/// Información básica de una base de datos
/// </summary>
public class DatabaseInfoDto
{
    public int DatabaseId { get; set; }
    public string DatabaseName { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string RecoveryModel { get; set; } = string.Empty;
    public double SizeMB { get; set; }
}

// ==================== FRAGMENTED INDEXES ====================

/// <summary>
/// Índice fragmentado con sugerencia de mantenimiento
/// </summary>
public class FragmentedIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public double FragmentationPct { get; set; }
    public long PageCount { get; set; }
    public double SizeMB { get; set; }
    public string Suggestion { get; set; } = string.Empty; // REBUILD, REORGANIZE, NONE
    public bool IsDisabled { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsUnique { get; set; }
    public int FillFactor { get; set; }
    public string? RebuildScript { get; set; }
    public string? ReorganizeScript { get; set; }
}

// ==================== UNUSED INDEXES ====================

/// <summary>
/// Índice sin uso (candidato a eliminación)
/// </summary>
public class UnusedIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public long UserSeeks { get; set; }
    public long UserScans { get; set; }
    public long UserLookups { get; set; }
    public long UserUpdates { get; set; }
    public DateTime? LastUserSeek { get; set; }
    public DateTime? LastUserScan { get; set; }
    public DateTime? LastUserLookup { get; set; }
    public DateTime? LastUserUpdate { get; set; }
    public double SizeMB { get; set; }
    public long PageCount { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsUnique { get; set; }
    public bool IsDisabled { get; set; }
    public string Columns { get; set; } = string.Empty;
    public string? IncludedColumns { get; set; }
    public string? DropScript { get; set; }
    public string Severity { get; set; } = "Warning"; // Warning, Critical
}

// ==================== DUPLICATE INDEXES ====================

/// <summary>
/// Índice duplicado (mismas columnas clave)
/// </summary>
public class DuplicateIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string DuplicateOfIndex { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public string KeyColumns { get; set; } = string.Empty;
    public string? IncludedColumns { get; set; }
    public double SizeMB { get; set; }
    public long PageCount { get; set; }
    public bool IsPrimaryKey { get; set; }
    public bool IsUnique { get; set; }
    public string DuplicateType { get; set; } = string.Empty; // Exact, Similar
    public string? DropScript { get; set; }
}

// ==================== MISSING INDEXES ====================

/// <summary>
/// Índice faltante sugerido por SQL Server
/// </summary>
public class MissingIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string EqualityColumns { get; set; } = string.Empty;
    public string? InequalityColumns { get; set; }
    public string? IncludedColumns { get; set; }
    public double ImprovementMeasure { get; set; }
    public long UserSeeks { get; set; }
    public long UserScans { get; set; }
    public double AvgTotalUserCost { get; set; }
    public double AvgUserImpact { get; set; }
    public DateTime? LastUserSeek { get; set; }
    public DateTime? LastUserScan { get; set; }
    public string? CreateScript { get; set; }
    public string Severity { get; set; } = "Info"; // Info, Warning, Critical
}

// ==================== DISABLED INDEXES ====================

/// <summary>
/// Índice deshabilitado
/// </summary>
public class DisabledIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public bool IsPrimaryKey { get; set; }
    public bool IsUnique { get; set; }
    public string KeyColumns { get; set; } = string.Empty;
    public string? IncludedColumns { get; set; }
    public DateTime? CreateDate { get; set; }
    public DateTime? ModifyDate { get; set; }
    public string? RebuildScript { get; set; }
}

// ==================== OVERLAPPING INDEXES ====================

/// <summary>
/// Índice solapado/redundante (cubierto por otro índice)
/// </summary>
public class OverlappingIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string OverlappedByIndex { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public string KeyColumns { get; set; } = string.Empty;
    public string? IncludedColumns { get; set; }
    public string OverlappingKeyColumns { get; set; } = string.Empty;
    public string? OverlappingIncludedColumns { get; set; }
    public double SizeMB { get; set; }
    public long PageCount { get; set; }
    public long UserSeeks { get; set; }
    public long UserScans { get; set; }
    public long UserUpdates { get; set; }
    public string OverlapType { get; set; } = string.Empty; // Subset, Prefix
    public string? DropScript { get; set; }
}

// ==================== BAD INDEXES ====================

/// <summary>
/// Índice con problemas de diseño (muy ancho, muchas columnas, etc.)
/// </summary>
public class BadIndexDto
{
    public string SchemaName { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string IndexName { get; set; } = string.Empty;
    public string IndexType { get; set; } = string.Empty;
    public string KeyColumns { get; set; } = string.Empty;
    public string? IncludedColumns { get; set; }
    public int KeyColumnCount { get; set; }
    public int IncludedColumnCount { get; set; }
    public int TotalColumnCount { get; set; }
    public int KeySizeBytes { get; set; }
    public double SizeMB { get; set; }
    public string Problem { get; set; } = string.Empty; // TooWide, TooManyColumns, LowSelectivity
    public string Severity { get; set; } = "Warning"; // Warning, Critical
    public string Recommendation { get; set; } = string.Empty;
}

// ==================== SUMMARY ====================

/// <summary>
/// Resumen del análisis completo de índices
/// </summary>
public class IndexAnalysisSummaryDto
{
    public string InstanceName { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public DateTime AnalyzedAt { get; set; }
    
    // Contadores
    public int TotalIndexes { get; set; }
    public int FragmentedCount { get; set; }
    public int UnusedCount { get; set; }
    public int DuplicateCount { get; set; }
    public int MissingCount { get; set; }
    public int DisabledCount { get; set; }
    public int OverlappingCount { get; set; }
    public int BadIndexCount { get; set; }
    
    // Métricas de espacio
    public double TotalIndexSizeMB { get; set; }
    public double WastedSpaceMB { get; set; }
    public double PotentialSavingsMB { get; set; }
    
    // Índice de salud (0-100)
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = string.Empty; // Healthy, Warning, Critical
    
    // Recomendaciones prioritarias
    public List<string> TopRecommendations { get; set; } = new();
}

// ==================== FULL ANALYSIS ====================

/// <summary>
/// Análisis completo de índices de una base de datos
/// </summary>
public class FullIndexAnalysisDto
{
    public IndexAnalysisSummaryDto Summary { get; set; } = new();
    public List<FragmentedIndexDto> FragmentedIndexes { get; set; } = new();
    public List<UnusedIndexDto> UnusedIndexes { get; set; } = new();
    public List<DuplicateIndexDto> DuplicateIndexes { get; set; } = new();
    public List<MissingIndexDto> MissingIndexes { get; set; } = new();
    public List<DisabledIndexDto> DisabledIndexes { get; set; } = new();
    public List<OverlappingIndexDto> OverlappingIndexes { get; set; } = new();
    public List<BadIndexDto> BadIndexes { get; set; } = new();
}

// ==================== REQUEST DTOs ====================

/// <summary>
/// Request para análisis con opciones
/// </summary>
public class IndexAnalysisRequest
{
    public string InstanceName { get; set; } = string.Empty;
    public string DatabaseName { get; set; } = string.Empty;
    public int MinPageCount { get; set; } = 1000; // Mínimo de páginas para considerar
    public double MinFragmentationPct { get; set; } = 10.0; // Mínimo de fragmentación
    public bool IncludeSystemDatabases { get; set; } = false;
    public bool IncludeHeaps { get; set; } = true;
    public bool GenerateScripts { get; set; } = true;
}




