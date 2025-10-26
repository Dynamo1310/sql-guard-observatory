/*
================================================================================
Health Score v3.0 FINAL - 12 Categorías Balanceadas
================================================================================

TAB 1: AVAILABILITY & DR (40%)
1. Backups (18%)
2. AlwaysOn (14%)
3. Log Chain Integrity (5%)
4. Database States (3%)

TAB 2: PERFORMANCE (35%)
5. CPU (10%)
6. Memoria (8%)
7. I/O (10%)
8. Discos (7%)

TAB 3: MAINTENANCE & CONFIG (25%)
9. Errores Críticos (7%)
10. Mantenimientos (5%)
11. Configuración & TempDB (8%)
12. Autogrowth & Capacity (5%)

SEMÁFORO:
- Healthy (85-100): Optimal performance
- Warning (70-84): Requires attention
- Risk (50-69): Action required
- Critical (<50): Immediate action

================================================================================
*/

PRINT '=== INICIANDO MIGRACIÓN: Health Score v3.0 FINAL (12 CATEGORÍAS) ===';

-- =============================================
-- 1. NUEVAS TABLAS
-- =============================================

-- Tabla: InstanceHealth_LogChain
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_LogChain]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_LogChain] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(100) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas
        [BrokenChainCount] INT NOT NULL DEFAULT 0,
        [FullDBsWithoutLogBackup] INT NOT NULL DEFAULT 0,
        [MaxHoursSinceLogBackup] INT NOT NULL DEFAULT 0,
        [LogChainDetails] NVARCHAR(MAX) NULL,  -- JSON
        
        INDEX IX_InstanceHealth_LogChain_InstanceName_CollectedAtUtc 
            NONCLUSTERED ([InstanceName] ASC, [CollectedAtUtc] DESC)
    );
    PRINT '✓ Tabla InstanceHealth_LogChain creada';
END
ELSE
    PRINT '• Tabla InstanceHealth_LogChain ya existe';

-- Tabla: InstanceHealth_DatabaseStates
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_DatabaseStates]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_DatabaseStates] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(100) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas
        [OfflineCount] INT NOT NULL DEFAULT 0,
        [SuspectCount] INT NOT NULL DEFAULT 0,
        [EmergencyCount] INT NOT NULL DEFAULT 0,
        [RecoveryPendingCount] INT NOT NULL DEFAULT 0,
        [SingleUserCount] INT NOT NULL DEFAULT 0,
        [RestoringCount] INT NOT NULL DEFAULT 0,
        [SuspectPageCount] INT NOT NULL DEFAULT 0,
        [DatabaseStateDetails] NVARCHAR(MAX) NULL,  -- JSON
        
        INDEX IX_InstanceHealth_DatabaseStates_InstanceName_CollectedAtUtc 
            NONCLUSTERED ([InstanceName] ASC, [CollectedAtUtc] DESC)
    );
    PRINT '✓ Tabla InstanceHealth_DatabaseStates creada';
END
ELSE
    PRINT '• Tabla InstanceHealth_DatabaseStates ya existe';

-- Tabla: InstanceHealth_Autogrowth
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Autogrowth]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[InstanceHealth_Autogrowth] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [InstanceName] NVARCHAR(255) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [SqlVersion] NVARCHAR(100) NULL,
        [CollectedAtUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- Métricas
        [AutogrowthEventsLast24h] INT NOT NULL DEFAULT 0,
        [FilesNearLimit] INT NOT NULL DEFAULT 0,
        [FilesWithBadGrowth] INT NOT NULL DEFAULT 0,
        [WorstPercentOfMax] DECIMAL(5,2) NOT NULL DEFAULT 0,
        [AutogrowthDetails] NVARCHAR(MAX) NULL,  -- JSON
        
        INDEX IX_InstanceHealth_Autogrowth_InstanceName_CollectedAtUtc 
            NONCLUSTERED ([InstanceName] ASC, [CollectedAtUtc] DESC)
    );
    PRINT '✓ Tabla InstanceHealth_Autogrowth creada';
END
ELSE
    PRINT '• Tabla InstanceHealth_Autogrowth ya existe';

-- =============================================
-- 2. ACTUALIZAR TABLA InstanceHealth_Score
-- =============================================

PRINT '';
PRINT '=== ACTUALIZANDO TABLA InstanceHealth_Score ===';

