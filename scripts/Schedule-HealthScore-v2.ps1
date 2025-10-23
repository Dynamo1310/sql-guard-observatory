<#
.SYNOPSIS
    Crea Scheduled Tasks para Health Score v2.0 (150 puntos)
    
.DESCRIPTION
    Crea 5 tareas programadas en Windows Task Scheduler:
    
    1. HealthScore_Availability  → Cada 1 minuto
    2. HealthScore_Resources     → Cada 5 minutos
    3. HealthScore_Backups       → Cada 15 minutos
    4. HealthScore_Maintenance   → Cada 1 hora
    5. HealthScore_Consolidate   → Cada 2 minutos
    
.NOTES
    Requiere: 
    - Ejecutar como Administrador
    - dbatools instalado (.\scripts\Install-DbaTools.ps1)
    Versión: 2.0 (dbatools)
#>

[CmdletBinding()]
param(
    [string]$ScriptsPath = "C:\SQL-Guard-Observatory\scripts",
    [string]$LogPath = "C:\SQL-Guard-Observatory\logs",
    [string]$TaskUser = "DOMAIN\svc_sqlguard",
    [string]$TaskPassword = ""  # Dejarlo vacío para que pida la contraseña
)

#Requires -RunAsAdministrator

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v2.0 - Task Scheduler Setup            ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ===== VERIFICACIONES PREVIAS =====

Write-Host "🔍 Verificando prerequisitos..." -ForegroundColor Yellow
Write-Host ""

# 1. Verificar dbatools
Write-Host "1️⃣  Verificando dbatools..." -ForegroundColor Gray

$dbaModule = Get-Module -ListAvailable -Name dbatools

if (-not $dbaModule) {
    Write-Error "❌ dbatools NO está instalado. Los scripts de Health Score v2.0 requieren dbatools."
    Write-Host ""
    Write-Host "Instala dbatools ejecutando:" -ForegroundColor Yellow
    Write-Host "  .\scripts\Install-DbaTools.ps1" -ForegroundColor Cyan
    Write-Host "  O manualmente:" -ForegroundColor Gray
    Write-Host "  Install-Module -Name dbatools -Force -AllowClobber" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

$dbaVersion = $dbaModule.Version | Select-Object -First 1
Write-Host "   ✅ dbatools instalado (Versión: $dbaVersion)" -ForegroundColor Green

# 2. Verificar que existe el directorio de scripts
Write-Host "2️⃣  Verificando directorio de scripts..." -ForegroundColor Gray

if (-not (Test-Path $ScriptsPath)) {
    Write-Error "❌ No existe el directorio: $ScriptsPath"
    exit 1
}

Write-Host "   ✅ Directorio de scripts encontrado: $ScriptsPath" -ForegroundColor Green

Write-Host ""
Write-Host "✅ Todos los prerequisitos verificados!" -ForegroundColor Green
Write-Host ""

# Crear directorio de logs si no existe
if (-not (Test-Path $LogPath)) {
    New-Item -Path $LogPath -ItemType Directory -Force | Out-Null
    Write-Host "✅ Creado directorio de logs: $LogPath" -ForegroundColor Green
}

# Pedir contraseña si no se proporcionó
if ([string]::IsNullOrEmpty($TaskPassword)) {
    $securePassword = Read-Host "Ingresa contraseña para $TaskUser" -AsSecureString
    $TaskPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    )
}

# Definir tareas
$tasks = @(
    @{
        Name = "HealthScore_v2_Availability"
        Script = "RelevamientoHealthScore_Availability.ps1"
        Description = "Health Score v2 - Métricas de disponibilidad (conectividad, blocking, memoria, AlwaysOn)"
        IntervalMinutes = 1
        Priority = "High"
    },
    @{
        Name = "HealthScore_v2_Resources"
        Script = "RelevamientoHealthScore_Resources.ps1"
        Description = "Health Score v2 - Métricas de recursos (discos, IOPS, queries lentos)"
        IntervalMinutes = 5
        Priority = "Normal"
    },
    @{
        Name = "HealthScore_v2_Backups"
        Script = "RelevamientoHealthScore_Backups.ps1"
        Description = "Health Score v2 - Métricas de backups (FULL, LOG)"
        IntervalMinutes = 15
        Priority = "Normal"
    },
    @{
        Name = "HealthScore_v2_Maintenance"
        Script = "RelevamientoHealthScore_Maintenance.ps1"
        Description = "Health Score v2 - Métricas de mantenimiento (CHECKDB, IndexOptimize, fragmentación, errorlog)"
        IntervalMinutes = 60
        Priority = "Low"
    },
    @{
        Name = "HealthScore_v2_Consolidate"
        Script = "RelevamientoHealthScore_Consolidate.ps1"
        Description = "Health Score v2 - Consolidador y cálculo final (150 puntos)"
        IntervalMinutes = 2
        Priority = "High"
        StartDelayMinutes = 1  # Espera 1 minuto para que los otros scripts recolecten datos primero
    }
)

