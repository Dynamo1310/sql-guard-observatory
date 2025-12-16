# ============================================
# Script: Deploy-ServerRestart.ps1
# Descripción: Despliega la funcionalidad de Reinicio de Servidores
# ============================================

param(
    [switch]$CreateTables,
    [switch]$CopyScript,
    [switch]$All
)

$ErrorActionPreference = "Stop"

Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Deploy Server Restart Feature" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Configuración
$SqlServer = "asprbm-nov-01"
$Database = "SQLGuardObservatoryAuth"
$ScriptSourcePath = "$PSScriptRoot\scripts\SQLRestartNova_WebAPI.ps1"
$ScriptDestPath = "C:\Apps\SQLGuardObservatory\Scripts\SQLRestartNova_WebAPI.ps1"

# Función para ejecutar SQL
function Execute-SqlScript {
    param(
        [string]$SqlPath,
        [string]$Description
    )
    
    Write-Host "Ejecutando: $Description" -ForegroundColor Yellow
    
    try {
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $Database -InputFile $SqlPath -TrustServerCertificate -ErrorAction Stop
        Write-Host "  ✓ $Description completado" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Error: $_" -ForegroundColor Red
        throw
    }
}

# 1. Crear tablas en la base de datos
if ($CreateTables -or $All) {
    Write-Host ""
    Write-Host "1. Creando tablas en la base de datos..." -ForegroundColor Cyan
    
    $sqlPath = "$PSScriptRoot\SQLGuardObservatory.API\SQL\CreateServerRestartTables.sql"
    
    if (Test-Path $sqlPath) {
        Execute-SqlScript -SqlPath $sqlPath -Description "Crear tablas ServerRestartTask y ServerRestartDetail"
    } else {
        Write-Host "  ✗ No se encontró el archivo SQL: $sqlPath" -ForegroundColor Red
    }
}

# 2. Copiar script PowerShell al servidor
if ($CopyScript -or $All) {
    Write-Host ""
    Write-Host "2. Copiando script PowerShell..." -ForegroundColor Cyan
    
    # Crear directorio si no existe
    $destDir = Split-Path $ScriptDestPath -Parent
    if (!(Test-Path $destDir)) {
        Write-Host "  Creando directorio: $destDir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    if (Test-Path $ScriptSourcePath) {
        Copy-Item -Path $ScriptSourcePath -Destination $ScriptDestPath -Force
        Write-Host "  ✓ Script copiado a: $ScriptDestPath" -ForegroundColor Green
    } else {
        Write-Host "  ✗ No se encontró el script origen: $ScriptSourcePath" -ForegroundColor Red
    }
    
    # Crear directorio de logs
    $logsDir = "C:\Apps\SQLGuardObservatory\Logs"
    if (!(Test-Path $logsDir)) {
        Write-Host "  Creando directorio de logs: $logsDir" -ForegroundColor Yellow
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Deployment completado" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Reiniciar el servicio del backend para cargar los nuevos endpoints"
Write-Host "  2. Compilar y desplegar el frontend"
Write-Host "  3. Verificar que el permiso 'ServerRestart' esté habilitado para los roles deseados"
Write-Host ""
Write-Host "Uso:" -ForegroundColor Yellow
Write-Host "  .\Deploy-ServerRestart.ps1 -All              # Ejecutar todo"
Write-Host "  .\Deploy-ServerRestart.ps1 -CreateTables     # Solo crear tablas"
Write-Host "  .\Deploy-ServerRestart.ps1 -CopyScript       # Solo copiar script"
Write-Host ""