-- Eliminar columnas viejas si existen (Conectividad)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'ConectividadScore')
BEGIN
    -- Primero eliminar default constraints si existen
    DECLARE @sqlDrop NVARCHAR(MAX) = '';
    
    SELECT @sqlDrop = @sqlDrop + 'ALTER TABLE [dbo].[InstanceHealth_Score] DROP CONSTRAINT ' + QUOTENAME(dc.name) + ';' + CHAR(13)
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
    WHERE c.object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]')
      AND c.name IN ('ConectividadScore', 'ConectividadContribution');
    
    IF LEN(@sqlDrop) > 0
    BEGIN
        EXEC sp_executesql @sqlDrop;
    END
    
    -- Ahora eliminar las columnas
    ALTER TABLE [dbo].[InstanceHealth_Score] DROP COLUMN ConectividadScore;
    ALTER TABLE [dbo].[InstanceHealth_Score] DROP COLUMN ConectividadContribution;
    
    PRINT '✓ Columnas de Conectividad eliminadas';
END

-- Agregar nuevas columnas de Score (0-100)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'LogChainScore')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [LogChainScore] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna LogChainScore agregada';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'DatabaseStatesScore')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [DatabaseStatesScore] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna DatabaseStatesScore agregada';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'AutogrowthScore')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [AutogrowthScore] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna AutogrowthScore agregada';
END

-- Agregar nuevas columnas de Contribution (INT)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'LogChainContribution')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [LogChainContribution] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna LogChainContribution agregada';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'DatabaseStatesContribution')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [DatabaseStatesContribution] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna DatabaseStatesContribution agregada';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'AutogrowthContribution')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD [AutogrowthContribution] INT NOT NULL DEFAULT 0;
    PRINT '✓ Columna AutogrowthContribution agregada';
END

-- =============================================
-- 3. VISTA: vw_HealthScoreByAmbiente
-- =============================================

PRINT '';
PRINT '=== RECREANDO VISTA vw_HealthScoreByAmbiente ===';

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_HealthScoreByAmbiente]'))
    DROP VIEW [dbo].[vw_HealthScoreByAmbiente];

GO

CREATE VIEW [dbo].[vw_HealthScoreByAmbiente]
AS
WITH LatestScores AS (
    SELECT 
        InstanceName,
        Ambiente,
        HealthScore,
        HealthStatus,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Score
)
SELECT 
    Ambiente,
    COUNT(*) AS TotalInstances,
    SUM(CASE WHEN HealthStatus = 'Healthy' THEN 1 ELSE 0 END) AS HealthyCount,
    SUM(CASE WHEN HealthStatus = 'Warning' THEN 1 ELSE 0 END) AS WarningCount,
    SUM(CASE WHEN HealthStatus = 'Risk' THEN 1 ELSE 0 END) AS RiskCount,
    SUM(CASE WHEN HealthStatus = 'Critical' THEN 1 ELSE 0 END) AS CriticalCount,
    AVG(CAST(HealthScore AS DECIMAL(5,2))) AS AvgHealthScore
FROM LatestScores
WHERE rn = 1
GROUP BY Ambiente;

GO

PRINT '✓ Vista vw_HealthScoreByAmbiente recreada';

-- =============================================
-- 4. RESUMEN FINAL
-- =============================================

PRINT '';
PRINT '==============================================================';
PRINT ' MIGRACIÓN COMPLETADA: Health Score v3.0 FINAL';
PRINT '==============================================================';
PRINT '';
PRINT ' 12 CATEGORÍAS BALANCEADAS:';
PRINT '';
PRINT ' TAB 1: AVAILABILITY & DR (40%)';
PRINT '   1. Backups (18%)';
PRINT '   2. AlwaysOn (14%)';
PRINT '   3. Log Chain (5%)';
PRINT '   4. Database States (3%)';
PRINT '';
PRINT ' TAB 2: PERFORMANCE (35%)';
PRINT '   5. CPU (10%)';
PRINT '   6. Memoria (8%)';
PRINT '   7. I/O (10%)';
PRINT '   8. Discos (7%)';
PRINT '';
PRINT ' TAB 3: MAINTENANCE & CONFIG (25%)';
PRINT '   9. Errores Críticos (7%)';
PRINT '  10. Mantenimientos (5%)';
PRINT '  11. Config & TempDB (8%)';
PRINT '  12. Autogrowth (5%)';
PRINT '';
PRINT ' SEMÁFORO:';
PRINT '   Healthy (>=85)   - Optimal performance';
PRINT '   Warning (70-84)  - Requires attention';
PRINT '   Risk (50-69)     - Action required';
PRINT '   Critical (<50)   - Immediate action';
PRINT '';
PRINT '==============================================================';
PRINT '';
PRINT '✅ Migración completada exitosamente!';
PRINT '';

-- Verificar estructura de InstanceHealth_Score
PRINT 'Columnas actuales en InstanceHealth_Score:';
SELECT 
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length AS MaxLength,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]')
ORDER BY c.column_id;

