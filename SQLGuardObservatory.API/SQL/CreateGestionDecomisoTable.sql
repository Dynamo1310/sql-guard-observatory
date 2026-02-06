-- =============================================================================
-- Script: CreateGestionDecomisoTable.sql
-- Descripción: Crea la tabla de soporte GestionDecomiso para el módulo de
--              gestión de decomiso de bases de datos sin actividad.
-- Base de Datos: SQLNova
-- =============================================================================

USE [SQLNova];
GO

-- =============================================
-- Crear tabla GestionDecomiso
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GestionDecomiso' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[GestionDecomiso] (
        [Id]                BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ServerName]        NVARCHAR(128) NOT NULL,
        [DBName]            NVARCHAR(128) NOT NULL,
        [Estado]            NVARCHAR(50) NOT NULL CONSTRAINT DF_GestionDecomiso_Estado DEFAULT ('Pendiente'),
        [TicketJira]        NVARCHAR(100) NULL,
        [Responsable]       NVARCHAR(255) NULL,
        [Observaciones]     NVARCHAR(500) NULL,
        [FechaCreacion]     DATETIME2 NOT NULL CONSTRAINT DF_GestionDecomiso_FechaCreacion DEFAULT (GETDATE()),
        [FechaModificacion] DATETIME2 NOT NULL CONSTRAINT DF_GestionDecomiso_FechaModificacion DEFAULT (GETDATE()),
        CONSTRAINT [UQ_GestionDecomiso_Server_DB] UNIQUE ([ServerName], [DBName])
    );
    PRINT 'Tabla [dbo].[GestionDecomiso] creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla [dbo].[GestionDecomiso] ya existe. No se realizaron cambios.';
END
GO

-- =============================================
-- Crear índices
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionDecomiso_Estado' AND object_id = OBJECT_ID('dbo.GestionDecomiso'))
BEGIN
    CREATE INDEX [IX_GestionDecomiso_Estado] ON [dbo].[GestionDecomiso]([Estado]);
    PRINT 'Índice IX_GestionDecomiso_Estado creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionDecomiso_ServerName' AND object_id = OBJECT_ID('dbo.GestionDecomiso'))
BEGIN
    CREATE INDEX [IX_GestionDecomiso_ServerName] ON [dbo].[GestionDecomiso]([ServerName]);
    PRINT 'Índice IX_GestionDecomiso_ServerName creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionDecomiso_FechaModificacion' AND object_id = OBJECT_ID('dbo.GestionDecomiso'))
BEGIN
    CREATE INDEX [IX_GestionDecomiso_FechaModificacion] ON [dbo].[GestionDecomiso]([FechaModificacion] DESC);
    PRINT 'Índice IX_GestionDecomiso_FechaModificacion creado.';
END
GO

PRINT '=== Script de GestionDecomiso completado exitosamente ===';
GO
