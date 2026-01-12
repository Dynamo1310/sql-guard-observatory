-- =============================================
-- Script: AddIsTeamSharedColumn.sql
-- Description: Agrega la columna IsTeamShared a Credentials
-- Database: AppSQLNova
-- Date: December 2025
-- =============================================

USE [AppSQLNova]
GO

-- Verificar si la columna existe
DECLARE @ColumnExists BIT = 0;

IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') 
    AND name = 'IsTeamShared'
)
BEGIN
    SET @ColumnExists = 1;
    PRINT 'La columna IsTeamShared YA EXISTE en la tabla Credentials.';
END
ELSE
BEGIN
    PRINT 'La columna IsTeamShared NO EXISTE. Agregándola...';
END
GO

-- Agregar la columna si no existe (en batch separado)
IF NOT EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') 
    AND name = 'IsTeamShared'
)
BEGIN
    ALTER TABLE [dbo].[Credentials] 
    ADD [IsTeamShared] BIT NOT NULL 
    CONSTRAINT [DF_Credentials_IsTeamShared] DEFAULT (0);
    
    PRINT 'Columna IsTeamShared agregada exitosamente.';
END
GO

-- Verificar que se agregó
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') 
    AND name = 'IsTeamShared'
)
BEGIN
    PRINT 'VERIFICACIÓN: Columna IsTeamShared EXISTE.';
END
ELSE
BEGIN
    PRINT 'ERROR: La columna IsTeamShared NO se pudo agregar.';
END
GO

-- Ahora migrar los datos (en batch separado para que la columna ya esté visible)
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') 
    AND name = 'IsTeamShared'
)
BEGIN
    -- Migrar credenciales no privadas a IsTeamShared
    UPDATE c
    SET c.[IsTeamShared] = 1 
    FROM [dbo].[Credentials] c
    WHERE c.[IsPrivate] = 0 
    AND (c.[GroupId] IS NULL)
    AND c.[IsTeamShared] = 0;
    
    PRINT 'Credenciales migradas a IsTeamShared: ' + CAST(@@ROWCOUNT AS VARCHAR(10)) + ' filas actualizadas.';
END
GO

-- Crear índice si no existe
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') 
    AND name = 'IsTeamShared'
)
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM sys.indexes 
        WHERE name = 'IX_Credentials_IsTeamShared' 
        AND object_id = OBJECT_ID(N'[dbo].[Credentials]')
    )
    BEGIN
        CREATE NONCLUSTERED INDEX [IX_Credentials_IsTeamShared] 
            ON [dbo].[Credentials]([IsTeamShared]) 
            WHERE [IsDeleted] = 0;
        
        PRINT 'Índice IX_Credentials_IsTeamShared creado.';
    END
    ELSE
    BEGIN
        PRINT 'Índice IX_Credentials_IsTeamShared ya existe.';
    END
END
GO

PRINT '============================================='
PRINT 'Script AddIsTeamSharedColumn.sql completado.'
PRINT '============================================='
GO




