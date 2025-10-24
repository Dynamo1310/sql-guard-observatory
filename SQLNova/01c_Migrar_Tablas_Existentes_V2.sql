-- =============================================
-- Sistema Health Score V2 - MIGRACIÓN DE TABLAS EXISTENTES
-- Agrega columnas faltantes sin perder datos
-- =============================================
USE SQLNova;
GO

PRINT '==============================================';
PRINT 'Migración de tablas existentes para Health Score V2';
PRINT '==============================================';
PRINT '';

-- =============================================
-- 1. CollectorLog
-- =============================================
IF OBJECT_ID('dbo.CollectorLog', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla CollectorLog...';
    CREATE TABLE dbo.CollectorLog (
        LogID bigint IDENTITY(1,1) PRIMARY KEY,
        CollectorName varchar(100) NOT NULL,
        Instance sysname NOT NULL,
        [Level] varchar(10) NOT NULL,
        [Message] nvarchar(max) NOT NULL,
        LoggedAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        INDEX IX_CollectorLog_Instance_LoggedAt (Instance, LoggedAt)
    );
    PRINT '✓ Tabla CollectorLog creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla CollectorLog ya existe';
END
GO

-- =============================================
-- 2. InventarioBackupSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioBackupSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioBackupSnapshot...';
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
    PRINT '✓ Tabla InventarioBackupSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioBackupSnapshot ya existe';
    -- Agregar columnas faltantes si es necesario
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventarioBackupSnapshot') AND name = 'RecoveryModel')
    BEGIN
        ALTER TABLE dbo.InventarioBackupSnapshot ADD RecoveryModel varchar(20) NULL;
        PRINT '  → Columna RecoveryModel agregada';
    END
END
GO

-- =============================================
-- 3. InventarioAGSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioAGSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioAGSnapshot...';
    CREATE TABLE dbo.InventarioAGSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        AGName sysname NOT NULL,
        Replica sysname NOT NULL,
        DBName sysname NOT NULL,
        SyncState varchar(50) NULL,
        IsSuspended bit NOT NULL DEFAULT 0,
        SendQueueKB bigint NULL,
        RedoQueueKB bigint NULL,
        SendRateKBs decimal(18,2) NULL,
        RedoRateKBs decimal(18,2) NULL,
        INDEX IX_AGSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_AGSnapshot_SnapshotAt (SnapshotAt)
    );
    PRINT '✓ Tabla InventarioAGSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioAGSnapshot ya existe';
END
GO

-- =============================================
-- 4. InventarioConectividadSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioConectividadSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioConectividadSnapshot...';
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
    PRINT '✓ Tabla InventarioConectividadSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioConectividadSnapshot ya existe';
END
GO

-- =============================================
-- 5. InventarioErroresSevSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioErroresSevSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioErroresSevSnapshot...';
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
    PRINT '✓ Tabla InventarioErroresSevSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioErroresSevSnapshot ya existe';
END
GO

-- =============================================
-- 6. InventarioCPUSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioCPUSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioCPUSnapshot...';
    CREATE TABLE dbo.InventarioCPUSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        CpuPct_p95 decimal(5,2) NULL,
        RunnableTasksAvg decimal(10,2) NULL,
        INDEX IX_CPUSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_CPUSnapshot_SnapshotAt (SnapshotAt)
    );
    PRINT '✓ Tabla InventarioCPUSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioCPUSnapshot ya existe';
END
GO

-- =============================================
-- 7. InventarioIOSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioIOSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioIOSnapshot...';
    CREATE TABLE dbo.InventarioIOSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DbName sysname NOT NULL,
        FileType varchar(20) NOT NULL,
        AvgLatencyRead_ms decimal(10,2) NULL,
        AvgLatencyWrite_ms decimal(10,2) NULL,
        IOPS_Read bigint NULL,
        IOPS_Write bigint NULL,
        INDEX IX_IOSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_IOSnapshot_SnapshotAt (SnapshotAt)
    );
    PRINT '✓ Tabla InventarioIOSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioIOSnapshot ya existe';
END
GO

