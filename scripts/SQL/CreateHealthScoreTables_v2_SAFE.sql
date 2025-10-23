-- =============================================
-- Health Score v2.0 - Creación SEGURA de Schema
-- =============================================
-- Este script crea las tablas v2.0 desde cero
-- Es SEGURO ejecutarlo múltiples veces
-- =============================================

USE SQLNova;
GO

PRINT '╔═══════════════════════════════════════════════╗';
PRINT '║  Health Score v2.0 - Setup                    ║';
PRINT '║  Creando schema completo (150 puntos)         ║';
PRINT '╚═══════════════════════════════════════════════╝';
PRINT '';

-- =============================================
-- TABLA 1: Disponibilidad Crítica
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Availability')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Critical_Availability (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Conectividad (20 pts)
        ConnectSuccess BIT NOT NULL,
        ConnectLatencyMs INT NULL,
        
        -- Blocking (10 pts)
        BlockingCount INT NULL,
        MaxBlockTimeSeconds INT NULL,
        BlockedSessionIds NVARCHAR(MAX) NULL,
        
        -- Memory (10 pts)
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
    PRINT '⚠️  Tabla InstanceHealth_Critical_Availability ya existe';
GO

-- =============================================
-- TABLA 2: Recursos Críticos
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Resources')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Critical_Resources (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Discos (15 pts)
        DiskWorstFreePct INT NULL,
        DiskDetails NVARCHAR(MAX) NULL,
        
        -- IOPS (15 pts)
        AvgReadLatencyMs DECIMAL(10,2) NULL,
        AvgWriteLatencyMs DECIMAL(10,2) NULL,
        MaxReadLatencyMs DECIMAL(10,2) NULL,
        MaxWriteLatencyMs DECIMAL(10,2) NULL,
        TotalIOPS DECIMAL(12,2) NULL,
        WorstDatabaseLatency NVARCHAR(255) NULL,
        
        -- Query Performance (10 pts)
        SlowQueriesCount INT NULL,
        LongRunningQueriesCount INT NULL,
        TopSlowQueries NVARCHAR(MAX) NULL,
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Critical_Resources creada';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Critical_Resources ya existe';
GO

-- =============================================
-- TABLA 3: Backups
-- =============================================

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
    PRINT '⚠️  Tabla InstanceHealth_Backups ya existe';
GO

-- =============================================
-- TABLA 4: Mantenimiento
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
    PRINT '⚠️  Tabla InstanceHealth_Maintenance ya existe';
GO

