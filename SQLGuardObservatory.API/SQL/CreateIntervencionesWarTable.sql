-- =============================================================================
-- Script: CreateIntervencionesWarTable.sql
-- Descripción: Crea la tabla de Intervenciones War para seguimiento de
--              incidencias DBA. Registra tiempos de intervención, participantes,
--              incidentes y métricas asociadas.
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- Crear tabla IntervencionesWar
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'IntervencionesWar' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[IntervencionesWar] (
        -- Clave primaria
        [Id]                            BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        -- Fecha y hora de la intervención
        [FechaHora]                     DATETIME2 NOT NULL,

        -- Duración en minutos
        [DuracionMinutos]               INT NOT NULL DEFAULT(0),

        -- DBA(s) participantes (separados por coma si son varios)
        [DbaParticipantes]              NVARCHAR(500) NOT NULL,

        -- Datos del incidente
        [NumeroIncidente]               NVARCHAR(100) NULL,
        [IncidenteLink]                 NVARCHAR(1000) NULL,
        [ProblemLink]                   NVARCHAR(1000) NULL,

        -- Aplicación/Solución afectada
        [AplicacionSolucion]            NVARCHAR(255) NULL,

        -- Servidores involucrados (separados por coma)
        [Servidores]                    NVARCHAR(1000) NULL,

        -- Bases de datos involucradas (separadas por coma)
        [BaseDatos]                     NVARCHAR(1000) NULL,

        -- Célula
        [Celula]                        NVARCHAR(255) NULL,

        -- Referente del área
        [Referente]                     NVARCHAR(255) NULL,

        -- Comentarios
        [Comentarios]                   NVARCHAR(MAX) NULL,

        -- Intervenciones relacionadas (IDs separados por coma)
        [IntervencionesRelacionadas]    NVARCHAR(500) NULL,

        -- Auditoría
        [FechaCreacion]                 DATETIME2 NOT NULL CONSTRAINT DF_IntervencionesWar_FechaCreacion DEFAULT (GETDATE()),
        [FechaModificacion]             DATETIME2 NOT NULL CONSTRAINT DF_IntervencionesWar_FechaModificacion DEFAULT (GETDATE()),
        [CreadoPor]                     NVARCHAR(255) NULL
    );
    PRINT 'Tabla [dbo].[IntervencionesWar] creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla [dbo].[IntervencionesWar] ya existe. No se realizaron cambios.';
END
GO

-- =============================================
-- Crear índices
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_FechaHora' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    CREATE INDEX [IX_IntervencionesWar_FechaHora] ON [dbo].[IntervencionesWar]([FechaHora] DESC);
    PRINT 'Índice IX_IntervencionesWar_FechaHora creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_AplicacionSolucion' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    CREATE INDEX [IX_IntervencionesWar_AplicacionSolucion] ON [dbo].[IntervencionesWar]([AplicacionSolucion]);
    PRINT 'Índice IX_IntervencionesWar_AplicacionSolucion creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_Celula' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    CREATE INDEX [IX_IntervencionesWar_Celula] ON [dbo].[IntervencionesWar]([Celula]);
    PRINT 'Índice IX_IntervencionesWar_Celula creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_IntervencionesWar_NumeroIncidente' AND object_id = OBJECT_ID('dbo.IntervencionesWar'))
BEGIN
    CREATE INDEX [IX_IntervencionesWar_NumeroIncidente] ON [dbo].[IntervencionesWar]([NumeroIncidente]);
    PRINT 'Índice IX_IntervencionesWar_NumeroIncidente creado.';
END
GO

PRINT '=== Script de IntervencionesWar completado exitosamente ===';
GO

