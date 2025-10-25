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
    
    -- Paso 1: Eliminar DEFAULT constraints existentes
    PRINT 'Eliminando DEFAULT constraints...';
    
    DECLARE @sql NVARCHAR(MAX) = '';
    
    SELECT @sql = @sql + 'ALTER TABLE [dbo].[InstanceHealth_Score] DROP CONSTRAINT ' + QUOTENAME(dc.name) + ';' + CHAR(13)
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c ON dc.parent_column_id = c.column_id AND dc.parent_object_id = c.object_id
    WHERE c.object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]')
      AND c.name IN (
        'BackupsContribution',
        'AlwaysOnContribution',
        'ConectividadContribution',
        'ErroresCriticosContribution',
        'CPUContribution',
        'IOContribution',
        'DiscosContribution',
        'MemoriaContribution',
        'MantenimientosContribution',
        'ConfiguracionTempdbContribution'
      );
    
    IF LEN(@sql) > 0
    BEGIN
        EXEC sp_executesql @sql;
        PRINT '✅ DEFAULT constraints eliminados';
    END
    ELSE
    BEGIN
        PRINT 'No hay DEFAULT constraints para eliminar';
    END
    
    -- Paso 2: Cambiar tipo de columnas a INT NULL
    PRINT 'Cambiando tipo de columnas a INT NULL...';
    
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
    
    PRINT '✅ Columnas cambiadas a INT NULL';
    
    -- Paso 3: Actualizar valores NULL a 0 si existen
    PRINT 'Actualizando valores NULL a 0...';
    
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
    
    -- Paso 4: Aplicar NOT NULL
    PRINT 'Aplicando constraint NOT NULL...';
    
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
    
    -- Paso 5: Recrear DEFAULT constraints con valor 0
    PRINT 'Recreando DEFAULT constraints...';
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_BackupsContribution DEFAULT (0) FOR BackupsContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_AlwaysOnContribution DEFAULT (0) FOR AlwaysOnContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_ConectividadContribution DEFAULT (0) FOR ConectividadContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_ErroresCriticosContribution DEFAULT (0) FOR ErroresCriticosContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_CPUContribution DEFAULT (0) FOR CPUContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_IOContribution DEFAULT (0) FOR IOContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_DiscosContribution DEFAULT (0) FOR DiscosContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_MemoriaContribution DEFAULT (0) FOR MemoriaContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_MantenimientosContribution DEFAULT (0) FOR MantenimientosContribution;
    
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD CONSTRAINT DF_InstanceHealth_Score_ConfiguracionTempdbContribution DEFAULT (0) FOR ConfiguracionTempdbContribution;
    
    PRINT '✅ DEFAULT constraints recreados';
    PRINT '✅ Todas las columnas actualizadas exitosamente!';
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

