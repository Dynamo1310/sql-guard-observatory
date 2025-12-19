-- =============================================
-- Script: CreateProductionAlertTables.sql
-- Descripción: Crea las tablas para el sistema de alertas de servidores caídos
-- NOTA: Todas las fechas se almacenan en hora local del servidor (Argentina)
-- =============================================

USE [SQLGuardObservatory]
GO

-- Tabla de configuración de alertas
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductionAlertConfig')
BEGIN
    CREATE TABLE [dbo].[ProductionAlertConfig] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL DEFAULT 'Alerta de Servidores Caídos',
        [Description] NVARCHAR(500) NULL,
        [IsEnabled] BIT NOT NULL DEFAULT 0,
        [CheckIntervalMinutes] INT NOT NULL DEFAULT 1,
        [AlertIntervalMinutes] INT NOT NULL DEFAULT 15,
        [Recipients] NVARCHAR(2000) NOT NULL DEFAULT '',
        [Ambientes] NVARCHAR(200) NOT NULL DEFAULT 'Produccion',
        [LastRunAt] DATETIME2 NULL,
        [LastAlertSentAt] DATETIME2 NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedBy] NVARCHAR(100) NULL,
        [UpdatedByDisplayName] NVARCHAR(200) NULL
    )
    PRINT 'Tabla ProductionAlertConfig creada'
END
ELSE
BEGIN
    -- Agregar columna Ambientes si no existe
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ProductionAlertConfig') AND name = 'Ambientes')
    BEGIN
        ALTER TABLE [dbo].[ProductionAlertConfig] ADD [Ambientes] NVARCHAR(200) NOT NULL DEFAULT 'Produccion'
        PRINT 'Columna Ambientes agregada a ProductionAlertConfig'
    END
    
    -- Agregar columna FailedChecksBeforeAlert si no existe
    -- Define cuántos chequeos fallidos consecutivos se requieren antes de enviar la primera alerta
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ProductionAlertConfig') AND name = 'FailedChecksBeforeAlert')
    BEGIN
        ALTER TABLE [dbo].[ProductionAlertConfig] ADD [FailedChecksBeforeAlert] INT NOT NULL DEFAULT 1
        PRINT 'Columna FailedChecksBeforeAlert agregada a ProductionAlertConfig'
    END
    
    PRINT 'Tabla ProductionAlertConfig ya existe'
END
GO

-- Tabla de historial de alertas enviadas
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductionAlertHistory')
BEGIN
    CREATE TABLE [dbo].[ProductionAlertHistory] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ConfigId] INT NOT NULL,
        [SentAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [RecipientCount] INT NOT NULL DEFAULT 0,
        [InstancesDown] NVARCHAR(4000) NOT NULL DEFAULT '',
        [Success] BIT NOT NULL DEFAULT 1,
        [ErrorMessage] NVARCHAR(1000) NULL
    )

    CREATE INDEX IX_ProductionAlertHistory_SentAt ON [dbo].[ProductionAlertHistory]([SentAt] DESC)
    CREATE INDEX IX_ProductionAlertHistory_ConfigId ON [dbo].[ProductionAlertHistory]([ConfigId])
    
    PRINT 'Tabla ProductionAlertHistory creada'
END
ELSE
BEGIN
    PRINT 'Tabla ProductionAlertHistory ya existe'
END
GO

-- Tabla de estado de conexión de instancias
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProductionInstanceStatus')
BEGIN
    CREATE TABLE [dbo].[ProductionInstanceStatus] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [InstanceName] NVARCHAR(200) NOT NULL,
        [ServerName] NVARCHAR(200) NULL,
        [Ambiente] NVARCHAR(100) NULL,
        [HostingSite] NVARCHAR(100) NULL,
        [IsConnected] BIT NOT NULL DEFAULT 1,
        [LastCheckedAt] DATETIME2 NULL,
        [LastError] NVARCHAR(1000) NULL,
        [DownSince] DATETIME2 NULL,
        [LastAlertSentAt] DATETIME2 NULL,
        [ConsecutiveFailures] INT NOT NULL DEFAULT 0,  -- Contador de chequeos fallidos consecutivos
        
        CONSTRAINT UQ_ProductionInstanceStatus_InstanceName UNIQUE ([InstanceName])
    )

    CREATE INDEX IX_ProductionInstanceStatus_IsConnected ON [dbo].[ProductionInstanceStatus]([IsConnected])
    CREATE INDEX IX_ProductionInstanceStatus_LastCheckedAt ON [dbo].[ProductionInstanceStatus]([LastCheckedAt])
    
    PRINT 'Tabla ProductionInstanceStatus creada'
END
ELSE
BEGIN
    -- Agregar columna ConsecutiveFailures si no existe
    IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('ProductionInstanceStatus') AND name = 'ConsecutiveFailures')
    BEGIN
        ALTER TABLE [dbo].[ProductionInstanceStatus] ADD [ConsecutiveFailures] INT NOT NULL DEFAULT 0
        PRINT 'Columna ConsecutiveFailures agregada a ProductionInstanceStatus'
    END
    
    PRINT 'Tabla ProductionInstanceStatus ya existe'
END
GO

PRINT ''
PRINT '=========================================='
PRINT 'Tablas de Production Alerts creadas/verificadas'
PRINT '=========================================='
GO
