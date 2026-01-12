-- =====================================================
-- Tablas de Configuración de Collectors
-- Para migración de collectors PowerShell a .NET Backend
-- Base de datos: AppSQLNova
-- =====================================================

USE [AppSQLNova]
GO

-- =====================================================
-- DROP TABLES (para recrear con nuevo esquema)
-- =====================================================
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorExecutionLog' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP TABLE dbo.CollectorExecutionLog;
    PRINT 'Tabla CollectorExecutionLog eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'SqlVersionQueries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP TABLE dbo.SqlVersionQueries;
    PRINT 'Tabla SqlVersionQueries eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorThresholds' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP TABLE dbo.CollectorThresholds;
    PRINT 'Tabla CollectorThresholds eliminada';
END
GO

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorConfig' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    DROP TABLE dbo.CollectorConfig;
    PRINT 'Tabla CollectorConfig eliminada';
END
GO

PRINT 'Tablas antiguas eliminadas. Creando nuevas...';
GO

-- Tabla principal de configuración de collectors
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorConfig' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.CollectorConfig (
        CollectorName NVARCHAR(50) NOT NULL PRIMARY KEY,
        DisplayName NVARCHAR(100) NOT NULL,
        Description NVARCHAR(500) NULL,
        IsEnabled BIT NOT NULL DEFAULT 1,
        IntervalSeconds INT NOT NULL DEFAULT 300,
        TimeoutSeconds INT NOT NULL DEFAULT 30,
        Weight DECIMAL(5,2) NOT NULL DEFAULT 0,
        ParallelDegree INT NOT NULL DEFAULT 5,
        Category NVARCHAR(50) NOT NULL DEFAULT 'Performance',
        ExecutionOrder INT NOT NULL DEFAULT 0,
        LastExecutionUtc DATETIME2 NULL,
        LastExecutionDurationMs BIGINT NULL,
        LastInstancesProcessed INT NULL,
        LastError NVARCHAR(2000) NULL,
        LastErrorUtc DATETIME2 NULL,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE()
    );
    PRINT 'Tabla CollectorConfig creada';
END
ELSE
    PRINT 'Tabla CollectorConfig ya existe';
GO

-- Tabla de umbrales configurables
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorThresholds' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.CollectorThresholds (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CollectorName NVARCHAR(50) NOT NULL,
        ThresholdName NVARCHAR(100) NOT NULL,
        DisplayName NVARCHAR(100) NOT NULL,
        ThresholdValue DECIMAL(18,4) NOT NULL,
        ThresholdOperator NVARCHAR(10) NOT NULL DEFAULT '>=',
        ResultingScore INT NOT NULL DEFAULT 100,
        ActionType NVARCHAR(20) NOT NULL DEFAULT 'Score',
        Description NVARCHAR(500) NULL,
        DefaultValue DECIMAL(18,4) NOT NULL,
        EvaluationOrder INT NOT NULL DEFAULT 0,
        ThresholdGroup NVARCHAR(50) NULL,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_CollectorThresholds_Config FOREIGN KEY (CollectorName) 
            REFERENCES dbo.CollectorConfig(CollectorName) ON DELETE CASCADE,
        CONSTRAINT UQ_CollectorThresholds_Name UNIQUE (CollectorName, ThresholdName)
    );
    
    CREATE INDEX IX_CollectorThresholds_Collector ON dbo.CollectorThresholds(CollectorName);
    PRINT 'Tabla CollectorThresholds creada';
END
ELSE
    PRINT 'Tabla CollectorThresholds ya existe';
GO

