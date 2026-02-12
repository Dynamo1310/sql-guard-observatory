-- =============================================================================
-- Script: AddCelulaColumn.sql
-- Descripción: Agrega la columna Celula a la tabla GestionBasesSinUso
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.GestionBasesSinUso') 
      AND name = 'Celula'
)
BEGIN
    ALTER TABLE [dbo].[GestionBasesSinUso]
    ADD [Celula] NVARCHAR(255) NULL;

    PRINT 'Columna [Celula] agregada a [GestionBasesSinUso].';
END
ELSE
BEGIN
    PRINT 'La columna [Celula] ya existe en [GestionBasesSinUso].';
END
GO

-- Índice para filtro por Célula
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_Celula' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_Celula] ON [dbo].[GestionBasesSinUso]([Celula]);
    PRINT 'Índice IX_GestionBasesSinUso_Celula creado.';
END
GO

PRINT '=== Script AddCelulaColumn completado ===';
GO

