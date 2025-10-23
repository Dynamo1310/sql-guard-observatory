-- =============================================
-- Health Score v2.0 - Schema Completo (150 puntos)
-- =============================================
-- Arquitectura: 5 tablas especializadas
-- =============================================

USE SQLNova;
GO

PRINT 'Creando schema para Health Score v2.0 (150 puntos)...';
GO

-- =============================================
-- TABLA 1: Disponibilidad Crítica (cada 1-2 minutos)
-- =============================================
-- Métricas que cambian rápidamente y son críticas

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Availability')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Critical_Availability (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Conectividad (20 pts)
        ConnectSuccess BIT NOT NULL,
        ConnectLatencyMs INT NULL,
        
        -- Blocking (10 pts) - NUEVO v2.0
        BlockingCount INT NULL,
        MaxBlockTimeSeconds INT NULL,
        BlockedSessionIds NVARCHAR(MAX) NULL, -- JSON array
        
        -- Memory Pressure (10 pts) - NUEVO v2.0
        PageLifeExpectancy INT NULL,
        BufferCacheHitRatio DECIMAL(5,2) NULL,
        
        -- AlwaysOn (10 pts)
        AlwaysOnEnabled BIT NOT NULL DEFAULT 0,
        AlwaysOnWorstState NVARCHAR(50) NULL,
        AlwaysOnDetails NVARCHAR(MAX) NULL,
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Critical_Availability creada';
END
ELSE
    PRINT '⚠️ Tabla InstanceHealth_Critical_Availability ya existe';
GO

-- =============================================
-- TABLA 2: Recursos Críticos (cada 5 minutos)
-- =============================================
-- Métricas de recursos que no cambian tan rápido

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Resources')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Critical_Resources (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Discos (15 pts)
        DiskWorstFreePct INT NULL,
        DiskDetails NVARCHAR(MAX) NULL, -- JSON
        
        -- IOPS / Latencia (15 pts) - NUEVO v2.0
        AvgReadLatencyMs DECIMAL(10,2) NULL,
        AvgWriteLatencyMs DECIMAL(10,2) NULL,
        MaxReadLatencyMs DECIMAL(10,2) NULL,
        MaxWriteLatencyMs DECIMAL(10,2) NULL,
        TotalIOPS DECIMAL(12,2) NULL,
        WorstDatabaseLatency NVARCHAR(255) NULL,
        
        -- Query Performance (10 pts) - NUEVO v2.0
        SlowQueriesCount INT NULL,
        LongRunningQueriesCount INT NULL,
        TopSlowQueries NVARCHAR(MAX) NULL, -- JSON con top 5
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Critical_Resources creada';
END
ELSE
    PRINT '⚠️ Tabla InstanceHealth_Critical_Resources ya existe';
GO

-- =============================================
-- TABLA 3: Backups (cada 15 minutos)
-- =============================================
-- Ya existe, solo ajustamos si es necesario

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Backups')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Backups (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- FULL Backup (15 pts)
        LastFullBackup DATETIME2 NULL,
        FullBackupBreached BIT NOT NULL DEFAULT 0,
        
        -- LOG Backup (15 pts)
        LastLogBackup DATETIME2 NULL,
        LogBackupBreached BIT NOT NULL DEFAULT 0,
        
        BackupDetails NVARCHAR(MAX) NULL,
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Backups creada';
END
ELSE
    PRINT '⚠️ Tabla InstanceHealth_Backups ya existe';
GO

-- =============================================
-- TABLA 4: Mantenimiento (cada 1 hora)
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Maintenance')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Maintenance (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- CHECKDB (10 pts)
        LastCheckdb DATETIME2 NULL,
        CheckdbOk BIT NOT NULL DEFAULT 0,
        
        -- IndexOptimize (5 pts)
        LastIndexOptimize DATETIME2 NULL,
        IndexOptimizeOk BIT NOT NULL DEFAULT 0,
        
        -- Fragmentación (NUEVO v2.0)
        AvgIndexFragmentation DECIMAL(5,2) NULL,
        HighFragmentationCount INT NULL,
        
        -- Errorlog (5 pts)
        Severity20PlusCount INT NULL,
        ErrorlogDetails NVARCHAR(MAX) NULL,
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Maintenance creada';
END
ELSE
    PRINT '⚠️ Tabla InstanceHealth_Maintenance ya existe';