-- Tabla de queries específicas por versión SQL
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SqlVersionQueries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.SqlVersionQueries (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        CollectorName NVARCHAR(50) NOT NULL,
        QueryName NVARCHAR(50) NOT NULL,
        MinSqlVersion INT NOT NULL DEFAULT 9,
        MaxSqlVersion INT NULL,
        QueryTemplate NVARCHAR(MAX) NOT NULL,
        Description NVARCHAR(500) NULL,
        Priority INT NOT NULL DEFAULT 0,
        IsActive BIT NOT NULL DEFAULT 1,
        CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        UpdatedAtUtc DATETIME2 NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_SqlVersionQueries_Config FOREIGN KEY (CollectorName) 
            REFERENCES dbo.CollectorConfig(CollectorName) ON DELETE CASCADE
    );
    
    CREATE INDEX IX_SqlVersionQueries_Collector ON dbo.SqlVersionQueries(CollectorName);
    CREATE INDEX IX_SqlVersionQueries_Version ON dbo.SqlVersionQueries(MinSqlVersion, MaxSqlVersion);
    PRINT 'Tabla SqlVersionQueries creada';
END
ELSE
    PRINT 'Tabla SqlVersionQueries ya existe';
GO

-- Tabla de log de ejecuciones
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'CollectorExecutionLog' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE dbo.CollectorExecutionLog (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        CollectorName NVARCHAR(50) NOT NULL,
        StartedAtUtc DATETIME2 NOT NULL,
        CompletedAtUtc DATETIME2 NULL,
        DurationMs BIGINT NULL,
        Status NVARCHAR(20) NOT NULL DEFAULT 'Running',
        TotalInstances INT NOT NULL DEFAULT 0,
        SuccessCount INT NOT NULL DEFAULT 0,
        ErrorCount INT NOT NULL DEFAULT 0,
        SkippedCount INT NOT NULL DEFAULT 0,
        ErrorMessage NVARCHAR(4000) NULL,
        ErrorStackTrace NVARCHAR(MAX) NULL,
        TriggerType NVARCHAR(20) NOT NULL DEFAULT 'Scheduled',
        TriggeredBy NVARCHAR(100) NULL
    );
    
    CREATE INDEX IX_CollectorExecutionLog_Collector ON dbo.CollectorExecutionLog(CollectorName, StartedAtUtc DESC);
    CREATE INDEX IX_CollectorExecutionLog_Status ON dbo.CollectorExecutionLog(Status, StartedAtUtc DESC);
    PRINT 'Tabla CollectorExecutionLog creada';
END
ELSE
    PRINT 'Tabla CollectorExecutionLog ya existe';
GO

-- =====================================================
-- INSERTAR CONFIGURACIÓN POR DEFECTO DE COLLECTORS
-- =====================================================

-- Limpiar y reinsertar configuración por defecto
DELETE FROM dbo.CollectorConfig WHERE 1=1;
GO

-- Tab 1: Availability & DR (35%) - Intervalos segun ChatGPT
INSERT INTO dbo.CollectorConfig (CollectorName, DisplayName, Description, IsEnabled, IntervalSeconds, TimeoutSeconds, Weight, Category, ExecutionOrder)
VALUES 
    ('Backups', 'Backups', 'Estado de backups FULL y LOG', 1, 900, 60, 18.00, 'Availability', 1),      -- 15m (umbrales en horas)
    ('AlwaysOn', 'AlwaysOn', 'Estado de Availability Groups', 1, 300, 30, 14.00, 'Availability', 2),   -- 5m (deteccion rapida)
    ('DatabaseStates', 'Database States', 'Estados de bases de datos', 1, 300, 15, 3.00, 'Availability', 3); -- 5m (eventos graves)

-- Tab 2: Performance (43%) - Intervalos segun ChatGPT
INSERT INTO dbo.CollectorConfig (CollectorName, DisplayName, Description, IsEnabled, IntervalSeconds, TimeoutSeconds, Weight, Category, ExecutionOrder)
VALUES 
    ('CPU', 'CPU', 'Uso de CPU y runnable tasks', 1, 300, 15, 10.00, 'Performance', 1),                -- 5m (near real-time)
    ('Memoria', 'Memoria', 'Page Life Expectancy y Memory Grants', 1, 300, 15, 8.00, 'Performance', 2), -- 5m (near real-time)
    ('IO', 'IO', 'Latencia de disco e IOPS', 1, 300, 20, 10.00, 'Performance', 3),                     -- 5m (near real-time)
    ('Discos', 'Discos', 'Espacio libre en discos', 1, 900, 30, 7.00, 'Performance', 4),               -- 15m (no cambia rapido)
    ('Waits', 'Wait Statistics', 'Estadisticas de espera y bloqueos', 1, 300, 15, 8.00, 'Performance', 5); -- 5m (signal operativa)

