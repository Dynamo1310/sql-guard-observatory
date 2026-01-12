-- =============================================
-- Script: AddSystemCredentialIdToAccessLogs.sql
-- Descripción: Agrega la columna SystemCredentialId a CredentialAccessLog
--              para soportar auditoría centralizada de credenciales de sistema
-- Fecha: 2024-12
-- =============================================

-- IMPORTANTE: Cambiar el nombre de la base de datos según tu entorno
USE [AppSQLNova];
GO

SET NOCOUNT ON;
PRINT '============================================='
PRINT 'Agregando columna SystemCredentialId a CredentialAccessLog'
PRINT '============================================='
GO

-- Agregar columna SystemCredentialId
IF NOT EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAccessLog]') 
    AND name = 'SystemCredentialId'
)
BEGIN
    ALTER TABLE [dbo].[CredentialAccessLog]
    ADD [SystemCredentialId] INT NULL;
    
    PRINT 'Columna SystemCredentialId agregada exitosamente.'
END
ELSE
BEGIN
    PRINT 'Columna SystemCredentialId ya existe.'
END
GO

-- Hacer CredentialId nullable (si no lo es)
IF EXISTS (
    SELECT * FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAccessLog]') 
    AND name = 'CredentialId'
    AND is_nullable = 0
)
BEGIN
    ALTER TABLE [dbo].[CredentialAccessLog]
    ALTER COLUMN [CredentialId] INT NULL;
    
    PRINT 'Columna CredentialId modificada a nullable.'
END
ELSE
BEGIN
    PRINT 'Columna CredentialId ya es nullable o no requiere cambio.'
END
GO

-- Crear índice para búsquedas por SystemCredentialId
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_CredentialAccessLog_SystemCredentialId' 
    AND object_id = OBJECT_ID('CredentialAccessLog')
)
BEGIN
    CREATE INDEX [IX_CredentialAccessLog_SystemCredentialId] 
    ON [dbo].[CredentialAccessLog]([SystemCredentialId])
    WHERE [SystemCredentialId] IS NOT NULL;
    
    PRINT 'Índice IX_CredentialAccessLog_SystemCredentialId creado.'
END
GO

PRINT ''
PRINT '============================================='
PRINT 'Script completado exitosamente.'
PRINT '============================================='
GO

