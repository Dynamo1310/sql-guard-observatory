-- =============================================
-- Script: VaultEnterprise_Phase1_EncryptionKeys.sql
-- Description: Fase 1 - Modelo de llaves con KeyId + KeyVersion + Purpose
-- Database: SQLGuardObservatoryAuth
-- SQL Server: 2017+
-- Date: December 2025
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

PRINT '============================================='
PRINT 'FASE 1: ENCRYPTION KEYS - Vault Enterprise v2.1.1'
PRINT '============================================='
GO

-- Registrar inicio de fase
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase1', 'EncryptionKeys', 'Started');
GO

-- =============================================
-- 1.1 Crear tabla VaultEncryptionKeys
-- Opción A: KeyId = stream por Purpose
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultEncryptionKeys]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VaultEncryptionKeys] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [KeyId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [KeyVersion] INT NOT NULL,
        [KeyPurpose] NVARCHAR(50) NOT NULL DEFAULT 'CredentialPassword',
        -- Purposes: CredentialPassword, CredentialNotes, GroupData
        
        [Algorithm] NVARCHAR(20) NOT NULL DEFAULT 'AES-256-GCM',
        [KeyFingerprint] VARBINARY(64) NOT NULL, -- SHA-512 de la llave
        [IsActive] BIT NOT NULL DEFAULT 0,
        [ActivatedAt] DATETIMEOFFSET NULL,
        [DeactivatedAt] DATETIMEOFFSET NULL,
        [CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT (dbo.fn_GetArgentinaTimeOffset()),
        [CreatedByUserId] NVARCHAR(450) NOT NULL,
        
        -- FIX 1: Constraints para Opcion A (KeyId = stream por Purpose)
        
        -- 1. Cada KeyId puede tener multiples versiones
        CONSTRAINT [UQ_VaultEncryptionKeys_KeyId_Version] 
            UNIQUE ([KeyId], [KeyVersion]),
        
        -- 2. NUEVO: Cada Purpose tiene exactamente un KeyId (1:1)
        CONSTRAINT [UQ_VaultEncryptionKeys_Purpose_KeyId] 
            UNIQUE ([KeyPurpose], [KeyId])
    );
    
    PRINT 'Tabla VaultEncryptionKeys creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla VaultEncryptionKeys ya existe.';
END
GO

-- =============================================
-- 1.2 Filtered index: solo una llave activa por purpose
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_VaultEncryptionKeys_ActivePerPurpose' AND object_id = OBJECT_ID('VaultEncryptionKeys'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_VaultEncryptionKeys_ActivePerPurpose]
    ON [dbo].[VaultEncryptionKeys] ([KeyPurpose])
    WHERE [IsActive] = 1;
    
    PRINT 'Índice IX_VaultEncryptionKeys_ActivePerPurpose creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_VaultEncryptionKeys_ActivePerPurpose ya existe.';
END
GO

-- =============================================
-- 1.3 Index para lookup por KeyId + Version (para FK)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_VaultEncryptionKeys_KeyLookup' AND object_id = OBJECT_ID('VaultEncryptionKeys'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_VaultEncryptionKeys_KeyLookup]
    ON [dbo].[VaultEncryptionKeys] ([KeyId], [KeyVersion])
    INCLUDE ([Algorithm], [KeyPurpose], [IsActive]);
    
    PRINT 'Índice IX_VaultEncryptionKeys_KeyLookup creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_VaultEncryptionKeys_KeyLookup ya existe.';
END
GO

-- =============================================
-- 1.4 Insertar llave inicial para CredentialPassword
-- NOTA: El KeyFingerprint debe ser calculado en la aplicación
-- usando SHA-512 de la MasterKey actual
-- Este es un placeholder - reemplazar con el fingerprint real
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[VaultEncryptionKeys] WHERE [KeyPurpose] = 'CredentialPassword' AND [KeyVersion] = 1)
BEGIN
    -- Fingerprint placeholder: SHA-512 de 'INITIAL_KEY_PLACEHOLDER'
    -- En producción, calcular con la MasterKey real desde la app
    DECLARE @InitialFingerprint VARBINARY(64) = HASHBYTES('SHA2_512', 'REPLACE_WITH_ACTUAL_MASTERKEY_FINGERPRINT');
    
    INSERT INTO [dbo].[VaultEncryptionKeys] 
        ([KeyId], [KeyVersion], [KeyPurpose], [Algorithm], [KeyFingerprint], [IsActive], [ActivatedAt], [CreatedByUserId])
    VALUES 
        (NEWID(), 1, 'CredentialPassword', 'AES-256-GCM', @InitialFingerprint, 1, dbo.fn_GetArgentinaTimeOffset(), 'system-migration');
    
    PRINT 'Llave inicial para CredentialPassword (Version 1) insertada y activada.';
