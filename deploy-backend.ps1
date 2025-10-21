# Script de Despliegue Automatizado - Backend SQL Guard Observatory
# Requiere ejecutarse como Administrador

param(
    [string]$InstallPath = "C:\Apps\SQLGuardObservatory",
    [string]$ServiceName = "SQLGuardObservatoryAPI",
    [string]$Port = "5000",
    [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Verificar que se ejecuta como administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "Este script debe ejecutarse como Administrador"
    exit 1
}

Write-Host "=== Despliegue del Backend SQL Guard Observatory ===" -ForegroundColor Cyan

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

# Verificar que .NET 8 está instalado
$dotnetVersion = dotnet --list-runtimes | Select-String "Microsoft.AspNetCore.App 8"
if (-not $dotnetVersion) {
    Write-Error ".NET 8 Runtime no está instalado. Descargar desde https://dotnet.microsoft.com/download/dotnet/8.0"
    exit 1
}

# Crear directorios
$BackendPath = Join-Path $InstallPath "Backend"
Write-Host "Creando directorio de instalación: $BackendPath" -ForegroundColor Green
New-Item -ItemType Directory -Force -Path $BackendPath | Out-Null

# Compilar y publicar el backend
Write-Host "Compilando el backend..." -ForegroundColor Green
$ProjectPath = Join-Path $PSScriptRoot "SQLGuardObservatory.API"

if (-not (Test-Path $ProjectPath)) {
    Write-Error "No se encontró el proyecto en: $ProjectPath"
    exit 1
}

Push-Location $ProjectPath
try {
    dotnet publish -c Release -o $BackendPath
    if ($LASTEXITCODE -ne 0) {
        throw "Error al compilar el proyecto"
    }
} finally {
    Pop-Location
}

Write-Host "Backend compilado exitosamente" -ForegroundColor Green

# Copiar scripts SQL
Write-Host "Copiando scripts SQL..." -ForegroundColor Green
$SqlSourcePath = Join-Path $ProjectPath "SQL"
$SqlDestPath = Join-Path $BackendPath "SQL"

if (Test-Path $SqlSourcePath) {
    New-Item -ItemType Directory -Force -Path $SqlDestPath | Out-Null
    Copy-Item -Path "$SqlSourcePath\*" -Destination $SqlDestPath -Recurse -Force
    Write-Host "Scripts SQL copiados a: $SqlDestPath" -ForegroundColor Green
} else {
    Write-Host "No se encontraron scripts SQL para copiar" -ForegroundColor Yellow
}

# Configurar appsettings.json
$appsettingsPath = Join-Path $BackendPath "appsettings.json"
if (-not (Test-Path $appsettingsPath)) {
    Write-Warning "No se encontró appsettings.json. Asegúrate de configurarlo manualmente."
} else {
    Write-Host "Archivo de configuración encontrado en: $appsettingsPath" -ForegroundColor Green
    Write-Host "IMPORTANTE: Revisar y actualizar la cadena de conexión y JWT SecretKey" -ForegroundColor Yellow
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
$ExePath = Join-Path $BackendPath "SQLGuardObservatory.API.exe"

if (-not (Test-Path $ExePath)) {
    Write-Error "No se encontró el ejecutable: $ExePath"
    exit 1
}

nssm install $ServiceName $ExePath
nssm set $ServiceName AppDirectory $BackendPath
nssm set $ServiceName DisplayName "SQL Guard Observatory API"
nssm set $ServiceName Description "Backend API para SQL Guard Observatory - Monitoreo de SQL Server"
nssm set $ServiceName Start SERVICE_AUTO_START

# Configurar logs
$LogPath = Join-Path $BackendPath "logs"
New-Item -ItemType Directory -Force -Path $LogPath | Out-Null
nssm set $ServiceName AppStdout (Join-Path $LogPath "output.log")
nssm set $ServiceName AppStderr (Join-Path $LogPath "error.log")

# Configurar variables de entorno
nssm set $ServiceName AppEnvironmentExtra "ASPNETCORE_ENVIRONMENT=Production"
nssm set $ServiceName AppEnvironmentExtra "ASPNETCORE_URLS=http://localhost:$Port"

Write-Host "Servicio instalado correctamente" -ForegroundColor Green

# Configurar firewall
Write-Host "Configurando regla de firewall..." -ForegroundColor Green
$firewallRuleName = "SQL Guard Observatory API"
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
    Write-Host "Ruta: $BackendPath" -ForegroundColor Cyan
    Write-Host "`nPróximos pasos:" -ForegroundColor Yellow
    Write-Host "1. IMPORTANTE: Aplicar la migración de la base de datos:" -ForegroundColor White
    Write-Host "   Ejecutar: cd '$BackendPath\SQL' y luego .\Apply-RolePermissionsMigration.ps1" -ForegroundColor Cyan
    Write-Host "2. Revisar y actualizar la configuración en: $appsettingsPath" -ForegroundColor White
    Write-Host "3. Cambiar JWT SecretKey por una clave segura" -ForegroundColor White
    Write-Host "4. Verificar las cadenas de conexión a SQL Server" -ForegroundColor White
    Write-Host "5. Cambiar la contraseña del usuario admin TB03260 (contraseña inicial: Admin123!)" -ForegroundColor White
    Write-Host "6. Probar el API en: http://localhost:$Port/swagger" -ForegroundColor White
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

