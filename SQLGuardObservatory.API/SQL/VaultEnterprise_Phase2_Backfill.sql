-- =============================================
-- VAULT ENTERPRISE v2.1 - FASE 2: BACKFILL
-- =============================================
-- Propósito: Script de validación y monitoreo del backfill de credenciales.
-- El backfill real se ejecuta desde C# usando BackfillService.
-- Este script es para validación SQL y monitoreo.
-- =============================================
-- Fecha: 2024
-- Compatibilidad: SQL Server 2017+
-- =============================================

USE [SQLNovaDb]
GO

PRINT '=================================================';
PRINT 'VAULT ENTERPRISE - BACKFILL VALIDATION SCRIPTS';
PRINT '=================================================';

-- =============================================
-- 1. AGREGAR COLUMNA IsMigratedToV2 SI NO EXISTE
-- =============================================
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.Credentials') 
    AND name = 'IsMigratedToV2'
)
BEGIN
    ALTER TABLE [dbo].[Credentials] 
    ADD [IsMigratedToV2] BIT NOT NULL 
        CONSTRAINT [DF_Credentials_IsMigratedToV2] DEFAULT (0);
    
    PRINT 'Columna IsMigratedToV2 agregada a Credentials';
END
ELSE
BEGIN
    PRINT 'Columna IsMigratedToV2 ya existe';
END
GO

-- =============================================
-- 2. VISTA: Estado del Backfill
-- =============================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_BackfillStatus')
    DROP VIEW [dbo].[vw_BackfillStatus];
GO

CREATE VIEW [dbo].[vw_BackfillStatus]
AS
SELECT 
    COUNT(*) AS TotalCredentials,
    SUM(CASE WHEN IsMigratedToV2 = 1 THEN 1 ELSE 0 END) AS MigratedCredentials,
    SUM(CASE WHEN IsMigratedToV2 = 0 THEN 1 ELSE 0 END) AS PendingCredentials,
    CAST(
        CASE 
            WHEN COUNT(*) = 0 THEN 0 
            ELSE ROUND(100.0 * SUM(CASE WHEN IsMigratedToV2 = 1 THEN 1 ELSE 0 END) / COUNT(*), 2)
        END 
    AS DECIMAL(5,2)) AS PercentComplete
FROM [dbo].[Credentials]
WHERE IsDeleted = 0;
GO

PRINT 'Vista vw_BackfillStatus creada';
GO

-- =============================================
-- 3. VISTA: Credenciales con problemas de datos
-- =============================================
IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_CredentialDataIssues')
    DROP VIEW [dbo].[vw_CredentialDataIssues];
GO

CREATE VIEW [dbo].[vw_CredentialDataIssues]
AS
SELECT 
    Id,
    Name,
    IsMigratedToV2,
    -- Problemas en formato Legacy
    CASE 
        WHEN EncryptedPassword IS NULL OR LEN(EncryptedPassword) = 0 THEN 'LegacyPassword vacío'
        WHEN Salt IS NULL OR LEN(Salt) = 0 THEN 'LegacySalt vacío'
        WHEN IV IS NULL OR LEN(IV) = 0 THEN 'LegacyIV vacío'
        ELSE NULL
    END AS LegacyIssue,
    -- Problemas en formato Enterprise (solo si está migrado)
    CASE 
        WHEN IsMigratedToV2 = 1 AND EncryptedPasswordBin IS NULL THEN 'EnterpriseCipher vacío'
        WHEN IsMigratedToV2 = 1 AND SaltBin IS NULL THEN 'EnterpriseSalt vacío'
        WHEN IsMigratedToV2 = 1 AND IVBin IS NULL THEN 'EnterpriseIV vacío'
        WHEN IsMigratedToV2 = 1 AND AuthTagBin IS NULL THEN 'EnterpriseAuthTag vacío'
        WHEN IsMigratedToV2 = 1 AND KeyId IS NULL THEN 'KeyId vacío'
        WHEN IsMigratedToV2 = 1 AND KeyVersion IS NULL THEN 'KeyVersion vacío'
        ELSE NULL
    END AS EnterpriseIssue,
    -- Validación de tamaños
    CASE
        WHEN IsMigratedToV2 = 1 AND DATALENGTH(SaltBin) <> 32 THEN 'SaltBin debe ser 32 bytes'
        WHEN IsMigratedToV2 = 1 AND DATALENGTH(IVBin) <> 12 THEN 'IVBin debe ser 12 bytes'
        WHEN IsMigratedToV2 = 1 AND DATALENGTH(AuthTagBin) <> 16 THEN 'AuthTagBin debe ser 16 bytes'
        ELSE NULL
    END AS SizeIssue,
    CreatedAt,
    UpdatedAt
