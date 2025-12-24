-- =============================================
-- Script: CreateVaultNotificationPreferences.sql
-- Descripción: Crea la tabla de preferencias de notificaciones del Vault
-- Fecha: 2025-01-21
-- =============================================

USE [SQLGuardObservatory]
GO

-- =============================================
-- 1. Crear tabla VaultNotificationPreferences
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultNotificationPreferences]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VaultNotificationPreferences] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Usuario al que pertenece la preferencia
        [UserId] NVARCHAR(450) NOT NULL,
        
        -- Tipo de notificación
        [NotificationType] NVARCHAR(50) NOT NULL,
        
        -- Si está habilitada o no
        [IsEnabled] BIT NOT NULL DEFAULT 1,
        
        -- Timestamps
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME2 NULL,
        
        -- Foreign key a AspNetUsers
        CONSTRAINT [FK_VaultNotificationPreferences_User] FOREIGN KEY ([UserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE CASCADE,
        
        -- Cada usuario solo puede tener una preferencia por tipo de notificación
        CONSTRAINT [UQ_VaultNotificationPreferences_UserType] UNIQUE ([UserId], [NotificationType])
    );

    -- Índices para búsquedas frecuentes
    CREATE NONCLUSTERED INDEX [IX_VaultNotificationPreferences_UserId] 
        ON [dbo].[VaultNotificationPreferences]([UserId]);
    CREATE NONCLUSTERED INDEX [IX_VaultNotificationPreferences_NotificationType] 
        ON [dbo].[VaultNotificationPreferences]([NotificationType]);

    PRINT 'Tabla VaultNotificationPreferences creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'La tabla VaultNotificationPreferences ya existe.';
END
GO

-- =============================================
-- 2. Crear tabla de tipos de notificación disponibles
-- Esto permite que el sistema conozca todos los tipos y sus valores por defecto
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultNotificationTypes]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VaultNotificationTypes] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        
        -- Código del tipo (usado internamente)
        [Code] NVARCHAR(50) NOT NULL UNIQUE,
        
        -- Nombre para mostrar
        [DisplayName] NVARCHAR(100) NOT NULL,
        
        -- Descripción detallada
        [Description] NVARCHAR(500) NOT NULL,
        
        -- Si está habilitado por defecto para nuevos usuarios
        [DefaultEnabled] BIT NOT NULL DEFAULT 1,
        
        -- Orden de visualización
        [DisplayOrder] INT NOT NULL DEFAULT 0,
        
        -- Categoría de la notificación
        [Category] NVARCHAR(50) NOT NULL DEFAULT 'General',
        
        -- Si el tipo está activo en el sistema
        [IsActive] BIT NOT NULL DEFAULT 1
    );

    PRINT 'Tabla VaultNotificationTypes creada exitosamente.';
END
GO

-- =============================================
-- 3. Insertar tipos de notificación por defecto
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[VaultNotificationTypes] WHERE [Code] = 'VaultCredentialCreated')
BEGIN
    INSERT INTO [dbo].[VaultNotificationTypes] ([Code], [DisplayName], [Description], [DefaultEnabled], [DisplayOrder], [Category])
    VALUES 
    ('VaultCredentialCreated', 'Credencial Creada', 
     'Recibe notificaciones cuando se crea una nueva credencial en un grupo donde eres miembro o cuando alguien crea una credencial compartida contigo.', 
     1, 1, 'Credenciales'),
    
    ('VaultCredentialUpdated', 'Credencial Actualizada', 
     'Recibe notificaciones cuando se actualiza una credencial a la que tienes acceso, incluyendo cambios de contraseña.', 
     1, 2, 'Credenciales'),
    
    ('VaultCredentialDeleted', 'Credencial Eliminada', 
     'Recibe notificaciones cuando se elimina una credencial a la que tenías acceso.', 
     1, 3, 'Credenciales'),
    
    ('VaultCredentialShared', 'Credencial Compartida', 
     'Recibe notificaciones cuando alguien comparte una credencial directamente contigo.', 
     1, 4, 'Compartir'),
    
    ('VaultGroupMemberAdded', 'Agregado a Grupo', 
     'Recibe notificaciones cuando te agregan a un grupo de credenciales.', 
     1, 5, 'Grupos'),
    
    ('VaultGroupMemberRemoved', 'Removido de Grupo', 
     'Recibe notificaciones cuando te remueven de un grupo de credenciales.', 
     1, 6, 'Grupos'),
    
    ('VaultCredentialExpiring', 'Credencial por Expirar', 
     'Recibe notificaciones cuando una credencial a la que tienes acceso está próxima a expirar.', 
     1, 7, 'Alertas'),
    
    ('VaultPasswordRevealed', 'Contraseña Revelada', 
     'Recibe notificaciones cuando alguien revela una contraseña de una credencial que tú creaste o compartiste.', 
     0, 8, 'Seguridad'),
    
    ('VaultShareRevoked', 'Acceso Revocado', 
     'Recibe notificaciones cuando te revocan el acceso a una credencial compartida.', 
     1, 9, 'Compartir');

    PRINT 'Tipos de notificación insertados exitosamente.';
