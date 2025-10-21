<#  
    ConsultarKPIsDiscos.ps1
    - Consulta los KPIs del último snapshot de discos
    - Muestra resumen visual en consola
    - Exporta a CSV (opcional)
#>

# ========= CONFIGURACIÓN =========
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$ExportCsv   = $false  # Cambiar a $true para exportar a CSV
$CsvPath     = ".\ReporteDiscos_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"

# ========= VERIFICAR DBATOOLS =========
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "dbatools no está instalado. Ejecuta: Install-Module dbatools -Scope CurrentUser"
    exit 1
}

Import-Module dbatools -ErrorAction Stop

# ========= FUNCIONES =========

function Get-KPIsDiscos {
    $sql = @"
WITH UltimoSnapshot AS (
    SELECT *
    FROM dbo.InventarioDiscosSnapshot
    WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
)
SELECT 
    SUM(CASE WHEN Estado = 'Crítico' THEN 1 ELSE 0 END) AS DiscosCriticos,
    SUM(CASE WHEN Estado = 'Advertencia' THEN 1 ELSE 0 END) AS DiscosAdvertencia,
    SUM(CASE WHEN Estado = 'Saludable' THEN 1 ELSE 0 END) AS DiscosSaludables,
    COUNT(*) AS TotalDiscos,
    MAX(CaptureDate) AS UltimaCaptura
FROM UltimoSnapshot
"@

    $result = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $sql
    return $result
}

function Get-DetalleDiscos {
    $sql = @"
SELECT 
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre,
    Estado,
    Ambiente,
    Hosting
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
ORDER BY 
    CASE Estado 
        WHEN 'Crítico' THEN 1 
        WHEN 'Advertencia' THEN 2 
        WHEN 'Saludable' THEN 3 
    END,
    PorcentajeLibre ASC
"@

    $result = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $sql
    return $result
}

function Get-TopCriticos {
    param([int]$Top = 10)
    
    $sql = @"
SELECT TOP $Top
    Servidor,
    Drive,
    TotalGB,
    LibreGB,
    PorcentajeLibre,
    Estado
FROM dbo.InventarioDiscosSnapshot
WHERE CaptureDate = (SELECT MAX(CaptureDate) FROM dbo.InventarioDiscosSnapshot)
ORDER BY PorcentajeLibre ASC
"@

    $result = Invoke-DbaQuery -SqlInstance $SqlServer -Database $SqlDatabase -Query $sql
    return $result
}

function Show-ProgressBar {
    param(
        [int]$Value,
        [int]$Total,
        [string]$Estado
    )
    
    $percentage = if ($Total -gt 0) { [math]::Round(($Value / $Total) * 100, 1) } else { 0 }
    
    $color = switch ($Estado) {
        "Crítico"     { "Red" }
        "Advertencia" { "Yellow" }
        "Saludable"   { "Green" }
        default       { "White" }
    }
    
    $barLength = 30
    $filled = [math]::Floor(($Value / $Total) * $barLength)
    $empty = $barLength - $filled
    
    $bar = ("█" * $filled) + ("░" * $empty)
    
    Write-Host "$Estado`: " -NoNewline
    Write-Host $bar -ForegroundColor $color -NoNewline
    Write-Host " $Value ($percentage%)"
}

# ========= MAIN =========

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " KPIs de Discos - Último Snapshot" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener KPIs
Write-Host "Consultando KPIs..." -ForegroundColor Gray
$kpis = Get-KPIsDiscos

if (-not $kpis) {
    Write-Error "No se encontraron datos. Ejecuta primero RelevamientoDiscosMant.ps1"
    exit 1
}

# 2. Mostrar KPIs principales
Write-Host "Última captura: " -NoNewline
Write-Host $kpis.UltimaCaptura -ForegroundColor Yellow
Write-Host ""

Write-Host "RESUMEN GENERAL:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────" -ForegroundColor DarkGray
Write-Host "Total de discos: " -NoNewline
Write-Host $kpis.TotalDiscos -ForegroundColor White
Write-Host ""

# Mostrar barras de progreso
Show-ProgressBar -Value $kpis.DiscosCriticos -Total $kpis.TotalDiscos -Estado "Crítico"
Show-ProgressBar -Value $kpis.DiscosAdvertencia -Total $kpis.TotalDiscos -Estado "Advertencia"
Show-ProgressBar -Value $kpis.DiscosSaludables -Total $kpis.TotalDiscos -Estado "Saludable"

# 3. Top 10 Discos Críticos
Write-Host ""
Write-Host "TOP 10 DISCOS CON MENOS ESPACIO:" -ForegroundColor Cyan
Write-Host "─────────────────────────────────────" -ForegroundColor DarkGray

$topCriticos = Get-TopCriticos -Top 10

if ($topCriticos.Count -gt 0) {
    $topCriticos | Format-Table -Property `
        @{Label="Servidor"; Expression={$_.Servidor}; Width=20},
        @{Label="Drive"; Expression={$_.Drive}; Width=8},
        @{Label="Total GB"; Expression={[math]::Round($_.TotalGB, 2)}; Width=10},
        @{Label="Libre GB"; Expression={[math]::Round($_.LibreGB, 2)}; Width=10},
        @{Label="% Libre"; Expression={[math]::Round($_.PorcentajeLibre, 2)}; Width=10},
        @{Label="Estado"; Expression={
            switch ($_.Estado) {
                "Crítico"     { "$($_.Estado)" }
                "Advertencia" { "$($_.Estado)" }
                "Saludable"   { "$($_.Estado)" }
                default       { $_.Estado }
            }
        }; Width=12} -AutoSize
} else {
    Write-Host "No hay discos registrados" -ForegroundColor Gray
}

# 4. Exportar a CSV si está habilitado
if ($ExportCsv) {
    Write-Host ""
    Write-Host "Exportando datos completos a CSV..." -NoNewline
    
    try {
        $detalleCompleto = Get-DetalleDiscos
        $detalleCompleto | Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
        Write-Host " ✓" -ForegroundColor Green
        Write-Host "Archivo guardado en: $CsvPath" -ForegroundColor Gray
    } catch {
        Write-Host " ERROR" -ForegroundColor Red
        Write-Error $_.Exception.Message
    }
}

# 5. Alertas
Write-Host ""
if ($kpis.DiscosCriticos -gt 0) {
    Write-Host "⚠️  ATENCIÓN: Hay $($kpis.DiscosCriticos) disco(s) CRÍTICO(S)" -ForegroundColor Red
    Write-Host "   Requiere acción inmediata" -ForegroundColor Red
}

if ($kpis.DiscosAdvertencia -gt 0) {
    Write-Host "⚠️  HAY $($kpis.DiscosAdvertencia) disco(s) en ADVERTENCIA" -ForegroundColor Yellow
    Write-Host "   Planificar expansión o limpieza" -ForegroundColor Yellow
}

if ($kpis.DiscosCriticos -eq 0 -and $kpis.DiscosAdvertencia -eq 0) {
    Write-Host "✅ Todos los discos están SALUDABLES" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

