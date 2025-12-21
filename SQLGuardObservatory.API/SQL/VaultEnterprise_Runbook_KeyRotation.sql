-- =============================================
-- Script: VaultEnterprise_Runbook_KeyRotation.sql
-- Description: Runbook operativo para rotación de llaves
-- Database: SQLGuardObservatoryAuth
-- SQL Server: 2017+
-- Date: December 2025
--
-- REGLA FUNDAMENTAL:
-- ==================
-- NUNCA crear un nuevo KeyId para un KeyPurpose existente.
-- KeyId es el identificador del "stream de llaves" para ese purpose.
-- La rotación se hace incrementando KeyVersion, no creando KeyId nuevo.
--
-- PROHIBICIONES:
-- - Crear nuevo KeyId para purpose existente (rompe FK, datos huérfanos)
-- - Eliminar KeyVersion con datos asociados (datos no descifrables)
-- - Tener 2+ llaves activas para mismo purpose (filtered unique lo impide)
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

PRINT '============================================='
PRINT 'RUNBOOK: ROTACION DE LLAVES DE CIFRADO'
PRINT '============================================='
GO

-- =============================================
-- 1. VERIFICAR ESTADO ACTUAL
-- =============================================
PRINT ''
PRINT '=== 1. Estado actual de llaves ==='

SELECT 
    KeyId,
    KeyPurpose,
    KeyVersion,
    CASE WHEN IsActive = 1 THEN 'ACTIVA' ELSE 'RETIRADA' END AS Estado,
    ActivatedAt,
    DeactivatedAt,
    CreatedByUserId
FROM VaultEncryptionKeys
ORDER BY KeyPurpose, KeyVersion DESC;

-- Contar credenciales por versión de llave
SELECT 
    vek.KeyPurpose,
    vek.KeyVersion,
    CASE WHEN vek.IsActive = 1 THEN 'ACTIVA' ELSE 'RETIRADA' END AS Estado,
    COUNT(c.Id) AS CredencialesUsando
FROM VaultEncryptionKeys vek
LEFT JOIN Credentials c ON c.KeyId = vek.KeyId AND c.KeyVersion = vek.KeyVersion
GROUP BY vek.KeyPurpose, vek.KeyVersion, vek.IsActive
ORDER BY vek.KeyPurpose, vek.KeyVersion DESC;
GO

-- =============================================
-- 2. ROTACION DE LLAVE
-- Pre-requisitos:
-- [ ] Backup de base de datos completo
-- [ ] Nueva llave generada y almacenada en Key Vault / HSM
-- [ ] Ventana de mantenimiento coordinada (si hay re-cifrado masivo)
-- =============================================

/*
-- PASO 2.1: Crear nueva versión de llave
-- DESCOMENTE Y EJECUTE SOLO CUANDO ESTÉ LISTO

DECLARE @ExistingKeyId UNIQUEIDENTIFIER;
DECLARE @CurrentVersion INT;
DECLARE @NewFingerprint VARBINARY(64);

-- Obtener KeyId existente para el purpose
SELECT @ExistingKeyId = KeyId, @CurrentVersion = MAX(KeyVersion)
FROM VaultEncryptionKeys
WHERE KeyPurpose = 'CredentialPassword'
GROUP BY KeyId;

IF @ExistingKeyId IS NULL
BEGIN
    RAISERROR('No existe KeyId para CredentialPassword. Ejecutar migración primero.', 16, 1);
    RETURN;
END

-- IMPORTANTE: Calcular fingerprint de la nueva llave en la aplicación
-- y proporcionar aquí. Este es un placeholder.
SET @NewFingerprint = HASHBYTES('SHA2_512', 'REPLACE_WITH_NEW_KEY_FINGERPRINT_' + CAST(NEWID() AS VARCHAR(50)));

-- Insertar nueva versión (IsActive = 0 inicialmente)
INSERT INTO VaultEncryptionKeys 
    (KeyId, KeyVersion, KeyPurpose, Algorithm, KeyFingerprint, IsActive, CreatedAt, CreatedByUserId)
VALUES 
    (@ExistingKeyId, 
     @CurrentVersion + 1, 
     'CredentialPassword', 
     'AES-256-GCM', 
     @NewFingerprint,
     0, -- NO activa aún
     dbo.fn_GetArgentinaTimeOffset(),
     'system-rotation');

PRINT 'Nueva versión creada: ' + CAST(@CurrentVersion + 1 AS VARCHAR);
PRINT 'KeyId: ' + CAST(@ExistingKeyId AS VARCHAR(50));
PRINT 'Estado: INACTIVA (pendiente de activación)';
*/
GO

