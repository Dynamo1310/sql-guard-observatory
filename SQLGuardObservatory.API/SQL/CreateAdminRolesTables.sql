-- =============================================
-- Script: CreateAdminRolesTables.sql
-- Descripción: Crea el sistema de roles personalizables
--              estilo Google Workspace / Azure AD
-- Autor: SQL Guard Observatory
-- Fecha: 2025
-- =============================================

USE [SQLGuardObservatory]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- =============================================
-- Paso 1: Crear tabla AdminRoles
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AdminRoles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AdminRoles](
        [Id] INT IDENTITY(1,1) NOT NULL,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Color] NVARCHAR(20) NOT NULL DEFAULT '#6b7280',
        [Icon] NVARCHAR(50) NOT NULL DEFAULT 'Shield',
        [Priority] INT NOT NULL DEFAULT 0,
        [IsSystem] BIT NOT NULL DEFAULT 0,
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [CreatedByUserId] NVARCHAR(450) NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        CONSTRAINT [PK_AdminRoles] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_AdminRoles_CreatedBy] FOREIGN KEY ([CreatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AdminRoles_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    CREATE UNIQUE INDEX [IX_AdminRoles_Name] ON [dbo].[AdminRoles]([Name]) WHERE [IsActive] = 1;
    
    PRINT 'Tabla AdminRoles creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla AdminRoles ya existe';
END
GO

-- =============================================
-- Paso 2: Crear tabla AdminRoleCapabilities
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AdminRoleCapabilities]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AdminRoleCapabilities](
        [Id] INT IDENTITY(1,1) NOT NULL,
        [RoleId] INT NOT NULL,
        [CapabilityKey] NVARCHAR(100) NOT NULL,
        [IsEnabled] BIT NOT NULL DEFAULT 1,
        CONSTRAINT [PK_AdminRoleCapabilities] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_AdminRoleCapabilities_Role] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[AdminRoles]([Id]) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX [IX_AdminRoleCapabilities_RoleCapability] ON [dbo].[AdminRoleCapabilities]([RoleId], [CapabilityKey]);
    CREATE INDEX [IX_AdminRoleCapabilities_RoleId] ON [dbo].[AdminRoleCapabilities]([RoleId]);
    
    PRINT 'Tabla AdminRoleCapabilities creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla AdminRoleCapabilities ya existe';
END
GO

-- =============================================
-- Paso 3: Crear tabla AdminRoleAssignableRoles
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[AdminRoleAssignableRoles]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[AdminRoleAssignableRoles](
        [Id] INT IDENTITY(1,1) NOT NULL,
        [RoleId] INT NOT NULL,
        [AssignableRoleId] INT NOT NULL,
        CONSTRAINT [PK_AdminRoleAssignableRoles] PRIMARY KEY CLUSTERED ([Id] ASC),
        CONSTRAINT [FK_AdminRoleAssignableRoles_Role] FOREIGN KEY ([RoleId]) REFERENCES [dbo].[AdminRoles]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_AdminRoleAssignableRoles_AssignableRole] FOREIGN KEY ([AssignableRoleId]) REFERENCES [dbo].[AdminRoles]([Id]) ON DELETE NO ACTION
    );

    CREATE UNIQUE INDEX [IX_AdminRoleAssignableRoles_Unique] ON [dbo].[AdminRoleAssignableRoles]([RoleId], [AssignableRoleId]);
    
    PRINT 'Tabla AdminRoleAssignableRoles creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla AdminRoleAssignableRoles ya existe';
END
GO

-- =============================================
-- Paso 4: Agregar columna AdminRoleId a AspNetUsers
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[AspNetUsers]') AND name = 'AdminRoleId')
BEGIN
    ALTER TABLE [dbo].[AspNetUsers] ADD [AdminRoleId] INT NULL;
    
    ALTER TABLE [dbo].[AspNetUsers] ADD CONSTRAINT [FK_AspNetUsers_AdminRole] 
        FOREIGN KEY ([AdminRoleId]) REFERENCES [dbo].[AdminRoles]([Id]) ON DELETE SET NULL;
    
    CREATE INDEX [IX_AspNetUsers_AdminRoleId] ON [dbo].[AspNetUsers]([AdminRoleId]);
    
    PRINT 'Columna AdminRoleId agregada a AspNetUsers';
END
ELSE
BEGIN
    PRINT 'Columna AdminRoleId ya existe en AspNetUsers';
END
GO

-- =============================================
-- Paso 5: Insertar roles de sistema predeterminados
-- =============================================
PRINT 'Insertando roles de sistema...';

-- SuperAdmin (Prioridad 1000 - máxima)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin')
BEGIN
    INSERT INTO [dbo].[AdminRoles] ([Name], [Description], [Color], [Icon], [Priority], [IsSystem], [IsActive])
    VALUES (
        'SuperAdmin', 
        'Control total del sistema. Puede gestionar todos los usuarios, grupos, roles y configuraciones.', 
        '#8b5cf6', 
        'ShieldCheck',
        1000, 
        1, 
        1
    );
    PRINT 'Rol SuperAdmin creado';
