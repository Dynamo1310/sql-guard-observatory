# Script de Despliegue Automatizado - Frontend SQL Guard Observatory
# Requiere ejecutarse como Administrador

param(
    [string]$InstallPath = "C:\Apps\SQLGuardObservatory",
    [string]$ServiceName = "SQLGuardObservatoryFrontend",
    [string]$Port = "3000",
    [string]$ApiUrl = "http://localhost:5000",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Verificar que se ejecuta como administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Este script debe ejecutarse como Administrador"
    exit 1
}

Write-Host "=== Despliegue del Frontend SQL Guard Observatory ===" -ForegroundColor Cyan

if ($Uninstall) {
    Write-Host "Desinstalando servicio $ServiceName..." -ForegroundColor Yellow
    
    # Detener el servicio
    try {
        nssm stop $ServiceName
        Start-Sleep -Seconds 2
    } catch {
        Write-Host "El servicio no estaba corriendo" -ForegroundColor Yellow
    }
    
    # Eliminar el servicio
    nssm remove $ServiceName confirm
    
    Write-Host "Servicio desinstalado correctamente" -ForegroundColor Green
    exit 0
}

# Verificar que NSSM está instalado
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) {
    Write-Error "NSSM no está instalado. Descargar desde https://nssm.cc/download"
    exit 1
}

# Verificar que Node.js está instalado
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js no está instalado. Descargar desde https://nodejs.org/"
    exit 1
}

# Verificar que http-server está instalado
if (-not (Get-Command http-server -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando http-server globalmente..." -ForegroundColor Yellow
    npm install -g http-server
}

# Crear directorios
$FrontendPath = Join-Path $InstallPath "Frontend"
Write-Host "Creando directorio de instalación: $FrontendPath" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $FrontendPath | Out-Null

# Crear archivo .env.production
$envContent = "VITE_API_URL=$ApiUrl"
$envPath = Join-Path $PSScriptRoot ".env.production"
Set-Content -Path $envPath -Value $envContent
Write-Host "Archivo .env.production creado con API_URL=$ApiUrl" -ForegroundColor Green

# Compilar el frontend
Write-Host "Instalando dependencias del frontend..." -ForegroundColor Green
Push-Location $PSScriptRoot
try {
    npm install
    if ($LASTEXITCODE -ne 0) {
        throw "Error al instalar dependencias"
    }
    
    Write-Host "Compilando el frontend..." -ForegroundColor Green
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "Error al compilar el frontend"
    }
} finally {
    Pop-Location
}

Write-Host "Frontend compilado exitosamente" -ForegroundColor Green

# Copiar archivos compilados
Write-Host "Copiando archivos al directorio de instalación..." -ForegroundColor Green
$DistPath = Join-Path $PSScriptRoot "dist"
if (Test-Path $DistPath) {
    Copy-Item -Path "$DistPath\*" -Destination $FrontendPath -Recurse -Force
} else {
    Write-Error "No se encontró el directorio dist. La compilación puede haber fallado."
    exit 1
}

# Detener el servicio si existe
$existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existingService) {
    Write-Host "Deteniendo servicio existente..." -ForegroundColor Yellow
    nssm stop $ServiceName
    Start-Sleep -Seconds 3
    nssm remove $ServiceName confirm
    Start-Sleep -Seconds 2
}

# Instalar el servicio con NSSM
Write-Host "Instalando el servicio de Windows..." -ForegroundColor Green

# Encontrar la ruta de node.exe
$nodePath = (Get-Command node).Source
$httpServerPath = (Get-Command http-server).Source

nssm install $ServiceName $nodePath
nssm set $ServiceName AppParameters "`"$httpServerPath`" `"$FrontendPath`" -p $Port --cors"
nssm set $ServiceName AppDirectory $FrontendPath
nssm set $ServiceName DisplayName "SQL Guard Observatory Frontend"
nssm set $ServiceName Description "Frontend web para SQL Guard Observatory - Monitoreo de SQL Server"
nssm set $ServiceName Start SERVICE_AUTO_START

# Configurar logs
$LogPath = Join-Path $FrontendPath "logs"
New-Item -ItemType Directory -Force -Path $LogPath | Out-Null
nssm set $ServiceName AppStdout (Join-Path $LogPath "output.log")
nssm set $ServiceName AppStderr (Join-Path $LogPath "error.log")

Write-Host "Servicio instalado correctamente" -ForegroundColor Green

# Configurar firewall
Write-Host "Configurando regla de firewall..." -ForegroundColor Green
$firewallRuleName = "SQL Guard Observatory Frontend"
$existingRule = Get-NetFirewallRule -DisplayName $firewallRuleName -ErrorAction SilentlyContinue
if ($existingRule) {
    Remove-NetFirewallRule -DisplayName $firewallRuleName
}
New-NetFirewallRule -DisplayName $firewallRuleName -Direction Inbound -LocalPort $Port -Protocol TCP -Action Allow | Out-Null

Write-Host "Regla de firewall configurada" -ForegroundColor Green

# Iniciar el servicio
Write-Host "Iniciando el servicio..." -ForegroundColor Green
nssm start $ServiceName

# Esperar a que el servicio inicie
Start-Sleep -Seconds 5

# Verificar el estado
$serviceStatus = Get-Service -Name $ServiceName
if ($serviceStatus.Status -eq "Running") {
    Write-Host "`n=== DESPLIEGUE COMPLETADO EXITOSAMENTE ===" -ForegroundColor Green
    Write-Host "Servicio: $ServiceName" -ForegroundColor Cyan
    Write-Host "Estado: Running" -ForegroundColor Green
    Write-Host "Puerto: $Port" -ForegroundColor Cyan
    Write-Host "Ruta: $FrontendPath" -ForegroundColor Cyan
    Write-Host "`nAcceder a la aplicación en:" -ForegroundColor Yellow
    Write-Host "  http://localhost:$Port" -ForegroundColor White
    Write-Host "`nCredenciales por defecto:" -ForegroundColor Yellow
    Write-Host "  Usuario: TB03260" -ForegroundColor White
    Write-Host "  Contraseña: Admin123! (¡CAMBIAR INMEDIATAMENTE!)" -ForegroundColor Red
} else {
    Write-Warning "El servicio no está corriendo. Revisar logs en: $LogPath"
    Write-Host "Para ver logs: Get-Content '$LogPath\error.log' -Tail 50" -ForegroundColor Cyan
}

Write-Host "`nPara administrar el servicio:" -ForegroundColor Cyan
Write-Host "  Detener:   nssm stop $ServiceName" -ForegroundColor White
Write-Host "  Iniciar:   nssm start $ServiceName" -ForegroundColor White
Write-Host "  Reiniciar: nssm restart $ServiceName" -ForegroundColor White
Write-Host "  Estado:    Get-Service $ServiceName" -ForegroundColor White
Write-Host "  Logs:      Get-Content '$LogPath\error.log' -Tail 50" -ForegroundColor White

