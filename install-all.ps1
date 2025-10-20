# Script de Instalación Completa - SQL Guard Observatory
# Este script instala TANTO backend COMO frontend en un solo paso
# Requiere ejecutarse como Administrador

param(
    [string]$InstallPath = "C:\Apps\SQLGuardObservatory",
    [string]$BackendPort = "5000",
    [string]$FrontendPort = "3000",
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Colores
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Write-Success($message) { Write-Host "✓ $message" -ForegroundColor Green }
function Write-Info($message) { Write-Host "ℹ $message" -ForegroundColor Cyan }
function Write-Warning2($message) { Write-Host "⚠ $message" -ForegroundColor Yellow }
function Write-Error2($message) { Write-Host "✗ $message" -ForegroundColor Red }

# Verificar que se ejecuta como administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error2 "Este script debe ejecutarse como Administrador"
    exit 1
}

Write-Info "════════════════════════════════════════════════════════════"
Write-Info "   SQL Guard Observatory - Instalación Completa"
Write-Info "════════════════════════════════════════════════════════════"
Write-Host ""

if ($Uninstall) {
    Write-Warning2 "Desinstalando SQL Guard Observatory..."
    Write-Host ""
    
    # Desinstalar servicios
    $services = @("SQLGuardObservatoryAPI", "SQLGuardObservatoryFrontend")
    foreach ($svc in $services) {
        try {
            Write-Info "Deteniendo servicio $svc..."
            nssm stop $svc 2>$null
            Start-Sleep -Seconds 2
            
            Write-Info "Eliminando servicio $svc..."
            nssm remove $svc confirm 2>$null
            Write-Success "Servicio $svc eliminado"
        } catch {
            Write-Warning2 "El servicio $svc no existía o ya fue eliminado"
        }
    }
    
    Write-Host ""
    Write-Success "Desinstalación completada"
    Write-Info "Los archivos en $InstallPath no fueron eliminados. Puedes eliminarlos manualmente si lo deseas."
    exit 0
}

# Pre-requisitos
Write-Info "Verificando pre-requisitos..."
Write-Host ""

# Verificar NSSM
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Error2 "NSSM no está instalado"
    Write-Info "Descargar desde: https://nssm.cc/download"
    Write-Info "Extraer nssm.exe a C:\Windows\System32 o agregarlo al PATH"
    exit 1
}
Write-Success "NSSM instalado"

# Verificar .NET 8
$dotnetVersion = dotnet --list-runtimes 2>$null | Select-String "Microsoft.AspNetCore.App 8"
if (-not $dotnetVersion) {
    Write-Error2 ".NET 8 Runtime no está instalado"
    Write-Info "Descargar desde: https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}
Write-Success ".NET 8 instalado"

# Verificar Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error2 "Node.js no está instalado"
    Write-Info "Descargar desde: https://nodejs.org/"
    exit 1
}
Write-Success "Node.js instalado"

Write-Host ""
Write-Info "═══════════════════════════════════════════════════════════"
Write-Info "   Configuración"
Write-Info "═══════════════════════════════════════════════════════════"
Write-Host "Directorio de instalación: $InstallPath" -ForegroundColor White
Write-Host "Puerto Backend:            $BackendPort" -ForegroundColor White
Write-Host "Puerto Frontend:           $FrontendPort" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "¿Continuar con la instalación? (S/N)"
if ($confirm -ne 'S' -and $confirm -ne 's') {
    Write-Warning2 "Instalación cancelada"
    exit 0
}

Write-Host ""

# ==================== BACKEND ====================
if (-not $SkipBackend) {
    Write-Info "═══════════════════════════════════════════════════════════"
    Write-Info "   Instalando Backend"
    Write-Info "═══════════════════════════════════════════════════════════"
    Write-Host ""
    
    try {
        & "$PSScriptRoot\deploy-backend.ps1" -InstallPath $InstallPath -Port $BackendPort
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Backend instalado correctamente"
        } else {
            Write-Warning2 "Hubo problemas al instalar el backend. Revisar logs."
        }
    } catch {
        Write-Error2 "Error al instalar backend: $_"
        Write-Warning2 "Continuando con el frontend..."
    }
    
    Write-Host ""
}

