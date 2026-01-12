-- ============================================
-- Script: CreateOperationalServersTables.sql
-- Descripción: Tablas para gestionar servidores habilitados para operaciones
-- (Reinicios, Failovers, Parcheos, etc.)
-- Fecha: 2025
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Crear tabla OperationalServers
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OperationalServers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[OperationalServers] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [ServerName] NVARCHAR(256) NOT NULL,              -- Nombre del servidor (ej: SQLPROD01)
        [InstanceName] NVARCHAR(256) NULL,                -- Nombre de instancia si aplica
        [Description] NVARCHAR(500) NULL,                 -- Descripción opcional
        [Ambiente] NVARCHAR(100) NULL,                    -- Producción, Testing, Desarrollo
        [IsFromInventory] BIT NOT NULL DEFAULT 1,         -- Si viene del inventario o es manual
        [Enabled] BIT NOT NULL DEFAULT 1,                 -- Si está habilitado para operaciones
        [EnabledForRestart] BIT NOT NULL DEFAULT 1,       -- Habilitado para reinicios
        [EnabledForFailover] BIT NOT NULL DEFAULT 0,      -- Habilitado para failovers
        [EnabledForPatching] BIT NOT NULL DEFAULT 0,      -- Habilitado para parcheos
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [CreatedByUserId] NVARCHAR(450) NOT NULL,
        [CreatedByUserName] NVARCHAR(256) NULL,
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        [UpdatedByUserName] NVARCHAR(256) NULL,
        [Notes] NVARCHAR(MAX) NULL,                       -- Notas adicionales
        
        CONSTRAINT [FK_OperationalServers_CreatedBy] FOREIGN KEY ([CreatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        CONSTRAINT [UQ_OperationalServers_ServerName] UNIQUE ([ServerName])
    );
    
    PRINT 'Tabla OperationalServers creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OperationalServers ya existe';
END
GO

-- ============================================
-- 2. Crear índices
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OperationalServers_Enabled' AND object_id = OBJECT_ID('OperationalServers'))
BEGIN
    CREATE INDEX [IX_OperationalServers_Enabled] ON [dbo].[OperationalServers]([Enabled]);
    PRINT 'Índice IX_OperationalServers_Enabled creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OperationalServers_ServerName' AND object_id = OBJECT_ID('OperationalServers'))
BEGIN
    CREATE INDEX [IX_OperationalServers_ServerName] ON [dbo].[OperationalServers]([ServerName]);
    PRINT 'Índice IX_OperationalServers_ServerName creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OperationalServers_Ambiente' AND object_id = OBJECT_ID('OperationalServers'))
BEGIN
    CREATE INDEX [IX_OperationalServers_Ambiente] ON [dbo].[OperationalServers]([Ambiente]);
    PRINT 'Índice IX_OperationalServers_Ambiente creado';
END
GO

-- ============================================
-- 3. Crear tabla de historial de cambios (auditoría)
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OperationalServersAudit]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[OperationalServersAudit] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [OperationalServerId] INT NOT NULL,
        [ServerName] NVARCHAR(256) NOT NULL,
        [Action] NVARCHAR(50) NOT NULL,                   -- Created, Updated, Deleted, Enabled, Disabled
        [ChangedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [ChangedByUserId] NVARCHAR(450) NOT NULL,
        [ChangedByUserName] NVARCHAR(256) NULL,
        [OldValues] NVARCHAR(MAX) NULL,                   -- JSON con valores anteriores
        [NewValues] NVARCHAR(MAX) NULL,                   -- JSON con valores nuevos
        
        CONSTRAINT [FK_OperationalServersAudit_ChangedBy] FOREIGN KEY ([ChangedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );
    
    PRINT 'Tabla OperationalServersAudit creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla OperationalServersAudit ya existe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OperationalServersAudit_ServerId' AND object_id = OBJECT_ID('OperationalServersAudit'))
BEGIN
    CREATE INDEX [IX_OperationalServersAudit_ServerId] ON [dbo].[OperationalServersAudit]([OperationalServerId]);
    PRINT 'Índice IX_OperationalServersAudit_ServerId creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_OperationalServersAudit_ChangedAt' AND object_id = OBJECT_ID('OperationalServersAudit'))
BEGIN
    CREATE INDEX [IX_OperationalServersAudit_ChangedAt] ON [dbo].[OperationalServersAudit]([ChangedAt] DESC);
    PRINT 'Índice IX_OperationalServersAudit_ChangedAt creado';
END
GO

-- ============================================
-- 4. Agregar permisos para la nueva vista
-- ============================================
-- OperationsConfig: Vista de configuración de servidores operacionales
-- Solo SuperAdmin y usuarios con IsOnCallEscalation tienen acceso

IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'OperationsConfig' AND [Role] = 'SuperAdmin')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('SuperAdmin', 'OperationsConfig', 1, GETDATE());
    PRINT 'Permiso OperationsConfig agregado para SuperAdmin';
END
GO

-- Admin no tiene acceso por defecto (solo SuperAdmin y escalamiento)
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'OperationsConfig' AND [Role] = 'Admin')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Admin', 'OperationsConfig', 0, GETDATE());
    PRINT 'Permiso OperationsConfig agregado para Admin (deshabilitado)';
END
GO

-- Reader no tiene acceso
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'OperationsConfig' AND [Role] = 'Reader')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Reader', 'OperationsConfig', 0, GETDATE());
    PRINT 'Permiso OperationsConfig deshabilitado para Reader';
END
GO

-- ============================================
-- 5. Vista para consultar servidores habilitados
-- ============================================
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_EnabledOperationalServers]'))
BEGIN
    DROP VIEW [dbo].[vw_EnabledOperationalServers];
END
GO

CREATE VIEW [dbo].[vw_EnabledOperationalServers]
AS
SELECT 
    os.Id,
    os.ServerName,
    os.InstanceName,
    os.Description,
    os.Ambiente,
    os.IsFromInventory,
    os.Enabled,
    os.EnabledForRestart,
    os.EnabledForFailover,
    os.EnabledForPatching,
    os.CreatedAt,
    os.CreatedByUserName,
    os.UpdatedAt,
    os.UpdatedByUserName,
    os.Notes
FROM [dbo].[OperationalServers] os
WHERE os.Enabled = 1;
GO

PRINT 'Vista vw_EnabledOperationalServers creada';
GO

-- ============================================
-- 6. Verificar estructura creada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script CreateOperationalServersTables.sql completado';
PRINT '============================================';
PRINT '';

SELECT 'OperationalServers' AS Tabla, COUNT(*) AS Registros FROM OperationalServers
UNION ALL
SELECT 'OperationalServersAudit', COUNT(*) FROM OperationalServersAudit;

PRINT '';
PRINT 'Permisos de OperationsConfig:';
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'OperationsConfig';

GO







