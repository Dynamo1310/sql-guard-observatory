-- =============================================
-- Script: AddBackupAlertType.sql
-- Descripción: Agrega columna AlertType a BackupAlertConfig y BackupAlertHistory
--              para separar configuraciones de alertas FULL y LOG
-- Fecha: 2026-02-05
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- ============================================================================
-- 1. Agregar columna AlertType a BackupAlertConfig
-- ============================================================================
PRINT 'Agregando columna AlertType a BackupAlertConfig...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BackupAlertConfig') AND name = 'AlertType')
BEGIN
    ALTER TABLE dbo.BackupAlertConfig ADD AlertType INT NOT NULL DEFAULT 1;
    PRINT '   - Columna AlertType agregada a BackupAlertConfig';
END
ELSE
BEGIN
    PRINT '   - Columna AlertType ya existe en BackupAlertConfig';
END
GO

-- ============================================================================
-- 2. Agregar columna AlertType a BackupAlertHistory
-- ============================================================================
PRINT '';
PRINT 'Agregando columna AlertType a BackupAlertHistory...';

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.BackupAlertHistory') AND name = 'AlertType')
BEGIN
    ALTER TABLE dbo.BackupAlertHistory ADD AlertType INT NOT NULL DEFAULT 1;
    PRINT '   - Columna AlertType agregada a BackupAlertHistory';
END
ELSE
BEGIN
    PRINT '   - Columna AlertType ya existe en BackupAlertHistory';
END
GO

-- ============================================================================
-- 3. Crear configuración para LOG si existe una para FULL
-- ============================================================================
PRINT '';
PRINT 'Creando configuración de LOG basada en la existente de FULL...';

-- Verificar si existe una configuración y no existe una para LOG
IF EXISTS (SELECT 1 FROM dbo.BackupAlertConfig WHERE AlertType = 1)
   AND NOT EXISTS (SELECT 1 FROM dbo.BackupAlertConfig WHERE AlertType = 2)
BEGIN
    -- Copiar la configuración existente para LOG
    INSERT INTO dbo.BackupAlertConfig (
        AlertType,
        Name,
        Description,
        IsEnabled,
        CheckIntervalMinutes,
        AlertIntervalMinutes,
        Recipients,
        CcRecipients,
        LastRunAt,
        LastAlertSentAt,
        CreatedAt,
        UpdatedAt,
        UpdatedByUserId
    )
    SELECT 
        2,  -- AlertType = Log
        'Alerta de Backups LOG Atrasados',
        'Alerta automática cuando se detectan backups LOG vencidos',
        0,  -- Deshabilitado por defecto
        CheckIntervalMinutes,
        AlertIntervalMinutes,
        '',  -- Sin destinatarios por defecto (el usuario debe configurar)
        '',
        NULL,
        NULL,
        GETDATE(),
        NULL,
        UpdatedByUserId
    FROM dbo.BackupAlertConfig
    WHERE AlertType = 1;
    
    -- Actualizar el nombre de la configuración FULL
    UPDATE dbo.BackupAlertConfig 
    SET Name = 'Alerta de Backups FULL Atrasados',
        Description = 'Alerta automática cuando se detectan backups FULL vencidos'
    WHERE AlertType = 1;
    
    PRINT '   - Configuración de LOG creada (deshabilitada, sin destinatarios)';
    PRINT '   - Configuración de FULL actualizada con nombre específico';
END
ELSE IF NOT EXISTS (SELECT 1 FROM dbo.BackupAlertConfig)
BEGIN
    -- No existe ninguna configuración, crear ambas
    INSERT INTO dbo.BackupAlertConfig (AlertType, Name, Description, IsEnabled, CheckIntervalMinutes, AlertIntervalMinutes, Recipients, CcRecipients, CreatedAt)
    VALUES 
        (1, 'Alerta de Backups FULL Atrasados', 'Alerta automática cuando se detectan backups FULL vencidos', 0, 60, 240, '', '', GETDATE()),
        (2, 'Alerta de Backups LOG Atrasados', 'Alerta automática cuando se detectan backups LOG vencidos', 0, 60, 240, '', '', GETDATE());
    
    PRINT '   - Ambas configuraciones creadas (FULL y LOG)';
END
ELSE
BEGIN
    PRINT '   - Las configuraciones ya existen, no se realizaron cambios';
END
GO

-- ============================================================================
-- 4. Crear índice único para AlertType
-- ============================================================================
PRINT '';
PRINT 'Creando índice único para AlertType...';

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_BackupAlertConfig_AlertType' AND object_id = OBJECT_ID('dbo.BackupAlertConfig'))
BEGIN
    CREATE UNIQUE INDEX UQ_BackupAlertConfig_AlertType ON dbo.BackupAlertConfig(AlertType);
    PRINT '   - Índice único creado';
END
ELSE
BEGIN
    PRINT '   - Índice ya existe';
END
GO

PRINT '';
PRINT 'Script completado: AlertType agregado a BackupAlertConfig y BackupAlertHistory';
GO
