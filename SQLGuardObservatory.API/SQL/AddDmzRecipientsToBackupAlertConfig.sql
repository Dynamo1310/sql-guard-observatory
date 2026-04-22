-- =====================================================================
-- Script: AddDmzRecipientsToBackupAlertConfig.sql
-- Base  : SQLGuardObservatoryAuth (connection string "ApplicationDb")
-- Objetivo: Agregar dos columnas a dbo.BackupAlertConfig para permitir
--           destinatarios (TO y CC) separados para instancias DMZ.
--
-- Idempotente: se puede ejecutar más de una vez sin efectos adversos.
-- =====================================================================

USE SQLGuardObservatoryAuth;
GO

IF COL_LENGTH('dbo.BackupAlertConfig', 'DmzRecipients') IS NULL
BEGIN
    ALTER TABLE dbo.BackupAlertConfig
        ADD DmzRecipients NVARCHAR(2000) NULL;
    PRINT 'Columna DmzRecipients agregada.';
END
ELSE
BEGIN
    PRINT 'Columna DmzRecipients ya existe — sin cambios.';
END
GO

IF COL_LENGTH('dbo.BackupAlertConfig', 'DmzCcRecipients') IS NULL
BEGIN
    ALTER TABLE dbo.BackupAlertConfig
        ADD DmzCcRecipients NVARCHAR(2000) NULL;
    PRINT 'Columna DmzCcRecipients agregada.';
END
ELSE
BEGIN
    PRINT 'Columna DmzCcRecipients ya existe — sin cambios.';
END
GO

-- Verificación final
SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'BackupAlertConfig'
  AND COLUMN_NAME IN ('Recipients', 'CcRecipients', 'DmzRecipients', 'DmzCcRecipients')
ORDER BY ORDINAL_POSITION;
GO
