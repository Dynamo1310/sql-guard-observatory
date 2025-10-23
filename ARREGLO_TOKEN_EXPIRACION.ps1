# ================================================================
# Script para arreglar expiración de tokens JWT
# Cambios: 8 horas → 2 horas con validación estricta
# ================================================================

Write-Host "================================" -ForegroundColor Cyan
Write-Host "ARREGLO: Expiración de Tokens" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Cambios realizados:" -ForegroundColor Yellow
Write-Host "  1. Token expira en 2 horas (antes: 8 horas)" -ForegroundColor White
Write-Host "  2. ClockSkew = 0 (sin tolerancia adicional)" -ForegroundColor White
Write-Host "  3. Interceptor frontend → cierra sesión automática en 401" -ForegroundColor White
Write-Host ""

# Paso 1: Compilar Backend
Write-Host "[1/2] Compilando Backend..." -ForegroundColor Yellow
Set-Location -Path "SQLGuardObservatory.API"

try {
    dotnet publish -c Release -o C:\Temp\Backend
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Backend compilado correctamente" -ForegroundColor Green
    } else {
        throw "Error en compilación"
    }
} catch {
    Write-Host "✗ Error al compilar backend" -ForegroundColor Red
    Set-Location -Path ".."
    exit 1
}

Set-Location -Path ".."
Write-Host ""

# Paso 2: Compilar Frontend
Write-Host "[2/2] Compilando Frontend..." -ForegroundColor Yellow

try {
    npm run build
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Frontend compilado correctamente" -ForegroundColor Green
    } else {
        throw "Error en compilación"
    }
} catch {
    Write-Host "✗ Error al compilar frontend" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✓ COMPLETADO" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos pasos:" -ForegroundColor Yellow
Write-Host "  1. Despliega el backend: copy C:\Temp\Backend\* al servidor IIS" -ForegroundColor White
Write-Host "  2. Despliega el frontend: copy dist\* al servidor IIS" -ForegroundColor White
Write-Host "  3. Reinicia IIS o el Application Pool" -ForegroundColor White
Write-Host "  4. IMPORTANTE: Todos los usuarios deben cerrar sesión y volver a iniciar" -ForegroundColor Red
Write-Host ""
Write-Host "Resultado esperado:" -ForegroundColor Yellow
Write-Host "  ✓ Sesiones expiran cada 2 horas exactas" -ForegroundColor White
Write-Host "  ✓ Tokens expirados = cierre de sesión automático" -ForegroundColor White
Write-Host "  ✓ Cambios de roles visibles en máximo 2 horas" -ForegroundColor White
Write-Host ""

