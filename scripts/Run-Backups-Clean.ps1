<#
.SYNOPSIS
    Wrapper para ejecutar RelevamientoHealthScore_Backups.ps1 en sesión limpia
#>
[CmdletBinding()]
param()

$scriptPath = Join-Path $PSScriptRoot "RelevamientoHealthScore_Backups.ps1"
Write-Host "🔄 Ejecutando Backups en sesión limpia..." -ForegroundColor Cyan

$verboseFlag = if ($PSBoundParameters['Verbose']) { '-Verbose' } else { '' }
$powershellArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $scriptPath)
if ($verboseFlag) { $powershellArgs += $verboseFlag }

& powershell.exe @powershellArgs
exit $LASTEXITCODE