# ==================== FRONTEND ====================
if (-not $SkipFrontend) {
    Write-Info "═══════════════════════════════════════════════════════════"
    Write-Info "   Instalando Frontend"
    Write-Info "═══════════════════════════════════════════════════════════"
    Write-Host ""
    
    try {
        & "$PSScriptRoot\deploy-frontend.ps1" -InstallPath $InstallPath -Port $FrontendPort -ApiUrl "http://localhost:$BackendPort"
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Frontend instalado correctamente"
        } else {
            Write-Warning2 "Hubo problemas al instalar el frontend. Revisar logs."
        }
    } catch {
        Write-Error2 "Error al instalar frontend: $_"
    }
    
    Write-Host ""
}

# ==================== RESUMEN ====================
Write-Host ""
Write-Info "═══════════════════════════════════════════════════════════"
Write-Info "   ¡INSTALACIÓN COMPLETADA!"
Write-Info "═══════════════════════════════════════════════════════════"
Write-Host ""

# Verificar estado de servicios
$backendStatus = Get-Service -Name "SQLGuardObservatoryAPI" -ErrorAction SilentlyContinue
$frontendStatus = Get-Service -Name "SQLGuardObservatoryFrontend" -ErrorAction SilentlyContinue

Write-Host "Estado de los Servicios:" -ForegroundColor Cyan
Write-Host "  Backend:  " -NoNewline
if ($backendStatus -and $backendStatus.Status -eq "Running") {
    Write-Host "✓ Corriendo" -ForegroundColor Green
} else {
    Write-Host "✗ Detenido o con problemas" -ForegroundColor Red
}

Write-Host "  Frontend: " -NoNewline
if ($frontendStatus -and $frontendStatus.Status -eq "Running") {
    Write-Host "✓ Corriendo" -ForegroundColor Green
} else {
    Write-Host "✗ Detenido o con problemas" -ForegroundColor Red
}

Write-Host ""
Write-Host "Acceso a la Aplicación:" -ForegroundColor Cyan
Write-Host "  Frontend:  http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  Backend:   http://localhost:$BackendPort/swagger" -ForegroundColor White

Write-Host ""
Write-Host "Credenciales por Defecto:" -ForegroundColor Cyan
Write-Host "  Usuario:   TB03260" -ForegroundColor White
Write-Host "  Contraseña: Admin123!" -ForegroundColor Yellow

Write-Host ""
Write-Host "⚠ IMPORTANTE - TAREAS PENDIENTES:" -ForegroundColor Yellow
Write-Host "  1. Cambiar la contraseña del usuario TB03260" -ForegroundColor White
Write-Host "  2. Editar appsettings.json y cambiar JwtSettings.SecretKey" -ForegroundColor White
Write-Host "  3. Verificar las cadenas de conexión a SQL Server" -ForegroundColor White
Write-Host "  4. Agregar usuarios autorizados en la sección de Administración" -ForegroundColor White

Write-Host ""
Write-Host "Archivos de Configuración:" -ForegroundColor Cyan
Write-Host "  Backend:  $InstallPath\Backend\appsettings.json" -ForegroundColor White
Write-Host "  Logs:     $InstallPath\Backend\logs\" -ForegroundColor White
Write-Host "  Logs:     $InstallPath\Frontend\logs\" -ForegroundColor White

Write-Host ""
Write-Host "Comandos Útiles:" -ForegroundColor Cyan
Write-Host "  Reiniciar backend:   " -NoNewline; Write-Host "nssm restart SQLGuardObservatoryAPI" -ForegroundColor White
Write-Host "  Reiniciar frontend:  " -NoNewline; Write-Host "nssm restart SQLGuardObservatoryFrontend" -ForegroundColor White
Write-Host "  Ver logs backend:    " -NoNewline; Write-Host "Get-Content '$InstallPath\Backend\logs\error.log' -Tail 50" -ForegroundColor White
Write-Host "  Ver logs frontend:   " -NoNewline; Write-Host "Get-Content '$InstallPath\Frontend\logs\error.log' -Tail 50" -ForegroundColor White

Write-Host ""
Write-Host "Documentación:" -ForegroundColor Cyan
Write-Host "  Ver QUICKSTART.md para desarrollo local" -ForegroundColor White
Write-Host "  Ver DEPLOYMENT.md para más detalles de despliegue" -ForegroundColor White
Write-Host "  Ver ARQUITECTURA.md para entender la arquitectura" -ForegroundColor White

Write-Host ""
Write-Success "¡Instalación completada! Abre tu navegador en http://localhost:$FrontendPort"
Write-Host ""

