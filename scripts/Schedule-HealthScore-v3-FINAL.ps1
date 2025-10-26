<#
.SYNOPSIS
    Schedule Health Score v3.0 FINAL (12 Categorías) - Windows Task Scheduler Setup
    
.DESCRIPTION
    Crea/Actualiza Scheduled Tasks para ejecutar automáticamente:
    - 12 scripts de recolección de métricas individuales
    - 1 script de consolidación
    
    FRECUENCIAS:
    - Conectividad: Cada 1 minuto (eliminado - solo indicador)
    - AlwaysOn: Cada 2 minutos
    - Log Chain: Cada 5 minutos
    - Database States: Cada 5 minutos
    - Errores Críticos: Cada 5 minutos
    - CPU: Cada 2 minutos
    - Memoria: Cada 3 minutos
    - I/O: Cada 3 minutos
    - Discos: Cada 10 minutos
    - Mantenimientos: Cada 30 minutos
    - Config & TempDB: Cada 60 minutos
    - Autogrowth: Cada 30 minutos
    - Backups: Cada 15 minutos
    - Consolidate: Cada 2 minutos (después de recolección)
    
.NOTES
    Ejecutar con permisos de Administrador
#>

#Requires -RunAsAdministrator

[CmdletBinding()]
param(
    [string]$ScriptsPath = "C:\SQLGuardCollectors\scripts",
    [string]$TaskPrefix = "HealthScore_v3_FINAL"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 FINAL - Configuración de Tareas Programadas" -ForegroundColor Cyan
Write-Host " 12 Categorías Balanceadas" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el directorio de scripts existe
if (-not (Test-Path $ScriptsPath)) {
    Write-Error "El directorio de scripts no existe: $ScriptsPath"
    exit 1
}

# Definición de tareas
$tasks = @(
    # TAB 1: AVAILABILITY & DR (4 categorías)
    @{
        Name = "Backups"
        Script = "RelevamientoHealthScore_Backups.ps1"
        Interval = 15  # minutos
        Description = "Recolección de estado de backups (FULL, LOG)"
        Priority = "High"
    },
    @{
        Name = "AlwaysOn"
        Script = "RelevamientoHealthScore_AlwaysOn.ps1"
        Interval = 2
        Description = "Recolección de estado de AlwaysOn AG"
        Priority = "High"
    },
    @{
        Name = "LogChain"
        Script = "RelevamientoHealthScore_LogChain.ps1"
        Interval = 5
        Description = "Verificación de integridad de cadena de logs"
        Priority = "High"
    },
    @{
        Name = "DatabaseStates"
        Script = "RelevamientoHealthScore_DatabaseStates.ps1"
        Interval = 5
        Description = "Detección de databases en estados problemáticos"
        Priority = "High"
    },
    
    # TAB 2: PERFORMANCE (4 categorías)
    @{
        Name = "CPU"
        Script = "RelevamientoHealthScore_CPU.ps1"
        Interval = 2
        Description = "Monitoreo de uso de CPU"
        Priority = "Medium"
    },
    @{
        Name = "Memoria"
        Script = "RelevamientoHealthScore_Memoria.ps1"
        Interval = 3
        Description = "Monitoreo de memoria (PLE, Grants)"
        Priority = "Medium"
    },
    @{
        Name = "IO"
        Script = "RelevamientoHealthScore_IO.ps1"
        Interval = 3
        Description = "Monitoreo de latencia de I/O"
        Priority = "Medium"
    },
    @{
        Name = "Discos"
        Script = "RelevamientoHealthScore_Discos.ps1"
        Interval = 10
        Description = "Monitoreo de espacio en discos"
        Priority = "Medium"
    },
    
    # TAB 3: MAINTENANCE & CONFIG (4 categorías)
    @{
        Name = "ErroresCriticos"
        Script = "RelevamientoHealthScore_ErroresCriticos.ps1"
        Interval = 5
        Description = "Detección de errores severity >= 20"
        Priority = "High"
    },
    @{
        Name = "Maintenance"
        Script = "RelevamientoHealthScore_Maintenance.ps1"
        Interval = 30
        Description = "Estado de mantenimientos (CHECKDB, Index, Stats)"
        Priority = "Low"
    },
    @{
        Name = "ConfiguracionTempdb"
        Script = "RelevamientoHealthScore_ConfiguracionTempdb.ps1"
        Interval = 60
        Description = "Verificación de configuración de TempDB"
        Priority = "Low"
    },
    @{
        Name = "Autogrowth"
        Script = "RelevamientoHealthScore_Autogrowth.ps1"
        Interval = 30
        Description = "Monitoreo de autogrowth events y capacity"
        Priority = "Medium"
    },
    
    # Consolidación (debe ejecutarse después)
    @{
        Name = "Consolidate"
        Script = "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1"
        Interval = 2
        Description = "Consolidación y cálculo de Health Score final"
        Priority = "High"
        Delay = 30  # segundos de delay para esperar a que terminen las recolecciones
    }
)

Write-Host "[INFO] Se configurarán $($tasks.Count) tareas programadas" -ForegroundColor Yellow
Write-Host ""

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
    
    Write-Host "  Configurando: $taskName" -ForegroundColor Cyan
    Write-Host "    Script: $($task.Script)" -ForegroundColor Gray
    Write-Host "    Frecuencia: Cada $($task.Interval) minutos" -ForegroundColor Gray
    
    try {
        # Eliminar tarea existente si existe
        $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        if ($existingTask) {
            Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
            Write-Host "    ✓ Tarea existente eliminada" -ForegroundColor DarkGray
        }
        
        # Acción: Ejecutar PowerShell con el script
        $action = New-ScheduledTaskAction `
            -Execute "PowerShell.exe" `
            -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
        
        # Trigger: Repetir cada X minutos
        $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes $task.Interval)
        
        # Si la tarea tiene delay (Consolidate), agregar delay al trigger
        if ($task.PSObject.Properties['Delay']) {
            $trigger.Delay = "PT$($task.Delay)S"  # ISO 8601 duration format
        }
        
        # Configuración: Ejecutar como SYSTEM, siempre activo
        $settings = New-ScheduledTaskSettingsSet `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RunOnlyIfNetworkAvailable:$false `
            -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
            -MultipleInstances Queue
        
        # Prioridad
        if ($task.Priority -eq "High") {
            $settings.Priority = 4
        }
        elseif ($task.Priority -eq "Low") {
            $settings.Priority = 7
        }
        else {
            $settings.Priority = 6
        }
        
        # Crear la tarea
        Register-ScheduledTask `
            -TaskName $taskName `
            -Description $task.Description `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -User "SYSTEM" `
            -RunLevel Highest `
            | Out-Null
        
        Write-Host "    ✓ Tarea creada exitosamente" -ForegroundColor Green
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
    Write-Host "[INFO] Puedes verificarlas en: Task Scheduler > Task Scheduler Library" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Tareas configuradas:" -ForegroundColor Cyan
    Get-ScheduledTask | Where-Object { $_.TaskName -like "$TaskPrefix*" } | 
        Select-Object TaskName, State, @{N='NextRunTime';E={$_.Triggers[0].StartBoundary}} | 
        Format-Table -AutoSize
}

Write-Host "[OK] Configuración completada!" -ForegroundColor Green

