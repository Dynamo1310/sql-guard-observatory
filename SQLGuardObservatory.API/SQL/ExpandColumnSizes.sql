-- Script para expandir tamaños de columnas en ServerPatchStatusCache
-- SQL Guard Observatory - Patching Module
-- Soluciona: "String or binary data would be truncated"

USE [SQLGuardObservatoryAuth]
GO

-- Expandir ServerName y InstanceName a 200
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'ServerName')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [ServerName] NVARCHAR(200) NOT NULL;
    PRINT 'Columna ServerName expandida a 200'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'InstanceName')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [InstanceName] NVARCHAR(200) NOT NULL;
    PRINT 'Columna InstanceName expandida a 200'
END
GO

-- Expandir campos CU/SP/KB a 50
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'CurrentCU')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [CurrentCU] NVARCHAR(50) NULL;
    PRINT 'Columna CurrentCU expandida a 50'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'CurrentSP')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [CurrentSP] NVARCHAR(50) NULL;
    PRINT 'Columna CurrentSP expandida a 50'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'KBReference')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [KBReference] NVARCHAR(50) NULL;
    PRINT 'Columna KBReference expandida a 50'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'RequiredCU')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [RequiredCU] NVARCHAR(50) NULL;
    PRINT 'Columna RequiredCU expandida a 50'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'LatestCU')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [LatestCU] NVARCHAR(50) NULL;
    PRINT 'Columna LatestCU expandida a 50'
END
GO

IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'LatestKBReference')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ALTER COLUMN [LatestKBReference] NVARCHAR(50) NULL;
    PRINT 'Columna LatestKBReference expandida a 50'
END
GO

PRINT 'Expansión de columnas completada exitosamente'
GO

