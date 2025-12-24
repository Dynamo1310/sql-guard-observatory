-- =============================================
-- Script: CreateHealthScoreMetricsTables.sql
-- Descripción: Crea las tablas de métricas de HealthScore v3.0
--              Migradas desde SQLNova a SQLGuardObservatoryAuth
-- Base de datos: SQLGuardObservatoryAuth
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

-- =============================================
-- DROP TABLES Y VISTAS (para recrear con nuevo esquema)
-- El orden es importante por las dependencias
-- =============================================

-- Primero eliminar la vista
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_InstanceHealth_Latest]'))
BEGIN
    DROP VIEW [dbo].[vw_InstanceHealth_Latest];
    PRINT 'Vista vw_InstanceHealth_Latest eliminada';
END
GO

-- Eliminar stored procedure
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sp_CleanupHealthScoreHistory]') AND type in (N'P'))
BEGIN
    DROP PROCEDURE [dbo].[sp_CleanupHealthScoreHistory];
    PRINT 'SP sp_CleanupHealthScoreHistory eliminado';
END
GO

-- Eliminar tablas de métricas
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Waits]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Waits];
    PRINT 'Tabla InstanceHealth_Waits eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Memoria]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Memoria];
    PRINT 'Tabla InstanceHealth_Memoria eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Maintenance];
    PRINT 'Tabla InstanceHealth_Maintenance eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_LogChain]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_LogChain];
    PRINT 'Tabla InstanceHealth_LogChain eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_IO]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_IO];
    PRINT 'Tabla InstanceHealth_IO eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ErroresCriticos]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_ErroresCriticos];
    PRINT 'Tabla InstanceHealth_ErroresCriticos eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Discos]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Discos];
    PRINT 'Tabla InstanceHealth_Discos eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_DatabaseStates]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_DatabaseStates];
    PRINT 'Tabla InstanceHealth_DatabaseStates eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_CPU]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_CPU];
    PRINT 'Tabla InstanceHealth_CPU eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_ConfiguracionTempdb];
    PRINT 'Tabla InstanceHealth_ConfiguracionTempdb eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Backups]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Backups];
    PRINT 'Tabla InstanceHealth_Backups eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Autogrowth]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Autogrowth];
    PRINT 'Tabla InstanceHealth_Autogrowth eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_AlwaysOn]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_AlwaysOn];
    PRINT 'Tabla InstanceHealth_AlwaysOn eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Score];
    PRINT 'Tabla InstanceHealth_Score eliminada';
END
GO

PRINT '';
PRINT 'Tablas antiguas eliminadas. Creando nuevas...';
PRINT '';
GO

-- =============================================
-- 1. InstanceHealth_Score (Consolidado Principal)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Score](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [HealthScore] [int] NOT NULL,
        [HealthStatus] [nvarchar](50) NOT NULL,
        [AlwaysOnScore] [int] NOT NULL DEFAULT 0,
        [BackupsScore] [int] NOT NULL DEFAULT 0,
        [ErroresCriticosScore] [int] NOT NULL DEFAULT 0,
        [CPUScore] [int] NOT NULL DEFAULT 0,
        [IOScore] [int] NOT NULL DEFAULT 0,
        [DiscosScore] [int] NOT NULL DEFAULT 0,
        [MemoriaScore] [int] NOT NULL DEFAULT 0,
        [ConfiguracionTempdbScore] [int] NOT NULL DEFAULT 0,
        [MantenimientosScore] [int] NOT NULL DEFAULT 0,
        [GlobalCap] [int] NOT NULL DEFAULT 100,
        [BackupsContribution] [int] NOT NULL DEFAULT 0,
        [AlwaysOnContribution] [int] NOT NULL DEFAULT 0,
        [ErroresCriticosContribution] [int] NOT NULL DEFAULT 0,
        [CPUContribution] [int] NOT NULL DEFAULT 0,
        [IOContribution] [int] NOT NULL DEFAULT 0,
        [DiscosContribution] [int] NOT NULL DEFAULT 0,
        [MemoriaContribution] [int] NOT NULL DEFAULT 0,
        [MantenimientosContribution] [int] NOT NULL DEFAULT 0,
        [ConfiguracionTempdbContribution] [int] NOT NULL DEFAULT 0,
        [LogChainScore] [int] NOT NULL DEFAULT 0,
        [DatabaseStatesScore] [int] NOT NULL DEFAULT 0,
        [AutogrowthScore] [int] NOT NULL DEFAULT 0,
        [LogChainContribution] [int] NOT NULL DEFAULT 0,
        [DatabaseStatesContribution] [int] NOT NULL DEFAULT 0,
        [AutogrowthContribution] [int] NOT NULL DEFAULT 0,
        [TempDBIODiagnosis] [nvarchar](200) NULL,
        [TempDBIOSuggestion] [nvarchar](500) NULL,
        [TempDBIOSeverity] [varchar](20) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Score_Instance_Date] 
    ON [dbo].[InstanceHealth_Score]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Score creada exitosamente';
