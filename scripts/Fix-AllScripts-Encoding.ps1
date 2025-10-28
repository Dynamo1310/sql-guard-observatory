<#
.SYNOPSIS
    Actualiza todos los scripts Health Score para usar dbatools exclusivamente
#>

$ErrorActionPreference = 'Stop'

$scripts = @(
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_ErroresCriticos.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_LogChain.ps1",
    "RelevamientoHealthScore_Maintenance.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_Waits.ps1"
)

foreach ($scriptName in $scripts) {
    $scriptPath = Join-Path $PSScriptRoot $scriptName
    
    if (-not (Test-Path $scriptPath)) {
        Write-Warning "Script no encontrado: $scriptName"
        continue
    }
    
    Write-Host "Procesando: $scriptName" -ForegroundColor Cyan
    
    # Leer con encoding correcto
    $content = [System.IO.File]::ReadAllText($scriptPath)
    
    # 1. Reemplazar Invoke-Sqlcmd con Invoke-DbaQuery
    $content = $content -replace 'Invoke-Sqlcmd\s+-ServerInstance', 'Invoke-DbaQuery -SqlInstance'
    $content = $content -replace '-TrustServerCertificate(?!\w)', '-EnableException'
    
    # 2. Guardar con UTF-8 con BOM (que es lo que PowerShell espera)
    $utf8WithBom = New-Object System.Text.UTF8Encoding $true
    [System.IO.File]::WriteAllText($scriptPath, $content, $utf8WithBom)
    
    Write-Host "  ✅ Actualizado" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ COMPLETADO - $($scripts.Count) scripts actualizados" -ForegroundColor Green
Write-Host ""
Write-Host "NOTA: Los módulos ya fueron actualizados en el script CPU," -ForegroundColor Yellow
Write-Host "      pero debes copiar manualmente ese patrón a los demás." -ForegroundColor Yellow

