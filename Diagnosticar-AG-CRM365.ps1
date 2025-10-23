# Diagnóstico para SSPR17CRM365AG
$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17CRM365-01"  # Cambiar si es necesario
$TimeoutSec = 30

# Descargar SqlServer si está cargado
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Diagnóstico: SSPR17CRM365AG" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Obtener instancias del AG
$response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
$agNodes = $response | Where-Object { $_.NombreInstancia -in @('SSPR17CRM365-01', 'SSPR17CRM365-51') }

Write-Host "Nodos del AG:" -ForegroundColor Yellow
$agNodes | Select-Object NombreInstancia, AlwaysOn | Format-Table -AutoSize

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PASO 1: Jobs de IndexOptimize en cada nodo" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

foreach ($node in $agNodes) {
    $instanceName = $node.NombreInstancia
    Write-Host "───────────────────────────────────────────────────────" -ForegroundColor Gray
    Write-Host "Nodo: $instanceName" -ForegroundColor Yellow
    Write-Host "───────────────────────────────────────────────────────" -ForegroundColor Gray
    
    try {
        $query = @"
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
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
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    HistoryRunDate AS LastRunDate,
    HistoryRunTime AS LastRunTime,
    HistoryRunDuration AS LastRunDuration,
    HistoryRunStatus AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime,
    CASE 
        WHEN HistoryRunStatus = 1 THEN 'Success'
        WHEN HistoryRunStatus = 0 THEN 'Failed'
        WHEN HistoryRunStatus = 3 THEN 'Canceled'
        ELSE 'Unknown'
    END AS StatusText
FROM LastJobRuns
WHERE rn = 1
ORDER BY HistoryFinishTime DESC;
"@
        
        $jobs = Invoke-DbaQuery -SqlInstance $instanceName -Query $query -QueryTimeout $TimeoutSec
        
        if ($jobs) {
            $jobs | Format-Table JobName, LastFinishTime, StatusText, LastRunDate, LastRunTime -AutoSize
        } else {
            Write-Host "  No se encontraron jobs de IndexOptimize" -ForegroundColor Red
        }
        
    } catch {
        Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PASO 2: ¿Qué debería guardarse según la lógica?" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "El script debería:" -ForegroundColor Yellow
Write-Host "  1. Agrupar jobs por nombre" -ForegroundColor Gray
Write-Host "  2. Para cada nombre, tomar el MÁS RECIENTE (por FinishTime)" -ForegroundColor Gray
Write-Host "  3. En empate, priorizar: Success > Failed > Canceled" -ForegroundColor Gray
Write-Host "  4. Si TODOS los tipos están OK → guardar como OK" -ForegroundColor Gray
Write-Host "  5. Si ALGÚN tipo no está OK → guardar como NO OK" -ForegroundColor Gray
Write-Host ""

Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "PASO 3: ¿Qué se guardó en la BD?" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

try {
    $savedQuery = @"
SELECT TOP 5
    InstanceName,
    LastIndexOptimize,
    IndexOptimizeOk,
    CollectedAtUtc
FROM dbo.InstanceHealth_Maintenance
WHERE InstanceName IN ('SSPR17CRM365-01', 'SSPR17CRM365-51')
ORDER BY CollectedAtUtc DESC;
"@
    
    $saved = Invoke-DbaQuery -SqlInstance "SSPR17MON-01" -Database "SQLNova" -Query $savedQuery
    $saved | Format-Table -AutoSize
    
} catch {
    Write-Host "ERROR leyendo BD: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "Diagnóstico completado" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor Green

