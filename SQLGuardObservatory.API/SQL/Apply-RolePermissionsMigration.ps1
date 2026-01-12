# Script para aplicar la migración de RolePermissions
# Este script copia el archivo SQL al servidor y lo ejecuta

param(
    [string]$ServerName = "SSPR17MON-01",
    [string]$DatabaseName = "AppSQLNova",
    [string]$SqlUser = "ScriptExec",
    [string]$SqlPassword = "susana.9",
    [string]$SqlScriptPath = "$PSScriptRoot\CreateRolePermissionsTable.sql"
)

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Aplicando Migración: RolePermissions" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar que el archivo SQL existe
if (-not (Test-Path $SqlScriptPath)) {
    Write-Host "ERROR: No se encontró el archivo SQL en: $SqlScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Archivo SQL encontrado: $SqlScriptPath" -ForegroundColor Green

# Verificar si sqlcmd está disponible
$sqlcmdPath = Get-Command sqlcmd -ErrorAction SilentlyContinue
if (-not $sqlcmdPath) {
    Write-Host "ERROR: sqlcmd no está instalado o no está en el PATH." -ForegroundColor Red
    Write-Host "Por favor, instala SQL Server Command Line Utilities." -ForegroundColor Yellow
    Write-Host "O ejecuta el script manualmente en SSMS." -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ sqlcmd encontrado: $($sqlcmdPath.Source)" -ForegroundColor Green
Write-Host ""

# Ejecutar el script SQL
Write-Host "Ejecutando script SQL en servidor: $ServerName" -ForegroundColor Yellow
Write-Host "Base de datos: $DatabaseName" -ForegroundColor Yellow
Write-Host ""

try {
    $result = & sqlcmd -S $ServerName -d $DatabaseName -U $SqlUser -P $SqlPassword -i $SqlScriptPath -b
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "================================================" -ForegroundColor Green
        Write-Host "✓ Migración aplicada exitosamente" -ForegroundColor Green
        Write-Host "================================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "La tabla RolePermissions ha sido creada con los permisos por defecto." -ForegroundColor Green
        Write-Host ""
        Write-Host "Próximo paso: Reiniciar el servicio del backend" -ForegroundColor Cyan
        Write-Host "  Restart-Service -Name 'SQLGuardObservatory.API'" -ForegroundColor White
        Write-Host ""
    } else {
        Write-Host ""
        Write-Host "ERROR: Falló la ejecución del script SQL" -ForegroundColor Red
        Write-Host "Código de salida: $LASTEXITCODE" -ForegroundColor Red
        Write-Host ""
        Write-Host "Revisa el error anterior o ejecuta el script manualmente en SSMS." -ForegroundColor Yellow
        exit 1
    }
}
catch {
    Write-Host ""
    Write-Host "ERROR: Excepción al ejecutar el script SQL" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Intenta ejecutar el script manualmente en SSMS:" -ForegroundColor Yellow
    Write-Host "  1. Abre SQL Server Management Studio" -ForegroundColor White
    Write-Host "  2. Conéctate a $ServerName" -ForegroundColor White
    Write-Host "  3. Abre el archivo: $SqlScriptPath" -ForegroundColor White
    Write-Host "  4. Ejecuta el script (F5)" -ForegroundColor White
    exit 1
}

