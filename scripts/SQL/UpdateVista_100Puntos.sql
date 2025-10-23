-- =============================================
-- Actualizar Vista: Sistema de 100 puntos
-- Eliminar columnas obsoletas del v2.0 (150 puntos)
-- =============================================

USE SQLNova;
GO

PRINT 'Actualizando a sistema de 100 puntos (v3.0)...';
GO

-- =============================================
-- PASO 1: Actualizar la vista para usar solo columnas v3.0
-- =============================================

DROP VIEW IF EXISTS dbo.vw_InstanceHealth_Latest;
GO

PRINT 'Vista eliminada. Recreando con columnas v3.0...';
GO

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
WHERE s.rn = 1;
GO

PRINT '✅ Vista actualizada a sistema de 100 puntos (v3.0)';
GO

-- =============================================
-- PASO 2: Verificación
-- =============================================

PRINT '';
PRINT 'Verificando columnas de la vista...';
SELECT 
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.VIEW_COLUMN_USAGE vcu
JOIN INFORMATION_SCHEMA.COLUMNS c ON c.TABLE_NAME = vcu.VIEW_NAME
WHERE vcu.VIEW_NAME = 'vw_InstanceHealth_Latest'
  AND (COLUMN_NAME LIKE '%Score%' OR COLUMN_NAME LIKE 'Tier%')
ORDER BY COLUMN_NAME;
GO

PRINT '';
PRINT '✅ Verificando datos...';
SELECT TOP 3
    InstanceName,
    HealthScore,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    ConnectivityScore,
    DiskSpaceScore,
    ScoreCollectedAt
FROM dbo.vw_InstanceHealth_Latest
ORDER BY ScoreCollectedAt DESC;
GO

PRINT '';
PRINT '✅ Actualización completada!';
PRINT '';
PRINT 'Columnas ELIMINADAS (v2.0 - 150 puntos):';
PRINT '  - BlockingScore';
PRINT '  - LatencyScore';
PRINT '  - IOPSScore';
PRINT '  - QueryPerformanceScore';
PRINT '';
PRINT 'Columnas ACTUALES (v3.0 - 100 puntos):';
PRINT '  - ConnectivityScore (incluye conectividad, latencia, blocking)';
PRINT '  - MemoryScore';
PRINT '  - AlwaysOnScore';
PRINT '  - FullBackupScore';
PRINT '  - LogBackupScore';
PRINT '  - DiskSpaceScore (incluye espacio + IOPS)';
PRINT '  - CheckdbScore';
PRINT '  - IndexOptimizeScore';
PRINT '  - ErrorlogScore';
GO

