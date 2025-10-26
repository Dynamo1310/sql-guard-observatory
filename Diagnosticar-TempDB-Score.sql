-- 🔍 DIAGNÓSTICO: TempDB Health Score
-- Este script muestra los valores guardados en la BD para una instancia específica

-- ==============================================================================
-- 1. Ver el score actual y las métricas de TempDB
-- ==============================================================================

DECLARE @InstanceName NVARCHAR(255) = 'NOMBRE_DE_TU_INSTANCIA';  -- ⚠️ CAMBIAR POR LA INSTANCIA DE LA IMAGEN

SELECT 
    '📊 Score y Métricas Básicas' AS [Sección],
    InstanceName,
    TempDBContentionScore AS [TempDB Score (guardado en BD)],
    TempDBFileCount AS [Files],
    TempDBAllSameSize AS [Same Size],
    TempDBAllSameGrowth AS [Same Growth],
    TempDBGrowthConfigOK AS [Growth Config OK],
    CollectedAtUtc AS [Fecha Recolección]
FROM InstanceHealth_ConfiguracionTempdb
WHERE InstanceName = @InstanceName
ORDER BY CollectedAtUtc DESC;

-- ==============================================================================
-- 2. Ver métricas extendidas (latencia, espacio, version store)
-- ==============================================================================

SELECT 
    '📈 Métricas Extendidas' AS [Sección],
    InstanceName,
    TempDBAvgReadLatencyMs AS [Read Latency ms],
    TempDBAvgWriteLatencyMs AS [Write Latency ms],
    TempDBTotalSizeMB AS [Total Size MB],
    TempDBUsedSpaceMB AS [Used Space MB],
    TempDBFreeSpacePct AS [Free Space %],
    TempDBVersionStoreMB AS [Version Store MB],
    TempDBPageLatchWaits AS [PAGELATCH Waits],
    CollectedAtUtc AS [Fecha Recolección]
FROM InstanceHealth_ConfiguracionTempdb
WHERE InstanceName = @InstanceName
ORDER BY CollectedAtUtc DESC;

-- ==============================================================================
-- 3. Calcular el score ESPERADO con la fórmula nueva
-- ==============================================================================

SELECT 
    '🧮 Score Esperado (Fórmula Nueva)' AS [Sección],
    InstanceName,
    
    -- Score actual guardado
    TempDBContentionScore AS [Score BD (viejo)],
    
    -- Calcular score de contención (40%)
    CASE 
        WHEN TempDBPageLatchWaits = 0 THEN 100
        WHEN TempDBPageLatchWaits < 100 THEN 90
        WHEN TempDBPageLatchWaits < 1000 THEN 70
        WHEN TempDBPageLatchWaits < 10000 THEN 40
        ELSE 0
    END AS [Contención Score],
    
    -- Calcular score de latencia (30%)
    CASE 
        WHEN TempDBAvgWriteLatencyMs = 0 THEN 100
        WHEN TempDBAvgWriteLatencyMs <= 5 THEN 100
        WHEN TempDBAvgWriteLatencyMs <= 10 THEN 90
        WHEN TempDBAvgWriteLatencyMs <= 20 THEN 70
        WHEN TempDBAvgWriteLatencyMs <= 50 THEN 40
        ELSE 0
    END AS [Latencia Score],
    
    -- Score de configuración (simplificado, 20%)
    CASE 
        WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 AND TempDBGrowthConfigOK = 1 THEN 100
        WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 THEN 90
        WHEN TempDBAllSameSize = 1 OR TempDBAllSameGrowth = 1 THEN 70
        ELSE 50
    END AS [Config Score],
    
    -- Score de recursos (10%)
    CASE 
        WHEN TempDBFreeSpacePct = 0 THEN 80  -- Sin datos
        WHEN TempDBFreeSpacePct >= 20 THEN 100
        WHEN TempDBFreeSpacePct >= 10 THEN 60
        ELSE 0
    END AS [Recursos Score],
    
    -- SCORE COMPUESTO ESPERADO
    CAST(
        (CASE 
            WHEN TempDBPageLatchWaits = 0 THEN 100
            WHEN TempDBPageLatchWaits < 100 THEN 90
            WHEN TempDBPageLatchWaits < 1000 THEN 70
            WHEN TempDBPageLatchWaits < 10000 THEN 40
            ELSE 0
        END * 0.40) +
        (CASE 
            WHEN TempDBAvgWriteLatencyMs = 0 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 5 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 10 THEN 90
            WHEN TempDBAvgWriteLatencyMs <= 20 THEN 70
            WHEN TempDBAvgWriteLatencyMs <= 50 THEN 40
            ELSE 0
        END * 0.30) +
        (CASE 
            WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 AND TempDBGrowthConfigOK = 1 THEN 100
            WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 THEN 90
            WHEN TempDBAllSameSize = 1 OR TempDBAllSameGrowth = 1 THEN 70
            ELSE 50
        END * 0.20) +
        (CASE 
            WHEN TempDBFreeSpacePct = 0 THEN 80
            WHEN TempDBFreeSpacePct >= 20 THEN 100
            WHEN TempDBFreeSpacePct >= 10 THEN 60
            ELSE 0
        END * 0.10)
    AS INT) AS [Score Esperado (nuevo)],
    
    -- Diferencia
    CAST(
        (CASE 
            WHEN TempDBPageLatchWaits = 0 THEN 100
            WHEN TempDBPageLatchWaits < 100 THEN 90
            WHEN TempDBPageLatchWaits < 1000 THEN 70
            WHEN TempDBPageLatchWaits < 10000 THEN 40
            ELSE 0
        END * 0.40) +
        (CASE 
            WHEN TempDBAvgWriteLatencyMs = 0 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 5 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 10 THEN 90
            WHEN TempDBAvgWriteLatencyMs <= 20 THEN 70
            WHEN TempDBAvgWriteLatencyMs <= 50 THEN 40
            ELSE 0
        END * 0.30) +
        (CASE 
            WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 AND TempDBGrowthConfigOK = 1 THEN 100
            WHEN TempDBAllSameSize = 1 AND TempDBAllSameGrowth = 1 THEN 90
            WHEN TempDBAllSameSize = 1 OR TempDBAllSameGrowth = 1 THEN 70
            ELSE 50
        END * 0.20) +
        (CASE 
            WHEN TempDBFreeSpacePct = 0 THEN 80
            WHEN TempDBFreeSpacePct >= 20 THEN 100
            WHEN TempDBFreeSpacePct >= 10 THEN 60
            ELSE 0
        END * 0.10)
    AS INT) - TempDBContentionScore AS [Diferencia],
    
    CollectedAtUtc AS [Fecha Recolección]
    
