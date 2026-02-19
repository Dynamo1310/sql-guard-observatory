USE [SQLGuardObservatoryAuth];
GO

-- =====================================================================
-- Script: Agregar columnas EsProblema y RecomendacionMejoraEnviada
-- Tabla: [dbo].[IntervencionesWar]
-- Fecha: 2026-02-19
-- =====================================================================

-- Agregar columna EsProblema
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'EsProblema')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [EsProblema] BIT NOT NULL CONSTRAINT DF_IntervencionesWar_EsProblema DEFAULT(0);
    PRINT 'Columna [EsProblema] agregada a [dbo].[IntervencionesWar].';
END
ELSE
BEGIN
    PRINT 'La columna [EsProblema] ya existe. No se realizaron cambios.';
END
GO

-- Agregar columna RecomendacionMejoraEnviada
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'RecomendacionMejoraEnviada')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [RecomendacionMejoraEnviada] BIT NOT NULL CONSTRAINT DF_IntervencionesWar_RecomendacionMejoraEnviada DEFAULT(0);
    PRINT 'Columna [RecomendacionMejoraEnviada] agregada a [dbo].[IntervencionesWar].';
END
ELSE
BEGIN
    PRINT 'La columna [RecomendacionMejoraEnviada] ya existe. No se realizaron cambios.';
END
GO

PRINT '=== Script AlterIntervencionesWar_AddBooleanFields completado exitosamente ===';
GO