END
GO

-- =============================================
-- 2. InstanceHealth_AlwaysOn
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_AlwaysOn]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_AlwaysOn](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [AlwaysOnEnabled] [bit] NOT NULL,
        [AlwaysOnWorstState] [nvarchar](50) NULL,
        [DatabaseCount] [int] NOT NULL DEFAULT 0,
        [SynchronizedCount] [int] NOT NULL DEFAULT 0,
        [SuspendedCount] [int] NOT NULL DEFAULT 0,
        [AvgSendQueueKB] [int] NOT NULL DEFAULT 0,
        [MaxSendQueueKB] [int] NOT NULL DEFAULT 0,
        [AvgRedoQueueKB] [int] NOT NULL DEFAULT 0,
        [MaxRedoQueueKB] [int] NOT NULL DEFAULT 0,
        [MaxSecondsBehind] [int] NOT NULL DEFAULT 0,
        [AlwaysOnDetails] [nvarchar](max) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_AlwaysOn_Instance_Date] 
    ON [dbo].[InstanceHealth_AlwaysOn]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_AlwaysOn creada exitosamente';
END
GO

-- =============================================
-- 3. InstanceHealth_Autogrowth
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Autogrowth]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Autogrowth](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](100) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [AutogrowthEventsLast24h] [int] NOT NULL DEFAULT 0,
        [FilesNearLimit] [int] NOT NULL DEFAULT 0,
        [FilesWithBadGrowth] [int] NOT NULL DEFAULT 0,
        [WorstPercentOfMax] [decimal](5, 2) NOT NULL DEFAULT 0,
        [AutogrowthDetails] [nvarchar](max) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Autogrowth_Instance_Date] 
    ON [dbo].[InstanceHealth_Autogrowth]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Autogrowth creada exitosamente';
END
GO

-- =============================================
-- 4. InstanceHealth_Backups
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Backups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Backups](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [LastFullBackup] [datetime2](7) NULL,
        [FullBackupBreached] [bit] NOT NULL DEFAULT 0,
        [LastLogBackup] [datetime2](7) NULL,
        [LogBackupBreached] [bit] NOT NULL DEFAULT 0,
        [BackupDetails] [nvarchar](max) NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](100) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Backups_Instance_Date] 
    ON [dbo].[InstanceHealth_Backups]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Backups creada exitosamente';
END
GO

