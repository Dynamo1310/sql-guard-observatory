<#
.SYNOPSIS
    Wrapper para ejecutar RelevamientoHealthScore_CPU.ps1 en una sesión limpia
    
.DESCRIPTION
    Este script ejecuta RelevamientoHealthScore_CPU.ps1 en un proceso nuevo de PowerShell
    sin cargar el perfil, evitando conflictos de assemblies con Microsoft.Data.SqlClient
    
.EXAMPLE
    .\Run-CPU-Clean.ps1
    .\Run-CPU-Clean.ps1 -Verbose
#>

[CmdletBinding()]
param()

$scriptPath = Join-Path $PSScriptRoot "RelevamientoHealthScore_CPU.ps1"

Write-Host "🔄 Ejecutando script en sesión limpia de PowerShell..." -ForegroundColor Cyan
Write-Host ""

# Ejecutar en un proceso nuevo sin perfil para evitar conflictos de assemblies
$verboseFlag = if ($PSBoundParameters['Verbose']) { '-Verbose' } else { '' }

$powershellArgs = @(
    '-NoProfile'
    '-ExecutionPolicy', 'Bypass'
    '-File', $scriptPath
)

if ($verboseFlag) {
    $powershellArgs += $verboseFlag
}

# Ejecutar y capturar el código de salida
& powershell.exe @powershellArgs

$exitCode = $LASTEXITCODE

Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "✅ Ejecución completada exitosamente" -ForegroundColor Green
} else {
    Write-Host "❌ Ejecución terminó con código: $exitCode" -ForegroundColor Red
}

exit $exitCode

