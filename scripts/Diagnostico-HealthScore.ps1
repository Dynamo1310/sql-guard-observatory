<#
.SYNOPSIS
    Script de diagnóstico para HealthScore Collectors y SignalR
    
.DESCRIPTION
    Este script prueba manualmente:
    - Ejecución de un collector
    - Envío de notificación SignalR
    - Configuración de Task Scheduler
    
.EXAMPLE
    .\Diagnostico-HealthScore.ps1 -ApiBaseUrl "http://asprbm-nov-01:5000"
#>

[CmdletBinding()]
param(
    [string]$ScriptsPath = "C:\Apps\SQLGuardObservatory\Scripts",
    [string]$ApiBaseUrl = "http://localhost:5000",
    [string]$TestCollector = "DatabaseStates"
)

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " DIAGNÓSTICO DE HEALTHSCORE COLLECTORS Y SIGNALR" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# ========== 1. VERIFICAR ARCHIVOS ==========
Write-Host "[1/6] Verificando existencia de archivos..." -ForegroundColor Yellow

$collectorPath = Join-Path $ScriptsPath "RelevamientoHealthScore_$TestCollector.ps1"
$signalRPath = Join-Path $ScriptsPath "Send-SignalRNotification.ps1"

Write-Host "  Collector: $collectorPath" -ForegroundColor Gray
if (Test-Path $collectorPath) {
    Write-Host "    ✓ Existe" -ForegroundColor Green
} else {
    Write-Host "    ✗ NO EXISTE" -ForegroundColor Red
    exit 1
}

Write-Host "  SignalR Module: $signalRPath" -ForegroundColor Gray
if (Test-Path $signalRPath) {
    Write-Host "    ✓ Existe" -ForegroundColor Green
} else {
    Write-Host "    ✗ NO EXISTE" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ========== 2. VERIFICAR CONECTIVIDAD API ==========
Write-Host "[2/6] Verificando conectividad al backend API..." -ForegroundColor Yellow
Write-Host "  URL: $ApiBaseUrl" -ForegroundColor Gray

try {
    $healthUrl = "$ApiBaseUrl/health"
    $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "    ✓ Backend está accesible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "    ✗ Backend NO accesible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    ⚠ Las notificaciones SignalR fallarán" -ForegroundColor Yellow
}

Write-Host ""

# ========== 3. EJECUTAR COLLECTOR DE PRUEBA ==========
Write-Host "[3/6] Ejecutando collector de prueba: $TestCollector" -ForegroundColor Yellow
Write-Host "  Esto puede tomar varios minutos..." -ForegroundColor Gray

$collectorStartTime = Get-Date
$collectorExitCode = $null
$collectorError = $null
$collectorSuccess = $false

try {
    Write-Host "  Ejecutando: $collectorPath" -ForegroundColor Gray
    
    # Ejecutar el collector y capturar output
    & $collectorPath 2>&1 | Tee-Object -Variable collectorOutput | Out-Null
    
    $collectorExitCode = $LASTEXITCODE
    $collectorSuccess = $?
    
    $collectorEndTime = Get-Date
    $collectorDuration = ($collectorEndTime - $collectorStartTime).TotalSeconds
    
    Write-Host "    ✓ Collector ejecutado en $([math]::Round($collectorDuration, 2)) segundos" -ForegroundColor Green
    Write-Host "    Exit Code: $collectorExitCode" -ForegroundColor Gray
    Write-Host "    Success Variable (`$?): $collectorSuccess" -ForegroundColor Gray
    
} catch {
    $collectorError = $_.Exception.Message
    Write-Host "    ✗ Error al ejecutar collector: $collectorError" -ForegroundColor Red
}

Write-Host ""

# ========== 4. ENVIAR NOTIFICACIÓN SIGNALR ==========
Write-Host "[4/6] Enviando notificación SignalR..." -ForegroundColor Yellow

$signalRStartTime = Get-Date
$signalRError = $null
$signalRSuccess = $false

try {
    Write-Host "  Ejecutando: $signalRPath" -ForegroundColor Gray
    Write-Host "  Parámetros:" -ForegroundColor Gray
    Write-Host "    -NotificationType: HealthScore" -ForegroundColor Gray
    Write-Host "    -CollectorName: $TestCollector" -ForegroundColor Gray
    Write-Host "    -ApiBaseUrl: $ApiBaseUrl" -ForegroundColor Gray
    
    & $signalRPath -NotificationType 'HealthScore' -CollectorName $TestCollector -ApiBaseUrl $ApiBaseUrl -Verbose 2>&1 | Tee-Object -Variable signalROutput
    
    $signalRSuccess = $?
    $signalREndTime = Get-Date
    $signalRDuration = ($signalREndTime - $signalRStartTime).TotalSeconds
    
    Write-Host "    ✓ Notificación enviada en $([math]::Round($signalRDuration, 2)) segundos" -ForegroundColor Green
    Write-Host "    Success Variable (`$?): $signalRSuccess" -ForegroundColor Gray
    
} catch {
    $signalRError = $_.Exception.Message
    Write-Host "    ✗ Error al enviar notificación: $signalRError" -ForegroundColor Red
}

Write-Host ""

# ========== 5. VERIFICAR TAREAS PROGRAMADAS ==========
Write-Host "[5/6] Verificando tareas programadas..." -ForegroundColor Yellow

$taskName = "HealthScore_v3.2_$TestCollector"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "  ✓ Tarea encontrada: $taskName" -ForegroundColor Green
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    
    Write-Host "    Estado: $($task.State)" -ForegroundColor Gray
    Write-Host "    Última ejecución: $($taskInfo.LastRunTime)" -ForegroundColor Gray
    Write-Host "    Próxima ejecución: $($taskInfo.NextRunTime)" -ForegroundColor Gray
    Write-Host "    Último resultado: 0x$([Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper())" -ForegroundColor $(if ($taskInfo.LastTaskResult -eq 0) { "Green" } else { "Red" })
    
    # Mostrar el comando completo
    $taskAction = $task.Actions[0]
    Write-Host ""
    Write-Host "  Comando configurado:" -ForegroundColor Gray
    Write-Host "    Ejecutable: $($taskAction.Execute)" -ForegroundColor DarkGray
    Write-Host "    Argumentos: $($taskAction.Arguments)" -ForegroundColor DarkGray
    
} else {
    Write-Host "  ✗ Tarea NO encontrada: $taskName" -ForegroundColor Red
}

