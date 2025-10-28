<#
.SYNOPSIS
    Wrapper para ejecutar RelevamientoHealthScore_Maintenance.ps1 en sesión limpia
#>
[CmdletBinding()]
param()

$scriptPath = Join-Path $PSScriptRoot "RelevamientoHealthScore_Maintenance.ps1"
Write-Host "🔄 Ejecutando Maintenance en sesión limpia..." -ForegroundColor Cyan

$verboseFlag = if ($PSBoundParameters['Verbose']) { '-Verbose' } else { '' }
$powershellArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
if ($verboseFlag) { $powershellArgs += $verboseFlag }

& powershell.exe @powershellArgs
exit $LASTEXITCODE

