<#
.SYNOPSIS
    Verifica en qué puerto y URL está escuchando el backend
#>

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " VERIFICACION DETALLADA DEL BACKEND" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar procesos dotnet
Write-Host "[1/4] Verificando procesos dotnet corriendo..." -ForegroundColor Yellow
$dotnetProcesses = Get-Process -Name "dotnet" -ErrorAction SilentlyContinue
if ($dotnetProcesses) {
    Write-Host "  OK - $($dotnetProcesses.Count) proceso(s) dotnet encontrado(s)" -ForegroundColor Green
    foreach ($proc in $dotnetProcesses) {
        Write-Host "    PID: $($proc.Id) | Memoria: $([math]::Round($proc.WorkingSet64/1MB, 2)) MB" -ForegroundColor Gray
    }
} else {
    Write-Host "  ERROR - No hay procesos dotnet corriendo" -ForegroundColor Red
}
Write-Host ""

# 2. Verificar puertos abiertos
Write-Host "[2/4] Verificando puertos abiertos..." -ForegroundColor Yellow
$ports = @(5000, 5001, 80, 443, 8080)
$openPorts = @()

foreach ($port in $ports) {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($connection) {
        $openPorts += $port
        $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "  OK - Puerto $port ABIERTO (Proceso: $($process.ProcessName) PID:$($process.Id))" -ForegroundColor Green
    } else {
        Write-Host "  - Puerto $port cerrado" -ForegroundColor Gray
    }
}
Write-Host ""

# 3. Probar URLs comunes
Write-Host "[3/4] Probando URLs comunes del backend..." -ForegroundColor Yellow

$urlsToTest = @(
    "http://localhost:5000/api/instances",
    "http://localhost:5001/api/instances",
    "http://127.0.0.1:5000/api/instances",
    "http://asprbm-nov-01:5000/api/instances",
    "http://localhost:5000/health",
    "http://localhost:5000/swagger"
)

$workingUrls = @()

foreach ($url in $urlsToTest) {
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "  OK - $url (Status: $($response.StatusCode))" -ForegroundColor Green
        $workingUrls += $url
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode) {
            Write-Host "  WARN - $url (Status: $statusCode)" -ForegroundColor Yellow
        } else {
            Write-Host "  ERROR - $url (No accesible)" -ForegroundColor Red
        }
    }
}
Write-Host ""

# 4. Probar endpoint de notificaciones SignalR
Write-Host "[4/4] Probando endpoint de notificaciones SignalR..." -ForegroundColor Yellow

$signalRUrls = @(
    "http://localhost:5000/api/notifications/healthscore",
    "http://localhost:5001/api/notifications/healthscore",
    "http://localhost:5000/hubs/notifications"
)

foreach ($url in $signalRUrls) {
    try {
        $testBody = @{
            collectorName = "TEST"
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            instanceCount = 0
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri $url -Method Post -Body $testBody -ContentType "application/json" -TimeoutSec 2 -ErrorAction Stop
        Write-Host "  OK - $url (Respuesta recibida)" -ForegroundColor Green
        Write-Host "    Respuesta: $($response | ConvertTo-Json -Compress)" -ForegroundColor DarkGray
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 404) {
            Write-Host "  WARN - $url (404 Not Found - Endpoint no existe)" -ForegroundColor Yellow
        } elseif ($statusCode) {
            Write-Host "  INFO - $url (Status: $statusCode)" -ForegroundColor Cyan
        } else {
            Write-Host "  ERROR - $url (No accesible)" -ForegroundColor Red
        }
    }
}
Write-Host ""

# RESUMEN
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " RESUMEN" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan

if ($dotnetProcesses) {
    Write-Host "Backend Status: CORRIENDO" -ForegroundColor Green
} else {
    Write-Host "Backend Status: NO CORRIENDO" -ForegroundColor Red
}

if ($openPorts.Count -gt 0) {
    Write-Host "Puertos abiertos: $($openPorts -join ', ')" -ForegroundColor Green
} else {
    Write-Host "Puertos abiertos: NINGUNO" -ForegroundColor Red
}

if ($workingUrls.Count -gt 0) {
    Write-Host "URLs funcionando:" -ForegroundColor Green
    foreach ($url in $workingUrls) {
        Write-Host "  - $url" -ForegroundColor Gray
    }
} else {
    Write-Host "URLs funcionando: NINGUNA" -ForegroundColor Red
}

Write-Host ""
Write-Host "RECOMENDACION:" -ForegroundColor Yellow

if ($workingUrls.Count -gt 0) {
    $baseUrl = ($workingUrls[0] -split '/api')[0]
    Write-Host "  Usa esta URL en las tareas programadas: $baseUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Comando para actualizar tareas:" -ForegroundColor Gray
    Write-Host "  Get-ScheduledTask -TaskName 'HealthScore_v3.2*' | Unregister-ScheduledTask -Confirm:`$false" -ForegroundColor DarkGray
    Write-Host "  .\Schedule-HealthScore-v3-FINAL.ps1 -ApiBaseUrl '$baseUrl'" -ForegroundColor DarkGray
} else {
    Write-Host "  El backend no esta accesible. Verifica:" -ForegroundColor Red
    Write-Host "  1. Que el proceso dotnet este corriendo" -ForegroundColor Gray
    Write-Host "  2. La URL configurada en appsettings.json o Program.cs" -ForegroundColor Gray
    Write-Host "  3. El firewall no este bloqueando el puerto" -ForegroundColor Gray
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan

