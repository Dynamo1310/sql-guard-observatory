-- =====================================================
-- Health Score v3.0 - Migración de Tablas
-- 10 Categorías (100 puntos)
-- =====================================================

-- =====================================================
-- 1. CREAR NUEVAS TABLAS
-- =====================================================

-- CATEGORÍA 3: CONECTIVIDAD (10%)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Conectividad]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Conectividad] (
        [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(50) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas
        [ConnectSuccess] BIT NOT NULL,
        [ConnectLatencyMs] INT NOT NULL,
        [AuthType] NVARCHAR(50) NULL,
        [LoginFailuresLast1h] INT NOT NULL DEFAULT 0,
        [ErrorMessage] NVARCHAR(MAX) NULL,
        
        -- Índices
        INDEX IX_InstanceHealth_Conectividad_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Conectividad_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Conectividad creada';
END
GO

-- CATEGORÍA 2: ALWAYSON (14%)
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
        
        INDEX IX_InstanceHealth_AlwaysOn_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_AlwaysOn_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_AlwaysOn creada';
END
GO

-- CATEGORÍA 4: ERRORES CRÍTICOS (7%)
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
        
        INDEX IX_InstanceHealth_ErroresCriticos_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_ErroresCriticos_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_ErroresCriticos creada';
END
GO

-- CATEGORÍA 5: CPU (10%)
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
        
        INDEX IX_InstanceHealth_CPU_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_CPU_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_CPU creada';
END
GO

-- CATEGORÍA 6: IO (10%)
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
        
        INDEX IX_InstanceHealth_IO_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_IO_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_IO creada';
END
GO

-- CATEGORÍA 7: DISCOS (8%)
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
        
        INDEX IX_InstanceHealth_Discos_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Discos_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Discos creada';
END
GO

-- CATEGORÍA 8: MEMORIA (7%)
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
        
        INDEX IX_InstanceHealth_Memoria_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_Memoria_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_Memoria creada';
END
GO

-- CATEGORÍA 10: CONFIGURACIÓN & TEMPDB (10%)
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
        
        INDEX IX_InstanceHealth_ConfiguracionTempdb_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
        INDEX IX_InstanceHealth_ConfiguracionTempdb_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC)
    );
    PRINT '✅ Tabla InstanceHealth_ConfiguracionTempdb creada';
END
GO

-- =====================================================
-- 2. MODIFICAR TABLAS EXISTENTES
-- =====================================================

-- TABLA: InstanceHealth_Maintenance
-- Eliminar columnas de errores (ahora en tabla separada)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND name = 'Severity20PlusCount')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Maintenance] DROP COLUMN [Severity20PlusCount];
    PRINT '✅ Columna Severity20PlusCount eliminada de InstanceHealth_Maintenance';
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Maintenance]') AND name = 'ErrorlogDetails')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Maintenance] DROP COLUMN [ErrorlogDetails];
    PRINT '✅ Columna ErrorlogDetails eliminada de InstanceHealth_Maintenance';
END
GO

-- TABLA: InstanceHealth_Critical_Availability (antigua, ya no se usa)
-- Se reemplaza por Conectividad y AlwaysOn
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Critical_Availability]') AND type in (N'U'))
BEGIN
    -- Opcionalmente renombrar o archivar
    EXEC sp_rename 'dbo.InstanceHealth_Critical_Availability', 'InstanceHealth_Critical_Availability_OLD';
    PRINT '⚠️  Tabla InstanceHealth_Critical_Availability renombrada a _OLD (deprecada)';
END
GO

-- =====================================================
-- 3. ACTUALIZAR TABLA DE SCORE
-- =====================================================

-- Eliminar tabla antigua de Score si existe
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND type in (N'U'))
BEGIN
    DROP TABLE [dbo].[InstanceHealth_Score];
    PRINT '🗑️  Tabla InstanceHealth_Score antigua eliminada';
END
GO