END

-- Admin (Prioridad 500)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin')
BEGIN
    INSERT INTO [dbo].[AdminRoles] ([Name], [Description], [Color], [Icon], [Priority], [IsSystem], [IsActive])
    VALUES (
        'Admin', 
        'Administrador con permisos para gestionar usuarios y grupos asignados. No puede crear ni eliminar grupos globalmente.', 
        '#3b82f6', 
        'Shield',
        500, 
        1, 
        1
    );
    PRINT 'Rol Admin creado';
END

-- Reader (Prioridad 100 - mínima)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader')
BEGIN
    INSERT INTO [dbo].[AdminRoles] ([Name], [Description], [Color], [Icon], [Priority], [IsSystem], [IsActive])
    VALUES (
        'Reader', 
        'Solo lectura. No puede realizar cambios administrativos, solo ver información según los permisos de sus grupos.', 
        '#6b7280', 
        'Eye',
        100, 
        1, 
        1
    );
    PRINT 'Rol Reader creado';
END
GO

-- =============================================
-- Paso 6: Insertar capacidades para cada rol
-- =============================================
PRINT 'Insertando capacidades para roles...';

DECLARE @SuperAdminId INT, @AdminId INT, @ReaderId INT;
SELECT @SuperAdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin';
SELECT @AdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin';
SELECT @ReaderId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader';

-- Lista de todas las capacidades disponibles
DECLARE @Capabilities TABLE (CapabilityKey NVARCHAR(100));
INSERT INTO @Capabilities VALUES
    -- Usuarios
    ('Users.View'),
    ('Users.Create'),
    ('Users.Edit'),
    ('Users.Delete'),
    ('Users.ImportFromAD'),
    ('Users.AssignRoles'),
    -- Grupos
    ('Groups.View'),
    ('Groups.Create'),
    ('Groups.Edit'),
    ('Groups.Delete'),
    ('Groups.ManageMembers'),
    ('Groups.ManagePermissions'),
    ('Groups.SyncWithAD'),
    -- Roles
    ('Roles.View'),
    ('Roles.Create'),
    ('Roles.Edit'),
    ('Roles.Delete'),
    ('Roles.AssignCapabilities'),
    -- Sistema
    ('System.ConfigureSMTP'),
    ('System.ConfigureCollectors'),
    ('System.ConfigureAlerts'),
    ('System.ManageCredentials'),
    ('System.ViewAudit'),
    ('System.ManageMenuBadges');

-- Capacidades para SuperAdmin (TODAS)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @SuperAdminId)
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    SELECT @SuperAdminId, CapabilityKey, 1 FROM @Capabilities;
    PRINT 'Capacidades de SuperAdmin insertadas';
END

-- Capacidades para Admin (usuarios y grupos, excepto crear/eliminar grupos globales y roles)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @AdminId)
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES
        (@AdminId, 'Users.View', 1),
        (@AdminId, 'Users.Create', 1),
        (@AdminId, 'Users.Edit', 1),
        (@AdminId, 'Users.Delete', 0),  -- No puede eliminar
        (@AdminId, 'Users.ImportFromAD', 1),
        (@AdminId, 'Users.AssignRoles', 1),
        (@AdminId, 'Groups.View', 1),
        (@AdminId, 'Groups.Create', 0),  -- No puede crear grupos
        (@AdminId, 'Groups.Edit', 1),
        (@AdminId, 'Groups.Delete', 0),  -- No puede eliminar grupos
        (@AdminId, 'Groups.ManageMembers', 1),
        (@AdminId, 'Groups.ManagePermissions', 1),
        (@AdminId, 'Groups.SyncWithAD', 1),
        (@AdminId, 'Roles.View', 1),
        (@AdminId, 'Roles.Create', 0),
        (@AdminId, 'Roles.Edit', 0),
        (@AdminId, 'Roles.Delete', 0),
        (@AdminId, 'Roles.AssignCapabilities', 0),
        (@AdminId, 'System.ConfigureSMTP', 0),
        (@AdminId, 'System.ConfigureCollectors', 0),
        (@AdminId, 'System.ConfigureAlerts', 0),
        (@AdminId, 'System.ManageCredentials', 0),
        (@AdminId, 'System.ViewAudit', 1),
        (@AdminId, 'System.ManageMenuBadges', 0);
    PRINT 'Capacidades de Admin insertadas';
END

-- Capacidades para Reader (ninguna capacidad administrativa)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @ReaderId)
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    SELECT @ReaderId, CapabilityKey, 0 FROM @Capabilities;
    PRINT 'Capacidades de Reader insertadas (todas deshabilitadas)';
END
GO

