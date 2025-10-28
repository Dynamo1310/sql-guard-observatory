<#
.SYNOPSIS
    Schedule Health Score v3.2 - Windows Task Scheduler Setup con SignalR Notifications
    
.DESCRIPTION
    Crea/Actualiza Scheduled Tasks para ejecutar automáticamente:
    - 13 scripts de recolección de métricas individuales
    - 1 script de consolidación
    
    FRECUENCIAS OPTIMIZADAS (150 instancias, 10 cores, 16GB RAM):
    ⚡ CRÍTICO (Cada 5 minutos):
    - AlwaysOn, CPU, Memoria, I/O, Discos, DatabaseStates
    
    🟡 IMPORTANTE (Cada 30 minutos):
    - Backups, Waits
    
    🔵 PERIÓDICO (Cada 4 horas):
    - Maintenance, ErroresCriticos, ConfiguracionTempdb, Autogrowth, LogChain
    
    🔄 CONSOLIDADOR (Cada 10 minutos):
    - Consolidate_v3_FINAL (calcula HealthScore final)
    
    NOTIFICACIONES SIGNALR:
    Cada collector notifica al backend al terminar para actualización en tiempo real del frontend.
    
.PARAMETER ScriptsPath
    Ruta donde se encuentran los scripts collectors
    
.PARAMETER TaskPrefix
    Prefijo para nombrar las tareas en Task Scheduler
    
.PARAMETER ApiBaseUrl
    URL base del backend API para notificaciones SignalR (default: http://localhost:5000)
    
.NOTES
    Ejecutar con permisos de Administrador
    Hardware recomendado: 10+ cores, 16GB+ RAM
    
.EXAMPLE
    .\Schedule-HealthScore-v3-FINAL.ps1 -ApiBaseUrl "http://asprbm-nov-01:5000"
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$ScriptsPath = "C:\Apps\SQLGuardObservatory\Scripts",
    [string]$TaskPrefix = "HealthScore_v3.2",
    [string]$ApiBaseUrl = "http://localhost:5000",
    [string]$TaskUser = "GSCORP\UsrNova",
    [SecureString]$TaskPassword
)

$ErrorActionPreference = "Stop"

