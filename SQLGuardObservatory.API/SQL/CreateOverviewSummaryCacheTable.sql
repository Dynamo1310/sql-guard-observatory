-- =============================================
-- Script: CreateOverviewSummaryCacheTable.sql
-- Descripción: Crea la tabla de caché para el Overview Dashboard
-- Almacena los KPIs y listas pre-calculadas para optimizar la carga
-- La tabla se actualiza automáticamente por los collectors
-- =============================================

USE [SQLGuardObservatory]
GO

-- =============================================
-- 1. Tabla de caché del Overview
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OverviewSummaryCache')
BEGIN
    CREATE TABLE [dbo].[OverviewSummaryCache] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [CacheKey] NVARCHAR(50) NOT NULL DEFAULT 'Production',
        
        -- KPIs
        [TotalInstances] INT NOT NULL DEFAULT 0,
        [HealthyCount] INT NOT NULL DEFAULT 0,
        [WarningCount] INT NOT NULL DEFAULT 0,
        [RiskCount] INT NOT NULL DEFAULT 0,
        [CriticalCount] INT NOT NULL DEFAULT 0,
        [AvgScore] DECIMAL(5,2) NOT NULL DEFAULT 0,
        [BackupsOverdue] INT NOT NULL DEFAULT 0,
        [CriticalDisksCount] INT NOT NULL DEFAULT 0,
        [MaintenanceOverdueCount] INT NOT NULL DEFAULT 0,
        
        -- Listas serializadas (JSON)
        [CriticalInstancesJson] NVARCHAR(MAX) NULL,
        [BackupIssuesJson] NVARCHAR(MAX) NULL,
        [CriticalDisksJson] NVARCHAR(MAX) NULL,
        [MaintenanceOverdueJson] NVARCHAR(MAX) NULL,
        
        -- Metadata
        [LastUpdatedUtc] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [LastUpdatedBy] NVARCHAR(100) NULL,
        
        CONSTRAINT UQ_OverviewSummaryCache_CacheKey UNIQUE ([CacheKey])
    )
    
    CREATE INDEX IX_OverviewSummaryCache_CacheKey ON [dbo].[OverviewSummaryCache]([CacheKey])
    CREATE INDEX IX_OverviewSummaryCache_LastUpdatedUtc ON [dbo].[OverviewSummaryCache]([LastUpdatedUtc] DESC)
    
    PRINT 'Tabla OverviewSummaryCache creada'
END
ELSE
BEGIN
    PRINT 'Tabla OverviewSummaryCache ya existe'
END
GO

-- =============================================
-- 2. Insertar registro inicial vacío para Production
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[OverviewSummaryCache] WHERE [CacheKey] = 'Production')
BEGIN
    INSERT INTO [dbo].[OverviewSummaryCache] 
        ([CacheKey], [TotalInstances], [HealthyCount], [WarningCount], [RiskCount], [CriticalCount], 
         [AvgScore], [BackupsOverdue], [CriticalDisksCount], [MaintenanceOverdueCount],
         [CriticalInstancesJson], [BackupIssuesJson], [CriticalDisksJson], [MaintenanceOverdueJson],
         [LastUpdatedUtc], [LastUpdatedBy])
    VALUES 
        ('Production', 0, 0, 0, 0, 0, 
         0, 0, 0, 0,
         '[]', '[]', '[]', '[]',
         GETUTCDATE(), 'System')
    
    PRINT 'Registro inicial de OverviewSummaryCache insertado para Production'
END
GO

PRINT ''
PRINT '=========================================='
PRINT 'Tabla OverviewSummaryCache creada/verificada'
PRINT '=========================================='
PRINT ''
PRINT 'La tabla almacena los KPIs y listas del Overview:'
PRINT '  - KPIs: TotalInstances, HealthyCount, WarningCount, etc.'
PRINT '  - Listas JSON: CriticalInstances, BackupIssues, CriticalDisks, MaintenanceOverdue'
PRINT ''
PRINT 'Actualización automática por:'
PRINT '  - HealthScoreConsolidator (cada 5 min)'
PRINT '  - DiscosCollector (después de recolección)'
PRINT '  - MaintenanceCollector (después de recolección)'
PRINT '=========================================='
GO