-- Tab 3: Maintenance & Config (22%) - Intervalos segun ChatGPT
INSERT INTO dbo.CollectorConfig (CollectorName, DisplayName, Description, IsEnabled, IntervalSeconds, TimeoutSeconds, Weight, Category, ExecutionOrder)
VALUES 
    ('ErroresCriticos', 'Errores Criticos', 'Errores severity 20+ y blocking', 1, 600, 15, 7.00, 'Maintenance', 1), -- 10m (reducir carga)
    ('Maintenance', 'Mantenimientos', 'CHECKDB e IndexOptimize', 1, 3600, 60, 5.00, 'Maintenance', 2),              -- 60m (cambia lento)
    ('ConfiguracionTempdb', 'Config TempDB', 'Configuracion y contencion de TempDB', 1, 300, 30, 5.00, 'Maintenance', 3), -- 5m (para contention)
    ('Autogrowth', 'Autogrowth', 'Eventos de autogrowth y archivos cerca del limite', 1, 600, 30, 5.00, 'Maintenance', 4); -- 10m (tendencia)

PRINT 'Configuración de collectors insertada';
GO

-- =====================================================
-- INSERTAR UMBRALES POR DEFECTO
-- =====================================================

-- Limpiar umbrales existentes
DELETE FROM dbo.CollectorThresholds WHERE 1=1;
GO

-- CPU Collector Thresholds (ajustado segun ChatGPT: Runnable Tasks >5 warning, >10 critico)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('CPU', 'P95CPU_Optimal', 'P95 CPU Optimo', 80, '<=', 100, 'Score', 'CPU P95 saludable (<=80%)', 80, 1, 'P95CPU'),
    ('CPU', 'P95CPU_Warning', 'P95 CPU Advertencia', 90, '<=', 70, 'Score', 'CPU P95 requiere atencion (81-90%)', 90, 2, 'P95CPU'),
    ('CPU', 'P95CPU_Critical', 'P95 CPU Critico', 90, '>', 40, 'Score', 'CPU P95 critico (>90%)', 90, 3, 'P95CPU'),
    ('CPU', 'RunnableTasks_Cap', 'Runnable Tasks Warning', 5, '>', 70, 'Cap', 'Cola de CPU detectada (>5 tasks), cap a 70', 5, 10, 'Caps'),
    ('CPU', 'RunnableTasks_Critical', 'Runnable Tasks Critico', 10, '>', 50, 'Cap', 'Cola de CPU severa (>10 tasks), cap a 50', 10, 11, 'Caps'),
    ('CPU', 'CXPacket_High', 'CXPacket Alto', 15, '>', 50, 'Cap', 'Problemas de paralelismo, cap a 50', 15, 12, 'Caps');

