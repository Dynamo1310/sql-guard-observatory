-- =====================================================
-- Script: AddLinkPlanillaGuardiasColumn.sql
-- Descripción: Agrega columna LinkPlanillaGuardias a OnCallEmailTemplates
--              para configurar el link a la planilla desde el frontend.
-- Fecha: 2025-02-10
-- =====================================================

-- Nota: La tabla OnCallEmailTemplates puede estar en SQLNova o SQLGuardObservatoryDB
-- según la configuración del proyecto. Ajustar USE según corresponda.

USE [SQLNova];
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID(N'OnCallEmailTemplates') AND name = 'LinkPlanillaGuardias')
BEGIN
    ALTER TABLE OnCallEmailTemplates ADD LinkPlanillaGuardias NVARCHAR(1000) NULL;
    PRINT 'Columna LinkPlanillaGuardias agregada a OnCallEmailTemplates';
END
ELSE
    PRINT 'Columna LinkPlanillaGuardias ya existe en OnCallEmailTemplates';

GO

-- Actualizar template PreWeekNotification por defecto con el link inicial (opcional)
UPDATE OnCallEmailTemplates 
SET LinkPlanillaGuardias = N'https://bancosupervielle.sharepoint.com/:x:/r/sites/ChatbotRepo/_layouts/15/Doc.aspx?sourcedoc=%7B55555ACD-2D4F-464C-92E6-BD7551B67F84%7D&file=Guardias.xlsx&wdOrigin=TEAMS-MAGLEV.p2p_ns.rwc&action=default&mobileredirect=true'
WHERE AlertType = 'PreWeekNotification' AND IsDefault = 1 AND (LinkPlanillaGuardias IS NULL OR LinkPlanillaGuardias = '');

PRINT 'Script completado';
GO
