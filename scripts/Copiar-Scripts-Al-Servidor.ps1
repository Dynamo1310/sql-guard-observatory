<#
.SYNOPSIS
    Copia todos los scripts de collectors al servidor con el encoding correcto
    
.DESCRIPTION
    Este script copia los archivos asegurando UTF-8 con BOM para compatibilidad con PowerShell
#>

param(
    [string]$SourcePath = ".\scripts",
    [string]$DestinationPath = "C:\Apps\SQLGuardObservatory\Scripts"
)

Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host " COPIANDO SCRIPTS AL SERVIDOR" -ForegroundColor Cyan
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

# Crear directorio si no existe
if (-not (Test-Path $DestinationPath)) {
    New-Item -Path $DestinationPath -ItemType Directory -Force | Out-Null
    Write-Host "Directorio creado: $DestinationPath" -ForegroundColor Green
}

# Lista de archivos a copiar
$files = @(
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_CPU.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_ErroresCriticos.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_LogChain.ps1",
    "RelevamientoHealthScore_Maintenance.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_Waits.ps1",
    "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1",
    "Send-SignalRNotification.ps1",
    "Schedule-HealthScore-v3-FINAL.ps1",
    "Diagnostico-HealthScore.ps1"
)

$copiedCount = 0
$errorCount = 0

foreach ($file in $files) {
    $sourcePath = Join-Path $SourcePath $file
    $destPath = Join-Path $DestinationPath $file
    
    if (Test-Path $sourcePath) {
        try {
            # Leer contenido con UTF8
            $content = Get-Content $sourcePath -Raw -Encoding UTF8
            
            # Escribir con UTF8 con BOM (mejor compatibilidad con PowerShell)
            $utf8WithBom = New-Object System.Text.UTF8Encoding $true
            [System.IO.File]::WriteAllText($destPath, $content, $utf8WithBom)
            
            Write-Host "OK - $file" -ForegroundColor Green
            $copiedCount++
        } catch {
            Write-Host "ERROR - $file : $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
        }
    } else {
        Write-Host "SKIP - $file (no encontrado)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host "Archivos copiados: $copiedCount" -ForegroundColor Green
Write-Host "Errores: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Gray" })
Write-Host "==========================================================================" -ForegroundColor Cyan
Write-Host ""

if ($errorCount -eq 0) {
    Write-Host "EXITO - Todos los archivos fueron copiados correctamente" -ForegroundColor Green
    exit 0
} else {
    Write-Host "ADVERTENCIA - Algunos archivos no se copiaron" -ForegroundColor Yellow
    exit 1
}

