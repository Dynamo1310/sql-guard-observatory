# Script de Despliegue con Windows Authentication
# SQL Guard Observatory - Banco Supervielle

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  SQL Guard Observatory" -ForegroundColor Cyan
Write-Host "  Despliegue con Windows Authentication" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Variables de configuración
$BackendPath = ".\SQLGuardObservatory.API"
$FrontendPath = "."
$ServerBackendPath = "\\asprbm-nov-01\c$\inetpub\sqlguard-api"
$ServerFrontendPath = "\\asprbm-nov-01\c$\inetpub\sqlguard-frontend"
$IISBackendSiteName = "SQLGuardObservatoryAPI"
$IISFrontendSiteName = "SQLGuardObservatoryFrontend"

# Función para verificar si el script se ejecuta como administrador
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Función para compilar el backend
function Build-Backend {
    Write-Host "[1/6] Compilando Backend..." -ForegroundColor Yellow
    
    Push-Location $BackendPath
    
    try {
        # Limpiar compilaciones anteriores
        if (Test-Path ".\bin\Release") {
            Remove-Item ".\bin\Release" -Recurse -Force
        }
        
        # Compilar en modo Release
        dotnet publish -c Release --no-self-contained
        
        if ($LASTEXITCODE -ne 0) {
            throw "Error al compilar el backend"
        }
        
        Write-Host "  ✓ Backend compilado exitosamente" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Error al compilar backend: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
}

# Función para compilar el frontend
function Build-Frontend {
    Write-Host "[2/6] Compilando Frontend..." -ForegroundColor Yellow
    
    Push-Location $FrontendPath
    
    try {
        # Limpiar compilaciones anteriores
        if (Test-Path ".\dist") {
            Remove-Item ".\dist" -Recurse -Force
        }
        
        # Compilar con npm
        npm run build
        
        if ($LASTEXITCODE -ne 0) {
            throw "Error al compilar el frontend"
        }
        
        Write-Host "  ✓ Frontend compilado exitosamente" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Error al compilar frontend: $_" -ForegroundColor Red
        Pop-Location
        exit 1
    }
    
    Pop-Location
}

# Función para detener sitios IIS en el servidor
function Stop-IISSites {
    Write-Host "[3/6] Deteniendo sitios IIS..." -ForegroundColor Yellow
    
    try {
        # Detener el backend
        Invoke-Command -ComputerName asprbm-nov-01 -ScriptBlock {
            param($siteName)
            Import-Module WebAdministration
            if (Test-Path "IIS:\Sites\$siteName") {
                Stop-Website -Name $siteName
                Write-Host "  ✓ Sitio $siteName detenido" -ForegroundColor Green
            }
        } -ArgumentList $IISBackendSiteName
        
        # Detener el frontend
        Invoke-Command -ComputerName asprbm-nov-01 -ScriptBlock {
            param($siteName)
            Import-Module WebAdministration
            if (Test-Path "IIS:\Sites\$siteName") {
                Stop-Website -Name $siteName
                Write-Host "  ✓ Sitio $siteName detenido" -ForegroundColor Green
            }
        } -ArgumentList $IISFrontendSiteName
        
        # Esperar a que los procesos se detengan
        Start-Sleep -Seconds 3
    }
    catch {
        Write-Host "  ⚠ Advertencia: No se pudieron detener los sitios: $_" -ForegroundColor Yellow
    }
}

# Función para copiar archivos al servidor
function Copy-Files {
    Write-Host "[4/6] Copiando archivos al servidor..." -ForegroundColor Yellow
    
    try {
        # Copiar backend
        Write-Host "  Copiando backend..." -ForegroundColor Gray
        $backendSource = Join-Path $BackendPath "bin\Release\net8.0\publish\*"
        
        if (Test-Path $ServerBackendPath) {
            Remove-Item "$ServerBackendPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        }
        else {
            New-Item -Path $ServerBackendPath -ItemType Directory -Force | Out-Null
        }
        
        Copy-Item -Path $backendSource -Destination $ServerBackendPath -Recurse -Force
        Write-Host "    ✓ Backend copiado" -ForegroundColor Green
        
        # Copiar frontend
        Write-Host "  Copiando frontend..." -ForegroundColor Gray
        $frontendSource = Join-Path $FrontendPath "dist\*"
        
        if (Test-Path $ServerFrontendPath) {
            Remove-Item "$ServerFrontendPath\*" -Recurse -Force -ErrorAction SilentlyContinue
        }
        else {
            New-Item -Path $ServerFrontendPath -ItemType Directory -Force | Out-Null
        }
        
        Copy-Item -Path $frontendSource -Destination $ServerFrontendPath -Recurse -Force
        Write-Host "    ✓ Frontend copiado" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Error al copiar archivos: $_" -ForegroundColor Red
        exit 1
    }
}

# Función para configurar Windows Authentication en IIS
function Configure-WindowsAuth {
    Write-Host "[5/6] Configurando Windows Authentication en IIS..." -ForegroundColor Yellow
    
    try {
        Invoke-Command -ComputerName asprbm-nov-01 -ScriptBlock {
            param($siteName)
            Import-Module WebAdministration
            
            # Habilitar Windows Authentication
            Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/windowsAuthentication" `
                -Name "enabled" -Value $true -PSPath "IIS:\" -Location $siteName
            
            # Habilitar Anonymous Authentication
            Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/anonymousAuthentication" `
                -Name "enabled" -Value $true -PSPath "IIS:\" -Location $siteName
            
            # Configurar proveedores de Windows Auth (Negotiate y NTLM)
            Clear-WebConfiguration -Filter "/system.webServer/security/authentication/windowsAuthentication/providers" `
                -PSPath "IIS:\" -Location $siteName
            
            Add-WebConfiguration -Filter "/system.webServer/security/authentication/windowsAuthentication/providers" `
                -Value @{value='Negotiate'} -PSPath "IIS:\" -Location $siteName
            
            Add-WebConfiguration -Filter "/system.webServer/security/authentication/windowsAuthentication/providers" `
                -Value @{value='NTLM'} -PSPath "IIS:\" -Location $siteName
            
            Write-Host "  ✓ Windows Authentication configurado para $siteName" -ForegroundColor Green
        } -ArgumentList $IISBackendSiteName
    }
    catch {
        Write-Host "  ⚠ Advertencia: No se pudo configurar Windows Auth automáticamente: $_" -ForegroundColor Yellow
        Write-Host "  Por favor, configura manualmente Windows Authentication en IIS" -ForegroundColor Yellow
    }
}

# Función para iniciar sitios IIS
function Start-IISSites {
    Write-Host "[6/6] Iniciando sitios IIS..." -ForegroundColor Yellow
    
    try {
        # Iniciar el backend
        Invoke-Command -ComputerName asprbm-nov-01 -ScriptBlock {
            param($siteName)
            Import-Module WebAdministration
            if (Test-Path "IIS:\Sites\$siteName") {
                Start-Website -Name $siteName
                Write-Host "  ✓ Sitio $siteName iniciado" -ForegroundColor Green
            }
        } -ArgumentList $IISBackendSiteName
        
        # Iniciar el frontend
        Invoke-Command -ComputerName asprbm-nov-01 -ScriptBlock {
            param($siteName)
            Import-Module WebAdministration
            if (Test-Path "IIS:\Sites\$siteName") {
                Start-Website -Name $siteName
                Write-Host "  ✓ Sitio $siteName iniciado" -ForegroundColor Green
            }
        } -ArgumentList $IISFrontendSiteName
        
        Start-Sleep -Seconds 2
    }
    catch {
        Write-Host "  ✗ Error al iniciar sitios: $_" -ForegroundColor Red
        exit 1
    }
}

# Función para verificar el despliegue
function Test-Deployment {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  Verificando Despliegue" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    # Verificar backend
    Write-Host ""
    Write-Host "Verificando Backend (Windows Auth)..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://asprbm-nov-01:5000/api/auth/windows-login" `
            -UseDefaultCredentials -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✓ Backend respondiendo correctamente" -ForegroundColor Green
            Write-Host "  ✓ Windows Authentication funcionando" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ⚠ Advertencia: El backend no está respondiendo o necesita configuración adicional" -ForegroundColor Yellow
        Write-Host "    URL: http://asprbm-nov-01:5000/api/auth/windows-login" -ForegroundColor Gray
    }
    
    # Verificar frontend
    Write-Host ""
    Write-Host "Verificando Frontend..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://asprbm-nov-01:8080" -UseBasicParsing
        
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✓ Frontend respondiendo correctamente" -ForegroundColor Green
        }
    }
    catch {
        Write-Host "  ⚠ Advertencia: El frontend no está respondiendo" -ForegroundColor Yellow
        Write-Host "    URL: http://asprbm-nov-01:8080" -ForegroundColor Gray
    }
}

# Función principal
function Main {
    Write-Host "Iniciando despliegue con Windows Authentication..." -ForegroundColor White
    Write-Host ""
    
    # Verificar que estamos en el directorio correcto
    if (-not (Test-Path $BackendPath)) {
        Write-Host "✗ Error: No se encuentra la carpeta del backend" -ForegroundColor Red
        exit 1
    }
    
    if (-not (Test-Path "package.json")) {
        Write-Host "✗ Error: No se encuentra package.json del frontend" -ForegroundColor Red
        exit 1
    }
    
    # Ejecutar pasos del despliegue
    Build-Backend
    Build-Frontend
    Stop-IISSites
    Copy-Files
    Configure-WindowsAuth
    Start-IISSites
    Test-Deployment
    
    # Resumen
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✓ Despliegue Completado" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "URLs de la aplicación:" -ForegroundColor White
    Write-Host "  Backend:  http://asprbm-nov-01:5000" -ForegroundColor Cyan
    Write-Host "  Frontend: http://asprbm-nov-01:8080" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Usuario SuperAdmin por defecto:" -ForegroundColor White
    Write-Host "  Usuario: GSCORP\TB03260" -ForegroundColor Cyan
    Write-Host "  Rol: SuperAdmin" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Siguiente paso:" -ForegroundColor Yellow
    Write-Host "  1. Verifica que Windows Authentication esté habilitado en IIS" -ForegroundColor White
    Write-Host "  2. Accede a http://asprbm-nov-01:8080" -ForegroundColor White
    Write-Host "  3. La autenticación debería ser automática" -ForegroundColor White
    Write-Host "  4. Agrega usuarios a la lista blanca en Administración > Usuarios" -ForegroundColor White
    Write-Host ""
    Write-Host "Documentación:" -ForegroundColor Yellow
    Write-Host "  Ver WINDOWS_AUTHENTICATION_GUIA.md para más detalles" -ForegroundColor White
    Write-Host ""
}

# Ejecutar script
Main

