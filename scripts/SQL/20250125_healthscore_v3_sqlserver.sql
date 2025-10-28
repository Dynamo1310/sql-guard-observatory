-- =====================================================
-- Health Score v3.0 - Script de Migración SQL Server
-- 10 Categorías × 10 puntos = 100 puntos total
-- Semáforo de 4 colores
-- =====================================================
-- Base de Datos: SQLNova (SQL Server)
-- Fecha: 2025-01-25
-- =====================================================

USE [SQLNova];
GO

PRINT '';
PRINT '════════════════════════════════════════════════════════';
PRINT '🚀 Iniciando Migración Health Score v3.0';
PRINT '════════════════════════════════════════════════════════';
PRINT '';
GO

-- =====================================================
-- 1. CREAR NUEVAS TABLAS (8 CATEGORÍAS NUEVAS)
-- =====================================================

PRINT '📦 Paso 1: Creando tablas de categorías...';
PRINT '';
GO

-- ===========================================
-- CATEGORÍA 1: CONECTIVIDAD (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Conectividad]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Conectividad] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de Conectividad
        [ConnectSuccess] BIT NOT NULL,
        [ConnectLatencyMs] INT NOT NULL,
        [AuthType] NVARCHAR(50) NULL,
        [LoginFailuresLast1h] INT NOT NULL DEFAULT 0,
        [ErrorMessage] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_Conectividad_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Conectividad_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Conectividad creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Conectividad ya existe';
GO

-- ===========================================
-- CATEGORÍA 2: ALWAYSON (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_AlwaysOn]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_AlwaysOn] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas AlwaysOn
        [AlwaysOnEnabled] BIT NOT NULL,
        [AlwaysOnWorstState] NVARCHAR(50) NULL,
        [DatabaseCount] INT NOT NULL DEFAULT 0,
        [SynchronizedCount] INT NOT NULL DEFAULT 0,
        [SuspendedCount] INT NOT NULL DEFAULT 0,
        [AvgSendQueueKB] INT NOT NULL DEFAULT 0,
        [MaxSendQueueKB] INT NOT NULL DEFAULT 0,
        [AvgRedoQueueKB] INT NOT NULL DEFAULT 0,
        [MaxRedoQueueKB] INT NOT NULL DEFAULT 0,
        [MaxSecondsBehind] INT NOT NULL DEFAULT 0,
        [AlwaysOnDetails] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_AlwaysOn_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_AlwaysOn_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_AlwaysOn creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_AlwaysOn ya existe';
GO

-- ===========================================
-- CATEGORÍA 4: ERRORES CRÍTICOS (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ErroresCriticos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ErroresCriticos] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de Errores
        [Severity20PlusCount] INT NOT NULL DEFAULT 0,
        [Severity20PlusLast1h] INT NOT NULL DEFAULT 0,
        [MostRecentError] DATETIME2 NULL,
        [ErrorDetails] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_ErroresCriticos_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_ErroresCriticos_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_ErroresCriticos creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_ErroresCriticos ya existe';
GO

-- ===========================================
-- CATEGORÍA 5: CPU (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_CPU]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_CPU] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de CPU
        [SQLProcessUtilization] INT NOT NULL DEFAULT 0,
        [SystemIdleProcess] INT NOT NULL DEFAULT 0,
        [OtherProcessUtilization] INT NOT NULL DEFAULT 0,
        [RunnableTasks] INT NOT NULL DEFAULT 0,
        [PendingDiskIOCount] INT NOT NULL DEFAULT 0,
        [AvgCPUPercentLast10Min] INT NOT NULL DEFAULT 0,
        [P95CPUPercent] INT NOT NULL DEFAULT 0,
        
        -- Índices
        INDEX IX_InstanceHealth_CPU_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_CPU_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_CPU creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_CPU ya existe';
GO