Write-Host ""

# ========== 6. LOGS DEL TASK SCHEDULER ==========
Write-Host "[6/6] Últimos logs del Task Scheduler para esta tarea..." -ForegroundColor Yellow

try {
    $events = Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 20 -ErrorAction SilentlyContinue | 
        Where-Object { $_.Message -like "*$taskName*" } |
        Select-Object -First 5
    
    if ($events) {
        foreach ($event in $events) {
            $eventColor = switch ($event.LevelDisplayName) {
                "Error" { "Red" }
                "Warning" { "Yellow" }
                default { "Gray" }
            }
            
            Write-Host "  [$($event.TimeCreated)] $($event.LevelDisplayName)" -ForegroundColor $eventColor
            Write-Host "    $($event.Message.Split("`n")[0])" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  No se encontraron eventos recientes para esta tarea" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ⚠ No se pudo acceder al log del Task Scheduler: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# ========== RESUMEN ==========
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN DEL DIAGNÓSTICO" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$issues = @()

if (-not $collectorSuccess) {
    $issues += "El collector NO se ejecutó correctamente"
}

if (-not $signalRSuccess) {
    $issues += "La notificación SignalR NO se envió correctamente"
}

if ($task -and $taskInfo.LastTaskResult -ne 0) {
    $issues += "La tarea programada tiene error: 0x$([Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper())"
}

if ($issues.Count -gt 0) {
    Write-Host "  ✗ SE ENCONTRARON $($issues.Count) PROBLEMA(S):" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "    - $issue" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ TODO FUNCIONÓ CORRECTAMENTE" -ForegroundColor Green
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# ========== RECOMENDACIONES ==========
if ($issues.Count -gt 0) {
    Write-Host "RECOMENDACIONES:" -ForegroundColor Yellow
    Write-Host ""
    
    if (-not $collectorSuccess) {
        Write-Host "1. Revisa el script collector en: $collectorPath" -ForegroundColor Gray
        Write-Host "   Ejecuta manualmente para ver errores:" -ForegroundColor Gray
        Write-Host "   powershell.exe -ExecutionPolicy Bypass -File `"$collectorPath`"" -ForegroundColor DarkGray
        Write-Host ""
    }
    
    if (-not $signalRSuccess) {
        Write-Host "2. Verifica que el backend esté corriendo en: $ApiBaseUrl" -ForegroundColor Gray
        Write-Host "   Prueba acceder a: $ApiBaseUrl/health" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "3. Revisa los logs de PowerShell en Event Viewer:" -ForegroundColor Gray
    Write-Host "   Applications and Services Logs > Windows PowerShell" -ForegroundColor DarkGray
    Write-Host ""
}

# Retornar código de salida apropiado
if ($issues.Count -gt 0) {
    exit 1
} else {
    exit 0
}

