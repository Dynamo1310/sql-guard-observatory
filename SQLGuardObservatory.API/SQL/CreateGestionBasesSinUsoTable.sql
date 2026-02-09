-- =============================================================================
-- Script: CreateGestionBasesSinUsoTable.sql
-- Descripción: Crea la tabla de gestión de bajas de bases de datos para el
--              proyecto "Bases sin Uso". Persiste los datos del inventario
--              (SqlServerDatabasesCache) junto con campos adicionales de gestión.
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- Crear tabla GestionBasesSinUso
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'GestionBasesSinUso' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[GestionBasesSinUso] (
        -- Clave primaria
        [Id]                        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,

        -- ===========================================
        -- Campos espejo del inventario (SqlServerDatabasesCache)
        -- Se copian al dar de alta para persistir cuando la DB desaparece del cache
        -- ===========================================
        [ServerInstanceId]          INT NOT NULL,
        [ServerName]                NVARCHAR(255) NOT NULL,
        [ServerAmbiente]            NVARCHAR(100) NULL,
        [DatabaseId]                INT NOT NULL,
        [DbName]                    NVARCHAR(255) NOT NULL,
        [Status]                    NVARCHAR(50) NULL,
        [StateDesc]                 NVARCHAR(50) NULL,
        [DataFiles]                 INT NULL,
        [DataMB]                    INT NULL,
        [UserAccess]                NVARCHAR(50) NULL,
        [RecoveryModel]             NVARCHAR(50) NULL,
        [CompatibilityLevel]        NVARCHAR(100) NULL,
        [CreationDate]              DATETIME2 NULL,
        [Collation]                 NVARCHAR(100) NULL,
        [Fulltext]                  BIT NULL,
        [AutoClose]                 BIT NULL,
        [ReadOnly]                  BIT NULL,
        [AutoShrink]                BIT NULL,
        [AutoCreateStatistics]      BIT NULL,
        [AutoUpdateStatistics]      BIT NULL,
        [SourceTimestamp]            DATETIME2 NULL,
        [CachedAt]                  DATETIME2 NULL,

        -- ===========================================
        -- Campos adicionales de gestión de bajas
        -- ===========================================

        -- Compatibilidad del motor (ej: 2005, 2008, 2012, 2014, 2016, 2017, 2019)
        [CompatibilidadMotor]       NVARCHAR(20) NULL,

        -- Fecha de última actividad detectada
        [FechaUltimaActividad]      DATETIME2 NULL,

        -- Indicador de baja (Offline: SI/NO)
        [Offline]                   BIT NOT NULL CONSTRAINT DF_GestionBasesSinUso_Offline DEFAULT (0),

        -- Fecha de baja o migración
        [FechaBajaMigracion]        DATETIME2 NULL,

        -- Motivos de baja (checkboxes independientes)
        [MotivoBasesSinActividad]       BIT NOT NULL CONSTRAINT DF_GestionBasesSinUso_MotivoSinActividad DEFAULT (0),
        [MotivoObsolescencia]           BIT NOT NULL CONSTRAINT DF_GestionBasesSinUso_MotivoObsolescencia DEFAULT (0),
        [MotivoEficiencia]              BIT NOT NULL CONSTRAINT DF_GestionBasesSinUso_MotivoEficiencia DEFAULT (0),
        [MotivoCambioVersionAmbBajos]   BIT NOT NULL CONSTRAINT DF_GestionBasesSinUso_MotivoCambioVersion DEFAULT (0),

        -- Último backup
        [FechaUltimoBkp]            DATETIME2 NULL,
        [UbicacionUltimoBkp]        NVARCHAR(500) NULL,

        -- DBA asignado (del grupo IDD General)
        [DbaAsignado]               NVARCHAR(255) NULL,

        -- Owner de la base de datos
        [Owner]                     NVARCHAR(255) NULL,

        -- Comentarios generales
        [Comentarios]               NVARCHAR(MAX) NULL,

        -- Auditoría
        [FechaCreacion]             DATETIME2 NOT NULL CONSTRAINT DF_GestionBasesSinUso_FechaCreacion DEFAULT (GETDATE()),
        [FechaModificacion]         DATETIME2 NOT NULL CONSTRAINT DF_GestionBasesSinUso_FechaModificacion DEFAULT (GETDATE()),

        -- Restricción única: una sola entrada por ServerName + DbName
        CONSTRAINT [UQ_GestionBasesSinUso_Server_DB] UNIQUE ([ServerName], [DbName])
    );
    PRINT 'Tabla [dbo].[GestionBasesSinUso] creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla [dbo].[GestionBasesSinUso] ya existe. No se realizaron cambios.';
END
GO

-- =============================================
-- Crear índices
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_ServerName' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_ServerName] ON [dbo].[GestionBasesSinUso]([ServerName]);
    PRINT 'Índice IX_GestionBasesSinUso_ServerName creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_DbName' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_DbName] ON [dbo].[GestionBasesSinUso]([DbName]);
    PRINT 'Índice IX_GestionBasesSinUso_DbName creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_Offline' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_Offline] ON [dbo].[GestionBasesSinUso]([Offline]);
    PRINT 'Índice IX_GestionBasesSinUso_Offline creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_ServerAmbiente' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_ServerAmbiente] ON [dbo].[GestionBasesSinUso]([ServerAmbiente]);
    PRINT 'Índice IX_GestionBasesSinUso_ServerAmbiente creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_GestionBasesSinUso_FechaModificacion' AND object_id = OBJECT_ID('dbo.GestionBasesSinUso'))
BEGIN
    CREATE INDEX [IX_GestionBasesSinUso_FechaModificacion] ON [dbo].[GestionBasesSinUso]([FechaModificacion] DESC);
    PRINT 'Índice IX_GestionBasesSinUso_FechaModificacion creado.';
END
GO

PRINT '=== Script de GestionBasesSinUso completado exitosamente ===';
GO
