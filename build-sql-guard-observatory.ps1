param(
    # Carpeta raíz donde se dejarán los artefactos compilados
    [string]$OutputRoot = "C:\Temp"
)

# =========================
# CONFIGURACIÓN DE RUTAS
# =========================

# Ruta raíz del repo
$solutionRoot  = "C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory"

# Backend (.NET)
$backendProj   = Join-Path $solutionRoot "SQLGuardObservatory.API\SQLGuardObservatory.API.csproj"
$backendOut    = Join-Path $OutputRoot "Backend"

# Frontend (Vite + React estático)
$frontendRoot  = $solutionRoot
$frontendOut   = Join-Path $OutputRoot "Frontend-Compilado"

Write-Host "====================================="
Write-Host "   SQL Guard Observatory - BUILD"
Write-Host "====================================="
Write-Host ""
Write-Host "Solution root : $solutionRoot"
Write-Host "Output root   : $OutputRoot"
Write-Host ""

$initialLocation = Get-Location

# =========================
# COMPILAR BACKEND (.NET)
# =========================

Write-Host ">>> [Backend] Verificando proyecto .csproj..."
if (-not (Test-Path $backendProj)) {
    Write-Host "ERROR: No se encontró el proyecto:" -ForegroundColor Red
    Write-Host "       $backendProj" -ForegroundColor Red
    exit 1
}

Write-Host ">>> [Backend] Creando carpeta destino: $backendOut"
New-Item -ItemType Directory -Force -Path $backendOut | Out-Null

Write-Host ">>> [Backend] Publicando en modo Release..."
dotnet publish $backendProj -c Release -o $backendOut
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Falló 'dotnet publish' del backend." -ForegroundColor Red
    exit 1
}

Write-Host ">>> [Backend] Publicación completada en: $backendOut"
Write-Host ""

# =========================
# COMPILAR FRONTEND (Vite estático)
# =========================

Write-Host ">>> [Frontend] Preparando build estático (Vite)..."
Set-Location $frontendRoot

# Instalar dependencias solo si no existe node_modules
if (-not (Test-Path (Join-Path $frontendRoot "node_modules"))) {
    Write-Host ">>> [Frontend] node_modules no existe. Ejecutando 'npm install'..."
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: Falló 'npm install'." -ForegroundColor Red
        Set-Location $initialLocation
        exit 1
    }
} else {
    Write-Host ">>> [Frontend] node_modules ya existe. Omitiendo 'npm install'."
}

Write-Host ">>> [Frontend] Ejecutando 'npm run build'..."
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Falló 'npm run build'." -ForegroundColor Red
    Set-Location $initialLocation
    exit 1
}

# En Vite el resultado queda en 'dist'
$distFolder = Join-Path $frontendRoot "dist"
if (-not (Test-Path $distFolder)) {
    Write-Host "ERROR: No se generó la carpeta 'dist'. Revisa tu configuración de build." -ForegroundColor Red
    Set-Location $initialLocation
    exit 1
}

Write-Host ">>> [Frontend] Creando carpeta destino: $frontendOut"
New-Item -ItemType Directory -Force -Path $frontendOut | Out-Null

Write-Host ">>> [Frontend] Copiando el contenido de 'dist' a la carpeta compilada..."
robocopy $distFolder $frontendOut /E | Out-Null

Set-Location $initialLocation

Write-Host ""
Write-Host "====================================="
Write-Host "   BUILD COMPLETADO CORRECTAMENTE"
Write-Host "   Backend  : $backendOut"
Write-Host "   Frontend : $frontendOut (sitio estático Vite)"
Write-Host "====================================="
