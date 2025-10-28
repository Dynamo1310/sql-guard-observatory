<#
.SYNOPSIS
    Script de diagnostico para HealthScore Collectors y SignalR
    
.DESCRIPTION
    Este script prueba manualmente:
    - Ejecucion de un collector
    - Envio de notificacion SignalR
    - Configuracion de Task Scheduler
    
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
Write-Host " DIAGNOSTICO DE HEALTHSCORE COLLECTORS Y SIGNALR" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# ========== 1. VERIFICAR ARCHIVOS ==========
Write-Host "[1/6] Verificando existencia de archivos..." -ForegroundColor Yellow

$collectorPath = Join-Path $ScriptsPath "RelevamientoHealthScore_$TestCollector.ps1"
$signalRPath = Join-Path $ScriptsPath "Send-SignalRNotification.ps1"

Write-Host "  Collector: $collectorPath" -ForegroundColor Gray
if (Test-Path $collectorPath) {
    Write-Host "    OK - Existe" -ForegroundColor Green
} else {
    Write-Host "    ERROR - NO EXISTE" -ForegroundColor Red
    exit 1
}

Write-Host "  SignalR Module: $signalRPath" -ForegroundColor Gray
if (Test-Path $signalRPath) {
    Write-Host "    OK - Existe" -ForegroundColor Green
} else {
    Write-Host "    ERROR - NO EXISTE" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ========== 2. VERIFICAR CONECTIVIDAD API ==========
Write-Host "[2/6] Verificando conectividad al backend API..." -ForegroundColor Yellow
Write-Host "  URL: $ApiBaseUrl" -ForegroundColor Gray

try {
    $healthUrl = "$ApiBaseUrl/health"
    $response = Invoke-WebRequest -Uri $healthUrl -Method Get -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
    Write-Host "    OK - Backend esta accesible (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "    ERROR - Backend NO accesible: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "    ADVERTENCIA - Las notificaciones SignalR fallaran" -ForegroundColor Yellow
}

Write-Host ""

# ========== 3. EJECUTAR COLLECTOR DE PRUEBA ==========
Write-Host "[3/6] Ejecutando collector de prueba: $TestCollector" -ForegroundColor Yellow
Write-Host "  Esto puede tomar varios minutos..." -ForegroundColor Gray

$collectorStartTime = Get-Date
$collectorError = $null
$collectorSuccess = $false

try {
    Write-Host "  Ejecutando: $collectorPath" -ForegroundColor Gray
    
    # Ejecutar el collector
    & $collectorPath
    
    $collectorSuccess = $?
    
    $collectorEndTime = Get-Date
    $collectorDuration = ($collectorEndTime - $collectorStartTime).TotalSeconds
    
    if ($collectorSuccess) {
        Write-Host "    OK - Collector ejecutado en $([math]::Round($collectorDuration, 2)) segundos" -ForegroundColor Green
    } else {
        Write-Host "    ERROR - Collector termino con errores" -ForegroundColor Red
    }
    
} catch {
    $collectorError = $_.Exception.Message
    Write-Host "    ERROR - Error al ejecutar collector: $collectorError" -ForegroundColor Red
    $collectorSuccess = $false
}

Write-Host ""

# ========== 4. ENVIAR NOTIFICACION SIGNALR ==========
Write-Host "[4/6] Enviando notificacion SignalR..." -ForegroundColor Yellow

$signalRStartTime = Get-Date
$signalRError = $null
$signalRSuccess = $false

try {
    Write-Host "  Ejecutando: $signalRPath" -ForegroundColor Gray
    Write-Host "  Parametros:" -ForegroundColor Gray
    Write-Host "    -NotificationType: HealthScore" -ForegroundColor Gray
    Write-Host "    -CollectorName: $TestCollector" -ForegroundColor Gray
    Write-Host "    -ApiBaseUrl: $ApiBaseUrl" -ForegroundColor Gray
    
    & $signalRPath -NotificationType 'HealthScore' -CollectorName $TestCollector -ApiBaseUrl $ApiBaseUrl -Verbose
    
    $signalRSuccess = $?
    $signalREndTime = Get-Date
    $signalRDuration = ($signalREndTime - $signalRStartTime).TotalSeconds
    
    if ($signalRSuccess) {
        Write-Host "    OK - Notificacion enviada en $([math]::Round($signalRDuration, 2)) segundos" -ForegroundColor Green
    } else {
        Write-Host "    ERROR - Notificacion fallo" -ForegroundColor Red
    }
    
} catch {
    $signalRError = $_.Exception.Message
    Write-Host "    ERROR - Error al enviar notificacion: $signalRError" -ForegroundColor Red
    $signalRSuccess = $false
}

Write-Host ""

# ========== 5. VERIFICAR TAREAS PROGRAMADAS ==========
Write-Host "[5/6] Verificando tareas programadas..." -ForegroundColor Yellow

$taskName = "HealthScore_v3.2_$TestCollector"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($task) {
    Write-Host "  OK - Tarea encontrada: $taskName" -ForegroundColor Green
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    
    Write-Host "    Estado: $($task.State)" -ForegroundColor Gray
    Write-Host "    Ultima ejecucion: $($taskInfo.LastRunTime)" -ForegroundColor Gray
    Write-Host "    Proxima ejecucion: $($taskInfo.NextRunTime)" -ForegroundColor Gray
    
    $lastResultHex = "0x" + [Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper()
    if ($taskInfo.LastTaskResult -eq 0) {
        Write-Host "    Ultimo resultado: $lastResultHex (EXITO)" -ForegroundColor Green
    } else {
        Write-Host "    Ultimo resultado: $lastResultHex (ERROR)" -ForegroundColor Red
    }
    
    # Mostrar el comando completo
    $taskAction = $task.Actions[0]
    Write-Host ""
    Write-Host "  Comando configurado:" -ForegroundColor Gray
    Write-Host "    Ejecutable: $($taskAction.Execute)" -ForegroundColor DarkGray
    Write-Host "    Argumentos:" -ForegroundColor DarkGray
    Write-Host "    $($taskAction.Arguments)" -ForegroundColor DarkGray
    
} else {
    Write-Host "  ERROR - Tarea NO encontrada: $taskName" -ForegroundColor Red
}

Write-Host ""

# ========== 6. LOGS DEL TASK SCHEDULER ==========
Write-Host "[6/6] Ultimos logs del Task Scheduler para esta tarea..." -ForegroundColor Yellow

try {
    $events = Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational" -MaxEvents 50 -ErrorAction SilentlyContinue | 
        Where-Object { $_.Message -like "*$taskName*" } |
        Select-Object -First 10
    
    if ($events) {
        foreach ($event in $events) {
            $eventColor = switch ($event.LevelDisplayName) {
                "Error" { "Red" }
                "Warning" { "Yellow" }
                default { "Gray" }
            }
            
            Write-Host "  [$($event.TimeCreated)] $($event.LevelDisplayName)" -ForegroundColor $eventColor
            $firstLine = ($event.Message -split "`n")[0]
            Write-Host "    $firstLine" -ForegroundColor DarkGray
        }
    } else {
        Write-Host "  No se encontraron eventos recientes para esta tarea" -ForegroundColor Gray
    }
} catch {
    Write-Host "  ADVERTENCIA - No se pudo acceder al log del Task Scheduler: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""

# ========== RESUMEN ==========
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN DEL DIAGNOSTICO" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

$issues = @()

if (-not $collectorSuccess) {
    $issues += "El collector NO se ejecuto correctamente"
}

if (-not $signalRSuccess) {
    $issues += "La notificacion SignalR NO se envio correctamente"
}

if ($task -and $taskInfo.LastTaskResult -ne 0) {
    $lastResultHex = "0x" + [Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper()
    $issues += "La tarea programada tiene error: $lastResultHex"
}

if ($issues.Count -gt 0) {
    Write-Host "  ERROR - SE ENCONTRARON $($issues.Count) PROBLEMA(S):" -ForegroundColor Red
    foreach ($issue in $issues) {
        Write-Host "    - $issue" -ForegroundColor Yellow
    }
} else {
    Write-Host "  OK - TODO FUNCIONO CORRECTAMENTE" -ForegroundColor Green
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
        Write-Host "2. Verifica que el backend este corriendo en: $ApiBaseUrl" -ForegroundColor Gray
        Write-Host "   Prueba acceder a: $ApiBaseUrl/health" -ForegroundColor Gray
        Write-Host ""
    }
    
    Write-Host "3. Revisa los logs de PowerShell en Event Viewer:" -ForegroundColor Gray
    Write-Host "   Applications and Services Logs - Windows PowerShell" -ForegroundColor DarkGray
    Write-Host ""
}

# Retornar codigo de salida apropiado
if ($issues.Count -gt 0) {
    exit 1
} else {
    exit 0
}