/*
-- PASO 2.2: Activar nueva llave (atómico)
-- DESCOMENTE Y EJECUTE DESPUÉS DE VERIFICAR EL PASO 2.1

DECLARE @ExistingKeyId UNIQUEIDENTIFIER;
DECLARE @NewVersion INT;

SELECT @ExistingKeyId = KeyId, @NewVersion = MAX(KeyVersion)
FROM VaultEncryptionKeys
WHERE KeyPurpose = 'CredentialPassword'
GROUP BY KeyId;

BEGIN TRANSACTION;

-- Desactivar llave actual
UPDATE VaultEncryptionKeys
SET IsActive = 0, DeactivatedAt = dbo.fn_GetArgentinaTimeOffset()
WHERE KeyPurpose = 'CredentialPassword' AND IsActive = 1;

-- Activar nueva llave
UPDATE VaultEncryptionKeys
SET IsActive = 1, ActivatedAt = dbo.fn_GetArgentinaTimeOffset()
WHERE KeyPurpose = 'CredentialPassword' AND KeyVersion = @NewVersion;

COMMIT;

PRINT 'Rotación completada. Nueva versión activa: ' + CAST(@NewVersion AS VARCHAR);

-- Verificar estado
SELECT KeyVersion, IsActive, ActivatedAt, DeactivatedAt
FROM VaultEncryptionKeys
WHERE KeyPurpose = 'CredentialPassword'
ORDER BY KeyVersion DESC;
*/
GO

-- =============================================
-- 3. RE-CIFRAR CREDENCIALES (Opcional, background)
-- Ejecutar en batches para no bloquear
-- =============================================

PRINT ''
PRINT '=== 3. Credenciales pendientes de re-cifrado ==='

-- Identificar credenciales con versión antigua
SELECT 
    Id, 
    Name, 
    KeyVersion,
    (SELECT MAX(KeyVersion) FROM VaultEncryptionKeys WHERE KeyPurpose = 'CredentialPassword') AS VersionActual,
    'PENDIENTE RE-CIFRADO' AS Estado
FROM Credentials
WHERE KeyVersion < (SELECT MAX(KeyVersion) FROM VaultEncryptionKeys WHERE KeyPurpose = 'CredentialPassword')
ORDER BY Id;

PRINT ''
PRINT 'NOTA: El re-cifrado se realiza en la aplicación (.NET).'
PRINT 'Proceso: decrypt con llave vieja -> encrypt con llave nueva.'
PRINT 'Batch recomendado: 100-500 registros por iteración.';
GO

-- =============================================
-- 4. ROLLBACK DE ROTACION
-- Escenario: La nueva llave tiene problemas
-- =============================================

/*
-- DESCOMENTE SOLO SI NECESITA HACER ROLLBACK

DECLARE @PreviousVersion INT;
DECLARE @CurrentVersion INT;

-- Obtener versiones
SELECT @CurrentVersion = MAX(KeyVersion)
FROM VaultEncryptionKeys
WHERE KeyPurpose = 'CredentialPassword' AND IsActive = 1;

SET @PreviousVersion = @CurrentVersion - 1;

-- Validar que la versión anterior existe y no fue purgada
IF NOT EXISTS (SELECT 1 FROM VaultEncryptionKeys WHERE KeyPurpose = 'CredentialPassword' AND KeyVersion = @PreviousVersion)
BEGIN
    RAISERROR('Versión anterior no disponible para rollback', 16, 1);
    RETURN;
END

BEGIN TRANSACTION;

-- Desactivar versión actual
UPDATE VaultEncryptionKeys
SET IsActive = 0, DeactivatedAt = dbo.fn_GetArgentinaTimeOffset()
WHERE KeyPurpose = 'CredentialPassword' AND KeyVersion = @CurrentVersion;

-- Reactivar versión anterior
UPDATE VaultEncryptionKeys
SET IsActive = 1, ActivatedAt = dbo.fn_GetArgentinaTimeOffset(), DeactivatedAt = NULL
WHERE KeyPurpose = 'CredentialPassword' AND KeyVersion = @PreviousVersion;

COMMIT;

PRINT 'Rollback completado. Versión activa: ' + CAST(@PreviousVersion AS VARCHAR);
*/
GO

-- =============================================
-- 5. DIAGRAMA DE ROTACIÓN
-- =============================================
PRINT ''
PRINT '=== Diagrama de Rotación ==='
PRINT ''
PRINT 'KeyPurpose: CredentialPassword'
PRINT '+------------------+------------------+------------------+'
PRINT '| KeyId: ABC-123   | KeyId: ABC-123   | KeyId: ABC-123   |'
PRINT '| Version: 1       | Version: 2       | Version: 3       |'
PRINT '| IsActive: false  | IsActive: false  | IsActive: true   |'
PRINT '| Status: RETIRED  | Status: RETIRED  | Status: ACTIVE   |'
PRINT '+------------------+------------------+------------------+'
PRINT '         ^                  ^                  ^         '
PRINT '         |                  |                  |         '
PRINT '    Creación inicial   Rotación 1         Rotación 2    '
PRINT ''
GO

-- =============================================
-- 6. PROHIBICIONES EXPLÍCITAS
-- =============================================
PRINT '=== PROHIBICIONES EXPLÍCITAS ==='
PRINT ''
PRINT '| Acción                                    | Permitido | Razón                        |'
PRINT '|-------------------------------------------|-----------|------------------------------|'
PRINT '| Crear KeyVersion+1 para purpose existente | SÍ        | Rotación correcta            |'
PRINT '| Crear nuevo KeyId para purpose existente  | NO        | Rompe FK, datos huérfanos    |'
PRINT '| Eliminar KeyVersion con datos asociados   | NO        | Datos no descifrables        |'
PRINT '| Tener 2+ llaves activas para mismo purpose| NO        | Filtered unique lo impide    |'
PRINT ''
GO

