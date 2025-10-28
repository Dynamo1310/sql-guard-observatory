<#
.SYNOPSIS
    Script para arreglar el encoding de los collectors directamente en el servidor
    EJECUTAR ESTE SCRIPT EN EL SERVIDOR
#>

param(
    [string]$ScriptsPath = "C:\Apps\SQLGuardObservatory\Scripts",
    [string]$ApiBaseUrl = "http://127.0.0.1:5000"
)

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " ARREGLANDO ENCODING DE COLLECTORS EN EL SERVIDOR" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Arreglar encoding de cada archivo
$files = @(
    "RelevamientoHealthScore_CPU.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_AlwaysOn.ps1"
)

Write-Host "[PASO 1/3] Arreglando encoding de archivos..." -ForegroundColor Yellow
Write-Host "  (Removiendo caracteres problemáticos como emojis)" -ForegroundColor Gray
Write-Host ""

foreach ($file in $files) {
    $filePath = Join-Path $ScriptsPath $file
    
    if (Test-Path $filePath) {
        try {
            # Leer contenido
            $content = Get-Content $filePath -Raw -Encoding UTF8
            
            # Reemplazar emojis problemáticos con texto
            $content = $content -replace '✅', '[OK]'
            $content = $content -replace '❌', '[ERROR]'
            $content = $content -replace '⚠️', '[WARNING]'
            $content = $content -replace '🚨', '[CRITICAL]'
            $content = $content -replace '🔵', '[INFO]'
            $content = $content -replace '🟡', '[WARN]'
            $content = $content -replace '⚡', '[FAST]'
            $content = $content -replace '🔄', '[SYNC]'
            $content = $content -replace '1️⃣', '[1]'
            $content = $content -replace '2️⃣', '[2]'
            $content = $content -replace '3️⃣', '[3]'
            $content = $content -replace '4️⃣', '[4]'
            $content = $content -replace 'ℹ️', '[i]'
            
            # Guardar con UTF8 con BOM
            $utf8WithBom = New-Object System.Text.UTF8Encoding $true
            [System.IO.File]::WriteAllText($filePath, $content, $utf8WithBom)
            
            Write-Host "  OK - $file" -ForegroundColor Green
        } catch {
            Write-Host "  ERROR - $file : $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  SKIP - $file (no encontrado)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "[PASO 2/3] Recreando tareas programadas..." -ForegroundColor Yellow

# Eliminar tareas existentes
$existingTasks = Get-ScheduledTask -TaskName "HealthScore_v3.2*" -ErrorAction SilentlyContinue
if ($existingTasks) {
    $existingTasks | Unregister-ScheduledTask -Confirm:$false
    Write-Host "  OK - $($existingTasks.Count) tareas eliminadas" -ForegroundColor Green
} else {
    Write-Host "  INFO - No hay tareas previas" -ForegroundColor Gray
}

# Recrear tareas
$scheduleScript = Join-Path $ScriptsPath "Schedule-HealthScore-v3-FINAL.ps1"
if (Test-Path $scheduleScript) {
    try {
        & $scheduleScript -ApiBaseUrl $ApiBaseUrl -ScriptsPath $ScriptsPath
        Write-Host "  OK - Tareas recreadas" -ForegroundColor Green
    } catch {
        Write-Host "  ERROR - $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  ERROR - Schedule script no encontrado" -ForegroundColor Red
}

Write-Host ""
Write-Host "[PASO 3/4] Probando tarea CPU..." -ForegroundColor Yellow

Start-ScheduledTask -TaskName "HealthScore_v3.2_CPU"
Write-Host "  Esperando 30 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 30

$taskInfo = Get-ScheduledTask -TaskName "HealthScore_v3.2_CPU" | Get-ScheduledTaskInfo

Write-Host ""
Write-Host "  Ultima ejecucion: $($taskInfo.LastRunTime)" -ForegroundColor Gray
Write-Host "  Codigo: $($taskInfo.LastTaskResult) $(if ($taskInfo.LastTaskResult -eq 0) { '(EXITO)' } else { '(ERROR)' })" -ForegroundColor $(if ($taskInfo.LastTaskResult -eq 0) { "Green" } else { "Red" })

Write-Host ""
Write-Host "[PASO 4/4] Verificando datos en la base..." -ForegroundColor Yellow

try {
    $query = "SELECT TOP 5 InstanceName, TipoMetrica, FechaRelevamiento FROM RelevamientoHealthScore WHERE TipoMetrica = 'CPU' ORDER BY FechaRelevamiento DESC"
    $result = Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" -Database "SQLNova" -Query $query -ErrorAction Stop
    
    if ($result) {
        Write-Host "  OK - Encontrados registros de CPU en SQLNova:" -ForegroundColor Green
        $result | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    } else {
        Write-Host "  ADVERTENCIA - No hay registros de CPU en SQLNova" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  ERROR - No se pudo consultar la base: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

if ($taskInfo.LastTaskResult -eq 0) {
    Write-Host "  TODO LISTO!" -ForegroundColor Green
} else {
    Write-Host "  AUN HAY PROBLEMAS - Ejecuta:" -ForegroundColor Red
    Write-Host "  .\Test-Collector-Manual.ps1 -CollectorName 'CPU'" -ForegroundColor Gray
}

Write-Host "==========================================================================" -ForegroundColor Cyan

