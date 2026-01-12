-- =============================================
-- Script: VaultEnterprise_PreImplementation_Checklist.sql
-- Description: Checklist pre-implementación ejecutable por DBA/DevOps
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
--
-- INSTRUCCIONES:
-- Este checklist debe ser ejecutado ANTES de iniciar cualquier
-- script de migración en producción. Cada item debe pasar.
-- Si alguno falla, STOP y resolver antes de continuar.
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'PRE-IMPLEMENTATION CHECKLIST'
PRINT 'Vault Enterprise v2.1.1'
PRINT '============================================='
PRINT ''
PRINT 'Ejecutar ANTES de cualquier migración.'
PRINT 'Todos los checks deben pasar (PASS).'
PRINT ''
GO

-- =============================================
-- 4.1 VALIDACION DE INFRAESTRUCTURA
-- =============================================
PRINT '=== 4.1 VALIDACION DE INFRAESTRUCTURA ==='
PRINT ''

-- CHECK 1: Versión de SQL Server (debe ser 2017+)
SELECT 
    CASE 
        WHEN CAST(SERVERPROPERTY('ProductMajorVersion') AS INT) >= 14 
        THEN 'PASS: SQL Server ' + CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50))
        ELSE 'FAIL: Requiere SQL Server 2017+ (actual: ' + CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) + ')'
    END AS [CHECK_1_SqlVersion];

-- CHECK 2: Base de datos existe
SELECT 
    CASE 
        WHEN DB_ID('AppSQLNova') IS NOT NULL 
        THEN 'PASS: Database AppSQLNova exists'
        ELSE 'FAIL: Database AppSQLNova not found' 
    END AS [CHECK_2_DatabaseExists];

-- CHECK 3: Función fn_GetArgentinaTimeOffset existe
SELECT 
    CASE 
        WHEN OBJECT_ID('dbo.fn_GetArgentinaTimeOffset', 'FN') IS NOT NULL 
        THEN 'PASS: Function fn_GetArgentinaTimeOffset exists'
        ELSE 'FAIL: fn_GetArgentinaTimeOffset not found - Ejecutar Phase0_Prerequisites.sql primero' 
    END AS [CHECK_3_TimestampFunction];

-- CHECK 4: Procedimiento sp_DropDefaultConstraintSafe existe
SELECT 
    CASE 
        WHEN OBJECT_ID('dbo.sp_DropDefaultConstraintSafe', 'P') IS NOT NULL 
        THEN 'PASS: sp_DropDefaultConstraintSafe exists'
        ELSE 'FAIL: sp_DropDefaultConstraintSafe not found - Ejecutar Phase0_Prerequisites.sql primero' 
    END AS [CHECK_4_DropConstraintSP];
GO

-- =============================================
-- 4.2 VALIDACION DE SCHEMA ACTUAL
-- =============================================
PRINT ''
PRINT '=== 4.2 VALIDACION DE SCHEMA ACTUAL ==='
PRINT ''

-- CHECK 5: Tablas core existen
SELECT 
    Required.name AS TableName,
    CASE WHEN t.object_id IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END AS Status,
    CASE WHEN t.object_id IS NOT NULL THEN 'PASS' ELSE 'FAIL' END AS Result
FROM (VALUES 
    ('Credentials'), 
    ('CredentialGroups'), 
    ('CredentialGroupShares'), 
    ('CredentialUserShares'), 
    ('CredentialServers'), 
    ('CredentialAuditLog')
) AS Required(name)
LEFT JOIN sys.tables t ON t.name = Required.name;

-- CHECK 6: Columnas legacy existen (para migrar)
SELECT 
    CASE 
        WHEN COL_LENGTH('Credentials', 'EncryptedPassword') IS NOT NULL 
         AND COL_LENGTH('Credentials', 'Salt') IS NOT NULL 
         AND COL_LENGTH('Credentials', 'IV') IS NOT NULL 
        THEN 'PASS: Legacy crypto columns exist (ready to migrate)'
        ELSE 'INFO: Legacy columns missing or already migrated' 
    END AS [CHECK_6_LegacyCrypto];

-- CHECK 7: Columna Permission string existe (para migrar)
SELECT 
    CASE 
        WHEN COL_LENGTH('CredentialUserShares', 'Permission') IS NOT NULL 
        THEN 'PASS: Permission string column exists (ready to migrate)'
        ELSE 'INFO: Permission column missing or already migrated' 
    END AS [CHECK_7_PermissionColumn];