GO

-- =============================================
-- TABLA 5: Score Final (cada 2 minutos)
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Score (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Score Total (150 pts)
        HealthScore INT NOT NULL,
        HealthStatus NVARCHAR(20) NOT NULL, -- Healthy/Warning/Critical
        
        -- TIER 1: Disponibilidad (50 pts)
        Tier1_Availability INT NULL,
        ConnectivityScore INT NULL,     -- 20 pts
        LatencyScore INT NULL,          -- 10 pts (parte de conectividad)
        BlockingScore INT NULL,         -- 10 pts
        MemoryScore INT NULL,           -- 10 pts (PLE)
        
        -- TIER 2: Continuidad (40 pts)
        Tier2_Continuity INT NULL,
        FullBackupScore INT NULL,       -- 15 pts
        LogBackupScore INT NULL,        -- 15 pts
        AlwaysOnScore INT NULL,         -- 10 pts
        
        -- TIER 3: Recursos (40 pts)
        Tier3_Resources INT NULL,
        DiskSpaceScore INT NULL,        -- 15 pts
        IOPSScore INT NULL,             -- 15 pts (latencia)
        QueryPerformanceScore INT NULL, -- 10 pts
        
        -- TIER 4: Mantenimiento (20 pts)
        Tier4_Maintenance INT NULL,
        CheckdbScore INT NULL,          -- 10 pts
        IndexOptimizeScore INT NULL,    -- 5 pts
        ErrorlogScore INT NULL,         -- 5 pts
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Status (HealthStatus, HealthScore DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Score creada';
END
ELSE
    PRINT '⚠️ Tabla InstanceHealth_Score ya existe';
GO

-- =============================================
-- VISTA CONSOLIDADA: Latest data from all tables
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
        Tier1_Availability,
        Tier2_Continuity,
        Tier3_Resources,
        Tier4_Maintenance,
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
    
    -- Score y Status
    s.HealthScore,
    s.HealthStatus,
    s.CollectedAtUtc AS ScoreCollectedAt,
    
    -- Breakdown por Tiers
    s.Tier1_Availability,
    s.Tier2_Continuity,
    s.Tier3_Resources,
    s.Tier4_Maintenance,
    
    -- Breakdown detallado
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
    
    -- Métricas raw - Availability
    a.ConnectSuccess,
    a.ConnectLatencyMs,
    a.BlockingCount,
    a.MaxBlockTimeSeconds,
    a.PageLifeExpectancy,
    a.BufferCacheHitRatio,
    a.AlwaysOnEnabled,
    a.AlwaysOnWorstState,
    a.CollectedAtUtc AS AvailabilityCollectedAt,
    
    -- Métricas raw - Resources
    r.DiskWorstFreePct,
    r.AvgReadLatencyMs,
    r.AvgWriteLatencyMs,
    r.MaxReadLatencyMs,
    r.TotalIOPS,
    r.SlowQueriesCount,
    r.LongRunningQueriesCount,
    r.CollectedAtUtc AS ResourcesCollectedAt,
    
    -- Métricas raw - Backups
    b.LastFullBackup,
    b.LastLogBackup,
    b.FullBackupBreached,
    b.LogBackupBreached,
    b.CollectedAtUtc AS BackupsCollectedAt,
    
    -- Métricas raw - Maintenance
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

PRINT '✅ Vista vw_InstanceHealth_Latest creada';
GO

-- =============================================
-- STORED PROCEDURES
-- =============================================

-- SP 1: Resumen v2.0
CREATE OR ALTER PROCEDURE dbo.usp_GetHealthScoreSummary_v2
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        COUNT(*) AS TotalInstances,
        SUM(CASE WHEN HealthScore >= 135 THEN 1 ELSE 0 END) AS HealthyCount,      -- 90% de 150
        SUM(CASE WHEN HealthScore >= 105 AND HealthScore < 135 THEN 1 ELSE 0 END) AS WarningCount, -- 70-89%
        SUM(CASE WHEN HealthScore < 105 THEN 1 ELSE 0 END) AS CriticalCount,      -- <70%
        AVG(CAST(HealthScore AS DECIMAL(5,1))) AS AvgScore,
        MAX(ScoreCollectedAt) AS LastUpdate,
        
        -- Promedios por tier
        AVG(CAST(Tier1_Availability AS DECIMAL(5,1))) AS AvgTier1,
        AVG(CAST(Tier2_Continuity AS DECIMAL(5,1))) AS AvgTier2,
        AVG(CAST(Tier3_Resources AS DECIMAL(5,1))) AS AvgTier3,
        AVG(CAST(Tier4_Maintenance AS DECIMAL(5,1))) AS AvgTier4,
        
        -- Problemas comunes
        SUM(CASE WHEN BlockingCount > 0 THEN 1 ELSE 0 END) AS InstancesWithBlocking,
        SUM(CASE WHEN PageLifeExpectancy < 300 THEN 1 ELSE 0 END) AS InstancesWithMemoryPressure,
        SUM(CASE WHEN AvgReadLatencyMs > 20 THEN 1 ELSE 0 END) AS InstancesWithSlowDisks,
        SUM(CASE WHEN FullBackupBreached = 1 OR LogBackupBreached = 1 THEN 1 ELSE 0 END) AS InstancesWithBackupIssues
    FROM dbo.vw_InstanceHealth_Latest;
END
GO

PRINT '✅ SP usp_GetHealthScoreSummary_v2 creado';
GO

-- SP 2: Cleanup con retención diferenciada
CREATE OR ALTER PROCEDURE dbo.usp_CleanupHealthHistory_v2
    @RetainDaysScore INT = 90,
    @RetainDaysAvailability INT = 30,
    @RetainDaysResources INT = 60,
    @RetainDaysBackups INT = 180,
    @RetainDaysMaintenance INT = 365
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @DeletedRows INT = 0;
    
    -- Availability (30 días - datos muy frecuentes)
    DELETE FROM dbo.InstanceHealth_Critical_Availability
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysAvailability, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    -- Resources (60 días)
    DELETE FROM dbo.InstanceHealth_Critical_Resources
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysResources, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    -- Backups (180 días - importante para auditoría)
    DELETE FROM dbo.InstanceHealth_Backups
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysBackups, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    -- Maintenance (365 días - histórico importante)
    DELETE FROM dbo.InstanceHealth_Maintenance
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysMaintenance, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    -- Score (90 días - resumen)
    DELETE FROM dbo.InstanceHealth_Score
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysScore, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    SELECT @DeletedRows AS TotalRowsDeleted;
END
GO

PRINT '✅ SP usp_CleanupHealthHistory_v2 creado';
GO

-- =============================================
-- VERIFICACIÓN
-- =============================================

PRINT '';
PRINT '=============================================';
PRINT 'VERIFICACIÓN FINAL:';
PRINT '=============================================';

SELECT 'InstanceHealth_Critical_Availability' AS TableName, COUNT(*) AS RowCount FROM dbo.InstanceHealth_Critical_Availability
UNION ALL
SELECT 'InstanceHealth_Critical_Resources', COUNT(*) FROM dbo.InstanceHealth_Critical_Resources
UNION ALL
SELECT 'InstanceHealth_Backups', COUNT(*) FROM dbo.InstanceHealth_Backups
UNION ALL
SELECT 'InstanceHealth_Maintenance', COUNT(*) FROM dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 'InstanceHealth_Score', COUNT(*) FROM dbo.InstanceHealth_Score;

PRINT '';
PRINT '✅ Health Score v2.0 Schema completado!';
PRINT '   - 5 tablas especializadas';
PRINT '   - 1 vista consolidada';
PRINT '   - 2 stored procedures';
PRINT '';
PRINT '📊 Escala: 150 puntos';
PRINT '   Healthy:  ≥135 (90%)';
PRINT '   Warning:  105-134 (70-89%)';
PRINT '   Critical: <105 (<70%)';
GO

