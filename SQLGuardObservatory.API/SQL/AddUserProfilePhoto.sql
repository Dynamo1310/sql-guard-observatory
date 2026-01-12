-- =============================================
-- Script: AddUserProfilePhoto.sql
-- Descripción: Agrega soporte para fotos de perfil de usuarios (subida manual)
-- Fecha: 2025-01-26
-- =============================================

USE SQLGuardObservatory;
GO

PRINT '============================================='
PRINT 'Agregando soporte para fotos de perfil'
PRINT '============================================='

-- =============================================
-- 1. Agregar columna ProfilePhoto a AspNetUsers
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'ProfilePhoto'
)
BEGIN
    ALTER TABLE dbo.AspNetUsers
    ADD ProfilePhoto VARBINARY(MAX) NULL;
    
    PRINT '✅ Columna ProfilePhoto agregada a AspNetUsers'
END
ELSE
BEGIN
    PRINT 'ℹ️ Columna ProfilePhoto ya existe en AspNetUsers'
END
GO

-- =============================================
-- 2. Agregar columna ProfilePhotoUpdatedAt
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'ProfilePhotoUpdatedAt'
)
BEGIN
    ALTER TABLE dbo.AspNetUsers
    ADD ProfilePhotoUpdatedAt DATETIME2 NULL;
    
    PRINT '✅ Columna ProfilePhotoUpdatedAt agregada a AspNetUsers'
END
ELSE
BEGIN
    PRINT 'ℹ️ Columna ProfilePhotoUpdatedAt ya existe en AspNetUsers'
END
GO

-- =============================================
-- 3. Agregar columna ProfilePhotoSource (AD/Manual/None)
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'ProfilePhotoSource'
)
BEGIN
    ALTER TABLE dbo.AspNetUsers
    ADD ProfilePhotoSource NVARCHAR(20) NULL DEFAULT 'None';
    
    PRINT '✅ Columna ProfilePhotoSource agregada a AspNetUsers'
END
ELSE
BEGIN
    PRINT 'ℹ️ Columna ProfilePhotoSource ya existe en AspNetUsers'
END
GO

-- =============================================
-- 4. Crear índice para búsquedas de usuarios con foto
-- =============================================

IF NOT EXISTS (
    SELECT 1 
    FROM sys.indexes 
    WHERE object_id = OBJECT_ID(N'dbo.AspNetUsers') 
    AND name = 'IX_AspNetUsers_ProfilePhotoSource'
)
BEGIN
    CREATE NONCLUSTERED INDEX IX_AspNetUsers_ProfilePhotoSource
    ON dbo.AspNetUsers (ProfilePhotoSource)
    WHERE ProfilePhotoSource IS NOT NULL;
    
    PRINT '✅ Índice IX_AspNetUsers_ProfilePhotoSource creado'
END
ELSE
BEGIN
    PRINT 'ℹ️ Índice IX_AspNetUsers_ProfilePhotoSource ya existe'
END
GO

PRINT ''
PRINT '============================================='
PRINT '✅ Script completado exitosamente'
PRINT '============================================='
PRINT ''
PRINT 'Resumen de cambios:'
PRINT '- ProfilePhoto: Almacena la imagen en formato binario (máximo 5MB)'
PRINT '- ProfilePhotoUpdatedAt: Fecha de última actualización de la foto'
PRINT '- ProfilePhotoSource: Origen de la foto (Manual, None)'
PRINT ''
GO

