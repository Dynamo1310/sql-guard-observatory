-- =============================================
-- Script: VaultEnterprise_Phase8_Cleanup.sql
-- Description: Fase 8 - Limpieza de columnas legacy
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
--
-- PREREQUISITOS:
-- 1. Deploy 1 (dual-read) completado en producción
-- 2. Backfill completado: PendingCrypto = 0, PendingPermissions = 0
-- 3. Deploy 2 (single-read) exitoso
-- 4. Gate de recertificación de permisos cerrado
--
-- IMPORTANTE: NO ejecutar hasta que todos los gates estén cerrados
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'FASE 8: CLEANUP - Vault Enterprise v2.1.1'
PRINT ''
PRINT 'ADVERTENCIA: Este script elimina columnas legacy.'
PRINT 'Ejecutar SOLO después de completar todos los gates.'
PRINT '============================================='
GO

-- Registrar inicio
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase8', 'Cleanup', 'Started');
GO

-- =============================================
-- Paso 1: Validar migración completa
-- =============================================
PRINT '=== Paso 1: Validando migración completa ==='

DECLARE @PendingCrypto INT = 0;
DECLARE @PendingUserPermissions INT = 0;
DECLARE @PendingGroupPermissions INT = 0;
DECLARE @CredentialsWithoutKeyVersion INT = 0;

-- Verificar crypto migration
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPasswordBin')
BEGIN
    SELECT @PendingCrypto = COUNT(*)
    FROM [dbo].[Credentials]
    WHERE [EncryptedPasswordBin] IS NULL 
      AND [EncryptedPassword] IS NOT NULL;
END

-- Verificar permissions migration
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'PermissionBitMask')
BEGIN
    SELECT @PendingUserPermissions = COUNT(*)
    FROM [dbo].[CredentialUserShares]
    WHERE [PermissionBitMask] IS NULL;
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'PermissionBitMask')
BEGIN
    SELECT @PendingGroupPermissions = COUNT(*)
    FROM [dbo].[CredentialGroupShares]
    WHERE [PermissionBitMask] IS NULL;
END

-- Verificar KeyVersion
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'KeyVersion')
BEGIN
    SELECT @CredentialsWithoutKeyVersion = COUNT(*)
    FROM [dbo].[Credentials]
    WHERE [KeyVersion] IS NULL AND [EncryptedPasswordBin] IS NOT NULL;
END

PRINT 'PendingCrypto: ' + CAST(@PendingCrypto AS VARCHAR);
PRINT 'PendingUserPermissions: ' + CAST(@PendingUserPermissions AS VARCHAR);
PRINT 'PendingGroupPermissions: ' + CAST(@PendingGroupPermissions AS VARCHAR);
PRINT 'CredentialsWithoutKeyVersion: ' + CAST(@CredentialsWithoutKeyVersion AS VARCHAR);

IF @PendingCrypto > 0 OR @PendingUserPermissions > 0 OR @PendingGroupPermissions > 0 OR @CredentialsWithoutKeyVersion > 0
BEGIN
    RAISERROR('Migración incompleta. No se puede proceder con cleanup.', 16, 1);
    -- Actualizar log
    UPDATE [dbo].[VaultMigrationLog] 
    SET [Status] = 'Failed', [ErrorMessage] = 'Migration validation failed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
    WHERE [Phase] = 'Phase8' AND [Step] = 'Cleanup' AND [CompletedAt] IS NULL;
    RETURN;
END

PRINT 'Validación OK: Migración completa.';
GO

-- =============================================
-- Paso 2: Eliminar índices que referencian columnas legacy
-- =============================================
PRINT ''
PRINT '=== Paso 2: Eliminando índices legacy ==='

-- Verificar y eliminar índices viejos de GroupShares (si incluyen Permission string)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CredentialGroupShares_GroupLookup_OLD' AND object_id = OBJECT_ID('CredentialGroupShares'))
BEGIN
    DROP INDEX [IX_CredentialGroupShares_GroupLookup_OLD] ON [dbo].[CredentialGroupShares];
    PRINT 'Índice IX_CredentialGroupShares_GroupLookup_OLD eliminado.';
END

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CredentialGroupShares_CredentialLookup_OLD' AND object_id = OBJECT_ID('CredentialGroupShares'))
BEGIN
    DROP INDEX [IX_CredentialGroupShares_CredentialLookup_OLD] ON [dbo].[CredentialGroupShares];
    PRINT 'Índice IX_CredentialGroupShares_CredentialLookup_OLD eliminado.';
