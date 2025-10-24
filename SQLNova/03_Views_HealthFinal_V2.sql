-- =============================================
-- Sistema Health Score V2 - Vista Final con CAPS
-- Base de datos: SQLNova
-- Aplica hard-stops (caps) al HealthRaw
-- =============================================
USE SQLNova;
GO

-- =============================================
-- VISTA HEALTH FINAL: Aplica caps globales
-- =============================================
IF OBJECT_ID('dbo.vw_HealthFinal_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthFinal_V2;
GO

CREATE VIEW dbo.vw_HealthFinal_V2
AS
WITH HealthBase AS (
    SELECT
        Instance,
        Score_Backups,
        Score_AG,
        Score_ErroresSev,
        Score_Memoria,
        Score_IO,
        Score_ConfigRecursos,
        HealthRaw
    FROM dbo.vw_HealthRaw_V2
),
-- Detectar condiciones de CAP
CapConditions AS (
    SELECT
        h.Instance,
        h.HealthRaw,
        -- CAP 1: Cadena de LOG rota → 60
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioBackupSnapshot b
                WHERE b.Instance = h.Instance 
                  AND b.ChainOK = 0
                  AND b.SnapshotAt >= DATEADD(MINUTE, -10, SYSDATETIME())
            ) THEN 60 
            ELSE NULL 
        END AS Cap_LogChain,
        -- CAP 2: AG con DB SUSPENDED/no sincronizada >2min → 60
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioAGSnapshot ag
                WHERE ag.Instance = h.Instance 
                  AND (ag.IsSuspended = 1 OR ag.SyncState IN ('NOT SYNCHRONIZING', 'REVERTING'))
                  AND ag.SnapshotAt >= DATEADD(MINUTE, -3, SYSDATETIME())
            ) THEN 60 
            ELSE NULL 
        END AS Cap_AG_Suspended,
        -- CAP 3: Errores sev>=20 última hora → 70
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioErroresSevSnapshot e
                WHERE e.Instance = h.Instance 
                  AND e.Severity >= 20
                  AND e.EventTime >= DATEADD(HOUR, -1, SYSDATETIME())
            ) THEN 70 
            ELSE NULL 
        END AS Cap_ErroresSev,
        -- CAP 4: PLE < 0.15×objetivo → 60; <0.30×objetivo → 70
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioMemoriaSnapshot m
                WHERE m.Instance = h.Instance 
                  AND m.PLE_Target_sec > 0
                  AND m.PLE_MinNUMA < (0.15 * m.PLE_Target_sec)
                  AND m.SnapshotAt >= DATEADD(MINUTE, -10, SYSDATETIME())
            ) THEN 60
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioMemoriaSnapshot m
                WHERE m.Instance = h.Instance 
                  AND m.PLE_Target_sec > 0
                  AND m.PLE_MinNUMA < (0.30 * m.PLE_Target_sec)
                  AND m.SnapshotAt >= DATEADD(MINUTE, -10, SYSDATETIME())
            ) THEN 70
            ELSE NULL 
        END AS Cap_PLE,
        -- CAP 5: Latencia LOG p95 >20ms últimos 5min → 70
        CASE 
            WHEN EXISTS (
                SELECT 1 
                FROM (
                    SELECT 
                        Instance,
                        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY AvgLatencyWrite_ms) OVER (PARTITION BY Instance) AS p95_Write
                    FROM dbo.InventarioIOSnapshot
                    WHERE FileType = 'Log'
                      AND SnapshotAt >= DATEADD(MINUTE, -5, SYSDATETIME())
                ) io
                WHERE io.Instance = h.Instance 
                  AND io.p95_Write > 20
            ) THEN 70 
            ELSE NULL 
        END AS Cap_LatenciaLog,
        -- CAP 6: Contención tempdb (PAGELATCH) → 65
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM dbo.InventarioConfigRecursosSnapshot cfg
                WHERE cfg.Instance = h.Instance 
                  AND cfg.Tempdb_Pagelatch = 1
                  AND cfg.SnapshotAt >= DATEADD(MINUTE, -10, SYSDATETIME())
            ) THEN 65 
            ELSE NULL 
        END AS Cap_Tempdb_Pagelatch
    FROM HealthBase h
),
-- Determinar el CAP más restrictivo
CapsApplied AS (
    SELECT
        Instance,
        HealthRaw,
        CASE
            WHEN Cap_LogChain IS NOT NULL THEN 'Cadena de LOG rota'
            WHEN Cap_AG_Suspended IS NOT NULL THEN 'AG suspendido/no sincronizado'
            WHEN Cap_PLE = 60 THEN 'PLE crítico (<15% objetivo)'
            WHEN Cap_Tempdb_Pagelatch IS NOT NULL THEN 'Contención PAGELATCH en tempdb'
            WHEN Cap_ErroresSev IS NOT NULL THEN 'Errores sev>=20 última hora'
            WHEN Cap_LatenciaLog IS NOT NULL THEN 'Latencia LOG >20ms'
            WHEN Cap_PLE = 70 THEN 'PLE bajo (<30% objetivo)'
            ELSE NULL
        END AS CapReason,
        LEAST(
            HealthRaw,
            ISNULL(Cap_LogChain, 999),
            ISNULL(Cap_AG_Suspended, 999),
            ISNULL(Cap_ErroresSev, 999),
            ISNULL(Cap_PLE, 999),
            ISNULL(Cap_LatenciaLog, 999),
            ISNULL(Cap_Tempdb_Pagelatch, 999)
        ) AS HealthFinal
    FROM CapConditions
),
-- Top 3 penalizaciones (categorías con menor score)
TopPenalizaciones AS (
    SELECT
        cs.Instance,
        STRING_AGG(CatName + ' (' + CAST(Score AS varchar) + ')', ', ') WITHIN GROUP (ORDER BY Score) AS Top3Penalizaciones
    FROM (
        SELECT Instance, 'Backups' AS CatName, Score_Backups AS Score FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'AlwaysOn', Score_AG FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'Conectividad', Score_Conectividad FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'CPU', Score_CPU FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'IO', Score_IO FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'Discos', Score_Discos FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'Memoria', Score_Memoria FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'Mantenimiento', Score_Mantenimiento FROM dbo.vw_CategoryScores_V2
        UNION ALL
        SELECT Instance, 'ConfigRecursos', Score_ConfigRecursos FROM dbo.vw_CategoryScores_V2
    ) cs
    WHERE Score < 80  -- Solo mostrar categorías con problemas
    GROUP BY cs.Instance
)
SELECT
    ca.Instance,
    ca.HealthRaw,
    ca.CapReason AS CapApplied,
    ca.HealthFinal,
    ISNULL(tp.Top3Penalizaciones, 'Todas las categorías >80') AS Top3Penalizaciones,
    -- Color de semáforo
    CASE
        WHEN ca.HealthFinal >= 85 THEN 'Verde'
        WHEN ca.HealthFinal >= 75 THEN 'Amarillo'
        WHEN ca.HealthFinal >= 65 THEN 'Naranja'
        ELSE 'Rojo'
    END AS ColorSemaforo,
    SYSDATETIME() AS CalculadoAt