FROM [dbo].[Credentials]
WHERE IsDeleted = 0
AND (
    -- Tiene problemas en formato legacy
    (EncryptedPassword IS NULL OR LEN(EncryptedPassword) = 0) OR
    (Salt IS NULL OR LEN(Salt) = 0) OR
    (IV IS NULL OR LEN(IV) = 0) OR
    -- Tiene problemas en formato enterprise (si está migrado)
    (IsMigratedToV2 = 1 AND EncryptedPasswordBin IS NULL) OR
    (IsMigratedToV2 = 1 AND SaltBin IS NULL) OR
    (IsMigratedToV2 = 1 AND IVBin IS NULL) OR
    (IsMigratedToV2 = 1 AND AuthTagBin IS NULL) OR
    (IsMigratedToV2 = 1 AND KeyId IS NULL) OR
    (IsMigratedToV2 = 1 AND KeyVersion IS NULL) OR
    -- Tamaños incorrectos
    (IsMigratedToV2 = 1 AND DATALENGTH(SaltBin) <> 32) OR
    (IsMigratedToV2 = 1 AND DATALENGTH(IVBin) <> 12) OR
    (IsMigratedToV2 = 1 AND DATALENGTH(AuthTagBin) <> 16)
);
GO

PRINT 'Vista vw_CredentialDataIssues creada';
GO

-- =============================================
-- 4. SP: Reporte de Backfill
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_BackfillReport')
    DROP PROCEDURE [dbo].[sp_BackfillReport];
GO

CREATE PROCEDURE [dbo].[sp_BackfillReport]
AS
BEGIN
    SET NOCOUNT ON;
    
    PRINT '=== REPORTE DE ESTADO DE BACKFILL ===';
    PRINT '';
    
    -- Estado general
    SELECT * FROM [dbo].[vw_BackfillStatus];
    
    -- Problemas detectados
    PRINT '';
    PRINT '=== CREDENCIALES CON PROBLEMAS ===';
    
    SELECT 
        Id,
        Name,
        IsMigratedToV2,
        LegacyIssue,
        EnterpriseIssue,
        SizeIssue
    FROM [dbo].[vw_CredentialDataIssues]
    ORDER BY Id;
    
    -- Resumen por KeyId
    PRINT '';
    PRINT '=== DISTRIBUCIÓN POR KEYID ===';
    
    SELECT 
        KeyId,
        KeyVersion,
        COUNT(*) AS CredentialCount
    FROM [dbo].[Credentials]
    WHERE IsMigratedToV2 = 1 AND IsDeleted = 0
    GROUP BY KeyId, KeyVersion
    ORDER BY KeyId, KeyVersion;
    
    -- Tamaños de datos cifrados
    PRINT '';
    PRINT '=== ESTADÍSTICAS DE TAMAÑOS ===';
    
    SELECT 
        'Legacy' AS Format,
        AVG(LEN(EncryptedPassword)) AS AvgCipherLength,
        AVG(LEN(Salt)) AS AvgSaltLength,
        AVG(LEN(IV)) AS AvgIVLength,
        NULL AS AvgAuthTagLength
    FROM [dbo].[Credentials]
    WHERE IsDeleted = 0 AND EncryptedPassword IS NOT NULL
    
    UNION ALL
    
    SELECT 
        'Enterprise' AS Format,
        AVG(DATALENGTH(EncryptedPasswordBin)) AS AvgCipherLength,
        AVG(DATALENGTH(SaltBin)) AS AvgSaltLength,
        AVG(DATALENGTH(IVBin)) AS AvgIVLength,
        AVG(DATALENGTH(AuthTagBin)) AS AvgAuthTagLength
    FROM [dbo].[Credentials]
    WHERE IsDeleted = 0 AND IsMigratedToV2 = 1;
END
GO

PRINT 'SP sp_BackfillReport creado';
GO

