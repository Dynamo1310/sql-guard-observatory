-- =============================================
-- Sistema Health Score V2 - Vistas de Cálculo
-- Base de datos: SQLNova
-- Calcula puntajes 0-100 por categoría
-- =============================================
USE SQLNova;
GO

-- =============================================
-- VISTA 1: Score de BACKUPS (18%)
-- RPO/RTO: edad FULL/LOG vs SLA, ChainOK
-- =============================================
IF OBJECT_ID('dbo.vw_Score_Backups', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Backups;
GO

CREATE VIEW dbo.vw_Score_Backups
AS
WITH LatestBackup AS (
    SELECT 
        Instance,
        DBName,
        LastFull,
        LastLog,
        FullAgeMin,
        LogAgeMin,
        ChainOK,
        RecoveryModel,
        ROW_NUMBER() OVER (PARTITION BY Instance, DBName ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioBackupSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -1, SYSDATETIME())
),
ScorePerDB AS (
    SELECT
        Instance,
        DBName,
        CASE
            -- Cadena rota = 0
            WHEN ChainOK = 0 THEN 0
            -- SIMPLE recovery = solo evaluar FULL
            WHEN RecoveryModel = 'SIMPLE' THEN
                CASE
                    WHEN FullAgeMin IS NULL OR FullAgeMin > 10080 THEN 0  -- >7 días
                    WHEN FullAgeMin <= 1440 THEN 100  -- <=24h
                    WHEN FullAgeMin <= 2880 THEN 80   -- <=48h
                    WHEN FullAgeMin <= 4320 THEN 60   -- <=72h
                    ELSE 40
                END
            -- FULL recovery = evaluar FULL y LOG
            ELSE
                CASE
                    WHEN FullAgeMin IS NULL OR FullAgeMin > 10080 THEN 0
                    WHEN LogAgeMin IS NULL OR LogAgeMin > 60 THEN 30  -- Log >1h es crítico
                    WHEN LogAgeMin <= 15 AND FullAgeMin <= 1440 THEN 100
                    WHEN LogAgeMin <= 30 AND FullAgeMin <= 2880 THEN 80
                    WHEN LogAgeMin <= 45 AND FullAgeMin <= 4320 THEN 60
                    ELSE 40
                END
        END AS Score,
        CASE
            WHEN ChainOK = 0 THEN 'Cadena de LOG rota'
            WHEN RecoveryModel = 'SIMPLE' THEN 'FULL: ' + CAST(FullAgeMin AS varchar) + 'min'
            ELSE 'FULL: ' + ISNULL(CAST(FullAgeMin AS varchar), 'N/A') + 'min, LOG: ' + ISNULL(CAST(LogAgeMin AS varchar), 'N/A') + 'min'
        END AS Note
    FROM LatestBackup
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(AVG(Score * 1.0) AS int) AS Score_Backups,
    STRING_AGG(CAST(DBName AS varchar(100)) + ': ' + Note, '; ') WITHIN GROUP (ORDER BY Score) AS Notes_Backups
FROM ScorePerDB
GROUP BY Instance;
GO

-- =============================================
-- VISTA 2: Score de ALWAYSON (14%)
-- Sincronización, suspensión, colas
-- =============================================
IF OBJECT_ID('dbo.vw_Score_AG', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_AG;
GO

CREATE VIEW dbo.vw_Score_AG
AS
WITH LatestAG AS (
    SELECT 
        Instance,
        AGName,
        DBName,
        SyncState,
        IsSuspended,
        SendQueueKB,
        RedoQueueKB,
        ROW_NUMBER() OVER (PARTITION BY Instance, AGName, DBName ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioAGSnapshot
    WHERE SnapshotAt >= DATEADD(MINUTE, -10, SYSDATETIME())
),
ScorePerDB AS (
    SELECT
        Instance,
        AGName,
        DBName,
        CASE
            WHEN IsSuspended = 1 THEN 0
            WHEN SyncState = 'SYNCHRONIZED' AND SendQueueKB <= 1024 AND RedoQueueKB <= 1024 THEN 100
            WHEN SyncState = 'SYNCHRONIZING' AND SendQueueKB <= 5120 THEN 80
            WHEN SyncState = 'SYNCHRONIZING' THEN 60
            WHEN SyncState = 'NOT SYNCHRONIZING' THEN 20
            ELSE 50
        END AS Score,
        CASE
            WHEN IsSuspended = 1 THEN 'SUSPENDED'
            WHEN SyncState = 'SYNCHRONIZED' THEN 'OK (SendQ=' + CAST(SendQueueKB AS varchar) + 'KB)'
            ELSE SyncState + ' (SendQ=' + CAST(SendQueueKB AS varchar) + 'KB, RedoQ=' + CAST(RedoQueueKB AS varchar) + 'KB)'
        END AS Note
    FROM LatestAG
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(AVG(Score * 1.0) AS int) AS Score_AG,
    STRING_AGG(CAST(AGName AS varchar(100)) + '.' + CAST(DBName AS varchar(100)) + ': ' + Note, '; ') WITHIN GROUP (ORDER BY Score) AS Notes_AG
FROM ScorePerDB
GROUP BY Instance;
GO

-- =============================================
-- VISTA 3: Score de CONECTIVIDAD (10%)
-- Reachability, Auth, RTT, logins fallidos
-- =============================================
IF OBJECT_ID('dbo.vw_Score_Conectividad', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Conectividad;
GO

CREATE VIEW dbo.vw_Score_Conectividad
AS
WITH LatestConn AS (
    SELECT 
        Instance,
        Reachable,
        AuthOK,
        RTTms,
        FailedLogins15m,
        ROW_NUMBER() OVER (PARTITION BY Instance ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioConectividadSnapshot
    WHERE SnapshotAt >= DATEADD(MINUTE, -15, SYSDATETIME())
)
SELECT
    Instance,
    CASE
        WHEN Reachable = 0 THEN 0
        WHEN AuthOK = 0 THEN 20
        WHEN RTTms IS NULL THEN 50
        WHEN RTTms <= 15 THEN CASE WHEN (100 - (FailedLogins15m * 5)) >= 70 THEN (100 - (FailedLogins15m * 5)) ELSE 70 END
        WHEN RTTms <= 50 THEN CASE WHEN (70 - (FailedLogins15m * 5)) >= 40 THEN (70 - (FailedLogins15m * 5)) ELSE 40 END
        ELSE CASE WHEN (40 - (FailedLogins15m * 5)) >= 10 THEN (40 - (FailedLogins15m * 5)) ELSE 10 END
    END AS Score_Conectividad,
    CASE
        WHEN Reachable = 0 THEN 'Instancia no alcanzable'
        WHEN AuthOK = 0 THEN 'Fallo de autenticación'
        ELSE 'RTT=' + CAST(RTTms AS varchar) + 'ms, Logins fallidos=' + CAST(FailedLogins15m AS varchar)
    END AS Notes_Conectividad
FROM LatestConn
WHERE rn = 1;
GO

-- =============================================
-- VISTA 4: Score de ERRORES SEV>=20 (7%)
-- Errores críticos con decaimiento temporal
-- =============================================
IF OBJECT_ID('dbo.vw_Score_ErroresSev', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_ErroresSev;
GO

CREATE VIEW dbo.vw_Score_ErroresSev
AS
WITH RecentErrors AS (
    SELECT 
        Instance,
        ErrorNumber,
        Severity,
        EventTime,
        -- Decaimiento: peso 1.0 si <1h, 0.5 si 1-6h, 0.25 si 6-24h
        CASE
            WHEN DATEDIFF(HOUR, EventTime, SYSDATETIME()) < 1 THEN 1.0
            WHEN DATEDIFF(HOUR, EventTime, SYSDATETIME()) < 6 THEN 0.5
            ELSE 0.25
        END AS Peso
    FROM dbo.InventarioErroresSevSnapshot
    WHERE Severity >= 20
      AND EventTime >= DATEADD(HOUR, -24, SYSDATETIME())
),
ErrorCount AS (
    SELECT
        Instance,
        SUM(Peso) AS ErroresPonderados,
        COUNT(*) AS TotalErrores
    FROM RecentErrors
    GROUP BY Instance
)
SELECT
    Instance,
    CASE
        WHEN ErroresPonderados IS NULL THEN 100
        ELSE CASE WHEN (100 - CAST(ErroresPonderados * 10 AS int)) >= 60 THEN (100 - CAST(ErroresPonderados * 10 AS int)) ELSE 60 END
    END AS Score_ErroresSev,
    CASE
        WHEN ErroresPonderados IS NULL THEN 'Sin errores sev>=20 en 24h'
        ELSE CAST(TotalErrores AS varchar) + ' error(es) sev>=20 (ponderado=' + CAST(CAST(ErroresPonderados AS decimal(5,1)) AS varchar) + ')'
    END AS Notes_ErroresSev
FROM ErrorCount;
GO

-- =============================================
-- VISTA 5: Score de CPU (10%)
-- p95 últimos 5-15min, runnable tasks
-- =============================================
IF OBJECT_ID('dbo.vw_Score_CPU', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_CPU;
GO

CREATE VIEW dbo.vw_Score_CPU
AS
WITH RecentCPU AS (
    SELECT 
        Instance,
        CpuPct_p95,
        RunnableTasksAvg,
        ROW_NUMBER() OVER (PARTITION BY Instance ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioCPUSnapshot
    WHERE SnapshotAt >= DATEADD(MINUTE, -15, SYSDATETIME())
)
SELECT
    Instance,
    CASE
        WHEN CpuPct_p95 IS NULL THEN 100
        WHEN CpuPct_p95 <= 80 THEN CASE WHEN (100 - CAST(RunnableTasksAvg * 5 AS int)) >= 90 THEN (100 - CAST(RunnableTasksAvg * 5 AS int)) ELSE 90 END
        WHEN CpuPct_p95 <= 90 THEN CASE WHEN (70 - CAST(RunnableTasksAvg * 5 AS int)) >= 50 THEN (70 - CAST(RunnableTasksAvg * 5 AS int)) ELSE 50 END
        ELSE CASE WHEN (40 - CAST(RunnableTasksAvg * 5 AS int)) >= 20 THEN (40 - CAST(RunnableTasksAvg * 5 AS int)) ELSE 20 END
    END AS Score_CPU,
    'CPU p95=' + ISNULL(CAST(CAST(CpuPct_p95 AS decimal(5,1)) AS varchar), 'N/A') + '%, Runnable=' + ISNULL(CAST(CAST(RunnableTasksAvg AS decimal(5,1)) AS varchar), '0') AS Notes_CPU
FROM RecentCPU
WHERE rn = 1;
GO

-- =============================================
-- VISTA 6: Score de IO (10%)
-- Latencia data/log p95, IOPS secundario
-- =============================================
IF OBJECT_ID('dbo.vw_Score_IO', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_IO;
GO

CREATE VIEW dbo.vw_Score_IO
AS
WITH RecentIO AS (
    SELECT 
        Instance,
        FileType,
        AvgLatencyRead_ms,
        AvgLatencyWrite_ms,
        SnapshotAt
    FROM dbo.InventarioIOSnapshot
    WHERE SnapshotAt >= DATEADD(MINUTE, -15, SYSDATETIME())
),
IOPercentiles AS (
    SELECT
        Instance,
        FileType,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY AvgLatencyRead_ms) OVER (PARTITION BY Instance, FileType) AS p95_Read,
        PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY AvgLatencyWrite_ms) OVER (PARTITION BY Instance, FileType) AS p95_Write,
        ROW_NUMBER() OVER (PARTITION BY Instance, FileType ORDER BY SnapshotAt DESC) AS rn
    FROM RecentIO
),
ScorePerType AS (
    SELECT
        Instance,
        FileType,
        CASE WHEN p95_Read >= p95_Write THEN p95_Read ELSE p95_Write END AS MaxLatency,
        CASE
            WHEN CASE WHEN p95_Read >= p95_Write THEN p95_Read ELSE p95_Write END <= 5 THEN 100
            WHEN CASE WHEN p95_Read >= p95_Write THEN p95_Read ELSE p95_Write END <= 10 THEN 80
            WHEN CASE WHEN p95_Read >= p95_Write THEN p95_Read ELSE p95_Write END <= 20 THEN 60
            ELSE 40
        END AS Score,
        'p95=' + CAST(CAST(CASE WHEN p95_Read >= p95_Write THEN p95_Read ELSE p95_Write END AS decimal(5,1)) AS varchar) + 'ms' AS Note
    FROM IOPercentiles
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(AVG(Score * 1.0) AS int) AS Score_IO,
    STRING_AGG(FileType + ': ' + Note, '; ') WITHIN GROUP (ORDER BY Score) AS Notes_IO
FROM ScorePerType
GROUP BY Instance;
GO

-- =============================================
-- VISTA 7: Score de DISCOS (8%)
-- % libre por volumen, ponderado por rol
-- =============================================
IF OBJECT_ID('dbo.vw_Score_Discos', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Discos;
GO

CREATE VIEW dbo.vw_Score_Discos
AS
WITH LatestDiscos AS (
    SELECT 
        Instance,
        DriveLetter,
        [Role],
        FreePct,
        SizeGB,
        ROW_NUMBER() OVER (PARTITION BY Instance, DriveLetter ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioDiscosSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -1, SYSDATETIME())
),
ScorePerDrive AS (
    SELECT
        Instance,
        DriveLetter,
        [Role],
        FreePct,
        CASE
            WHEN FreePct >= 20 THEN 100
            WHEN FreePct >= 15 THEN 80
            WHEN FreePct >= 10 THEN 60
            WHEN FreePct >= 5 THEN 40
            ELSE 0
        END AS Score,
        CASE
            WHEN [Role] = 'Log' THEN 1.2
            WHEN [Role] = 'Data' THEN 1.0
            WHEN [Role] = 'Backups' THEN 0.8
            WHEN [Role] = 'SO' THEN 0.6
            ELSE 0.5
        END AS Peso,
        CAST(FreePct AS varchar) + '% libre (' + [Role] + ')' AS Note
    FROM LatestDiscos
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(SUM(Score * Peso) / NULLIF(SUM(Peso), 0) AS int) AS Score_Discos,
    STRING_AGG(DriveLetter + ': ' + Note, '; ') WITHIN GROUP (ORDER BY Score) AS Notes_Discos
FROM ScorePerDrive
GROUP BY Instance;
GO

-- =============================================
-- VISTA 8: Score de MEMORIA (7%)
-- PLE objetivo, grants pending, committed/target
-- =============================================
IF OBJECT_ID('dbo.vw_Score_Memoria', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Memoria;
GO

CREATE VIEW dbo.vw_Score_Memoria
AS
WITH LatestMemoria AS (
    SELECT 
        Instance,
        PLE_MinNUMA,
        PLE_Target_sec,
        MemoryGrantsPending,
        CommittedGB,
        TargetGB,
        ROW_NUMBER() OVER (PARTITION BY Instance ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioMemoriaSnapshot
    WHERE SnapshotAt >= DATEADD(MINUTE, -15, SYSDATETIME())
),
MemoriaCalc AS (
    SELECT
        Instance,
        PLE_MinNUMA,
        PLE_Target_sec,
        MemoryGrantsPending,
        CommittedGB,
        TargetGB,
        -- Score PLE: 60% del total
        CASE
            WHEN PLE_Target_sec IS NULL OR PLE_Target_sec = 0 THEN 100
            ELSE CASE WHEN CAST((PLE_MinNUMA * 1.0 / PLE_Target_sec) * 100 AS int) <= 100 THEN CAST((PLE_MinNUMA * 1.0 / PLE_Target_sec) * 100 AS int) ELSE 100 END
        END AS Score_PLE,
        -- Score Grants: 25%
        CASE
            WHEN MemoryGrantsPending = 0 THEN 100
            WHEN MemoryGrantsPending <= 5 THEN 80
            WHEN MemoryGrantsPending <= 10 THEN 60
            ELSE 40
        END AS Score_Grants,
        -- Score Uso: 15%
        CASE
            WHEN TargetGB IS NULL OR TargetGB = 0 THEN 100
            WHEN ABS(CommittedGB - TargetGB) / TargetGB <= 0.05 THEN 100
            WHEN ABS(CommittedGB - TargetGB) / TargetGB <= 0.15 THEN 80
            ELSE 60
        END AS Score_Uso
    FROM LatestMemoria
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(0.60 * Score_PLE + 0.25 * Score_Grants + 0.15 * Score_Uso AS int) AS Score_Memoria,
    'PLE=' + CAST(PLE_MinNUMA AS varchar) + 's (obj=' + CAST(PLE_Target_sec AS varchar) + 's), Grants=' + CAST(MemoryGrantsPending AS varchar) + ', Uso=' + CAST(CAST(CommittedGB AS decimal(5,1)) AS varchar) + '/' + CAST(CAST(TargetGB AS decimal(5,1)) AS varchar) + 'GB' AS Notes_Memoria
FROM MemoriaCalc;
GO

-- =============================================
-- VISTA 9: Score de MANTENIMIENTO (6%)
-- CHECKDB, IndexOptimize, StatsUpdate
-- =============================================
IF OBJECT_ID('dbo.vw_Score_Mantenimiento', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Mantenimiento;
GO

CREATE VIEW dbo.vw_Score_Mantenimiento
AS
WITH LatestMaint AS (
    SELECT 
        Instance,
        DBName,
        CheckDB_AgeDays,
        CheckDB_WithinSLA,
        IndexOpt_AgeDays,
        Stats_AgeDays,
        ROW_NUMBER() OVER (PARTITION BY Instance, DBName ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioMantenimientoSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -2, SYSDATETIME())
),
MaintStats AS (
    SELECT
        Instance,
        COUNT(*) AS TotalDBs,
        SUM(CASE WHEN CheckDB_WithinSLA = 1 THEN 1 ELSE 0 END) AS DBs_CheckDB_OK,
        SUM(CASE WHEN IndexOpt_AgeDays <= 7 THEN 1 ELSE 0 END) AS DBs_Index_OK,
        SUM(CASE WHEN Stats_AgeDays <= 3 THEN 1 ELSE 0 END) AS DBs_Stats_OK
    FROM LatestMaint
    WHERE rn = 1
    GROUP BY Instance
)
SELECT
    Instance,
    CASE
        WHEN TotalDBs = 0 THEN 100
        WHEN DBs_CheckDB_OK * 1.0 / TotalDBs >= 0.90 THEN 
            70 + 
            CASE WHEN CAST((DBs_Index_OK * 1.0 / TotalDBs) * 15 AS int) <= 15 THEN CAST((DBs_Index_OK * 1.0 / TotalDBs) * 15 AS int) ELSE 15 END + 
            CASE WHEN CAST((DBs_Stats_OK * 1.0 / TotalDBs) * 15 AS int) <= 15 THEN CAST((DBs_Stats_OK * 1.0 / TotalDBs) * 15 AS int) ELSE 15 END
        WHEN DBs_CheckDB_OK * 1.0 / TotalDBs >= 0.70 THEN 60
        WHEN DBs_CheckDB_OK * 1.0 / TotalDBs >= 0.50 THEN 40
        ELSE 20
    END AS Score_Mantenimiento,
    'CHECKDB OK=' + CAST(DBs_CheckDB_OK AS varchar) + '/' + CAST(TotalDBs AS varchar) + ', Index=' + CAST(DBs_Index_OK AS varchar) + ', Stats=' + CAST(DBs_Stats_OK AS varchar) AS Notes_Mantenimiento
FROM MaintStats;
GO

-- =============================================
-- VISTA 10: Score de CONFIG & TEMPDB (10%)
-- Tempdb (archivos, tamaños, growth, pagelatch) + max memory
-- =============================================
IF OBJECT_ID('dbo.vw_Score_ConfigRecursos', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_ConfigRecursos;
GO

CREATE VIEW dbo.vw_Score_ConfigRecursos
AS
WITH LatestConfig AS (
    SELECT 
        Instance,
        Tempdb_Files,
        Tempdb_Files_Recom,
        Tempdb_SizesEqualPct,
        Tempdb_GrowthMBOnly,
        Tempdb_Pagelatch,
        Tempdb_Latency_ms,
        TotalRAM_GB,
        MaxServerMemory_GB,
        MaxRecomendado_GB,
        ROW_NUMBER() OVER (PARTITION BY Instance ORDER BY SnapshotAt DESC) AS rn
    FROM dbo.InventarioConfigRecursosSnapshot
    WHERE SnapshotAt >= DATEADD(HOUR, -6, SYSDATETIME())
),
ConfigCalc AS (
    SELECT
        Instance,
        -- Subscore Tempdb (60%)
        CASE
            WHEN Tempdb_Pagelatch = 1 THEN 0  -- PAGELATCH crítico
            WHEN Tempdb_Files IS NULL THEN 50
            WHEN Tempdb_Files = Tempdb_Files_Recom 
                 AND Tempdb_SizesEqualPct >= 95 
                 AND Tempdb_GrowthMBOnly = 1 
                 AND ISNULL(Tempdb_Latency_ms, 0) <= 10 THEN 100
            WHEN ABS(Tempdb_Files - Tempdb_Files_Recom) <= 1 
                 AND Tempdb_SizesEqualPct >= 90 
                 AND Tempdb_GrowthMBOnly = 1 THEN 80
            WHEN Tempdb_GrowthMBOnly = 1 AND Tempdb_SizesEqualPct >= 80 THEN 60
            ELSE 40
        END AS Score_Tempdb,
        -- Subscore Memoria (40%)
        CASE
            WHEN MaxRecomendado_GB IS NULL OR MaxRecomendado_GB = 0 THEN 100
            WHEN ABS(MaxServerMemory_GB - MaxRecomendado_GB) / MaxRecomendado_GB <= 0.10 THEN 100
            WHEN ABS(MaxServerMemory_GB - MaxRecomendado_GB) / MaxRecomendado_GB <= 0.25 THEN 50
            ELSE 0
        END AS Score_MaxMemory,
        -- Notas
        'Tempdb: ' + CAST(Tempdb_Files AS varchar) + ' files (recom=' + CAST(Tempdb_Files_Recom AS varchar) + '), ' +
        CASE WHEN Tempdb_Pagelatch = 1 THEN 'PAGELATCH!, ' ELSE '' END +
        'MaxMem: ' + CAST(CAST(MaxServerMemory_GB AS decimal(5,1)) AS varchar) + 'GB (recom=' + CAST(CAST(MaxRecomendado_GB AS decimal(5,1)) AS varchar) + 'GB)' AS Note
    FROM LatestConfig
    WHERE rn = 1
)
SELECT
    Instance,
    CAST(0.60 * Score_Tempdb + 0.40 * Score_MaxMemory AS int) AS Score_ConfigRecursos,
    Note AS Notes_ConfigRecursos
FROM ConfigCalc;
GO

-- =============================================
-- VISTA CONSOLIDADA: Scores de todas las categorías
-- =============================================
IF OBJECT_ID('dbo.vw_CategoryScores_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_CategoryScores_V2;
GO

CREATE VIEW dbo.vw_CategoryScores_V2
AS
WITH AllInstances AS (
    SELECT DISTINCT Instance FROM dbo.InventarioBackupSnapshot
    UNION
    SELECT DISTINCT Instance FROM dbo.InventarioAGSnapshot
    UNION
    SELECT DISTINCT Instance FROM dbo.InventarioConectividadSnapshot
    UNION
    SELECT DISTINCT Instance FROM dbo.InventarioCPUSnapshot
    UNION
    SELECT DISTINCT Instance FROM dbo.InventarioMemoriaSnapshot
)
SELECT
    i.Instance,
    ISNULL(b.Score_Backups, 100) AS Score_Backups,
    ISNULL(b.Notes_Backups, 'Sin datos') AS Notes_Backups,
    ISNULL(ag.Score_AG, 100) AS Score_AG,
    ISNULL(ag.Notes_AG, 'Sin AG configurado') AS Notes_AG,
    ISNULL(c.Score_Conectividad, 100) AS Score_Conectividad,
    ISNULL(c.Notes_Conectividad, 'Sin datos') AS Notes_Conectividad,
    ISNULL(e.Score_ErroresSev, 100) AS Score_ErroresSev,
    ISNULL(e.Notes_ErroresSev, 'Sin errores') AS Notes_ErroresSev,
    ISNULL(cpu.Score_CPU, 100) AS Score_CPU,
    ISNULL(cpu.Notes_CPU, 'Sin datos') AS Notes_CPU,
    ISNULL(io.Score_IO, 100) AS Score_IO,
    ISNULL(io.Notes_IO, 'Sin datos') AS Notes_IO,
    ISNULL(d.Score_Discos, 100) AS Score_Discos,
    ISNULL(d.Notes_Discos, 'Sin datos') AS Notes_Discos,
    ISNULL(m.Score_Memoria, 100) AS Score_Memoria,
    ISNULL(m.Notes_Memoria, 'Sin datos') AS Notes_Memoria,
    ISNULL(mnt.Score_Mantenimiento, 100) AS Score_Mantenimiento,
    ISNULL(mnt.Notes_Mantenimiento, 'Sin datos') AS Notes_Mantenimiento,
    ISNULL(cfg.Score_ConfigRecursos, 100) AS Score_ConfigRecursos,
    ISNULL(cfg.Notes_ConfigRecursos, 'Sin datos') AS Notes_ConfigRecursos
FROM AllInstances i
LEFT JOIN dbo.vw_Score_Backups b ON i.Instance = b.Instance
LEFT JOIN dbo.vw_Score_AG ag ON i.Instance = ag.Instance
LEFT JOIN dbo.vw_Score_Conectividad c ON i.Instance = c.Instance
LEFT JOIN dbo.vw_Score_ErroresSev e ON i.Instance = e.Instance
LEFT JOIN dbo.vw_Score_CPU cpu ON i.Instance = cpu.Instance
LEFT JOIN dbo.vw_Score_IO io ON i.Instance = io.Instance
LEFT JOIN dbo.vw_Score_Discos d ON i.Instance = d.Instance
LEFT JOIN dbo.vw_Score_Memoria m ON i.Instance = m.Instance
LEFT JOIN dbo.vw_Score_Mantenimiento mnt ON i.Instance = mnt.Instance
LEFT JOIN dbo.vw_Score_ConfigRecursos cfg ON i.Instance = cfg.Instance;
GO

-- =============================================
-- VISTA HEALTH RAW: Puntaje ponderado sin caps
-- =============================================
IF OBJECT_ID('dbo.vw_HealthRaw_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthRaw_V2;
GO

CREATE VIEW dbo.vw_HealthRaw_V2
AS
SELECT
    Instance,
    Score_Backups,
    Score_AG,
    Score_Conectividad,
    Score_ErroresSev,
    Score_CPU,
    Score_IO,
    Score_Discos,
    Score_Memoria,
    Score_Mantenimiento,
    Score_ConfigRecursos,
    CAST(ROUND(
        0.18 * Score_Backups +
        0.14 * Score_AG +
        0.10 * Score_Conectividad +
        0.07 * Score_ErroresSev +
        0.10 * Score_CPU +
        0.10 * Score_IO +
        0.08 * Score_Discos +
        0.07 * Score_Memoria +
        0.06 * Score_Mantenimiento +
        0.10 * Score_ConfigRecursos, 0) AS int) AS HealthRaw
FROM dbo.vw_CategoryScores_V2;
GO

PRINT 'Vistas de Score por Categoría creadas exitosamente';
GO