-- Memoria Collector Thresholds (ajustado segun ChatGPT: agregar cap fuerte si Stolen >50%)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('Memoria', 'PLE_Ratio_Optimal', 'PLE Ratio Optimo', 100, '>=', 100, 'Score', 'PLE >= 100% del target', 100, 1, 'PLE'),
    ('Memoria', 'PLE_Ratio_Good', 'PLE Ratio Bueno', 70, '>=', 80, 'Score', 'PLE 70-99% del target', 70, 2, 'PLE'),
    ('Memoria', 'PLE_Ratio_Warning', 'PLE Ratio Advertencia', 50, '>=', 60, 'Score', 'PLE 50-69% del target', 50, 3, 'PLE'),
    ('Memoria', 'PLE_Ratio_Low', 'PLE Ratio Bajo', 30, '>=', 40, 'Score', 'PLE 30-49% del target', 30, 4, 'PLE'),
    ('Memoria', 'PLE_Ratio_Critical', 'PLE Ratio Critico', 30, '<', 20, 'Score', 'PLE < 30% del target', 30, 5, 'PLE'),
    ('Memoria', 'MemoryGrants_Cap', 'Memory Grants Cap', 10, '>', 60, 'Cap', 'Mas de 10 grants pending, cap a 60', 10, 10, 'Caps'),
    ('Memoria', 'StolenMemory_High', 'Stolen Memory Alto', 30, '>', -30, 'Penalty', 'Mas de 30% stolen memory, -30 pts', 30, 11, 'Caps'),
    ('Memoria', 'StolenMemory_Critical', 'Stolen Memory Critico', 50, '>', 50, 'Cap', 'Mas del 50% stolen memory, cap a 50', 50, 12, 'Caps');

-- IO Collector Thresholds
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('IO', 'Latency_Optimal', 'Latencia Óptima', 5, '<=', 100, 'Score', 'Latencia ≤5ms (SSD/NVMe típico)', 5, 1, 'Latency'),
    ('IO', 'Latency_Good', 'Latencia Buena', 10, '<=', 80, 'Score', 'Latencia 6-10ms', 10, 2, 'Latency'),
    ('IO', 'Latency_Warning', 'Latencia Advertencia', 20, '<=', 60, 'Score', 'Latencia 11-20ms', 20, 3, 'Latency'),
    ('IO', 'Latency_Critical', 'Latencia Crítica', 20, '>', 40, 'Score', 'Latencia >20ms', 20, 4, 'Latency'),
    ('IO', 'LogLatency_Cap', 'Latencia Log Cap', 20, '>', 70, 'Cap', 'Log write latency >20ms, cap a 70', 20, 10, 'Caps');

-- Discos Collector Thresholds
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('Discos', 'FreeSpace_Healthy', 'Espacio Saludable', 20, '>=', 100, 'Score', 'Espacio libre ≥20%', 20, 1, 'FreeSpace'),
    ('Discos', 'FreeSpace_Good', 'Espacio Bueno', 15, '>=', 80, 'Score', 'Espacio libre 15-19%', 15, 2, 'FreeSpace'),
    ('Discos', 'FreeSpace_Warning', 'Espacio Advertencia', 10, '>=', 60, 'Score', 'Espacio libre 10-14%', 10, 3, 'FreeSpace'),
    ('Discos', 'FreeSpace_Low', 'Espacio Bajo', 5, '>=', 40, 'Score', 'Espacio libre 5-9%', 5, 4, 'FreeSpace'),
    ('Discos', 'FreeSpace_Critical', 'Espacio Crítico', 5, '<', 0, 'Score', 'Espacio libre <5%', 5, 5, 'FreeSpace');

-- Backups Collector Thresholds (ajustado segun ChatGPT: Log Chain cap bajado a 40)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('Backups', 'FullBackup_Normal', 'Full Backup Normal', 24, '<=', 100, 'Score', 'Full backup en ultimas 24h', 24, 1, 'FullBackup'),
    ('Backups', 'FullBackup_DWH', 'Full Backup DWH', 168, '<=', 100, 'Score', 'Full backup DWH en ultimos 7 dias', 168, 2, 'FullBackup'),
    ('Backups', 'FullBackup_Breach', 'Full Backup Vencido', 24, '>', 0, 'Score', 'Sin full backup reciente', 24, 3, 'FullBackup'),
    ('Backups', 'LogBackup_Normal', 'Log Backup Normal', 2, '<=', 100, 'Score', 'Log backup en ultimas 2h', 2, 1, 'LogBackup'),
    ('Backups', 'LogBackup_Breach', 'Log Backup Vencido', 2, '>', 0, 'Score', 'Sin log backup reciente', 2, 2, 'LogBackup'),
    ('Backups', 'LogChain_Broken', 'Log Chain Rota', 1, '>=', 40, 'Cap', 'Cadena de log rota, cap global a 40 (ajustado)', 1, 10, 'Caps');

