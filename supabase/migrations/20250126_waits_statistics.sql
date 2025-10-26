-- ============================================================================
-- HEALTH SCORE V3.1: WAIT STATISTICS & BLOCKING
-- ============================================================================
-- Fecha: 2025-01-26
-- Descripción: Agrega tabla para wait statistics y blocking
-- Frecuencia: Cada 5 minutos
-- Impacto: Permite diagnóstico causal de problemas de performance
-- ============================================================================

BEGIN TRANSACTION;

PRINT '🔧 Health Score v3.1 - Wait Statistics & Blocking';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

-- ============================================================================
-- 1. CREAR TABLA: InstanceHealth_Waits
-- ============================================================================

PRINT '';
PRINT '📊 Creando tabla InstanceHealth_Waits...';

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Waits')
BEGIN
    CREATE TABLE dbo.InstanceHealth_Waits (
        Id BIGINT IDENTITY(1,1) PRIMARY KEY,
        InstanceName NVARCHAR(255) NOT NULL,
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(50) NULL,
        CollectedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        
        -- ===== BLOCKING =====
        BlockedSessionCount INT DEFAULT 0,
        MaxBlockTimeSeconds INT DEFAULT 0,
        BlockerSessionIds NVARCHAR(200) NULL,  -- CSV de session IDs bloqueadores
        
        -- ===== TOP 5 WAIT TYPES =====
        TopWait1Type NVARCHAR(100) NULL,
        TopWait1Count BIGINT DEFAULT 0,
        TopWait1Ms BIGINT DEFAULT 0,
        TopWait2Type NVARCHAR(100) NULL,
        TopWait2Count BIGINT DEFAULT 0,
        TopWait2Ms BIGINT DEFAULT 0,
        TopWait3Type NVARCHAR(100) NULL,
        TopWait3Count BIGINT DEFAULT 0,
        TopWait3Ms BIGINT DEFAULT 0,
        TopWait4Type NVARCHAR(100) NULL,
        TopWait4Count BIGINT DEFAULT 0,
        TopWait4Ms BIGINT DEFAULT 0,
        TopWait5Type NVARCHAR(100) NULL,
        TopWait5Count BIGINT DEFAULT 0,
        TopWait5Ms BIGINT DEFAULT 0,
        
        -- ===== I/O WAITS =====
        PageIOLatchWaitCount BIGINT DEFAULT 0,
        PageIOLatchWaitMs BIGINT DEFAULT 0,
        WriteLogWaitCount BIGINT DEFAULT 0,
        WriteLogWaitMs BIGINT DEFAULT 0,
        AsyncIOCompletionCount BIGINT DEFAULT 0,
        AsyncIOCompletionMs BIGINT DEFAULT 0,
        
        -- ===== MEMORY WAITS =====
        ResourceSemaphoreWaitCount BIGINT DEFAULT 0,
        ResourceSemaphoreWaitMs BIGINT DEFAULT 0,
        
        -- ===== CPU/PARALLELISM WAITS =====
        CXPacketWaitCount BIGINT DEFAULT 0,
        CXPacketWaitMs BIGINT DEFAULT 0,
        CXConsumerWaitCount BIGINT DEFAULT 0,
        CXConsumerWaitMs BIGINT DEFAULT 0,
        SOSSchedulerYieldCount BIGINT DEFAULT 0,
        SOSSchedulerYieldMs BIGINT DEFAULT 0,
        ThreadPoolWaitCount BIGINT DEFAULT 0,
        ThreadPoolWaitMs BIGINT DEFAULT 0,
        
        -- ===== LOCK WAITS =====
        LockWaitCount BIGINT DEFAULT 0,
        LockWaitMs BIGINT DEFAULT 0,
        
        -- ===== CONFIG =====
        MaxDOP INT NULL,
        
        -- ===== TOTALS =====
        TotalWaits BIGINT DEFAULT 0,
        TotalWaitMs BIGINT DEFAULT 0,
        
        -- Índice por instancia y fecha
        INDEX IX_InstanceHealth_Waits_InstanceName_CollectedAt 
            (InstanceName, CollectedAtUtc DESC)
    );
    
    PRINT '   ✅ Tabla InstanceHealth_Waits creada';
END
ELSE
BEGIN
    PRINT '   ℹ️ Tabla InstanceHealth_Waits ya existe';
END

-- ============================================================================
-- 2. AGREGAR COLUMNAS DE WAITS A TABLAS EXISTENTES
-- ============================================================================

PRINT '';
PRINT '📊 Actualizando tablas existentes con métricas de waits...';

-- ===== CPU: Agregar waits de paralelismo y CPU =====
PRINT '';
PRINT '   🔹 CPU: Agregando métricas de CPU waits...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'CXPacketWaitCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU
    ADD 
        -- Parallelism Waits
        CXPacketWaitCount BIGINT DEFAULT 0,
        CXPacketWaitMs BIGINT DEFAULT 0,
        CXConsumerWaitCount BIGINT DEFAULT 0,
        CXConsumerWaitMs BIGINT DEFAULT 0,
        
        -- CPU Contention
        SOSSchedulerYieldCount BIGINT DEFAULT 0,
        SOSSchedulerYieldMs BIGINT DEFAULT 0,
        
        -- Thread Pool
        ThreadPoolWaitCount BIGINT DEFAULT 0,
        ThreadPoolWaitMs BIGINT DEFAULT 0;
        
    PRINT '      ✅ Columnas de CPU waits agregadas';
