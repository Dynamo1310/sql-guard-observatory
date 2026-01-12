-- ==============================================================
-- Migración: Mejoras Vault DBA
-- Fecha: 2025-01-26
-- Descripción: 
--   1. Convertir roles Viewer a Member en grupos de credenciales
--   2. Agregar columna AllowReshare a tablas de compartición
-- ==============================================================

SET NOCOUNT ON;

PRINT '=================================================='
PRINT 'Iniciando migración: Mejoras Vault DBA'
PRINT '=================================================='

-- ==============================================================
-- FASE 1: Convertir Viewers a Members
-- ==============================================================
PRINT ''
PRINT '1. Convirtiendo roles Viewer a Member en CredentialGroupMembers...'

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CredentialGroupMembers')
BEGIN
    DECLARE @ViewersCount INT
    SELECT @ViewersCount = COUNT(*) FROM CredentialGroupMembers WHERE Role = 'Viewer'
    
    IF @ViewersCount > 0
    BEGIN
        UPDATE CredentialGroupMembers SET Role = 'Member' WHERE Role = 'Viewer'
        PRINT '   - ' + CAST(@ViewersCount AS VARCHAR) + ' registro(s) actualizado(s) de Viewer a Member'
    END
    ELSE
    BEGIN
        PRINT '   - No se encontraron registros con rol Viewer'
    END
END
ELSE
BEGIN
    PRINT '   - Tabla CredentialGroupMembers no existe, omitiendo...'
END

-- ==============================================================
-- FASE 2: Agregar AllowReshare a CredentialGroupShares
-- ==============================================================
PRINT ''
PRINT '2. Agregando columna AllowReshare a CredentialGroupShares...'

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CredentialGroupShares')
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('CredentialGroupShares') AND name = 'AllowReshare'
    )
    BEGIN
        ALTER TABLE CredentialGroupShares ADD AllowReshare BIT NOT NULL DEFAULT 0
        PRINT '   - Columna AllowReshare agregada exitosamente'
    END
    ELSE
    BEGIN
        PRINT '   - Columna AllowReshare ya existe'
    END
END
ELSE
BEGIN
    PRINT '   - Tabla CredentialGroupShares no existe, omitiendo...'
END

-- ==============================================================
-- FASE 3: Agregar AllowReshare a CredentialUserShares
-- ==============================================================
PRINT ''
PRINT '3. Agregando columna AllowReshare a CredentialUserShares...'

IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CredentialUserShares')
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('CredentialUserShares') AND name = 'AllowReshare'
    )
    BEGIN
        ALTER TABLE CredentialUserShares ADD AllowReshare BIT NOT NULL DEFAULT 0
        PRINT '   - Columna AllowReshare agregada exitosamente'
    END
    ELSE
    BEGIN
        PRINT '   - Columna AllowReshare ya existe'
    END
END
ELSE
BEGIN
    PRINT '   - Tabla CredentialUserShares no existe, omitiendo...'
END

-- ==============================================================
-- VERIFICACIÓN
-- ==============================================================
PRINT ''
PRINT '=================================================='
PRINT 'Verificando cambios...'
PRINT '=================================================='

-- Verificar que no hay Viewers restantes
IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'CredentialGroupMembers')
BEGIN
    DECLARE @RemainingViewers INT
    SELECT @RemainingViewers = COUNT(*) FROM CredentialGroupMembers WHERE Role = 'Viewer'
    IF @RemainingViewers = 0
        PRINT '   ✓ No hay roles Viewer en CredentialGroupMembers'
    ELSE
        PRINT '   ✗ ADVERTENCIA: Aún hay ' + CAST(@RemainingViewers AS VARCHAR) + ' roles Viewer'
END

-- Verificar AllowReshare en CredentialGroupShares
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('CredentialGroupShares') AND name = 'AllowReshare'
)
    PRINT '   ✓ AllowReshare existe en CredentialGroupShares'
ELSE
    PRINT '   ✗ AllowReshare NO existe en CredentialGroupShares'

-- Verificar AllowReshare en CredentialUserShares
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('CredentialUserShares') AND name = 'AllowReshare'
)
    PRINT '   ✓ AllowReshare existe en CredentialUserShares'
ELSE
    PRINT '   ✗ AllowReshare NO existe en CredentialUserShares'

PRINT ''
PRINT '=================================================='
PRINT 'Migración completada'
PRINT '=================================================='

GO




