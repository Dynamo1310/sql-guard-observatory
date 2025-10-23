-- =============================================
-- Actualizar Schema para Health Score v2.0 (150 puntos)
-- =============================================

USE SQLNova;
GO

PRINT 'Actualizando a Health Score v2.0 (150 puntos)...';
GO

-- =============================================
-- PASO 1: Agregar columnas nuevas a Critical
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical') AND name = 'BlockingCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Critical
    ADD 
        BlockingCount INT NULL,
        PageLifeExpectancy INT NULL,
        AvgReadLatencyMs DECIMAL(10,2) NULL,
        AvgWriteLatencyMs DECIMAL(10,2) NULL,
        SlowQueriesCount INT NULL;
    
    PRINT 'Columnas agregadas a InstanceHealth_Critical';
END
ELSE
    PRINT 'Columnas ya existen en InstanceHealth_Critical';
GO

-- =============================================
-- PASO 2: Agregar columna de fragmentación a Maintenance
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'AvgIndexFragmentation')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Maintenance
    ADD AvgIndexFragmentation DECIMAL(5,2) NULL;
    
    PRINT 'Columna AvgIndexFragmentation agregada a InstanceHealth_Maintenance';
END
ELSE
    PRINT 'Columna AvgIndexFragmentation ya existe en InstanceHealth_Maintenance';
GO

-- =============================================
-- PASO 3: Actualizar tabla Score para 150 puntos
-- =============================================

-- Agregar columnas de breakdown más detallado
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'ConnectivityScore')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Score
    ADD 
        -- Tier 1: Disponibilidad (50 pts)
        ConnectivityScore INT NULL,
        LatencyScore INT NULL,
        BlockingScore INT NULL,
        MemoryScore INT NULL,
        
        -- Tier 2: Continuidad (40 pts)
        FullBackupScore INT NULL,
        LogBackupScore INT NULL,
        AlwaysOnScore INT NULL,
        
        -- Tier 3: Recursos (40 pts)
        DiskSpaceScore INT NULL,
        IOPSScore INT NULL,
        QueryPerformanceScore INT NULL,
        
        -- Tier 4: Mantenimiento (20 pts)
        CheckdbScore INT NULL,
        IndexOptimizeScore INT NULL,
        ErrorlogScore INT NULL;
    
    PRINT 'Columnas de breakdown detallado agregadas a InstanceHealth_Score';
END
ELSE
    PRINT 'Columnas de breakdown ya existen en InstanceHealth_Score';
GO

-- =============================================
-- PASO 4: Actualizar la vista consolidada
-- =============================================

DROP VIEW IF EXISTS dbo.vw_InstanceHealth_Latest;
GO

CREATE VIEW dbo.vw_InstanceHealth_Latest
AS
WITH LatestScores AS (
    SELECT 
        InstanceName,
        HealthScore,
        HealthStatus,
        -- Breakdown detallado
        ConnectivityScore,
        LatencyScore,
        BlockingScore,
        MemoryScore,
        FullBackupScore,
        LogBackupScore,
        AlwaysOnScore,
        DiskSpaceScore,
        IOPSScore,
        QueryPerformanceScore,
        CheckdbScore,
        IndexOptimizeScore,
        ErrorlogScore,
        CollectedAtUtc,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Score
),
LatestCritical AS (
    SELECT 
        InstanceName,
        ConnectSuccess,
        ConnectLatencyMs,
        BlockingCount,
        PageLifeExpectancy,
        AvgReadLatencyMs,
        AvgWriteLatencyMs,
        SlowQueriesCount,
        DiskWorstFreePct,
        AlwaysOnEnabled,
        AlwaysOnWorstState,
        CollectedAtUtc,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Critical
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
        Severity20PlusCount,
        CollectedAtUtc,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Maintenance
)
SELECT 
    s.InstanceName,
    s.HealthScore,
    s.HealthStatus,
    s.CollectedAtUtc AS ScoreCollectedAt,
    
    -- Breakdown detallado (v2.0)
    s.ConnectivityScore,
    s.LatencyScore,
    s.BlockingScore,
    s.MemoryScore,
    s.FullBackupScore,
    s.LogBackupScore,
    s.AlwaysOnScore,
    s.DiskSpaceScore,
    s.IOPSScore,
    s.QueryPerformanceScore,
    s.CheckdbScore,
    s.IndexOptimizeScore,
    s.ErrorlogScore,
    
    -- Métricas raw de Critical
    c.ConnectSuccess,
    c.ConnectLatencyMs,
    c.BlockingCount,
    c.PageLifeExpectancy,
    c.AvgReadLatencyMs,
    c.AvgWriteLatencyMs,
    c.SlowQueriesCount,
    c.DiskWorstFreePct AS WorstFreePct,
    c.AlwaysOnEnabled,
    c.AlwaysOnWorstState,
    c.CollectedAtUtc AS CriticalCollectedAt,
    
    -- Métricas de Backups
    b.LastFullBackup,
    b.LastLogBackup,
    b.FullBackupBreached,
    b.LogBackupBreached,
    b.CollectedAtUtc AS BackupCollectedAt,
    
    -- Métricas de Maintenance
    m.LastCheckdb,
    m.CheckdbOk,
    m.LastIndexOptimize,
    m.IndexOptimizeOk,
    m.AvgIndexFragmentation,
    m.Severity20PlusCount,
    m.CollectedAtUtc AS MaintenanceCollectedAt
