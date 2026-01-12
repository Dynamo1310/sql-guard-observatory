-- =============================================
-- Script: AddGroupIdColumn.sql
-- Description: Agrega la columna GroupId a la tabla Credentials existente
-- Database: AppSQLNova
-- Date: December 2025
-- =============================================

USE [AppSQLNova]
GO

-- Verificar si la columna GroupId ya existe
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'GroupId')
BEGIN
    PRINT 'Agregando columna GroupId a la tabla Credentials...';
    
    -- Agregar la columna
    ALTER TABLE [dbo].[Credentials] ADD [GroupId] INT NULL;
    
    PRINT 'Columna GroupId agregada.';
END
ELSE
BEGIN
    PRINT 'La columna GroupId ya existe en la tabla Credentials.';
END
GO

-- Verificar si el FK ya existe
IF NOT EXISTS (SELECT * FROM sys.foreign_keys WHERE name = 'FK_Credentials_Group')
BEGIN
    PRINT 'Agregando FK FK_Credentials_Group...';
    
    ALTER TABLE [dbo].[Credentials] 
        ADD CONSTRAINT [FK_Credentials_Group] FOREIGN KEY ([GroupId]) 
        REFERENCES [dbo].[CredentialGroups]([Id]) ON DELETE SET NULL;
    
    PRINT 'FK FK_Credentials_Group agregada.';
END
ELSE
BEGIN
    PRINT 'FK FK_Credentials_Group ya existe.';
END
GO

-- Verificar si el índice ya existe
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Credentials_GroupId' AND object_id = OBJECT_ID(N'[dbo].[Credentials]'))
BEGIN
    PRINT 'Creando índice IX_Credentials_GroupId...';
    
    CREATE NONCLUSTERED INDEX [IX_Credentials_GroupId] 
        ON [dbo].[Credentials]([GroupId]) 
        WHERE [GroupId] IS NOT NULL;
    
    PRINT 'Índice IX_Credentials_GroupId creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_Credentials_GroupId ya existe.';
END
GO

PRINT '============================================='
PRINT 'Script AddGroupIdColumn.sql ejecutado correctamente.'
PRINT '============================================='
GO




