-- =============================================
-- Script: CreateUserImportSyncTables.sql
-- Descripción: Crea las tablas para sincronización de usuarios
--              desde listas de distribución de Active Directory
-- Autor: SQL Nova Team
-- Fecha: 2026
-- =============================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- Tabla: UserImportSyncs
-- Descripción: Configuración de sincronización de usuarios
--              desde listas de distribución de AD
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserImportSyncs]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UserImportSyncs] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [SourceType] NVARCHAR(50) NOT NULL,
        [SourceIdentifier] NVARCHAR(500) NOT NULL,
        [SourceDisplayName] NVARCHAR(200) NULL,
        [ADGroupName] NVARCHAR(200) NOT NULL,
        [DefaultRoleId] INT NULL,
        [AutoSync] BIT NOT NULL DEFAULT 0,
        [SyncIntervalHours] INT NOT NULL DEFAULT 24,
        [LastSyncAt] DATETIME2(7) NULL,
        [LastSyncResult] NVARCHAR(500) NULL,
        [LastSyncAddedCount] INT NULL,
        [LastSyncRemovedCount] INT NULL,
        [LastSyncSkippedCount] INT NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [CreatedByUserId] NVARCHAR(450) NULL,
        [UpdatedAt] DATETIME2(7) NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        CONSTRAINT [PK_UserImportSyncs] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_UserImportSyncs_DefaultRole] FOREIGN KEY ([DefaultRoleId])
            REFERENCES [dbo].[AdminRoles]([Id]) ON DELETE SET NULL,
        CONSTRAINT [FK_UserImportSyncs_CreatedByUser] FOREIGN KEY ([CreatedByUserId])
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_UserImportSyncs_UpdatedByUser] FOREIGN KEY ([UpdatedByUserId])
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    CREATE UNIQUE NONCLUSTERED INDEX [IX_UserImportSyncs_SourceIdentifier]
        ON [dbo].[UserImportSyncs]([SourceIdentifier])
        WHERE [IsActive] = 1;

    CREATE NONCLUSTERED INDEX [IX_UserImportSyncs_AutoSync]
        ON [dbo].[UserImportSyncs]([AutoSync], [IsActive]);

    PRINT 'Tabla UserImportSyncs creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla UserImportSyncs ya existe';
END
GO

-- =============================================
-- Tabla: UserImportSyncMembers
-- Descripción: Rastrea qué usuarios fueron importados por cada sync.
--              Permite determinar si un usuario es exclusivo de un sync
--              para decidir si desactivarlo al ser removido de la DL.
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserImportSyncMembers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UserImportSyncMembers] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [SyncId] INT NOT NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [SamAccountName] NVARCHAR(100) NOT NULL,
        [AddedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [RemovedAt] DATETIME2(7) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        CONSTRAINT [PK_UserImportSyncMembers] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_UserImportSyncMembers_Sync] FOREIGN KEY ([SyncId])
            REFERENCES [dbo].[UserImportSyncs]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserImportSyncMembers_User] FOREIGN KEY ([UserId])
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE CASCADE
    );

    CREATE UNIQUE NONCLUSTERED INDEX [IX_UserImportSyncMembers_SyncId_UserId]
        ON [dbo].[UserImportSyncMembers]([SyncId], [UserId])
        WHERE [IsActive] = 1;

    CREATE NONCLUSTERED INDEX [IX_UserImportSyncMembers_UserId]
        ON [dbo].[UserImportSyncMembers]([UserId], [IsActive]);

    CREATE NONCLUSTERED INDEX [IX_UserImportSyncMembers_SyncId]
        ON [dbo].[UserImportSyncMembers]([SyncId], [IsActive]);

    PRINT 'Tabla UserImportSyncMembers creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla UserImportSyncMembers ya existe';
END
GO

PRINT '';
PRINT '=============================================';
PRINT 'Script de creación de tablas UserImportSync completado';
PRINT '=============================================';
GO