# Solicitar contraseña si no se proporcionó
if (-not $TaskPassword) {
    $TaskPassword = Read-Host "Ingrese password para $TaskUser" -AsSecureString
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.2 - Configuración de Tareas Programadas" -ForegroundColor Cyan
Write-Host " 13 Collectors + SignalR Real-Time Notifications" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el directorio de scripts existe
if (-not (Test-Path $ScriptsPath)) {
    Write-Error "El directorio de scripts no existe: $ScriptsPath"
    exit 1
}

Write-Host "[INFO] Configuración:" -ForegroundColor Yellow
Write-Host "  Scripts Path: $ScriptsPath" -ForegroundColor Gray
Write-Host "  API Base URL: $ApiBaseUrl" -ForegroundColor Gray
Write-Host "  Throttle: 16 threads (optimizado para 10 cores)" -ForegroundColor Gray
Write-Host ""

# Definición de tareas con frecuencias optimizadas
$tasks = @(
    # ⚡ CRÍTICO - Cada 5 minutos (6 collectors)
    @{
        Name = "AlwaysOn"
        Script = "RelevamientoHealthScore_AlwaysOn.ps1"
        Interval = 5
        Description = "Recolección de estado de AlwaysOn AG (sincronización crítica)"
        Priority = "High"
        Category = "Availability"
        Offset = 0  # Ejecuta a las :00, :05, :10...
    },
    @{
        Name = "CPU"
        Script = "RelevamientoHealthScore_CPU.ps1"
        Interval = 5
        Description = "Monitoreo de uso de CPU (detección de spikes)"
        Priority = "High"
        Category = "Performance"
        Offset = 1  # Ejecuta a las :01, :06, :11...
    },
    @{
        Name = "Memoria"
        Script = "RelevamientoHealthScore_Memoria.ps1"
        Interval = 5
        Description = "Monitoreo de memoria (PLE, memory pressure)"
        Priority = "High"
        Category = "Performance"
        Offset = 2  # Ejecuta a las :02, :07, :12...
    },
    @{
        Name = "IO"
        Script = "RelevamientoHealthScore_IO.ps1"
        Interval = 5
        Description = "Monitoreo de latencia de I/O (performance crítica)"
        Priority = "High"
        Category = "Performance"
        Offset = 3  # Ejecuta a las :03, :08, :13...
    },
    @{
        Name = "Discos"
        Script = "RelevamientoHealthScore_Discos.ps1"
        Interval = 5
        Description = "Monitoreo de espacio en discos (prevención de llenado)"
        Priority = "High"
        Category = "Resources"
        Offset = 4  # Ejecuta a las :04, :09, :14...
    },
    @{
        Name = "DatabaseStates"
        Script = "RelevamientoHealthScore_DatabaseStates.ps1"
        Interval = 5
        Description = "Detección de databases en estados problemáticos"
        Priority = "High"
        Category = "Availability"
        Offset = 0  # Ejecuta a las :00, :05, :10... (junto con AlwaysOn)
    },
    
    # 🟡 IMPORTANTE - Cada 30 minutos (2 collectors)
    @{
        Name = "Backups"
        Script = "RelevamientoHealthScore_Backups.ps1"
        Interval = 30
        Description = "Recolección de estado de backups (FULL, LOG)"
        Priority = "High"
        Category = "Availability"
        Offset = 5  # Ejecuta a las :05, :35
    },
    @{
        Name = "Waits"
        Script = "RelevamientoHealthScore_Waits.ps1"
        Interval = 30
        Description = "Recolección de wait statistics (acumulación de stats)"
        Priority = "Medium"
        Category = "Performance"
        Offset = 8  # Ejecuta a las :08, :38
    },
    
    # 🔵 PERIÓDICO - Cada 4 horas (5 collectors)
    @{
        Name = "Maintenance"
        Script = "RelevamientoHealthScore_Maintenance.ps1"
        Interval = 240  # 4 horas
        Description = "Estado de mantenimientos (CHECKDB, Index, Stats)"
        Priority = "Low"
        Category = "Maintenance"
        Offset = 10  # Ejecuta a las :10
    },
    @{
        Name = "ErroresCriticos"
        Script = "RelevamientoHealthScore_ErroresCriticos.ps1"
        Interval = 240
        Description = "Detección de errores severity >= 20"
        Priority = "Medium"
        Category = "Errors"
        Offset = 15  # Ejecuta a las :15
    },
    @{
        Name = "ConfiguracionTempdb"
        Script = "RelevamientoHealthScore_ConfiguracionTempdb.ps1"
        Interval = 240
        Description = "Verificación de configuración de TempDB"
        Priority = "Low"
        Category = "Configuration"
        Offset = 20  # Ejecuta a las :20
    },
    @{
        Name = "Autogrowth"
        Script = "RelevamientoHealthScore_Autogrowth.ps1"
        Interval = 240
        Description = "Monitoreo de autogrowth events y capacity"
        Priority = "Medium"
        Category = "Capacity"
        Offset = 25  # Ejecuta a las :25
    },
    @{
        Name = "LogChain"
        Script = "RelevamientoHealthScore_LogChain.ps1"
        Interval = 240
        Description = "Verificación de integridad de cadena de logs"
        Priority = "Medium"
        Category = "Availability"
        Offset = 30  # Ejecuta a las :30
    },
    
    # 🔄 CONSOLIDADOR - Cada 10 minutos
    @{
        Name = "Consolidate"
        Script = "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1"
        Interval = 10
        Description = "Consolidación y cálculo de Health Score final (0-100)"
        Priority = "High"
        Category = "Consolidation"
        Offset = 6  # Ejecuta a las :06, :16, :26... (1 min después del último collector crítico)
    }
)

Write-Host "[INFO] Se configurarán $($tasks.Count) tareas programadas:" -ForegroundColor Yellow
Write-Host "  ⚡ Crítico (5 min):   6 collectors" -ForegroundColor Red
Write-Host "  🟡 Importante (30 min): 2 collectors" -ForegroundColor Yellow
Write-Host "  🔵 Periódico (4 horas): 5 collectors" -ForegroundColor Blue
Write-Host "  🔄 Consolidador (10 min): 1 script" -ForegroundColor Cyan
Write-Host ""

# Verificar que existe el módulo de notificación SignalR
$signalRModulePath = Join-Path $ScriptsPath "Send-SignalRNotification.ps1"
if (-not (Test-Path $signalRModulePath)) {
    Write-Warning "  ⚠ Archivo Send-SignalRNotification.ps1 no encontrado en $ScriptsPath"
    Write-Warning "  Las notificaciones SignalR no funcionarán."
    Write-Host "  Copia el archivo Send-SignalRNotification.ps1 al directorio de scripts y ejecuta nuevamente." -ForegroundColor Yellow
    # Continuar sin salir - los collectors seguirán funcionando aunque sin notificaciones
} else {
    Write-Host "[INFO] Módulo de notificación SignalR encontrado: $signalRModulePath" -ForegroundColor Green
}

$successCount = 0
$errorCount = 0

foreach ($task in $tasks) {
    $taskName = "$TaskPrefix`_$($task.Name)"
    $scriptPath = Join-Path $ScriptsPath $task.Script
    
    # Verificar que el script existe
    if (-not (Test-Path $scriptPath)) {
        Write-Warning "Script no encontrado, saltando: $scriptPath"
        $errorCount++
        continue
    }
    
    # Mostrar info de la tarea
    $frequencyText = switch ($task.Interval) {
        5 { "⚡ 5 min" }
        10 { "🔄 10 min" }
        30 { "🟡 30 min" }
        240 { "🔵 4 horas" }
        default { "$($task.Interval) min" }
    }
    
    Write-Host "  Configurando: $taskName" -ForegroundColor Cyan
    Write-Host "    Script: $($task.Script)" -ForegroundColor Gray
    Write-Host "    Frecuencia: $frequencyText (offset: :$($task.Offset.ToString('00')))" -ForegroundColor Gray
    
    try {
        # Eliminar tarea existente si existe
        $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
            Write-Host "    ✓ Tarea existente eliminada" -ForegroundColor DarkGray
        }
        
        # Calcular el tiempo de inicio basado en el offset
        $now = Get-Date
        $startTime = $now.Date.AddHours($now.Hour).AddMinutes($task.Offset)
        if ($startTime -lt $now) {
            # Si el tiempo ya pasó en esta hora, programar para la próxima ejecución
            $startTime = $startTime.AddMinutes($task.Interval)
        }
        
        # Acción: Ejecutar PowerShell con el script Y notificar al backend
        # TODOS los collectors (incluido Consolidate) notifican cuando terminan
        # Esto permite al frontend mostrar actualizaciones en tiempo real
        # Nota: Siempre notificamos al terminar, independiente de si hubo errores
        $scriptBlock = @"
& '$scriptPath'
Start-Sleep -Milliseconds 500
try {
    & '$signalRModulePath' -NotificationType 'HealthScore' -CollectorName '$($task.Name)' -ApiBaseUrl '$ApiBaseUrl' -ErrorAction SilentlyContinue
} catch {
    # Ignorar errores de notificación silenciosamente
}
exit 0
"@
        
        $action = New-ScheduledTaskAction `
            -Execute "PowerShell.exe" `
            -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$scriptBlock`""
        
        # Trigger: Repetir cada X minutos
        $trigger = New-ScheduledTaskTrigger -Once -At $startTime -RepetitionInterval (New-TimeSpan -Minutes $task.Interval)
        
        # Configuración: Ejecutar como SYSTEM, siempre activo
        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RunOnlyIfNetworkAvailable:$false `
            -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
            -MultipleInstances Queue
        
        # Prioridad basada en criticidad
        if ($task.Priority -eq "High") {
            $settings.Priority = 4
        }
        elseif ($task.Priority -eq "Low") {
            $settings.Priority = 7
        }
        else {
            $settings.Priority = 6
        }
        
        # Crear la tarea con usuario específico
        # Convertir SecureString a texto plano para Register-ScheduledTask
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($TaskPassword)
        $PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        
        Register-ScheduledTask `
            -TaskName $taskName `
            -Description $task.Description `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -User $TaskUser `
            -Password $PlainPassword `
            -RunLevel Highest `
            | Out-Null
        
        # Limpiar contraseña de memoria
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
        Remove-Variable PlainPassword
        
        Write-Host "    ✓ Tarea creada exitosamente (próxima: $($startTime.ToString('HH:mm')))" -ForegroundColor Green
        $successCount++
    }
    catch {
        Write-Warning "    ✗ Error al crear tarea: $_"
        $errorCount++
    }
    
    Write-Host ""
}

