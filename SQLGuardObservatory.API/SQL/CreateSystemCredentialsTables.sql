-- =============================================
-- Script: CreateSystemCredentialsTables.sql
-- Descripción: Crea las tablas para credenciales de sistema
--              que SQL Nova usa para conectarse a servidores
-- Fecha: 2024-12
-- =============================================

USE [SQLGuardObservatory];
GO

SET NOCOUNT ON;
PRINT '============================================='
PRINT 'Iniciando creación de tablas de Credenciales de Sistema'
PRINT '============================================='
GO

-- =============================================
-- Tabla: SystemCredentials
-- Almacena las credenciales que la app usa para conectarse a servidores
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemCredentials')
BEGIN
    CREATE TABLE [dbo].[SystemCredentials] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Username] NVARCHAR(256) NOT NULL,
        [Domain] NVARCHAR(256) NULL,
        
        -- Campos de cifrado Enterprise (AES-256-GCM)
        [EncryptedPassword] VARBINARY(MAX) NULL,
        [Salt] VARBINARY(64) NULL,
        [IV] VARBINARY(16) NULL,
        [AuthTag] VARBINARY(16) NULL,
        [KeyId] UNIQUEIDENTIFIER NULL,
        [KeyVersion] INT NOT NULL DEFAULT 1,
        
        -- Estado y auditoría
        [IsActive] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [UpdatedAt] DATETIME2 NULL,
        [CreatedByUserId] NVARCHAR(450) NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        -- Foreign keys
        CONSTRAINT [FK_SystemCredentials_CreatedByUser] 
            FOREIGN KEY ([CreatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id]),
        CONSTRAINT [FK_SystemCredentials_UpdatedByUser] 
            FOREIGN KEY ([UpdatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id])
    );
    
    PRINT 'Tabla SystemCredentials creada exitosamente.'
END
ELSE
BEGIN
    PRINT 'Tabla SystemCredentials ya existe.'
END
GO

-- Índice para búsqueda por nombre
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentials_Name' AND object_id = OBJECT_ID('SystemCredentials'))
BEGIN
    CREATE UNIQUE INDEX [IX_SystemCredentials_Name] ON [dbo].[SystemCredentials]([Name]);
    PRINT 'Índice IX_SystemCredentials_Name creado.'
END
GO

-- Índice para filtrar por estado activo
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentials_IsActive' AND object_id = OBJECT_ID('SystemCredentials'))
BEGIN
    CREATE INDEX [IX_SystemCredentials_IsActive] ON [dbo].[SystemCredentials]([IsActive]);
    PRINT 'Índice IX_SystemCredentials_IsActive creado.'
END
GO

-- =============================================
-- Tabla: SystemCredentialAssignments
-- Define a qué servidores/grupos se aplica cada credencial
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemCredentialAssignments')
BEGIN
    CREATE TABLE [dbo].[SystemCredentialAssignments] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [SystemCredentialId] INT NOT NULL,
        [AssignmentType] NVARCHAR(50) NOT NULL, -- Server, HostingSite, Environment, Pattern
        [AssignmentValue] NVARCHAR(256) NOT NULL,
        [Priority] INT NOT NULL DEFAULT 100, -- Menor = mayor prioridad
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        [CreatedByUserId] NVARCHAR(450) NULL,
        
        -- Foreign keys
        CONSTRAINT [FK_SystemCredentialAssignments_SystemCredential] 
            FOREIGN KEY ([SystemCredentialId]) REFERENCES [dbo].[SystemCredentials]([Id]) ON DELETE CASCADE,
        CONSTRAINT [FK_SystemCredentialAssignments_CreatedByUser] 
            FOREIGN KEY ([CreatedByUserId]) REFERENCES [dbo].[AspNetUsers]([Id])
    );
    
    PRINT 'Tabla SystemCredentialAssignments creada exitosamente.'
END
ELSE
BEGIN
    PRINT 'Tabla SystemCredentialAssignments ya existe.'
END
GO

-- Índice para búsqueda por credencial
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentialAssignments_SystemCredentialId' AND object_id = OBJECT_ID('SystemCredentialAssignments'))
BEGIN
    CREATE INDEX [IX_SystemCredentialAssignments_SystemCredentialId] 
        ON [dbo].[SystemCredentialAssignments]([SystemCredentialId]);
    PRINT 'Índice IX_SystemCredentialAssignments_SystemCredentialId creado.'
END
GO

-- Índice para búsqueda por tipo y valor
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentialAssignments_TypeValue' AND object_id = OBJECT_ID('SystemCredentialAssignments'))
BEGIN
    CREATE INDEX [IX_SystemCredentialAssignments_TypeValue] 
        ON [dbo].[SystemCredentialAssignments]([AssignmentType], [AssignmentValue]);
    PRINT 'Índice IX_SystemCredentialAssignments_TypeValue creado.'
END
GO

-- Índice para ordenar por prioridad
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentialAssignments_Priority' AND object_id = OBJECT_ID('SystemCredentialAssignments'))
BEGIN
    CREATE INDEX [IX_SystemCredentialAssignments_Priority] 
        ON [dbo].[SystemCredentialAssignments]([Priority]);
    PRINT 'Índice IX_SystemCredentialAssignments_Priority creado.'
END
GO