-- =============================================
-- 5. InstanceHealth_ConfiguracionTempdb
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ConfiguracionTempdb](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [TempDBFileCount] [int] NOT NULL DEFAULT 0,
        [TempDBAllSameSize] [bit] NOT NULL DEFAULT 0,
        [TempDBAllSameGrowth] [bit] NOT NULL DEFAULT 0,
        [TempDBPageLatchWaits] [int] NOT NULL DEFAULT 0,
        [TempDBContentionScore] [int] NOT NULL DEFAULT 100,
        [MaxServerMemoryMB] [int] NOT NULL DEFAULT 0,
        [TotalPhysicalMemoryMB] [int] NOT NULL DEFAULT 0,
        [MaxMemoryPctOfPhysical] [decimal](5, 2) NOT NULL DEFAULT 0,
        [MaxMemoryWithinOptimal] [bit] NOT NULL DEFAULT 0,
        [CPUCount] [int] NOT NULL DEFAULT 0,
        [ConfigDetails] [nvarchar](max) NULL,
        [TempDBTotalSizeMB] [int] NOT NULL DEFAULT 0,
        [TempDBUsedSpaceMB] [int] NOT NULL DEFAULT 0,
        [TempDBFreeSpacePct] [decimal](5, 2) NOT NULL DEFAULT 0,
        [TempDBAvgReadLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [TempDBAvgWriteLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [TempDBVersionStoreMB] [int] NOT NULL DEFAULT 0,
        [TempDBAvgFileSizeMB] [int] NOT NULL DEFAULT 0,
        [TempDBMinFileSizeMB] [int] NOT NULL DEFAULT 0,
        [TempDBMaxFileSizeMB] [int] NOT NULL DEFAULT 0,
        [TempDBGrowthConfigOK] [bit] NOT NULL DEFAULT 1,
        [TempDBMountPoint] [varchar](10) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_ConfiguracionTempdb_Instance_Date] 
    ON [dbo].[InstanceHealth_ConfiguracionTempdb]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_ConfiguracionTempdb creada exitosamente';
END
GO

-- =============================================
-- 6. InstanceHealth_CPU
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_CPU]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_CPU](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [SQLProcessUtilization] [int] NOT NULL DEFAULT 0,
        [SystemIdleProcess] [int] NOT NULL DEFAULT 0,
        [OtherProcessUtilization] [int] NOT NULL DEFAULT 0,
        [RunnableTasks] [int] NOT NULL DEFAULT 0,
        [PendingDiskIOCount] [int] NOT NULL DEFAULT 0,
        [AvgCPUPercentLast10Min] [int] NOT NULL DEFAULT 0,
        [P95CPUPercent] [int] NOT NULL DEFAULT 0,
        [CXPacketWaitCount] [bigint] NULL DEFAULT 0,
        [CXPacketWaitMs] [bigint] NULL DEFAULT 0,
        [CXConsumerWaitCount] [bigint] NULL DEFAULT 0,
        [CXConsumerWaitMs] [bigint] NULL DEFAULT 0,
        [SOSSchedulerYieldCount] [bigint] NULL DEFAULT 0,
        [SOSSchedulerYieldMs] [bigint] NULL DEFAULT 0,
        [ThreadPoolWaitCount] [bigint] NULL DEFAULT 0,
        [ThreadPoolWaitMs] [bigint] NULL DEFAULT 0,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_CPU_Instance_Date] 
    ON [dbo].[InstanceHealth_CPU]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_CPU creada exitosamente';
END
GO

-- =============================================
-- 7. InstanceHealth_DatabaseStates
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_DatabaseStates]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_DatabaseStates](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](100) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [OfflineCount] [int] NOT NULL DEFAULT 0,
        [SuspectCount] [int] NOT NULL DEFAULT 0,
        [EmergencyCount] [int] NOT NULL DEFAULT 0,
        [RecoveryPendingCount] [int] NOT NULL DEFAULT 0,
        [SingleUserCount] [int] NOT NULL DEFAULT 0,
        [RestoringCount] [int] NOT NULL DEFAULT 0,
        [SuspectPageCount] [int] NOT NULL DEFAULT 0,
        [DatabaseStateDetails] [nvarchar](max) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_DatabaseStates_Instance_Date] 
    ON [dbo].[InstanceHealth_DatabaseStates]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_DatabaseStates creada exitosamente';
END
GO

-- =============================================
-- 8. InstanceHealth_Discos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Discos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Discos](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [WorstFreePct] [decimal](5, 2) NOT NULL DEFAULT 100,
        [DataDiskAvgFreePct] [decimal](5, 2) NOT NULL DEFAULT 100,
        [LogDiskAvgFreePct] [decimal](5, 2) NOT NULL DEFAULT 100,
        [TempDBDiskFreePct] [decimal](5, 2) NOT NULL DEFAULT 100,
        [VolumesJson] [nvarchar](max) NULL,
        [PageLifeExpectancy] [int] NULL,
        [PageReadsPerSec] [int] NULL,
        [PageWritesPerSec] [int] NULL,
        [LazyWritesPerSec] [int] NULL,
        [CheckpointPagesPerSec] [int] NULL,
        [BatchRequestsPerSec] [int] NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Discos_Instance_Date] 
    ON [dbo].[InstanceHealth_Discos]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Discos creada exitosamente';
END
GO

