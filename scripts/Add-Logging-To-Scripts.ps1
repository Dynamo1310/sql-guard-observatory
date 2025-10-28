<#
.SYNOPSIS
    Agrega sistema de logging a todos los scripts Health Score
    
.DESCRIPTION
    Modifica los scripts para que guarden logs cuando se ejecutan desde Task Scheduler
#>

$ErrorActionPreference = 'Stop'

$logTemplate = @'
# ===== CONFIGURACIÓN DE LOGGING =====
$logDir = "C:\Apps\SQLGuardObservatory\Scripts\Logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$scriptBaseName = [System.IO.Path]::GetFileNameWithoutExtension($MyInvocation.MyCommand.Name)
$logFile = Join-Path $logDir "${scriptBaseName}_$timestamp.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $logMessage = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$Level] $Message"
    Write-Host $logMessage
    if ($logFile) {
        Add-Content -Path $logFile -Value $logMessage -ErrorAction SilentlyContinue
    }
}

# Redirigir errores al log
$ErrorActionPreference = 'Continue'
$OriginalErrorAction = $ErrorActionPreference
# ===== FIN CONFIGURACIÓN DE LOGGING =====

'@

$scripts = @(
    "RelevamientoHealthScore_CPU.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_Waits.ps1",
    "RelevamientoHealthScore_Maintenance.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_ErroresCriticos.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_LogChain.ps1"
)

Write-Host "Agregando sistema de logging a los scripts..." -ForegroundColor Cyan
Write-Host ""

foreach ($scriptName in $scripts) {
    $scriptPath = Join-Path $PSScriptRoot $scriptName
    
    if (-not (Test-Path $scriptPath)) {
        Write-Warning "Script no encontrado: $scriptName"
        continue
    }
    
    Write-Host "📝 Procesando: $scriptName" -ForegroundColor Yellow
    
    $content = [System.IO.File]::ReadAllText($scriptPath)
    
    # Verificar si ya tiene logging
    if ($content -like "*Write-Log*function*") {
        Write-Host "   ⏭️  Ya tiene logging, saltando..." -ForegroundColor Gray
        continue
    }
    
    # Encontrar el final de la región de configuración
    $configEndPattern = '#endregion.*CONFIGURACIÓN'
    if ($content -match $configEndPattern) {
        $match = [regex]::Match($content, $configEndPattern)
        $insertPosition = $match.Index + $match.Length
        
        # Insertar el código de logging
        $before = $content.Substring(0, $insertPosition)
        $after = $content.Substring($insertPosition)
        
        $newContent = $before + "`n`n" + $logTemplate + "`n" + $after
        
        # Guardar
        $utf8WithBom = New-Object System.Text.UTF8Encoding $true
        [System.IO.File]::WriteAllText($scriptPath, $newContent, $utf8WithBom)
        
        Write-Host "   ✅ Logging agregado" -ForegroundColor Green
    } else {
        Write-Warning "   ⚠️  No se encontró región de configuración"
    }
}

Write-Host ""
Write-Host "✅ Proceso completado" -ForegroundColor Green
Write-Host ""
Write-Host "NOTA: Los scripts ahora guardarán logs en:" -ForegroundColor Yellow
Write-Host "      C:\Apps\SQLGuardObservatory\Scripts\Logs\" -ForegroundColor White

