-- ============================================================================
-- Script de ajuste de umbrales basado en revision de ChatGPT
-- Ejecutar en AppSQLNova DESPUES de ejecutar AddWaitsScoreColumns.sql
-- ============================================================================

USE AppSQLNova;
GO

PRINT '=== INICIO: Ajuste de umbrales segun recomendaciones de ChatGPT ===';
PRINT '';

-- ============================================================================
-- 1. CPU: Runnable Tasks - Subir de >1 a >5 (menos histerico)
-- ============================================================================
PRINT '1. Ajustando CPU Runnable Tasks...';

UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 5,
    DisplayName = 'Runnable Tasks Warning',
    Description = 'Cola de CPU detectada (>5 tasks), cap a 70',
    DefaultValue = 5
WHERE CollectorName = 'CPU' AND ThresholdName = 'RunnableTasks_Cap';

-- Agregar umbral critico para >10 runnable tasks
IF NOT EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'CPU' AND ThresholdName = 'RunnableTasks_Critical')
BEGIN
    INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
    VALUES ('CPU', 'RunnableTasks_Critical', 'Runnable Tasks Critico', 10, '>', 50, 'Cap', 'Cola de CPU severa (>10 tasks), cap a 50', 10, 12, 'Caps');
    PRINT '   - Agregado umbral critico para Runnable Tasks >10';
END;

PRINT '   - Runnable Tasks ajustado: >5 warning, >10 critico';

-- ============================================================================
-- 2. AlwaysOn: AG No Sync - Menos binario, por porcentaje
-- ============================================================================
PRINT '';
PRINT '2. Ajustando AlwaysOn No Sync...';

-- Cambiar AG_NotSynced para que sea menos estricto (solo si >20% de DBs no sync)
UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 80,
    DisplayName = 'AG Parcialmente Sync',
    Description = 'Mas del 20% DBs no sync (async DR tolerado), cap a 80',
    ResultingScore = 80
WHERE CollectorName = 'AlwaysOn' AND ThresholdName = 'AG_NotSynced';

-- Agregar umbral para cuando hay mucho no-sync (>50%)
IF NOT EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'AlwaysOn' AND ThresholdName = 'AG_MostlyNotSynced')
BEGIN
    INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
    VALUES ('AlwaysOn', 'AG_MostlyNotSynced', 'AG Mayoria No Sync', 50, '<', 60, 'Cap', 'Mas del 50% DBs no sync, cap a 60', 50, 12, 'AGState');
    PRINT '   - Agregado umbral para >50% no sync';
END;

PRINT '   - AG No Sync ajustado: >20% warning (cap 80), >50% critico (cap 60)';

-- ============================================================================
-- 3. TempDB: Write Latency - Bajar de 50ms a 30ms (mas sensible para SSD)
-- ============================================================================
PRINT '';
PRINT '3. Ajustando TempDB Write Latency...';

UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 30,
    DisplayName = 'Latencia Escritura TempDB',
    Description = 'Write latency >30ms (ajustado para SSD/NVMe), -40 pts',
    DefaultValue = 30
WHERE CollectorName = 'ConfiguracionTempdb' AND ThresholdName = 'TempDB_WriteLatency';

PRINT '   - TempDB write latency bajado a >30ms';

-- ============================================================================
-- 4. Autogrowth: Near Limit - Cambiar a 95% con score 0 (mas critico)
-- ============================================================================
PRINT '';
PRINT '4. Ajustando Autogrowth Files at Limit...';

UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 95,
    DisplayName = 'Archivos al Limite Critico',
    Description = '>95% del limite = score 0, cap a 30 (critico)',
    ResultingScore = 30
WHERE CollectorName = 'Autogrowth' AND ThresholdName = 'FilesAtLimit';

-- Agregar umbral warning para 85-95%
IF NOT EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'Autogrowth' AND ThresholdName = 'FilesNearLimit_Warning')
BEGIN
    INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
    VALUES ('Autogrowth', 'FilesNearLimit_Warning', 'Archivos Cerca Limite Warning', 85, '>', 60, 'Cap', '85-95% del limite, cap a 60', 85, 12, 'Limits');
    PRINT '   - Agregado umbral warning para 85-95%';
END;

PRINT '   - Autogrowth ajustado: >85% warning (cap 60), >95% critico (cap 30, score 0)';

-- ============================================================================
-- 5. Memoria: Stolen Memory - Agregar cap fuerte si >50%
-- ============================================================================
PRINT '';
PRINT '5. Ajustando Memoria Stolen Memory...';

