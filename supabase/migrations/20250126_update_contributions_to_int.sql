-- =====================================================
-- CAMBIAR TIPO DE COLUMNAS DE CONTRIBUCIÓN A INT
-- Health Score v3.0 - Contribuciones como enteros
-- Fecha: 2025-01-26
-- =====================================================

USE [SQLNova];
GO

PRINT '🔧 Cambiando tipo de columnas de contribución a INT...';
GO

-- Cambiar todas las columnas de contribución de DECIMAL(5,2) a INT
ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN BackupsContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN AlwaysOnContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN ConectividadContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN ErroresCriticosContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN CPUContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN IOContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN DiscosContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN MemoriaContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN MantenimientosContribution INT NOT NULL;

ALTER TABLE [dbo].[InstanceHealth_Score]
ALTER COLUMN ConfiguracionTempdbContribution INT NOT NULL;

GO

PRINT '✅ Columnas actualizadas a INT exitosamente!';
GO

PRINT '';
PRINT '📊 Resumen:';
PRINT '   - Las 10 columnas de contribución ahora son INT';
PRINT '   - El HealthScore será la SUMA EXACTA de las contribuciones redondeadas';
PRINT '   - No habrá más discrepancias entre suma y total';
PRINT '';
GO