-- ===========================================
-- CATEGORÍA 6: IO (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_IO]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_IO] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de IO
        [AvgReadLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [AvgWriteLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [MaxReadLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [MaxWriteLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [DataFileAvgReadMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [DataFileAvgWriteMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [LogFileAvgWriteMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [TotalIOPS] INT NOT NULL DEFAULT 0,
        [ReadIOPS] INT NOT NULL DEFAULT 0,
        [WriteIOPS] INT NOT NULL DEFAULT 0,
        [IODetails] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_IO_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_IO_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_IO creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_IO ya existe';
GO

-- ===========================================
-- CATEGORÍA 7: DISCOS (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Discos]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Discos] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de Discos
        [WorstFreePct] DECIMAL(5,2) NOT NULL DEFAULT 100,
        [DataDiskAvgFreePct] DECIMAL(5,2) NOT NULL DEFAULT 100,
        [LogDiskAvgFreePct] DECIMAL(5,2) NOT NULL DEFAULT 100,
        [TempDBDiskFreePct] DECIMAL(5,2) NOT NULL DEFAULT 100,
        [VolumesJson] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_Discos_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Discos_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Discos creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Discos ya existe';
GO

-- ===========================================
-- CATEGORÍA 8: MEMORIA (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Memoria]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Memoria] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de Memoria
        [PageLifeExpectancy] INT NOT NULL DEFAULT 0,
        [BufferCacheHitRatio] DECIMAL(5,2) NOT NULL DEFAULT 100,
        [TotalServerMemoryMB] INT NOT NULL DEFAULT 0,
        [TargetServerMemoryMB] INT NOT NULL DEFAULT 0,
        [MaxServerMemoryMB] INT NOT NULL DEFAULT 0,
        [BufferPoolSizeMB] INT NOT NULL DEFAULT 0,
        [MemoryGrantsPending] INT NOT NULL DEFAULT 0,
        [MemoryGrantsActive] INT NOT NULL DEFAULT 0,
        [PLETarget] INT NOT NULL DEFAULT 0,
        [MemoryPressure] BIT NOT NULL DEFAULT 0,
        
        -- Índices
        INDEX IX_InstanceHealth_Memoria_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Memoria_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Memoria creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Memoria ya existe';
GO

-- ===========================================
-- CATEGORÍA 9: CONFIGURACIÓN & TEMPDB (10 pts)
-- ===========================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas de TempDB
        [TempDBFileCount] INT NOT NULL DEFAULT 0,
        [TempDBAllSameSize] BIT NOT NULL DEFAULT 0,
        [TempDBAllSameGrowth] BIT NOT NULL DEFAULT 0,
        [TempDBAvgLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0,
        [TempDBPageLatchWaits] INT NOT NULL DEFAULT 0,
        [TempDBContentionScore] INT NOT NULL DEFAULT 100,
        
        -- Métricas de Configuración
        [MaxServerMemoryMB] INT NOT NULL DEFAULT 0,
        [TotalPhysicalMemoryMB] INT NOT NULL DEFAULT 0,
        [MaxMemoryPctOfPhysical] DECIMAL(5,2) NOT NULL DEFAULT 0,
        [MaxMemoryWithinOptimal] BIT NOT NULL DEFAULT 0,
        [CPUCount] INT NOT NULL DEFAULT 0,
        [ConfigDetails] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_ConfiguracionTempdb_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_ConfiguracionTempdb_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_ConfiguracionTempdb creada (10 pts)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_ConfiguracionTempdb ya existe';
GO

PRINT '';
GO

-- =====================================================
-- 2. MODIFICAR TABLAS EXISTENTES
-- =====================================================

PRINT '♻️  Paso 2: Modificando tablas existentes...';
PRINT '';
GO

-- TABLA: InstanceHealth_Maintenance
-- Eliminar columnas de errores (ahora en tabla separada)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND name = 'Severity20PlusCount')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Maintenance] DROP COLUMN [Severity20PlusCount];
    PRINT '✅ Columna Severity20PlusCount eliminada de InstanceHealth_Maintenance';
END
ELSE
    PRINT '⚠️  Columna Severity20PlusCount no existe';
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND name = 'ErrorlogDetails')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Maintenance] DROP COLUMN [ErrorlogDetails];
    PRINT '✅ Columna ErrorlogDetails eliminada de InstanceHealth_Maintenance';
END
ELSE
    PRINT '⚠️  Columna ErrorlogDetails no existe';
GO

-- TABLA: InstanceHealth_Critical_Availability (antigua, deprecada)
-- Se reemplaza por Conectividad y AlwaysOn
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Critical_Availability]') AND type in (N'U'))
BEGIN
    EXEC sp_rename 'dbo.InstanceHealth_Critical_Availability', 'InstanceHealth_Critical_Availability_OLD';
    PRINT '⚠️  Tabla InstanceHealth_Critical_Availability renombrada a _OLD (deprecada)';
END
ELSE
    PRINT '⚠️  Tabla InstanceHealth_Critical_Availability no existe (ya migrada)';
GO

PRINT '';
GO

-- =====================================================
-- 3. RECONSTRUIR TABLA DE SCORE
-- =====================================================

PRINT '🔄 Paso 3: Reconstruyendo tabla de Score v3.0...';
PRINT '';
GO

-- Eliminar tabla antigua de Score si existe
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Score];
    PRINT '🗑️  Tabla InstanceHealth_Score antigua eliminada';
