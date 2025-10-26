-- ============================================================================
-- HEALTH SCORE V3.1: AGREGAR STOLEN SERVER MEMORY
-- ============================================================================
-- Fecha: 2025-01-26
-- Descripción: Agrega columna StolenServerMemoryMB a InstanceHealth_Memoria
-- Impacto: Permite medir memoria robada del buffer pool
-- ============================================================================

BEGIN TRANSACTION;

PRINT '🔧 Health Score v3.1 - Stolen Server Memory';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

-- ============================================================================
-- AGREGAR COLUMNA: StolenServerMemoryMB
-- ============================================================================

PRINT '';
PRINT '📊 Agregando columna StolenServerMemoryMB a InstanceHealth_Memoria...';

IF NOT EXISTS (
    SELECT * 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') 
    AND name = 'StolenServerMemoryMB'
)
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria
    ADD StolenServerMemoryMB INT DEFAULT 0;
    
    PRINT '   ✅ Columna StolenServerMemoryMB agregada';
END
ELSE
BEGIN
    PRINT '   ℹ️ Columna StolenServerMemoryMB ya existe';
END

-- ============================================================================
-- INFORMACIÓN SOBRE STOLEN MEMORY
-- ============================================================================

PRINT '';
PRINT '📖 Stolen Server Memory:';
PRINT '   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '   Stolen memory es memoria usada por objetos que NO están en el buffer pool:';
PRINT '   - Lock Manager';
PRINT '   - Connection Memory';
PRINT '   - Thread stacks';
PRINT '   - Memory Clerks';
PRINT '   - Query execution grants';
PRINT '';
PRINT '   ⚠️  Un stolen memory >30% del buffer pool puede indicar:';
PRINT '   - Muchas conexiones concurrentes';
PRINT '   - Lock escalation';
PRINT '   - Memory leaks en objetos COM';
PRINT '   - Query plans muy grandes en cache';
PRINT '';
PRINT '   📊 Scoring propuesto:';
PRINT '   - <10% del buffer pool:  ✅ Óptimo';
PRINT '   - 10-20%: ⚠️  Aceptable';
PRINT '   - 20-30%: 🚨 Advertencia';
PRINT '   - >30%: ❌ Crítico';
PRINT '   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

-- ============================================================================
-- QUERY DE EJEMPLO PARA VER STOLEN MEMORY ACTUAL
-- ============================================================================

PRINT '';
PRINT '📈 Query para ver stolen memory en todas las instancias:';
PRINT '';
PRINT '      SELECT ';
PRINT '          InstanceName,';
PRINT '          StolenServerMemoryMB,';
PRINT '          BufferPoolSizeMB,';
PRINT '          CAST(StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) AS DECIMAL(5,2)) AS [Stolen %],';
PRINT '          CASE ';
PRINT '              WHEN StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) < 10 THEN ''✅ Óptimo''';
PRINT '              WHEN StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) < 20 THEN ''⚠️ Aceptable''';
PRINT '              WHEN StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) < 30 THEN ''🚨 Advertencia''';
PRINT '              ELSE ''❌ Crítico''';
PRINT '          END AS [Estado]';
PRINT '      FROM InstanceHealth_Memoria';
PRINT '      WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())';
PRINT '      ORDER BY StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) DESC;';

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

PRINT '';
PRINT '🔍 Verificación de columna:';

SELECT 
    COLUMN_NAME AS [Columna],
    DATA_TYPE AS [Tipo],
    IS_NULLABLE AS [Nullable],
    COLUMN_DEFAULT AS [Default]
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Memoria'
  AND COLUMN_NAME = 'StolenServerMemoryMB';

-- ============================================================================
-- FINALIZACIÓN
-- ============================================================================

PRINT '';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📋 Próximos pasos:';
PRINT '   1. Ejecutar: RelevamientoHealthScore_Memoria.ps1';
PRINT '   2. Verificar que StolenServerMemoryMB tiene datos:';
PRINT '      SELECT TOP 10 InstanceName, StolenServerMemoryMB FROM InstanceHealth_Memoria';
PRINT '      WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE());';
PRINT '   3. Actualizar consolidador para incluir stolen memory en scoring de Memoria';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

COMMIT TRANSACTION;

