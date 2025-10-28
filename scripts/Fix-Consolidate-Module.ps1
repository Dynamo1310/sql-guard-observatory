<#
.SYNOPSIS
    Actualiza el bloque de módulos en el script Consolidate
#>

$consolidatePath = Join-Path $PSScriptRoot "RelevamientoHealthScore_Consolidate_v3_FINAL.ps1"

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
        Write-Warning "⚠️  Conflicto de assembly detectado. Ejecuta: .\Run-Consolidate-Clean.ps1"
        Write-Warning "⚠️  Intentando continuar..."
        if (-not (Get-Module -Name dbatools)) {
            Write-Error "❌ No se pudo cargar dbatools."
            exit 1
        }
    } else {
        throw
    }
}
'@

# Leer contenido
$content = [System.IO.File]::ReadAllText($consolidatePath)

# Encontrar el bloque a reemplazar
$start = $content.IndexOf('if (-not (Get-Module -ListAvailable -Name dbatools))')
$end = $content.IndexOf('Import-Module dbatools -Force', $start)
$end = $content.IndexOf("`n", $end) + 1

# Construir nuevo contenido
$before = $content.Substring(0, $start)
$after = $content.Substring($end)
$newContent = $before + $newModuleBlock + "`n" + $after

# Guardar
$utf8WithBom = New-Object System.Text.UTF8Encoding $true
[System.IO.File]::WriteAllText($consolidatePath, $newContent, $utf8WithBom)

Write-Host "✅ Script Consolidate actualizado" -ForegroundColor Green