END
GO

-- =============================================
-- 4. Procedimiento para inicializar preferencias de un usuario
-- Crea las preferencias por defecto cuando un usuario accede por primera vez
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[sp_InitializeVaultNotificationPreferences]') AND type in (N'P'))
    DROP PROCEDURE [dbo].[sp_InitializeVaultNotificationPreferences];
GO

CREATE PROCEDURE [dbo].[sp_InitializeVaultNotificationPreferences]
    @UserId NVARCHAR(450)
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Insertar preferencias para todos los tipos que el usuario no tenga
    INSERT INTO [dbo].[VaultNotificationPreferences] ([UserId], [NotificationType], [IsEnabled], [CreatedAt])
    SELECT 
        @UserId,
        nt.[Code],
        nt.[DefaultEnabled],
        GETDATE()
    FROM [dbo].[VaultNotificationTypes] nt
    WHERE nt.[IsActive] = 1
    AND NOT EXISTS (
        SELECT 1 
        FROM [dbo].[VaultNotificationPreferences] np 
        WHERE np.[UserId] = @UserId 
        AND np.[NotificationType] = nt.[Code]
    );
    
    -- Retornar las preferencias del usuario
    SELECT 
        np.[Id],
        np.[UserId],
        np.[NotificationType],
        np.[IsEnabled],
        np.[CreatedAt],
        np.[UpdatedAt],
        nt.[DisplayName],
        nt.[Description],
        nt.[Category],
        nt.[DisplayOrder]
    FROM [dbo].[VaultNotificationPreferences] np
    INNER JOIN [dbo].[VaultNotificationTypes] nt ON np.[NotificationType] = nt.[Code]
    WHERE np.[UserId] = @UserId
    AND nt.[IsActive] = 1
    ORDER BY nt.[DisplayOrder];
END
GO

PRINT 'Procedimiento sp_InitializeVaultNotificationPreferences creado exitosamente.';
GO

-- =============================================
-- 5. Función para verificar si un usuario tiene habilitada una notificación
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[fn_ShouldNotifyUser]') AND type in (N'FN'))
    DROP FUNCTION [dbo].[fn_ShouldNotifyUser];
GO

CREATE FUNCTION [dbo].[fn_ShouldNotifyUser]
(
    @UserId NVARCHAR(450),
    @NotificationType NVARCHAR(50)
)
RETURNS BIT
AS
BEGIN
    DECLARE @IsEnabled BIT;
    DECLARE @DefaultEnabled BIT;
    
    -- Buscar la preferencia del usuario
    SELECT @IsEnabled = [IsEnabled]
    FROM [dbo].[VaultNotificationPreferences]
    WHERE [UserId] = @UserId AND [NotificationType] = @NotificationType;
    
    -- Si no existe preferencia, usar el valor por defecto del tipo
    IF @IsEnabled IS NULL
    BEGIN
        SELECT @DefaultEnabled = [DefaultEnabled]
        FROM [dbo].[VaultNotificationTypes]
        WHERE [Code] = @NotificationType AND [IsActive] = 1;
        
        SET @IsEnabled = ISNULL(@DefaultEnabled, 1);
    END
    
    RETURN @IsEnabled;
END
GO

PRINT 'Función fn_ShouldNotifyUser creada exitosamente.';
GO

PRINT '========================================';
PRINT 'Script completado exitosamente.';
PRINT '========================================';

