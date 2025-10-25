<#
.SYNOPSIS
    Crea Scheduled Tasks para Health Score v3.0 (100 puntos - 10 categorías)
    
.DESCRIPTION
    Crea 11 tareas programadas en Windows Task Scheduler:
    
    SCRIPTS DE RECOLECCIÓN (10):
    1. HealthScore_Backups              → Cada 15 minutos (RPO/RTO)
    2. HealthScore_AlwaysOn             → Cada 5 minutos (AG sync)
    3. HealthScore_Conectividad         → Cada 1-2 minutos (ping/auth)
    4. HealthScore_ErroresCriticos      → Cada 15 minutos (severity≥20)
    5. HealthScore_CPU                  → Cada 5 minutos (uso/runnable)
    6. HealthScore_IO                   → Cada 5 minutos (latencia/IOPS)
    7. HealthScore_Discos               → Cada 10 minutos (espacio libre)
    8. HealthScore_Memoria              → Cada 5 minutos (PLE/grants)
    9. HealthScore_Mantenimientos       → Cada 60 minutos (CHECKDB/Index)
    10. HealthScore_ConfiguracionTempdb → Cada 30 minutos (config/tempdb)
    
    CONSOLIDADOR (1):
    11. HealthScore_Consolidate         → Cada 2 minutos (cálculo final)
    
.NOTES
    Requiere: 
    - Ejecutar como Administrador
    - dbatools instalado (.\scripts\Install-DbaTools.ps1)
    Versión: 3.0 (10 categorías, 100 puntos)
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
Write-Host "║  Health Score v3.0 - Task Scheduler Setup            ║" -ForegroundColor Cyan
Write-Host "║  10 Categorías + 1 Consolidador                       ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# ===== VERIFICACIONES PREVIAS =====

Write-Host "🔍 Verificando prerequisitos..." -ForegroundColor Yellow
Write-Host ""

# 1. Verificar dbatools
Write-Host "1️⃣  Verificando dbatools..." -ForegroundColor Gray

$dbaModule = Get-Module -ListAvailable -Name dbatools