# Resumen
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host " RESUMEN" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  Tareas creadas exitosamente: $successCount" -ForegroundColor $(if ($successCount -gt 0) { "Green" } else { "Gray" })
Write-Host "  Tareas con errores: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Gray" })
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host ""

if ($successCount -gt 0) {
    Write-Host "[INFO] Las tareas comenzarán a ejecutarse automáticamente" -ForegroundColor Yellow
    Write-Host "[INFO] Cada collector notificará al backend en: $ApiBaseUrl/api/healthscore/notify" -ForegroundColor Yellow
    Write-Host "[INFO] El frontend recibirá actualizaciones en tiempo real vía SignalR" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Tareas configuradas:" -ForegroundColor Cyan
    
    Get-ScheduledTask | Where-Object { $_.TaskName -like "$TaskPrefix*" } | 
        ForEach-Object {
            $taskInfo = Get-ScheduledTaskInfo $_
            [PSCustomObject]@{
                Tarea = $_.TaskName
                Estado = $_.State
                'Próxima Ejecución' = $taskInfo.NextRunTime
                'Última Ejecución' = $taskInfo.LastRunTime
            }
        } | Format-Table -AutoSize
    
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host " PRÓXIMOS PASOS PARA SIGNALR" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. BACKEND (.NET):" -ForegroundColor Yellow
    Write-Host "   - Crear SignalR Hub en: SQLGuardObservatory.API/Hubs/HealthScoreHub.cs" -ForegroundColor Gray
    Write-Host "   - Crear endpoint POST: /api/healthscore/notify" -ForegroundColor Gray
    Write-Host "   - Configurar SignalR en Program.cs" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. FRONTEND (React):" -ForegroundColor Yellow
    Write-Host "   - Instalar: npm install @microsoft/signalr" -ForegroundColor Gray
    Write-Host "   - Conectar a hub en HealthScore.tsx" -ForegroundColor Gray
    Write-Host "   - Suscribirse a evento 'HealthScoreUpdated'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Ver archivos de implementación creados en este mismo directorio." -ForegroundColor Gray
    Write-Host ""
}

Write-Host "[OK] Configuración completada!" -ForegroundColor Green
Write-Host ""
Write-Host "[TIP] Para verificar ejecución:" -ForegroundColor Cyan
Write-Host "  Get-ScheduledTask -TaskName '$TaskPrefix*' | Get-ScheduledTaskInfo" -ForegroundColor Gray
Write-Host ""
Write-Host "[TIP] Para forzar ejecución manual de un collector:" -ForegroundColor Cyan
Write-Host "  Start-ScheduledTask -TaskName '$TaskPrefix`_CPU'" -ForegroundColor Gray
Write-Host ""