FROM LatestScores s
LEFT JOIN LatestCritical c ON s.InstanceName = c.InstanceName AND c.rn = 1
LEFT JOIN LatestBackups b ON s.InstanceName = b.InstanceName AND b.rn = 1
LEFT JOIN LatestMaintenance m ON s.InstanceName = m.InstanceName AND m.rn = 1
WHERE s.rn = 1;
GO

PRINT 'Vista vw_InstanceHealth_Latest actualizada para v2.0';
GO

-- =============================================
-- PASO 5: Crear stored procedure para resumen v2.0
-- =============================================

CREATE OR ALTER PROCEDURE dbo.usp_GetHealthScoreSummary_v2
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        COUNT(*) AS TotalInstances,
        SUM(CASE WHEN HealthScore >= 135 THEN 1 ELSE 0 END) AS HealthyCount,      -- 90% de 150
        SUM(CASE WHEN HealthScore >= 105 AND HealthScore < 135 THEN 1 ELSE 0 END) AS WarningCount, -- 70-89% de 150
        SUM(CASE WHEN HealthScore < 105 THEN 1 ELSE 0 END) AS CriticalCount,      -- <70% de 150
        AVG(HealthScore) AS AvgScore,
        MAX(ScoreCollectedAt) AS LastUpdate,
        
        -- Promedios de cada tier
        AVG(ConnectivityScore + LatencyScore + BlockingScore + MemoryScore) AS AvgTier1_Availability,
        AVG(FullBackupScore + LogBackupScore + AlwaysOnScore) AS AvgTier2_Continuity,
        AVG(DiskSpaceScore + IOPSScore + QueryPerformanceScore) AS AvgTier3_Resources,
        AVG(CheckdbScore + IndexOptimizeScore + ErrorlogScore) AS AvgTier4_Maintenance
    FROM dbo.vw_InstanceHealth_Latest;
END
GO

PRINT 'Stored procedure usp_GetHealthScoreSummary_v2 creado';
GO

-- =============================================
-- PASO 6: Verificación
-- =============================================

PRINT '';
PRINT '=============================================';
PRINT 'VERIFICACIÓN:';
PRINT '=============================================';

-- Verificar columnas en Critical
SELECT 
    'InstanceHealth_Critical' AS TableName,
    COUNT(*) AS TotalColumns,
    SUM(CASE WHEN name IN ('BlockingCount', 'PageLifeExpectancy', 'AvgReadLatencyMs') THEN 1 ELSE 0 END) AS NewColumnsCount
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical')
GROUP BY object_id;

-- Verificar columnas en Score
SELECT 
    'InstanceHealth_Score' AS TableName,
    COUNT(*) AS TotalColumns,
    SUM(CASE WHEN name IN ('ConnectivityScore', 'LatencyScore', 'BlockingScore') THEN 1 ELSE 0 END) AS NewColumnsCount
FROM sys.columns
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score')
GROUP BY object_id;

-- Verificar vista
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
    PRINT '✅ Vista vw_InstanceHealth_Latest existe';
ELSE
    PRINT '❌ Vista vw_InstanceHealth_Latest NO existe';

-- Verificar SP
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'usp_GetHealthScoreSummary_v2')
    PRINT '✅ SP usp_GetHealthScoreSummary_v2 existe';
ELSE
    PRINT '❌ SP usp_GetHealthScoreSummary_v2 NO existe';

PRINT '';
PRINT 'Actualización a Health Score v2.0 completada!';
PRINT 'Siguiente paso: Actualizar scripts de PowerShell para recolectar nuevas métricas';
GO

