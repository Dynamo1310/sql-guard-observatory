-- ============================================================================
-- DIAGNÓSTICO: ¿Por qué todas las instancias tienen waits en 0?
-- ============================================================================

PRINT '🔍 DIAGNÓSTICO: Wait Statistics';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '';

-- ============================================================================
-- 1. Ver últimas 10 recolecciones
-- ============================================================================

PRINT '📊 Últimas 10 recolecciones:';
PRINT '';

SELECT TOP 10
    InstanceName,
    BlockedSessionCount AS [Blocking],
    TotalWaits AS [Total Waits],
    TotalWaitMs / 1000 AS [Total Wait Seconds],
    PageIOLatchWaitCount AS [PAGEIOLATCH Count],
    CXPacketWaitCount AS [CXPACKET Count],
    ResourceSemaphoreWaitCount AS [RESOURCE_SEM Count],
    TopWait1Type AS [Top Wait Type],
    TopWait1Ms / 1000 AS [Top Wait Seconds],
    CollectedAtUtc AS [Collected At]
FROM InstanceHealth_Waits
ORDER BY CollectedAtUtc DESC;

-- ============================================================================
-- 2. Estadísticas agregadas
-- ============================================================================

PRINT '';
PRINT '📈 Estadísticas agregadas (última recolección):';
PRINT '';

SELECT 
    COUNT(*) AS [Total Instancias],
    SUM(CASE WHEN TotalWaits = 0 THEN 1 ELSE 0 END) AS [Con TotalWaits = 0],
    SUM(CASE WHEN TotalWaits > 0 THEN 1 ELSE 0 END) AS [Con TotalWaits > 0],
    SUM(CASE WHEN BlockedSessionCount > 0 THEN 1 ELSE 0 END) AS [Con Blocking],
    SUM(CASE WHEN PageIOLatchWaitMs > 0 THEN 1 ELSE 0 END) AS [Con PAGEIOLATCH],
    SUM(CASE WHEN CXPacketWaitMs > 0 THEN 1 ELSE 0 END) AS [Con CXPACKET],
    AVG(CAST(TotalWaitMs AS BIGINT)) / 1000 AS [Avg Total Wait Seconds]
FROM InstanceHealth_Waits
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE());

-- ============================================================================
-- 3. Top 10 instancias por Total Waits
-- ============================================================================

PRINT '';
PRINT '🔝 Top 10 instancias por Total Wait Time:';
PRINT '';

SELECT TOP 10
    InstanceName,
    TotalWaits AS [Total Waits],
    TotalWaitMs / 1000 / 3600 AS [Total Wait Hours],
    PageIOLatchWaitMs / 1000 AS [PAGEIOLATCH Seconds],
    CXPacketWaitMs / 1000 AS [CXPACKET Seconds],
    WriteLogWaitMs / 1000 AS [WRITELOG Seconds],
    CASE 
        WHEN TotalWaitMs > 0 THEN 
            CAST(PageIOLatchWaitMs * 100.0 / TotalWaitMs AS DECIMAL(5,2))
        ELSE 0 
    END AS [PAGEIOLATCH %],
    CASE 
        WHEN TotalWaitMs > 0 THEN 
            CAST(CXPacketWaitMs * 100.0 / TotalWaitMs AS DECIMAL(5,2))
        ELSE 0 
    END AS [CXPACKET %],
    CollectedAtUtc
FROM InstanceHealth_Waits
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
ORDER BY TotalWaitMs DESC;

-- ============================================================================
-- 4. Instancias con TopWait1Type NULL (problema potencial)
-- ============================================================================

PRINT '';
PRINT '⚠️ Instancias con TopWait1Type NULL (posible problema):';
PRINT '';

SELECT 
    InstanceName,
    TotalWaits,
    TotalWaitMs,
    TopWait1Type,
    TopWait2Type,
    TopWait3Type,
    CollectedAtUtc
FROM InstanceHealth_Waits
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND (TopWait1Type IS NULL OR TopWait1Type = '')
ORDER BY InstanceName;

-- ============================================================================
-- 5. Ver wait types más comunes
-- ============================================================================

PRINT '';
PRINT '📊 Top Wait Types capturados:';
PRINT '';

SELECT 
    WaitType,
    COUNT(*) AS [Instancias con este wait],
    SUM(WaitMs) / 1000 AS [Total Seconds],
    AVG(WaitMs) / 1000 AS [Avg Seconds per Instance]
FROM (
    SELECT InstanceName, TopWait1Type AS WaitType, TopWait1Ms AS WaitMs
    FROM InstanceHealth_Waits
    WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
      AND TopWait1Type IS NOT NULL
    UNION ALL
    SELECT InstanceName, TopWait2Type, TopWait2Ms
    FROM InstanceHealth_Waits
    WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
      AND TopWait2Type IS NOT NULL
    UNION ALL
    SELECT InstanceName, TopWait3Type, TopWait3Ms
    FROM InstanceHealth_Waits
    WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
      AND TopWait3Type IS NOT NULL
) AS AllWaits
GROUP BY WaitType
ORDER BY SUM(WaitMs) DESC;

-- ============================================================================
-- 6. Comparar con sys.dm_os_wait_stats en VIVO
-- ============================================================================

PRINT '';
PRINT '🔴 PARA COMPARAR: Ejecuta esto en UNA instancia específica:';
PRINT '';
PRINT '   SELECT TOP 10';
PRINT '       wait_type,';
PRINT '       waiting_tasks_count,';
PRINT '       wait_time_ms / 1000 AS wait_time_seconds';
PRINT '   FROM sys.dm_os_wait_stats';
PRINT '   WHERE wait_type NOT IN (''CLR_SEMAPHORE'', ''LAZYWRITER_SLEEP'', ''SLEEP_TASK'', ...)';
PRINT '   ORDER BY wait_time_ms DESC;';
PRINT '';
PRINT '   Si esta query devuelve valores >0, pero InstanceHealth_Waits tiene 0,';
PRINT '   entonces HAY un problema con la recolección.';
PRINT '';

-- ============================================================================
-- FINALIZACIÓN
-- ============================================================================

PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
PRINT '✅ Diagnóstico completado!';
PRINT '';
PRINT '📋 Interpretación:';
PRINT '';
PRINT '   Si "Con TotalWaits = 0" = 127:';
PRINT '     ❌ PROBLEMA: Las queries NO están devolviendo datos';
PRINT '     🔧 Solución: Revisar el collector de Waits';
PRINT '';
PRINT '   Si "Con TotalWaits > 0" = 127 pero todos bajos:';
PRINT '     ✅ NORMAL: Las instancias están saludables';
PRINT '     💡 Esto es LO ESPERADO en una infra bien mantenida';
PRINT '';
PRINT '   Si "Top Wait Type" muestra NULL para todas:';
PRINT '     ⚠️  POSIBLE PROBLEMA: Los wait stats fueron reseteados';
PRINT '     💡 Esperar 1 hora y re-ejecutar el collector';
PRINT '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

