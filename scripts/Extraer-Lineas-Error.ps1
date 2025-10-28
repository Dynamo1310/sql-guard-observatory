# Script para extraer las líneas con error del collector
param(
    [string]$ScriptPath = "C:\Apps\SQLGuardObservatory\Scripts\RelevamientoHealthScore_DatabaseStates.ps1"
)

Write-Host "Extrayendo líneas con error de: $ScriptPath" -ForegroundColor Cyan
Write-Host ""

$lines = Get-Content $ScriptPath -Encoding UTF8

Write-Host "=== LINEA 229-233 (Error: Missing closing '}') ===" -ForegroundColor Yellow
for ($i = 228; $i -le 232; $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}

Write-Host ""
Write-Host "=== LINEA 289-293 (Error: Try missing Catch/Finally) ===" -ForegroundColor Yellow
for ($i = 288; $i -le 292; $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}

Write-Host ""
Write-Host "=== LINEA 322-326 (Error: String missing terminator) ===" -ForegroundColor Yellow
for ($i = 321; $i -le 325; $i++) {
    Write-Host "$($i+1): $($lines[$i])"
}

Write-Host ""
Write-Host "=== TOTAL DE LINEAS EN EL ARCHIVO ===" -ForegroundColor Cyan
Write-Host "Total: $($lines.Count) líneas"

