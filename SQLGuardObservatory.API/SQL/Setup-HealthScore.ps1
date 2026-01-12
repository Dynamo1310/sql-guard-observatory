# ========================================
# Script: Setup-HealthScore.ps1
# Propósito: Setup completo de HealthScore (tabla + permisos)
# ========================================

[CmdletBinding()]
param(
    [string]$SqlServerData = "SSPR17MON-01",
    [string]$SqlServerAuth = "localhost",
    [string]$DatabaseData = "SQLNova",
    [string]$DatabaseAuth = "AppSQLNova"
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Setup HealthScore - SQL Guard Observatory" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que Invoke-Sqlcmd esté disponible
if (-not (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) {
    Write-Host "❌ ERROR: Invoke-Sqlcmd no encontrado." -ForegroundColor Red
    Write-Host "Por favor instale el módulo SqlServer:" -ForegroundColor Yellow
    Write-Host "  Install-Module -Name SqlServer -Scope CurrentUser -Force" -ForegroundColor Gray
    exit 1
}

try {
    # ==========================================
    # PASO 1: Crear tabla en SQLNova
    # ==========================================
    Write-Host "[1/2] Creando tabla InstanceHealthSnapshot en $SqlServerData.$DatabaseData..." -ForegroundColor Yellow
    Write-Host ""
    
    $tableScript = Join-Path $PSScriptRoot "CreateInstanceHealthSnapshotTable.sql"
    
    if (-not (Test-Path $tableScript)) {
        Write-Host "❌ ERROR: No se encontró CreateInstanceHealthSnapshotTable.sql" -ForegroundColor Red
        exit 1
    }
    
    Invoke-Sqlcmd -ServerInstance $SqlServerData -Database $DatabaseData -InputFile $tableScript -TrustServerCertificate -Verbose
    
    Write-Host ""
    Write-Host "✅ Tabla creada/verificada correctamente" -ForegroundColor Green
    Write-Host ""

    # ==========================================
    # PASO 2: Agregar permisos
    # ==========================================
    Write-Host "[2/2] Agregando permisos en $SqlServerAuth.$DatabaseAuth..." -ForegroundColor Yellow
    Write-Host ""
    
    $permScript = Join-Path $PSScriptRoot "AddHealthScorePermission.sql"
    
    if (-not (Test-Path $permScript)) {
        Write-Host "❌ ERROR: No se encontró AddHealthScorePermission.sql" -ForegroundColor Red
        exit 1
    }
    
    Invoke-Sqlcmd -ServerInstance $SqlServerAuth -Database $DatabaseAuth -InputFile $permScript -TrustServerCertificate -Verbose
    
    Write-Host ""
    Write-Host "✅ Permisos agregados correctamente" -ForegroundColor Green
    Write-Host ""

    # ==========================================
    # RESUMEN
    # ==========================================
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✅ Setup completado exitosamente" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Compilar backend:" -ForegroundColor White
    Write-Host "   cd SQLGuardObservatory.API" -ForegroundColor Gray
    Write-Host "   dotnet build -c Release" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Reiniciar API:" -ForegroundColor White
    Write-Host "   Restart-Service SQLGuardObservatory.API" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Poblar datos (primera vez):" -ForegroundColor White
    Write-Host "   cd ..\scripts" -ForegroundColor Gray
    Write-Host "   # Editar RelevamientoHealthScoreMant.ps1:" -ForegroundColor Gray
    Write-Host "   #   `$TestMode = `$true" -ForegroundColor Gray
    Write-Host "   #   `$WriteToSql = `$true" -ForegroundColor Gray
    Write-Host "   .\RelevamientoHealthScoreMant.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "4. Build frontend:" -ForegroundColor White
    Write-Host "   npm run build" -ForegroundColor Gray
    Write-Host ""
    Write-Host "5. Logout/Login en la app para refrescar permisos" -ForegroundColor White
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ❌ ERROR durante el setup" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    exit 1
}

