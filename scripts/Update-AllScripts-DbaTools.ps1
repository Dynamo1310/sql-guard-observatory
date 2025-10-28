<#
.SYNOPSIS
    Script para actualizar todos los RelevamientoHealthScore scripts a dbatools puro
    
.DESCRIPTION
    Reemplaza:
    1. El bloque de verificación de módulos con código robusto
    2. Todos los Invoke-Sqlcmd con Invoke-DbaQuery
    3. Parámetros de Invoke-Sqlcmd con equivalentes de dbatools
#>

$scriptPath = $PSScriptRoot

# Lista de scripts a actualizar (excluyendo backups)
$scripts = @(
    "RelevamientoHealthScore_AlwaysOn.ps1",
    "RelevamientoHealthScore_Autogrowth.ps1",
    "RelevamientoHealthScore_Backups.ps1",
    "RelevamientoHealthScore_ConfiguracionTempdb.ps1",
    "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1",
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
        Write-Warning "   Opción 2: Cierra esta sesión y ejecuta: powershell -NoProfile -File .\NombreDelScript.ps1"
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
    $fullPath = Join-Path $scriptPath $scriptName
    
    if (-not (Test-Path $fullPath)) {
        Write-Warning "⚠️  Script no encontrado: $scriptName"
        continue
    }
    
    Write-Host "📝 Actualizando: $scriptName" -ForegroundColor Cyan
    
    $content = Get-Content $fullPath -Raw
    
    # 1. Reemplazar el bloque de verificación de módulos antiguo
    # Buscar el patrón desde "# Verificar que dbatools" hasta "Import-Module dbatools"
    $oldPattern1 = '(?s)# Verificar que dbatools.*?Import-Module dbatools -Force\s*\n'
    $content = $content -replace $oldPattern1, ($newModuleBlock + "`n`n")
    
    # 2. Reemplazar Invoke-Sqlcmd con Invoke-DbaQuery
    # Patrón 1: -ServerInstance con -TrustServerCertificate
    $content = $content -replace 'Invoke-Sqlcmd\s+-ServerInstance', 'Invoke-DbaQuery -SqlInstance'
    $content = $content -replace '-TrustServerCertificate', '-EnableException'
    
    # Patrón 2: Para queries con múltiples resultsets, agregar -As DataSet
    # Este es más complejo, lo haremos caso por caso después
    
    # Guardar el archivo actualizado
    Set-Content -Path $fullPath -Value $content -Encoding UTF8 -NoNewline
    
    Write-Host "   ✅ Actualizado" -ForegroundColor Green
}

Write-Host ""
Write-Host "✅ Actualización completada para $($scripts.Count) scripts" -ForegroundColor Green
Write-Host ""
Write-Host "⚠️  IMPORTANTE: Revisa cada script manualmente para:" -ForegroundColor Yellow
Write-Host "   1. Queries con múltiples resultsets necesitan: -As DataSet" -ForegroundColor Yellow
Write-Host "   2. Queries simples pueden usar el formato default" -ForegroundColor Yellow