-- =============================================
-- 9. InstanceHealth_ErroresCriticos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ErroresCriticos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ErroresCriticos](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [Severity20PlusCount] [int] NOT NULL DEFAULT 0,
        [Severity20PlusLast1h] [int] NOT NULL DEFAULT 0,
        [MostRecentError] [datetime2](7) NULL,
        [ErrorDetails] [nvarchar](max) NULL,
        [BlockedSessionCount] [int] NULL DEFAULT 0,
        [MaxBlockTimeSeconds] [int] NULL DEFAULT 0,
        [BlockerSessionIds] [nvarchar](200) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_ErroresCriticos_Instance_Date] 
    ON [dbo].[InstanceHealth_ErroresCriticos]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_ErroresCriticos creada exitosamente';
END
GO

-- =============================================
-- 10. InstanceHealth_IO
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_IO]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_IO](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [AvgReadLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [AvgWriteLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [MaxReadLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [MaxWriteLatencyMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [DataFileAvgReadMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [DataFileAvgWriteMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [LogFileAvgWriteMs] [decimal](10, 2) NOT NULL DEFAULT 0,
        [TotalIOPS] [int] NOT NULL DEFAULT 0,
        [ReadIOPS] [int] NOT NULL DEFAULT 0,
        [WriteIOPS] [int] NOT NULL DEFAULT 0,
        [IODetails] [nvarchar](max) NULL,
        [PageIOLatchWaitCount] [bigint] NULL DEFAULT 0,
        [PageIOLatchWaitMs] [bigint] NULL DEFAULT 0,
        [WriteLogWaitCount] [bigint] NULL DEFAULT 0,
        [WriteLogWaitMs] [bigint] NULL DEFAULT 0,
        [AsyncIOCompletionCount] [bigint] NULL DEFAULT 0,
        [AsyncIOCompletionMs] [bigint] NULL DEFAULT 0,
        [TotalWaits] [bigint] NULL DEFAULT 0,
        [TotalWaitMs] [bigint] NULL DEFAULT 0,
        [IOByVolumeJson] [nvarchar](max) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_IO_Instance_Date] 
    ON [dbo].[InstanceHealth_IO]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_IO creada exitosamente';
END
GO

-- =============================================
-- 11. InstanceHealth_LogChain
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_LogChain]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_LogChain](
        [Id] [int] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](100) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [BrokenChainCount] [int] NOT NULL DEFAULT 0,
        [FullDBsWithoutLogBackup] [int] NOT NULL DEFAULT 0,
        [MaxHoursSinceLogBackup] [int] NOT NULL DEFAULT 0,
        [LogChainDetails] [nvarchar](max) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_LogChain_Instance_Date] 
    ON [dbo].[InstanceHealth_LogChain]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_LogChain creada exitosamente';
END
GO

-- =============================================
-- 12. InstanceHealth_Maintenance
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Maintenance](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [LastCheckdb] [datetime2](7) NULL,
        [CheckdbOk] [bit] NOT NULL DEFAULT 0,
        [LastIndexOptimize] [datetime2](7) NULL,
        [IndexOptimizeOk] [bit] NOT NULL DEFAULT 0,
        [AvgIndexFragmentation] [decimal](5, 2) NULL,
        [HighFragmentationCount] [int] NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](100) NULL,
        [AGName] [nvarchar](255) NULL,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Maintenance_Instance_Date] 
    ON [dbo].[InstanceHealth_Maintenance]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Maintenance creada exitosamente';
END
GO

-- =============================================
-- 13. InstanceHealth_Memoria
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Memoria]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Memoria](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [PageLifeExpectancy] [int] NOT NULL DEFAULT 0,
        [BufferCacheHitRatio] [decimal](5, 2) NOT NULL DEFAULT 100,
        [TotalServerMemoryMB] [int] NOT NULL DEFAULT 0,
        [TargetServerMemoryMB] [int] NOT NULL DEFAULT 0,
        [MaxServerMemoryMB] [int] NOT NULL DEFAULT 0,
        [BufferPoolSizeMB] [int] NOT NULL DEFAULT 0,
        [MemoryGrantsPending] [int] NOT NULL DEFAULT 0,
        [MemoryGrantsActive] [int] NOT NULL DEFAULT 0,
        [PLETarget] [int] NOT NULL DEFAULT 0,
        [MemoryPressure] [bit] NOT NULL DEFAULT 0,
        [ResourceSemaphoreWaitCount] [bigint] NULL DEFAULT 0,
        [ResourceSemaphoreWaitMs] [bigint] NULL DEFAULT 0,
        [StolenServerMemoryMB] [int] NULL DEFAULT 0,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Memoria_Instance_Date] 
    ON [dbo].[InstanceHealth_Memoria]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Memoria creada exitosamente';
