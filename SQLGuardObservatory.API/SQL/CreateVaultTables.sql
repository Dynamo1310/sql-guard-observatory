-- =============================================
-- Script: CreateVaultTables.sql
-- Description: Crea las tablas para el Vault de Credenciales DBA
-- Database: SQLGuardObservatoryAuth
-- Date: December 2025
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

-- =============================================
-- Tabla de grupos de credenciales
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroups]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialGroups] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Name] NVARCHAR(256) NOT NULL,
        [Description] NVARCHAR(1000) NULL,
        [Color] NVARCHAR(7) NULL,           -- Color hex: #RRGGBB
        [Icon] NVARCHAR(50) NULL,           -- Nombre del icono (Lucide)
        [OwnerUserId] NVARCHAR(450) NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        [IsDeleted] BIT NOT NULL DEFAULT 0,
        
        CONSTRAINT [FK_CredentialGroups_Owner] FOREIGN KEY ([OwnerUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CredentialGroups_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );

    CREATE NONCLUSTERED INDEX [IX_CredentialGroups_OwnerUserId] ON [dbo].[CredentialGroups]([OwnerUserId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialGroups_IsDeleted] ON [dbo].[CredentialGroups]([IsDeleted]);
    CREATE NONCLUSTERED INDEX [IX_CredentialGroups_Name] ON [dbo].[CredentialGroups]([Name]);

    PRINT 'Tabla CredentialGroups creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialGroups ya existe.';
END
GO

-- =============================================
-- Tabla de miembros de grupos (quién puede ver cada grupo)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupMembers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialGroupMembers] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [GroupId] INT NOT NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [Role] NVARCHAR(20) NOT NULL DEFAULT 'Viewer',  -- Owner, Admin, Member, Viewer
        [ReceiveNotifications] BIT NOT NULL DEFAULT 1,
        [AddedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [AddedByUserId] NVARCHAR(450) NULL,
        
        CONSTRAINT [FK_CredentialGroupMembers_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[CredentialGroups]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CredentialGroupMembers_User] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CredentialGroupMembers_AddedBy] FOREIGN KEY ([AddedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        -- Cada usuario solo puede estar una vez en cada grupo
        CONSTRAINT [UQ_CredentialGroupMembers_GroupUser] UNIQUE ([GroupId], [UserId])
    );

    CREATE NONCLUSTERED INDEX [IX_CredentialGroupMembers_GroupId] ON [dbo].[CredentialGroupMembers]([GroupId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupMembers_UserId] ON [dbo].[CredentialGroupMembers]([UserId]);

    PRINT 'Tabla CredentialGroupMembers creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialGroupMembers ya existe.';
END
GO

-- =============================================
-- Tabla principal de credenciales
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[Credentials] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Name] NVARCHAR(256) NOT NULL,
        [CredentialType] NVARCHAR(50) NOT NULL,  -- 'SqlAuth', 'WindowsAD', 'Other'
        [Username] NVARCHAR(256) NOT NULL,
        [EncryptedPassword] NVARCHAR(MAX) NOT NULL,
        [Salt] NVARCHAR(256) NOT NULL,
        [IV] NVARCHAR(256) NOT NULL,
        [Domain] NVARCHAR(256) NULL,
        [Description] NVARCHAR(1000) NULL,
        [Notes] NVARCHAR(MAX) NULL,
        [ExpiresAt] DATETIME2 NULL,
        [IsPrivate] BIT NOT NULL DEFAULT 0,
        [GroupId] INT NULL,                      -- Grupo al que pertenece (opcional)
        [OwnerUserId] NVARCHAR(450) NOT NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [CreatedByUserId] NVARCHAR(450) NOT NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        [IsDeleted] BIT NOT NULL DEFAULT 0,
        
        CONSTRAINT [FK_Credentials_Owner] FOREIGN KEY ([OwnerUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Credentials_CreatedBy] FOREIGN KEY ([CreatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Credentials_UpdatedBy] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_Credentials_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[CredentialGroups]([Id]) ON DELETE SET NULL
    );

    -- Índices para búsquedas frecuentes
    CREATE NONCLUSTERED INDEX [IX_Credentials_OwnerUserId] ON [dbo].[Credentials]([OwnerUserId]);
    CREATE NONCLUSTERED INDEX [IX_Credentials_IsPrivate] ON [dbo].[Credentials]([IsPrivate]);
    CREATE NONCLUSTERED INDEX [IX_Credentials_IsDeleted] ON [dbo].[Credentials]([IsDeleted]);
    CREATE NONCLUSTERED INDEX [IX_Credentials_ExpiresAt] ON [dbo].[Credentials]([ExpiresAt]) WHERE [ExpiresAt] IS NOT NULL;
    CREATE NONCLUSTERED INDEX [IX_Credentials_CredentialType] ON [dbo].[Credentials]([CredentialType]);
    CREATE NONCLUSTERED INDEX [IX_Credentials_Name] ON [dbo].[Credentials]([Name]);
    CREATE NONCLUSTERED INDEX [IX_Credentials_GroupId] ON [dbo].[Credentials]([GroupId]) WHERE [GroupId] IS NOT NULL;

    PRINT 'Tabla Credentials creada exitosamente.';
END
ELSE
BEGIN
    -- Si la tabla ya existe, agregar columna GroupId si no existe
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'GroupId')
    BEGIN
        ALTER TABLE [dbo].[Credentials] ADD [GroupId] INT NULL;
        
        -- Agregar FK y índice
        ALTER TABLE [dbo].[Credentials] 
            ADD CONSTRAINT [FK_Credentials_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[CredentialGroups]([Id]) ON DELETE SET NULL;
        
        CREATE NONCLUSTERED INDEX [IX_Credentials_GroupId] ON [dbo].[Credentials]([GroupId]) WHERE [GroupId] IS NOT NULL;
        
        PRINT 'Columna GroupId agregada a la tabla Credentials.';
    END
    ELSE
    BEGIN
        PRINT 'La tabla Credentials ya existe con GroupId.';
    END
END
GO

-- =============================================
-- Tabla de relación credenciales-servidores (muchos a muchos)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialServers]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialServers] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [CredentialId] INT NOT NULL,
        [ServerName] NVARCHAR(256) NOT NULL,
        [InstanceName] NVARCHAR(256) NULL,
        [ConnectionPurpose] NVARCHAR(256) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        CONSTRAINT [FK_CredentialServers_Credential] FOREIGN KEY ([CredentialId]) 
            REFERENCES [dbo].[Credentials]([Id]) ON DELETE CASCADE
    );

    -- Índices
    CREATE NONCLUSTERED INDEX [IX_CredentialServers_CredentialId] ON [dbo].[CredentialServers]([CredentialId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialServers_ServerName] ON [dbo].[CredentialServers]([ServerName]);
    
    -- Índice único para evitar duplicados de credencial+servidor
    CREATE UNIQUE NONCLUSTERED INDEX [IX_CredentialServers_Unique] 
        ON [dbo].[CredentialServers]([CredentialId], [ServerName], [InstanceName]) 
        WHERE [InstanceName] IS NOT NULL;

    PRINT 'Tabla CredentialServers creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialServers ya existe.';
END
GO

-- =============================================
-- Tabla de auditoría de credenciales
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialAuditLog] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [CredentialId] INT NOT NULL,
        [CredentialName] NVARCHAR(256) NOT NULL,
        [Action] NVARCHAR(50) NOT NULL,  -- 'Created','Updated','Deleted','Viewed','PasswordRevealed','PasswordCopied'
        [ChangedFields] NVARCHAR(MAX) NULL,
        [PerformedByUserId] NVARCHAR(450) NOT NULL,
        [PerformedByUserName] NVARCHAR(256) NULL,
        [PerformedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [IpAddress] NVARCHAR(50) NULL,
        [UserAgent] NVARCHAR(500) NULL
    );

    -- Índices para consultas frecuentes
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_CredentialId] ON [dbo].[CredentialAuditLog]([CredentialId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_PerformedByUserId] ON [dbo].[CredentialAuditLog]([PerformedByUserId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_PerformedAt] ON [dbo].[CredentialAuditLog]([PerformedAt] DESC);
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_Action] ON [dbo].[CredentialAuditLog]([Action]);

    PRINT 'Tabla CredentialAuditLog creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialAuditLog ya existe.';
END
GO

-- =============================================
-- Agregar permisos del Vault a RolePermissions
-- =============================================
DECLARE @VaultPermissions TABLE (ViewName NVARCHAR(50));
INSERT INTO @VaultPermissions VALUES 
    ('VaultDashboard'),
    ('VaultCredentials'),
    ('VaultMyCredentials'),
    ('VaultAudit'),
    ('VaultAdmin'),
    ('VaultGroups');  -- Nuevo permiso para gestión de grupos

-- SuperAdmin: todos los permisos del Vault
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
SELECT 'SuperAdmin', vp.ViewName, 1
FROM @VaultPermissions vp
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp 
    WHERE rp.[Role] = 'SuperAdmin' AND rp.[ViewName] = vp.ViewName
);

-- Admin: todos excepto VaultAdmin
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
SELECT 'Admin', vp.ViewName, 1
FROM @VaultPermissions vp
WHERE vp.ViewName NOT IN ('VaultAdmin')
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp 
    WHERE rp.[Role] = 'Admin' AND rp.[ViewName] = vp.ViewName
);

-- Reader: solo VaultDashboard y VaultMyCredentials
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
SELECT 'Reader', vp.ViewName, 1
FROM @VaultPermissions vp
WHERE vp.ViewName IN ('VaultDashboard', 'VaultMyCredentials')
AND NOT EXISTS (
    SELECT 1 FROM [dbo].[RolePermissions] rp 
    WHERE rp.[Role] = 'Reader' AND rp.[ViewName] = vp.ViewName
);

PRINT 'Permisos del Vault agregados exitosamente.';
GO

PRINT '============================================='
PRINT 'Script CreateVaultTables.sql ejecutado correctamente.'
PRINT '============================================='
GO
