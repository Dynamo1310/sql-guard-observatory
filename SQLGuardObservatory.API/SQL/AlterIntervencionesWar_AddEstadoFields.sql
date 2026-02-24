USE [SQLGuardObservatoryAuth];
GO

-- =====================================================================
-- Script: Reemplazar campos booleanos por campos de estado multi-fase
-- Tabla: [dbo].[IntervencionesWar]
-- Fecha: 2026-02-24
--
-- Cambios:
--   EsProblema (BIT) -> EstadoProblem (NVARCHAR(30)) + FechaResolucionProblem (DATETIME2)
--   RecomendacionMejoraEnviada (BIT) -> EstadoRecomendacion (NVARCHAR(30)) + FechaFinalizacionRecomendacion (DATETIME2)
-- =====================================================================

-- 1. Agregar columna EstadoProblem
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'EstadoProblem')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [EstadoProblem] NVARCHAR(30) NOT NULL CONSTRAINT DF_IntervencionesWar_EstadoProblem DEFAULT('NoEscalado');
    PRINT 'Columna [EstadoProblem] agregada.';
END
GO

-- 2. Agregar columna FechaResolucionProblem
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'FechaResolucionProblem')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [FechaResolucionProblem] DATETIME2 NULL;
    PRINT 'Columna [FechaResolucionProblem] agregada.';
END
GO

-- 3. Agregar columna EstadoRecomendacion
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'EstadoRecomendacion')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [EstadoRecomendacion] NVARCHAR(30) NOT NULL CONSTRAINT DF_IntervencionesWar_EstadoRecomendacion DEFAULT('NoEnviada');
    PRINT 'Columna [EstadoRecomendacion] agregada.';
END
GO

-- 4. Agregar columna FechaFinalizacionRecomendacion
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'FechaFinalizacionRecomendacion')
BEGIN
    ALTER TABLE [dbo].[IntervencionesWar]
    ADD [FechaFinalizacionRecomendacion] DATETIME2 NULL;
    PRINT 'Columna [FechaFinalizacionRecomendacion] agregada.';
END
GO

-- 5. Migrar datos de EsProblema -> EstadoProblem
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'EsProblema')
BEGIN
    UPDATE [dbo].[IntervencionesWar]
    SET [EstadoProblem] = CASE WHEN [EsProblema] = 1 THEN 'EscaladoPendiente' ELSE 'NoEscalado' END;
    PRINT 'Datos migrados de [EsProblema] a [EstadoProblem].';
END
GO

-- 6. Migrar datos de RecomendacionMejoraEnviada -> EstadoRecomendacion
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'RecomendacionMejoraEnviada')
BEGIN
    UPDATE [dbo].[IntervencionesWar]
    SET [EstadoRecomendacion] = CASE WHEN [RecomendacionMejoraEnviada] = 1 THEN 'Enviada' ELSE 'NoEnviada' END;
    PRINT 'Datos migrados de [RecomendacionMejoraEnviada] a [EstadoRecomendacion].';
END
GO

-- 7. Eliminar columna EsProblema y su constraint
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'EsProblema')
BEGIN
    IF EXISTS (SELECT * FROM sys.default_constraints WHERE name = 'DF_IntervencionesWar_EsProblema')
    BEGIN
        ALTER TABLE [dbo].[IntervencionesWar] DROP CONSTRAINT DF_IntervencionesWar_EsProblema;
    END
    ALTER TABLE [dbo].[IntervencionesWar] DROP COLUMN [EsProblema];
    PRINT 'Columna [EsProblema] eliminada.';
END
GO

-- 8. Eliminar columna RecomendacionMejoraEnviada y su constraint
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.IntervencionesWar') AND name = 'RecomendacionMejoraEnviada')
BEGIN
    IF EXISTS (SELECT * FROM sys.default_constraints WHERE name = 'DF_IntervencionesWar_RecomendacionMejoraEnviada')
    BEGIN
        ALTER TABLE [dbo].[IntervencionesWar] DROP CONSTRAINT DF_IntervencionesWar_RecomendacionMejoraEnviada;
    END
    ALTER TABLE [dbo].[IntervencionesWar] DROP COLUMN [RecomendacionMejoraEnviada];
    PRINT 'Columna [RecomendacionMejoraEnviada] eliminada.';
END
GO

PRINT '=== Script AlterIntervencionesWar_AddEstadoFields completado exitosamente ===';
GO
