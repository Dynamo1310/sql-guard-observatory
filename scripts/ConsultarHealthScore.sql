-- ================================================================================
-- SQL Script: Consultas y Vistas para HealthScore
-- Base de datos: SQLNova en SSPR17MON-01
-- Descripción: Vistas y queries útiles para analizar el HealthScore de instancias
-- ================================================================================

USE SQLNova;
GO

-- ================================================================================
-- VISTA: Último HealthScore por Instancia
-- ================================================================================

IF OBJECT_ID('dbo.vw_LatestHealthScore', 'V') IS NOT NULL
    DROP VIEW dbo.vw_LatestHealthScore;
GO

CREATE VIEW dbo.vw_LatestHealthScore
AS
WITH RankedScores AS (
    SELECT 
        InstanceName,
        Ambiente,
        HostingSite,
        Version,
        ConnectSuccess,
        ConnectLatencyMs,
        HealthScore,
        HealthStatus,
        BackupJson,
        MaintenanceJson,
        DiskJson,
        ResourceJson,
        AlwaysOnJson,
        ErrorlogJson,
        GeneratedAtUtc,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc DESC) AS rn
    FROM dbo.InstanceHealthSnapshot
)
SELECT 
    InstanceName,
    Ambiente,
    HostingSite,
    Version,
    ConnectSuccess,
    ConnectLatencyMs,
    HealthScore,
    HealthStatus,
    BackupJson,
    MaintenanceJson,
    DiskJson,
    ResourceJson,
    AlwaysOnJson,
    ErrorlogJson,
    GeneratedAtUtc AS UltimaActualizacion,
    DATEDIFF(MINUTE, GeneratedAtUtc, GETUTCDATE()) AS MinutosDesdeActualizacion
FROM RankedScores
WHERE rn = 1;
GO

-- ================================================================================
-- VISTA: Resumen Ejecutivo de Salud
-- ================================================================================

IF OBJECT_ID('dbo.vw_HealthScoreSummary', 'V') IS NOT NULL
    DROP VIEW dbo.vw_HealthScoreSummary;
GO

CREATE VIEW dbo.vw_HealthScoreSummary
AS
SELECT 
    hs.InstanceName,
    hs.Ambiente,
    hs.HostingSite,
    hs.HealthScore,
    hs.HealthStatus,
    hs.ConnectSuccess,
    hs.ConnectLatencyMs,
    
    -- Backup Breaches
    JSON_VALUE(hs.BackupJson, '$.Breaches') AS BackupBreaches,
    
    -- Disk Info
    CAST(JSON_VALUE(hs.DiskJson, '$.WorstVolumeFreePct') AS DECIMAL(5,2)) AS WorstVolumePct,
    
    -- Maintenance
    CAST(JSON_VALUE(hs.MaintenanceJson, '$.CheckdbOk') AS BIT) AS CheckdbOk,
    CAST(JSON_VALUE(hs.MaintenanceJson, '$.IndexOptimizeOk') AS BIT) AS IndexOptimizeOk,
    JSON_VALUE(hs.MaintenanceJson, '$.LastCheckdb') AS LastCheckdb,
    JSON_VALUE(hs.MaintenanceJson, '$.LastIndexOptimize') AS LastIndexOptimize,
    
    -- Resources
    CAST(JSON_VALUE(hs.ResourceJson, '$.MemoryPressureFlag') AS BIT) AS MemoryPressure,
    
    -- AlwaysOn
    CAST(JSON_VALUE(hs.AlwaysOnJson, '$.Enabled') AS BIT) AS AlwaysOnEnabled,
    JSON_VALUE(hs.AlwaysOnJson, '$.WorstState') AS AlwaysOnState,
    
    -- Errorlog
    CAST(JSON_VALUE(hs.ErrorlogJson, '$.Severity20PlusCount24h') AS INT) AS CriticalErrors24h,
    
    hs.UltimaActualizacion,
    hs.MinutosDesdeActualizacion,
    
    -- Clasificación de criticidad
    CASE 
        WHEN hs.HealthStatus = 'Critical' AND hs.ConnectSuccess = 0 THEN 'URGENTE: No conecta'
        WHEN hs.HealthStatus = 'Critical' AND hs.WorstVolumePct < 5 THEN 'URGENTE: Disco crítico'
        WHEN hs.HealthStatus = 'Critical' THEN 'Crítico'
        WHEN hs.HealthStatus = 'Warning' AND hs.WorstVolumePct < 10 THEN 'Advertencia: Disco bajo'
        WHEN hs.HealthStatus = 'Warning' THEN 'Advertencia'
        ELSE 'Saludable'
    END AS Clasificacion
    