END

PRINT 'Índices legacy eliminados.';
GO

-- =============================================
-- Paso 3: Eliminar columnas crypto legacy
-- =============================================
PRINT ''
PRINT '=== Paso 3: Eliminando columnas crypto legacy ==='

-- Eliminar EncryptedPassword (string/Base64)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPassword')
BEGIN
    ALTER TABLE [dbo].[Credentials] DROP COLUMN [EncryptedPassword];
    PRINT 'Columna EncryptedPassword eliminada.';
END

-- Eliminar Salt (string/Base64)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'Salt')
BEGIN
    ALTER TABLE [dbo].[Credentials] DROP COLUMN [Salt];
    PRINT 'Columna Salt eliminada.';
END

-- Eliminar IV (string/Base64)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IV')
BEGIN
    ALTER TABLE [dbo].[Credentials] DROP COLUMN [IV];
    PRINT 'Columna IV eliminada.';
END
GO

-- =============================================
-- Paso 4: Renombrar columnas nuevas
-- =============================================
PRINT ''
PRINT '=== Paso 4: Renombrando columnas VARBINARY ==='

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPasswordBin')
BEGIN
    EXEC sp_rename 'Credentials.EncryptedPasswordBin', 'EncryptedPassword', 'COLUMN';
    PRINT 'Columna EncryptedPasswordBin renombrada a EncryptedPassword.';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'SaltBin')
BEGIN
    EXEC sp_rename 'Credentials.SaltBin', 'Salt', 'COLUMN';
    PRINT 'Columna SaltBin renombrada a Salt.';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'IVBin')
BEGIN
    EXEC sp_rename 'Credentials.IVBin', 'IV', 'COLUMN';
    PRINT 'Columna IVBin renombrada a IV.';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'AuthTagBin')
BEGIN
    EXEC sp_rename 'Credentials.AuthTagBin', 'AuthTag', 'COLUMN';
    PRINT 'Columna AuthTagBin renombrada a AuthTag.';
END
GO

-- =============================================
-- Paso 5: Eliminar columna Permission string
-- =============================================
PRINT ''
PRINT '=== Paso 5: Eliminando columnas Permission (string) ==='

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'Permission')
BEGIN
    ALTER TABLE [dbo].[CredentialUserShares] DROP COLUMN [Permission];
    PRINT 'Columna Permission eliminada de CredentialUserShares.';
END

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'Permission')
BEGIN
    ALTER TABLE [dbo].[CredentialGroupShares] DROP COLUMN [Permission];
    PRINT 'Columna Permission eliminada de CredentialGroupShares.';
END
GO

-- =============================================
-- Paso 6: Rebuild índices finales
-- =============================================
PRINT ''
PRINT '=== Paso 6: Rebuild de índices finales ==='

-- MyVault index (recrear si es necesario)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Credentials_MyVault' AND object_id = OBJECT_ID('Credentials'))
BEGIN
    DROP INDEX [IX_Credentials_MyVault] ON [dbo].[Credentials];
END

CREATE NONCLUSTERED INDEX [IX_Credentials_MyVault]
ON [dbo].[Credentials] ([IsDeleted], [OwnerUserId])
INCLUDE ([Name], [CredentialType], [Username], [Description], [IsPrivate], [IsTeamShared], [ExpiresAt], [CreatedAt])
WHERE [IsDeleted] = 0;

PRINT 'Índice IX_Credentials_MyVault recreado.';
GO

-- =============================================
-- Paso 7: Actualizar estadísticas
-- =============================================
PRINT ''
PRINT '=== Paso 7: Actualizando estadísticas ==='

UPDATE STATISTICS [dbo].[Credentials];
UPDATE STATISTICS [dbo].[CredentialUserShares];
UPDATE STATISTICS [dbo].[CredentialGroupShares];

PRINT 'Estadísticas actualizadas.';
GO

-- =============================================
-- Registrar completado
-- =============================================
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase8' AND [Step] = 'Cleanup' AND [CompletedAt] IS NULL;
GO

PRINT ''
PRINT '============================================='
PRINT 'FASE 8 COMPLETADA: Cleanup'
PRINT '- Columnas crypto legacy eliminadas'
PRINT '- Columnas VARBINARY renombradas'
PRINT '- Columnas Permission string eliminadas'
PRINT '- Índices rebuild completado'
PRINT '- Estadísticas actualizadas'
PRINT ''
PRINT 'MIGRACION VAULT ENTERPRISE v2.1.1 COMPLETADA'
PRINT '============================================='
GO

