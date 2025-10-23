-- ========================================
-- Script: Crear tabla InstanceHealthSnapshot
-- Base de datos: SQLNova
-- Propósito: Tabla para almacenar snapshots de HealthScore
-- ========================================

USE [SQLNova]
GO

-- Verificar si la tabla existe
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'InstanceHealthSnapshot' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    PRINT 'Creando tabla InstanceHealthSnapshot...'
    
    CREATE TABLE [dbo].[InstanceHealthSnapshot] (
        [InstanceName] NVARCHAR(200) NOT NULL,
        [GeneratedAtUtc] DATETIME2(7) NOT NULL,
        [Ambiente] NVARCHAR(50) NULL,
        [HostingSite] NVARCHAR(50) NULL,
        [Version] NVARCHAR(100) NULL,
        [ConnectSuccess] BIT NOT NULL,
        [ConnectLatencyMs] INT NULL,
        [BackupJson] NVARCHAR(MAX) NULL,
        [MaintenanceJson] NVARCHAR(MAX) NULL,
        [DiskJson] NVARCHAR(MAX) NULL,
        [ResourceJson] NVARCHAR(MAX) NULL,
        [AlwaysOnJson] NVARCHAR(MAX) NULL,
        [ErrorlogJson] NVARCHAR(MAX) NULL,
        [HealthScore] INT NOT NULL,
        [HealthStatus] VARCHAR(10) NOT NULL,
        
        CONSTRAINT [PK_InstanceHealthSnapshot] PRIMARY KEY CLUSTERED 
        (
            [InstanceName] ASC,
            [GeneratedAtUtc] ASC
        )
    )
    
    PRINT '✓ Tabla InstanceHealthSnapshot creada correctamente.'
END
ELSE
BEGIN
    PRINT '→ La tabla InstanceHealthSnapshot ya existe.'
END
GO

-- Verificar estructura
PRINT ''
PRINT '========================================='
PRINT 'Estructura de InstanceHealthSnapshot:'
PRINT '========================================='
SELECT 
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length AS MaxLength,
    c.is_nullable AS IsNullable
FROM sys.columns c
INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('dbo.InstanceHealthSnapshot')
ORDER BY c.column_id
GO

-- Contar registros existentes
PRINT ''
PRINT '========================================='
PRINT 'Registros existentes:'
PRINT '========================================='
SELECT 
    COUNT(*) AS TotalRecords,
    COUNT(DISTINCT InstanceName) AS UniqueInstances,
    MAX(GeneratedAtUtc) AS LastSnapshot
FROM [dbo].[InstanceHealthSnapshot]
GO

