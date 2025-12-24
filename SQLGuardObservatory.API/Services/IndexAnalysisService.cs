using Microsoft.Data.SqlClient;
using SQLGuardObservatory.API.DTOs;
using System.Text.Json;

namespace SQLGuardObservatory.API.Services;

/// <summary>
/// Implementación del servicio de análisis de índices
/// </summary>
public class IndexAnalysisService : IIndexAnalysisService
{
    private readonly ILogger<IndexAnalysisService> _logger;
    private readonly IConfiguration _configuration;
    private readonly HttpClient _httpClient;
    private readonly ISystemCredentialService _systemCredentialService;
    private const string InventoryApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/";

    public IndexAnalysisService(
        ILogger<IndexAnalysisService> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory,
        ISystemCredentialService systemCredentialService)
    {
        _logger = logger;
        _configuration = configuration;
        _httpClient = httpClientFactory.CreateClient();
        _httpClient.Timeout = TimeSpan.FromSeconds(30);
        _systemCredentialService = systemCredentialService;
    }

    #region Instance & Database Methods

    public async Task<List<IndexAnalysisInstanceDto>> GetFilteredInstancesAsync()
    {
        try
        {
            var response = await _httpClient.GetAsync(InventoryApiUrl);
            response.EnsureSuccessStatusCode();
            
            var json = await response.Content.ReadAsStringAsync();
            var allInstances = JsonSerializer.Deserialize<List<InventoryInstanceDto>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new List<InventoryInstanceDto>();

            // Filtrar: hostingSite != AWS y serverName NOT LIKE %DMZ%
            var filtered = allInstances
                .Where(i => !string.Equals(i.hostingSite, "AWS", StringComparison.OrdinalIgnoreCase))
                .Where(i => !i.ServerName.Contains("DMZ", StringComparison.OrdinalIgnoreCase))
                .Select(i => new IndexAnalysisInstanceDto
                {
                    InstanceName = i.NombreInstancia,
                    ServerName = i.ServerName,
                    Ambiente = i.ambiente,
                    HostingSite = i.hostingSite,
                    MajorVersion = i.MajorVersion,
                    Edition = i.Edition
                })
                .OrderBy(i => i.Ambiente)
                .ThenBy(i => i.InstanceName)
                .ToList();

            _logger.LogInformation("Obtenidas {Count} instancias filtradas del inventario", filtered.Count);
            return filtered;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error obteniendo instancias del inventario");
            throw;
        }
    }

    public async Task<List<DatabaseInfoDto>> GetDatabasesAsync(string instanceName)
    {
        var databases = new List<DatabaseInfoDto>();
        
        var query = @"
            SELECT 
                database_id,
                name,
                state_desc,
                recovery_model_desc,
                CAST((SELECT SUM(size * 8.0 / 1024) FROM sys.master_files WHERE database_id = d.database_id) AS DECIMAL(18,2)) AS SizeMB
            FROM sys.databases d
            WHERE database_id > 4  -- Excluir bases de sistema
              AND state = 0  -- Solo ONLINE
              AND name NOT IN ('ReportServer', 'ReportServerTempDB', 'SSISDB', 'distribution')
            ORDER BY name";

        await ExecuteQueryAsync(instanceName, "master", query, reader =>
        {
            databases.Add(new DatabaseInfoDto
            {
                DatabaseId = reader.GetInt32(0),
                DatabaseName = reader.GetString(1),
                State = reader.GetString(2),
                RecoveryModel = reader.GetString(3),
                SizeMB = reader.IsDBNull(4) ? 0 : Convert.ToDouble(reader.GetDecimal(4))
            });
        });

        return databases;
    }

    #endregion

    #region Fragmented Indexes