FROM dbo.vw_LatestHealthScore hs;
GO

-- ================================================================================
-- VISTA: Tendencia de HealthScore (últimos 7 días)
-- ================================================================================

IF OBJECT_ID('dbo.vw_HealthScoreTrend', 'V') IS NOT NULL
    DROP VIEW dbo.vw_HealthScoreTrend;
GO

CREATE VIEW dbo.vw_HealthScoreTrend
AS
SELECT 
    InstanceName,
    Ambiente,
    HostingSite,
    CAST(GeneratedAtUtc AS DATE) AS Fecha,
    AVG(HealthScore) AS AvgScore,
    MIN(HealthScore) AS MinScore,
    MAX(HealthScore) AS MaxScore,
    COUNT(*) AS NumMediciones
FROM dbo.InstanceHealthSnapshot
WHERE GeneratedAtUtc > DATEADD(DAY, -7, GETUTCDATE())
GROUP BY 
    InstanceName,
    Ambiente,
    HostingSite,
    CAST(GeneratedAtUtc AS DATE);
GO

-- ================================================================================
-- QUERIES ÚTILES
-- ================================================================================

-- ============================================================
-- 1. Dashboard Principal: Estado Actual de Todas las Instancias
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    HealthScore AS Score,
    HealthStatus AS Estado,
    CASE 
        WHEN ConnectSuccess = 0 THEN '❌ No conecta'
        WHEN WorstVolumePct < 5 THEN '💾 Disco crítico'
        WHEN WorstVolumePct < 10 THEN '⚠️ Disco bajo'
        WHEN MemoryPressure = 1 THEN '💻 Presión memoria'
        WHEN CheckdbOk = 0 THEN '🔍 CHECKDB vencido'
        WHEN AlwaysOnEnabled = 1 AND AlwaysOnState != 'OK' THEN '🔄 AlwaysOn issue'
        WHEN CriticalErrors24h > 0 THEN '⚠️ Errores críticos'
        ELSE '✅ OK'
    END AS PrincipalIssue,
    WorstVolumePct AS [Disco%],
    ConnectLatencyMs AS [Latencia(ms)],
    UltimaActualizacion,
    Clasificacion
FROM dbo.vw_HealthScoreSummary
ORDER BY HealthScore ASC, InstanceName;

-- ============================================================
-- 2. Top 10 Instancias Más Críticas
-- ============================================================

SELECT TOP 10
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    HealthScore AS Score,
    HealthStatus AS Estado,
    WorstVolumePct AS [Disco%],
    CASE WHEN ConnectSuccess = 1 THEN 'Sí' ELSE 'No' END AS Conecta,
    CriticalErrors24h AS [Errores24h],
    DATEDIFF(MINUTE, UltimaActualizacion, GETUTCDATE()) AS [MinDesdeCheck]
FROM dbo.vw_HealthScoreSummary
ORDER BY HealthScore ASC;

-- ============================================================
-- 3. Instancias con Problemas de Espacio en Disco (< 10%)
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    WorstVolumePct AS [Disco%Libre],
    HealthScore AS Score,
    CASE 
        WHEN WorstVolumePct < 5 THEN 'CRÍTICO'
        WHEN WorstVolumePct < 10 THEN 'MUY BAJO'
        WHEN WorstVolumePct < 15 THEN 'BAJO'
        ELSE 'ADVERTENCIA'
    END AS NivelAlerta,
    UltimaActualizacion
FROM dbo.vw_HealthScoreSummary
WHERE WorstVolumePct < 15
ORDER BY WorstVolumePct ASC;

-- ============================================================
-- 4. Instancias con Backups Vencidos
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    BackupBreaches AS Problemas,
    LastCheckdb AS [Último CHECKDB],
    LastIndexOptimize AS [Último IndexOptimize],
    HealthScore AS Score
FROM dbo.vw_HealthScoreSummary
WHERE 
    CheckdbOk = 0 
    OR IndexOptimizeOk = 0
    OR BackupBreaches IS NOT NULL
ORDER BY HealthScore ASC;

-- ============================================================
-- 5. Instancias con Problemas de AlwaysOn
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    AlwaysOnState AS [Estado AlwaysOn],
    AlwaysOnJson AS DetallesJSON,
    HealthScore AS Score,
    UltimaActualizacion
FROM dbo.vw_HealthScoreSummary
WHERE 
    AlwaysOnEnabled = 1 
    AND AlwaysOnState != 'OK'
ORDER BY HealthScore ASC;

-- ============================================================
-- 6. Instancias sin Conectividad (últimas 24h)
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    UltimaActualizacion AS [Último Intento],
    DATEDIFF(MINUTE, UltimaActualizacion, GETUTCDATE()) AS [Minutos Sin Conectar]