-- =============================================
-- Paso 7: Configurar qué roles puede asignar cada rol
-- =============================================
PRINT 'Configurando roles asignables...';

DECLARE @SuperAdminId2 INT, @AdminId2 INT, @ReaderId2 INT;
SELECT @SuperAdminId2 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin';
SELECT @AdminId2 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin';
SELECT @ReaderId2 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader';

-- SuperAdmin puede asignar todos los roles
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleAssignableRoles] WHERE [RoleId] = @SuperAdminId2)
BEGIN
    INSERT INTO [dbo].[AdminRoleAssignableRoles] ([RoleId], [AssignableRoleId])
    VALUES 
        (@SuperAdminId2, @SuperAdminId2),
        (@SuperAdminId2, @AdminId2),
        (@SuperAdminId2, @ReaderId2);
    PRINT 'Roles asignables para SuperAdmin configurados';
END

-- Admin puede asignar Admin y Reader
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleAssignableRoles] WHERE [RoleId] = @AdminId2)
BEGIN
    INSERT INTO [dbo].[AdminRoleAssignableRoles] ([RoleId], [AssignableRoleId])
    VALUES 
        (@AdminId2, @AdminId2),
        (@AdminId2, @ReaderId2);
    PRINT 'Roles asignables para Admin configurados';
END

-- Reader no puede asignar ningún rol (no insertar registros)
GO

-- =============================================
-- Paso 8: Migrar usuarios existentes al nuevo sistema
-- =============================================
PRINT 'Migrando usuarios existentes...';

DECLARE @SuperAdminId3 INT, @AdminId3 INT, @ReaderId3 INT;
SELECT @SuperAdminId3 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin';
SELECT @AdminId3 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin';
SELECT @ReaderId3 = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader';

-- Obtener usuarios que tienen rol asignado en AspNetUserRoles
-- SuperAdmin role
UPDATE u
SET u.AdminRoleId = @SuperAdminId3
FROM [dbo].[AspNetUsers] u
INNER JOIN [dbo].[AspNetUserRoles] ur ON u.Id = ur.UserId
INNER JOIN [dbo].[AspNetRoles] r ON ur.RoleId = r.Id
WHERE r.Name = 'SuperAdmin' AND u.AdminRoleId IS NULL;

-- Admin role
UPDATE u
SET u.AdminRoleId = @AdminId3
FROM [dbo].[AspNetUsers] u
INNER JOIN [dbo].[AspNetUserRoles] ur ON u.Id = ur.UserId
INNER JOIN [dbo].[AspNetRoles] r ON ur.RoleId = r.Id
WHERE r.Name = 'Admin' AND u.AdminRoleId IS NULL;

-- Reader role
UPDATE u
SET u.AdminRoleId = @ReaderId3
FROM [dbo].[AspNetUsers] u
INNER JOIN [dbo].[AspNetUserRoles] ur ON u.Id = ur.UserId
INNER JOIN [dbo].[AspNetRoles] r ON ur.RoleId = r.Id
WHERE r.Name = 'Reader' AND u.AdminRoleId IS NULL;

-- Usuarios sin rol asignado -> Reader por defecto
UPDATE [dbo].[AspNetUsers]
SET AdminRoleId = @ReaderId3
WHERE AdminRoleId IS NULL;

PRINT 'Migración de usuarios completada';
GO

-- =============================================
-- Paso 9: Crear vista para consultar usuarios con roles
-- =============================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_UsersWithAdminRoles')
    DROP VIEW [dbo].[vw_UsersWithAdminRoles];
GO

CREATE VIEW [dbo].[vw_UsersWithAdminRoles]
AS
SELECT 
    u.Id,
    u.UserName,
    u.DomainUser,
    u.DisplayName,
    u.Email,
    u.IsActive,
    u.CreatedAt,
    u.AdminRoleId,
    r.Name AS RoleName,
    r.Description AS RoleDescription,
    r.Color AS RoleColor,
    r.Icon AS RoleIcon,
    r.Priority AS RolePriority,
    r.IsSystem AS RoleIsSystem
FROM [dbo].[AspNetUsers] u
LEFT JOIN [dbo].[AdminRoles] r ON u.AdminRoleId = r.Id;
GO

PRINT 'Vista vw_UsersWithAdminRoles creada';
GO

-- =============================================
-- Resumen final
-- =============================================
PRINT '=========================================';
PRINT 'Sistema de Roles Personalizables instalado';
PRINT '=========================================';

SELECT 
    r.Id,
    r.Name,
    r.Priority,
    r.IsSystem,
    (SELECT COUNT(*) FROM [dbo].[AdminRoleCapabilities] WHERE RoleId = r.Id AND IsEnabled = 1) AS EnabledCapabilities,
    (SELECT COUNT(*) FROM [dbo].[AspNetUsers] WHERE AdminRoleId = r.Id) AS UsersCount
FROM [dbo].[AdminRoles] r
ORDER BY r.Priority DESC;

GO




