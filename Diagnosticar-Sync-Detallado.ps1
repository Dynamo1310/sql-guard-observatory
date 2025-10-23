# Diagnóstico detallado: Ver exactamente qué se recopila de cada nodo
# ==================================================================

param(
    [string]$AGName = "SSPR17CRM365AG",
    [string[]]$Nodes = @("SSPR17CRM365-01", "SSPR17CRM365-51")
)

Remove-Module SqlServer -ErrorAction SilentlyContinue
Import-Module dbatools -ErrorAction Stop

# Convertir a objetos
$agNodes = $Nodes | ForEach-Object {
    [PSCustomObject]@{
        NombreInstancia = $_
    }
}

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Diagnóstico Detallado: $AGName" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

$query = @"
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

$allJobs = @()

foreach ($node in $agNodes) {
    $instance = $node.NombreInstancia
    
    Write-Host "───────────────────────────────────────────────────────" -ForegroundColor Yellow
    Write-Host "Nodo: $instance" -ForegroundColor Yellow
    Write-Host "───────────────────────────────────────────────────────`n" -ForegroundColor Yellow
    
    try {
        $jobs = Invoke-DbaQuery -SqlInstance $instance -Database msdb -Query $query -EnableException
        
        foreach ($job in $jobs) {
            Write-Host "Job: $($job.JobName)" -ForegroundColor White
            Write-Host "  SQL devolvió:" -ForegroundColor Gray
            Write-Host "    LastFinishTime    : $($job.LastFinishTime)" -ForegroundColor Gray
            Write-Host "    LastRunDate       : $($job.LastRunDate)" -ForegroundColor Gray
            Write-Host "    LastRunTime       : $($job.LastRunTime)" -ForegroundColor Gray
            Write-Host "    LastRunDuration   : $($job.LastRunDuration)" -ForegroundColor Gray
            Write-Host "    LastRunStatus     : $($job.LastRunStatus)" -ForegroundColor Gray
            
            # SIMULAR LA LÓGICA DEL SCRIPT
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
                Write-Host "  ✅ Usó LastFinishTime: $lastRun" -ForegroundColor Green
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                    
                    if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) {
                        $duration = [int]$job.LastRunDuration
                        $hours = [Math]::Floor($duration / 10000)
                        $minutes = [Math]::Floor(($duration % 10000) / 100)
                        $seconds = $duration % 100
                        $lastRun = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
                    } else {
                        $lastRun = $startTime
                    }
                    Write-Host "  ⚠️  Calculó desde ServerRun: $lastRun" -ForegroundColor Yellow
                } catch {
                    Write-Host "  ❌ Error calculando fecha: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
            
            $hasValidStatus = $job.LastRunStatus -ne $null -and $job.LastRunStatus -ne [DBNull]::Value
            
            if ($lastRun -or $hasValidStatus) {
                $jobObj = @{
                    Node = $instance
                    JobName = $job.JobName
                    LastRun = $lastRun
                    LastRunStatus = $job.LastRunStatus
                    IsSuccess = ($job.LastRunStatus -eq 1)
                }
                
                $allJobs += $jobObj
                
                Write-Host "  📦 Agregado al array:" -ForegroundColor Cyan
                Write-Host "      LastRun       : $lastRun" -ForegroundColor Cyan
                Write-Host "      LastRunStatus : $($job.LastRunStatus)" -ForegroundColor Cyan
                Write-Host "      IsSuccess     : $($job.LastRunStatus -eq 1)" -ForegroundColor Cyan
            } else {
                Write-Host "  ⛔ NO agregado (sin fecha ni status)" -ForegroundColor Red
            }
            Write-Host ""
        }
    } catch {
        Write-Host "  ❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "SINCRONIZACIÓN SIMULADA" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "Jobs agregados al array total:" -ForegroundColor Yellow
$allJobs | ForEach-Object {
    Write-Host "  $($_.Node) - $($_.JobName) - LastRun: $($_.LastRun) - Status: $($_.LastRunStatus)" -ForegroundColor Gray
}

Write-Host "`nAgrupando por JobName..." -ForegroundColor Yellow
$grouped = $allJobs | Group-Object -Property JobName

foreach ($group in $grouped) {
    Write-Host "`n  Grupo: $($group.Name)" -ForegroundColor White
    Write-Host "    Jobs en este grupo:" -ForegroundColor Gray
    
    foreach ($j in $group.Group) {
        Write-Host "      - $($j.Node): LastRun=$($j.LastRun), Status=$($j.LastRunStatus), IsSuccess=$($j.IsSuccess)" -ForegroundColor Gray
    }
    
    Write-Host "`n    Filtrando solo jobs con fecha..." -ForegroundColor Yellow
    $withDate = $group.Group | Where-Object { $_.LastRun -ne $null }
    
    if ($withDate.Count -eq 0) {
        Write-Host "      ⚠️  Ningún job tiene fecha" -ForegroundColor Yellow
    } else {
        Write-Host "      ✅ Jobs con fecha:" -ForegroundColor Green
        foreach ($j in $withDate) {
            Write-Host "         - $($j.Node): $($j.LastRun) (Status: $($j.LastRunStatus))" -ForegroundColor Gray
        }
        
        Write-Host "`n    Ordenando por LastRun DESC, luego por Status..." -ForegroundColor Yellow
        $sorted = $withDate | Sort-Object `
            @{Expression={$_.LastRun}; Descending=$true}, `
            @{Expression={
                if ($_.LastRunStatus -eq 1) { 0 }
                elseif ($_.LastRunStatus -eq 0) { 1 }
                elseif ($_.LastRunStatus -eq 3) { 2 }
                else { 3 }
            }; Descending=$false}
        
        $winner = $sorted | Select-Object -First 1
        
        Write-Host "      🏆 GANADOR: $($winner.Node) - $($winner.LastRun) (Status: $($winner.LastRunStatus))" -ForegroundColor Green
    }
}

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Diagnóstico completado" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