END
ELSE
BEGIN
    PRINT '      ℹ️ Columnas de CPU waits ya existen';
END

-- ===== Memoria: Agregar waits de memoria =====
PRINT '';
PRINT '   🔹 Memoria: Agregando métricas de Memory waits...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'ResourceSemaphoreWaitCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria
    ADD 
        -- Memory Grant Waits
        ResourceSemaphoreWaitCount BIGINT DEFAULT 0,
        ResourceSemaphoreWaitMs BIGINT DEFAULT 0;
        
    PRINT '      ✅ Columnas de Memory waits agregadas';
END
ELSE
BEGIN
    PRINT '      ℹ️ Columnas de Memory waits ya existen';
END

-- ===== I/O: Agregar waits de I/O =====
PRINT '';
PRINT '   🔹 I/O: Agregando métricas de I/O waits...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_IO') AND name = 'PageIOLatchWaitCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_IO
    ADD 
        -- PAGEIOLATCH Waits
        PageIOLatchWaitCount BIGINT DEFAULT 0,
        PageIOLatchWaitMs BIGINT DEFAULT 0,
        
        -- WRITELOG Waits
        WriteLogWaitCount BIGINT DEFAULT 0,
        WriteLogWaitMs BIGINT DEFAULT 0,
        
        -- ASYNC_IO_COMPLETION
        AsyncIOCompletionCount BIGINT DEFAULT 0,
        AsyncIOCompletionMs BIGINT DEFAULT 0,
        
        -- Total Waits (para calcular porcentajes)
        TotalWaits BIGINT DEFAULT 0,
        TotalWaitMs BIGINT DEFAULT 0;
        
    PRINT '      ✅ Columnas de I/O waits agregadas';
END
ELSE
BEGIN
    PRINT '      ℹ️ Columnas de I/O waits ya existen';
END

-- ===== ErroresCriticos: Agregar blocking =====
PRINT '';
PRINT '   🔹 Errores Críticos: Agregando métricas de Blocking...';

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos') AND name = 'BlockedSessionCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ErroresCriticos
    ADD 
        -- Blocking
        BlockedSessionCount INT DEFAULT 0,
        MaxBlockTimeSeconds INT DEFAULT 0,
        BlockerSessionIds NVARCHAR(200) NULL;
        
    PRINT '      ✅ Columnas de Blocking agregadas';
END
ELSE
BEGIN
    PRINT '      ℹ️ Columnas de Blocking ya existen';
END

-- ============================================================================
-- 3. STATS & VERIFICACIÓN
-- ============================================================================

PRINT '';
PRINT '📈 Verificación de tablas...';
PRINT '';

SELECT 
    'InstanceHealth_Waits' AS [Tabla],
    COUNT(*) AS [Columnas]
FROM sys.columns 
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Waits')
UNION ALL
SELECT 
    'InstanceHealth_CPU (waits agregados)',
    COUNT(*)
FROM sys.columns 
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU')
  AND name LIKE '%Wait%'
UNION ALL
SELECT 
    'InstanceHealth_Memoria (waits agregados)',
    COUNT(*)
FROM sys.columns 
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria')
  AND name LIKE '%Semaphore%'
UNION ALL
SELECT 
    'InstanceHealth_IO (waits agregados)',
    COUNT(*)
FROM sys.columns 
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_IO')
  AND name LIKE '%Wait%'
UNION ALL
SELECT 
    'InstanceHealth_ErroresCriticos (blocking agregado)',
    COUNT(*)
FROM sys.columns 
WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos')
  AND name LIKE '%Block%';

-- ============================================================================
-- 4. RETENTION POLICY (Opcional)
-- ============================================================================

PRINT '';
PRINT '🗑️ Configurando retention policy...';
PRINT '   ℹ️ Los waits se guardarán por 30 días (alta frecuencia)';
PRINT '   ℹ️ Crear un SQL Agent Job para limpiar datos antiguos:';
PRINT '';
PRINT '      DELETE FROM dbo.InstanceHealth_Waits';
PRINT '      WHERE CollectedAtUtc < DATEADD(DAY, -30, GETUTCDATE());';

-- ============================================================================
-- FINALIZACIÓN
-- ============================================================================

PRINT '';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📋 Próximos pasos:';
PRINT '   1. Ejecutar: RelevamientoHealthScore_Waits.ps1';
PRINT '   2. Verificar datos en InstanceHealth_Waits';
PRINT '   3. Actualizar consolidador para incluir waits en scoring';
PRINT '   4. Actualizar frontend para mostrar waits';
PRINT '';
PRINT '📊 Impacto en Health Score:';
PRINT '   - Blocking → Errores Críticos & Blocking (7%)';
PRINT '   - PAGEIOLATCH → I/O (7%)';
PRINT '   - RESOURCE_SEMAPHORE → Memoria (7%)';
PRINT '   - CXPACKET → CPU (10%)';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

COMMIT TRANSACTION;

