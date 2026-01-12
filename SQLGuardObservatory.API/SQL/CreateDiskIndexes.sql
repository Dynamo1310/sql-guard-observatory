-- =====================================================================
-- Script: CreateDiskIndexes.sql
-- Descripción: Crea índices para optimizar las consultas de discos
-- Fecha: 2025-12-21
-- =====================================================================

USE [sqlguard-nova];
GO

-- Verificar si el índice ya existe antes de crearlo
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InstanceHealth_Discos_InstanceName_CollectedAtUtc' 
               AND object_id = OBJECT_ID('dbo.InstanceHealth_Discos'))
BEGIN
    PRINT 'Creando índice IX_InstanceHealth_Discos_InstanceName_CollectedAtUtc...';
    
    -- Índice principal para optimizar ROW_NUMBER() con partición por InstanceName
    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Discos_InstanceName_CollectedAtUtc]
    ON [dbo].[InstanceHealth_Discos] ([InstanceName], [CollectedAtUtc] DESC)
    INCLUDE ([Id], [Ambiente], [HostingSite], [SqlVersion], [WorstFreePct], 
             [DataDiskAvgFreePct], [LogDiskAvgFreePct], [TempDBDiskFreePct], [VolumesJson]);
    
    PRINT 'Índice creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'El índice IX_InstanceHealth_Discos_InstanceName_CollectedAtUtc ya existe.';
END
GO

-- Índice adicional para filtros comunes
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InstanceHealth_Discos_Ambiente_Hosting' 
               AND object_id = OBJECT_ID('dbo.InstanceHealth_Discos'))
BEGIN
    PRINT 'Creando índice IX_InstanceHealth_Discos_Ambiente_Hosting...';
    
    CREATE NONCLUSTERED INDEX [IX_InstanceHealth_Discos_Ambiente_Hosting]
    ON [dbo].[InstanceHealth_Discos] ([Ambiente], [HostingSite])
    INCLUDE ([InstanceName], [CollectedAtUtc]);
    
    PRINT 'Índice creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'El índice IX_InstanceHealth_Discos_Ambiente_Hosting ya existe.';
END
GO

PRINT 'Script completado.';
GO




