-- =============================================
-- Script: AddTemplateRecipients.sql
-- Descripción: Agrega la columna Recipients a la tabla OnCallEmailTemplates
--              para permitir configurar destinatarios específicos por template
-- Fecha: 2025-12-30
-- =============================================

USE SQLNova;
GO

-- Agregar columna Recipients a OnCallEmailTemplates
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallEmailTemplates') AND name = 'Recipients')
BEGIN
    ALTER TABLE OnCallEmailTemplates 
    ADD Recipients NVARCHAR(MAX) NULL;
    
    PRINT 'Columna Recipients agregada a OnCallEmailTemplates';
END
ELSE
BEGIN
    PRINT 'Columna Recipients ya existe en OnCallEmailTemplates';
END
GO

-- Actualizar templates existentes con destinatarios de ejemplo (opcional)
-- Descomentar si desea establecer destinatarios por defecto

/*
UPDATE OnCallEmailTemplates 
SET Recipients = 'dba@empresa.com; soporte@empresa.com'
WHERE AlertType IN ('WeeklyNotification', 'PreWeekNotification')
  AND Recipients IS NULL;
  
PRINT 'Destinatarios de ejemplo agregados a templates programados';
*/

PRINT '=== VERIFICACIÓN ===';

SELECT 
    Id,
    AlertType,
    Name,
    IsScheduled,
    ScheduleCron,
    Recipients,
    IsEnabled
FROM OnCallEmailTemplates;

PRINT '=== FIN DEL SCRIPT ===';
GO