FROM InstanceHealth_ConfiguracionTempdb
WHERE InstanceName = @InstanceName
ORDER BY CollectedAtUtc DESC;

-- ==============================================================================
-- 4. Ver TODAS las instancias con scores potencialmente desactualizados
-- ==============================================================================

SELECT 
    '⚠️ Instancias con Scores Desactualizados' AS [Sección],
    InstanceName,
    TempDBContentionScore AS [Score BD (viejo)],
    TempDBAvgWriteLatencyMs AS [Write Latency],
    TempDBFreeSpacePct AS [Free Space %],
    CASE 
        WHEN TempDBAvgWriteLatencyMs = 0 AND TempDBFreeSpacePct = 0 THEN '❌ Sin métricas extendidas'
        WHEN TempDBAvgWriteLatencyMs > 0 AND TempDBFreeSpacePct > 0 THEN '✅ Métricas OK'
        ELSE '⚠️ Métricas parciales'
    END AS [Estado Métricas],
    CollectedAtUtc AS [Fecha Recolección]
FROM InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(HOUR, -24, GETUTCDATE())
ORDER BY 
    CASE 
        WHEN TempDBAvgWriteLatencyMs = 0 AND TempDBFreeSpacePct = 0 THEN 0
        ELSE 1
    END,
    InstanceName;

-- ==============================================================================
-- 5. Resumen de instancias a re-recolectar
-- ==============================================================================

SELECT 
    '📋 Resumen' AS [Sección],
    COUNT(*) AS [Total Instancias],
    SUM(CASE WHEN TempDBAvgWriteLatencyMs = 0 AND TempDBFreeSpacePct = 0 THEN 1 ELSE 0 END) AS [Sin Métricas Extendidas],
    SUM(CASE WHEN TempDBAvgWriteLatencyMs > 0 AND TempDBFreeSpacePct > 0 THEN 1 ELSE 0 END) AS [Con Métricas OK],
    SUM(CASE WHEN TempDBAvgWriteLatencyMs > 0 AND TempDBFreeSpacePct = 0 THEN 1 ELSE 0 END) AS [Métricas Parciales (latency OK)],
    SUM(CASE WHEN TempDBAvgWriteLatencyMs = 0 AND TempDBFreeSpacePct > 0 THEN 1 ELSE 0 END) AS [Métricas Parciales (space OK)]
FROM InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(HOUR, -24, GETUTCDATE());

