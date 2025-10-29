# =====================================================
# Script para reiniciar el backend con los cambios
# de los endpoints de tendencias
# =====================================================

Write-Host "🔄 Reiniciando Backend con correcciones de endpoints..." -ForegroundColor Cyan
Write-Host ""

# 1. Detener el backend si está corriendo
Write-Host "1️⃣ Deteniendo servicios del backend..." -ForegroundColor Yellow
Stop-Process -Name "SQLGuardObservatory.API" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# 2. Compilar el backend
Write-Host ""
Write-Host "2️⃣ Compilando backend con correcciones..." -ForegroundColor Yellow
Set-Location -Path "SQLGuardObservatory.API"
dotnet build --configuration Release

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error compilando el backend" -ForegroundColor Red
    Set-Location ..
    exit 1
}

Write-Host "✅ Backend compilado correctamente" -ForegroundColor Green

# 3. Iniciar el backend
Write-Host ""
Write-Host "3️⃣ Iniciando backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; dotnet run --configuration Release"

Set-Location ..

Write-Host ""
Write-Host "✅ Backend reiniciado!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Los endpoints corregidos son:" -ForegroundColor Cyan
Write-Host "   - /api/HealthScoreTrends/healthscore/{instance}" -ForegroundColor White
Write-Host "   - /api/HealthScoreTrends/cpu/{instance}" -ForegroundColor White
Write-Host "   - /api/HealthScoreTrends/memory/{instance}" -ForegroundColor White
Write-Host "   - /api/HealthScoreTrends/io/{instance}" -ForegroundColor White
Write-Host "   - /api/HealthScoreTrends/disk/{instance}" -ForegroundColor White
Write-Host ""
Write-Host "🌐 Ahora recarga la página web (Ctrl+F5) para ver los cambios" -ForegroundColor Yellow
Write-Host ""