END
GO

-- =============================================
-- 14. InstanceHealth_Waits
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Waits]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Waits](
        [Id] [bigint] IDENTITY(1,1) NOT NULL,
        [InstanceName] [nvarchar](255) NOT NULL,
        [Ambiente] [nvarchar](50) NULL,
        [HostingSite] [nvarchar](50) NULL,
        [SqlVersion] [nvarchar](50) NULL,
        [CollectedAtUtc] [datetime2](7) NOT NULL DEFAULT GETDATE(),
        [BlockedSessionCount] [int] NULL DEFAULT 0,
        [MaxBlockTimeSeconds] [int] NULL DEFAULT 0,
        [BlockerSessionIds] [nvarchar](200) NULL,
        [TopWait1Type] [nvarchar](100) NULL,
        [TopWait1Count] [bigint] NULL DEFAULT 0,
        [TopWait1Ms] [bigint] NULL DEFAULT 0,
        [TopWait2Type] [nvarchar](100) NULL,
        [TopWait2Count] [bigint] NULL DEFAULT 0,
        [TopWait2Ms] [bigint] NULL DEFAULT 0,
        [TopWait3Type] [nvarchar](100) NULL,
        [TopWait3Count] [bigint] NULL DEFAULT 0,
        [TopWait3Ms] [bigint] NULL DEFAULT 0,
        [TopWait4Type] [nvarchar](100) NULL,
        [TopWait4Count] [bigint] NULL DEFAULT 0,
        [TopWait4Ms] [bigint] NULL DEFAULT 0,
        [TopWait5Type] [nvarchar](100) NULL,
        [TopWait5Count] [bigint] NULL DEFAULT 0,
        [TopWait5Ms] [bigint] NULL DEFAULT 0,
        [PageIOLatchWaitCount] [bigint] NULL DEFAULT 0,
        [PageIOLatchWaitMs] [bigint] NULL DEFAULT 0,
        [WriteLogWaitCount] [bigint] NULL DEFAULT 0,
        [WriteLogWaitMs] [bigint] NULL DEFAULT 0,
        [AsyncIOCompletionCount] [bigint] NULL DEFAULT 0,
        [AsyncIOCompletionMs] [bigint] NULL DEFAULT 0,
        [ResourceSemaphoreWaitCount] [bigint] NULL DEFAULT 0,
        [ResourceSemaphoreWaitMs] [bigint] NULL DEFAULT 0,
        [CXPacketWaitCount] [bigint] NULL DEFAULT 0,
        [CXPacketWaitMs] [bigint] NULL DEFAULT 0,
        [CXConsumerWaitCount] [bigint] NULL DEFAULT 0,
        [CXConsumerWaitMs] [bigint] NULL DEFAULT 0,
        [SOSSchedulerYieldCount] [bigint] NULL DEFAULT 0,
        [SOSSchedulerYieldMs] [bigint] NULL DEFAULT 0,
        [ThreadPoolWaitCount] [bigint] NULL DEFAULT 0,
        [ThreadPoolWaitMs] [bigint] NULL DEFAULT 0,
        [LockWaitCount] [bigint] NULL DEFAULT 0,
        [LockWaitMs] [bigint] NULL DEFAULT 0,
        [MaxDOP] [int] NULL,
        [TotalWaits] [bigint] NULL DEFAULT 0,
        [TotalWaitMs] [bigint] NULL DEFAULT 0,
        PRIMARY KEY CLUSTERED ([Id] ASC)
    );

    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Waits_Instance_Date] 
    ON [dbo].[InstanceHealth_Waits]([InstanceName] ASC, [CollectedAtUtc] DESC);
    
    PRINT 'Tabla InstanceHealth_Waits creada exitosamente';
END
GO

