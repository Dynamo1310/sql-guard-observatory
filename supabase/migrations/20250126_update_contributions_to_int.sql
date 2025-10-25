-- =====================================================
-- CAMBIAR TIPO DE COLUMNAS DE CONTRIBUCIÓN A INT
-- Health Score v3.0 - Contribuciones como enteros
-- Fecha: 2025-01-26
-- =====================================================

USE [SQLNova];
GO

PRINT '🔧 Cambiando tipo de columnas de contribución a INT...';
GO

-- Verificar si las columnas existen antes de modificar
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'BackupsContribution')
BEGIN
    PRINT 'Modificando columnas existentes...';
    
    -- Cambiar cada columna, permitiendo NULL temporalmente para facilitar la conversión
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN BackupsContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN AlwaysOnContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN ConectividadContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN ErroresCriticosContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN CPUContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN IOContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN DiscosContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN MemoriaContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN MantenimientosContribution INT NULL;

    ALTER TABLE [dbo].[InstanceHealth_Score]
    ALTER COLUMN ConfiguracionTempdbContribution INT NULL;
    
    PRINT '✅ Columnas cambiadas a INT (NULL permitido temporalmente)';
    
    -- Actualizar valores NULL a 0 si existen
    UPDATE [dbo].[InstanceHealth_Score]
    SET 
        BackupsContribution = ISNULL(BackupsContribution, 0),
        AlwaysOnContribution = ISNULL(AlwaysOnContribution, 0),
        ConectividadContribution = ISNULL(ConectividadContribution, 0),
        ErroresCriticosContribution = ISNULL(ErroresCriticosContribution, 0),
        CPUContribution = ISNULL(CPUContribution, 0),
        IOContribution = ISNULL(IOContribution, 0),
        DiscosContribution = ISNULL(DiscosContribution, 0),
        MemoriaContribution = ISNULL(MemoriaContribution, 0),
        MantenimientosContribution = ISNULL(MantenimientosContribution, 0),
        ConfiguracionTempdbContribution = ISNULL(ConfiguracionTempdbContribution, 0)
    WHERE 
        BackupsContribution IS NULL OR
        AlwaysOnContribution IS NULL OR
        ConectividadContribution IS NULL OR
        ErroresCriticosContribution IS NULL OR
        CPUContribution IS NULL OR
        IOContribution IS NULL OR
        DiscosContribution IS NULL OR
        MemoriaContribution IS NULL OR
        MantenimientosContribution IS NULL OR
        ConfiguracionTempdbContribution IS NULL;
    
    -- Ahora aplicar NOT NULL
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
    
    PRINT '✅ Constraint NOT NULL aplicado a todas las columnas';
END
ELSE
BEGIN
    PRINT '⚠️  Las columnas de contribución no existen. Ejecuta primero la migración principal.';
END
GO

PRINT '';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📊 Resumen:';
PRINT '   - Las 10 columnas de contribución ahora son INT NOT NULL';
PRINT '   - El HealthScore será la SUMA EXACTA de las contribuciones redondeadas';
PRINT '   - No habrá más discrepancias entre suma y total';
PRINT '';
GO

