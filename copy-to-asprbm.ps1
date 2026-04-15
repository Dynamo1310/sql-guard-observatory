param(
    [string]$SourcePath      = "C:\Users\tb03260\Desktop\sql-guard-observatory",
    [string]$DestinationHost = "ASPRBM-NOV-01",
    [string]$DestinationPath = "C$\Temp\SQLNovaApp\sql-guard-observatory",
    [string]$UserName        = "TB03260ADM"
)

$ErrorActionPreference = "Stop"

$uncRoot   = "\\$DestinationHost\C$"
$uncTarget = "\\$DestinationHost\$DestinationPath"

Write-Host "====================================="
Write-Host "   COPIA A $DestinationHost"
Write-Host "====================================="
Write-Host ""
Write-Host "Origen  : $SourcePath"
Write-Host "Destino : $uncTarget"
Write-Host "Usuario : $UserName"
Write-Host ""

if (-not (Test-Path $SourcePath)) {
    Write-Host "ERROR: No se encontró la carpeta de origen: $SourcePath" -ForegroundColor Red
    exit 1
}

# Solicitar credenciales del usuario administrador
$credential = Get-Credential -UserName $UserName -Message "Ingrese la contraseña de $UserName"
if (-not $credential) {
    Write-Host "ERROR: No se proporcionaron credenciales." -ForegroundColor Red
    exit 1
}

# Mapear unidad temporal con las credenciales indicadas
$driveName = "SQLNovaCopy"
if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) {
    Remove-PSDrive -Name $driveName -Force
}

Write-Host ">>> Conectando a $uncRoot como $UserName..."
try {
    New-PSDrive -Name $driveName -PSProvider FileSystem -Root $uncRoot -Credential $credential -Scope Script | Out-Null
} catch {
    Write-Host "ERROR: No se pudo conectar al recurso remoto: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

try {
    # Asegurar carpeta destino
    if (-not (Test-Path $uncTarget)) {
        Write-Host ">>> Creando carpeta destino en el host remoto..."
        New-Item -ItemType Directory -Force -Path $uncTarget | Out-Null
    }

    Write-Host ">>> Copiando con robocopy (/MIR, excluyendo node_modules, dist, bin, obj, .git)..."
    $excludeDirs  = @("node_modules", "dist", "bin", "obj", ".git", ".vs")
    $robocopyArgs = @(
        $SourcePath,
        $uncTarget,
        "/MIR",
        "/R:2",
        "/W:5",
        "/MT:16",
        "/NFL",
        "/NDL",
        "/NP",
        "/XD"
    ) + $excludeDirs

    robocopy @robocopyArgs
    $rc = $LASTEXITCODE

    # robocopy: 0-7 son resultados sin error fatal
    if ($rc -ge 8) {
        Write-Host "ERROR: robocopy terminó con código $rc (error fatal)." -ForegroundColor Red
        exit $rc
    }

    Write-Host ""
    Write-Host "====================================="
    Write-Host "   COPIA COMPLETADA (robocopy rc=$rc)"
    Write-Host "   Destino: $uncTarget"
    Write-Host "====================================="
}
finally {
    if (Get-PSDrive -Name $driveName -ErrorAction SilentlyContinue) {
        Remove-PSDrive -Name $driveName -Force
    }
}
