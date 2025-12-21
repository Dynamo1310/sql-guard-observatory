-- =============================================
-- VAULT ENTERPRISE v2.1 - CREAR LLAVE INICIAL
-- =============================================
-- Propósito: Crear la primera llave de cifrado activa para el Vault.
-- IMPORTANTE: Ejecutar después de Phase1_EncryptionKeys.sql
-- =============================================
-- Fecha: 2024
-- Compatibilidad: SQL Server 2017+
-- =============================================

USE [SQLNovaDb]
GO

PRINT '=================================================';
PRINT 'VAULT ENTERPRISE - CREACIÓN DE LLAVE INICIAL';
PRINT '=================================================';

-- =============================================
-- VERIFICACIONES PREVIAS
-- =============================================

-- Verificar que la tabla existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultEncryptionKeys]'))
BEGIN
    PRINT '❌ ERROR: La tabla VaultEncryptionKeys no existe.';
    PRINT '   Ejecutar primero: VaultEnterprise_Phase1_EncryptionKeys.sql';
    RETURN;
END

-- Verificar si ya existe una llave activa para CredentialPassword
IF EXISTS (
    SELECT 1 FROM [dbo].[VaultEncryptionKeys] 
    WHERE KeyPurpose = 'CredentialPassword' AND IsActive = 1
)
BEGIN
    PRINT '✅ Ya existe una llave activa para CredentialPassword:';
    
    SELECT 
        KeyId,
        KeyVersion,
        KeyPurpose,
        Algorithm,
        IsActive,
        ActivatedAt,
        CreatedAt
    FROM [dbo].[VaultEncryptionKeys]
    WHERE KeyPurpose = 'CredentialPassword' AND IsActive = 1;
    
    PRINT '';
    PRINT 'No se creará una nueva llave.';
    RETURN;
END

-- =============================================
-- CREAR LLAVE INICIAL
-- =============================================

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

PRINT 'Creando llave inicial...';
PRINT '  KeyId: ' + CAST(@NewKeyId AS NVARCHAR(36));
PRINT '  KeyVersion: 1';
PRINT '  KeyPurpose: CredentialPassword';
PRINT '  Algorithm: AES-256-GCM';
PRINT '  CreatedBy: ' + ISNULL(@CreatedByUserId, 'SYSTEM');

BEGIN TRY
    BEGIN TRANSACTION;

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
        'CredentialPassword',
        'AES-256-GCM',
        @KeyFingerprint,
        1, -- IsActive
        SYSDATETIMEOFFSET(),
        SYSDATETIMEOFFSET(),
        ISNULL(@CreatedByUserId, 'SYSTEM')
    );

    COMMIT TRANSACTION;

    PRINT '';
    PRINT '✅ Llave inicial creada exitosamente.';
    PRINT '';
    
    -- Mostrar la llave creada
    SELECT 
        KeyId,
        KeyVersion,
        KeyPurpose,
        Algorithm,
        IsActive,
        ActivatedAt,
        CreatedAt,
        CreatedByUserId
    FROM [dbo].[VaultEncryptionKeys]
    WHERE KeyId = @NewKeyId;

END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    
    PRINT '❌ ERROR al crear la llave inicial:';
    PRINT ERROR_MESSAGE();
    
    THROW;
END CATCH
GO

-- =============================================
-- VERIFICACIÓN FINAL
-- =============================================

PRINT '';
PRINT '=================================================';
PRINT 'VERIFICACIÓN FINAL';
PRINT '=================================================';

SELECT 
    KeyId,
    KeyVersion,
    KeyPurpose,
    Algorithm,
    IsActive,
    ActivatedAt,
    CreatedAt
FROM [dbo].[VaultEncryptionKeys]
ORDER BY KeyPurpose, KeyVersion;

PRINT '';
PRINT 'Próximo paso: Ejecutar el backfill desde la aplicación.';
PRINT '  1. Iniciar la aplicación';
PRINT '  2. Llamar a POST /api/VaultMigration/backfill';
PRINT '  3. Verificar con GET /api/VaultMigration/status';
GO