FROM CapsApplied ca
LEFT JOIN TopPenalizaciones tp ON ca.Instance = tp.Instance;
GO

-- =============================================
-- VISTA HISTÓRICO 24H: Tendencias de Health Score
-- =============================================
IF OBJECT_ID('dbo.vw_HealthTendencias_24h_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthTendencias_24h_V2;
GO

CREATE VIEW dbo.vw_HealthTendencias_24h_V2
AS
WITH RecentSnapshots AS (
    -- Tomamos snapshots horarios de las últimas 24h
    SELECT DISTINCT
        Instance,
        DATEADD(HOUR, DATEDIFF(HOUR, 0, SnapshotAt), 0) AS HourBucket
    FROM dbo.InventarioBackupSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -24, SYSDATETIME())
    UNION
    SELECT DISTINCT
        Instance,
        DATEADD(HOUR, DATEDIFF(HOUR, 0, SnapshotAt), 0)
    FROM dbo.InventarioCPUSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -24, SYSDATETIME())
),
-- Para cada hora, calculamos un HealthScore aproximado
-- (simplificado, en producción sería mejor materializar snapshots horarios)
HealthByHour AS (
    SELECT
        rs.Instance,
        rs.HourBucket,
        -- Aproximación: usar último HealthFinal conocido o promedio de categorías críticas
        (
            SELECT TOP 1 HealthFinal 
            FROM dbo.vw_HealthFinal_V2 hf 
            WHERE hf.Instance = rs.Instance
        ) AS HealthScore  -- Simplificado: usa el actual
    FROM RecentSnapshots rs
)
SELECT
    Instance,
    HourBucket,
    HealthScore
