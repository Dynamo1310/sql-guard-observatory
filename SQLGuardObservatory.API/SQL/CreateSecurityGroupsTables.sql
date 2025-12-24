-- =============================================
-- Script: CreateSecurityGroupsTables.sql
-- Descripción: Crea las tablas para el sistema de grupos de seguridad
-- Autor: SQL Nova Team
-- Fecha: 2025
-- =============================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- Tabla: SecurityGroups
-- Descripción: Grupos de seguridad para organizar usuarios
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[SecurityGroups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[SecurityGroups] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Color] NVARCHAR(20) NULL,
        [Icon] NVARCHAR(50) NULL,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [IsDeleted] BIT NOT NULL DEFAULT 0,
        [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [CreatedByUserId] NVARCHAR(450) NULL,
        [UpdatedAt] DATETIME2(7) NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        CONSTRAINT [PK_SecurityGroups] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_SecurityGroups_CreatedByUser] FOREIGN KEY ([CreatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_SecurityGroups_UpdatedByUser] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    -- Índice único para nombre (excluyendo eliminados)
    CREATE UNIQUE NONCLUSTERED INDEX [IX_SecurityGroups_Name] 
        ON [dbo].[SecurityGroups]([Name]) 
        WHERE [IsDeleted] = 0;

    -- Índice para filtrar grupos activos
    CREATE NONCLUSTERED INDEX [IX_SecurityGroups_IsActive] 
        ON [dbo].[SecurityGroups]([IsActive], [IsDeleted]);

    PRINT 'Tabla SecurityGroups creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla SecurityGroups ya existe';
END
GO

-- =============================================
-- Tabla: UserGroups
-- Descripción: Membresía de usuarios en grupos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[UserGroups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[UserGroups] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [GroupId] INT NOT NULL,
        [AddedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [AddedByUserId] NVARCHAR(450) NULL,
        CONSTRAINT [PK_UserGroups] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_UserGroups_User] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserGroups_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[SecurityGroups]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_UserGroups_AddedByUser] FOREIGN KEY ([AddedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    -- Índice único para evitar duplicados (un usuario solo puede estar una vez en un grupo)
    CREATE UNIQUE NONCLUSTERED INDEX [IX_UserGroups_UserId_GroupId] 
        ON [dbo].[UserGroups]([UserId], [GroupId]);

    -- Índice para buscar grupos de un usuario
    CREATE NONCLUSTERED INDEX [IX_UserGroups_UserId] 
        ON [dbo].[UserGroups]([UserId]);

    -- Índice para buscar miembros de un grupo
    CREATE NONCLUSTERED INDEX [IX_UserGroups_GroupId] 
        ON [dbo].[UserGroups]([GroupId]);

    PRINT 'Tabla UserGroups creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla UserGroups ya existe';
END
GO

-- =============================================
-- Tabla: GroupPermissions
-- Descripción: Permisos asignados a cada grupo
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GroupPermissions]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[GroupPermissions] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [GroupId] INT NOT NULL,
        [ViewName] NVARCHAR(50) NOT NULL,
        [Enabled] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2(7) NULL,
        CONSTRAINT [PK_GroupPermissions] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_GroupPermissions_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[SecurityGroups]([Id]) ON DELETE CASCADE
    );

    -- Índice único para evitar permisos duplicados en un grupo
    CREATE UNIQUE NONCLUSTERED INDEX [IX_GroupPermissions_GroupId_ViewName] 
        ON [dbo].[GroupPermissions]([GroupId], [ViewName]);

    -- Índice para consultar permisos de un grupo
    CREATE NONCLUSTERED INDEX [IX_GroupPermissions_GroupId] 
        ON [dbo].[GroupPermissions]([GroupId]);

    PRINT 'Tabla GroupPermissions creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla GroupPermissions ya existe';
END
GO

-- =============================================
-- Tabla: ADGroupSync
-- Descripción: Configuración de sincronización con Active Directory
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ADGroupSync]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ADGroupSync] (
        [Id] INT IDENTITY(1,1) NOT NULL,
        [GroupId] INT NOT NULL,
        [ADGroupName] NVARCHAR(200) NOT NULL,
        [AutoSync] BIT NOT NULL DEFAULT 0,
        [SyncIntervalHours] INT NOT NULL DEFAULT 24,
        [LastSyncAt] DATETIME2(7) NULL,
        [LastSyncResult] NVARCHAR(500) NULL,
        [LastSyncAddedCount] INT NULL,
        [LastSyncRemovedCount] INT NULL,
        [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
        [CreatedByUserId] NVARCHAR(450) NULL,
        [UpdatedAt] DATETIME2(7) NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        CONSTRAINT [PK_ADGroupSync] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_ADGroupSync_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[SecurityGroups]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_ADGroupSync_CreatedByUser] FOREIGN KEY ([CreatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_ADGroupSync_UpdatedByUser] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    -- Índice único para que un grupo solo tenga una configuración de AD sync
    CREATE UNIQUE NONCLUSTERED INDEX [IX_ADGroupSync_GroupId] 
        ON [dbo].[ADGroupSync]([GroupId]);

    PRINT 'Tabla ADGroupSync creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla ADGroupSync ya existe';
END
GO

-- =============================================
-- Agregar permiso AdminGroups a RolePermissions
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'AdminGroups')
BEGIN
    -- SuperAdmin tiene acceso a AdminGroups
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('SuperAdmin', 'AdminGroups', 1, GETUTCDATE());

    -- Admin tiene acceso a AdminGroups
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Admin', 'AdminGroups', 1, GETUTCDATE());

    -- Reader NO tiene acceso a AdminGroups por defecto
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Reader', 'AdminGroups', 0, GETUTCDATE());

    PRINT 'Permiso AdminGroups agregado a RolePermissions';
END
ELSE
BEGIN
    PRINT 'Permiso AdminGroups ya existe';
END
GO

-- =============================================
-- NOTA: Los grupos de seguridad se crean desde el frontend
-- No se insertan datos iniciales en SecurityGroups
-- =============================================

PRINT '';
PRINT '=============================================';
PRINT 'Script de creación de tablas de grupos completado';
PRINT 'Los grupos se gestionan desde el frontend en:';
PRINT '  Administración -> Grupos';
PRINT '=============================================';
GO

