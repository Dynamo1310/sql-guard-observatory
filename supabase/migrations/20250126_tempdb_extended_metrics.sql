-- =====================================================
-- Migración: Métricas Extendidas para TempDB
-- =====================================================
-- Agrega columnas adicionales a InstanceHealth_ConfiguracionTempdb
-- para un diagnóstico más completo de TempDB
-- =====================================================

USE SQLNova;
GO

PRINT '🔧 Agregando métricas extendidas para TempDB...';
PRINT '';

-- Verificar si la tabla existe
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]'))
BEGIN
    PRINT '❌ ERROR: La tabla InstanceHealth_ConfiguracionTempdb no existe.';
    PRINT '   Ejecuta primero: 20250125_healthscore_v3_tables.sql';
    RETURN;
END
GO

-- ==================================================
-- AGREGAR COLUMNAS NUEVAS
-- ==================================================

-- TempDB - Tamaños y espacio
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBTotalSizeMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBTotalSizeMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBTotalSizeMB';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBUsedSpaceMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBUsedSpaceMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBUsedSpaceMB';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBFreeSpacePct')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBFreeSpacePct] DECIMAL(5,2) NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBFreeSpacePct';
END

-- TempDB - Latencia separada (read/write)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBAvgReadLatencyMs')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBAvgReadLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBAvgReadLatencyMs';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBAvgWriteLatencyMs')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBAvgWriteLatencyMs] DECIMAL(10,2) NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBAvgWriteLatencyMs';
END

-- TempDB - Version Store
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBVersionStoreMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBVersionStoreMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBVersionStoreMB';
END

-- TempDB - Tamaños de archivos (min/max/avg)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBAvgFileSizeMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBAvgFileSizeMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBAvgFileSizeMB';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBMinFileSizeMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBMinFileSizeMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBMinFileSizeMB';
END

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBMaxFileSizeMB')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBMaxFileSizeMB] INT NOT NULL DEFAULT 0;
    PRINT '✅ Agregada columna: TempDBMaxFileSizeMB';
END

-- TempDB - Growth configuration OK
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBGrowthConfigOK')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] ADD 
        [TempDBGrowthConfigOK] BIT NOT NULL DEFAULT 1;
    PRINT '✅ Agregada columna: TempDBGrowthConfigOK';
END

GO

-- ==================================================
-- ELIMINAR COLUMNA ANTIGUA (opcional)
-- ==================================================

-- TempDBAvgLatencyMs ya no es necesario (ahora tenemos read/write separados)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[InstanceHealth_ConfiguracionTempdb]') AND name = 'TempDBAvgLatencyMs')
BEGIN
    ALTER TABLE [dbo].[InstanceHealth_ConfiguracionTempdb] DROP COLUMN [TempDBAvgLatencyMs];
    PRINT '✅ Eliminada columna obsoleta: TempDBAvgLatencyMs';
END
GO

PRINT '';
PRINT '═══════════════════════════════════════════════════';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📊 Columnas agregadas:';
PRINT '   - TempDBTotalSizeMB';
PRINT '   - TempDBUsedSpaceMB';
PRINT '   - TempDBFreeSpacePct';
PRINT '   - TempDBAvgReadLatencyMs';
PRINT '   - TempDBAvgWriteLatencyMs';
PRINT '   - TempDBVersionStoreMB';
PRINT '   - TempDBAvgFileSizeMB';
PRINT '   - TempDBMinFileSizeMB';
PRINT '   - TempDBMaxFileSizeMB';
PRINT '   - TempDBGrowthConfigOK';
PRINT '';
PRINT '💡 Próximos pasos:';
PRINT '   1. Ejecutar RelevamientoHealthScore_ConfiguracionTempdb.ps1';
PRINT '   2. Revisar métricas extendidas en la tabla';
PRINT '═══════════════════════════════════════════════════';
GO

