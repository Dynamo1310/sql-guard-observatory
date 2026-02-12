-- =============================================
-- Script: AddAGHealthToOverviewCache.sql
-- Descripción: Reemplaza CriticalInstancesJson por AGHealthStatusesJson
--              en OverviewSummaryCache para mostrar el estado de AlwaysOn
--              en el Overview en lugar de instancias críticas.
-- Fecha: 2026-02-11
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- ============================================================================
-- 1. Agregar columna AGHealthStatusesJson a OverviewSummaryCache
-- ============================================================================
PRINT 'Agregando columna AGHealthStatusesJson a OverviewSummaryCache...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.OverviewSummaryCache') AND name = 'AGHealthStatusesJson')
BEGIN
    ALTER TABLE dbo.OverviewSummaryCache ADD AGHealthStatusesJson NVARCHAR(MAX) NULL;
    PRINT '   - Columna AGHealthStatusesJson agregada';
END
ELSE
BEGIN
    PRINT '   - Columna AGHealthStatusesJson ya existe';
END
GO

-- ============================================================================
-- 2. Agregar columna AGUnhealthyCount a OverviewSummaryCache
-- ============================================================================
PRINT 'Agregando columna AGUnhealthyCount a OverviewSummaryCache...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.OverviewSummaryCache') AND name = 'AGUnhealthyCount')
BEGIN
    ALTER TABLE dbo.OverviewSummaryCache ADD AGUnhealthyCount INT NOT NULL DEFAULT 0;
    PRINT '   - Columna AGUnhealthyCount agregada';
END
ELSE
BEGIN
    PRINT '   - Columna AGUnhealthyCount ya existe';
END
GO

-- ============================================================================
-- 3. Migrar datos de CriticalInstancesJson (si existe) y eliminar columna vieja
-- ============================================================================
PRINT '';
PRINT 'Limpiando columna CriticalInstancesJson obsoleta...';

IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.OverviewSummaryCache') AND name = 'CriticalInstancesJson')
BEGIN
    ALTER TABLE dbo.OverviewSummaryCache DROP COLUMN CriticalInstancesJson;
    PRINT '   - Columna CriticalInstancesJson eliminada';
END
ELSE
BEGIN
    PRINT '   - Columna CriticalInstancesJson ya no existe';
END
GO

-- ============================================================================
-- 4. Agregar columna AGName a InstanceHealth_AlwaysOn
-- ============================================================================
PRINT '';
PRINT 'Agregando columna AGName a InstanceHealth_AlwaysOn...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'AGName')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD AGName NVARCHAR(255) NULL;
    PRINT '   - Columna AGName agregada';
END
ELSE
BEGIN
    PRINT '   - Columna AGName ya existe';
END
GO

-- ============================================================================
-- 5. Crear índice para optimizar consultas de agrupación por AG
-- ============================================================================
PRINT 'Creando índice para AGName en InstanceHealth_AlwaysOn...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InstanceHealth_AlwaysOn_AGName' AND object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_InstanceHealth_AlwaysOn_AGName
    ON dbo.InstanceHealth_AlwaysOn (AGName)
    WHERE AGName IS NOT NULL;
    PRINT '   - Índice IX_InstanceHealth_AlwaysOn_AGName creado';
END
ELSE
BEGIN
    PRINT '   - Índice ya existe';
END
GO

PRINT '';
PRINT 'Script completado: AGHealthStatusesJson, AGUnhealthyCount en OverviewSummaryCache + AGName en InstanceHealth_AlwaysOn';
GO
