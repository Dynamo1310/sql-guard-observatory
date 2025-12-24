-- =============================================
-- Script: CreateHealthScoreMetricsTables.sql
-- Descripción: Crea las tablas de métricas de HealthScore v3.0
--              para almacenar en SQLGuardObservatoryAuth
-- Base de datos: SQLGuardObservatoryAuth
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

-- =============================================
-- 1. InstanceHealth_Score (Consolidado)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Score](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [FinalScore] [int] NOT NULL,
        
        -- Scores por categoría (12 categorías)
        [BackupsScore] [int] NULL,
        [MaintenanceScore] [int] NULL,
        [AlwaysOnScore] [int] NULL,
        [LogChainScore] [int] NULL,
        [DatabaseStatesScore] [int] NULL,
        [ErroresCriticosScore] [int] NULL,
        [CPUScore] [int] NULL,
        [MemoriaScore] [int] NULL,
        [IOScore] [int] NULL,
        [DiscosScore] [int] NULL,
        [ConfigTempdbScore] [int] NULL,
        [AutogrowthScore] [int] NULL,
        
        -- Penalties aplicadas
        [BackupsPenalty] [int] NULL DEFAULT 0,
        [MaintenancePenalty] [int] NULL DEFAULT 0,
        [AlwaysOnPenalty] [int] NULL DEFAULT 0,
        [LogChainPenalty] [int] NULL DEFAULT 0,
        [DatabaseStatesPenalty] [int] NULL DEFAULT 0,
        [ErroresCriticosPenalty] [int] NULL DEFAULT 0,
        [CPUPenalty] [int] NULL DEFAULT 0,
        [MemoriaPenalty] [int] NULL DEFAULT 0,
        [IOPenalty] [int] NULL DEFAULT 0,
        [DiscosPenalty] [int] NULL DEFAULT 0,
        [ConfigTempdbPenalty] [int] NULL DEFAULT 0,
        [AutogrowthPenalty] [int] NULL DEFAULT 0,
        
        CONSTRAINT [PK_InstanceHealth_Score] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Score_Instance_Date] 
    ON [dbo].[InstanceHealth_Score]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Score creada exitosamente';
END
GO

-- =============================================
-- 2. InstanceHealth_Backups
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Backups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Backups](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalDatabases] [int] NULL,
        [FullBackupBreaches] [int] NULL,
        [LogBackupBreaches] [int] NULL,
        [DatabasesWithoutFullBackup] [nvarchar](MAX) NULL,
        [DatabasesWithoutLogBackup] [nvarchar](MAX) NULL,
        [OldestFullBackupHours] [decimal](18,2) NULL,
        [OldestLogBackupMinutes] [decimal](18,2) NULL,
        
        CONSTRAINT [PK_InstanceHealth_Backups] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Backups_Instance_Date] 
    ON [dbo].[InstanceHealth_Backups]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Backups creada exitosamente';
END
GO

-- =============================================
-- 3. InstanceHealth_Maintenance
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Maintenance](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalIndexes] [int] NULL,
        [FragmentedIndexes] [int] NULL,
        [AvgFragmentation] [decimal](18,2) NULL,
        [MaxFragmentation] [decimal](18,2) NULL,
        [TablesWithoutStats] [int] NULL,
        [OutdatedStats] [int] NULL,
        
        CONSTRAINT [PK_InstanceHealth_Maintenance] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Maintenance_Instance_Date] 
    ON [dbo].[InstanceHealth_Maintenance]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Maintenance creada exitosamente';
END
GO

-- =============================================
-- 4. InstanceHealth_AlwaysOn
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_AlwaysOn]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_AlwaysOn](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [IsAlwaysOnEnabled] [bit] NULL,
        [TotalReplicas] [int] NULL,
        [HealthyReplicas] [int] NULL,
        [UnhealthyReplicas] [int] NULL,
        [NotSynchronizingDatabases] [int] NULL,
        [MaxRedoQueueSizeKB] [bigint] NULL,
        [MaxSendQueueSizeKB] [bigint] NULL,
        [ReplicaDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_AlwaysOn] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_AlwaysOn_Instance_Date] 
    ON [dbo].[InstanceHealth_AlwaysOn]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_AlwaysOn creada exitosamente';
END
GO

-- =============================================
-- 5. InstanceHealth_LogChain
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_LogChain]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_LogChain](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalDatabases] [int] NULL,
        [BrokenLogChains] [int] NULL,
        [DatabasesWithBrokenChain] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_LogChain] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_LogChain_Instance_Date] 
    ON [dbo].[InstanceHealth_LogChain]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_LogChain creada exitosamente';
END
GO

