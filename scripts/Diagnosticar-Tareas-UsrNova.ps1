# Script de diagnóstico completo para UsrNova
$logFile = "C:\Apps\SQLGuardObservatory\Scripts\diagnostico-usrnova.log"

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " DIAGNOSTICO COMPLETO - TAREAS CON USRNOVA" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

"========================================" | Out-File $logFile
"DIAGNOSTICO - $(Get-Date)" | Out-File $logFile -Append
"========================================" | Out-File $logFile -Append
"" | Out-File $logFile -Append

# 1. Verificar tarea existente
Write-Host "[1/5] Verificando tarea CPU existente..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName "HealthScore_v3.2_CPU" -ErrorAction SilentlyContinue

if ($task) {
    $principal = $task.Principal
    Write-Host "  Usuario configurado: $($principal.UserId)" -ForegroundColor Gray
    "Usuario de la tarea: $($principal.UserId)" | Out-File $logFile -Append
} else {
    Write-Host "  ERROR - Tarea no existe" -ForegroundColor Red
    "ERROR: Tarea no existe" | Out-File $logFile -Append
    exit 1
}

Write-Host ""

# 2. Crear tarea de prueba con logging
Write-Host "[2/5] Creando tarea de prueba con logging..." -ForegroundColor Yellow

$testScript = @"
`$logPath = 'C:\Apps\SQLGuardObservatory\Scripts\test-ejecucion.log'
'Inicio: ' + (Get-Date) | Out-File `$logPath
'Usuario ejecutando: ' + `$env:USERDOMAIN + '\' + `$env:USERNAME | Out-File `$logPath -Append

try {
    '--- Ejecutando CPU Collector ---' | Out-File `$logPath -Append
    & 'C:\Apps\SQLGuardObservatory\Scripts\RelevamientoHealthScore_CPU.ps1' 2>&1 | Out-File `$logPath -Append
    
    'Exit Code: ' + `$LASTEXITCODE | Out-File `$logPath -Append
    'Success ($?): ' + `$? | Out-File `$logPath -Append
    
    '--- Verificando datos en BD ---' | Out-File `$logPath -Append
    `$query = "SELECT COUNT(*) as cnt FROM InstanceHealth_CPU WHERE CollectedAtUtc >= DATEADD(MINUTE, -5, GETUTCDATE())"
    `$result = Invoke-Sqlcmd -ServerInstance 'SSPR17MON-01' -Database 'SQLNova' -Query `$query -TrustServerCertificate
    
    'Registros ultimos 5 min: ' + `$result.cnt | Out-File `$logPath -Append
    
} catch {
    'ERROR: ' + `$_.Exception.Message | Out-File `$logPath -Append
    'Stack: ' + `$_.ScriptStackTrace | Out-File `$logPath -Append
}

'Fin: ' + (Get-Date) | Out-File `$logPath -Append
exit 0
"@

$testScriptPath = "C:\Apps\SQLGuardObservatory\Scripts\Test-Task-UsrNova.ps1"
$testScript | Out-File -FilePath $testScriptPath -Encoding UTF8

Write-Host "  Script de prueba creado" -ForegroundColor Green
Write-Host ""

# 3. Solicitar contraseña
Write-Host "[3/5] Configurando tarea de prueba con UsrNova..." -ForegroundColor Yellow
$password = Read-Host "Ingrese password para GSCORP\UsrNova" -AsSecureString
$BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
$PlainPassword = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)

$action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File $testScriptPath"
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(10)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "TEST_UsrNova_CPU" -Action $action -Trigger $trigger -User "GSCORP\UsrNova" -Password $PlainPassword -Settings $settings -RunLevel Highest -Force | Out-Null

[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
Remove-Variable PlainPassword

Write-Host "  Tarea TEST_UsrNova_CPU creada" -ForegroundColor Green
Write-Host ""

# 4. Ejecutar y esperar
Write-Host "[4/5] Ejecutando tarea de prueba..." -ForegroundColor Yellow
Write-Host "  Esperando 5 minutos para que termine el collector..." -ForegroundColor Gray

Start-Sleep -Seconds 300

# 5. Analizar resultados
Write-Host ""
Write-Host "[5/5] Analizando resultados..." -ForegroundColor Yellow

$taskInfo = Get-ScheduledTask -TaskName "TEST_UsrNova_CPU" | Get-ScheduledTaskInfo

Write-Host "  Ultima ejecucion: $($taskInfo.LastRunTime)" -ForegroundColor Gray
Write-Host "  Codigo resultado: $($taskInfo.LastTaskResult)" -ForegroundColor $(if ($taskInfo.LastTaskResult -eq 0) { "Green" } else { "Red" })

"" | Out-File $logFile -Append
"Resultado de tarea de prueba:" | Out-File $logFile -Append
"Ultima ejecucion: $($taskInfo.LastRunTime)" | Out-File $logFile -Append
"Codigo: $($taskInfo.LastTaskResult)" | Out-File $logFile -Append
"" | Out-File $logFile -Append

# Leer log de ejecución
$testLogPath = "C:\Apps\SQLGuardObservatory\Scripts\test-ejecucion.log"
if (Test-Path $testLogPath) {
    Write-Host ""
    Write-Host "  --- LOG DE EJECUCION ---" -ForegroundColor Cyan
    $logContent = Get-Content $testLogPath
    $logContent | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    
    "--- LOG COMPLETO ---" | Out-File $logFile -Append
    $logContent | Out-File $logFile -Append
} else {
    Write-Host "  ADVERTENCIA - Log de ejecucion no encontrado" -ForegroundColor Yellow
    "ERROR: Log de ejecucion no encontrado" | Out-File $logFile -Append
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

if ($taskInfo.LastTaskResult -eq 0) {
    Write-Host "  La tarea se ejecuto correctamente (codigo 0)" -ForegroundColor Green
    Write-Host "  Revisa el log arriba para ver si guardo datos en la BD" -ForegroundColor Yellow
} else {
    Write-Host "  La tarea fallo (codigo: $($taskInfo.LastTaskResult))" -ForegroundColor Red
    Write-Host "  Revisa el log arriba para ver el error especifico" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Log completo guardado en:" -ForegroundColor Cyan
Write-Host "  $logFile" -ForegroundColor Gray
Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

# Limpiar tarea de prueba
Unregister-ScheduledTask -TaskName "TEST_UsrNova_CPU" -Confirm:$false
Write-Host "Tarea de prueba eliminada" -ForegroundColor Gray

