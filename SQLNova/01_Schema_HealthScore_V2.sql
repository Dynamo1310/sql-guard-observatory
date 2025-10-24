-- =============================================
-- Sistema Health Score V2 - Esquema de Snapshots
-- Base de datos: SQLNova
-- Zona horaria: América/Argentina/Córdoba
-- =============================================
USE SQLNova;
GO

-- =============================================
-- 1. Tabla de Log de Collectors
-- =============================================
IF OBJECT_ID('dbo.CollectorLog', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.CollectorLog (
        LogID bigint IDENTITY(1,1) PRIMARY KEY,
        CollectorName varchar(100) NOT NULL,
        Instance sysname NOT NULL,
        [Level] varchar(10) NOT NULL, -- Info, Warn, Error
        [Message] nvarchar(max) NOT NULL,
        LoggedAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        INDEX IX_CollectorLog_Instance_LoggedAt (Instance, LoggedAt)
    );
END
GO

-- =============================================
-- 2. Snapshots de BACKUPS
-- =============================================
IF OBJECT_ID('dbo.InventarioBackupSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioBackupSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DBName sysname NOT NULL,
        LastFull datetime2(0) NULL,
        LastDiff datetime2(0) NULL,
        LastLog datetime2(0) NULL,
        FullAgeMin int NULL,
        LogAgeMin int NULL,
        ChainOK bit NOT NULL DEFAULT 1,
        RecoveryModel varchar(20) NULL,
        INDEX IX_BackupSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_BackupSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 3. Snapshots de ALWAYSON (AG)
-- =============================================
IF OBJECT_ID('dbo.InventarioAGSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioAGSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        AGName sysname NOT NULL,
        Replica sysname NOT NULL,
        DBName sysname NOT NULL,
        SyncState varchar(50) NULL, -- SYNCHRONIZED, SYNCHRONIZING, NOT SYNCHRONIZING
        IsSuspended bit NOT NULL DEFAULT 0,
        SendQueueKB bigint NULL,
        RedoQueueKB bigint NULL,
        SendRateKBs decimal(18,2) NULL,
        RedoRateKBs decimal(18,2) NULL,
        INDEX IX_AGSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_AGSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 4. Snapshots de CONECTIVIDAD
-- =============================================
IF OBJECT_ID('dbo.InventarioConectividadSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioConectividadSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        Reachable bit NOT NULL DEFAULT 1,
        AuthOK bit NOT NULL DEFAULT 1,
        RTTms int NULL,
        FailedLogins15m int NOT NULL DEFAULT 0,
        INDEX IX_ConnSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_ConnSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 5. Snapshots de ERRORES SEVERIDAD >=20
-- =============================================
IF OBJECT_ID('dbo.InventarioErroresSevSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioErroresSevSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        EventTime datetime2(0) NOT NULL,
        ErrorNumber int NOT NULL,
        Severity int NOT NULL,
        [Message] nvarchar(max) NULL,
        INDEX IX_ErrorSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_ErrorSnapshot_EventTime (EventTime)
    );
END
GO

-- =============================================
-- 6. Snapshots de CPU
-- =============================================
IF OBJECT_ID('dbo.InventarioCPUSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioCPUSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        CpuPct_p95 decimal(5,2) NULL,
        RunnableTasksAvg decimal(10,2) NULL,
        INDEX IX_CPUSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_CPUSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 7. Snapshots de IO (por archivo/volumen)
-- =============================================
IF OBJECT_ID('dbo.InventarioIOSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioIOSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DbName sysname NOT NULL,
        FileType varchar(20) NOT NULL, -- Data, Log, Tempdb
        AvgLatencyRead_ms decimal(10,2) NULL,
        AvgLatencyWrite_ms decimal(10,2) NULL,
        IOPS_Read bigint NULL,
        IOPS_Write bigint NULL,
        INDEX IX_IOSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_IOSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 8. Snapshots de DISCOS
-- =============================================
IF OBJECT_ID('dbo.InventarioDiscosSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioDiscosSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DriveLetter char(3) NOT NULL,
        [Role] varchar(20) NOT NULL, -- SO, Data, Log, Backups, Temp
        FreePct decimal(5,2) NULL,
        SizeGB decimal(18,2) NULL,
        GrowthPct7d decimal(5,2) NULL,
        INDEX IX_DiscosSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_DiscosSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 9. Snapshots de MEMORIA
-- =============================================
IF OBJECT_ID('dbo.InventarioMemoriaSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioMemoriaSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        PLE_MinNUMA int NULL,
        PLE_Target_sec int NULL,
        MemoryGrantsPending int NOT NULL DEFAULT 0,
        CommittedGB decimal(10,2) NULL,
        TargetGB decimal(10,2) NULL,
        INDEX IX_MemoriaSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_MemoriaSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 10. Snapshots de MANTENIMIENTO
-- =============================================
IF OBJECT_ID('dbo.InventarioMantenimientoSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioMantenimientoSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DBName sysname NOT NULL,
        LastCheckDB datetime2(0) NULL,
        CheckDB_AgeDays int NULL,
        CheckDB_WithinSLA bit NOT NULL DEFAULT 0,
        LastIndexOptimize datetime2(0) NULL,
        IndexOpt_AgeDays int NULL,
        LastStatsUpdate datetime2(0) NULL,
        Stats_AgeDays int NULL,
        Success14d_CheckDB int NOT NULL DEFAULT 0,
        Success14d_Index int NOT NULL DEFAULT 0,
        Success14d_Stats int NOT NULL DEFAULT 0,
        INDEX IX_MantSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_MantSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 11. Snapshots de CONFIGURACION & TEMPDB
-- =============================================
IF OBJECT_ID('dbo.InventarioConfigRecursosSnapshot', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.InventarioConfigRecursosSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        -- Tempdb
        Tempdb_Files int NULL,
        Tempdb_Files_Recom int NULL,
        Tempdb_SizesEqualPct decimal(5,2) NULL,
        Tempdb_GrowthMBOnly bit NOT NULL DEFAULT 0,
        Tempdb_Pagelatch bit NOT NULL DEFAULT 0,
        Tempdb_Latency_ms decimal(10,2) NULL,
        -- Memoria
        TotalRAM_GB decimal(10,2) NULL,
        MaxServerMemory_GB decimal(10,2) NULL,
        MaxRecomendado_GB decimal(10,2) NULL,
        INDEX IX_ConfigSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_ConfigSnapshot_SnapshotAt (SnapshotAt)
    );
END
GO

-- =============================================
-- 12. Tabla de Alertas (opcional)
-- =============================================
IF OBJECT_ID('dbo.HealthScoreAlertas', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HealthScoreAlertas (
        AlertaID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        EstadoAnterior varchar(20) NULL, -- Verde, Amarillo, Naranja, Rojo
        EstadoNuevo varchar(20) NOT NULL,
        HealthScoreAnterior int NULL,
        HealthScoreNuevo int NOT NULL,
        Causa nvarchar(500) NULL,
        DetectadoAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        INDEX IX_Alertas_Instance_DetectadoAt (Instance, DetectadoAt)
    );
END
GO

PRINT 'Esquema Health Score V2 creado exitosamente';
GO