-- =============================================
-- Vista: vw_InstanceHealth_Latest
-- Devuelve la última recolección consolidada por instancia
-- Esta es la vista que usa el HealthScoreService
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
),
LatestDiscos AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_Discos
    GROUP BY InstanceName
),
LatestIO AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_IO
    GROUP BY InstanceName
),
LatestMemoria AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_Memoria
    GROUP BY InstanceName
),
LatestBackups AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_Backups
    GROUP BY InstanceName
),
LatestMaintenance AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_Maintenance
    GROUP BY InstanceName
),
LatestAlwaysOn AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_AlwaysOn
    GROUP BY InstanceName
),
LatestErrores AS (
    SELECT InstanceName, MAX(CollectedAtUtc) as LatestDate
    FROM InstanceHealth_ErroresCriticos
    GROUP BY InstanceName
)
SELECT 
    -- Score y Status
    s.InstanceName,
    s.HealthScore,
    s.HealthStatus,
    s.CollectedAtUtc AS ScoreCollectedAt,
    
    -- Metadata de instancia
    s.Ambiente,
    s.HostingSite,
    s.SqlVersion,
    
    -- Breakdown por Tiers (calculado)
    CAST(
        (ISNULL(s.AlwaysOnScore, 0) * 0.30) + 
        (ISNULL(s.ErroresCriticosScore, 0) * 0.30) + 
        (ISNULL(m2.PageLifeExpectancy, 0) / 30.0)
    AS INT) AS Tier1_Availability,
    CAST(
        (ISNULL(s.BackupsScore, 0) * 0.50) + 
        (ISNULL(s.MantenimientosScore, 0) * 0.50)
    AS INT) AS Tier2_Continuity,
    CAST(
        (ISNULL(s.CPUScore, 0) * 0.25) + 
        (ISNULL(s.MemoriaScore, 0) * 0.25) + 
        (ISNULL(s.IOScore, 0) * 0.25) + 
        (ISNULL(s.DiscosScore, 0) * 0.25)
    AS INT) AS Tier3_Resources,
    CAST(
        (ISNULL(s.ConfiguracionTempdbScore, 0) * 0.50) + 
        (ISNULL(s.AutogrowthScore, 0) * 0.50)
    AS INT) AS Tier4_Maintenance,
    
    -- Breakdown detallado (scores individuales)
    100 AS ConnectivityScore, -- Asumimos conectividad OK si tenemos datos
    s.MemoriaScore AS MemoryScore,
    s.AlwaysOnScore,
    CASE WHEN b.FullBackupBreached = 0 THEN 100 ELSE 0 END AS FullBackupScore,
    CASE WHEN b.LogBackupBreached = 0 THEN 100 ELSE 0 END AS LogBackupScore,
    s.DiscosScore AS DiskSpaceScore,
    CASE WHEN mt.CheckdbOk = 1 THEN 100 ELSE 0 END AS CheckdbScore,
    CASE WHEN mt.IndexOptimizeOk = 1 THEN 100 ELSE 0 END AS IndexOptimizeScore,
    s.ErroresCriticosScore AS ErrorlogScore,
    
    -- Métricas raw - Availability
    1 AS ConnectSuccess, -- Si tenemos datos, está conectado
    0 AS ConnectLatencyMs,
    ISNULL(e.BlockedSessionCount, 0) AS BlockingCount,
    ISNULL(e.MaxBlockTimeSeconds, 0) AS MaxBlockTimeSeconds,
    ISNULL(m2.PageLifeExpectancy, 0) AS PageLifeExpectancy,
    ISNULL(m2.BufferCacheHitRatio, 100) AS BufferCacheHitRatio,
    ISNULL(ao.AlwaysOnEnabled, 0) AS AlwaysOnEnabled,
    ISNULL(ao.AlwaysOnWorstState, 'N/A') AS AlwaysOnWorstState,
    
    -- Métricas raw - Resources
    ISNULL(d.WorstFreePct, 100) AS WorstFreePct,  -- Alias usado por HealthScoreRealtimeController
    ISNULL(d.WorstFreePct, 100) AS DiskWorstFreePct, -- Alias usado por HealthScoreService
    d.VolumesJson AS DiskDetails,
    ISNULL(io.AvgReadLatencyMs, 0) AS AvgReadLatencyMs,
    ISNULL(io.AvgWriteLatencyMs, 0) AS AvgWriteLatencyMs,
    ISNULL(io.MaxReadLatencyMs, 0) AS MaxReadLatencyMs,
    ISNULL(io.TotalIOPS, 0) AS TotalIOPS,
    0 AS SlowQueriesCount,
    0 AS LongRunningQueriesCount,
    
    -- Métricas raw - Backups
    b.LastFullBackup,
    b.LastLogBackup,
    ISNULL(b.FullBackupBreached, 0) AS FullBackupBreached,
    ISNULL(b.LogBackupBreached, 0) AS LogBackupBreached,
    
    -- Métricas raw - Maintenance
    mt.LastCheckdb,
    ISNULL(mt.CheckdbOk, 0) AS CheckdbOk,
    mt.LastIndexOptimize,
    ISNULL(mt.IndexOptimizeOk, 0) AS IndexOptimizeOk,
    ISNULL(e.Severity20PlusCount, 0) AS Severity20PlusCount,
    
    -- Timestamps adicionales requeridos por HealthScoreRealtimeController
    s.CollectedAtUtc AS RealTimeCollectedAt,
    b.CollectedAtUtc AS BackupCollectedAt,
    mt.CollectedAtUtc AS MaintenanceCollectedAt

