# =============================================
# Deploy-ProductionAlerts.ps1
# Despliega el sistema de alertas de servidores caídos
# =============================================

param(
    [string]$SqlServer = "localhost",
    [string]$Database = "SQLGuardObservatory"
)

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Desplegando Sistema de Alertas de Producción" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Crear las tablas en la base de datos
Write-Host "[1/3] Creando tablas en la base de datos..." -ForegroundColor Yellow
$sqlScript = ".\SQLGuardObservatory.API\SQL\CreateProductionAlertTables.sql"

if (Test-Path $sqlScript) {
    try {
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $Database -InputFile $sqlScript -TrustServerCertificate
        Write-Host "      Tablas creadas correctamente" -ForegroundColor Green
    }
    catch {
        Write-Host "      Error al crear tablas: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "      Ejecuta manualmente: $sqlScript" -ForegroundColor Yellow
    }
}
else {
    Write-Host "      Archivo SQL no encontrado: $sqlScript" -ForegroundColor Red
}

# 2. Compilar el backend
Write-Host ""
Write-Host "[2/3] Compilando el backend..." -ForegroundColor Yellow
Push-Location ".\SQLGuardObservatory.API"

try {
    dotnet build --configuration Release --verbosity quiet
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Backend compilado correctamente" -ForegroundColor Green
    }
    else {
        Write-Host "      Error al compilar el backend" -ForegroundColor Red
    }
}
catch {
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
}

Pop-Location

# 3. Compilar el frontend
Write-Host ""
Write-Host "[3/3] Compilando el frontend..." -ForegroundColor Yellow

try {
    npm run build --silent 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Frontend compilado correctamente" -ForegroundColor Green
    }
    else {
        Write-Host "      Error al compilar el frontend (puede que ya esté compilado)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "      Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Despliegue completado" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "1. Reiniciar el backend (IIS o servicio)" -ForegroundColor White
Write-Host "2. Acceder a la vista: /admin/production-alerts" -ForegroundColor White
Write-Host "3. Configurar destinatarios y activar la alerta" -ForegroundColor White
Write-Host ""