-- =============================================
-- 6. InstanceHealth_DatabaseStates
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_DatabaseStates]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_DatabaseStates](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalDatabases] [int] NULL,
        [OnlineDatabases] [int] NULL,
        [SuspectDatabases] [int] NULL,
        [RecoveringDatabases] [int] NULL,
        [OfflineDatabases] [int] NULL,
        [EmergencyDatabases] [int] NULL,
        [ProblematicDatabases] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_DatabaseStates] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_DatabaseStates_Instance_Date] 
    ON [dbo].[InstanceHealth_DatabaseStates]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_DatabaseStates creada exitosamente';
END
GO

-- =============================================
-- 7. InstanceHealth_ErroresCriticos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ErroresCriticos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ErroresCriticos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalCriticalErrors] [int] NULL,
        [Error823Count] [int] NULL,
        [Error824Count] [int] NULL,
        [Error825Count] [int] NULL,
        [CorruptionErrors] [int] NULL,
        [OOMErrors] [int] NULL,
        [ErrorDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_ErroresCriticos] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_ErroresCriticos_Instance_Date] 
    ON [dbo].[InstanceHealth_ErroresCriticos]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_ErroresCriticos creada exitosamente';
END
GO

-- =============================================
-- 8. InstanceHealth_CPU
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_CPU]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_CPU](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [SQLProcessUtilization] [decimal](18,2) NULL,
        [SystemIdlePercent] [decimal](18,2) NULL,
        [OtherProcessUtilization] [decimal](18,2) NULL,
        [RunnableTasks] [int] NULL,
        [AvgCPUPercentLast10Min] [decimal](18,2) NULL,
        [P95CPUPercent] [decimal](18,2) NULL,
        [SignalWaitsPercent] [decimal](18,2) NULL,
        
        CONSTRAINT [PK_InstanceHealth_CPU] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_CPU_Instance_Date] 
    ON [dbo].[InstanceHealth_CPU]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_CPU creada exitosamente';
END
GO

-- =============================================
-- 9. InstanceHealth_Memoria
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Memoria]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Memoria](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [PageLifeExpectancy] [int] NULL,
        [BufferCacheHitRatio] [decimal](18,2) NULL,
        [TotalServerMemoryMB] [bigint] NULL,
        [TargetServerMemoryMB] [bigint] NULL,
        [MemoryGrantsPending] [int] NULL,
        [StolenServerMemoryMB] [bigint] NULL,
        [MemoryPressure] [bit] NULL,
        
        CONSTRAINT [PK_InstanceHealth_Memoria] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Memoria_Instance_Date] 
    ON [dbo].[InstanceHealth_Memoria]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Memoria creada exitosamente';
END
GO

-- =============================================
-- 10. InstanceHealth_IO
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_IO]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_IO](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [AvgReadLatencyMs] [decimal](18,2) NULL,
        [AvgWriteLatencyMs] [decimal](18,2) NULL,
        [MaxReadLatencyMs] [decimal](18,2) NULL,
        [MaxWriteLatencyMs] [decimal](18,2) NULL,
        [TotalIOPS] [bigint] NULL,
        [PendingDiskIOCount] [int] NULL,
        [IOStallPercent] [decimal](18,2) NULL,
        [WorstPerformingFile] [nvarchar](512) NULL,
        
        CONSTRAINT [PK_InstanceHealth_IO] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_IO_Instance_Date] 
    ON [dbo].[InstanceHealth_IO]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_IO creada exitosamente';
END
GO

-- =============================================
-- 11. InstanceHealth_Discos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Discos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Discos](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalDisks] [int] NULL,
        [CriticalDisks] [int] NULL,
        [WarningDisks] [int] NULL,
        [MinFreeSpacePercent] [decimal](18,2) NULL,
        [MinFreeSpaceGB] [decimal](18,2) NULL,
        [DiskDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_Discos] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Discos_Instance_Date] 
    ON [dbo].[InstanceHealth_Discos]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Discos creada exitosamente';
END
GO

-- =============================================
-- 12. InstanceHealth_ConfiguracionTempdb
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ConfiguracionTempdb](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [DataFilesCount] [int] NULL,
        [RecommendedDataFiles] [int] NULL,
        [FilesEqualSize] [bit] NULL,
        [FilesEqualGrowth] [bit] NULL,
        [TempdbOnSeparateDisk] [bit] NULL,
        [TotalTempdbSizeMB] [bigint] NULL,
        [FileDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_ConfiguracionTempdb] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_ConfiguracionTempdb_Instance_Date] 
    ON [dbo].[InstanceHealth_ConfiguracionTempdb]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_ConfiguracionTempdb creada exitosamente';
END
GO

