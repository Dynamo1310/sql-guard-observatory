<#
.SYNOPSIS
    Configurar scheduled tasks para Health Score monitoring.

.DESCRIPTION
    Crea 3 tareas programadas en Windows Task Scheduler:
    1. RealTime (cada 5 minutos)
    2. Backups (cada 30 minutos)
    3. Maintenance (cada 4 horas)

.NOTES
    Ejecutar como Administrador
#>

[CmdletBinding()]
param(
    [string]$ScriptPath = "C:\Scripts\HealthScore",
    [string]$ServiceAccount = "DOMAIN\svc_sqlmonitor",
    [switch]$Remove
)

$ErrorActionPreference = "Stop"

# Verificar permisos de administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Este script requiere permisos de administrador"
    exit 1
}

$tasks = @(
    @{
        Name = "SQLGuard_HealthScore_RealTime"
        Description = "Monitoreo en tiempo real de SQL Server (conectividad, discos, AlwaysOn)"
        Script = "RelevamientoHealthScore_RealTime.ps1"
        Interval = "PT5M"  # Cada 5 minutos
        Priority = 4  # Alta prioridad
    },
    @{
        Name = "SQLGuard_HealthScore_Backups"
        Description = "Monitoreo de backups de SQL Server"
        Script = "RelevamientoHealthScore_Backups.ps1"
        Interval = "PT30M"  # Cada 30 minutos
        Priority = 6  # Prioridad media
    },
    @{
        Name = "SQLGuard_HealthScore_Maintenance"
        Description = "Monitoreo de maintenance jobs y errorlog"
        Script = "RelevamientoHealthScore_Maintenance.ps1"
        Interval = "PT4H"  # Cada 4 horas
        Priority = 7  # Prioridad baja
    },
    @{
        Name = "SQLGuard_HealthScore_Consolidate"
        Description = "Consolidación y cálculo de Health Score final"
        Script = "RelevamientoHealthScore_Consolidate.ps1"
        Interval = "PT15M"  # Cada 15 minutos
        Priority = 5  # Prioridad media
    }
)

if ($Remove) {
    Write-Host "Eliminando tareas programadas..." -ForegroundColor Yellow
    
    foreach ($task in $tasks) {
        try {
            Unregister-ScheduledTask -TaskName $task.Name -Confirm:$false -ErrorAction SilentlyContinue
            Write-Host "  [OK] Eliminada: $($task.Name)" -ForegroundColor Green
        } catch {
            Write-Host "  [SKIP] No existe: $($task.Name)" -ForegroundColor Gray
        }
    }
    
    exit 0
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Configurar Scheduled Tasks - Health Score" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Script Path: $ScriptPath" -ForegroundColor Gray
Write-Host "Service Account: $ServiceAccount" -ForegroundColor Gray
Write-Host ""

# Solicitar credenciales
Write-Host "Ingrese las credenciales de la cuenta de servicio:" -ForegroundColor Yellow
$credential = Get-Credential -UserName $ServiceAccount -Message "Credenciales para Scheduled Tasks"

foreach ($task in $tasks) {
    Write-Host "Configurando: $($task.Name)..." -ForegroundColor Cyan
    
    $scriptFullPath = Join-Path $ScriptPath $task.Script
    
    if (-not (Test-Path $scriptFullPath)) {
        Write-Warning "  [SKIP] Script no encontrado: $scriptFullPath"
        continue
    }
    
    # Eliminar tarea existente
    try {
        Unregister-ScheduledTask -TaskName $task.Name -Confirm:$false -ErrorAction SilentlyContinue
    } catch {}
    
    # Acción
    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptFullPath`""
    
    # Trigger (repetición)
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval $task.Interval -RepetitionDuration ([TimeSpan]::MaxValue)
    
    # Settings
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable `
        -MultipleInstances IgnoreNew `
        -Priority $task.Priority `
        -ExecutionTimeLimit (New-TimeSpan -Hours 1)
    
    # Principal (cuenta de servicio)
    $principal = New-ScheduledTaskPrincipal `
        -UserId $credential.UserName `
        -LogonType Password `
        -RunLevel Highest
    
    # Registrar tarea
    try {
        Register-ScheduledTask `
            -TaskName $task.Name `
            -Description $task.Description `
            -Action $action `
            -Trigger $trigger `
            -Settings $settings `
            -Principal $principal `
            -User $credential.UserName `
            -Password $credential.GetNetworkCredential().Password `
            -Force | Out-Null
        
        Write-Host "  [OK] Tarea creada: $($task.Name)" -ForegroundColor Green
        Write-Host "    Intervalo: $($task.Interval)" -ForegroundColor Gray
        
    } catch {
        Write-Error "  [ERROR] No se pudo crear $($task.Name): $_"
    }
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " Tareas programadas configuradas" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Para verificar las tareas:" -ForegroundColor Yellow
Write-Host "  Get-ScheduledTask | Where-Object {`$_.TaskName -like 'SQLGuard_HealthScore_*'}" -ForegroundColor Gray
Write-Host ""
Write-Host "Para ejecutar manualmente:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName 'SQLGuard_HealthScore_RealTime'" -ForegroundColor Gray
Write-Host ""

