# Script para crear el paquete ZIP para Teams
# Ejecutar desde la carpeta SQLNovaTeamsBot

param(
    [string]$AppId = "TU-BOT-APP-ID-AQUI"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Creando paquete de Teams para SQL Nova Bot ===" -ForegroundColor Cyan

# Actualizar manifest.json con el App ID
$manifestPath = "TeamsAppManifest\manifest.json"
$manifest = Get-Content $manifestPath -Raw
$manifest = $manifest -replace "TU-BOT-APP-ID-AQUI", $AppId
Set-Content $manifestPath $manifest

Write-Host "✓ Manifest actualizado con App ID: $AppId" -ForegroundColor Green

# Verificar que existen los iconos
$colorIcon = "TeamsAppManifest\color.png"
$outlineIcon = "TeamsAppManifest\outline.png"

if (-not (Test-Path $colorIcon) -or (Get-Item $colorIcon).Length -lt 1000) {
    Write-Host "⚠ ADVERTENCIA: Necesitas agregar un icono color.png de 192x192 px" -ForegroundColor Yellow
}

if (-not (Test-Path $outlineIcon) -or (Get-Item $outlineIcon).Length -lt 500) {
    Write-Host "⚠ ADVERTENCIA: Necesitas agregar un icono outline.png de 32x32 px" -ForegroundColor Yellow
}

# Crear el ZIP
$zipPath = "SQLNovaBot.zip"
if (Test-Path $zipPath) {
    Remove-Item $zipPath -Force
}

Compress-Archive -Path "TeamsAppManifest\manifest.json", "TeamsAppManifest\color.png", "TeamsAppManifest\outline.png" -DestinationPath $zipPath

Write-Host "✓ Paquete creado: $zipPath" -ForegroundColor Green

Write-Host ""
Write-Host "=== Próximos pasos ===" -ForegroundColor Cyan
Write-Host "1. Sube $zipPath a Teams (Apps > Upload a custom app)"
Write-Host "2. El bot aparecerá como 'SQL Nova' en la lista de apps"
Write-Host "3. Inicia un chat con el bot y escribe 'ayuda'"
Write-Host ""



