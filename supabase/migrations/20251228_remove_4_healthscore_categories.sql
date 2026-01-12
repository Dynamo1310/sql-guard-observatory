-- =====================================================
-- MIGRACIÓN: Eliminar 4 categorías del HealthScore
-- Fecha: 2024-12-28
-- 
-- Categorías ELIMINADAS (ya no se recolectan ni ponderan):
-- - DatabaseStates (3%)
-- - ErroresCriticos (7%)
-- - ConfiguracionTempdb (5%)
-- - Autogrowth (5%)
-- Total eliminado: 20%
--
-- Categorías ACTIVAS con nuevos pesos (8 = 100%):
-- - Backups: 18% -> 23%
-- - AlwaysOn: 14% -> 17%
-- - CPU: 10% -> 12%
-- - Memoria: 8% -> 10%
-- - IO: 10% -> 13%
-- - Discos: 7% -> 9%
-- - Waits: 8% -> 10%
-- - Maintenance: 5% -> 6%
-- =====================================================

PRINT 'Iniciando migración: Eliminar 4 categorías del HealthScore...';
GO

-- =====================================================
-- PASO 1: Desactivar los 4 collectors eliminados
-- =====================================================

-- Desactivar DatabaseStates
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'DatabaseStates')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET IsEnabled = 0,
        Weight = 0.00,
        Description = 'DESACTIVADO - Categoría eliminada del HealthScore'
    WHERE CollectorName = 'DatabaseStates';
    PRINT '✓ Collector DatabaseStates DESACTIVADO';
END;

-- Desactivar ErroresCriticos
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'ErroresCriticos')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET IsEnabled = 0,
        Weight = 0.00,
        Description = 'DESACTIVADO - Categoría eliminada del HealthScore'
    WHERE CollectorName = 'ErroresCriticos';
    PRINT '✓ Collector ErroresCriticos DESACTIVADO';
END;

-- Desactivar ConfiguracionTempdb
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'ConfiguracionTempdb')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET IsEnabled = 0,
        Weight = 0.00,
        Description = 'DESACTIVADO - Categoría eliminada del HealthScore'
    WHERE CollectorName = 'ConfiguracionTempdb';
    PRINT '✓ Collector ConfiguracionTempdb DESACTIVADO';
END;

-- Desactivar Autogrowth
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'Autogrowth')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET IsEnabled = 0,
        Weight = 0.00,
        Description = 'DESACTIVADO - Categoría eliminada del HealthScore'
    WHERE CollectorName = 'Autogrowth';
    PRINT '✓ Collector Autogrowth DESACTIVADO';
END;

GO

-- =====================================================
-- PASO 2: Actualizar los pesos de las 8 categorías restantes
-- Total: 100%
-- =====================================================

-- Availability & DR (40%)
UPDATE dbo.CollectorConfig SET Weight = 23.00 WHERE CollectorName = 'Backups';
PRINT '✓ Backups: 23%';

UPDATE dbo.CollectorConfig SET Weight = 17.00 WHERE CollectorName = 'AlwaysOn';
PRINT '✓ AlwaysOn: 17%';

-- Performance (54%)
UPDATE dbo.CollectorConfig SET Weight = 12.00 WHERE CollectorName = 'CPU';
PRINT '✓ CPU: 12%';

UPDATE dbo.CollectorConfig SET Weight = 10.00 WHERE CollectorName = 'Memoria';
PRINT '✓ Memoria: 10%';

UPDATE dbo.CollectorConfig SET Weight = 13.00 WHERE CollectorName = 'IO';
PRINT '✓ IO: 13%';

UPDATE dbo.CollectorConfig SET Weight = 9.00 WHERE CollectorName = 'Discos';
PRINT '✓ Discos: 9%';

UPDATE dbo.CollectorConfig SET Weight = 10.00 WHERE CollectorName = 'Waits';
PRINT '✓ Waits: 10%';

-- Maintenance (6%)
UPDATE dbo.CollectorConfig SET Weight = 6.00 WHERE CollectorName = 'Maintenance';
PRINT '✓ Maintenance: 6%';

GO

-- =====================================================
-- PASO 3: Verificar la suma de pesos = 100%
-- =====================================================

DECLARE @TotalWeight DECIMAL(5,2);
SELECT @TotalWeight = SUM(Weight) 
FROM dbo.CollectorConfig 
WHERE IsEnabled = 1;

PRINT '';
PRINT '==========================================';
PRINT 'RESUMEN DE LA MIGRACIÓN';
PRINT '==========================================';
PRINT 'Peso total de collectors activos: ' + CAST(@TotalWeight AS VARCHAR(10)) + '%';

IF @TotalWeight = 100.00
    PRINT '✅ La suma de pesos es correcta (100%)';
ELSE
    PRINT '⚠️ ADVERTENCIA: La suma de pesos NO es 100% (' + CAST(@TotalWeight AS VARCHAR(10)) + '%)';

-- Mostrar configuración final
PRINT '';
PRINT 'Configuración final de collectors:';
SELECT 
    CollectorName,
    DisplayName,
    IsEnabled,
    Weight,
    Category
FROM dbo.CollectorConfig
ORDER BY 
    CASE WHEN IsEnabled = 1 THEN 0 ELSE 1 END,
    Category,
    Weight DESC;

PRINT '';
PRINT 'Migración completada exitosamente.';
GO