IF NOT EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'Memoria' AND ThresholdName = 'StolenMemory_Critical')
BEGIN
    INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
    VALUES ('Memoria', 'StolenMemory_Critical', 'Stolen Memory Critico', 50, '>', 50, 'Cap', 'Mas del 50% stolen memory, cap a 50', 50, 12, 'Caps');
    PRINT '   - Agregado cap critico para Stolen Memory >50%';
END;

PRINT '   - Stolen Memory ajustado: >30% penalty -30, >50% cap a 50';

-- ============================================================================
-- 6. INTERVALOS DE EJECUCION (segun recomendaciones)
-- ============================================================================
PRINT '';
PRINT '6. Ajustando intervalos de ejecucion...';

-- Availability (deteccion rapida)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'AlwaysOn';      -- 5m (mantener)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'DatabaseStates'; -- 5m (mantener)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 900 WHERE CollectorName = 'Backups';        -- 15m (mantener)

-- Performance (near real-time)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'CPU';            -- 5m (mantener)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'Memoria';        -- 5m (mantener)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'IO';             -- 5m (mantener)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 900 WHERE CollectorName = 'Discos';         -- 15m (subir de 5m)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'Waits';          -- 5m (mantener)

-- Maintenance (higiene)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 600 WHERE CollectorName = 'ErroresCriticos'; -- 10m (subir de 5m)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 3600 WHERE CollectorName = 'Maintenance';   -- 60m (subir de 15m)
UPDATE dbo.CollectorConfig SET IntervalSeconds = 300 WHERE CollectorName = 'ConfiguracionTempdb'; -- 5m para contention
UPDATE dbo.CollectorConfig SET IntervalSeconds = 600 WHERE CollectorName = 'Autogrowth';     -- 10m (subir de 5m)

PRINT '   - Intervalos ajustados:';
PRINT '     * Discos: 5m -> 15m (espacio libre no cambia rapido)';
PRINT '     * ErroresCriticos: 5m -> 10m (reducir carga)';
PRINT '     * Maintenance: 15m -> 60m (config/checkdb cambia lento)';
PRINT '     * Autogrowth: 5m -> 10m (tendencia, no tiempo real)';

-- ============================================================================
-- 7. Log Chain en Backups - Ajustar cap (ChatGPT sugirio bajar a 40)
-- ============================================================================
PRINT '';
PRINT '7. Ajustando Log Chain cap en Backups...';

UPDATE dbo.CollectorThresholds 
SET ResultingScore = 40,
    Description = 'Cadena de log rota, cap global a 40 (ajustado)'
WHERE CollectorName = 'Backups' AND ThresholdName = 'LogChain_Broken';

PRINT '   - Log Chain cap bajado de 60 a 40 (mas estricto)';

-- ============================================================================
-- VERIFICACION FINAL
-- ============================================================================
PRINT '';
PRINT '=== VERIFICACION DE CAMBIOS ===';
PRINT '';

-- Mostrar umbrales modificados
SELECT 
    CollectorName,
    ThresholdName,
    DisplayName,
    ThresholdValue,
    ThresholdOperator,
    ResultingScore,
    ActionType
FROM dbo.CollectorThresholds
WHERE CollectorName IN ('CPU', 'AlwaysOn', 'ConfiguracionTempdb', 'Autogrowth', 'Memoria', 'Backups')
  AND (ThresholdName LIKE '%Runnable%' 
    OR ThresholdName LIKE '%NotSync%' 
    OR ThresholdName LIKE '%MostlyNotSync%'
    OR ThresholdName LIKE '%WriteLatency%'
    OR ThresholdName LIKE '%AtLimit%'
    OR ThresholdName LIKE '%NearLimit%'
    OR ThresholdName LIKE '%Stolen%'
    OR ThresholdName LIKE '%LogChain%')
ORDER BY CollectorName, EvaluationOrder;

-- Mostrar intervalos actualizados
PRINT '';
PRINT 'Intervalos de collectors:';
SELECT 
    CollectorName,
    DisplayName,
    IntervalSeconds,
    CASE 
        WHEN IntervalSeconds < 60 THEN CAST(IntervalSeconds AS VARCHAR) + 's'
        WHEN IntervalSeconds < 3600 THEN CAST(IntervalSeconds/60 AS VARCHAR) + 'm'
        ELSE CAST(IntervalSeconds/3600 AS VARCHAR) + 'h'
    END AS IntervalDisplay,
    Weight,
    Category
FROM dbo.CollectorConfig
WHERE IsEnabled = 1
ORDER BY Category, Weight DESC;

PRINT '';
PRINT '=== FIN: Ajustes de ChatGPT aplicados correctamente ===';
GO




