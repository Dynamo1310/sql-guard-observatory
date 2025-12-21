-- =============================================
-- Script: VaultEnterprise_Phase1_ForeignKeys.sql
-- Description: Fase 1.2 - FK Compuestas para KeyId + KeyVersion
-- Database: SQLGuardObservatoryAuth
-- SQL Server: 2017+
-- Date: December 2025
-- PREREQUISITE: Ejecutar VaultEnterprise_Phase1_EncryptionKeys.sql primero
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

PRINT '============================================='
PRINT 'FASE 1.2: FK COMPUESTAS - Vault Enterprise v2.1.1'
PRINT '============================================='
GO

-- Registrar inicio
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase1', 'ForeignKeys', 'Started');
GO

-- =============================================
-- Validar que backfill está completo antes de crear FK
-- =============================================
DECLARE @PendingBackfill INT;
SELECT @PendingBackfill = COUNT(*)
FROM [dbo].[Credentials]
WHERE [EncryptedPassword] IS NOT NULL AND [KeyId] IS NULL;

IF @PendingBackfill > 0
BEGIN
    RAISERROR('ERROR: Hay %d credenciales sin KeyId. Ejecutar backfill primero.', 16, 1, @PendingBackfill);
    -- No continuar
END
GO

-- =============================================
-- Crear FK compuesta para Credentials -> VaultEncryptionKeys
-- Paso 1: WITH NOCHECK (para datos existentes)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Credentials_EncryptionKey')
BEGIN
    ALTER TABLE [dbo].[Credentials] WITH NOCHECK
    ADD CONSTRAINT [FK_Credentials_EncryptionKey] 
        FOREIGN KEY ([KeyId], [KeyVersion]) 
        REFERENCES [dbo].[VaultEncryptionKeys] ([KeyId], [KeyVersion]);
    
    PRINT 'FK_Credentials_EncryptionKey creada con NOCHECK.';
END
ELSE
BEGIN
    PRINT 'FK_Credentials_EncryptionKey ya existe.';
END
GO

-- =============================================
-- Crear FK compuesta para Notes -> VaultEncryptionKeys
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Credentials_NotesEncryptionKey')
BEGIN
    ALTER TABLE [dbo].[Credentials] WITH NOCHECK
    ADD CONSTRAINT [FK_Credentials_NotesEncryptionKey] 
        FOREIGN KEY ([NotesKeyId], [NotesKeyVersion]) 
        REFERENCES [dbo].[VaultEncryptionKeys] ([KeyId], [KeyVersion]);
    
    PRINT 'FK_Credentials_NotesEncryptionKey creada con NOCHECK.';
END
ELSE
BEGIN
    PRINT 'FK_Credentials_NotesEncryptionKey ya existe.';
END
GO

-- =============================================
-- Paso 2: Validar datos existentes
-- =============================================
PRINT 'Validando integridad de FK...';

DECLARE @InvalidCredentialKeys INT;
SELECT @InvalidCredentialKeys = COUNT(*)
FROM [dbo].[Credentials] c
WHERE c.[KeyId] IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM [dbo].[VaultEncryptionKeys] vek 
      WHERE vek.[KeyId] = c.[KeyId] AND vek.[KeyVersion] = c.[KeyVersion]
  );

IF @InvalidCredentialKeys > 0
BEGIN
    PRINT 'WARNING: Hay ' + CAST(@InvalidCredentialKeys AS VARCHAR) + ' credenciales con KeyId/KeyVersion inválido.';
    -- Mostrar las credenciales problemáticas
    SELECT c.Id, c.Name, c.KeyId, c.KeyVersion, 'Invalid FK reference' AS Issue
    FROM [dbo].[Credentials] c
    WHERE c.[KeyId] IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM [dbo].[VaultEncryptionKeys] vek 
          WHERE vek.[KeyId] = c.[KeyId] AND vek.[KeyVersion] = c.[KeyVersion]
      );
END
ELSE
BEGIN
    PRINT 'Validación OK: Todas las FK son válidas.';
END
GO

-- =============================================
-- Paso 3: Habilitar CHECK en las FK
-- =============================================
IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Credentials_EncryptionKey' AND is_not_trusted = 1)
BEGIN
    ALTER TABLE [dbo].[Credentials] WITH CHECK 
        CHECK CONSTRAINT [FK_Credentials_EncryptionKey];
    
    PRINT 'FK_Credentials_EncryptionKey validada con CHECK.';
END
GO

IF EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Credentials_NotesEncryptionKey' AND is_not_trusted = 1)
BEGIN
    ALTER TABLE [dbo].[Credentials] WITH CHECK 
        CHECK CONSTRAINT [FK_Credentials_NotesEncryptionKey];
    
    PRINT 'FK_Credentials_NotesEncryptionKey validada con CHECK.';
END
GO

-- =============================================
-- Verificar estado final de FK
-- =============================================
SELECT 
    fk.name AS ForeignKeyName,
    CASE WHEN fk.is_not_trusted = 0 THEN 'TRUSTED' ELSE 'NOT TRUSTED' END AS TrustStatus,
    CASE WHEN fk.is_disabled = 0 THEN 'ENABLED' ELSE 'DISABLED' END AS EnabledStatus
FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID('Credentials')
  AND fk.name LIKE '%EncryptionKey%';
GO

-- Registrar completado
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase1' AND [Step] = 'ForeignKeys' AND [CompletedAt] IS NULL;
GO

PRINT '============================================='
PRINT 'FASE 1.2 COMPLETADA: FK Compuestas'
PRINT '- FK_Credentials_EncryptionKey creada y TRUSTED'
PRINT '- FK_Credentials_NotesEncryptionKey creada y TRUSTED'
PRINT '============================================='
GO

