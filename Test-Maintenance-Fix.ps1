# Script para probar el fix de RelevamientoHealthScore_Maintenance.ps1
# ===============================================================

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Test: Fix Mantenimiento AG CRM365" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# Paso 1: Ejecutar el script corregido
Write-Host "PASO 1: Ejecutando RelevamientoHealthScore_Maintenance.ps1..." -ForegroundColor Yellow
& ".\scripts\RelevamientoHealthScore_Maintenance.ps1"

# Paso 2: Ejecutar diagnóstico
Write-Host "`nPASO 2: Ejecutando diagnóstico AG CRM365..." -ForegroundColor Yellow
& ".\Diagnosticar-AG-CRM365.ps1"

Write-Host "`n═══════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "VERIFICACIÓN ESPERADA:" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════`n" -ForegroundColor Cyan

Write-Host "✅ SSPR17CRM365-01 → 10/19/2025 01:59 (Success) True" -ForegroundColor Green
Write-Host "✅ SSPR17CRM365-51 → 10/19/2025 01:59 (Success) True" -ForegroundColor Green
Write-Host "   (Tomó el resultado del nodo -01 porque -51 no tiene historial)" -ForegroundColor Gray

Write-Host "`nSi ves fechas diferentes o status False, ejecuta nuevamente:" -ForegroundColor Yellow
Write-Host "  .\Test-Maintenance-Fix.ps1" -ForegroundColor Cyan

