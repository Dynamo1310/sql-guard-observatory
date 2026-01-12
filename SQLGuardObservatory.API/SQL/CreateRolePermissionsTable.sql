-- Script para crear la tabla RolePermissions en la base de datos AppSQLNova

USE [AppSQLNova];
GO

-- Crear la tabla RolePermissions
CREATE TABLE [dbo].[RolePermissions] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Role] NVARCHAR(50) NOT NULL,
    [ViewName] NVARCHAR(50) NOT NULL,
    [Enabled] BIT NOT NULL DEFAULT 1,
    [CreatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [UpdatedAt] DATETIME2(7) NULL,
    CONSTRAINT [PK_RolePermissions] PRIMARY KEY CLUSTERED ([Id] ASC),
    CONSTRAINT [IX_RolePermissions_Role_ViewName] UNIQUE NONCLUSTERED ([Role] ASC, [ViewName] ASC)
);
GO

-- Insertar permisos por defecto para SuperAdmin (acceso total)
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
VALUES 
    ('SuperAdmin', 'Overview', 1, GETUTCDATE()),
    ('SuperAdmin', 'Jobs', 1, GETUTCDATE()),
    ('SuperAdmin', 'Disks', 1, GETUTCDATE()),
    ('SuperAdmin', 'Databases', 1, GETUTCDATE()),
    ('SuperAdmin', 'Backups', 1, GETUTCDATE()),
    ('SuperAdmin', 'Indexes', 1, GETUTCDATE()),
    ('SuperAdmin', 'AdminUsers', 1, GETUTCDATE()),
    ('SuperAdmin', 'AdminPermissions', 1, GETUTCDATE());
GO

-- Insertar permisos por defecto para Admin (todo excepto AdminPermissions)
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
VALUES 
    ('Admin', 'Overview', 1, GETUTCDATE()),
    ('Admin', 'Jobs', 1, GETUTCDATE()),
    ('Admin', 'Disks', 1, GETUTCDATE()),
    ('Admin', 'Databases', 1, GETUTCDATE()),
    ('Admin', 'Backups', 1, GETUTCDATE()),
    ('Admin', 'Indexes', 1, GETUTCDATE()),
    ('Admin', 'AdminUsers', 1, GETUTCDATE());
GO

-- Insertar permisos por defecto para Reader (solo vistas de observabilidad)
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
VALUES 
    ('Reader', 'Overview', 1, GETUTCDATE()),
    ('Reader', 'Jobs', 1, GETUTCDATE()),
    ('Reader', 'Disks', 1, GETUTCDATE()),
    ('Reader', 'Databases', 1, GETUTCDATE()),
    ('Reader', 'Backups', 1, GETUTCDATE()),
    ('Reader', 'Indexes', 1, GETUTCDATE());
GO

PRINT 'Tabla RolePermissions creada exitosamente con permisos por defecto.';
GO