-- =============================================
-- Tabla: SystemCredentialAuditLog
-- Auditoría de uso de credenciales de sistema
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SystemCredentialAuditLog')
BEGIN
    CREATE TABLE [dbo].[SystemCredentialAuditLog] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [SystemCredentialId] INT NOT NULL,
        [Action] NVARCHAR(50) NOT NULL, -- Created, Updated, Deleted, Used, AssignmentAdded, AssignmentRemoved
        [Details] NVARCHAR(MAX) NULL,
        [ServerName] NVARCHAR(256) NULL, -- Para acción "Used"
        [ServiceName] NVARCHAR(100) NULL, -- Ej: "PatchingService", "MonitoringService"
        [UserId] NVARCHAR(450) NULL,
        [UserName] NVARCHAR(256) NULL,
        [IpAddress] NVARCHAR(50) NULL,
        [UserAgent] NVARCHAR(512) NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
        
        -- No FK a SystemCredentials porque puede estar eliminada
        CONSTRAINT [FK_SystemCredentialAuditLog_User] 
            FOREIGN KEY ([UserId]) REFERENCES [dbo].[AspNetUsers]([Id])
    );
    
    PRINT 'Tabla SystemCredentialAuditLog creada exitosamente.'
END
ELSE
BEGIN
    PRINT 'Tabla SystemCredentialAuditLog ya existe.'
END
GO

-- Índice para búsqueda por credencial
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentialAuditLog_SystemCredentialId' AND object_id = OBJECT_ID('SystemCredentialAuditLog'))
BEGIN
    CREATE INDEX [IX_SystemCredentialAuditLog_SystemCredentialId] 
        ON [dbo].[SystemCredentialAuditLog]([SystemCredentialId]);
    PRINT 'Índice IX_SystemCredentialAuditLog_SystemCredentialId creado.'
END
GO

-- Índice para búsqueda por fecha
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SystemCredentialAuditLog_CreatedAt' AND object_id = OBJECT_ID('SystemCredentialAuditLog'))
BEGIN
    CREATE INDEX [IX_SystemCredentialAuditLog_CreatedAt] 
        ON [dbo].[SystemCredentialAuditLog]([CreatedAt] DESC);
    PRINT 'Índice IX_SystemCredentialAuditLog_CreatedAt creado.'
END
GO

-- =============================================
-- Agregar permisos de vista
-- =============================================
PRINT ''
PRINT 'Configurando permisos de vista...'

-- Agregar permiso SystemCredentials para SuperAdmin
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'SuperAdmin' AND [ViewName] = 'SystemCredentials')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    VALUES ('SuperAdmin', 'SystemCredentials', 1);
    PRINT 'Permiso SystemCredentials agregado para SuperAdmin.'
END

-- Agregar permiso SystemCredentials para Admin
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'Admin' AND [ViewName] = 'SystemCredentials')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    VALUES ('Admin', 'SystemCredentials', 1);
    PRINT 'Permiso SystemCredentials agregado para Admin.'
END
GO

-- =============================================
-- Crear llave de cifrado para SystemCredential
-- =============================================
PRINT ''
PRINT 'Verificando llave de cifrado para SystemCredential...'

-- Verificar que la tabla VaultEncryptionKeys existe
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultEncryptionKeys]'))
BEGIN
    -- Verificar si ya existe una llave activa para SystemCredential
    IF NOT EXISTS (
        SELECT 1 FROM [dbo].[VaultEncryptionKeys] 
        WHERE KeyPurpose = 'SystemCredential' AND IsActive = 1
    )
    BEGIN
        DECLARE @NewKeyId UNIQUEIDENTIFIER = NEWID();
        DECLARE @KeyFingerprint VARBINARY(64);
        DECLARE @CreatedByUserId NVARCHAR(450);

        -- Obtener un usuario administrador para registrar quién creó la llave
        SELECT TOP 1 @CreatedByUserId = u.Id
        FROM AspNetUsers u
        INNER JOIN AspNetUserRoles ur ON u.Id = ur.UserId
        INNER JOIN AspNetRoles r ON ur.RoleId = r.Id
        WHERE r.Name = 'Admin' AND u.IsActive = 1
        ORDER BY u.UserName;

        -- Si no hay admin, usar el primer usuario activo
        IF @CreatedByUserId IS NULL
        BEGIN
            SELECT TOP 1 @CreatedByUserId = Id 
            FROM AspNetUsers 
            WHERE IsActive = 1
            ORDER BY UserName;
        END

        -- Generar fingerprint (SHA-256 del KeyId + timestamp)
        SET @KeyFingerprint = HASHBYTES('SHA2_256', 
            CAST(@NewKeyId AS NVARCHAR(36)) + 
            CAST(SYSDATETIMEOFFSET() AS NVARCHAR(50)));

        BEGIN TRY
            INSERT INTO [dbo].[VaultEncryptionKeys] (
                KeyId,
                KeyVersion,
                KeyPurpose,
                Algorithm,
                KeyFingerprint,
                IsActive,
                ActivatedAt,
                CreatedAt,
                CreatedByUserId
            )
            VALUES (
                @NewKeyId,
                1,
                'SystemCredential',
                'AES-256-GCM',
                @KeyFingerprint,
                1, -- IsActive
                SYSDATETIMEOFFSET(),
                SYSDATETIMEOFFSET(),
                ISNULL(@CreatedByUserId, 'SYSTEM')
            );

            PRINT 'Llave de cifrado para SystemCredential creada exitosamente.'
            PRINT '  KeyId: ' + CAST(@NewKeyId AS NVARCHAR(36))
        END TRY
        BEGIN CATCH
            PRINT 'Error al crear llave de cifrado para SystemCredential: ' + ERROR_MESSAGE()
        END CATCH
    END
    ELSE
    BEGIN
        PRINT 'Ya existe una llave activa para SystemCredential.'
    END
END
ELSE
BEGIN
    PRINT 'ADVERTENCIA: La tabla VaultEncryptionKeys no existe. Ejecutar primero VaultEnterprise_Phase1_EncryptionKeys.sql'
END
GO

PRINT ''
PRINT '============================================='
PRINT 'Script CreateSystemCredentialsTables.sql completado.'
PRINT '============================================='
GO