-- =============================================
-- 5. SP: Validar credenciales pre-Phase8
-- =============================================
IF EXISTS (SELECT * FROM sys.objects WHERE type = 'P' AND name = 'sp_ValidatePreCleanup')
    DROP PROCEDURE [dbo].[sp_ValidatePreCleanup];
GO

CREATE PROCEDURE [dbo].[sp_ValidatePreCleanup]
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @TotalCredentials INT;
    DECLARE @MigratedCredentials INT;
    DECLARE @PendingCredentials INT;
    DECLARE @IssueCount INT;
    DECLARE @CanProceed BIT = 1;
    
    -- Contar credenciales
    SELECT @TotalCredentials = COUNT(*) FROM [dbo].[Credentials] WHERE IsDeleted = 0;
    SELECT @MigratedCredentials = COUNT(*) FROM [dbo].[Credentials] WHERE IsDeleted = 0 AND IsMigratedToV2 = 1;
    SET @PendingCredentials = @TotalCredentials - @MigratedCredentials;
    
    -- Contar problemas
    SELECT @IssueCount = COUNT(*) FROM [dbo].[vw_CredentialDataIssues];
    
    PRINT '==============================================';
    PRINT '  VALIDACIÓN PRE-CLEANUP (Phase 8)';
    PRINT '==============================================';
    PRINT '';
    PRINT 'Total credenciales:    ' + CAST(@TotalCredentials AS VARCHAR(10));
    PRINT 'Migradas:              ' + CAST(@MigratedCredentials AS VARCHAR(10));
    PRINT 'Pendientes:            ' + CAST(@PendingCredentials AS VARCHAR(10));
    PRINT 'Con problemas:         ' + CAST(@IssueCount AS VARCHAR(10));
    PRINT '';
    
    -- Validar que todas están migradas
    IF @PendingCredentials > 0
    BEGIN
        PRINT '❌ ERROR: Hay credenciales pendientes de migrar';
        SET @CanProceed = 0;
        
        SELECT TOP 10 
            Id, Name, OwnerUserId, CreatedAt
        FROM [dbo].[Credentials]
        WHERE IsDeleted = 0 AND IsMigratedToV2 = 0
        ORDER BY CreatedAt;
    END
    ELSE
    BEGIN
        PRINT '✅ OK: Todas las credenciales están migradas';
    END
    
    -- Validar que no hay problemas de datos
    IF @IssueCount > 0
    BEGIN
        PRINT '❌ ERROR: Hay credenciales con problemas de datos';
        SET @CanProceed = 0;
        
        SELECT * FROM [dbo].[vw_CredentialDataIssues];
    END
    ELSE
    BEGIN
        PRINT '✅ OK: No hay problemas de datos detectados';
    END
    
    -- Validar que hay llaves activas
    IF NOT EXISTS (SELECT 1 FROM [dbo].[VaultEncryptionKeys] WHERE IsActive = 1)
    BEGIN
        PRINT '❌ ERROR: No hay llaves de cifrado activas';
        SET @CanProceed = 0;
    END
    ELSE
    BEGIN
        PRINT '✅ OK: Hay llaves de cifrado activas';
        
        SELECT KeyId, KeyVersion, KeyPurpose, IsActive, ActivatedAt
        FROM [dbo].[VaultEncryptionKeys]
        WHERE IsActive = 1;
    END
    
    PRINT '';
    PRINT '==============================================';
    IF @CanProceed = 1
    BEGIN
        PRINT '✅ RESULTADO: PUEDE PROCEDER CON PHASE 8';
    END
    ELSE
    BEGIN
        PRINT '❌ RESULTADO: NO PUEDE PROCEDER CON PHASE 8';
        PRINT '   Resuelva los problemas antes de continuar.';
    END
    PRINT '==============================================';
    
    -- Retornar resultado
    SELECT 
        @CanProceed AS CanProceed,
        @TotalCredentials AS TotalCredentials,
        @MigratedCredentials AS MigratedCredentials,
        @PendingCredentials AS PendingCredentials,
        @IssueCount AS IssueCount;
END
GO

PRINT 'SP sp_ValidatePreCleanup creado';
GO

-- =============================================
-- EJECUTAR REPORTE INICIAL
-- =============================================
PRINT '';
PRINT '=================================================';
PRINT 'Ejecutando reporte inicial...';
PRINT '=================================================';

EXEC [dbo].[sp_BackfillReport];
GO

