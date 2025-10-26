-- 🔍 VERIFICAR CÁLCULO DE SCORE PARA UNA INSTANCIA
-- Reemplaza 'NOMBRE_INSTANCIA' con el nombre de tu instancia

DECLARE @InstanceName NVARCHAR(255) = 'NOMBRE_INSTANCIA';  -- ⚠️ CAMBIAR AQUÍ

SELECT TOP 1
    '📊 DATOS GUARDADOS EN LA BD' AS [Sección],
    InstanceName,
    
    -- Score guardado
    TempDBContentionScore AS [Score Guardado (58?)],
    
    -- Métricas para CONTENCIÓN (40%)
    TempDBPageLatchWaits AS [PAGELATCH Waits],
    CASE 
        WHEN TempDBPageLatchWaits = 0 THEN 100
        WHEN TempDBPageLatchWaits < 100 THEN 90
        WHEN TempDBPageLatchWaits < 1000 THEN 70
        WHEN TempDBPageLatchWaits < 10000 THEN 40
        ELSE 0
    END AS [Score Contención],
    
    -- Métricas para LATENCIA (30%)
    TempDBAvgWriteLatencyMs AS [Write Latency Ms],
    CASE 
        WHEN TempDBAvgWriteLatencyMs = 0 THEN 100
        WHEN TempDBAvgWriteLatencyMs <= 5 THEN 100
        WHEN TempDBAvgWriteLatencyMs <= 10 THEN 90
        WHEN TempDBAvgWriteLatencyMs <= 20 THEN 70
        WHEN TempDBAvgWriteLatencyMs <= 50 THEN 40
        ELSE 0
    END AS [Score Latencia],
    
    -- Métricas para CONFIGURACIÓN (20%)
    TempDBFileCount AS [Files],
    TempDBAllSameSize AS [Same Size],
    TempDBAllSameGrowth AS [Same Growth],
    TempDBGrowthConfigOK AS [Growth OK],
    
    -- Métricas para RECURSOS (10%)
    TempDBFreeSpacePct AS [Free Space %],
    TempDBVersionStoreMB AS [Version Store MB],
    
    -- SCORE CALCULADO MANUALMENTE
    CAST(
        -- Contención (40%)
        (CASE 
            WHEN TempDBPageLatchWaits = 0 THEN 100
            WHEN TempDBPageLatchWaits < 100 THEN 90
            WHEN TempDBPageLatchWaits < 1000 THEN 70
            WHEN TempDBPageLatchWaits < 10000 THEN 40
            ELSE 0
        END * 0.40) +
        -- Latencia (30%)
        (CASE 
            WHEN TempDBAvgWriteLatencyMs = 0 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 5 THEN 100
            WHEN TempDBAvgWriteLatencyMs <= 10 THEN 90
            WHEN TempDBAvgWriteLatencyMs <= 20 THEN 70
            WHEN TempDBAvgWriteLatencyMs <= 50 THEN 40
            ELSE 0
        END * 0.30) +
        -- Config (20%) - simplificado
        (100 * 0.20) +
        -- Recursos (10%)
        (CASE 
            WHEN TempDBFreeSpacePct = 0 THEN 80
            WHEN TempDBFreeSpacePct >= 20 THEN 100
            WHEN TempDBFreeSpacePct >= 10 THEN 60
            ELSE 0
        END * 0.10)
    AS INT) AS [Score Esperado Manual],
    
    -- DIFERENCIA
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
        (100 * 0.20) +
        (CASE 
            WHEN TempDBFreeSpacePct = 0 THEN 80
            WHEN TempDBFreeSpacePct >= 20 THEN 100
            WHEN TempDBFreeSpacePct >= 10 THEN 60
            ELSE 0
        END * 0.10)
    AS INT) - TempDBContentionScore AS [Diferencia (esperado - actual)],
    
    CollectedAtUtc AS [Fecha Recolección]
FROM InstanceHealth_ConfiguracionTempdb
WHERE InstanceName = @InstanceName
ORDER BY CollectedAtUtc DESC;

