# 🧪 TEST: Ejecutar collector para UNA sola instancia y ver el score calculado

param(
    [Parameter(Mandatory=$true)]
    [string]$InstanceName  # Nombre de la instancia a probar
)

Write-Host "🔍 Testing collector para: $InstanceName" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Dot-source el collector para cargar las funciones
. ".\RelevamientoHealthScore_ConfiguracionTempdb.ps1"

Write-Host "`n1️⃣  Obteniendo métricas..." -ForegroundColor Yellow

# Ejecutar la función directamente
$result = Get-ConfigTempdbMetrics -InstanceName $InstanceName -TimeoutSec 30

Write-Host "`n📊 RESULTADOS:" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Mostrar TODAS las métricas
Write-Host "`n🔹 TempDB Files:" -ForegroundColor White
Write-Host "   FileCount: $($result.TempDBFileCount)" -ForegroundColor Gray
Write-Host "   AllSameSize: $($result.TempDBAllSameSize)" -ForegroundColor Gray
Write-Host "   AllSameGrowth: $($result.TempDBAllSameGrowth)" -ForegroundColor Gray
Write-Host "   GrowthConfigOK: $($result.TempDBGrowthConfigOK)" -ForegroundColor Gray

Write-Host "`n🔹 TempDB Performance:" -ForegroundColor White
Write-Host "   PageLatchWaits: $($result.TempDBPageLatchWaits)" -ForegroundColor Gray
Write-Host "   AvgReadLatencyMs: $($result.TempDBAvgReadLatencyMs)" -ForegroundColor Gray
Write-Host "   AvgWriteLatencyMs: $($result.TempDBAvgWriteLatencyMs)" -ForegroundColor Gray

Write-Host "`n🔹 TempDB Space:" -ForegroundColor White
Write-Host "   TotalSizeMB: $($result.TempDBTotalSizeMB)" -ForegroundColor Gray
Write-Host "   UsedSpaceMB: $($result.TempDBUsedSpaceMB)" -ForegroundColor Gray
Write-Host "   FreeSpacePct: $($result.TempDBFreeSpacePct)" -ForegroundColor Gray
Write-Host "   VersionStoreMB: $($result.TempDBVersionStoreMB)" -ForegroundColor Gray

Write-Host "`n🔹 Memory:" -ForegroundColor White
Write-Host "   MaxServerMemoryMB: $($result.MaxServerMemoryMB)" -ForegroundColor Gray
Write-Host "   TotalPhysicalMemoryMB: $($result.TotalPhysicalMemoryMB)" -ForegroundColor Gray
Write-Host "   CPUCount: $($result.CPUCount)" -ForegroundColor Gray

