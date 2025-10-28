<#
.SYNOPSIS
    Actualiza el bloque de carga de módulos en todos los scripts
#>

$ErrorActionPreference = 'Stop'

$scripts = @(
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_DatabaseStates.ps1",
    "RelevamientoHealthScore_Discos.ps1",
    "RelevamientoHealthScore_ErroresCriticos.ps1",
    "RelevamientoHealthScore_IO.ps1",
    "RelevamientoHealthScore_LogChain.ps1",
    "RelevamientoHealthScore_Maintenance.ps1",
    "RelevamientoHealthScore_Memoria.ps1",
    "RelevamientoHealthScore_Waits.ps1"
)

$newModuleBlock = @'
# Limpiar módulos SQL existentes para evitar conflictos de assemblies
$sqlModules = @('SqlServer', 'SQLPS', 'dbatools', 'dbatools.library')
foreach ($mod in $sqlModules) {
    if (Get-Module -Name $mod) {
        Remove-Module $mod -Force -ErrorAction SilentlyContinue
    }
}

# Verificar que dbatools está disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Intentar importar dbatools
try {
    Import-Module dbatools -Force -ErrorAction Stop
    Write-Verbose "✅ dbatools cargado correctamente"
} catch {
    if ($_.Exception.Message -like "*Microsoft.Data.SqlClient*already loaded*") {
        Write-Warning "⚠️  Conflicto de assembly detectado. Para evitar este problema:"
        Write-Warning "   Opción 1: Ejecuta el script usando el wrapper Run-*-Clean.ps1 correspondiente"
        Write-Warning "   Opción 2: Cierra esta sesión y ejecuta: powershell -NoProfile -File .\<NombreScript>.ps1"
        Write-Warning ""
        Write-Warning "⚠️  Intentando continuar con dbatools ya cargado..."
        
        # Si dbatools ya está parcialmente cargado, intentar usarlo de todos modos
        if (-not (Get-Module -Name dbatools)) {
            Write-Error "❌ No se pudo cargar dbatools. Usa una de las opciones anteriores."
            exit 1
        }
    } else {
        throw
    }
}
'@

foreach ($scriptName in $scripts) {
    $scriptPath = Join-Path $PSScriptRoot $scriptName
    
    if (-not (Test-Path $scriptPath)) {
        Write-Warning "Script no encontrado: $scriptName"
        continue
    }
    
    Write-Host "Procesando: $scriptName" -ForegroundColor Cyan
    
    # Leer contenido
    $content = [System.IO.File]::ReadAllText($scriptPath)
    
    # Buscar y reemplazar el bloque de módulos
    # Patrón: desde una línea con "Verificar que dbatools" hasta "Import-Module dbatools"
    $pattern = '(?s)(# Verificar que dbatools|if \(-not \(Get-Module -ListAvailable -Name dbatools).*?Import-Module dbatools[^\r\n]*'
    
    if ($content -match $pattern) {
        # Encontrar el inicio del bloque
        $blockStart = $content.IndexOf('# Verificar que dbatools')
        if ($blockStart -lt 0) {
            $blockStart = $content.IndexOf('if (-not (Get-Module -ListAvailable -Name dbatools))')
        }
        
        # Encontrar el final del bloque (después de Import-Module dbatools)
        $importPos = $content.IndexOf('Import-Module dbatools', $blockStart)
        if ($importPos -ge 0) {
            $blockEnd = $content.IndexOf("`n", $importPos) + 1
            
            # Extraer antes y después del bloque
            $before = $content.Substring(0, $blockStart)
            $after = $content.Substring($blockEnd)
            
            # Construir nuevo contenido
            $newContent = $before + $newModuleBlock + "`n" + $after
            
            # Guardar
            $utf8WithBom = New-Object System.Text.UTF8Encoding $true
            [System.IO.File]::WriteAllText($scriptPath, $newContent, $utf8WithBom)
            
            Write-Host "  ✅ Bloque de módulos actualizado" -ForegroundColor Green
        } else {
            Write-Warning "  ⚠️  No se encontró 'Import-Module dbatools'"
        }
    } else {
        Write-Warning "  ⚠️  No se encontró el patrón del bloque de módulos"
    }
}

Write-Host ""
Write-Host "✅ COMPLETADO" -ForegroundColor Green