END
GO

-- Crear tabla de Score v3.0 (10 categorías × 10 pts = 100 pts)
CREATE TABLE [dbo].[InstanceHealth_Score] (
    [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [InstanceName] NVARCHAR(255) NOT NULL,
    [Ambiente] NVARCHAR(50) NULL,
    [HostingSite] NVARCHAR(50) NULL,
    [SqlVersion] NVARCHAR(50) NULL,
    [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Score Total (0-100 puntos)
    [HealthScore] INT NOT NULL,
    
    -- Status (4 colores)
    -- 🟢 Verde: ≥85 pts (Óptimo)
    -- 🟡 Amarillo: 70-84 pts (Advertencia)
    -- 🟠 Naranja: 50-69 pts (Riesgo)
    -- 🔴 Rojo: <50 pts (Crítico)
    [HealthStatus] NVARCHAR(50) NOT NULL,
    
    -- Scores por Categoría (cada uno 0-10 pts)
    [ConectividadScore] INT NOT NULL DEFAULT 0,           -- Cat 1: 10 pts
    [AlwaysOnScore] INT NOT NULL DEFAULT 0,               -- Cat 2: 10 pts
    [BackupsScore] INT NOT NULL DEFAULT 0,                -- Cat 3: 10 pts
    [ErroresCriticosScore] INT NOT NULL DEFAULT 0,        -- Cat 4: 10 pts
    [CPUScore] INT NOT NULL DEFAULT 0,                    -- Cat 5: 10 pts
    [IOScore] INT NOT NULL DEFAULT 0,                     -- Cat 6: 10 pts
    [DiscosScore] INT NOT NULL DEFAULT 0,                 -- Cat 7: 10 pts
    [MemoriaScore] INT NOT NULL DEFAULT 0,                -- Cat 8: 10 pts
    [ConfiguracionTempdbScore] INT NOT NULL DEFAULT 0,    -- Cat 9: 10 pts
    [MantenimientosScore] INT NOT NULL DEFAULT 0,         -- Cat 10: 10 pts
    
    -- Cap Global (si aplica)
    [GlobalCap] INT NOT NULL DEFAULT 100,
    
    -- Índices
    INDEX IX_InstanceHealth_Score_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
    INDEX IX_InstanceHealth_Score_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC),
    INDEX IX_InstanceHealth_Score_HealthScore NONCLUSTERED ([HealthScore] DESC),
    INDEX IX_InstanceHealth_Score_HealthStatus NONCLUSTERED ([HealthStatus])
);
GO

PRINT '✅ Tabla InstanceHealth_Score v3.0 creada';
PRINT '';
GO

-- =====================================================
-- 4. CREAR/ACTUALIZAR VISTAS
-- =====================================================

PRINT '👁️  Paso 4: Creando vistas...';
PRINT '';
GO

-- ===========================================
-- VISTA 1: Latest Health Score por instancia
-- ===========================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_LatestHealthScore')
    DROP VIEW [dbo].[vw_LatestHealthScore];
GO

CREATE VIEW [dbo].[vw_LatestHealthScore]
AS
WITH RankedScores AS (
    SELECT 
        *,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Score]
)
SELECT 
    [InstanceName],
    [Ambiente],
    [HostingSite],
    [SqlVersion],
    [CollectedAtUtc],
    [HealthScore],
    [HealthStatus],
    [ConectividadScore],
    [AlwaysOnScore],
    [BackupsScore],
    [ErroresCriticosScore],
    [CPUScore],
    [IOScore],
    [DiscosScore],
    [MemoriaScore],
    [ConfiguracionTempdbScore],
    [MantenimientosScore],
    [GlobalCap]
FROM RankedScores
WHERE rn = 1;
GO

PRINT '✅ Vista vw_LatestHealthScore creada';
GO

-- ===========================================
-- VISTA 2: Resumen por Ambiente
-- ===========================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_HealthScoreByAmbiente')
    DROP VIEW [dbo].[vw_HealthScoreByAmbiente];
GO

