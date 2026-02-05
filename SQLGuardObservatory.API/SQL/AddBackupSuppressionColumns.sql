-- =============================================
-- Script: AddBackupSuppressionColumns.sql
-- Descripción: Agrega columnas para soportar supresión de alertas de LOG
--              durante la ejecución de backups FULL
-- Fecha: 2026-02-05
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- Verificar si las columnas ya existen antes de agregarlas
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'IsFullRunning')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD IsFullRunning BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsFullRunning agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'FullRunningSince')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD FullRunningSince DATETIME2 NULL;
    PRINT 'Columna FullRunningSince agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'LogCheckSuppressed')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD LogCheckSuppressed BIT NOT NULL DEFAULT 0;
    PRINT 'Columna LogCheckSuppressed agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'LogCheckSuppressReason')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD LogCheckSuppressReason NVARCHAR(50) NULL;
    PRINT 'Columna LogCheckSuppressReason agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'HasViewServerState')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups ADD HasViewServerState BIT NOT NULL DEFAULT 1;
    PRINT 'Columna HasViewServerState agregada';
END
GO

PRINT 'Script completado: Columnas de supresión de backup agregadas';
GO
