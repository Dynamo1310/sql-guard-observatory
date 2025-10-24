<#
.SYNOPSIS
    Script de diagnóstico para identificar errores en Get-MaintenanceJobs
    
.DESCRIPTION
    Ejecuta las queries de maintenance en una instancia específica con logging detallado
    para identificar la causa del error "ScriptHalted"
    
.PARAMETER InstanceName
    Nombre de la instancia a diagnosticar (ej: SSPR17PBI-01)
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$InstanceName
)

# Importar dbatools
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force -ErrorAction Stop

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DIAGNÓSTICO: Maintenance Jobs Error                 ║" -ForegroundColor Cyan
Write-Host "║  Instancia: $($InstanceName.PadRight(40)) ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Test de conexión
Write-Host "1️⃣  Probando conexión..." -ForegroundColor Yellow
try {
    $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
    if ($connection.IsPingable) {
        Write-Host "   ✅ Conexión exitosa" -ForegroundColor Green
        Write-Host "   Version: $($connection.SqlVersion)" -ForegroundColor Gray
    } else {
        Write-Host "   ❌ No se puede conectar" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "   ❌ Error de conexión: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Query de CHECKDB
Write-Host ""
Write-Host "2️⃣  Probando query de CHECKDB jobs..." -ForegroundColor Yellow

$checkdbQuery = @'
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
'@

try {
    Write-Host "   Ejecutando query CHECKDB..." -ForegroundColor Gray
    $checkdbJobs = Invoke-DbaQuery -SqlInstance $InstanceName `
        -Query $checkdbQuery `
        -QueryTimeout 60 `
        -EnableException
    
    Write-Host "   ✅ Query CHECKDB exitosa" -ForegroundColor Green
    Write-Host "   Jobs encontrados: $($checkdbJobs.Count)" -ForegroundColor Gray
    
    if ($checkdbJobs.Count -gt 0) {
        Write-Host ""
        Write-Host "   Jobs CHECKDB:" -ForegroundColor Cyan
        foreach ($job in $checkdbJobs) {
            Write-Host "     • $($job.JobName)" -ForegroundColor Gray
            Write-Host "       LastRunDate: $($job.LastRunDate)" -ForegroundColor DarkGray
            Write-Host "       LastRunStatus: $($job.LastRunStatus)" -ForegroundColor DarkGray
        }
    }
    
} catch {
    Write-Host "   ❌ ERROR en query CHECKDB" -ForegroundColor Red
    Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.InnerException) {
        Write-Host "   Inner Exception: $($_.Exception.InnerException.Message)" -ForegroundColor Red
    }
    
    if ($_.Exception.InnerException.Errors) {
        Write-Host "   Errores SQL:" -ForegroundColor Red
        foreach ($sqlError in $_.Exception.InnerException.Errors) {
            Write-Host "     • $($sqlError.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "   Stack Trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
}

# Query de IndexOptimize
Write-Host ""
Write-Host "3️⃣  Probando query de IndexOptimize jobs..." -ForegroundColor Yellow

$indexOptQuery = @'
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
            (jh.run_duration / 10000) * 3600 + 
            ((jh.run_duration / 100) % 100) * 60 + 
            (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
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

try {
    Write-Host "   Ejecutando query IndexOptimize..." -ForegroundColor Gray
    $indexOptJobs = Invoke-DbaQuery -SqlInstance $InstanceName `
        -Query $indexOptQuery `
        -QueryTimeout 60 `
        -EnableException
    
    Write-Host "   ✅ Query IndexOptimize exitosa" -ForegroundColor Green
    Write-Host "   Jobs encontrados: $($indexOptJobs.Count)" -ForegroundColor Gray
    
    if ($indexOptJobs.Count -gt 0) {
        Write-Host ""
        Write-Host "   Jobs IndexOptimize:" -ForegroundColor Cyan
        foreach ($job in $indexOptJobs) {
            Write-Host "     • $($job.JobName)" -ForegroundColor Gray
            Write-Host "       LastRunDate: $($job.LastRunDate)" -ForegroundColor DarkGray
            Write-Host "       LastRunStatus: $($job.LastRunStatus)" -ForegroundColor DarkGray
        }
    }
    
} catch {
    Write-Host "   ❌ ERROR en query IndexOptimize" -ForegroundColor Red
    Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Red
    
    if ($_.Exception.InnerException) {
        Write-Host "   Inner Exception: $($_.Exception.InnerException.Message)" -ForegroundColor Red
    }
    
    if ($_.Exception.InnerException.Errors) {
        Write-Host "   Errores SQL:" -ForegroundColor Red
        foreach ($sqlError in $_.Exception.InnerException.Errors) {
            Write-Host "     • $($sqlError.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host ""
    Write-Host "   Stack Trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  DIAGNÓSTICO COMPLETADO                               ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