FROM HealthByHour
WHERE HealthScore IS NOT NULL;
GO

-- =============================================
-- VISTA HISTÓRICO 7D: Tendencias semanales
-- =============================================
IF OBJECT_ID('dbo.vw_HealthTendencias_7d_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthTendencias_7d_V2;
GO

CREATE VIEW dbo.vw_HealthTendencias_7d_V2
AS
WITH RecentSnapshots AS (
    SELECT DISTINCT
        Instance,
        DATEADD(DAY, DATEDIFF(DAY, 0, SnapshotAt), 0) AS DayBucket
    FROM dbo.InventarioBackupSnapshot
    WHERE SnapshotAt >= DATEADD(DAY, -7, SYSDATETIME())
    UNION
    SELECT DISTINCT
        Instance,
        DATEADD(DAY, DATEDIFF(DAY, 0, SnapshotAt), 0)
    FROM dbo.InventarioCPUSnapshot
    WHERE SnapshotAt >= DATEADD(DAY, -7, SYSDATETIME())
),
HealthByDay AS (
    SELECT
        rs.Instance,
        rs.DayBucket,
        (
            SELECT TOP 1 HealthFinal 
            FROM dbo.vw_HealthFinal_V2 hf 
            WHERE hf.Instance = rs.Instance
        ) AS HealthScore
    FROM RecentSnapshots rs
)
SELECT
    Instance,
    DayBucket,
    HealthScore
FROM HealthByDay
WHERE HealthScore IS NOT NULL;
GO

-- =============================================
-- PROCEDIMIENTO: Registrar alertas automáticas
-- =============================================
IF OBJECT_ID('dbo.usp_RegistrarAlerta_V2', 'P') IS NOT NULL DROP PROCEDURE dbo.usp_RegistrarAlerta_V2;
GO

CREATE PROCEDURE dbo.usp_RegistrarAlerta_V2
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Detectar cambios de estado (histeresis: >5 min en nuevo estado)
    WITH EstadoActual AS (
        SELECT
            Instance,
            HealthFinal,
            ColorSemaforo,
            CapApplied,
            Top3Penalizaciones
        FROM dbo.vw_HealthFinal_V2
    ),
    UltimaAlerta AS (
        SELECT
            Instance,
            EstadoNuevo AS UltimoEstado,
            HealthScoreNuevo AS UltimoHealth,
            ROW_NUMBER() OVER (PARTITION BY Instance ORDER BY DetectadoAt DESC) AS rn
        FROM dbo.HealthScoreAlertas
    )
    INSERT INTO dbo.HealthScoreAlertas (Instance, EstadoAnterior, EstadoNuevo, HealthScoreAnterior, HealthScoreNuevo, Causa)
    SELECT
        ea.Instance,
        ua.UltimoEstado,
        ea.ColorSemaforo,
        ua.UltimoHealth,
        ea.HealthFinal,
        ISNULL(ea.CapApplied, ea.Top3Penalizaciones)
    FROM EstadoActual ea
    LEFT JOIN UltimaAlerta ua ON ea.Instance = ua.Instance AND ua.rn = 1
    WHERE ua.Instance IS NULL  -- Primera alerta
       OR (ea.ColorSemaforo IN ('Naranja', 'Rojo') AND ea.ColorSemaforo <> ua.UltimoEstado)  -- Cambio a peor
       OR (ABS(ea.HealthFinal - ua.UltimoHealth) >= 15);  -- Cambio significativo

    RETURN 0;
END
GO

PRINT 'Vista HealthFinal_V2 con CAPS y procedimientos de alerta creados exitosamente';
GO