GO

-- =============================================
-- 4.3 VALIDACION DE CONTRATO CRIPTO
-- =============================================
PRINT ''
PRINT '=== 4.3 VALIDACION DE CONTRATO CRIPTO ==='
PRINT ''

-- CHECK 8: Verificar datos crypto existentes son Base64 válido
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPassword')
BEGIN
    DECLARE @TotalCredentials INT;
    DECLARE @InvalidBase64 INT;
    DECLARE @SuspiciousSaltLength INT;
    DECLARE @SuspiciousIVLength INT;
    
    SELECT 
        @TotalCredentials = COUNT(*),
        @InvalidBase64 = SUM(CASE WHEN TRY_CONVERT(VARBINARY(MAX), EncryptedPassword, 0) IS NULL AND EncryptedPassword IS NOT NULL THEN 1 ELSE 0 END),
        @SuspiciousSaltLength = SUM(CASE WHEN LEN(Salt) < 20 OR LEN(Salt) > 100 THEN 1 ELSE 0 END),
        @SuspiciousIVLength = SUM(CASE WHEN LEN(IV) < 10 OR LEN(IV) > 50 THEN 1 ELSE 0 END)
    FROM Credentials
    WHERE IsDeleted = 0;
    
    SELECT 
        @TotalCredentials AS TotalCredentials,
        @InvalidBase64 AS InvalidBase64,
        @SuspiciousSaltLength AS SuspiciousSaltLength,
        @SuspiciousIVLength AS SuspiciousIVLength,
        CASE 
            WHEN @InvalidBase64 = 0 AND @SuspiciousSaltLength = 0 AND @SuspiciousIVLength = 0 
            THEN 'PASS: All crypto data valid'
            ELSE 'FAIL: Invalid crypto data found - INVESTIGATE before migrating'
        END AS [CHECK_8_CryptoDataValidation];
    
    -- Si hay datos inválidos, mostrar detalle
    IF @InvalidBase64 > 0 OR @SuspiciousSaltLength > 0 OR @SuspiciousIVLength > 0
    BEGIN
        SELECT TOP 10 
            Id, 
            Name,
            LEN(EncryptedPassword) AS EncPassLen,
            LEN(Salt) AS SaltLen,
            LEN(IV) AS IVLen,
            'INVESTIGATE' AS Action
        FROM Credentials
        WHERE IsDeleted = 0
          AND (LEN(Salt) < 20 OR LEN(Salt) > 100 OR LEN(IV) < 10 OR LEN(IV) > 50);
    END
END
ELSE
BEGIN
    SELECT 'INFO: Legacy EncryptedPassword column not found - may be already migrated' AS [CHECK_8_CryptoDataValidation];
END
GO

-- =============================================
-- 4.4 VALIDACION DE FK COMPUESTA (Pre-requisitos)
-- =============================================
PRINT ''
PRINT '=== 4.4 VALIDACION DE FK COMPUESTA ==='
PRINT ''

-- CHECK 9: VaultEncryptionKeys tiene UNIQUE correcto
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM sys.indexes 
            WHERE object_id = OBJECT_ID('VaultEncryptionKeys') 
              AND is_unique = 1
        )
        THEN 'PASS: VaultEncryptionKeys has unique indexes'
        WHEN NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'VaultEncryptionKeys')
        THEN 'PENDING: VaultEncryptionKeys will be created in Phase1'
        ELSE 'FAIL: VaultEncryptionKeys exists but missing unique constraints' 
    END AS [CHECK_9_FKPrerequisite];

-- CHECK 10: Al menos una llave inicial existe
SELECT 
    CASE 
        WHEN EXISTS (SELECT 1 FROM sys.tables WHERE name = 'VaultEncryptionKeys')
             AND EXISTS (SELECT 1 FROM VaultEncryptionKeys WHERE KeyVersion = 1)
        THEN 'PASS: Initial key (Version 1) exists'
        WHEN NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'VaultEncryptionKeys')
        THEN 'PENDING: Initial key will be created in Phase1'
        ELSE 'FAIL: VaultEncryptionKeys exists but no Version 1 key' 
    END AS [CHECK_10_InitialKey];
GO

-- =============================================
-- 4.5 CONTADORES DE BACKFILL
-- =============================================
PRINT ''
PRINT '=== 4.5 CONTADORES DE BACKFILL ==='
PRINT 'Ejecutar DESPUES de backfill. Todos deben ser 0.'
PRINT ''

