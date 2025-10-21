# Script Rápido para Desplegar los Cambios del Error 403
# Ejecutar desde: sql-guard-observatory\

param(
    [string]$ServerPath = "C:\Apps\SQLGuardObservatory\Backend",
    [string]$ServiceName = "SQLGuardObservatory.API"
)

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Desplegando Arreglos de Errores 403" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Arreglos incluidos:" -ForegroundColor Yellow
Write-Host "  1. Política AdminOnly (Admin + SuperAdmin)" -ForegroundColor White
Write-Host "  2. Endpoint my-permissions (todos los usuarios)" -ForegroundColor White
Write-Host ""

# Verificar que estamos en el directorio correcto
if (-not (Test-Path ".\SQLGuardObservatory.API\SQLGuardObservatory.API.csproj")) {
    Write-Host "ERROR: No se encontró el proyecto. Asegúrate de ejecutar este script desde el directorio raíz del proyecto." -ForegroundColor Red
    exit 1
}

# Compilar el proyecto
Write-Host "📦 Paso 1/4: Compilando el backend con los cambios..." -ForegroundColor Yellow
Write-Host ""

$tempPath = Join-Path $PSScriptRoot "Temp\Backend"
New-Item -ItemType Directory -Force -Path $tempPath | Out-Null

try {
    dotnet publish .\SQLGuardObservatory.API -c Release -o $tempPath
    if ($LASTEXITCODE -ne 0) {
        throw "Error al compilar el proyecto"
    }
    Write-Host "✓ Backend compilado exitosamente" -ForegroundColor Green
    Write-Host ""
}
catch {
    Write-Host "ERROR al compilar:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Verificar si estamos en el servidor o necesitamos copiar archivos
$isLocalServer = Test-Path $ServerPath

if ($isLocalServer) {
    Write-Host "📋 Paso 2/4: Servidor local detectado, copiando archivos directamente..." -ForegroundColor Yellow
    Write-Host ""
    
    # Detener el servicio
    Write-Host "⏸️  Deteniendo servicio $ServiceName..." -ForegroundColor Yellow
    try {
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($service) {
            Stop-Service -Name $ServiceName -Force
            Start-Sleep -Seconds 3
            Write-Host "✓ Servicio detenido" -ForegroundColor Green
        } else {
            Write-Host "⚠️  Servicio no encontrado, continuando..." -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️  Error al detener servicio, continuando..." -ForegroundColor Yellow
    }
    Write-Host ""
    
    # Copiar archivos
    Write-Host "📂 Paso 3/4: Copiando archivos al servidor..." -ForegroundColor Yellow
    try {
        Copy-Item -Path "$tempPath\*" -Destination $ServerPath -Recurse -Force
        Write-Host "✓ Archivos copiados exitosamente" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR al copiar archivos:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        exit 1
    }
    Write-Host ""
    
    # Iniciar el servicio
    Write-Host "▶️  Paso 4/4: Iniciando servicio $ServiceName..." -ForegroundColor Yellow
    try {
        Start-Service -Name $ServiceName
        Start-Sleep -Seconds 3
        
        $serviceStatus = Get-Service -Name $ServiceName
        if ($serviceStatus.Status -eq "Running") {
            Write-Host "✓ Servicio iniciado correctamente" -ForegroundColor Green
        } else {
            Write-Host "⚠️  El servicio no está corriendo. Estado: $($serviceStatus.Status)" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "ERROR al iniciar servicio:" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        Write-Host ""
        Write-Host "Intenta iniciarlo manualmente:" -ForegroundColor Yellow
        Write-Host "  Start-Service -Name '$ServiceName'" -ForegroundColor White
    }
    Write-Host ""
    
    # Resumen
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "✅ DESPLIEGUE COMPLETADO" -ForegroundColor Green
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "1. Abre el navegador: http://asprbm-nov-01:8080" -ForegroundColor White
    Write-Host "2. Inicia sesión con cualquier usuario" -ForegroundColor White
    Write-Host "3. Verificar que:" -ForegroundColor White
    Write-Host "   - SuperAdmin/Admin pueden acceder a 'Usuarios'" -ForegroundColor Gray
    Write-Host "   - Todos los usuarios ven sus permisos sin error 403" -ForegroundColor Gray
    Write-Host "   - No hay errores en la consola del navegador (F12)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Si aún hay errores, revisa los logs:" -ForegroundColor Yellow
    Write-Host "  Get-Content '$ServerPath\logs\error.log' -Tail 50" -ForegroundColor White
    Write-Host ""
    
} else {
    Write-Host "📋 Paso 2/4: Servidor remoto detectado" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Los archivos compilados están en:" -ForegroundColor Cyan
    Write-Host "  $tempPath" -ForegroundColor White
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host "⚠️  ACCIÓN REQUERIDA - Despliegue Manual" -ForegroundColor Yellow
    Write-Host "================================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Necesitas copiar los archivos manualmente al servidor." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Opción 1 - Copiar por red (si tienes acceso):" -ForegroundColor Cyan
    Write-Host "  robocopy '$tempPath' '\\ASPRBM-NOV-01\C$\Temp\Backend' /MIR" -ForegroundColor White
    Write-Host ""
    Write-Host "Opción 2 - Copiar manualmente:" -ForegroundColor Cyan
    Write-Host "  1. Copia la carpeta '$tempPath'" -ForegroundColor White
    Write-Host "  2. Pégala en el servidor en una ubicación temporal" -ForegroundColor White
    Write-Host "  3. En el servidor, ejecuta:" -ForegroundColor White
    Write-Host ""
    Write-Host "     # Detener servicio" -ForegroundColor Gray
    Write-Host "     Stop-Service -Name '$ServiceName'" -ForegroundColor White
    Write-Host ""
    Write-Host "     # Copiar archivos" -ForegroundColor Gray
    Write-Host "     Copy-Item -Path 'C:\Temp\Backend\*' -Destination '$ServerPath' -Recurse -Force" -ForegroundColor White
    Write-Host ""
    Write-Host "     # Iniciar servicio" -ForegroundColor Gray
    Write-Host "     Start-Service -Name '$ServiceName'" -ForegroundColor White
    Write-Host ""
}

# Limpiar archivos temporales (opcional)
Write-Host "🧹 Limpiando archivos temporales..." -ForegroundColor Gray
Remove-Item -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""

Write-Host "Script finalizado." -ForegroundColor Green