-- =============================================
-- TABLA 5: Score Final
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Score (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Score Total (150 pts)
        HealthScore INT NOT NULL,
        HealthStatus NVARCHAR(20) NOT NULL,
        
        -- TIER 1: Disponibilidad (50 pts)
        Tier1_Availability INT NULL,
        ConnectivityScore INT NULL,
        LatencyScore INT NULL,
        BlockingScore INT NULL,
        MemoryScore INT NULL,
        
        -- TIER 2: Continuidad (40 pts)
        Tier2_Continuity INT NULL,
        FullBackupScore INT NULL,
        LogBackupScore INT NULL,
        AlwaysOnScore INT NULL,
        
        -- TIER 3: Recursos (40 pts)
        Tier3_Resources INT NULL,
        DiskSpaceScore INT NULL,
        IOPSScore INT NULL,
        QueryPerformanceScore INT NULL,
        
        -- TIER 4: Mantenimiento (20 pts)
        Tier4_Maintenance INT NULL,
        CheckdbScore INT NULL,
        IndexOptimizeScore INT NULL,
        ErrorlogScore INT NULL,
        
        INDEX IX_Instance_Time (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Status (HealthStatus, HealthScore DESC)
    );
    
    PRINT '✅ Tabla InstanceHealth_Score creada';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Score ya existe';
GO

-- =============================================
-- VISTA CONSOLIDADA
-- =============================================

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
BEGIN
    DROP VIEW dbo.vw_InstanceHealth_Latest;
    PRINT '⚠️  Vista anterior eliminada, recreando...';
END
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
    s.HealthScore,
    s.HealthStatus,
    s.CollectedAtUtc AS ScoreCollectedAt,
    s.Tier1_Availability,
    s.Tier2_Continuity,
    s.Tier3_Resources,
    s.Tier4_Maintenance,
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

PRINT '✅ Vista vw_InstanceHealth_Latest creada';
GO

-- =============================================
-- STORED PROCEDURES
-- =============================================

CREATE OR ALTER PROCEDURE dbo.usp_GetHealthScoreSummary_v2
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        COUNT(*) AS TotalInstances,
        SUM(CASE WHEN HealthScore >= 135 THEN 1 ELSE 0 END) AS HealthyCount,
        SUM(CASE WHEN HealthScore >= 105 AND HealthScore < 135 THEN 1 ELSE 0 END) AS WarningCount,
        SUM(CASE WHEN HealthScore < 105 THEN 1 ELSE 0 END) AS CriticalCount,
        AVG(CAST(HealthScore AS DECIMAL(5,1))) AS AvgScore,
        MAX(ScoreCollectedAt) AS LastUpdate,
        AVG(CAST(Tier1_Availability AS DECIMAL(5,1))) AS AvgTier1,
        AVG(CAST(Tier2_Continuity AS DECIMAL(5,1))) AS AvgTier2,
        AVG(CAST(Tier3_Resources AS DECIMAL(5,1))) AS AvgTier3,
        AVG(CAST(Tier4_Maintenance AS DECIMAL(5,1))) AS AvgTier4
    FROM dbo.vw_InstanceHealth_Latest;
END
GO

PRINT '✅ SP usp_GetHealthScoreSummary_v2 creado';
GO

CREATE OR ALTER PROCEDURE dbo.usp_CleanupHealthHistory_v2
    @RetainDaysAvailability INT = 30,
    @RetainDaysResources INT = 60,
    @RetainDaysBackups INT = 180,
    @RetainDaysMaintenance INT = 365,
    @RetainDaysScore INT = 90
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @DeletedRows INT = 0;
    
    DELETE FROM dbo.InstanceHealth_Critical_Availability
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysAvailability, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    DELETE FROM dbo.InstanceHealth_Critical_Resources
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysResources, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    DELETE FROM dbo.InstanceHealth_Backups
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysBackups, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    DELETE FROM dbo.InstanceHealth_Maintenance
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysMaintenance, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    DELETE FROM dbo.InstanceHealth_Score
    WHERE CollectedAtUtc < DATEADD(DAY, -@RetainDaysScore, GETUTCDATE());
    SET @DeletedRows = @DeletedRows + @@ROWCOUNT;
    
    SELECT @DeletedRows AS TotalRowsDeleted;
END
GO

PRINT '✅ SP usp_CleanupHealthHistory_v2 creado';
GO

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

PRINT '';
PRINT '╔═══════════════════════════════════════════════╗';
PRINT '║  VERIFICACIÓN FINAL                           ║';
PRINT '╚═══════════════════════════════════════════════╝';
PRINT '';

SELECT 'InstanceHealth_Critical_Availability' AS TableName, COUNT(*) AS RowCount 
FROM dbo.InstanceHealth_Critical_Availability
UNION ALL
SELECT 'InstanceHealth_Critical_Resources', COUNT(*) 
FROM dbo.InstanceHealth_Critical_Resources
UNION ALL
SELECT 'InstanceHealth_Backups', COUNT(*) 
FROM dbo.InstanceHealth_Backups
UNION ALL
SELECT 'InstanceHealth_Maintenance', COUNT(*) 
FROM dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 'InstanceHealth_Score', COUNT(*) 
FROM dbo.InstanceHealth_Score;

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
    PRINT '✅ Vista vw_InstanceHealth_Latest existe';
ELSE
    PRINT '❌ Vista vw_InstanceHealth_Latest NO existe';

IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'usp_GetHealthScoreSummary_v2')
    PRINT '✅ SP usp_GetHealthScoreSummary_v2 existe';
ELSE
    PRINT '❌ SP usp_GetHealthScoreSummary_v2 NO existe';

IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'usp_CleanupHealthHistory_v2')
    PRINT '✅ SP usp_CleanupHealthHistory_v2 existe';
ELSE
    PRINT '❌ SP usp_CleanupHealthHistory_v2 NO existe';

PRINT '';
PRINT '╔═══════════════════════════════════════════════╗';
PRINT '║  ✅ HEALTH SCORE v2.0 INSTALADO               ║';
PRINT '╚═══════════════════════════════════════════════╝';
PRINT '';
PRINT '📊 Escala: 150 puntos';
PRINT '   Healthy:  ≥135 (90%)';
PRINT '   Warning:  105-134 (70-89%)';
PRINT '   Critical: <105 (<70%)';
PRINT '';
PRINT '🚀 Próximo paso:';
PRINT '   Ejecutar scripts de PowerShell para empezar a recolectar datos';
PRINT '';