CREATE VIEW [dbo].[vw_HealthScoreByAmbiente]
AS
SELECT 
    Ambiente,
    COUNT(*) AS TotalInstances,
    AVG(CAST(HealthScore AS FLOAT)) AS AvgHealthScore,
    
    -- Contadores por semáforo v3.0
    SUM(CASE WHEN HealthScore >= 85 THEN 1 ELSE 0 END) AS VerdeCount,      -- 🟢 Óptimo
    SUM(CASE WHEN HealthScore >= 70 AND HealthScore < 85 THEN 1 ELSE 0 END) AS AmarilloCount,  -- 🟡 Advertencia
    SUM(CASE WHEN HealthScore >= 50 AND HealthScore < 70 THEN 1 ELSE 0 END) AS NaranjaCount,   -- 🟠 Riesgo
    SUM(CASE WHEN HealthScore < 50 THEN 1 ELSE 0 END) AS RojoCount,        -- 🔴 Crítico
    
    -- Promedios por categoría
    AVG(CAST(ConectividadScore AS FLOAT)) AS AvgConectividadScore,
    AVG(CAST(AlwaysOnScore AS FLOAT)) AS AvgAlwaysOnScore,
    AVG(CAST(BackupsScore AS FLOAT)) AS AvgBackupsScore,
    AVG(CAST(ErroresCriticosScore AS FLOAT)) AS AvgErroresCriticosScore,
    AVG(CAST(CPUScore AS FLOAT)) AS AvgCPUScore,
    AVG(CAST(IOScore AS FLOAT)) AS AvgIOScore,
    AVG(CAST(DiscosScore AS FLOAT)) AS AvgDiscosScore,
    AVG(CAST(MemoriaScore AS FLOAT)) AS AvgMemoriaScore,
    AVG(CAST(ConfiguracionTempdbScore AS FLOAT)) AS AvgConfiguracionTempdbScore,
    AVG(CAST(MantenimientosScore AS FLOAT)) AS AvgMantenimientosScore
FROM [dbo].[vw_LatestHealthScore]
GROUP BY Ambiente;
GO

PRINT '✅ Vista vw_HealthScoreByAmbiente creada';
GO

-- ===========================================
-- VISTA 3: Detalle completo de última métrica
-- ===========================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_HealthScoreDetailComplete')
    DROP VIEW [dbo].[vw_HealthScoreDetailComplete];
GO

CREATE VIEW [dbo].[vw_HealthScoreDetailComplete]
AS
SELECT 
    s.InstanceName,
    s.Ambiente,
    s.HostingSite,
    s.SqlVersion,
    s.CollectedAtUtc,
    s.HealthScore,
    s.HealthStatus,
    
    -- Scores individuales (10 categorías)
    s.ConectividadScore,
    s.AlwaysOnScore,
    s.BackupsScore,
    s.ErroresCriticosScore,
    s.CPUScore,
    s.IOScore,
    s.DiscosScore,
    s.MemoriaScore,
    s.ConfiguracionTempdbScore,
    s.MantenimientosScore,
    
    -- Conectividad
    c.ConnectSuccess,
    c.ConnectLatencyMs,
    c.AuthType,
    
    -- AlwaysOn
    ag.AlwaysOnEnabled,
    ag.AlwaysOnWorstState,
    ag.DatabaseCount AS AGDatabaseCount,
    ag.SynchronizedCount AS AGSyncCount,
    ag.SuspendedCount AS AGSuspendedCount,
    ag.MaxSecondsBehind AS AGMaxSecondsBehind,
    
    -- Backups
    b.FullBackupBreached,
    b.LogBackupBreached,
    b.LastFullBackup,
    b.LastLogBackup,
    
    -- Errores Críticos
    ec.Severity20PlusCount,
    ec.Severity20PlusLast1h,
    ec.MostRecentError,
    
    -- CPU
    cpu.SQLProcessUtilization,
    cpu.P95CPUPercent,
    cpu.RunnableTasks,
    
    -- IO
    io.AvgReadLatencyMs,
    io.AvgWriteLatencyMs,
    io.LogFileAvgWriteMs,
    io.DataFileAvgReadMs,
    
    -- Discos
    d.WorstFreePct,
    d.DataDiskAvgFreePct,
    d.LogDiskAvgFreePct,
    d.TempDBDiskFreePct,
    
    -- Memoria
    m.PageLifeExpectancy,
    m.BufferCacheHitRatio,
    m.MemoryGrantsPending,
    m.MemoryPressure,
    
    -- Configuración / TempDB
    cfg.TempDBFileCount,
    cfg.TempDBAllSameSize,
    cfg.TempDBAllSameGrowth,
    cfg.TempDBContentionScore,
    cfg.MaxServerMemoryMB AS ConfigMaxServerMemoryMB,
    cfg.MaxMemoryWithinOptimal,
    
    -- Mantenimientos
    mnt.LastCheckdb,
    mnt.CheckdbOk,
    mnt.LastIndexOptimize,
    mnt.IndexOptimizeOk
    
