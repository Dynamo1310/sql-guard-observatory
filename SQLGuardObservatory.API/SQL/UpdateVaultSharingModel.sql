-- =============================================
-- Script: UpdateVaultSharingModel.sql
-- Description: Actualiza el modelo de datos del Vault para soportar
--              compartición múltiple estilo Passbolt
-- Database: SQLGuardObservatoryAuth
-- Date: December 2025
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

-- =============================================
-- Tabla: CredentialGroupShares
-- Relación muchos-a-muchos entre Credentials y CredentialGroups
-- Una credencial puede estar compartida con múltiples grupos
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialGroupShares] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [CredentialId] INT NOT NULL,
        [GroupId] INT NOT NULL,
        [SharedByUserId] NVARCHAR(450) NOT NULL,
        [Permission] NVARCHAR(20) NOT NULL DEFAULT 'View',  -- View, Edit, Admin
        [SharedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        CONSTRAINT [FK_CredentialGroupShares_Credential] FOREIGN KEY ([CredentialId]) 
            REFERENCES [dbo].[Credentials]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CredentialGroupShares_Group] FOREIGN KEY ([GroupId]) 
            REFERENCES [dbo].[CredentialGroups]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CredentialGroupShares_SharedBy] FOREIGN KEY ([SharedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        -- Cada credencial solo puede estar una vez en cada grupo
        CONSTRAINT [UQ_CredentialGroupShares_CredentialGroup] UNIQUE ([CredentialId], [GroupId])
    );

    -- Índices para búsquedas frecuentes
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupShares_CredentialId] 
        ON [dbo].[CredentialGroupShares]([CredentialId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupShares_GroupId] 
        ON [dbo].[CredentialGroupShares]([GroupId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupShares_SharedByUserId] 
        ON [dbo].[CredentialGroupShares]([SharedByUserId]);

    PRINT 'Tabla CredentialGroupShares creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialGroupShares ya existe.';
END
GO

-- =============================================
-- Tabla: CredentialUserShares
-- Compartir credenciales directamente con usuarios individuales
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialUserShares] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [CredentialId] INT NOT NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [SharedByUserId] NVARCHAR(450) NOT NULL,
        [Permission] NVARCHAR(20) NOT NULL DEFAULT 'View',  -- View, Edit
        [SharedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        CONSTRAINT [FK_CredentialUserShares_Credential] FOREIGN KEY ([CredentialId]) 
            REFERENCES [dbo].[Credentials]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_CredentialUserShares_User] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        CONSTRAINT [FK_CredentialUserShares_SharedBy] FOREIGN KEY ([SharedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        -- Cada credencial solo puede estar compartida una vez con cada usuario
        CONSTRAINT [UQ_CredentialUserShares_CredentialUser] UNIQUE ([CredentialId], [UserId])
    );

    -- Índices para búsquedas frecuentes
    CREATE NONCLUSTERED INDEX [IX_CredentialUserShares_CredentialId] 
        ON [dbo].[CredentialUserShares]([CredentialId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialUserShares_UserId] 
        ON [dbo].[CredentialUserShares]([UserId]);
    CREATE NONCLUSTERED INDEX [IX_CredentialUserShares_SharedByUserId] 
        ON [dbo].[CredentialUserShares]([SharedByUserId]);

    PRINT 'Tabla CredentialUserShares creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla CredentialUserShares ya existe.';
END
GO

-- =============================================
-- Agregar columna IsTeamShared a Credentials
-- Indica si la credencial está compartida con todo el equipo
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IsTeamShared')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [IsTeamShared] BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsTeamShared agregada a la tabla Credentials.';
END
ELSE
BEGIN
    PRINT 'La columna IsTeamShared ya existe en la tabla Credentials.';
END
GO

-- =============================================
-- Migrar datos existentes (usar EXEC para evitar validación previa)
-- =============================================
-- Migrar credenciales no privadas a IsTeamShared
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IsTeamShared')
BEGIN
    EXEC sp_executesql N'
        UPDATE [dbo].[Credentials] 
        SET [IsTeamShared] = 1 
        WHERE [IsPrivate] = 0 AND [GroupId] IS NULL AND [IsTeamShared] = 0;
    ';
    PRINT 'Credenciales existentes migradas a IsTeamShared.';
END
GO

-- =============================================
-- Migrar credenciales con GroupId a CredentialGroupShares
-- =============================================
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'GroupId')
BEGIN
    INSERT INTO [dbo].[CredentialGroupShares] ([CredentialId], [GroupId], [SharedByUserId], [Permission], [SharedAt])
    SELECT 
        c.[Id],
        c.[GroupId],
        c.[OwnerUserId],
        'Admin',
        c.[CreatedAt]
    FROM [dbo].[Credentials] c
    WHERE c.[GroupId] IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM [dbo].[CredentialGroupShares] cgs 
        WHERE cgs.[CredentialId] = c.[Id] AND cgs.[GroupId] = c.[GroupId]
    );
    
    PRINT 'Credenciales con GroupId migradas a CredentialGroupShares.';
END
GO

-- =============================================
-- Crear índice para búsqueda de credenciales compartidas
-- =============================================
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IsTeamShared')
BEGIN
    IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Credentials_IsTeamShared' AND object_id = OBJECT_ID(N'[dbo].[Credentials]'))
    BEGIN
        EXEC sp_executesql N'
            CREATE NONCLUSTERED INDEX [IX_Credentials_IsTeamShared] 
                ON [dbo].[Credentials]([IsTeamShared]) 
                WHERE [IsDeleted] = 0;
        ';
        PRINT 'Índice IX_Credentials_IsTeamShared creado.';
    END
    ELSE
    BEGIN
        PRINT 'Índice IX_Credentials_IsTeamShared ya existe.';
    END
END
GO

PRINT '============================================='
PRINT 'Script UpdateVaultSharingModel.sql ejecutado correctamente.'
PRINT '============================================='
GO
