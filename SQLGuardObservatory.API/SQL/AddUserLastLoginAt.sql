-- =============================================
-- Script: AddUserLastLoginAt.sql
-- Descripción: Agrega columna para registrar última conexión de usuarios
-- Nota: La hora se guarda en horario de Argentina (UTC-3)
-- Fecha: 2025-12-26
-- =============================================

USE SQLGuardObservatory;
GO

PRINT '============================================='
PRINT 'Agregando columna LastLoginAt a AspNetUsers'
PRINT '============================================='

-- =============================================
-- 1. Agregar columna LastLoginAt
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'LastLoginAt'
)
BEGIN
    ALTER TABLE dbo.AspNetUsers
    ADD LastLoginAt DATETIME2 NULL;
    
    PRINT '✅ Columna LastLoginAt agregada a AspNetUsers'
END
ELSE
BEGIN
    PRINT 'ℹ️ Columna LastLoginAt ya existe en AspNetUsers'
END
GO

-- =============================================
-- 2. Crear índice para consultas de última conexión
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'IX_AspNetUsers_LastLoginAt'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_AspNetUsers_LastLoginAt
    ON dbo.AspNetUsers (LastLoginAt DESC)
    WHERE LastLoginAt IS NOT NULL;
    
    PRINT '✅ Índice IX_AspNetUsers_LastLoginAt creado'
END
ELSE
BEGIN
    PRINT 'ℹ️ Índice IX_AspNetUsers_LastLoginAt ya existe'
END
GO

PRINT ''
PRINT '============================================='
PRINT '✅ Script completado exitosamente'
PRINT '============================================='
GO

