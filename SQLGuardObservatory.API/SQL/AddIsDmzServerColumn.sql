-- Script para agregar columna IsDmzServer a ServerPatchStatusCache
-- SQL Guard Observatory - Patching Module

USE [SQLGuardObservatoryAuth]
GO

-- Agregar columna IsDmzServer
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ServerPatchStatusCache') AND name = 'IsDmzServer')
BEGIN
    ALTER TABLE [dbo].[ServerPatchStatusCache]
    ADD [IsDmzServer] BIT NOT NULL DEFAULT 0;
    
    PRINT 'Columna IsDmzServer agregada exitosamente'
END
ELSE
BEGIN
    PRINT 'La columna IsDmzServer ya existe'
END
GO

-- Crear índice para filtrar por DMZ si es necesario
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerPatchStatusCache_IsDmzServer' AND object_id = OBJECT_ID('dbo.ServerPatchStatusCache'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_ServerPatchStatusCache_IsDmzServer] 
    ON [dbo].[ServerPatchStatusCache] ([IsDmzServer])
    INCLUDE ([InstanceName], [ConnectionSuccess]);
    
    PRINT 'Índice IX_ServerPatchStatusCache_IsDmzServer creado'
END
GO

