# Test: Verificar qué devuelve la query de IndexOptimize del script real
# ========================================================================

param(
    [string]$Instance = "SSPR17CRM365-01"
)

Remove-Module SqlServer -ErrorAction SilentlyContinue
Import-Module dbatools -ErrorAction Stop

$query = @"
-- TODOS los IntegrityCheck con su última ejecución (excluir STOP)
-- Usa TIEMPO DE FINALIZACIÓN (run_date + run_time + run_duration) para ordenar
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        -- Calcular tiempo de finalización: run_date + run_time + run_duration
        -- run_duration está en formato HHMMSS (int): 20107 = 2m 7s
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 +  -- Horas
            ((jh.run_duration / 100) % 100) * 60 + -- Minutos
            (jh.run_duration % 100),  -- Segundos
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS HistoryFinishTime,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY 
            DATEADD(SECOND, 
                (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
                CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
            ) DESC,
            -- En caso de empate de tiempo, priorizar: Succeeded(1) > Failed(0) > Canceled(3)
            CASE WHEN jh.run_status = 1 THEN 0 WHEN jh.run_status = 0 THEN 1 WHEN jh.run_status = 3 THEN 2 ELSE 3 END ASC
        ) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;

-- TODOS los IndexOptimize con su última ejecución (excluir STOP)
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        -- Calcular tiempo de finalización
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
        ) AS HistoryFinishTime,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY 
            DATEADD(SECOND, 
                (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
                CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
            ) DESC,
            CASE WHEN jh.run_status = 1 THEN 0 WHEN jh.run_status = 0 THEN 1 WHEN jh.run_status = 3 THEN 2 ELSE 3 END ASC
        ) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
"@

Write-Host "Ejecutando query completa en: $Instance" -ForegroundColor Yellow
Write-Host ""

$datasets = Invoke-DbaQuery -SqlInstance $Instance -Database msdb -Query $query -EnableException

Write-Host "Tipo de `$datasets: $($datasets.GetType().FullName)" -ForegroundColor Cyan
Write-Host "Es array: $($datasets -is [array])" -ForegroundColor Cyan
Write-Host "Count: $($datasets.Count)" -ForegroundColor Cyan
Write-Host ""

Write-Host "TODOS los resultados:" -ForegroundColor Yellow
$datasets | Format-Table -AutoSize

Write-Host ""
Write-Host "Filtrando IntegrityCheck:" -ForegroundColor Yellow
$checkdb = $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' }
Write-Host "Count: $($checkdb.Count)" -ForegroundColor Cyan
$checkdb | Format-Table -AutoSize

Write-Host ""
Write-Host "Filtrando IndexOptimize:" -ForegroundColor Yellow
$indexOpt = $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' }
Write-Host "Count: $($indexOpt.Count)" -ForegroundColor Cyan
$indexOpt | Format-Table -AutoSize

