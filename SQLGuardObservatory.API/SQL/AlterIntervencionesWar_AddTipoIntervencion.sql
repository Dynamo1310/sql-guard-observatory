-- =============================================================================
-- Script: AlterIntervencionesWar_AddTipoIntervencion.sql
-- Descripción: Agrega columna TipoIntervencion y elimina ProblemLink y 
--              AplicacionSolucion de la tabla IntervencionesWar.
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- Agregar columna TipoIntervencion
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'TipoIntervencion')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [TipoIntervencion] NVARCHAR(50) NULL;
    PRINT 'Columna [TipoIntervencion] agregada a [dbo].[IntervencionesWar].';
END
ELSE
BEGIN
    PRINT 'La columna [TipoIntervencion] ya existe. No se realizaron cambios.';
END
GO

-- =============================================
-- Crear índice para TipoIntervencion
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_TipoIntervencion' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    CREATE INDEX [IX_IntervencionesWar_TipoIntervencion] ON [dbo].[IntervencionesWar]([TipoIntervencion]);
    PRINT 'Índice IX_IntervencionesWar_TipoIntervencion creado.';
END
GO

-- =============================================
-- Eliminar columna ProblemLink (ya no se usa)
-- =============================================
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'ProblemLink')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    DROP COLUMN [ProblemLink];
    PRINT 'Columna [ProblemLink] eliminada de [dbo].[IntervencionesWar].';
END
GO

-- =============================================
-- Eliminar columna AplicacionSolucion (ya no se usa)
-- =============================================
IF EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_AplicacionSolucion' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    DROP INDEX [IX_IntervencionesWar_AplicacionSolucion] ON [dbo].[IntervencionesWar];
    PRINT 'Índice IX_IntervencionesWar_AplicacionSolucion eliminado.';
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'AplicacionSolucion')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    DROP COLUMN [AplicacionSolucion];
    PRINT 'Columna [AplicacionSolucion] eliminada de [dbo].[IntervencionesWar].';
END
GO

PRINT '=== Migración de IntervencionesWar completada exitosamente ===';
GO

