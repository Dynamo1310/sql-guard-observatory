# Script para probar exactamente lo que ejecuta el Task Scheduler
param(
    [string]$CollectorName = "CPU",
    [string]$ScriptsPath = "C:\Apps\SQLGuardObservatory\Scripts",
    [string]$ApiBaseUrl = "http://127.0.0.1:5000"
)

$scriptPath = Join-Path $ScriptsPath "RelevamientoHealthScore_$CollectorName.ps1"
$signalRPath = Join-Path $ScriptsPath "Send-SignalRNotification.ps1"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " SIMULANDO EJECUCION DEL TASK SCHEDULER" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Collector: $CollectorName" -ForegroundColor Yellow
Write-Host "Script: $scriptPath" -ForegroundColor Gray
Write-Host ""

# Contar registros ANTES
Write-Host "[ANTES] Contando registros en la base de datos..." -ForegroundColor Yellow
$countBefore = 0
try {
    $query = "SELECT COUNT(*) as Count FROM RelevamientoHealthScore WHERE FechaRelevamiento >= DATEADD(MINUTE, -10, GETDATE())"
    $result = Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" -Database "SQLNova" -Query $query -TrustServerCertificate -ErrorAction Stop
    $countBefore = $result.Count
    Write-Host "  Registros de los ultimos 10 minutos: $countBefore" -ForegroundColor Gray
    Write-Host "  (Instancia: SSPR17MON-01, Base: SQLNova)" -ForegroundColor DarkGray
} catch {
    Write-Host "  No se pudo contar registros: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "[EJECUTANDO] Collector..." -ForegroundColor Yellow
$startTime = Get-Date

# Ejecutar EXACTAMENTE como lo hace el Task Scheduler
$scriptBlock = @"
& '$scriptPath'
Start-Sleep -Milliseconds 500
try {
    & '$signalRPath' -NotificationType 'HealthScore' -CollectorName '$CollectorName' -ApiBaseUrl '$ApiBaseUrl' -ErrorAction SilentlyContinue
} catch {
    # Ignorar errores de notificación silenciosamente
}
exit 0
"@

Write-Host "  Script block a ejecutar:" -ForegroundColor Gray
Write-Host "  $scriptBlock" -ForegroundColor DarkGray
Write-Host ""

# Ejecutar con PowerShell.exe igual que el Task Scheduler
$process = Start-Process -FilePath "PowerShell.exe" `
    -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"$scriptBlock`"" `
    -Wait -PassThru -NoNewWindow

$endTime = Get-Date
$duration = ($endTime - $startTime).TotalSeconds

Write-Host ""
Write-Host "[TERMINADO] Codigo de salida: $($process.ExitCode)" -ForegroundColor $(if ($process.ExitCode -eq 0) { "Green" } else { "Red" })
Write-Host "  Duracion: $([math]::Round($duration, 2)) segundos" -ForegroundColor Gray

Write-Host ""
Write-Host "[DESPUES] Contando registros en la base de datos..." -ForegroundColor Yellow
$countAfter = 0
try {
    $result = Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" -Database "SQLNova" -Query $query -TrustServerCertificate -ErrorAction Stop
    $countAfter = $result.Count
    Write-Host "  Registros de los ultimos 10 minutos: $countAfter" -ForegroundColor Gray
    Write-Host "  (Instancia: SSPR17MON-01, Base: SQLNova)" -ForegroundColor DarkGray
} catch {
    Write-Host "  No se pudo contar registros: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESULTADO" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$newRecords = $countAfter - $countBefore

if ($process.ExitCode -eq 0 -and $newRecords -gt 0) {
    Write-Host "  EXITO - El collector funciono correctamente" -ForegroundColor Green
    Write-Host "  Nuevos registros insertados: $newRecords" -ForegroundColor Green
} elseif ($process.ExitCode -eq 0 -and $newRecords -eq 0) {
    Write-Host "  PROBLEMA - Codigo de salida OK pero NO se guardaron datos" -ForegroundColor Red
    Write-Host "  El script termina con exito pero no guarda datos en la BD" -ForegroundColor Yellow
} else {
    Write-Host "  ERROR - El collector fallo con codigo: $($process.ExitCode)" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

