<#
.SYNOPSIS
    Copia archivos de Health Score V2 al Windows Server

.DESCRIPTION
    Script para sincronizar archivos del desarrollo local al servidor de producción.
    
.PARAMETER ServerName
    Nombre del servidor destino (default: SSPR17MON-01)
    
.PARAMETER BackendPath
    Ruta del backend en el servidor
    
.PARAMETER FrontendPath
    Ruta del frontend compilado en el servidor
    
.PARAMETER SQLScriptsPath
    Ruta temporal para scripts SQL en el servidor
    
.PARAMETER SkipBackend
    No copiar archivos del backend
    
.PARAMETER SkipFrontend
    No copiar archivos del frontend
    
.PARAMETER SkipSQL
    No copiar scripts SQL

.EXAMPLE
    .\Deploy-HealthScoreV2-ToServer.ps1 -ServerName "SSPR17MON-01"
#>

[CmdletBinding()]
param(
    [string]$ServerName = "SSPR17MON-01",
    [string]$BackendPath = "\\$ServerName\C$\Publish\SQLGuardObservatory",
    [string]$FrontendPath = "\\$ServerName\C$\inetpub\wwwroot\sqlguard",
    [string]$SQLScriptsPath = "\\$ServerName\C$\Temp\HealthScoreV2",
    [switch]$SkipBackend,
    [switch]$SkipFrontend,
    [switch]$SkipSQL,
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy Health Score V2 to Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar conectividad al servidor
Write-Host "► Verificando conectividad a $ServerName..." -ForegroundColor Yellow
if (-not (Test-Connection -ComputerName $ServerName -Count 1 -Quiet)) {
    Write-Error "No se puede alcanzar el servidor $ServerName"
    exit 1
}
Write-Host "  ✓ Servidor accesible" -ForegroundColor Green

# ============================================
# 1. COPIAR SCRIPTS SQL
# ============================================
if (-not $SkipSQL) {
    Write-Host ""
    Write-Host "► Copiando scripts SQL..." -ForegroundColor Yellow
    
    # Crear carpeta temporal en servidor si no existe
    if (-not (Test-Path $SQLScriptsPath)) {
        New-Item -Path $SQLScriptsPath -ItemType Directory -Force | Out-Null
    }
    
    $sqlFiles = @(
        "SQLNova\01c_Migrar_Tablas_Existentes_V2.sql",
        "SQLNova\01d_Tabla_HealthScore_History.sql",
        "SQLNova\02_Views_HealthScore_V2.sql",
        "SQLNova\03_Views_HealthFinal_V2.sql",
        "SQLNova\04_Security_V2.sql",
        "SQLNova\05_Seed_Data_V2.sql",
        "SQLNova\06_SQLAgent_Job_Materializar.sql"
    )
    
    foreach ($file in $sqlFiles) {
        if (Test-Path $file) {
            $fileName = Split-Path $file -Leaf
            $destPath = Join-Path $SQLScriptsPath $fileName
            
            if ($WhatIf) {
                Write-Host "  [WhatIf] Copiaría: $file → $destPath" -ForegroundColor Gray
            } else {
                Copy-Item -Path $file -Destination $destPath -Force
                Write-Host "  ✓ $fileName" -ForegroundColor Green
            }
        } else {
            Write-Warning "  ⚠ No encontrado: $file"
        }
    }
    
    Write-Host ""
    Write-Host "  Scripts SQL copiados a: $SQLScriptsPath" -ForegroundColor Cyan
    Write-Host "  Ejecuta manualmente en el servidor:" -ForegroundColor Yellow
    Write-Host "  cd $SQLScriptsPath" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d SQLNova -i 01c_Migrar_Tablas_Existentes_V2.sql" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d SQLNova -i 01d_Tabla_HealthScore_History.sql" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d SQLNova -i 02_Views_HealthScore_V2.sql" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d SQLNova -i 03_Views_HealthFinal_V2.sql" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d SQLNova -i 04_Security_V2.sql" -ForegroundColor Gray
    Write-Host "  sqlcmd -S localhost -d msdb -i 06_SQLAgent_Job_Materializar.sql" -ForegroundColor Gray
}

# ============================================
# 2. COPIAR BACKEND
# ============================================
if (-not $SkipBackend) {
    Write-Host ""
    Write-Host "► Copiando archivos del Backend..." -ForegroundColor Yellow
    
    if (-not (Test-Path $BackendPath)) {
        Write-Warning "  ⚠ Ruta del backend no encontrada: $BackendPath"
        Write-Host "    Ajusta el parámetro -BackendPath"
    } else {
        $backendFiles = @{
            "SQLGuardObservatory.API\Models\HealthScoreV2Models.cs" = "Models\HealthScoreV2Models.cs"
            "SQLGuardObservatory.API\DTOs\HealthScoreV2Dto.cs" = "DTOs\HealthScoreV2Dto.cs"
            "SQLGuardObservatory.API\Data\SQLNovaDbContext.cs" = "Data\SQLNovaDbContext.cs"
            "SQLGuardObservatory.API\Services\IHealthScoreV2Service.cs" = "Services\IHealthScoreV2Service.cs"
            "SQLGuardObservatory.API\Services\HealthScoreV2Service.cs" = "Services\HealthScoreV2Service.cs"
            "SQLGuardObservatory.API\Controllers\HealthScoreV2Controller.cs" = "Controllers\HealthScoreV2Controller.cs"
            "SQLGuardObservatory.API\Program.cs" = "Program.cs"
        }
        
        foreach ($source in $backendFiles.Keys) {
            if (Test-Path $source) {
                $relPath = $backendFiles[$source]
                $destPath = Join-Path $BackendPath $relPath
                $destDir = Split-Path $destPath -Parent
                
                if (-not (Test-Path $destDir)) {
                    New-Item -Path $destDir -ItemType Directory -Force | Out-Null
                }
                
                if ($WhatIf) {
                    Write-Host "  [WhatIf] Copiaría: $source → $relPath" -ForegroundColor Gray
                } else {
                    Copy-Item -Path $source -Destination $destPath -Force
                    Write-Host "  ✓ $relPath" -ForegroundColor Green
                }
            } else {
                Write-Warning "  ⚠ No encontrado: $source"
            }
        }
        
        Write-Host ""
        Write-Host "  ⚠ IMPORTANTE: Debes RECOMPILAR el backend en el servidor:" -ForegroundColor Yellow
        Write-Host "  cd $BackendPath" -ForegroundColor Gray
        Write-Host "  dotnet build --configuration Release" -ForegroundColor Gray
        Write-Host "  Restart-Service 'SQLGuardObservatory.API'" -ForegroundColor Gray
    }
}

# ============================================
# 3. COPIAR FRONTEND
# ============================================
if (-not $SkipFrontend) {
    Write-Host ""
    Write-Host "► Compilando Frontend..." -ForegroundColor Yellow
    
    if ($WhatIf) {
        Write-Host "  [WhatIf] Ejecutaría: npm run build" -ForegroundColor Gray
    } else {
        # Compilar frontend
        $buildResult = & npm run build 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Error al compilar frontend. Ejecuta 'npm run build' manualmente."
            exit 1
        }
        Write-Host "  ✓ Frontend compilado" -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "► Copiando Frontend al servidor..." -ForegroundColor Yellow
    
    if (-not (Test-Path "dist")) {
        Write-Warning "  ⚠ Carpeta dist/ no encontrada. Ejecuta 'npm run build' primero."
    } elseif (-not (Test-Path $FrontendPath)) {
        Write-Warning "  ⚠ Ruta del frontend no encontrada: $FrontendPath"
        Write-Host "    Ajusta el parámetro -FrontendPath"
    } else {
        if ($WhatIf) {
            Write-Host "  [WhatIf] Copiaría: dist\* → $FrontendPath" -ForegroundColor Gray
        } else {
            # Backup del frontend actual
            $backupPath = "$FrontendPath.backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
            Write-Host "  ► Creando backup en: $backupPath" -ForegroundColor Yellow
            Copy-Item -Path $FrontendPath -Destination $backupPath -Recurse -Force
            
            # Copiar nuevo frontend
            Copy-Item -Path "dist\*" -Destination $FrontendPath -Recurse -Force
            Write-Host "  ✓ Frontend copiado" -ForegroundColor Green
            Write-Host "  ✓ Backup guardado en: $backupPath" -ForegroundColor Green
        }
    }
}

# ============================================
# RESUMEN FINAL
# ============================================
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Despliegue Completado" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Próximos pasos en el servidor $ServerName :" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ejecutar scripts SQL (ver arriba)" -ForegroundColor White
Write-Host "2. Recompilar y reiniciar backend" -ForegroundColor White
Write-Host "3. Verificar que el frontend cargó" -ForegroundColor White
Write-Host ""
Write-Host "Verificación:" -ForegroundColor Yellow
Write-Host "  http://$ServerName/healthscore-v2" -ForegroundColor Cyan
Write-Host ""

