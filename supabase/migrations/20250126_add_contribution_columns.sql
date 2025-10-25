-- =====================================================
-- AGREGAR COLUMNAS DE CONTRIBUCIÓN PONDERADA
-- Health Score v3.0 - Contribuciones al Score Total
-- Fecha: 2025-01-26
-- =====================================================

USE [SQLNova];
GO

PRINT '🔧 Agregando columnas de contribución ponderada a InstanceHealth_Score...';
GO

-- Agregar columnas si no existen
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_Score]') AND name = 'BackupsContribution')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_Score]
    ADD 
        -- Contribuciones Ponderadas (0 hasta peso máximo)
        [BackupsContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,          -- Max: 18.00
        [AlwaysOnContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,         -- Max: 14.00
        [ConectividadContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,     -- Max: 10.00
        [ErroresCriticosContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,  -- Max: 7.00
        [CPUContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,              -- Max: 10.00
        [IOContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,               -- Max: 10.00
        [DiscosContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,           -- Max: 8.00
        [MemoriaContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,          -- Max: 7.00
        [MantenimientosContribution] DECIMAL(5,2) NOT NULL DEFAULT 0,   -- Max: 6.00
        [ConfiguracionTempdbContribution] DECIMAL(5,2) NOT NULL DEFAULT 0; -- Max: 10.00
    
    PRINT '✅ Columnas de contribución ponderada agregadas';
END
ELSE
BEGIN
    PRINT '⚠️  Las columnas de contribución ya existen';
END
GO

-- Actualizar registros existentes con las contribuciones calculadas
PRINT '🔄 Calculando contribuciones para registros existentes...';
GO

UPDATE [dbo].[InstanceHealth_Score]
SET 
    BackupsContribution = CAST(BackupsScore * 0.18 AS DECIMAL(5,2)),
    AlwaysOnContribution = CAST(AlwaysOnScore * 0.14 AS DECIMAL(5,2)),
    ConectividadContribution = CAST(ConectividadScore * 0.10 AS DECIMAL(5,2)),
    ErroresCriticosContribution = CAST(ErroresCriticosScore * 0.07 AS DECIMAL(5,2)),
    CPUContribution = CAST(CPUScore * 0.10 AS DECIMAL(5,2)),
    IOContribution = CAST(IOScore * 0.10 AS DECIMAL(5,2)),
    DiscosContribution = CAST(DiscosScore * 0.08 AS DECIMAL(5,2)),
    MemoriaContribution = CAST(MemoriaScore * 0.07 AS DECIMAL(5,2)),
    MantenimientosContribution = CAST(MantenimientosScore * 0.06 AS DECIMAL(5,2)),
    ConfiguracionTempdbContribution = CAST(ConfiguracionTempdbScore * 0.10 AS DECIMAL(5,2))
WHERE BackupsContribution = 0 
  AND AlwaysOnContribution = 0
  AND ConectividadContribution = 0;
GO

PRINT '✅ Contribuciones calculadas para registros existentes';
GO

PRINT '';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📊 Resumen:';
PRINT '   - 10 columnas de contribución agregadas';
PRINT '   - Valores calculados: Score Individual × Peso';
PRINT '   - Rango por categoría:';
PRINT '     • Backups: 0-18.00';
PRINT '     • AlwaysOn: 0-14.00';
PRINT '     • Conectividad: 0-10.00';
PRINT '     • Errores Críticos: 0-7.00';
PRINT '     • CPU: 0-10.00';
PRINT '     • I/O: 0-10.00';
PRINT '     • Discos: 0-8.00';
PRINT '     • Memoria: 0-7.00';
PRINT '     • Mantenimientos: 0-6.00';
PRINT '     • Configuración & TempDB: 0-10.00';
PRINT '';
GO

