-- =============================================
-- Script: AddDatabaseStatesToOverviewCache.sql
-- Descripción: Agrega la columna DatabaseStatesJson a OverviewSummaryCache
--              para persistir la lista de bases en estado anormal que se
--              muestra en la card "Estados de Bases" del Overview.
-- Fecha: 2026-06-11
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- ============================================================================
-- Agregar columna DatabaseStatesJson a OverviewSummaryCache
-- ============================================================================
PRINT 'Agregando columna DatabaseStatesJson a OverviewSummaryCache...';

IF NOT EXISTS (SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.OverviewSummaryCache') AND name = 'DatabaseStatesJson')
BEGIN
    ALTER TABLE dbo.OverviewSummaryCache ADD DatabaseStatesJson NVARCHAR(MAX) NULL;
    PRINT '   - Columna DatabaseStatesJson agregada';
END
ELSE
BEGIN
    PRINT '   - Columna DatabaseStatesJson ya existe';
END
GO

PRINT '';
PRINT 'Script completado: DatabaseStatesJson en OverviewSummaryCache';
GO
