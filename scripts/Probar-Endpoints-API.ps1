# Script para probar diferentes endpoints de la API

$baseUrl = "http://127.0.0.1:5000"

Write-Host "Probando endpoints en: $baseUrl" -ForegroundColor Cyan
Write-Host ""

$endpoints = @(
    "/api/instances",
    "/api/Instance",
    "/api/healthscore",
    "/api/HealthScore",
    "/api/notifications/healthscore",
    "/api/Notification/healthscore",
    "/health",
    "/swagger",
    "/swagger/index.html",
    "/"
)

foreach ($endpoint in $endpoints) {
    $url = "$baseUrl$endpoint"
    try {
        $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host "OK - $endpoint (Status: $($response.StatusCode))" -ForegroundColor Green
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 404) {
            Write-Host "404 - $endpoint (No existe)" -ForegroundColor Red
        } elseif ($statusCode -eq 401) {
            Write-Host "OK - $endpoint (Requiere autenticacion)" -ForegroundColor Yellow
        } elseif ($statusCode) {
            Write-Host "INFO - $endpoint (Status: $statusCode)" -ForegroundColor Cyan
        } else {
            Write-Host "ERROR - $endpoint (No accesible: $($_.Exception.Message))" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "Probando POST a /api/notifications/healthscore..." -ForegroundColor Cyan

try {
    $body = @{
        collectorName = "TEST"
        timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        instanceCount = 0
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$baseUrl/api/notifications/healthscore" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 2
    Write-Host "OK - POST /api/notifications/healthscore funciona!" -ForegroundColor Green
    Write-Host "Respuesta: $($response | ConvertTo-Json)" -ForegroundColor Gray
} catch {
    Write-Host "ERROR - POST /api/notifications/healthscore fallo: $($_.Exception.Message)" -ForegroundColor Red
}

