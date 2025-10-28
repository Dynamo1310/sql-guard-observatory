<#
.SYNOPSIS
    Wrapper para ejecutar RelevamientoHealthScore_Waits.ps1 en sesión limpia
#>
[CmdletBinding()]
param()

$scriptPath = Join-Path $PSScriptRoot "RelevamientoHealthScore_Waits.ps1"
Write-Host "🔄 Ejecutando Waits en sesión limpia..." -ForegroundColor Cyan

$verboseFlag = if ($PSBoundParameters['Verbose']) { '-Verbose' } else { '' }
$powershellArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
if ($verboseFlag) { $powershellArgs += $verboseFlag }

& powershell.exe @powershellArgs
exit $LASTEXITCODE

