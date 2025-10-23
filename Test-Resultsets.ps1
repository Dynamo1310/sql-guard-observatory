# Test: ¿Cómo devuelve Invoke-DbaQuery los resultsets múltiples?
# ================================================================

param(
    [string]$Instance = "SSPR17CRM365-01"
)

Remove-Module SqlServer -ErrorAction SilentlyContinue
Import-Module dbatools -ErrorAction Stop

$query = @"
-- QUERY 1: IntegrityCheck
SELECT 'IntegrityCheck' AS Source, 'Job1' AS JobName, 1 AS Status;

-- QUERY 2: IndexOptimize
SELECT 'IndexOptimize' AS Source, 'Job2' AS JobName, 1 AS Status;
"@

Write-Host "Ejecutando query con 2 SELECT en: $Instance" -ForegroundColor Yellow
Write-Host ""

$datasets = Invoke-DbaQuery -SqlInstance $Instance -Query $query -EnableException

Write-Host "Tipo de `$datasets: $($datasets.GetType().FullName)" -ForegroundColor Cyan
Write-Host "Es array: $($datasets -is [array])" -ForegroundColor Cyan
Write-Host "Count: $($datasets.Count)" -ForegroundColor Cyan
Write-Host ""

if ($datasets -is [array] -and $datasets.Count -gt 1) {
    Write-Host "✅ Se devolvieron múltiples resultsets" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resultset 0:" -ForegroundColor Yellow
    $datasets[0] | Format-Table -AutoSize
    Write-Host "Resultset 1:" -ForegroundColor Yellow
    $datasets[1] | Format-Table -AutoSize
} else {
    Write-Host "⚠️  Se devolvieron los resultados mezclados en un solo array" -ForegroundColor Yellow
    Write-Host ""
    $datasets | Format-Table -AutoSize
    
    Write-Host ""
    Write-Host "Intentando separar por Source:" -ForegroundColor Yellow
    $checkdb = $datasets | Where-Object { $_.Source -eq 'IntegrityCheck' }
    $indexOpt = $datasets | Where-Object { $_.Source -eq 'IndexOptimize' }
    
    Write-Host "IntegrityCheck jobs:" -ForegroundColor Cyan
    $checkdb | Format-Table -AutoSize
    
    Write-Host "IndexOptimize jobs:" -ForegroundColor Cyan
    $indexOpt | Format-Table -AutoSize
}