FROM [dbo].[vw_LatestHealthScore] s

-- Joins con última métrica de cada categoría
LEFT JOIN (
    SELECT InstanceName, ConnectSuccess, ConnectLatencyMs, AuthType,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Conectividad]
) c ON s.InstanceName = c.InstanceName AND c.rn = 1

LEFT JOIN (
    SELECT InstanceName, AlwaysOnEnabled, AlwaysOnWorstState, DatabaseCount, SynchronizedCount, SuspendedCount, MaxSecondsBehind,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_AlwaysOn]
) ag ON s.InstanceName = ag.InstanceName AND ag.rn = 1

LEFT JOIN (
    SELECT InstanceName, FullBackupBreached, LogBackupBreached, LastFullBackup, LastLogBackup,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Backups]
) b ON s.InstanceName = b.InstanceName AND b.rn = 1

LEFT JOIN (
    SELECT InstanceName, Severity20PlusCount, Severity20PlusLast1h, MostRecentError,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_ErroresCriticos]
) ec ON s.InstanceName = ec.InstanceName AND ec.rn = 1

LEFT JOIN (
    SELECT InstanceName, SQLProcessUtilization, P95CPUPercent, RunnableTasks,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_CPU]
) cpu ON s.InstanceName = cpu.InstanceName AND cpu.rn = 1

LEFT JOIN (
    SELECT InstanceName, AvgReadLatencyMs, AvgWriteLatencyMs, LogFileAvgWriteMs, DataFileAvgReadMs,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_IO]
) io ON s.InstanceName = io.InstanceName AND io.rn = 1

LEFT JOIN (
    SELECT InstanceName, WorstFreePct, DataDiskAvgFreePct, LogDiskAvgFreePct, TempDBDiskFreePct,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Discos]
) d ON s.InstanceName = d.InstanceName AND d.rn = 1

LEFT JOIN (
    SELECT InstanceName, PageLifeExpectancy, BufferCacheHitRatio, MemoryGrantsPending, MemoryPressure,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Memoria]
) m ON s.InstanceName = m.InstanceName AND m.rn = 1

LEFT JOIN (
    SELECT InstanceName, TempDBFileCount, TempDBAllSameSize, TempDBAllSameGrowth, TempDBContentionScore, MaxServerMemoryMB, MaxMemoryWithinOptimal,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_ConfiguracionTempdb]
) cfg ON s.InstanceName = cfg.InstanceName AND cfg.rn = 1

LEFT JOIN (
    SELECT InstanceName, LastCheckdb, CheckdbOk, LastIndexOptimize, IndexOptimizeOk,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Maintenance]
) mnt ON s.InstanceName = mnt.InstanceName AND mnt.rn = 1;
GO

PRINT '✅ Vista vw_HealthScoreDetailComplete creada';
GO

PRINT '';
GO

-- =====================================================
-- 5. RESUMEN FINAL
-- =====================================================

PRINT '';
PRINT '════════════════════════════════════════════════════════';
PRINT '✅ Migración Health Score v3.0 completada exitosamente!';
PRINT '════════════════════════════════════════════════════════';
PRINT '';
PRINT '📊 Resumen de cambios:';
PRINT '   • 8 tablas nuevas creadas (categorías)';
PRINT '   • 1 tabla modificada (Maintenance)';
PRINT '   • 1 tabla deprecada (Critical_Availability)';
PRINT '   • 1 tabla Score reconstruida (v3.0)';
PRINT '   • 3 vistas creadas/actualizadas';
PRINT '';
PRINT '🎯 Próximos pasos:';
PRINT '   1. Ejecutar scripts PowerShell de relevamiento';
PRINT '   2. Ejecutar script Consolidate_v3.ps1';
PRINT '   3. Configurar Schedule-HealthScore-v3.ps1';
PRINT '   4. Verificar datos en vw_LatestHealthScore';
PRINT '';
PRINT '🚦 Sistema de semáforo v3.0:';
PRINT '   🟢 Verde (≥85 pts): Óptimo';
PRINT '   🟡 Amarillo (70-84 pts): Advertencia';
PRINT '   🟠 Naranja (50-69 pts): Riesgo';
PRINT '   🔴 Rojo (<50 pts): Crítico';
PRINT '';
PRINT '💯 Sistema de puntuación:';
PRINT '   10 categorías × 10 puntos = 100 puntos total';
PRINT '';
PRINT '════════════════════════════════════════════════════════';
GO

