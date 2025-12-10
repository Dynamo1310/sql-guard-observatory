# ==============================================================================
# Script: Limpiar-Logs.ps1
# Descripción: Limpia los archivos de log del backend de SQLGuard Observatory
# Uso: .\Limpiar-Logs.ps1 [-DaysOld <días>] [-All] [-Force]
# ==============================================================================

param(
    [Parameter(HelpMessage="Eliminar archivos de log más antiguos que X días")]
    [int]$DaysOld = 0,
    
    [Parameter(HelpMessage="Limpiar todos los archivos de log (vaciar contenido)")]
    [switch]$All,
    
    [Parameter(HelpMessage="Eliminar archivos sin confirmación")]
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$logsPath = Join-Path $PSScriptRoot "SQLGuardObservatory.API\Logs"

# Colores para output
function Write-Success { Write-Host $args -ForegroundColor Green }
function Write-Info { Write-Host $args -ForegroundColor Cyan }
function Write-Warning { Write-Host $args -ForegroundColor Yellow }
function Write-Error { Write-Host $args -ForegroundColor Red }

Write-Info "=========================================="
Write-Info "  SQLGuard Observatory - Limpieza de Logs"
Write-Info "=========================================="
Write-Host ""

# Verificar que existe el directorio de logs
if (-not (Test-Path $logsPath)) {
    Write-Warning "No se encontró el directorio de logs: $logsPath"
    Write-Info "No hay logs para limpiar."
    exit 0
}

# Obtener archivos de log
$logFiles = Get-ChildItem -Path $logsPath -Filter "*.log" -File

if ($logFiles.Count -eq 0) {
    Write-Warning "No se encontraron archivos de log en: $logsPath"
    exit 0
}

Write-Info "Directorio de logs: $logsPath"
Write-Info "Archivos de log encontrados: $($logFiles.Count)"
Write-Host ""

# Opción 1: Limpiar todos los archivos (vaciar contenido)
if ($All) {
    Write-Warning "Esta operación vaciará el contenido de TODOS los archivos de log."
    
    if (-not $Force) {
        $confirmation = Read-Host "¿Desea continuar? (S/N)"
        if ($confirmation -ne 'S' -and $confirmation -ne 's') {
            Write-Info "Operación cancelada."
            exit 0
        }
    }
    
    $clearedCount = 0
    foreach ($file in $logFiles) {
        try {
            Clear-Content -Path $file.FullName -Force
            Write-Success "✓ Limpiado: $($file.Name)"
            $clearedCount++
        }
        catch {
            Write-Error "✗ Error al limpiar: $($file.Name) - $_"
        }
    }
    
    Write-Host ""
    Write-Success "=========================================="
    Write-Success "Se limpiaron $clearedCount archivos de log"
    Write-Success "=========================================="
}
# Opción 2: Eliminar archivos antiguos
elseif ($DaysOld -gt 0) {
    $cutoffDate = (Get-Date).AddDays(-$DaysOld)
    $oldFiles = $logFiles | Where-Object { $_.LastWriteTime -lt $cutoffDate }
    
    if ($oldFiles.Count -eq 0) {
        Write-Info "No se encontraron archivos de log más antiguos que $DaysOld días."
        exit 0
    }
    
    Write-Warning "Esta operación ELIMINARÁ $($oldFiles.Count) archivos de log más antiguos que $DaysOld días:"
    Write-Host ""
    
    foreach ($file in $oldFiles) {
        $age = ((Get-Date) - $file.LastWriteTime).Days
        Write-Host "  - $($file.Name) (Antigüedad: $age días)"
    }
    
    Write-Host ""
    
    if (-not $Force) {
        $confirmation = Read-Host "¿Desea continuar? (S/N)"
        if ($confirmation -ne 'S' -and $confirmation -ne 's') {
            Write-Info "Operación cancelada."
            exit 0
        }
    }
    
    $deletedCount = 0
    foreach ($file in $oldFiles) {
        try {
            Remove-Item -Path $file.FullName -Force
            Write-Success "✓ Eliminado: $($file.Name)"
            $deletedCount++
        }
        catch {
            Write-Error "✗ Error al eliminar: $($file.Name) - $_"
        }
    }
    
    Write-Host ""
    Write-Success "=========================================="
    Write-Success "Se eliminaron $deletedCount archivos de log"
    Write-Success "=========================================="
}
# Sin parámetros: Mostrar información
else {
    Write-Info "Archivos de log:"
    Write-Host ""
    
    $totalSize = 0
    foreach ($file in $logFiles) {
        $sizeKB = [math]::Round($file.Length / 1KB, 2)
        $totalSize += $file.Length
        $age = ((Get-Date) - $file.LastWriteTime).Days
        
        Write-Host "  📄 $($file.Name)" -ForegroundColor White
        Write-Host "     Tamaño: $sizeKB KB | Última modificación: $($file.LastWriteTime) ($age días)" -ForegroundColor Gray
    }
    
    $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
    
    Write-Host ""
    Write-Info "=========================================="
    Write-Info "Total: $($logFiles.Count) archivos | $totalSizeMB MB"
    Write-Info "=========================================="
    Write-Host ""
    
    Write-Host "Opciones de limpieza:" -ForegroundColor Yellow
    Write-Host "  1. Limpiar todos los archivos (vaciar contenido):" -ForegroundColor White
    Write-Host "     .\Limpiar-Logs.ps1 -All" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Eliminar archivos antiguos (ej: más de 30 días):" -ForegroundColor White
    Write-Host "     .\Limpiar-Logs.ps1 -DaysOld 30" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Sin confirmación (usar con precaución):" -ForegroundColor White
    Write-Host "     .\Limpiar-Logs.ps1 -All -Force" -ForegroundColor Gray
    Write-Host ""
}