    public async Task<List<FragmentedIndexDto>> GetFragmentedIndexesAsync(
        string instanceName, string databaseName, int minPageCount = 100, double minFragmentationPct = 10.0)
    {
        var indexes = new List<FragmentedIndexDto>();

        // Usar formato invariante para evitar problemas con separador decimal
        var minFragStr = minFragmentationPct.ToString(System.Globalization.CultureInfo.InvariantCulture);
        
        var query = $@"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                ips.avg_fragmentation_in_percent AS FragmentationPct,
                ips.page_count AS PageCount,
                CAST(ips.page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                i.is_disabled AS IsDisabled,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                ISNULL(i.fill_factor, 0) AS [FillFactor]
            FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
            INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE ips.page_count >= {minPageCount}
              AND ips.avg_fragmentation_in_percent >= {minFragStr}
              AND i.type > 0  -- Excluir heaps
              AND t.is_ms_shipped = 0
            ORDER BY ips.avg_fragmentation_in_percent DESC, ips.page_count DESC";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            // Columnas: 0=SchemaName, 1=TableName, 2=IndexName, 3=IndexType, 
            //           4=FragmentationPct, 5=PageCount, 6=SizeMB, 7=IsDisabled,
            //           8=IsPrimaryKey, 9=IsUnique, 10=FillFactor
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.IsDBNull(2) ? "HEAP" : reader.GetString(2);
            var indexType = reader.GetString(3);
            var fragPct = reader.GetDouble(4);
            
            var idx = new FragmentedIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = indexType,
                FragmentationPct = fragPct,
                PageCount = reader.GetInt64(5),
                SizeMB = Convert.ToDouble(reader.GetDecimal(6)),
                IsDisabled = reader.GetBoolean(7),
                IsPrimaryKey = reader.GetBoolean(8),
                IsUnique = reader.GetBoolean(9),
                FillFactor = reader.IsDBNull(10) ? 0 : Convert.ToInt32(reader.GetValue(10)),
                Suggestion = fragPct >= 30 ? "REBUILD" : "REORGANIZE"
            };

            // Generar scripts
            idx.RebuildScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REBUILD WITH (ONLINE = ON, SORT_IN_TEMPDB = ON);";
            idx.ReorganizeScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REORGANIZE;";

            indexes.Add(idx);
        });

        return indexes;
    }

    #endregion

    #region Unused Indexes

    public async Task<List<UnusedIndexDto>> GetUnusedIndexesAsync(string instanceName, string databaseName, int minPageCount = 100)
    {
        var indexes = new List<UnusedIndexDto>();

        var query = $@"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                ISNULL(us.user_seeks, 0) AS UserSeeks,
                ISNULL(us.user_scans, 0) AS UserScans,
                ISNULL(us.user_lookups, 0) AS UserLookups,
                ISNULL(us.user_updates, 0) AS UserUpdates,
                us.last_user_seek,
                us.last_user_scan,
                us.last_user_lookup,
                us.last_user_update,
                ps.used_page_count AS PageCount,
                CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                i.is_disabled AS IsDisabled,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            LEFT JOIN sys.dm_db_index_usage_stats us ON i.object_id = us.object_id AND i.index_id = us.index_id AND us.database_id = DB_ID()
            INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
            WHERE i.type > 0  -- No heaps
              AND i.is_primary_key = 0
              AND i.is_unique_constraint = 0
              AND t.is_ms_shipped = 0
              AND ps.used_page_count >= {minPageCount}
              AND (ISNULL(us.user_seeks, 0) + ISNULL(us.user_scans, 0) + ISNULL(us.user_lookups, 0)) = 0
              AND ISNULL(us.user_updates, 0) > 0
            ORDER BY ps.used_page_count DESC";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);
            var userUpdates = reader.GetInt64(7);

            var idx = new UnusedIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = reader.GetString(3),
                UserSeeks = reader.GetInt64(4),
                UserScans = reader.GetInt64(5),
                UserLookups = reader.GetInt64(6),
                UserUpdates = userUpdates,
                LastUserSeek = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                LastUserScan = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                LastUserLookup = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                LastUserUpdate = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
                PageCount = reader.GetInt64(12),
                SizeMB = Convert.ToDouble(reader.GetDecimal(13)),
                IsPrimaryKey = reader.GetBoolean(14),
                IsUnique = reader.GetBoolean(15),
                IsDisabled = reader.GetBoolean(16),
                Columns = reader.IsDBNull(17) ? "" : reader.GetString(17),
                IncludedColumns = reader.IsDBNull(18) ? null : reader.GetString(18),
                Severity = userUpdates > 10000 ? "Crítico" : "Advertencia"
            };

            idx.DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];";
            indexes.Add(idx);
        });

        return indexes;
    }

    #endregion

    #region Duplicate Indexes

    public async Task<List<DuplicateIndexDto>> GetDuplicateIndexesAsync(string instanceName, string databaseName)
    {
        var indexes = new List<DuplicateIndexDto>();

        var query = @"
            WITH IndexColumns AS (
                SELECT 
                    s.name AS SchemaName,
                    t.name AS TableName,
                    i.name AS IndexName,
                    i.index_id,
                    i.object_id,
                    i.type_desc AS IndexType,
                    i.is_primary_key AS IsPrimaryKey,
                    i.is_unique AS IsUnique,
                    STUFF((
                        SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                        ORDER BY ic.key_ordinal
                        FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                        ORDER BY c.name
                        FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                    ps.used_page_count AS PageCount,
                    CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB
                FROM sys.indexes i
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
                WHERE i.type > 0 AND t.is_ms_shipped = 0
            )
            SELECT 
                ic1.SchemaName,
                ic1.TableName,
                ic1.IndexName,
                ic2.IndexName AS DuplicateOfIndex,
                ic1.IndexType,
                ic1.KeyColumns,
                ic1.IncludedColumns,
                ic1.SizeMB,
                ic1.PageCount,
                ic1.IsPrimaryKey,
                ic1.IsUnique,
                CASE 
                    WHEN ic1.KeyColumns = ic2.KeyColumns AND ISNULL(ic1.IncludedColumns, '') = ISNULL(ic2.IncludedColumns, '') THEN 'Exacto'
                    ELSE 'Similar'
                END AS DuplicateType
            FROM IndexColumns ic1
            INNER JOIN IndexColumns ic2 ON ic1.object_id = ic2.object_id 
                AND ic1.index_id < ic2.index_id
                AND ic1.KeyColumns = ic2.KeyColumns
            WHERE ic1.IsPrimaryKey = 0
            ORDER BY ic1.SchemaName, ic1.TableName, ic1.IndexName";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);

            indexes.Add(new DuplicateIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                DuplicateOfIndex = reader.GetString(3),
                IndexType = reader.GetString(4),
                KeyColumns = reader.IsDBNull(5) ? "" : reader.GetString(5),
                IncludedColumns = reader.IsDBNull(6) ? null : reader.GetString(6),
                SizeMB = Convert.ToDouble(reader.GetDecimal(7)),
                PageCount = reader.GetInt64(8),
                IsPrimaryKey = reader.GetBoolean(9),
                IsUnique = reader.GetBoolean(10),
                DuplicateType = reader.GetString(11),
                DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];"
            });
        });

        return indexes;
    }

    #endregion

    #region Missing Indexes

    public async Task<List<MissingIndexDto>> GetMissingIndexesAsync(string instanceName, string databaseName)
    {
        var indexes = new List<MissingIndexDto>();

        var query = @"
            SELECT 
                OBJECT_SCHEMA_NAME(mid.object_id) AS SchemaName,
                OBJECT_NAME(mid.object_id) AS TableName,
                ISNULL(mid.equality_columns, '') AS EqualityColumns,
                mid.inequality_columns AS InequalityColumns,
                mid.included_columns AS IncludedColumns,
                migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS ImprovementMeasure,
                migs.user_seeks AS UserSeeks,
                migs.user_scans AS UserScans,
                migs.avg_total_user_cost AS AvgTotalUserCost,
                migs.avg_user_impact AS AvgUserImpact,
                migs.last_user_seek AS LastUserSeek,
                migs.last_user_scan AS LastUserScan
            FROM sys.dm_db_missing_index_details mid
            INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
            INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
            WHERE mid.database_id = DB_ID()
            ORDER BY ImprovementMeasure DESC";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var equalityCols = reader.GetString(2);
            var inequalityCols = reader.IsDBNull(3) ? null : reader.GetString(3);
            var includedCols = reader.IsDBNull(4) ? null : reader.GetString(4);
            var improvement = reader.GetDouble(5);

            var idx = new MissingIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                EqualityColumns = equalityCols,
                InequalityColumns = inequalityCols,
                IncludedColumns = includedCols,
                ImprovementMeasure = improvement,
                UserSeeks = reader.GetInt64(6),
                UserScans = reader.GetInt64(7),
                AvgTotalUserCost = reader.GetDouble(8),
                AvgUserImpact = reader.GetDouble(9),
                LastUserSeek = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                LastUserScan = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
                Severity = improvement > 100000 ? "Crítico" : improvement > 10000 ? "Advertencia" : "Bajo"
            };

            // Generar script de creación
            var keyColumns = string.IsNullOrEmpty(inequalityCols) 
                ? equalityCols 
                : $"{equalityCols}, {inequalityCols}";
            var indexName = $"IX_{tableName}_{Guid.NewGuid().ToString("N").Substring(0, 8)}";
            
            idx.CreateScript = string.IsNullOrEmpty(includedCols)
                ? $"CREATE NONCLUSTERED INDEX [{indexName}] ON [{schemaName}].[{tableName}] ({keyColumns});"
                : $"CREATE NONCLUSTERED INDEX [{indexName}] ON [{schemaName}].[{tableName}] ({keyColumns}) INCLUDE ({includedCols});";

            indexes.Add(idx);
        });

        return indexes;
    }

    #endregion

    #region Disabled Indexes

    public async Task<List<DisabledIndexDto>> GetDisabledIndexesAsync(string instanceName, string databaseName)
    {
        var indexes = new List<DisabledIndexDto>();

        var query = @"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY c.name
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                t.create_date AS CreateDate,
                t.modify_date AS ModifyDate
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE i.is_disabled = 1
              AND t.is_ms_shipped = 0
            ORDER BY s.name, t.name, i.name";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);

            indexes.Add(new DisabledIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = reader.GetString(3),
                IsPrimaryKey = reader.GetBoolean(4),
                IsUnique = reader.GetBoolean(5),
                KeyColumns = reader.IsDBNull(6) ? "" : reader.GetString(6),
                IncludedColumns = reader.IsDBNull(7) ? null : reader.GetString(7),
                CreateDate = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                ModifyDate = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                RebuildScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REBUILD;"
            });
        });

        return indexes;
    }

    #endregion

    #region Overlapping Indexes

    public async Task<List<OverlappingIndexDto>> GetOverlappingIndexesAsync(string instanceName, string databaseName)
    {
        var indexes = new List<OverlappingIndexDto>();

        var query = @"
            WITH IndexColumns AS (
                SELECT 
                    i.object_id,
                    i.index_id,
                    s.name AS SchemaName,
                    t.name AS TableName,
                    i.name AS IndexName,
                    i.type_desc AS IndexType,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                        ORDER BY ic.key_ordinal
                        FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                        ORDER BY c.name
                        FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                    ps.used_page_count AS PageCount,
                    CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                    ISNULL(us.user_seeks, 0) AS UserSeeks,
                    ISNULL(us.user_scans, 0) AS UserScans,
                    ISNULL(us.user_updates, 0) AS UserUpdates
                FROM sys.indexes i
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
                LEFT JOIN sys.dm_db_index_usage_stats us ON i.object_id = us.object_id AND i.index_id = us.index_id AND us.database_id = DB_ID()
                WHERE i.type > 0 AND t.is_ms_shipped = 0
            )
            SELECT 
                ic1.SchemaName,
                ic1.TableName,
                ic1.IndexName,
                ic2.IndexName AS OverlappedByIndex,
                ic1.IndexType,
                ic1.KeyColumns,
                ic1.IncludedColumns,
                ic2.KeyColumns AS OverlappingKeyColumns,
                ic2.IncludedColumns AS OverlappingIncludedColumns,
                ic1.SizeMB,
                ic1.PageCount,
                ic1.UserSeeks,
                ic1.UserScans,
                ic1.UserUpdates,
                'Prefijo' AS OverlapType
            FROM IndexColumns ic1
            INNER JOIN IndexColumns ic2 ON ic1.object_id = ic2.object_id 
                AND ic1.index_id <> ic2.index_id
                AND ic2.KeyColumns LIKE ic1.KeyColumns + '%'
                AND LEN(ic2.KeyColumns) > LEN(ic1.KeyColumns)
            WHERE ic1.KeyColumns IS NOT NULL
            ORDER BY ic1.SchemaName, ic1.TableName, ic1.IndexName";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);

            indexes.Add(new OverlappingIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                OverlappedByIndex = reader.GetString(3),
                IndexType = reader.GetString(4),
                KeyColumns = reader.IsDBNull(5) ? "" : reader.GetString(5),
                IncludedColumns = reader.IsDBNull(6) ? null : reader.GetString(6),
                OverlappingKeyColumns = reader.IsDBNull(7) ? "" : reader.GetString(7),
                OverlappingIncludedColumns = reader.IsDBNull(8) ? null : reader.GetString(8),
                SizeMB = Convert.ToDouble(reader.GetDecimal(9)),
                PageCount = reader.GetInt64(10),
                UserSeeks = reader.GetInt64(11),
                UserScans = reader.GetInt64(12),
                UserUpdates = reader.GetInt64(13),
                OverlapType = reader.GetString(14),
                DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];"
            });
        });

        return indexes;
    }

    #endregion

    #region Bad Indexes

    public async Task<List<BadIndexDto>> GetBadIndexesAsync(string instanceName, string databaseName)
    {
        var indexes = new List<BadIndexDto>();

        var query = @"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY c.name
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) AS KeyColumnCount,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1) AS IncludedColumnCount,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id) AS TotalColumnCount,
                (SELECT SUM(c.max_length) FROM sys.index_columns ic 
                 INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                 WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) AS KeySizeBytes,
                CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
            WHERE i.type > 0 
              AND t.is_ms_shipped = 0
              AND (
                  (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) > 5
                  OR (SELECT SUM(c.max_length) FROM sys.index_columns ic 
                      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                      WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) > 900
                  OR (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id) > 16
              )
            ORDER BY s.name, t.name, i.name";

        await ExecuteQueryAsync(instanceName, databaseName, query, reader =>
        {
            var keyCols = reader.GetInt32(6);
            var includedCols = reader.GetInt32(7);
            var totalCols = reader.GetInt32(8);
            var keySize = reader.IsDBNull(9) ? 0 : reader.GetInt32(9);
            
            string problem, severity, recommendation;
            
            if (keySize > 900)
            {
                problem = "Muy Ancho";
                severity = "Crítico";
                recommendation = "La clave del índice excede 900 bytes. Considere reducir las columnas clave.";
            }
            else if (keyCols > 5)
            {
                problem = "Demasiadas Columnas Clave";
                severity = "Advertencia";
                recommendation = $"El índice tiene {keyCols} columnas clave. Considere reducirlas para mejorar el rendimiento.";
            }
            else
            {
                problem = "Demasiadas Columnas";
                severity = "Advertencia";
                recommendation = $"El índice tiene {totalCols} columnas totales. Revise si todas son necesarias.";
            }

            indexes.Add(new BadIndexDto
            {
                SchemaName = reader.GetString(0),
                TableName = reader.GetString(1),
                IndexName = reader.GetString(2),
                IndexType = reader.GetString(3),
                KeyColumns = reader.IsDBNull(4) ? "" : reader.GetString(4),
                IncludedColumns = reader.IsDBNull(5) ? null : reader.GetString(5),
                KeyColumnCount = keyCols,
                IncludedColumnCount = includedCols,
                TotalColumnCount = totalCols,
                KeySizeBytes = keySize,
                SizeMB = Convert.ToDouble(reader.GetDecimal(10)),
                Problem = problem,
                Severity = severity,
                Recommendation = recommendation
            });
        });

        return indexes;
    }

    #endregion

    #region Full Analysis & Summary

    public async Task<FullIndexAnalysisDto> GetFullAnalysisAsync(IndexAnalysisRequest request)
    {
        var result = new FullIndexAnalysisDto();
        
        // Pre-cargar credenciales UNA VEZ para evitar problemas de concurrencia con DbContext
        // Todas las consultas son al mismo servidor, así que solo necesitamos obtener las credenciales una vez
        var preloadedCredentials = await _systemCredentialService.PreloadAssignmentsAsync();
        var connectionString = BuildConnectionStringFromPreloaded(preloadedCredentials, request.InstanceName, request.DatabaseName);
        
        // Ejecutar todos los análisis en paralelo usando la cadena de conexión pre-construida
        // Esto es thread-safe porque no accede al DbContext
        var fragmentedTask = GetFragmentedIndexesWithConnectionAsync(connectionString, request.MinPageCount, request.MinFragmentationPct);
        var unusedTask = GetUnusedIndexesWithConnectionAsync(connectionString, request.MinPageCount);
        var duplicateTask = GetDuplicateIndexesWithConnectionAsync(connectionString);
        var missingTask = GetMissingIndexesWithConnectionAsync(connectionString);
        var disabledTask = GetDisabledIndexesWithConnectionAsync(connectionString);
        var overlappingTask = GetOverlappingIndexesWithConnectionAsync(connectionString);
        var badTask = GetBadIndexesWithConnectionAsync(connectionString);

        await Task.WhenAll(fragmentedTask, unusedTask, duplicateTask, missingTask, disabledTask, overlappingTask, badTask);

        result.FragmentedIndexes = await fragmentedTask;
        result.UnusedIndexes = await unusedTask;
        result.DuplicateIndexes = await duplicateTask;
        result.MissingIndexes = await missingTask;
        result.DisabledIndexes = await disabledTask;
        result.OverlappingIndexes = await overlappingTask;
        result.BadIndexes = await badTask;

        // Calcular resumen
        result.Summary = CalculateSummary(request.InstanceName, request.DatabaseName, result);

        return result;
    }

    public async Task<IndexAnalysisSummaryDto> GetAnalysisSummaryAsync(string instanceName, string databaseName)
    {
        var request = new IndexAnalysisRequest
        {
            InstanceName = instanceName,
            DatabaseName = databaseName
        };
        
        var fullAnalysis = await GetFullAnalysisAsync(request);
        return fullAnalysis.Summary;
    }

    private IndexAnalysisSummaryDto CalculateSummary(string instanceName, string databaseName, FullIndexAnalysisDto analysis)
    {
        var totalProblems = analysis.FragmentedIndexes.Count + 
                           analysis.UnusedIndexes.Count + 
                           analysis.DuplicateIndexes.Count + 
                           analysis.DisabledIndexes.Count + 
                           analysis.OverlappingIndexes.Count +
                           analysis.BadIndexes.Count;

        var wastedSpace = analysis.UnusedIndexes.Sum(x => x.SizeMB) +
                         analysis.DuplicateIndexes.Sum(x => x.SizeMB) +
                         analysis.OverlappingIndexes.Sum(x => x.SizeMB);

        var totalIndexSize = analysis.FragmentedIndexes.Sum(x => x.SizeMB) +
                            analysis.UnusedIndexes.Sum(x => x.SizeMB);

        // Calcular health score (100 - penalizaciones)
        var healthScore = 100;
        healthScore -= Math.Min(30, analysis.FragmentedIndexes.Count(x => x.FragmentationPct >= 30) * 3);
        healthScore -= Math.Min(20, analysis.UnusedIndexes.Count * 2);
        healthScore -= Math.Min(15, analysis.DuplicateIndexes.Count * 5);
        healthScore -= Math.Min(10, analysis.DisabledIndexes.Count * 2);
        healthScore -= Math.Min(10, analysis.OverlappingIndexes.Count * 2);
        healthScore -= Math.Min(10, analysis.BadIndexes.Count(x => x.Severity == "Critical") * 3);
        healthScore = Math.Max(0, healthScore);

        var recommendations = new List<string>();
        
        if (analysis.FragmentedIndexes.Any(x => x.FragmentationPct >= 30))
            recommendations.Add($"Hay {analysis.FragmentedIndexes.Count(x => x.FragmentationPct >= 30)} índices con alta fragmentación (>=30%) que requieren REBUILD");
        
        if (analysis.UnusedIndexes.Count > 0)
            recommendations.Add($"Hay {analysis.UnusedIndexes.Count} índices sin uso que desperdician {analysis.UnusedIndexes.Sum(x => x.SizeMB):N2} MB");
        
        if (analysis.DuplicateIndexes.Count > 0)
            recommendations.Add($"Hay {analysis.DuplicateIndexes.Count} índices duplicados");
        
        if (analysis.MissingIndexes.Any(x => x.Severity == "Critical"))
            recommendations.Add($"Hay {analysis.MissingIndexes.Count(x => x.Severity == "Critical")} missing indexes críticos sugeridos");

        return new IndexAnalysisSummaryDto
        {
            InstanceName = instanceName,
            DatabaseName = databaseName,
            AnalyzedAt = DateTime.UtcNow,
            TotalIndexes = analysis.FragmentedIndexes.Count + analysis.UnusedIndexes.Count,
            FragmentedCount = analysis.FragmentedIndexes.Count,
            UnusedCount = analysis.UnusedIndexes.Count,
            DuplicateCount = analysis.DuplicateIndexes.Count,
            MissingCount = analysis.MissingIndexes.Count,
            DisabledCount = analysis.DisabledIndexes.Count,
            OverlappingCount = analysis.OverlappingIndexes.Count,
            BadIndexCount = analysis.BadIndexes.Count,
            TotalIndexSizeMB = totalIndexSize,
            WastedSpaceMB = wastedSpace,
            PotentialSavingsMB = wastedSpace,
            HealthScore = healthScore,
            HealthStatus = healthScore >= 80 ? "Saludable" : healthScore >= 50 ? "Advertencia" : "Crítico",
            TopRecommendations = recommendations.Take(5).ToList()
        };
    }

    #endregion

    #region Connection Test

    public async Task<bool> TestConnectionAsync(string instanceName)
    {
        try
        {
            var connectionString = await BuildConnectionStringAsync(instanceName, "master");
            using var connection = new SqlConnection(connectionString);
            await connection.OpenAsync();
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error conectando a instancia {Instance}", instanceName);
            return false;
        }
    }

    #endregion

    #region Internal Methods With Pre-built Connection String
    
    // Estos métodos privados usan una cadena de conexión pre-construida para evitar
    // problemas de concurrencia con DbContext cuando se ejecutan en paralelo
    
    private async Task<List<FragmentedIndexDto>> GetFragmentedIndexesWithConnectionAsync(
        string connectionString, int minPageCount = 100, double minFragmentationPct = 10.0)
    {
        var indexes = new List<FragmentedIndexDto>();
        var minFragStr = minFragmentationPct.ToString(System.Globalization.CultureInfo.InvariantCulture);
        
        var query = $@"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                ips.avg_fragmentation_in_percent AS FragmentationPct,
                ips.page_count AS PageCount,
                CAST(ips.page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                i.is_disabled AS IsDisabled,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                ISNULL(i.fill_factor, 0) AS [FillFactor]
            FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ips
            INNER JOIN sys.indexes i ON ips.object_id = i.object_id AND ips.index_id = i.index_id
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE ips.page_count >= {minPageCount}
              AND ips.avg_fragmentation_in_percent >= {minFragStr}
              AND i.type > 0
              AND t.is_ms_shipped = 0
            ORDER BY ips.avg_fragmentation_in_percent DESC, ips.page_count DESC";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.IsDBNull(2) ? "HEAP" : reader.GetString(2);
            var fragPct = reader.GetDouble(4);
            
            indexes.Add(new FragmentedIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = reader.GetString(3),
                FragmentationPct = fragPct,
                PageCount = reader.GetInt64(5),
                SizeMB = Convert.ToDouble(reader.GetDecimal(6)),
                IsDisabled = reader.GetBoolean(7),
                IsPrimaryKey = reader.GetBoolean(8),
                IsUnique = reader.GetBoolean(9),
                FillFactor = reader.IsDBNull(10) ? 0 : Convert.ToInt32(reader.GetValue(10)),
                Suggestion = fragPct >= 30 ? "REBUILD" : "REORGANIZE",
                RebuildScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REBUILD WITH (ONLINE = ON, SORT_IN_TEMPDB = ON);",
                ReorganizeScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REORGANIZE;"
            });
        });

        return indexes;
    }

    private async Task<List<UnusedIndexDto>> GetUnusedIndexesWithConnectionAsync(string connectionString, int minPageCount = 100)
    {
        var indexes = new List<UnusedIndexDto>();

        var query = $@"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                ISNULL(us.user_seeks, 0) AS UserSeeks,
                ISNULL(us.user_scans, 0) AS UserScans,
                ISNULL(us.user_lookups, 0) AS UserLookups,
                ISNULL(us.user_updates, 0) AS UserUpdates,
                us.last_user_seek,
                us.last_user_scan,
                us.last_user_lookup,
                us.last_user_update,
                ps.used_page_count AS PageCount,
                CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                i.is_disabled AS IsDisabled,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            LEFT JOIN sys.dm_db_index_usage_stats us ON i.object_id = us.object_id AND i.index_id = us.index_id AND us.database_id = DB_ID()
            INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
            WHERE i.type > 0
              AND i.is_primary_key = 0
              AND i.is_unique_constraint = 0
              AND t.is_ms_shipped = 0
              AND ps.used_page_count >= {minPageCount}
              AND (ISNULL(us.user_seeks, 0) + ISNULL(us.user_scans, 0) + ISNULL(us.user_lookups, 0)) = 0
              AND ISNULL(us.user_updates, 0) > 0
            ORDER BY ps.used_page_count DESC";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);

            indexes.Add(new UnusedIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = reader.GetString(3),
                UserSeeks = reader.GetInt64(4),
                UserScans = reader.GetInt64(5),
                UserLookups = reader.GetInt64(6),
                UserUpdates = reader.GetInt64(7),
                LastUserSeek = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                LastUserScan = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                LastUserLookup = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                LastUserUpdate = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
                PageCount = reader.GetInt64(12),
                SizeMB = Convert.ToDouble(reader.GetDecimal(13)),
                IsPrimaryKey = reader.GetBoolean(14),
                IsUnique = reader.GetBoolean(15),
                IsDisabled = reader.GetBoolean(16),
                Columns = reader.IsDBNull(17) ? "" : reader.GetString(17),
                IncludedColumns = reader.IsDBNull(18) ? null : reader.GetString(18),
                DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];"
            });
        });

        return indexes;
    }

    private async Task<List<DuplicateIndexDto>> GetDuplicateIndexesWithConnectionAsync(string connectionString)
    {
        var indexes = new List<DuplicateIndexDto>();

        var query = @"
            WITH IndexColumns AS (
                SELECT 
                    s.name AS SchemaName,
                    t.name AS TableName,
                    i.name AS IndexName,
                    i.index_id,
                    i.object_id,
                    i.type_desc AS IndexType,
                    i.is_primary_key AS IsPrimaryKey,
                    i.is_unique AS IsUnique,
                    STUFF((
                        SELECT ', ' + c.name + CASE WHEN ic.is_descending_key = 1 THEN ' DESC' ELSE '' END
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                        ORDER BY ic.key_ordinal
                        FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                        ORDER BY c.name
                        FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                    ps.used_page_count AS PageCount,
                    CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB
                FROM sys.indexes i
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
                WHERE i.type > 0 AND t.is_ms_shipped = 0
            )
            SELECT 
                ic1.SchemaName,
                ic1.TableName,
                ic1.IndexName,
                ic2.IndexName AS DuplicateOfIndex,
                ic1.IndexType,
                ic1.KeyColumns,
                ic1.IncludedColumns,
                ic1.SizeMB,
                ic1.PageCount,
                ic1.IsPrimaryKey,
                ic1.IsUnique,
                CASE 
                    WHEN ic1.KeyColumns = ic2.KeyColumns AND ISNULL(ic1.IncludedColumns, '') = ISNULL(ic2.IncludedColumns, '') THEN 'Exacto'
                    ELSE 'Similar'
                END AS DuplicateType
            FROM IndexColumns ic1
            INNER JOIN IndexColumns ic2 ON ic1.object_id = ic2.object_id 
                AND ic1.index_id < ic2.index_id
                AND ic1.KeyColumns = ic2.KeyColumns
            WHERE ic1.IsPrimaryKey = 0
            ORDER BY ic1.SchemaName, ic1.TableName, ic1.IndexName";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);
            
            indexes.Add(new DuplicateIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                DuplicateOfIndex = reader.GetString(3),
                IndexType = reader.GetString(4),
                KeyColumns = reader.IsDBNull(5) ? "" : reader.GetString(5),
                IncludedColumns = reader.IsDBNull(6) ? null : reader.GetString(6),
                SizeMB = Convert.ToDouble(reader.GetDecimal(7)),
                PageCount = reader.GetInt64(8),
                IsPrimaryKey = reader.GetBoolean(9),
                IsUnique = reader.GetBoolean(10),
                DuplicateType = reader.GetString(11),
                DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];"
            });
        });

        return indexes;
    }

    private async Task<List<MissingIndexDto>> GetMissingIndexesWithConnectionAsync(string connectionString)
    {
        var indexes = new List<MissingIndexDto>();

        var query = @"
            SELECT 
                OBJECT_SCHEMA_NAME(mid.object_id) AS SchemaName,
                OBJECT_NAME(mid.object_id) AS TableName,
                ISNULL(mid.equality_columns, '') AS EqualityColumns,
                mid.inequality_columns AS InequalityColumns,
                mid.included_columns AS IncludedColumns,
                migs.avg_total_user_cost * migs.avg_user_impact * (migs.user_seeks + migs.user_scans) AS ImprovementMeasure,
                migs.user_seeks AS UserSeeks,
                migs.user_scans AS UserScans,
                migs.avg_total_user_cost AS AvgTotalUserCost,
                migs.avg_user_impact AS AvgUserImpact,
                migs.last_user_seek AS LastUserSeek,
                migs.last_user_scan AS LastUserScan
            FROM sys.dm_db_missing_index_details mid
            INNER JOIN sys.dm_db_missing_index_groups mig ON mid.index_handle = mig.index_handle
            INNER JOIN sys.dm_db_missing_index_group_stats migs ON mig.index_group_handle = migs.group_handle
            WHERE mid.database_id = DB_ID()
            ORDER BY ImprovementMeasure DESC";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var equalityCols = reader.GetString(2);
            var inequalityCols = reader.IsDBNull(3) ? null : reader.GetString(3);
            var includedCols = reader.IsDBNull(4) ? null : reader.GetString(4);
            var improvement = reader.GetDouble(5);

            var idx = new MissingIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                EqualityColumns = equalityCols,
                InequalityColumns = inequalityCols,
                IncludedColumns = includedCols,
                ImprovementMeasure = improvement,
                UserSeeks = reader.GetInt64(6),
                UserScans = reader.GetInt64(7),
                AvgTotalUserCost = reader.GetDouble(8),
                AvgUserImpact = reader.GetDouble(9),
                LastUserSeek = reader.IsDBNull(10) ? null : reader.GetDateTime(10),
                LastUserScan = reader.IsDBNull(11) ? null : reader.GetDateTime(11),
                Severity = improvement > 100000 ? "Crítico" : improvement > 10000 ? "Advertencia" : "Bajo"
            };

            // Generar script de creación
            var keyColumns = string.IsNullOrEmpty(inequalityCols) 
                ? equalityCols 
                : $"{equalityCols}, {inequalityCols}";
            var indexName = $"IX_{tableName}_{Guid.NewGuid().ToString("N").Substring(0, 8)}";
            
            idx.CreateScript = string.IsNullOrEmpty(includedCols)
                ? $"CREATE NONCLUSTERED INDEX [{indexName}] ON [{schemaName}].[{tableName}] ({keyColumns});"
                : $"CREATE NONCLUSTERED INDEX [{indexName}] ON [{schemaName}].[{tableName}] ({keyColumns}) INCLUDE ({includedCols});";

            indexes.Add(idx);
        });

        return indexes;
    }

    private async Task<List<DisabledIndexDto>> GetDisabledIndexesWithConnectionAsync(string connectionString)
    {
        var indexes = new List<DisabledIndexDto>();

        var query = @"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                i.is_primary_key AS IsPrimaryKey,
                i.is_unique AS IsUnique,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY c.name
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                t.create_date AS CreateDate,
                t.modify_date AS ModifyDate
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            WHERE i.is_disabled = 1
              AND t.is_ms_shipped = 0
            ORDER BY s.name, t.name, i.name";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);
            
            indexes.Add(new DisabledIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                IndexType = reader.GetString(3),
                IsPrimaryKey = reader.GetBoolean(4),
                IsUnique = reader.GetBoolean(5),
                KeyColumns = reader.IsDBNull(6) ? "" : reader.GetString(6),
                IncludedColumns = reader.IsDBNull(7) ? null : reader.GetString(7),
                CreateDate = reader.IsDBNull(8) ? null : reader.GetDateTime(8),
                ModifyDate = reader.IsDBNull(9) ? null : reader.GetDateTime(9),
                RebuildScript = $"ALTER INDEX [{indexName}] ON [{schemaName}].[{tableName}] REBUILD;"
            });
        });

        return indexes;
    }

    private async Task<List<OverlappingIndexDto>> GetOverlappingIndexesWithConnectionAsync(string connectionString)
    {
        var indexes = new List<OverlappingIndexDto>();

        var query = @"
            WITH IndexColumns AS (
                SELECT 
                    i.object_id,
                    i.index_id,
                    s.name AS SchemaName,
                    t.name AS TableName,
                    i.name AS IndexName,
                    i.type_desc AS IndexType,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                        ORDER BY ic.key_ordinal
                        FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                    STUFF((
                        SELECT ', ' + c.name
                        FROM sys.index_columns ic
                        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                        WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                        ORDER BY c.name
                        FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                    ps.used_page_count AS PageCount,
                    CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB,
                    ISNULL(us.user_seeks, 0) AS UserSeeks,
                    ISNULL(us.user_scans, 0) AS UserScans,
                    ISNULL(us.user_updates, 0) AS UserUpdates
                FROM sys.indexes i
                INNER JOIN sys.tables t ON i.object_id = t.object_id
                INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
                INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
                LEFT JOIN sys.dm_db_index_usage_stats us ON i.object_id = us.object_id AND i.index_id = us.index_id AND us.database_id = DB_ID()
                WHERE i.type > 0 AND t.is_ms_shipped = 0
            )
            SELECT 
                ic1.SchemaName,
                ic1.TableName,
                ic1.IndexName,
                ic2.IndexName AS OverlappedByIndex,
                ic1.IndexType,
                ic1.KeyColumns,
                ic1.IncludedColumns,
                ic2.KeyColumns AS OverlappingKeyColumns,
                ic2.IncludedColumns AS OverlappingIncludedColumns,
                ic1.SizeMB,
                ic1.PageCount,
                ic1.UserSeeks,
                ic1.UserScans,
                ic1.UserUpdates,
                'Prefijo' AS OverlapType
            FROM IndexColumns ic1
            INNER JOIN IndexColumns ic2 ON ic1.object_id = ic2.object_id 
                AND ic1.index_id <> ic2.index_id
                AND ic2.KeyColumns LIKE ic1.KeyColumns + '%'
                AND LEN(ic2.KeyColumns) > LEN(ic1.KeyColumns)
            WHERE ic1.KeyColumns IS NOT NULL
            ORDER BY ic1.SchemaName, ic1.TableName, ic1.IndexName";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var schemaName = reader.GetString(0);
            var tableName = reader.GetString(1);
            var indexName = reader.GetString(2);
            
            indexes.Add(new OverlappingIndexDto
            {
                SchemaName = schemaName,
                TableName = tableName,
                IndexName = indexName,
                OverlappedByIndex = reader.GetString(3),
                IndexType = reader.GetString(4),
                KeyColumns = reader.IsDBNull(5) ? "" : reader.GetString(5),
                IncludedColumns = reader.IsDBNull(6) ? null : reader.GetString(6),
                OverlappingKeyColumns = reader.IsDBNull(7) ? "" : reader.GetString(7),
                OverlappingIncludedColumns = reader.IsDBNull(8) ? null : reader.GetString(8),
                SizeMB = Convert.ToDouble(reader.GetDecimal(9)),
                PageCount = reader.GetInt64(10),
                UserSeeks = reader.GetInt64(11),
                UserScans = reader.GetInt64(12),
                UserUpdates = reader.GetInt64(13),
                OverlapType = reader.GetString(14),
                DropScript = $"DROP INDEX [{indexName}] ON [{schemaName}].[{tableName}];"
            });
        });

        return indexes;
    }

    private async Task<List<BadIndexDto>> GetBadIndexesWithConnectionAsync(string connectionString)
    {
        var indexes = new List<BadIndexDto>();

        var query = @"
            SELECT 
                s.name AS SchemaName,
                t.name AS TableName,
                i.name AS IndexName,
                i.type_desc AS IndexType,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0
                    ORDER BY ic.key_ordinal
                    FOR XML PATH('')), 1, 2, '') AS KeyColumns,
                STUFF((
                    SELECT ', ' + c.name
                    FROM sys.index_columns ic
                    INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                    WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1
                    ORDER BY c.name
                    FOR XML PATH('')), 1, 2, '') AS IncludedColumns,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) AS KeyColumnCount,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 1) AS IncludedColumnCount,
                (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id) AS TotalColumnCount,
                (SELECT SUM(c.max_length) FROM sys.index_columns ic 
                 INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                 WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) AS KeySizeBytes,
                CAST(ps.used_page_count * 8.0 / 1024 AS DECIMAL(18,2)) AS SizeMB
            FROM sys.indexes i
            INNER JOIN sys.tables t ON i.object_id = t.object_id
            INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
            INNER JOIN sys.dm_db_partition_stats ps ON i.object_id = ps.object_id AND i.index_id = ps.index_id
            WHERE i.type > 0 
              AND t.is_ms_shipped = 0
              AND (
                  (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) > 5
                  OR (SELECT SUM(c.max_length) FROM sys.index_columns ic 
                      INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                      WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id AND ic.is_included_column = 0) > 900
                  OR (SELECT COUNT(*) FROM sys.index_columns ic WHERE ic.object_id = i.object_id AND ic.index_id = i.index_id) > 16
              )
            ORDER BY s.name, t.name, i.name";

        await ExecuteQueryWithConnectionStringAsync(connectionString, query, reader =>
        {
            var keyCols = reader.GetInt32(6);
            var includedCols = reader.GetInt32(7);
            var totalCols = reader.GetInt32(8);
            var keySize = reader.IsDBNull(9) ? 0 : reader.GetInt32(9);
            
            string problem, severity, recommendation;
            
            if (keySize > 900)
            {
                problem = "Muy Ancho";
                severity = "Crítico";
                recommendation = "La clave del índice excede 900 bytes. Considere reducir las columnas clave.";
            }
            else if (keyCols > 5)
            {
                problem = "Demasiadas Columnas Clave";
                severity = "Advertencia";
                recommendation = $"El índice tiene {keyCols} columnas clave. Considere reducirlas para mejorar el rendimiento.";
            }
            else
            {
                problem = "Demasiadas Columnas";
                severity = "Advertencia";
                recommendation = $"El índice tiene {totalCols} columnas totales. Revise si todas son necesarias.";
            }

            indexes.Add(new BadIndexDto
            {
                SchemaName = reader.GetString(0),
                TableName = reader.GetString(1),
                IndexName = reader.GetString(2),
                IndexType = reader.GetString(3),
                KeyColumns = reader.IsDBNull(4) ? "" : reader.GetString(4),
                IncludedColumns = reader.IsDBNull(5) ? null : reader.GetString(5),
                KeyColumnCount = keyCols,
                IncludedColumnCount = includedCols,
                TotalColumnCount = totalCols,
                KeySizeBytes = keySize,
                SizeMB = Convert.ToDouble(reader.GetDecimal(10)),
                Problem = problem,
                Severity = severity,
                Recommendation = recommendation
            });
        });

        return indexes;
    }

    #endregion

    #region Helper Methods

    private async Task<string> BuildConnectionStringAsync(string instanceName, string databaseName)
    {
        // Usar el servicio de credenciales de sistema para obtener la conexión apropiada
        // Si no hay credencial asignada, usa Windows Authentication como fallback
        return await _systemCredentialService.BuildConnectionStringAsync(
            instanceName,
            null,  // hostingSite - el servicio buscará por nombre de servidor
            null,  // ambiente - el servicio buscará por nombre de servidor
            databaseName,
            30,    // timeoutSeconds
            "SQLNovaIndexAnalysis");
    }
    
    /// <summary>
    /// Construye una cadena de conexión usando credenciales pre-cargadas (thread-safe)
    /// </summary>
    private string BuildConnectionStringFromPreloaded(PreloadedCredentialAssignments preloaded, string instanceName, string databaseName)
    {
        return _systemCredentialService.BuildConnectionStringFromPreloaded(
            preloaded,
            instanceName,
            null,  // hostingSite
            null,  // ambiente
            databaseName,
            30,    // timeoutSeconds
            "SQLNovaIndexAnalysis");
    }

    private async Task ExecuteQueryAsync(string instanceName, string databaseName, string query, Action<SqlDataReader> processRow)
    {
        var connectionString = await BuildConnectionStringAsync(instanceName, databaseName);
        
        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 120; // 2 minutos para queries de análisis
        
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            processRow(reader);
        }
    }
    
    /// <summary>
    /// Ejecuta una consulta usando una cadena de conexión pre-construida (thread-safe)
    /// </summary>
    private async Task ExecuteQueryWithConnectionStringAsync(string connectionString, string query, Action<SqlDataReader> processRow)
    {
        using var connection = new SqlConnection(connectionString);
        await connection.OpenAsync();
        
        using var command = new SqlCommand(query, connection);
        command.CommandTimeout = 120; // 2 minutos para queries de análisis
        
        using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            processRow(reader);
        }
    }

    #endregion
}