-- =============================================
-- 8. InventarioDiscosSnapshot - MIGRACIÓN ESPECIAL
-- =============================================
IF OBJECT_ID('dbo.InventarioDiscosSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioDiscosSnapshot...';
    CREATE TABLE dbo.InventarioDiscosSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        DriveLetter char(3) NOT NULL,
        [Role] varchar(20) NOT NULL,
        FreePct decimal(5,2) NULL,
        SizeGB decimal(18,2) NULL,
        GrowthPct7d decimal(5,2) NULL,
        INDEX IX_DiscosSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_DiscosSnapshot_SnapshotAt (SnapshotAt)
    );
    PRINT '✓ Tabla InventarioDiscosSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioDiscosSnapshot ya existe - verificando esquema...';
    
    -- Verificar si tiene el esquema antiguo (sin Instance, SnapshotAt, etc.)
    IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InventarioDiscosSnapshot') AND name = 'Instance')
    BEGIN
        PRINT '  ⚠ ADVERTENCIA: Tabla tiene esquema antiguo incompatible';
        PRINT '  → Renombrando tabla antigua a InventarioDiscosSnapshot_OLD';
        
        -- Renombrar tabla antigua
        EXEC sp_rename 'dbo.InventarioDiscosSnapshot', 'InventarioDiscosSnapshot_OLD';
        
        -- Crear nueva tabla con esquema correcto
        CREATE TABLE dbo.InventarioDiscosSnapshot (
            SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
            Instance sysname NOT NULL,
            SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
            DriveLetter char(3) NOT NULL,
            [Role] varchar(20) NOT NULL,
            FreePct decimal(5,2) NULL,
            SizeGB decimal(18,2) NULL,
            GrowthPct7d decimal(5,2) NULL,
            INDEX IX_DiscosSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
            INDEX IX_DiscosSnapshot_SnapshotAt (SnapshotAt)
        );
        
        PRINT '  ✓ Nueva tabla InventarioDiscosSnapshot creada';
        PRINT '  ℹ Datos antiguos preservados en InventarioDiscosSnapshot_OLD';
        PRINT '  ℹ Puedes eliminarla manualmente cuando confirmes que V2 funciona';
    END
    ELSE
    BEGIN
        PRINT '  ✓ Esquema correcto detectado';
    END
END
GO

-- =============================================
-- 9. InventarioMemoriaSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioMemoriaSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioMemoriaSnapshot...';
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
    PRINT '✓ Tabla InventarioMemoriaSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioMemoriaSnapshot ya existe';
END
GO

-- =============================================
-- 10. InventarioMantenimientoSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioMantenimientoSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioMantenimientoSnapshot...';
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
    PRINT '✓ Tabla InventarioMantenimientoSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioMantenimientoSnapshot ya existe';
END
GO

-- =============================================
-- 11. InventarioConfigRecursosSnapshot
-- =============================================
IF OBJECT_ID('dbo.InventarioConfigRecursosSnapshot', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla InventarioConfigRecursosSnapshot...';
    CREATE TABLE dbo.InventarioConfigRecursosSnapshot (
        SnapshotID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        Tempdb_Files int NULL,
        Tempdb_Files_Recom int NULL,
        Tempdb_SizesEqualPct decimal(5,2) NULL,
        Tempdb_GrowthMBOnly bit NOT NULL DEFAULT 0,
        Tempdb_Pagelatch bit NOT NULL DEFAULT 0,
        Tempdb_Latency_ms decimal(10,2) NULL,
        TotalRAM_GB decimal(10,2) NULL,
        MaxServerMemory_GB decimal(10,2) NULL,
        MaxRecomendado_GB decimal(10,2) NULL,
        INDEX IX_ConfigSnapshot_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_ConfigSnapshot_SnapshotAt (SnapshotAt)
    );
    PRINT '✓ Tabla InventarioConfigRecursosSnapshot creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla InventarioConfigRecursosSnapshot ya existe';
END
GO

-- =============================================
-- 12. HealthScoreAlertas
-- =============================================
IF OBJECT_ID('dbo.HealthScoreAlertas', 'U') IS NULL
BEGIN
    PRINT 'Creando tabla HealthScoreAlertas...';
    CREATE TABLE dbo.HealthScoreAlertas (
        AlertaID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        EstadoAnterior varchar(20) NULL,
        EstadoNuevo varchar(20) NOT NULL,
        HealthScoreAnterior int NULL,
        HealthScoreNuevo int NOT NULL,
        Causa nvarchar(500) NULL,
        DetectadoAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        INDEX IX_Alertas_Instance_DetectadoAt (Instance, DetectadoAt)
    );
    PRINT '✓ Tabla HealthScoreAlertas creada';
END
ELSE
BEGIN
    PRINT '✓ Tabla HealthScoreAlertas ya existe';
END
GO

PRINT '';
PRINT '==============================================';
PRINT 'Migración completada exitosamente';
PRINT '==============================================';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar: 02_Views_HealthScore_V2.sql';
PRINT '2. Ejecutar: 03_Views_HealthFinal_V2.sql';
PRINT '3. Ejecutar: 04_Security_V2.sql';
PRINT '';
GO

