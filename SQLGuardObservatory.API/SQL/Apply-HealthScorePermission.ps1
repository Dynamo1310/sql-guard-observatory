# ========================================
# Script: Apply-HealthScorePermission.ps1
# Propósito: Aplicar permisos de HealthScore en ObservatoryAuthDb
# ========================================

[CmdletBinding()]
param(
    [string]$SqlServer = "localhost",
    [string]$Database = "AppSQLNova"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Aplicando permisos de HealthScore" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Servidor: $SqlServer" -ForegroundColor Yellow
Write-Host "Base de datos: $Database" -ForegroundColor Yellow
Write-Host ""

try {
    # Verificar que Invoke-Sqlcmd esté disponible
    if (-not (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue)) {
        Write-Host "❌ ERROR: Invoke-Sqlcmd no encontrado." -ForegroundColor Red
        Write-Host "Por favor instale el módulo SqlServer:" -ForegroundColor Yellow
        Write-Host "  Install-Module -Name SqlServer -Scope CurrentUser -Force" -ForegroundColor Gray
        exit 1
    }

    # Obtener la ruta del script SQL
    $scriptPath = Join-Path $PSScriptRoot "AddHealthScorePermission.sql"
    
    if (-not (Test-Path $scriptPath)) {
        Write-Host "❌ ERROR: No se encontró el archivo AddHealthScorePermission.sql" -ForegroundColor Red
        Write-Host "Ruta esperada: $scriptPath" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "📄 Ejecutando script SQL..." -ForegroundColor Cyan
    Write-Host ""

    # Ejecutar el script SQL
    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $Database -InputFile $scriptPath -TrustServerCertificate -Verbose

    Write-Host ""
    Write-Host "✅ Permisos aplicados correctamente" -ForegroundColor Green
    Write-Host ""
    Write-Host "Ahora los roles Admin y SuperAdmin tienen acceso a HealthScore" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "❌ ERROR al aplicar permisos:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    exit 1
}