Write-Host "Configuración:" -ForegroundColor Yellow
Write-Host "  Scripts Path: $ScriptsPath" -ForegroundColor Gray
Write-Host "  Log Path: $LogPath" -ForegroundColor Gray
Write-Host "  Task User: $TaskUser" -ForegroundColor Gray
Write-Host ""

# Crear/actualizar cada tarea
$successCount = 0

foreach ($task in $tasks) {
    Write-Host "Procesando: $($task.Name)..." -ForegroundColor Yellow
    
    $scriptPath = Join-Path $ScriptsPath $task.Script
    
    # Verificar que existe el script
    if (-not (Test-Path $scriptPath)) {
        Write-Warning "  ⚠️ No se encuentra el script: $scriptPath (SKIPPED)"
        continue
    }
    
    # Eliminar tarea existente
    $existingTask = Get-ScheduledTask -TaskName $task.Name -ErrorAction SilentlyContinue
    if ($existingTask) {
        Unregister-ScheduledTask -TaskName $task.Name -Confirm:$false
        Write-Host "  🗑️ Eliminada tarea existente" -ForegroundColor Gray
    }
    
    # Crear acción (ejecutar PowerShell con el script)
    $logFile = Join-Path $LogPath "$($task.Name)_$(Get-Date -Format 'yyyyMMdd').log"
    
    $action = New-ScheduledTaskAction `
        -Execute "PowerShell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" *>&1 | Tee-Object -FilePath `"$logFile`" -Append"
    
    # Crear trigger (intervalo de minutos)
    $startTime = (Get-Date).AddMinutes(if ($task.StartDelayMinutes) { $task.StartDelayMinutes } else { 0 })
    
    $trigger = New-ScheduledTaskTrigger `
        -Once `
        -At $startTime `
        -RepetitionInterval (New-TimeSpan -Minutes $task.IntervalMinutes)
    
    # Configurar settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable `
        -MultipleInstances Queue `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
        -Priority $(switch ($task.Priority) {
            "High" { 1 }
            "Normal" { 5 }
            "Low" { 7 }
        })
    
    # Crear principal (usuario que ejecuta)
    $principal = New-ScheduledTaskPrincipal `
        -UserId $TaskUser `
        -LogonType Password `
        -RunLevel Highest
    
    # Registrar tarea
    try {
        Register-ScheduledTask `
            -TaskName $task.Name `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -Password $TaskPassword `
            -Description $task.Description | Out-Null
        
        Write-Host "  ✅ Tarea creada: cada $($task.IntervalMinutes) min" -ForegroundColor Green
        $successCount++
        
    } catch {
        Write-Error "  ❌ Error creando tarea: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN                                              ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Tareas creadas exitosamente: $successCount de $($tasks.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

if ($successCount -eq $tasks.Count) {
    Write-Host "✅ Todas las tareas fueron creadas correctamente!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Para verificar las tareas:" -ForegroundColor Yellow
    Write-Host "   Get-ScheduledTask | Where-Object {`$_.TaskName -like 'HealthScore_v2*'}" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📊 Para ejecutar manualmente una tarea:" -ForegroundColor Yellow
    Write-Host "   Start-ScheduledTask -TaskName 'HealthScore_v2_Availability'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📁 Logs en: $LogPath" -ForegroundColor Yellow
} else {
    Write-Warning "⚠️ Algunas tareas no pudieron ser creadas. Revisa los errores arriba."
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  SECUENCIA DE EJECUCIÓN RECOMENDADA:                  ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Min 0:   Availability + Resources + Backups          ║" -ForegroundColor White
Write-Host "║  Min 1:   Consolidate (calcula score)                ║" -ForegroundColor White
Write-Host "║  Min 2:   Availability (nuevo ciclo)                  ║" -ForegroundColor White
Write-Host "║  Min 3:   Consolidate                                 ║" -ForegroundColor White
Write-Host "║  Min 5:   Availability + Resources                    ║" -ForegroundColor White
Write-Host "║  Min 6:   Consolidate                                 ║" -ForegroundColor White
Write-Host "║  Min 15:  Availability + Backups                      ║" -ForegroundColor White
Write-Host "║  Min 60:  Availability + Maintenance                  ║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