-- Crear tabla de Score v3.0 (10 categorías, 100 puntos)
CREATE TABLE [dbo].[InstanceHealth_Score] (
    [Id] BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    [InstanceName] NVARCHAR(255) NOT NULL,
    [Ambiente] NVARCHAR(50) NULL,
    [HostingSite] NVARCHAR(50) NULL,
    [SqlVersion] NVARCHAR(50) NULL,
    [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    
    -- Score Total (100 puntos)
    [HealthScore] INT NOT NULL,
    [HealthStatus] NVARCHAR(50) NOT NULL,  -- 🟢 Óptimo, 🟡 Advertencia, 🟠 Riesgo, 🔴 Crítico
    
    -- Scores por Categoría (cada uno sobre 100)
    [BackupsScore] INT NOT NULL DEFAULT 0,                  -- 18%
    [AlwaysOnScore] INT NOT NULL DEFAULT 0,                 -- 14%
    [ConectividadScore] INT NOT NULL DEFAULT 0,             -- 10%
    [ErroresCriticosScore] INT NOT NULL DEFAULT 0,          -- 7%
    [CPUScore] INT NOT NULL DEFAULT 0,                      -- 10%
    [IOScore] INT NOT NULL DEFAULT 0,                       -- 10%
    [DiscosScore] INT NOT NULL DEFAULT 0,                   -- 8%
    [MemoriaScore] INT NOT NULL DEFAULT 0,                  -- 7%
    [MantenimientosScore] INT NOT NULL DEFAULT 0,           -- 6%
    [ConfiguracionTempdbScore] INT NOT NULL DEFAULT 0,      -- 10%
    
    -- Cap Global
    [GlobalCap] INT NOT NULL DEFAULT 100,
    
    -- Índices
    INDEX IX_InstanceHealth_Score_Instance NONCLUSTERED ([InstanceName], [CollectedAtUtc] DESC),
    INDEX IX_InstanceHealth_Score_CollectedAt NONCLUSTERED ([CollectedAtUtc] DESC),
    INDEX IX_InstanceHealth_Score_HealthScore NONCLUSTERED ([HealthScore] DESC)
);
GO

PRINT '✅ Tabla InstanceHealth_Score v3.0 creada';
GO

-- =====================================================
-- 4. CREAR/ACTUALIZAR VISTAS
-- =====================================================

-- Vista: Latest Health Score por instancia
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
    [BackupsScore],
    [AlwaysOnScore],
    [ConectividadScore],
    [ErroresCriticosScore],
    [CPUScore],
    [IOScore],
    [DiscosScore],
    [MemoriaScore],
    [MantenimientosScore],
    [ConfiguracionTempdbScore],
    [GlobalCap]
FROM RankedScores
WHERE rn = 1;
GO

PRINT '✅ Vista vw_LatestHealthScore creada';
GO

-- Vista: Resumen por Ambiente
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_HealthScoreByAmbiente')
    DROP VIEW [dbo].[vw_HealthScoreByAmbiente];
GO

CREATE VIEW [dbo].[vw_HealthScoreByAmbiente]
AS
SELECT 
    Ambiente,
    COUNT(*) AS TotalInstances,
    AVG(CAST(HealthScore AS FLOAT)) AS AvgHealthScore,
    SUM(CASE WHEN HealthScore >= 85 THEN 1 ELSE 0 END) AS OptimoCount,
    SUM(CASE WHEN HealthScore >= 75 AND HealthScore < 85 THEN 1 ELSE 0 END) AS AdvertenciaCount,
    SUM(CASE WHEN HealthScore >= 65 AND HealthScore < 75 THEN 1 ELSE 0 END) AS RiesgoCount,
    SUM(CASE WHEN HealthScore < 65 THEN 1 ELSE 0 END) AS CriticoCount,
    -- Promedios por categoría
    AVG(CAST(BackupsScore AS FLOAT)) AS AvgBackupsScore,
    AVG(CAST(AlwaysOnScore AS FLOAT)) AS AvgAlwaysOnScore,
    AVG(CAST(ConectividadScore AS FLOAT)) AS AvgConectividadScore,
    AVG(CAST(CPUScore AS FLOAT)) AS AvgCPUScore,
    AVG(CAST(IOScore AS FLOAT)) AS AvgIOScore,
    AVG(CAST(DiscosScore AS FLOAT)) AS AvgDiscosScore
FROM [dbo].[vw_LatestHealthScore]
GROUP BY Ambiente;
GO

PRINT '✅ Vista vw_HealthScoreByAmbiente creada';
GO

-- Vista: Detalle completo de última métrica
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
    
    -- Scores individuales
    s.BackupsScore,
    s.AlwaysOnScore,
    s.ConectividadScore,
    s.ErroresCriticosScore,
    s.CPUScore,
    s.IOScore,
    s.DiscosScore,
    s.MemoriaScore,
    s.MantenimientosScore,
    s.ConfiguracionTempdbScore,
    
    -- Backups
    b.FullBackupBreached,
    b.LogBackupBreached,
    b.LastFullBackup,
    b.LastLogBackup,
    
    -- Conectividad
    c.ConnectSuccess,
    c.ConnectLatencyMs,
    
    -- AlwaysOn
    ag.AlwaysOnEnabled,
    ag.AlwaysOnWorstState,
    ag.DatabaseCount AS AGDatabaseCount,
    ag.SynchronizedCount AS AGSyncCount,
    
    -- CPU
    cpu.P95CPUPercent,
    cpu.RunnableTasks,
    
    -- IO
    io.LogFileAvgWriteMs,
    
    -- Discos
    d.WorstFreePct,
    d.DataDiskAvgFreePct,
    d.LogDiskAvgFreePct,
    
    -- Memoria
    m.PageLifeExpectancy,
    m.MemoryGrantsPending,
    
    -- Mantenimientos
    mnt.LastCheckdb,
    mnt.CheckdbOk,
    
    -- Config/TempDB
    cfg.TempDBFileCount,
    cfg.TempDBContentionScore
    
FROM [dbo].[vw_LatestHealthScore] s
LEFT JOIN (
    SELECT InstanceName, FullBackupBreached, LogBackupBreached, LastFullBackup, LastLogBackup,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Backups]
) b ON s.InstanceName = b.InstanceName AND b.rn = 1
LEFT JOIN (
    SELECT InstanceName, ConnectSuccess, ConnectLatencyMs,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Conectividad]
) c ON s.InstanceName = c.InstanceName AND c.rn = 1
LEFT JOIN (
    SELECT InstanceName, AlwaysOnEnabled, AlwaysOnWorstState, DatabaseCount, SynchronizedCount,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_AlwaysOn]
) ag ON s.InstanceName = ag.InstanceName AND ag.rn = 1
LEFT JOIN (
    SELECT InstanceName, P95CPUPercent, RunnableTasks,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_CPU]
) cpu ON s.InstanceName = cpu.InstanceName AND cpu.rn = 1
LEFT JOIN (
    SELECT InstanceName, LogFileAvgWriteMs,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_IO]
) io ON s.InstanceName = io.InstanceName AND io.rn = 1
LEFT JOIN (
    SELECT InstanceName, WorstFreePct, DataDiskAvgFreePct, LogDiskAvgFreePct,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Discos]
) d ON s.InstanceName = d.InstanceName AND d.rn = 1
LEFT JOIN (
    SELECT InstanceName, PageLifeExpectancy, MemoryGrantsPending,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Memoria]
) m ON s.InstanceName = m.InstanceName AND m.rn = 1
LEFT JOIN (
    SELECT InstanceName, LastCheckdb, CheckdbOk,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_Maintenance]
) mnt ON s.InstanceName = mnt.InstanceName AND mnt.rn = 1
LEFT JOIN (
    SELECT InstanceName, TempDBFileCount, TempDBContentionScore,
           ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM [dbo].[InstanceHealth_ConfiguracionTempdb]
) cfg ON s.InstanceName = cfg.InstanceName AND cfg.rn = 1;
GO

PRINT '✅ Vista vw_HealthScoreDetailComplete creada';
GO

-- =====================================================
-- 5. PERMISOS (si es necesario)
-- =====================================================

-- Dar permisos de lectura a las nuevas tablas
-- GRANT SELECT ON [dbo].[InstanceHealth_Conectividad] TO [TuUsuarioAPI];
-- GRANT SELECT ON [dbo].[InstanceHealth_AlwaysOn] TO [TuUsuarioAPI];
-- ... etc

PRINT '';
PRINT '════════════════════════════════════════════════════════';
PRINT '✅ Migración Health Score v3.0 completada exitosamente!';
PRINT '════════════════════════════════════════════════════════';
PRINT '';
PRINT '📊 Tablas nuevas creadas: 8';
PRINT '♻️  Tablas modificadas: 1';
PRINT '🔄 Tabla Score reconstruida';
PRINT '👁️  Vistas creadas/actualizadas: 3';
PRINT '';
GO

