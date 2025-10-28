<#
.SYNOPSIS
    Crea una tarea de prueba para diagnosticar el problema de Task Scheduler
#>

#Requires -RunAsAdministrator

param(
    [string]$TaskUser = "GSCORP\TB03260ADM",
    [SecureString]$TaskPassword
)

# Solicitar contraseña si no se proporcionó
if (-not $TaskPassword) {
    $TaskPassword = Read-Host "Ingrese password para $TaskUser" -AsSecureString
}

$taskName = "HealthScore_DEBUG_Test"
$scriptPath = "C:\Apps\SQLGuardObservatory\Scripts\Test-TaskScheduler-Context.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CREAR TAREA DE PRUEBA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el script existe
if (-not (Test-Path $scriptPath)) {
    Write-Error "Script no encontrado: $scriptPath"
    exit 1
}

# Eliminar tarea si existe
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "Eliminando tarea existente..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Crear acción
$action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""

# Trigger: Ejecutar una vez en 1 minuto
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)

# Settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable

# Convertir SecureString a texto plano
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($TaskPassword)
$PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

# Crear tarea
Register-ScheduledTask `
    -TaskName $taskName `
    -Description "Tarea de diagnóstico temporal" `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -User $TaskUser `
    -Password $PlainPassword `
    -RunLevel Highest `
    | Out-Null

# Limpiar contraseña
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
Remove-Variable PlainPassword

Write-Host "✅ Tarea creada: $taskName" -ForegroundColor Green
Write-Host ""
Write-Host "Para ejecutar AHORA:" -ForegroundColor Yellow
Write-Host "  Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor White
Write-Host ""
Write-Host "Luego revisa el log en:" -ForegroundColor Yellow
Write-Host "  C:\Temp\TaskScheduler_Debug_*.log" -ForegroundColor White
Write-Host ""