END
ELSE
BEGIN
    PRINT 'Llave inicial para CredentialPassword ya existe.';
END
GO

-- =============================================
-- 1.5 Agregar columnas VARBINARY a Credentials
-- =============================================

-- EncryptedPasswordBin
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPasswordBin')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [EncryptedPasswordBin] VARBINARY(MAX) NULL;
    PRINT 'Columna EncryptedPasswordBin agregada.';
END
GO

-- SaltBin (exactamente 32 bytes)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'SaltBin')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [SaltBin] VARBINARY(32) NULL;
    PRINT 'Columna SaltBin agregada.';
END
GO

-- IVBin (exactamente 12 bytes para GCM)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IVBin')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [IVBin] VARBINARY(12) NULL;
    PRINT 'Columna IVBin agregada.';
END
GO

-- AuthTagBin (exactamente 16 bytes)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'AuthTagBin')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [AuthTagBin] VARBINARY(16) NULL;
    PRINT 'Columna AuthTagBin agregada.';
END
GO

-- KeyId
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'KeyId')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [KeyId] UNIQUEIDENTIFIER NULL;
    PRINT 'Columna KeyId agregada.';
END
GO

-- KeyVersion
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'KeyVersion')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [KeyVersion] INT NULL;
    PRINT 'Columna KeyVersion agregada.';
END
GO

-- Columnas para Notes cifradas
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedNotes')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [EncryptedNotes] VARBINARY(MAX) NULL;
    PRINT 'Columna EncryptedNotes agregada.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'NotesIV')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [NotesIV] VARBINARY(12) NULL;
    PRINT 'Columna NotesIV agregada.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'NotesKeyId')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [NotesKeyId] UNIQUEIDENTIFIER NULL;
    PRINT 'Columna NotesKeyId agregada.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'NotesKeyVersion')
BEGIN
    ALTER TABLE [dbo].[Credentials] ADD [NotesKeyVersion] INT NULL;
    PRINT 'Columna NotesKeyVersion agregada.';
END
GO

-- =============================================
-- 1.6 Backfill KeyId y KeyVersion con llave inicial
-- =============================================
DECLARE @InitialKeyId UNIQUEIDENTIFIER;
SELECT @InitialKeyId = KeyId FROM VaultEncryptionKeys WHERE KeyVersion = 1 AND KeyPurpose = 'CredentialPassword';

IF @InitialKeyId IS NOT NULL
BEGIN
    UPDATE [dbo].[Credentials] 
    SET [KeyId] = @InitialKeyId, [KeyVersion] = 1
    WHERE [EncryptedPassword] IS NOT NULL AND [KeyId] IS NULL;
    
    PRINT 'Backfill de KeyId/KeyVersion completado. Filas actualizadas: ' + CAST(@@ROWCOUNT AS VARCHAR);
END
ELSE
BEGIN
    PRINT 'WARNING: No se encontró llave inicial para backfill.';
END
GO

-- Registrar completado
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase1' AND [Step] = 'EncryptionKeys' AND [CompletedAt] IS NULL;
GO

PRINT '============================================='
PRINT 'FASE 1.1 COMPLETADA: VaultEncryptionKeys'
PRINT '- Tabla creada con UNIQUE(KeyId, KeyVersion)'
PRINT '- Constraint UNIQUE(KeyPurpose, KeyId) para Opción A'
PRINT '- Filtered index para llave activa por purpose'
PRINT '- Columnas VARBINARY agregadas a Credentials'
PRINT '- Backfill de KeyId/KeyVersion ejecutado'
PRINT '============================================='
GO

