-- ============================================
-- Script: AddMinDaysConfig.sql
-- Descripción: Agrega columnas para configurar días mínimos
--              de anticipación para intercambios y modificaciones
-- Fecha: 2025-12-29
-- ============================================

USE [SQLGuardObservatory]
GO

PRINT '=== INICIO DEL SCRIPT ==='

-- ============================================
-- 1. Agregar columna MinDaysForSwapRequest a OnCallConfig
-- ============================================
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'OnCallConfig') 
    AND name = 'MinDaysForSwapRequest'
)
BEGIN
    ALTER TABLE OnCallConfig
    ADD MinDaysForSwapRequest INT NOT NULL DEFAULT 7;
    
    PRINT 'Columna MinDaysForSwapRequest agregada a OnCallConfig'
END
ELSE
BEGIN
    PRINT 'Columna MinDaysForSwapRequest ya existe en OnCallConfig'
END
GO

-- ============================================
-- 2. Agregar columna MinDaysForEscalationModify a OnCallConfig
-- ============================================
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'OnCallConfig') 
    AND name = 'MinDaysForEscalationModify'
)
BEGIN
    ALTER TABLE OnCallConfig
    ADD MinDaysForEscalationModify INT NOT NULL DEFAULT 0;
    
    PRINT 'Columna MinDaysForEscalationModify agregada a OnCallConfig'
END
ELSE
BEGIN
    PRINT 'Columna MinDaysForEscalationModify ya existe en OnCallConfig'
END
GO

-- ============================================
-- 3. Verificar configuración existente
-- ============================================
PRINT ''
PRINT '=== VERIFICACIÓN DE CAMBIOS ==='

SELECT 
    Id,
    RequiresApproval,
    MinDaysForSwapRequest,
    MinDaysForEscalationModify,
    UpdatedAt
FROM OnCallConfig;

PRINT ''
PRINT '=== FIN DEL SCRIPT ==='
GO



