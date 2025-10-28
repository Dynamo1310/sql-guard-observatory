<#
.SYNOPSIS
    Script para arreglar TODOS los problemas de encoding y hacer que funcione YA
#>

param(
    [string]$SourcePath = ".",
    [string]$DestPath = "C:\Apps\SQLGuardObservatory\Scripts",
    [string]$ApiBaseUrl = "http://127.0.0.1:5000"
)

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " ARREGLANDO TODO - ENCODING Y TAREAS PROGRAMADAS" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Lista de archivos críticos
$files = @(
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_CPU.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_ErroresCriticos.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_LogChain.ps1",
    "RelevamientoHealthScore_Maintenance.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_Waits.ps1",
    "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1",
    "Send-SignalRNotification.ps1",
    "Schedule-HealthScore-v3-FINAL.ps1"
)

Write-Host "[PASO 1/4] Copiando archivos con encoding UTF-8..." -ForegroundColor Yellow

$copiedCount = 0
$errorCount = 0

foreach ($file in $files) {
    $sourcePath = Join-Path $SourcePath "scripts\$file"
    $destPath = Join-Path $DestPath $file
    
    if (Test-Path $sourcePath) {
        try {
            # Leer contenido con UTF8
            $content = Get-Content $sourcePath -Raw -Encoding UTF8
            
            # Escribir con UTF8 con BOM
            $utf8WithBom = New-Object System.Text.UTF8Encoding $true
            [System.IO.File]::WriteAllText($destPath, $content, $utf8WithBom)
            
            Write-Host "  OK - $file" -ForegroundColor Green
            $copiedCount++
        } catch {
            Write-Host "  ERROR - $file : $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
        }
    } else {
        Write-Host "  SKIP - $file (no encontrado en origen)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "  Archivos copiados: $copiedCount" -ForegroundColor Green
Write-Host "  Errores: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Gray" })
Write-Host ""

# Verificar sintaxis de un collector crítico
Write-Host "[PASO 2/4] Verificando sintaxis de CPU collector..." -ForegroundColor Yellow

$cpuScript = Join-Path $DestPath "RelevamientoHealthScore_CPU.ps1"
try {
    $null = [System.Management.Automation.PSParser]::Tokenize((Get-Content $cpuScript -Raw), [ref]$null)
    Write-Host "  OK - Sin errores de sintaxis" -ForegroundColor Green
} catch {
    Write-Host "  ERROR - Errores de sintaxis encontrados: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  ABORTANDO - Arregla los errores de sintaxis primero" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Eliminar y recrear tareas programadas
Write-Host "[PASO 3/4] Eliminando tareas programadas existentes..." -ForegroundColor Yellow

$existingTasks = Get-ScheduledTask -TaskName "HealthScore_v3.2*" -ErrorAction SilentlyContinue
if ($existingTasks) {
    $existingTasks | Unregister-ScheduledTask -Confirm:$false
    Write-Host "  OK - $($existingTasks.Count) tareas eliminadas" -ForegroundColor Green
} else {
    Write-Host "  INFO - No hay tareas previas" -ForegroundColor Gray
}

Write-Host ""

Write-Host "[PASO 4/4] Creando nuevas tareas programadas..." -ForegroundColor Yellow

$scheduleScript = Join-Path $DestPath "Schedule-HealthScore-v3-FINAL.ps1"
try {
    & $scheduleScript -ApiBaseUrl $ApiBaseUrl -ScriptsPath $DestPath
    Write-Host "  OK - Tareas creadas" -ForegroundColor Green
} catch {
    Write-Host "  ERROR - No se pudieron crear las tareas: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Probar una tarea
Write-Host "[PASO 5/5] Probando tarea CPU..." -ForegroundColor Yellow

Start-ScheduledTask -TaskName "HealthScore_v3.2_CPU"
Write-Host "  Esperando 30 segundos..." -ForegroundColor Gray
Start-Sleep -Seconds 30

$taskInfo = Get-ScheduledTask -TaskName "HealthScore_v3.2_CPU" | Get-ScheduledTaskInfo

Write-Host ""
Write-Host "  Resultado:" -ForegroundColor Yellow
Write-Host "    Ultima ejecucion: $($taskInfo.LastRunTime)" -ForegroundColor Gray
Write-Host "    Codigo: $($taskInfo.LastTaskResult) $(if ($taskInfo.LastTaskResult -eq 0) { '(EXITO)' } else { '(ERROR)' })" -ForegroundColor $(if ($taskInfo.LastTaskResult -eq 0) { "Green" } else { "Red" })

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN FINAL" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

if ($taskInfo.LastTaskResult -eq 0) {
    Write-Host "  EXITO - Todo funciona correctamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Siguiente paso:" -ForegroundColor Yellow
    Write-Host "  1. Verifica que se guardaron datos en la BD" -ForegroundColor Gray
    Write-Host "  2. Inicia el backend: dotnet run" -ForegroundColor Gray
    Write-Host "  3. Inicia el frontend: npm run dev" -ForegroundColor Gray
    Write-Host "  4. Ve a http://localhost:5173/healthscore" -ForegroundColor Gray
    Write-Host "  5. Espera a que un collector termine y veras la actualizacion en tiempo real" -ForegroundColor Gray
} else {
    Write-Host "  ERROR - Aun hay problemas" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Ejecuta este comando para diagnosticar:" -ForegroundColor Yellow
    Write-Host "  .\Test-Collector-Manual.ps1 -CollectorName 'CPU'" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