FROM InstanceHealth_Score s
INNER JOIN LatestScore ls ON s.InstanceName = ls.InstanceName AND s.CollectedAtUtc = ls.LatestDate
LEFT JOIN InstanceHealth_Discos d ON s.InstanceName = d.InstanceName 
    AND d.CollectedAtUtc = (SELECT LatestDate FROM LatestDiscos WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_IO io ON s.InstanceName = io.InstanceName 
    AND io.CollectedAtUtc = (SELECT LatestDate FROM LatestIO WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_Memoria m2 ON s.InstanceName = m2.InstanceName 
    AND m2.CollectedAtUtc = (SELECT LatestDate FROM LatestMemoria WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_Backups b ON s.InstanceName = b.InstanceName 
    AND b.CollectedAtUtc = (SELECT LatestDate FROM LatestBackups WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_Maintenance mt ON s.InstanceName = mt.InstanceName 
    AND mt.CollectedAtUtc = (SELECT LatestDate FROM LatestMaintenance WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_AlwaysOn ao ON s.InstanceName = ao.InstanceName 
    AND ao.CollectedAtUtc = (SELECT LatestDate FROM LatestAlwaysOn WHERE InstanceName = s.InstanceName)
LEFT JOIN InstanceHealth_ErroresCriticos e ON s.InstanceName = e.InstanceName 
    AND e.CollectedAtUtc = (SELECT LatestDate FROM LatestErrores WHERE InstanceName = s.InstanceName);
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

-- =============================================
-- Script para migrar datos desde SQLNova (opcional)
-- Descomenta y ejecuta si quieres migrar datos históricos
-- =============================================
/*
-- Migrar InstanceHealth_Score
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Score]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Score];

-- Migrar InstanceHealth_AlwaysOn
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_AlwaysOn]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_AlwaysOn];

-- Migrar InstanceHealth_Autogrowth
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Autogrowth]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Autogrowth];

-- Migrar InstanceHealth_Backups
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Backups]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Backups];

-- Migrar InstanceHealth_ConfiguracionTempdb
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_ConfiguracionTempdb]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_ConfiguracionTempdb];

-- Migrar InstanceHealth_CPU
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_CPU]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_CPU];

-- Migrar InstanceHealth_DatabaseStates
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_DatabaseStates]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_DatabaseStates];

-- Migrar InstanceHealth_Discos
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Discos]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Discos];

-- Migrar InstanceHealth_ErroresCriticos
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_ErroresCriticos]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_ErroresCriticos];

-- Migrar InstanceHealth_IO
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_IO]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_IO];

-- Migrar InstanceHealth_LogChain
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_LogChain]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_LogChain];

-- Migrar InstanceHealth_Maintenance
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Maintenance]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Maintenance];

-- Migrar InstanceHealth_Memoria
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Memoria]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Memoria];

-- Migrar InstanceHealth_Waits
INSERT INTO [SQLGuardObservatoryAuth].[dbo].[InstanceHealth_Waits]
SELECT * FROM [SQLNova].[dbo].[InstanceHealth_Waits];
*/

PRINT '============================================='
PRINT 'Script completado exitosamente'
PRINT '============================================='
GO