-- AlwaysOn Collector Thresholds (ajustado segun ChatGPT: AG No Sync menos binario, por %)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('AlwaysOn', 'AG_AllSynced', 'AG Todo Sincronizado', 100, '>=', 100, 'Score', 'Todas las DBs sincronizadas', 100, 1, 'AGState'),
    ('AlwaysOn', 'AG_SendQueue', 'AG Send Queue', 100000, '>', -30, 'Penalty', 'Send queue >100MB, -30 pts', 100000, 2, 'AGQueues'),
    ('AlwaysOn', 'AG_RedoQueue', 'AG Redo Queue', 100000, '>', -20, 'Penalty', 'Redo queue >100MB, -20 pts', 100000, 3, 'AGQueues'),
    ('AlwaysOn', 'AG_Suspended', 'AG Suspendido', 0, '>', 60, 'Cap', 'DBs suspendidas, score=0 cap=60', 0, 10, 'AGState'),
    ('AlwaysOn', 'AG_NotSynced', 'AG Parcialmente Sync', 80, '<', 80, 'Cap', 'Mas del 20% DBs no sync (async DR tolerado), cap a 80', 80, 11, 'AGState'),
    ('AlwaysOn', 'AG_MostlyNotSynced', 'AG Mayoria No Sync', 50, '<', 60, 'Cap', 'Mas del 50% DBs no sync, cap a 60', 50, 12, 'AGState');

-- DatabaseStates Collector Thresholds
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('DatabaseStates', 'Suspect_Any', 'DB Suspect', 0, '>', 0, 'Cap', 'DBs en estado Suspect, cap=0', 0, 1, 'Critical'),
    ('DatabaseStates', 'Emergency_Any', 'DB Emergency', 0, '>', 0, 'Cap', 'DBs en estado Emergency, cap=0', 0, 2, 'Critical'),
    ('DatabaseStates', 'Offline_Any', 'DB Offline', 0, '>', 50, 'Cap', 'DBs offline, score=0 cap=50', 0, 3, 'States'),
    ('DatabaseStates', 'SuspectPages', 'Páginas Suspect', 0, '>', 50, 'Cap', 'Páginas corruptas, score=40 cap=50', 0, 4, 'States'),
    ('DatabaseStates', 'RecoveryPending', 'Recovery Pending', 0, '>', 40, 'Score', 'DBs en recovery pending', 0, 5, 'States');

-- ErroresCriticos Collector Thresholds
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('ErroresCriticos', 'Errors_None', 'Sin Errores', 0, '=', 100, 'Score', 'Sin errores severity 20+', 0, 1, 'Errors'),
    ('ErroresCriticos', 'Errors_Penalty', 'Penalización Error', 1, '>=', -10, 'Penalty', '-10 pts por cada error (min 60)', 1, 2, 'Errors'),
    ('ErroresCriticos', 'Errors_Recent', 'Error Reciente', 0, '>', 70, 'Cap', 'Error en última hora, cap a 70', 0, 3, 'Errors'),
    ('ErroresCriticos', 'Blocking_Severe', 'Blocking Severo', 10, '>', 60, 'Cap', '>10 sesiones o >30s, score=40 cap=60', 10, 10, 'Blocking'),
    ('ErroresCriticos', 'Blocking_Moderate', 'Blocking Moderado', 5, '>', 80, 'Cap', '5-10 sesiones, score=60 cap=80', 5, 11, 'Blocking');

