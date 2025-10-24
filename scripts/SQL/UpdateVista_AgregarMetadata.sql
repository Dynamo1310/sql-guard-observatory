-- =============================================
-- Verificar y Actualizar Vista: Agregar Metadata de Instancia
-- =============================================

USE SQLNova;
GO

PRINT '🔍 Verificando si la vista tiene las columnas Ambiente, HostingSite y SqlVersion...';
GO

-- =============================================
-- PASO 1: Verificar si la vista existe
-- =============================================

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
BEGIN
    PRINT '✅ Vista vw_InstanceHealth_Latest existe';
    
    -- Verificar si tiene las columnas
    DECLARE @hasAmbiente BIT = 0;
    DECLARE @hasHostingSite BIT = 0;
    DECLARE @hasSqlVersion BIT = 0;
    
    IF EXISTS (
        SELECT 1 
        FROM sys.columns c
        INNER JOIN sys.views v ON c.object_id = v.object_id
        WHERE v.name = 'vw_InstanceHealth_Latest' 
        AND c.name = 'Ambiente'
    )
        SET @hasAmbiente = 1;
    
    IF EXISTS (
        SELECT 1 
        FROM sys.columns c
        INNER JOIN sys.views v ON c.object_id = v.object_id
        WHERE v.name = 'vw_InstanceHealth_Latest' 
        AND c.name = 'HostingSite'
    )
        SET @hasHostingSite = 1;
    
    IF EXISTS (
        SELECT 1 
        FROM sys.columns c
        INNER JOIN sys.views v ON c.object_id = v.object_id
        WHERE v.name = 'vw_InstanceHealth_Latest' 
        AND c.name = 'SqlVersion'
    )
        SET @hasSqlVersion = 1;
    
    IF @hasAmbiente = 1 AND @hasHostingSite = 1 AND @hasSqlVersion = 1
    BEGIN
        PRINT '✅ La vista YA TIENE las columnas necesarias (Ambiente, HostingSite, SqlVersion)';
        PRINT 'No es necesario actualizar la vista.';
    END
    ELSE
    BEGIN
        PRINT '⚠️  Falta alguna columna. Recreando la vista...';
        
        -- Recrear la vista
        EXEC('DROP VIEW IF EXISTS dbo.vw_InstanceHealth_Latest');
        
        EXEC('
        CREATE VIEW dbo.vw_InstanceHealth_Latest
        AS
        WITH LatestScores AS (
            SELECT 
                InstanceName,
                HealthScore,
                HealthStatus,
                Tier1_Availability,
                Tier2_Continuity,
                Tier3_Resources,
                Tier4_Maintenance,
                ConnectivityScore,
                MemoryScore,
                AlwaysOnScore,
                FullBackupScore,
                LogBackupScore,
                DiskSpaceScore,
                CheckdbScore,
                IndexOptimizeScore,
                ErrorlogScore,
                Ambiente,
                HostingSite,
                SqlVersion,
                CollectedAtUtc,
                ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
            FROM dbo.InstanceHealth_Score
        ),
        LatestAvailability AS (
            SELECT 
                InstanceName,
                ConnectSuccess,
                ConnectLatencyMs,
                BlockingCount,
                MaxBlockTimeSeconds,
                PageLifeExpectancy,
                BufferCacheHitRatio,
                AlwaysOnEnabled,
                AlwaysOnWorstState,
                CollectedAtUtc,
                ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
            FROM dbo.InstanceHealth_Critical_Availability
        ),
        LatestResources AS (
            SELECT 
                InstanceName,
                DiskWorstFreePct,
                DiskDetails,
                AvgReadLatencyMs,
                AvgWriteLatencyMs,
                MaxReadLatencyMs,
                TotalIOPS,
                SlowQueriesCount,
                LongRunningQueriesCount,
                CollectedAtUtc,
                ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
            FROM dbo.InstanceHealth_Critical_Resources
        ),
        LatestBackups AS (
            SELECT 
                InstanceName,
                LastFullBackup,
                LastLogBackup,
                FullBackupBreached,
                LogBackupBreached,
                CollectedAtUtc,
                ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
            FROM dbo.InstanceHealth_Backups
        ),
        LatestMaintenance AS (
            SELECT 
                InstanceName,
                LastCheckdb,
                CheckdbOk,
                LastIndexOptimize,
                IndexOptimizeOk,
                AvgIndexFragmentation,
                HighFragmentationCount,
                Severity20PlusCount,
                CollectedAtUtc,
                ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
            FROM dbo.InstanceHealth_Maintenance
        )
        SELECT 
            s.InstanceName,
            s.HealthScore,
            s.HealthStatus,
            s.Tier1_Availability,
            s.Tier2_Continuity,
            s.Tier3_Resources,
            s.Tier4_Maintenance,
            s.ConnectivityScore,
            s.MemoryScore,
            s.AlwaysOnScore,
            s.FullBackupScore,
            s.LogBackupScore,
            s.DiskSpaceScore,
            s.CheckdbScore,
            s.IndexOptimizeScore,
            s.ErrorlogScore,
            s.Ambiente,
            s.HostingSite,
            s.SqlVersion,
            s.CollectedAtUtc AS ScoreCollectedAt,
            a.ConnectSuccess,
            a.ConnectLatencyMs,
            a.BlockingCount,
            a.MaxBlockTimeSeconds,
            a.PageLifeExpectancy,
            a.BufferCacheHitRatio,
            a.AlwaysOnEnabled,
            a.AlwaysOnWorstState,
            a.CollectedAtUtc AS AvailabilityCollectedAt,
            r.DiskWorstFreePct,
            r.DiskDetails,
            r.AvgReadLatencyMs,
            r.AvgWriteLatencyMs,
            r.MaxReadLatencyMs,
            r.TotalIOPS,
            r.SlowQueriesCount,
            r.LongRunningQueriesCount,
            r.CollectedAtUtc AS ResourcesCollectedAt,
            b.LastFullBackup,
            b.LastLogBackup,
            b.FullBackupBreached,
            b.LogBackupBreached,
            b.CollectedAtUtc AS BackupsCollectedAt,
            m.LastCheckdb,
            m.CheckdbOk,
            m.LastIndexOptimize,
            m.IndexOptimizeOk,
            m.AvgIndexFragmentation,
            m.HighFragmentationCount,
            m.Severity20PlusCount,
            m.CollectedAtUtc AS MaintenanceCollectedAt
        FROM LatestScores s
        LEFT JOIN LatestAvailability a ON s.InstanceName = a.InstanceName AND a.rn = 1
        LEFT JOIN LatestResources r ON s.InstanceName = r.InstanceName AND r.rn = 1
        LEFT JOIN LatestBackups b ON s.InstanceName = b.InstanceName AND b.rn = 1
        LEFT JOIN LatestMaintenance m ON s.InstanceName = m.InstanceName AND m.rn = 1
        WHERE s.rn = 1
        ');
        
        PRINT '✅ Vista recreada con las columnas necesarias';
    END
END
ELSE
BEGIN
    PRINT '❌ La vista vw_InstanceHealth_Latest NO existe. Ejecuta el script de creación completo primero.';
END
GO

-- =============================================
-- PASO 2: Verificación final
-- =============================================

PRINT '';
PRINT '🔍 Verificando datos de ejemplo...';
SELECT TOP 5
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    HealthScore,
    AlwaysOnEnabled,
    AlwaysOnWorstState
FROM dbo.vw_InstanceHealth_Latest
ORDER BY ScoreCollectedAt DESC;
GO

PRINT '';
PRINT '✅ Verificación completada!';
GO