Write-Host "`n🎯 SCORE CALCULADO:" -ForegroundColor Green
Write-Host "   TempDBContentionScore: $($result.TempDBContentionScore)/100" -ForegroundColor Cyan -NoNewline
if ($result.TempDBContentionScore -ge 90) {
    Write-Host " ✅ Óptimo" -ForegroundColor Green
} elseif ($result.TempDBContentionScore -ge 70) {
    Write-Host " ⚠️ Advertencia" -ForegroundColor Yellow
} elseif ($result.TempDBContentionScore -ge 40) {
    Write-Host " 🚨 Problemas" -ForegroundColor Red
} else {
    Write-Host " ❌ Crítico" -ForegroundColor Red
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Calcular manualmente para comparar
Write-Host "`n🧮 CÁLCULO MANUAL (para verificar):" -ForegroundColor Magenta
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray

# Contención
$contentionScore = 0
if ($result.TempDBPageLatchWaits -eq 0) { $contentionScore = 100 }
elseif ($result.TempDBPageLatchWaits -lt 100) { $contentionScore = 90 }
elseif ($result.TempDBPageLatchWaits -lt 1000) { $contentionScore = 70 }
elseif ($result.TempDBPageLatchWaits -lt 10000) { $contentionScore = 40 }
else { $contentionScore = 0 }
$contentionContribution = $contentionScore * 0.40

Write-Host "1. Contención (40%):" -ForegroundColor White
Write-Host "   PAGELATCH Waits: $($result.TempDBPageLatchWaits)" -ForegroundColor Gray
Write-Host "   Score: $contentionScore × 0.40 = $contentionContribution pts" -ForegroundColor Gray

# Latencia
$diskScore = 0
if ($result.TempDBAvgWriteLatencyMs -eq 0) { $diskScore = 100 }
elseif ($result.TempDBAvgWriteLatencyMs -le 5) { $diskScore = 100 }
elseif ($result.TempDBAvgWriteLatencyMs -le 10) { $diskScore = 90 }
elseif ($result.TempDBAvgWriteLatencyMs -le 20) { $diskScore = 70 }
elseif ($result.TempDBAvgWriteLatencyMs -le 50) { $diskScore = 40 }
else { $diskScore = 0 }
$diskContribution = $diskScore * 0.30

Write-Host "`n2. Latencia (30%):" -ForegroundColor White
Write-Host "   Write Latency: $($result.TempDBAvgWriteLatencyMs) ms" -ForegroundColor Gray
Write-Host "   Score: $diskScore × 0.30 = $diskContribution pts" -ForegroundColor Gray

# Configuración (simplificado)
$configScore = 100
if (-not $result.TempDBAllSameSize) { $configScore -= 20 }
if (-not $result.TempDBAllSameGrowth) { $configScore -= 10 }
if (-not $result.TempDBGrowthConfigOK) { $configScore -= 10 }
$configContribution = $configScore * 0.20

Write-Host "`n3. Configuración (20%):" -ForegroundColor White
Write-Host "   Same Size: $($result.TempDBAllSameSize)" -ForegroundColor Gray
Write-Host "   Same Growth: $($result.TempDBAllSameGrowth)" -ForegroundColor Gray
Write-Host "   Growth OK: $($result.TempDBGrowthConfigOK)" -ForegroundColor Gray
Write-Host "   Score: $configScore × 0.20 = $configContribution pts" -ForegroundColor Gray

# Recursos
$resourceScore = 100
if ($result.TempDBFreeSpacePct -eq 0) { $resourceScore -= 20 }
elseif ($result.TempDBFreeSpacePct -lt 10) { $resourceScore -= 100 }
elseif ($result.TempDBFreeSpacePct -lt 20) { $resourceScore -= 40 }
if ($resourceScore -lt 0) { $resourceScore = 0 }
$resourceContribution = $resourceScore * 0.10

Write-Host "`n4. Recursos (10%):" -ForegroundColor White
Write-Host "   Free Space: $($result.TempDBFreeSpacePct)%" -ForegroundColor Gray
Write-Host "   Version Store: $($result.TempDBVersionStoreMB) MB" -ForegroundColor Gray
Write-Host "   Score: $resourceScore × 0.10 = $resourceContribution pts" -ForegroundColor Gray

# Total
$totalManual = [int]($contentionContribution + $diskContribution + $configContribution + $resourceContribution)

Write-Host "`n═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "TOTAL MANUAL: $totalManual/100" -ForegroundColor Cyan
Write-Host "TOTAL FUNCIÓN: $($result.TempDBContentionScore)/100" -ForegroundColor Yellow
Write-Host "DIFERENCIA: $($totalManual - $result.TempDBContentionScore)" -ForegroundColor $(if ($totalManual -eq $result.TempDBContentionScore) { 'Green' } else { 'Red' })
Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan

if ($totalManual -ne $result.TempDBContentionScore) {
    Write-Host "`n⚠️ HAY UNA DISCREPANCIA!" -ForegroundColor Red
    Write-Host "El score calculado por la función NO coincide con el cálculo manual." -ForegroundColor Red
} else {
    Write-Host "`n✅ Score calculado correctamente!" -ForegroundColor Green
}

Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "💡 Próximo paso: Comparar este score con el valor en la BD" -ForegroundColor Yellow