-- Maintenance Collector Thresholds
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('Maintenance', 'Checkdb_Fresh', 'CHECKDB Reciente', 7, '<=', 100, 'Score', 'CHECKDB en últimos 7 días', 7, 1, 'Checkdb'),
    ('Maintenance', 'Checkdb_Good', 'CHECKDB Aceptable', 14, '<=', 80, 'Score', 'CHECKDB en últimos 14 días', 14, 2, 'Checkdb'),
    ('Maintenance', 'Checkdb_Stale', 'CHECKDB Atrasado', 30, '<=', 50, 'Score', 'CHECKDB en últimos 30 días', 30, 3, 'Checkdb'),
    ('Maintenance', 'Checkdb_Critical', 'CHECKDB Crítico', 30, '>', 0, 'Score', 'Sin CHECKDB en >30 días', 30, 4, 'Checkdb');

-- ConfiguracionTempdb Collector Thresholds (ajustado segun ChatGPT: Write latency >30ms para SSD)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('ConfiguracionTempdb', 'TempDB_FilesPerCPU', 'Files por CPU', 1, '>=', 20, 'Score', '1 file por CPU (hasta 8)', 1, 1, 'Config'),
    ('ConfiguracionTempdb', 'TempDB_SameSize', 'Mismo Tamano', 1, '=', 10, 'Score', 'Archivos del mismo tamano', 1, 2, 'Config'),
    ('ConfiguracionTempdb', 'TempDB_WriteLatency', 'Latencia Escritura TempDB', 30, '>', -40, 'Penalty', 'Write latency >30ms (ajustado para SSD/NVMe), -40 pts', 30, 3, 'Latency'),
    ('ConfiguracionTempdb', 'TempDB_Contention', 'Contencion', 5, '>', -30, 'Penalty', 'Contencion >5%, -30 pts', 5, 4, 'Contention'),
    ('ConfiguracionTempdb', 'MaxMemory_Optimal', 'Max Memory Optimo', 70, '>=', 40, 'Score', 'Max memory 70-95% de RAM', 70, 10, 'Memory');

-- Autogrowth Collector Thresholds (ajustado segun ChatGPT: >85% warning, >95% score 0)
INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
VALUES
    ('Autogrowth', 'Autogrowth_Low', 'Autogrowth Bajo', 10, '<=', 100, 'Score', '<=10 eventos en 24h', 10, 1, 'Events'),
    ('Autogrowth', 'Autogrowth_Moderate', 'Autogrowth Moderado', 50, '<=', 80, 'Score', '11-50 eventos en 24h', 50, 2, 'Events'),
    ('Autogrowth', 'Autogrowth_High', 'Autogrowth Alto', 100, '<=', 60, 'Score', '51-100 eventos en 24h', 100, 3, 'Events'),
    ('Autogrowth', 'Autogrowth_Excessive', 'Autogrowth Excesivo', 100, '>', 40, 'Score', '>100 eventos en 24h', 100, 4, 'Events'),
    ('Autogrowth', 'FilesNearLimit_Any', 'Archivos Cerca Limite', 0, '>', -30, 'Penalty', 'Archivos cerca del maximo', 0, 10, 'Limits'),
    ('Autogrowth', 'FilesNearLimit_Warning', 'Archivos Cerca Limite Warning', 85, '>', 60, 'Cap', '85-95% del limite, cap a 60', 85, 11, 'Limits'),
    ('Autogrowth', 'FilesAtLimit', 'Archivos al Limite Critico', 95, '>', 30, 'Cap', '>95% del limite = score 0, cap a 30 (critico)', 95, 12, 'Limits');

PRINT 'Umbrales por defecto insertados';
GO

-- Verificar datos insertados
SELECT 'CollectorConfig' AS Tabla, COUNT(*) AS Registros FROM dbo.CollectorConfig
UNION ALL
SELECT 'CollectorThresholds', COUNT(*) FROM dbo.CollectorThresholds
UNION ALL
SELECT 'SqlVersionQueries', COUNT(*) FROM dbo.SqlVersionQueries;
GO