FROM dbo.vw_HealthScoreSummary
WHERE ConnectSuccess = 0
ORDER BY UltimaActualizacion DESC;

-- ============================================================
-- 7. Resumen por Ambiente y Estado
-- ============================================================

SELECT 
    ISNULL(Ambiente, 'Sin Ambiente') AS Ambiente,
    HealthStatus AS Estado,
    COUNT(*) AS Cantidad,
    AVG(HealthScore) AS ScorePromedio,
    MIN(HealthScore) AS ScoreMinimo,
    MAX(HealthScore) AS ScoreMaximo
FROM dbo.vw_HealthScoreSummary
GROUP BY Ambiente, HealthStatus
ORDER BY Ambiente, HealthStatus;

-- ============================================================
-- 8. Resumen por Hosting (Onpremise vs AWS)
-- ============================================================

SELECT 
    ISNULL(HostingSite, 'Desconocido') AS Hosting,
    HealthStatus AS Estado,
    COUNT(*) AS Cantidad,
    AVG(HealthScore) AS ScorePromedio,
    CAST(AVG(WorstVolumePct) AS DECIMAL(5,2)) AS [AvgDisco%]
FROM dbo.vw_HealthScoreSummary
GROUP BY HostingSite, HealthStatus
ORDER BY HostingSite, HealthStatus;

-- ============================================================
-- 9. Evolución de Score (últimos 7 días por instancia)
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Fecha,
    CAST(AvgScore AS INT) AS ScorePromedio,
    MinScore,
    MaxScore,
    NumMediciones AS Mediciones
FROM dbo.vw_HealthScoreTrend
ORDER BY InstanceName, Fecha DESC;

-- ============================================================
-- 10. Instancias que Empeoraron en Últimas 24h (Score bajó > 10 pts)
-- ============================================================

WITH ScoresRecientes AS (
    SELECT 
        InstanceName,
        HealthScore,
        GeneratedAtUtc,
        LAG(HealthScore) OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc DESC) AS ScorePrevio,
        LAG(GeneratedAtUtc) OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc DESC) AS FechaPrevio,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY GeneratedAtUtc DESC) AS rn
    FROM dbo.InstanceHealthSnapshot
    WHERE GeneratedAtUtc > DATEADD(HOUR, -24, GETUTCDATE())
)
SELECT 
    InstanceName AS Instancia,
    HealthScore AS ScoreActual,
    ScorePrevio,
    (ScorePrevio - HealthScore) AS Deterioro,
    GeneratedAtUtc AS UltimoCheck,
    FechaPrevio AS CheckPrevio
FROM ScoresRecientes
WHERE 
    rn = 1 
    AND ScorePrevio IS NOT NULL
    AND (ScorePrevio - HealthScore) > 10
ORDER BY Deterioro DESC;

-- ============================================================
-- 11. Comparación Score Actual vs Promedio 7 días
-- ============================================================

WITH AvgWeek AS (
    SELECT 
        InstanceName,
        AVG(HealthScore) AS AvgScore7d
    FROM dbo.InstanceHealthSnapshot
    WHERE GeneratedAtUtc > DATEADD(DAY, -7, GETUTCDATE())
    GROUP BY InstanceName
)
SELECT 
    curr.InstanceName AS Instancia,
    curr.Ambiente,
    curr.HealthScore AS ScoreActual,
    CAST(avg7.AvgScore7d AS INT) AS [Score Prom 7d],
    CAST(curr.HealthScore - avg7.AvgScore7d AS INT) AS Diferencia,
    CASE 
        WHEN curr.HealthScore < avg7.AvgScore7d - 10 THEN '⬇️ Empeoró'
        WHEN curr.HealthScore > avg7.AvgScore7d + 10 THEN '⬆️ Mejoró'
        ELSE '➡️ Estable'
    END AS Tendencia
FROM dbo.vw_HealthScoreSummary curr
INNER JOIN AvgWeek avg7 ON curr.InstanceName = avg7.InstanceName
ORDER BY Diferencia ASC;

-- ============================================================
-- 12. Instancias con Errores Críticos en Errorlog (últimas 24h)
-- ============================================================

SELECT 
    InstanceName AS Instancia,
    Ambiente,
    HostingSite AS Hosting,
    CriticalErrors24h AS [Errores Severity 20+],
    HealthScore AS Score,
    UltimaActualizacion
FROM dbo.vw_HealthScoreSummary
WHERE CriticalErrors24h > 0
ORDER BY CriticalErrors24h DESC, HealthScore ASC;

-- ============================================================
-- 13. Reporte Ejecutivo: Conteo por Estado
-- ============================================================