if (-not $dbaModule) {
    Write-Error "❌ dbatools NO está instalado. Los scripts de Health Score v3.0 requieren dbatools."
    Write-Host ""
    Write-Host "Instala dbatools ejecutando:" -ForegroundColor Yellow
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

# Definir tareas (10 scripts de recolección + 1 consolidador)
$tasks = @(
    # CATEGORÍA 1: BACKUPS (18%)
    @{
        Name = "HealthScore_v3_Backups"
        Script = "RelevamientoHealthScore_Backups.ps1"
        Description = "Health Score v3 - Backups (RPO/RTO) - Peso: 18%"
        IntervalMinutes = 15
        Priority = "Normal"
    },
    # CATEGORÍA 2: ALWAYSON (14%)
    @{
        Name = "HealthScore_v3_AlwaysOn"
        Script = "RelevamientoHealthScore_AlwaysOn.ps1"
        Description = "Health Score v3 - AlwaysOn (AG sync) - Peso: 14%"
        IntervalMinutes = 5
        Priority = "Normal"
    },
    # CATEGORÍA 3: CONECTIVIDAD (10%)
    @{
        Name = "HealthScore_v3_Conectividad"
        Script = "RelevamientoHealthScore_Conectividad.ps1"
        Description = "Health Score v3 - Conectividad (ping/auth/RTT) - Peso: 10%"
        IntervalMinutes = 2
        Priority = "High"
    },
    # CATEGORÍA 4: ERRORES CRÍTICOS (7%)
    @{
        Name = "HealthScore_v3_ErroresCriticos"
        Script = "RelevamientoHealthScore_ErroresCriticos.ps1"
        Description = "Health Score v3 - Errores Críticos (severity≥20) - Peso: 7%"
        IntervalMinutes = 15
        Priority = "Normal"
    },
    # CATEGORÍA 5: CPU (10%)
    @{
        Name = "HealthScore_v3_CPU"
        Script = "RelevamientoHealthScore_CPU.ps1"
        Description = "Health Score v3 - CPU (uso/runnable tasks) - Peso: 10%"
        IntervalMinutes = 5
        Priority = "Normal"
    },
    # CATEGORÍA 6: IO (10%)
    @{
        Name = "HealthScore_v3_IO"
        Script = "RelevamientoHealthScore_IO.ps1"
        Description = "Health Score v3 - IO (latencia/IOPS) - Peso: 10%"
        IntervalMinutes = 5
        Priority = "Normal"
    },
    # CATEGORÍA 7: DISCOS (8%)
    @{
        Name = "HealthScore_v3_Discos"
        Script = "RelevamientoHealthScore_Discos.ps1"
        Description = "Health Score v3 - Discos (espacio libre por rol) - Peso: 8%"
        IntervalMinutes = 10
        Priority = "Normal"
    },
    # CATEGORÍA 8: MEMORIA (7%)
    @{
        Name = "HealthScore_v3_Memoria"
        Script = "RelevamientoHealthScore_Memoria.ps1"
        Description = "Health Score v3 - Memoria (PLE/grants/uso) - Peso: 7%"
        IntervalMinutes = 5
        Priority = "Normal"
    },
    # CATEGORÍA 9: MANTENIMIENTOS (6%)
    @{
        Name = "HealthScore_v3_Mantenimientos"
        Script = "RelevamientoHealthScore_Maintenance.ps1"
        Description = "Health Score v3 - Mantenimientos (CHECKDB/IndexOptimize) - Peso: 6%"
        IntervalMinutes = 60
        Priority = "Low"
    },
    # CATEGORÍA 10: CONFIGURACIÓN & TEMPDB (10%)
    @{
        Name = "HealthScore_v3_ConfiguracionTempdb"
        Script = "RelevamientoHealthScore_ConfiguracionTempdb.ps1"
        Description = "Health Score v3 - Configuración & TempDB - Peso: 10%"
        IntervalMinutes = 30
        Priority = "Low"
    },
    # CONSOLIDADOR
    @{
        Name = "HealthScore_v3_Consolidate"
        Script = "RelevamientoHealthScore_Consolidate_v3.ps1"
        Description = "Health Score v3 - Consolidador (calcula score final de 100 puntos)"
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
    Write-Host "   Get-ScheduledTask | Where-Object {`$_.TaskName -like 'HealthScore_v3*'}" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📊 Para ejecutar manualmente una tarea:" -ForegroundColor Yellow
    Write-Host "   Start-ScheduledTask -TaskName 'HealthScore_v3_Conectividad'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "📁 Logs en: $LogPath" -ForegroundColor Yellow
} else {
    Write-Warning "⚠️ Algunas tareas no pudieron ser creadas. Revisa los errores arriba."
}

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  HEALTH SCORE v3.0 - ARQUITECTURA                     ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  10 CATEGORÍAS (100 PUNTOS):                          ║" -ForegroundColor White
Write-Host "║  1. 🗄️  Backups (RPO/RTO)            18%              ║" -ForegroundColor White
Write-Host "║  2. ♻️  AlwaysOn (AG)                14%              ║" -ForegroundColor White
Write-Host "║  3. 🌐 Conectividad                  10%              ║" -ForegroundColor White
Write-Host "║  4. 🚨 Errores sev≥20                7%               ║" -ForegroundColor White
Write-Host "║  5. ⚙️  CPU                           10%              ║" -ForegroundColor White
Write-Host "║  6. 💽 IO (Latencia / IOPS)          10%              ║" -ForegroundColor White
Write-Host "║  7. 🧱 Espacio en discos             8%               ║" -ForegroundColor White
Write-Host "║  8. 🧠 Memoria (PLE + Grants)        7%               ║" -ForegroundColor White
Write-Host "║  9. 🧹 Mantenimientos                6%               ║" -ForegroundColor White
Write-Host "║  10. 🧩 Configuración & tempdb       10%              ║" -ForegroundColor White
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  SEMÁFORO:                                            ║" -ForegroundColor White
Write-Host "║  🟢 Verde (85-100):   Óptimo                          ║" -ForegroundColor White
Write-Host "║  🟡 Amarillo (75-84):  Advertencia leve               ║" -ForegroundColor White
Write-Host "║  🟠 Naranja (65-74):   Riesgo alto                    ║" -ForegroundColor White
Write-Host "║  🔴 Rojo (<65):        Crítico                        ║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""


