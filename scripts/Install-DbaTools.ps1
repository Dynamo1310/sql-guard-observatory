<#
.SYNOPSIS
    Instalar y verificar dbatools para Health Score v2.0

.DESCRIPTION
    Script para instalar, actualizar y verificar que dbatools esté disponible
    en el servidor donde se ejecutarán los scripts de Health Score.
    
.NOTES
    Autor: SQL Guard Observatory Team
    Versión: 1.0
    
.EXAMPLE
    .\Install-DbaTools.ps1
    
.EXAMPLE
    .\Install-DbaTools.ps1 -ForceUpdate
#>

[CmdletBinding()]
param(
    [switch]$ForceUpdate
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  dbatools - Instalación y Verificación               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Verificar versión de PowerShell
Write-Host "1️⃣  Verificando versión de PowerShell..." -ForegroundColor Yellow

$psVersion = $PSVersionTable.PSVersion
Write-Host "   Versión actual: $psVersion" -ForegroundColor Gray

if ($psVersion.Major -lt 5) {
    Write-Error "❌ Se requiere PowerShell 5.1 o superior. Versión actual: $psVersion"
    exit 1
}

Write-Host "   ✅ PowerShell $psVersion es compatible" -ForegroundColor Green

# 2. Verificar si dbatools está instalado
Write-Host ""
Write-Host "2️⃣  Verificando instalación de dbatools..." -ForegroundColor Yellow

$dbaModule = Get-Module -ListAvailable -Name dbatools

if ($dbaModule) {
    $currentVersion = $dbaModule.Version | Select-Object -First 1
    Write-Host "   ✅ dbatools ya está instalado (Versión: $currentVersion)" -ForegroundColor Green
    
    if ($ForceUpdate) {
        Write-Host "   🔄 Actualizando dbatools..." -ForegroundColor Yellow
        try {
            Update-Module -Name dbatools -Force -ErrorAction Stop
            Write-Host "   ✅ dbatools actualizado exitosamente" -ForegroundColor Green
        } catch {
            Write-Warning "   ⚠️  No se pudo actualizar: $($_.Exception.Message)"
        }
    }
} else {
    Write-Host "   ⚠️  dbatools NO está instalado" -ForegroundColor Yellow
    Write-Host "   📦 Instalando dbatools..." -ForegroundColor Cyan
    
    try {
        # Verificar si se requiere NuGet
        $nugetProvider = Get-PackageProvider -Name NuGet -ErrorAction SilentlyContinue
        if (-not $nugetProvider) {
            Write-Host "   📦 Instalando proveedor NuGet..." -ForegroundColor Gray
            Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser
        }
        
        # Instalar dbatools
        Install-Module -Name dbatools -Force -AllowClobber -Scope CurrentUser -ErrorAction Stop
        Write-Host "   ✅ dbatools instalado exitosamente" -ForegroundColor Green
        
    } catch {
        Write-Error "❌ Error instalando dbatools: $($_.Exception.Message)"
        exit 1
    }
}

# 3. Verificar que se puede importar
Write-Host ""
Write-Host "3️⃣  Verificando importación de dbatools..." -ForegroundColor Yellow

try {
    Import-Module dbatools -ErrorAction Stop
    $importedModule = Get-Module -Name dbatools
    Write-Host "   ✅ dbatools importado correctamente (Versión: $($importedModule.Version))" -ForegroundColor Green
} catch {
    Write-Error "❌ Error importando dbatools: $($_.Exception.Message)"
    exit 1
}

# 4. Verificar comandos clave
Write-Host ""
Write-Host "4️⃣  Verificando comandos clave..." -ForegroundColor Yellow

$requiredCommands = @(
    'Test-DbaConnection',
    'Invoke-DbaQuery',
    'Get-DbaDatabase',
    'Get-DbaLastBackup',
    'Get-DbaAgReplica'
)

$allOk = $true

foreach ($cmd in $requiredCommands) {
    $exists = Get-Command -Name $cmd -ErrorAction SilentlyContinue
    if ($exists) {
        Write-Host "   ✅ $cmd" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $cmd - NO ENCONTRADO" -ForegroundColor Red
        $allOk = $false
    }
}

if (-not $allOk) {
    Write-Error "❌ Algunos comandos no están disponibles. Reinstala dbatools."
    exit 1
}

# 5. Test de conexión de muestra (opcional)
Write-Host ""
Write-Host "5️⃣  Probando conexión de ejemplo..." -ForegroundColor Yellow
Write-Host "   (Probando con localhost...)" -ForegroundColor Gray

try {
    $testConn = Test-DbaConnection -SqlInstance "localhost" -WarningAction SilentlyContinue -ErrorAction SilentlyContinue
    
    if ($testConn.IsPingable) {
        Write-Host "   ✅ Test de conexión exitoso a localhost" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  No se pudo conectar a localhost (esto es normal si SQL Server no está en esta máquina)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ⚠️  No se pudo probar conexión a localhost (esto es normal si SQL Server no está en esta máquina)" -ForegroundColor Yellow
}

# 6. Resumen final
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN                                              ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  ✅ PowerShell: $psVersion".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ✅ dbatools: $($importedModule.Version)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ✅ Comandos verificados: $($requiredCommands.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ ¡dbatools está listo para usar!" -ForegroundColor Green
Write-Host ""
Write-Host "📘 Comandos útiles:" -ForegroundColor Cyan
Write-Host "   Get-DbaModule                     # Ver versión de dbatools" -ForegroundColor Gray
Write-Host "   Update-Module dbatools            # Actualizar dbatools" -ForegroundColor Gray
Write-Host "   Get-Command -Module dbatools      # Ver todos los comandos disponibles" -ForegroundColor Gray
Write-Host ""

