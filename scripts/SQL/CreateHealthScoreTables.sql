-- =============================================
-- Schema de Health Score - Arquitectura Optimizada
-- =============================================

USE SQLNova;
GO

-- =============================================
-- TABLA 1: MÉTRICAS CRÍTICAS (cada 5 min)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Critical (
        CriticalID BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        Ambiente NVARCHAR(50),
        HostingSite NVARCHAR(50),
        Version NVARCHAR(100),
        
        -- Conectividad
        ConnectSuccess BIT NOT NULL,
        ConnectLatencyMs INT NOT NULL,
        
        -- Discos
        DiskWorstFreePct DECIMAL(5,2),
        DiskVolumesJson NVARCHAR(MAX), -- Array de volúmenes
        
        -- AlwaysOn
        AlwaysOnEnabled BIT,
        AlwaysOnWorstState NVARCHAR(50),
        AlwaysOnIssuesJson NVARCHAR(MAX),
        
        -- Timestamp
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        ErrorMessage NVARCHAR(MAX),
        
        -- Índices
        INDEX IX_Instance_Time NONCLUSTERED (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Time CLUSTERED (CollectedAtUtc DESC)
    );
    
    PRINT 'Tabla InstanceHealth_Critical creada';
END
GO

-- =============================================
-- TABLA 2: BACKUPS (cada 30 min)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Backups')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Backups (
        BackupHealthID BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        Ambiente NVARCHAR(50),
        HostingSite NVARCHAR(50),
        
        -- Conectividad
        ConnectSuccess BIT NOT NULL,
        
        -- Backups
        LastFullBackup DATETIME2,
        LastDiffBackup DATETIME2,
        LastLogBackup DATETIME2,
        
        -- Breaches
        FullBackupBreached BIT,
        DiffBackupBreached BIT,
        LogBackupBreached BIT,
        BreachDetails NVARCHAR(500),
        
        -- Timestamp
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        ErrorMessage NVARCHAR(MAX),
        
        -- Índices
        INDEX IX_Instance_Time NONCLUSTERED (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Time CLUSTERED (CollectedAtUtc DESC)
    );
    
    PRINT 'Tabla InstanceHealth_Backups creada';
END
GO

-- =============================================
-- TABLA 3: MAINTENANCE (cada 4 horas)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Maintenance')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Maintenance (
        MaintenanceHealthID BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        Ambiente NVARCHAR(50),
        HostingSite NVARCHAR(50),
        
        -- Conectividad
        ConnectSuccess BIT NOT NULL,
        
        -- IntegrityCheck
        LastCheckdb DATETIME2,
        CheckdbOk BIT,
        CheckdbJobsJson NVARCHAR(MAX),
        
        -- IndexOptimize
        LastIndexOptimize DATETIME2,
        IndexOptimizeOk BIT,
        IndexOptimizeJobsJson NVARCHAR(MAX),
        
        -- Errorlog
        Severity20PlusCount INT,
        ErrorlogSkipped BIT,
        
        -- Timestamp
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        ErrorMessage NVARCHAR(MAX),
        
        -- Índices
        INDEX IX_Instance_Time NONCLUSTERED (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Time CLUSTERED (CollectedAtUtc DESC)
    );
    
    PRINT 'Tabla InstanceHealth_Maintenance creada';
END
GO

-- =============================================
-- TABLA 4: HEALTH SCORE CONSOLIDADO (cada 15 min)
-- Combina todas las métricas para calcular score final
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Score (
        ScoreID BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        Ambiente NVARCHAR(50),
        HostingSite NVARCHAR(50),
        Version NVARCHAR(100),
        
        -- Score
        HealthScore INT NOT NULL,
        HealthStatus NVARCHAR(20) NOT NULL, -- Healthy, Warning, Critical
        
        -- Breakdown (para debug)
        AvailabilityScore INT,
        BackupScore INT,
        DiskScore INT,
        AlwaysOnScore INT,
        ErrorlogScore INT,
        
        -- Timestamp
        CollectedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Índices
        INDEX IX_Instance_Time NONCLUSTERED (InstanceName, CollectedAtUtc DESC),
        INDEX IX_Time CLUSTERED (CollectedAtUtc DESC),
        INDEX IX_Status NONCLUSTERED (HealthStatus, CollectedAtUtc DESC)
    );
    
    PRINT 'Tabla InstanceHealth_Score creada';
END
GO

-- =============================================
-- VISTA: Último estado de cada instancia
-- =============================================
CREATE OR ALTER VIEW dbo.vw_InstanceHealth_Latest
AS
WITH LatestScores AS (
    SELECT 
        InstanceName,
        HealthScore,
        HealthStatus,
        CollectedAtUtc,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Score
),
LatestCritical AS (
    SELECT 
        InstanceName,
        ConnectSuccess,
        ConnectLatencyMs,
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
    
    c.ConnectSuccess,
    c.ConnectLatencyMs,
    c.DiskWorstFreePct AS WorstFreePct,
    c.AlwaysOnEnabled,
    c.AlwaysOnWorstState,
    c.CollectedAtUtc AS CriticalCollectedAt,
    
    b.LastFullBackup,
    b.LastLogBackup,
    b.FullBackupBreached,
    b.LogBackupBreached,
    b.CollectedAtUtc AS BackupCollectedAt,
    
    m.LastCheckdb,
    m.CheckdbOk,
    m.LastIndexOptimize,
    m.IndexOptimizeOk,
    m.Severity20PlusCount,
    m.CollectedAtUtc AS MaintenanceCollectedAt
FROM LatestScores s
LEFT JOIN LatestCritical c ON s.InstanceName = c.InstanceName AND c.rn = 1
LEFT JOIN LatestBackups b ON s.InstanceName = b.InstanceName AND b.rn = 1
LEFT JOIN LatestMaintenance m ON s.InstanceName = m.InstanceName AND m.rn = 1
WHERE s.rn = 1;
GO

-- =============================================
-- STORED PROCEDURE: Cleanup de datos antiguos
-- =============================================
CREATE OR ALTER PROCEDURE dbo.usp_CleanupHealthHistory
    @RetentionDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @CutoffDate DATETIME2 = DATEADD(DAY, -@RetentionDays, GETUTCDATE());
    DECLARE @RowsDeleted INT = 0;
    
    -- Limpiar Critical (mantener 7 días - mucho volumen)
    DELETE FROM dbo.InstanceHealth_Critical
    WHERE CollectedAtUtc < DATEADD(DAY, -7, GETUTCDATE());
    SET @RowsDeleted = @@ROWCOUNT;
    PRINT 'Critical: ' + CAST(@RowsDeleted AS VARCHAR) + ' registros eliminados';
    
    -- Limpiar Backups (mantener parámetro de días)
    DELETE FROM dbo.InstanceHealth_Backups
    WHERE CollectedAtUtc < @CutoffDate;
    SET @RowsDeleted = @@ROWCOUNT;
    PRINT 'Backups: ' + CAST(@RowsDeleted AS VARCHAR) + ' registros eliminados';
    
    -- Limpiar Maintenance (mantener parámetro de días)
    DELETE FROM dbo.InstanceHealth_Maintenance
    WHERE CollectedAtUtc < @CutoffDate;
    SET @RowsDeleted = @@ROWCOUNT;
    PRINT 'Maintenance: ' + CAST(@RowsDeleted AS VARCHAR) + ' registros eliminados';
    
    -- Limpiar Score (mantener parámetro de días)
    DELETE FROM dbo.InstanceHealth_Score
    WHERE CollectedAtUtc < @CutoffDate;
    SET @RowsDeleted = @@ROWCOUNT;
    PRINT 'Score: ' + CAST(@RowsDeleted AS VARCHAR) + ' registros eliminados';
    
    PRINT 'Cleanup completado';
END
GO

PRINT 'Schema de Health Score creado exitosamente';