SELECT 
    HealthStatus AS Estado,
    COUNT(*) AS [Total Instancias],
    CAST(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS DECIMAL(5,2)) AS [% Total],
    AVG(HealthScore) AS [Score Promedio],
    AVG(ConnectLatencyMs) AS [Latencia Prom (ms)],
    SUM(CASE WHEN WorstVolumePct < 10 THEN 1 ELSE 0 END) AS [Con Disco Crítico],
    SUM(CASE WHEN MemoryPressure = 1 THEN 1 ELSE 0 END) AS [Con Presión Memoria],
    SUM(CASE WHEN CheckdbOk = 0 THEN 1 ELSE 0 END) AS [Sin CHECKDB Reciente]
FROM dbo.vw_HealthScoreSummary
GROUP BY HealthStatus
ORDER BY 
    CASE HealthStatus 
        WHEN 'Critical' THEN 1 
        WHEN 'Warning' THEN 2 
        WHEN 'Healthy' THEN 3 
    END;

-- ============================================================
-- 14. Historial Detallado de una Instancia Específica
-- ============================================================

-- Cambiar 'NombreInstancia' por la instancia deseada
DECLARE @InstanceName NVARCHAR(200) = 'SSPR17-01';

SELECT 
    GeneratedAtUtc AS Fecha,
    HealthScore AS Score,
    HealthStatus AS Estado,
    ConnectSuccess AS Conecta,
    ConnectLatencyMs AS [Latencia(ms)],
    CAST(JSON_VALUE(DiskJson, '$.WorstVolumeFreePct') AS DECIMAL(5,2)) AS [Disco%],
    CAST(JSON_VALUE(MaintenanceJson, '$.CheckdbOk') AS BIT) AS CheckdbOk,
    CAST(JSON_VALUE(ErrorlogJson, '$.Severity20PlusCount24h') AS INT) AS Errores24h
FROM dbo.InstanceHealthSnapshot
WHERE InstanceName = @InstanceName
ORDER BY GeneratedAtUtc DESC;

-- ============================================================
-- 15. Limpieza: Eliminar Snapshots Antiguos (> 30 días)
-- ============================================================

-- ⚠️ PRECAUCIÓN: Solo ejecutar si se quiere limpiar histórico antiguo
/*
DELETE FROM dbo.InstanceHealthSnapshot
WHERE GeneratedAtUtc < DATEADD(DAY, -30, GETUTCDATE());

SELECT @@ROWCOUNT AS [Registros Eliminados];
*/

-- ============================================================
-- 16. Obtener Detalles JSON de Volúmenes de una Instancia
-- ============================================================

DECLARE @Instance NVARCHAR(200) = 'SSPR17-01';

SELECT 
    InstanceName,
    GeneratedAtUtc,
    DiskJson AS [Detalle Discos JSON]
FROM dbo.InstanceHealthSnapshot
WHERE InstanceName = @Instance
  AND GeneratedAtUtc = (
      SELECT MAX(GeneratedAtUtc) 
      FROM dbo.InstanceHealthSnapshot 
      WHERE InstanceName = @Instance
  );

-- Para parsear el array de volúmenes:
-- Nota: Requiere SQL Server 2016+ con soporte OPENJSON

WITH LatestDisk AS (
    SELECT 
        InstanceName,
        DiskJson
    FROM dbo.InstanceHealthSnapshot
    WHERE InstanceName = @Instance
      AND GeneratedAtUtc = (
          SELECT MAX(GeneratedAtUtc) 
          FROM dbo.InstanceHealthSnapshot 
          WHERE InstanceName = @Instance
      )
)
SELECT 
    ld.InstanceName,
    v.Drive,
    v.TotalGB,
    v.FreeGB,
    v.FreePct
FROM LatestDisk ld
CROSS APPLY OPENJSON(ld.DiskJson, '$.Volumes')
WITH (
    Drive NVARCHAR(10) '$.Drive',
    TotalGB DECIMAL(10,2) '$.TotalGB',
    FreeGB DECIMAL(10,2) '$.FreeGB',
    FreePct DECIMAL(5,2) '$.FreePct'
) AS v;

GO

-- ================================================================================
-- FIN DEL SCRIPT
-- ================================================================================

PRINT 'Vistas y queries de HealthScore creadas correctamente.';
PRINT '';
PRINT 'Vistas disponibles:';
PRINT '  - dbo.vw_LatestHealthScore';
PRINT '  - dbo.vw_HealthScoreSummary';
PRINT '  - dbo.vw_HealthScoreTrend';
PRINT '';
PRINT 'Ejecuta las queries numeradas para obtener diferentes análisis.';