-- =============================================
-- 13. InstanceHealth_Autogrowth
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Autogrowth]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Autogrowth](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TotalFiles] [int] NULL,
        [FilesWithBadGrowth] [int] NULL,
        [FilesWithPercentGrowth] [int] NULL,
        [FilesWithSmallGrowth] [int] NULL,
        [FileDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_Autogrowth] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Autogrowth_Instance_Date] 
    ON [dbo].[InstanceHealth_Autogrowth]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Autogrowth creada exitosamente';
END
GO

-- =============================================
-- 14. InstanceHealth_Waits (Wait Statistics)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Waits]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Waits](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](256) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Score] [int] NOT NULL,
        [TopWaitType] [nvarchar](128) NULL,
        [TopWaitTimeMs] [bigint] NULL,
        [TopWaitPercent] [decimal](18,2) NULL,
        [TotalWaitTimeMs] [bigint] NULL,
        [SignalWaitPercent] [decimal](18,2) NULL,
        [ResourceWaitPercent] [decimal](18,2) NULL,
        [BlockedProcesses] [int] NULL,
        [MaxBlockingDurationSeconds] [int] NULL,
        [WaitDetails] [nvarchar](MAX) NULL,
        
        CONSTRAINT [PK_InstanceHealth_Waits] PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Waits_Instance_Date] 
    ON [dbo].[InstanceHealth_Waits]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Waits creada exitosamente';
END
GO

-- =============================================
-- Vista: vw_InstanceHealth_Latest
-- Devuelve la última recolección de cada métrica por instancia
-- =============================================
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_InstanceHealth_Latest]'))
    DROP VIEW [dbo].[vw_InstanceHealth_Latest];
GO

CREATE VIEW [dbo].[vw_InstanceHealth_Latest]
AS
WITH LatestScore AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_Score
    GROUP BY InstanceName
)
SELECT 
    s.Id,
    s.InstanceName,
    s.CollectedAtUtc,
    s.FinalScore,
    s.BackupsScore,
    s.MaintenanceScore,
    s.AlwaysOnScore,
    s.LogChainScore,
    s.DatabaseStatesScore,
    s.ErroresCriticosScore,
    s.CPUScore,
    s.MemoriaScore,
    s.IOScore,
    s.DiscosScore,
    s.ConfigTempdbScore,
    s.AutogrowthScore,
    s.BackupsPenalty,
    s.MaintenancePenalty,
    s.AlwaysOnPenalty,
    s.LogChainPenalty,
    s.DatabaseStatesPenalty,
    s.ErroresCriticosPenalty,
    s.CPUPenalty,
    s.MemoriaPenalty,
    s.IOPenalty,
    s.DiscosPenalty,
    s.ConfigTempdbPenalty,
    s.AutogrowthPenalty
FROM InstanceHealth_Score s
INNER JOIN LatestScore ls ON s.InstanceName = ls.InstanceName AND s.CollectedAtUtc = ls.LatestDate;
GO

PRINT 'Vista vw_InstanceHealth_Latest creada exitosamente';
GO

-- =============================================
-- Procedimiento de limpieza de datos antiguos
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sp_CleanupHealthScoreHistory]') AND type in (N'P'))
    DROP PROCEDURE [dbo].[sp_CleanupHealthScoreHistory];
GO

CREATE PROCEDURE [dbo].[sp_CleanupHealthScoreHistory]
    @RetentionDays INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @CutoffDate DATETIME2 = DATEADD(DAY, -@RetentionDays, GETDATE());
    DECLARE @DeletedRows INT = 0;
    DECLARE @TotalDeleted INT = 0;
    
    -- Eliminar de cada tabla
    DELETE FROM InstanceHealth_Score WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Score: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Backups WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Backups: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Maintenance WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Maintenance: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_AlwaysOn WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_AlwaysOn: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_LogChain WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_LogChain: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_DatabaseStates WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_DatabaseStates: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_ErroresCriticos WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_ErroresCriticos: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_CPU WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_CPU: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Memoria WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Memoria: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_IO WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_IO: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Discos WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Discos: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_ConfiguracionTempdb WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_ConfiguracionTempdb: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Autogrowth WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Autogrowth: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    DELETE FROM InstanceHealth_Waits WHERE CollectedAtUtc < @CutoffDate;
    SET @DeletedRows = @@ROWCOUNT; SET @TotalDeleted += @DeletedRows;
    IF @DeletedRows > 0 PRINT 'InstanceHealth_Waits: ' + CAST(@DeletedRows AS VARCHAR) + ' filas eliminadas';
    
    PRINT 'Total de filas eliminadas: ' + CAST(@TotalDeleted AS VARCHAR);
END
GO

PRINT 'Procedimiento sp_CleanupHealthScoreHistory creado exitosamente';
GO

PRINT '============================================='
PRINT 'Script completado exitosamente'
PRINT '============================================='
GO