-- Estos contadores son para validación post-backfill
SELECT 'PendingCryptoMigration' AS Counter, 
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPasswordBin')
        THEN 0
        ELSE (SELECT COUNT(*) FROM Credentials WHERE EncryptedPasswordBin IS NULL AND EncryptedPassword IS NOT NULL)
    END AS Value,
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'EncryptedPasswordBin')
        THEN 'N/A: Column not yet created'
        ELSE 'Should be 0 post-backfill'
    END AS Expected

UNION ALL

SELECT 'PendingPermissionMigration', 
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'PermissionBitMask')
        THEN 0
        ELSE (SELECT COUNT(*) FROM CredentialUserShares WHERE PermissionBitMask IS NULL AND Permission IS NOT NULL)
    END,
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'PermissionBitMask')
        THEN 'N/A: Column not yet created'
        ELSE 'Should be 0 post-backfill'
    END

UNION ALL

SELECT 'PendingGroupPermissionMigration', 
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'PermissionBitMask')
        THEN 0
        ELSE (SELECT COUNT(*) FROM CredentialGroupShares WHERE PermissionBitMask IS NULL AND Permission IS NOT NULL)
    END,
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'PermissionBitMask')
        THEN 'N/A: Column not yet created'
        ELSE 'Should be 0 post-backfill'
    END

UNION ALL

SELECT 'CredentialsWithoutKeyVersion', 
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'KeyVersion')
        THEN 0
        ELSE (SELECT COUNT(*) FROM Credentials WHERE KeyVersion IS NULL AND EncryptedPasswordBin IS NOT NULL)
    END,
    CASE 
        WHEN NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'KeyVersion')
        THEN 'N/A: Column not yet created'
        ELSE 'Should be 0 post-backfill'
    END;
GO

-- =============================================
-- 4.6 BACKUP Y RECOVERY
-- =============================================
PRINT ''
PRINT '=== 4.6 BACKUP Y RECOVERY (Manual) ==='
PRINT ''
PRINT '[ ] Backup FULL de AppSQLNova completado'
PRINT '[ ] Backup verificado (RESTORE VERIFYONLY)'
PRINT '[ ] Plan de rollback documentado y aprobado'
PRINT '[ ] Ventana de mantenimiento coordinada (si aplica)'
PRINT ''
GO

-- =============================================
-- 4.7 SIGN-OFF FINAL
-- =============================================
PRINT '=== 4.7 SIGN-OFF FINAL ==='
PRINT ''
PRINT '| Rol       | Nombre     | Firma      | Fecha      |'
PRINT '|-----------|------------|------------|------------|'
PRINT '| DBA Lead  | __________ | __________ | __________ |'
PRINT '| Security  | __________ | __________ | __________ |'
PRINT '| Dev Lead  | __________ | __________ | __________ |'
PRINT ''
PRINT 'Una vez firmado, el plan está READY TO IMPLEMENT.'
PRINT ''
GO

-- =============================================
-- RESUMEN
-- =============================================
PRINT '============================================='
PRINT 'RESUMEN DE PRE-IMPLEMENTATION CHECKLIST'
PRINT '============================================='
PRINT ''
PRINT 'Pre-Implementación (GO/NO-GO):'
PRINT '[ ] sp_DropDefaultConstraintSafe creado'
PRINT '[ ] fn_GetArgentinaTimeOffset creada'
PRINT '[ ] Backup FULL completado y verificado'
PRINT '[ ] Pre-Implementation Checklist ejecutado (todos PASS)'
PRINT '[ ] Sign-off de DBA, Security, Dev Lead'
PRINT ''
PRINT 'Post-Migración Gates:'
PRINT '[ ] GATE 1: Backfill counters = 0'
PRINT '[ ] GATE 2: FK compuestas en WITH CHECK'
PRINT '[ ] GATE 3: Recertificación de Reveal completada y firmada'
PRINT '[ ] GATE 4: Deploy 2 (single-read) exitoso'
PRINT '[ ] GATE 5: Tests de regresión pasan'
PRINT ''
PRINT 'Cierre de Migración:'
PRINT '[ ] Columnas legacy eliminadas'
PRINT '[ ] Índices rebuild completado'
PRINT '[ ] Documentación operativa actualizada (runbook en wiki)'
PRINT '============================================='
GO

