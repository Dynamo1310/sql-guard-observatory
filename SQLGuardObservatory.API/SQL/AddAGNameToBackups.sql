-- =============================================
-- Script: AddAGNameToBackups.sql
-- Descripción: Agrega columna AGName a InstanceHealth_Backups
--              para agrupar nodos de Availability Groups en el Overview
-- Fecha: 2026-02-05
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- ============================================================================
-- 1. Agregar columna AGName a InstanceHealth_Backups
-- ============================================================================
PRINT 'Agregando columna AGName a InstanceHealth_Backups...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'AGName')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD AGName NVARCHAR(255) NULL;
    PRINT '   - Columna AGName agregada';
END
ELSE
BEGIN
    PRINT '   - Columna AGName ya existe';
END
GO

-- ============================================================================
-- 2. Crear índice para optimizar consultas de agrupación por AG
-- ============================================================================
PRINT '';
PRINT 'Creando índice para AGName...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InstanceHealth_Backups_AGName' AND object_id = OBJECT_ID('dbo.InstanceHealth_Backups'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_InstanceHealth_Backups_AGName 
    ON dbo.InstanceHealth_Backups (AGName) 
    WHERE AGName IS NOT NULL;
    PRINT '   - Índice IX_InstanceHealth_Backups_AGName creado';
END
ELSE
BEGIN
    PRINT '   - Índice ya existe';
END
GO

PRINT '';
PRINT 'Script completado: AGName agregado a InstanceHealth_Backups';
GO
