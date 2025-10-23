<#
.SYNOPSIS
    Test rápido de dbatools con las instancias del inventario

.DESCRIPTION
    Script de diagnóstico para verificar que dbatools funciona correctamente
    con las instancias de SQL Server del inventario.
    
.EXAMPLE
    .\Test-DbaToolsConnection.ps1
    
.EXAMPLE
    .\Test-DbaToolsConnection.ps1 -Top 10
#>

[CmdletBinding()]
param(
    [int]$Top = 5  # Número de instancias a probar
)

# Verificar dbatools
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: .\scripts\Install-DbaTools.ps1"
    exit 1
}

# Descargar SqlServer si está cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force
Import-Module dbatools -Force -ErrorAction Stop

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Test de Conectividad con dbatools                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Configuración
$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response | Select-Object -First $Top
    
    Write-Host "   Total en API: $($response.Count)" -ForegroundColor Gray
    Write-Host "   Probando primeras: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "❌ Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Probar conexiones con dbatools
Write-Host ""
Write-Host "2️⃣  Probando conexiones con Test-DbaConnection..." -ForegroundColor Yellow
Write-Host ""

$results = @()
$successCount = 0
$failCount = 0

foreach ($instance in $instances) {
    # La propiedad correcta es NombreInstancia (con mayúscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Host "   🔍 Probando: $instanceName" -ForegroundColor Gray -NoNewline
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        # Test con dbatools + TrustServerCertificate (no tiene ConnectTimeout)
        $connection = Test-DbaConnection -SqlInstance $instanceName -TrustServerCertificate -EnableException
        
        $stopwatch.Stop()
        
        if ($connection.IsPingable) {
            $successCount++
            Write-Host " ✅ OK ($($stopwatch.ElapsedMilliseconds)ms)" -ForegroundColor Green
            
            $results += [PSCustomObject]@{
                Instance = $instanceName
                Status = "✅ Conectado"
                LatencyMs = $stopwatch.ElapsedMilliseconds
                SqlVersion = $connection.SqlVersion
                DomainName = $connection.DomainName
                Error = $null
            }
        } else {
            $failCount++
            Write-Host " ❌ NO PINGABLE" -ForegroundColor Red
            
            $results += [PSCustomObject]@{
                Instance = $instanceName
                Status = "❌ No Pingable"
                LatencyMs = 0
                SqlVersion = "N/A"
                DomainName = "N/A"
                Error = "No pingable"
            }
        }
        
    } catch {
        $failCount++
        Write-Host " ❌ ERROR" -ForegroundColor Red
        
        $results += [PSCustomObject]@{
            Instance = $instanceName
            Status = "❌ Error"
            LatencyMs = 0
            SqlVersion = "N/A"
            DomainName = "N/A"
            Error = $_.Exception.Message
        }
    }
}

# 3. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN                                              ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total probadas:    $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ✅ Exitosas:       $successCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ❌ Fallidas:       $failCount".PadRight(53) "║" -ForegroundColor White

if ($successCount -gt 0) {
    $avgLatency = ($results | Where-Object { $_.LatencyMs -gt 0 } | Measure-Object -Property LatencyMs -Average).Average
    Write-Host "║  ⚡ Latencia promedio: $([int]$avgLatency)ms".PadRight(53) "║" -ForegroundColor White
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# 4. Detalles de instancias exitosas
if ($successCount -gt 0) {
    Write-Host "✅ Instancias conectadas exitosamente:" -ForegroundColor Green
    Write-Host ""
    
    $results | Where-Object { $_.Status -eq "✅ Conectado" } | Format-Table -AutoSize
}

# 5. Detalles de errores
if ($failCount -gt 0) {
    Write-Host ""
    Write-Host "❌ Instancias con errores:" -ForegroundColor Red
    Write-Host ""
    
    $results | Where-Object { $_.Status -ne "✅ Conectado" } | Format-Table Instance, Status, Error -AutoSize
}

# 6. Conclusión
Write-Host ""
if ($successCount -eq $results.Count) {
    Write-Host "✅ ¡Todas las conexiones exitosas! dbatools está funcionando correctamente." -ForegroundColor Green
} elseif ($successCount -gt 0) {
    Write-Host "⚠️  Algunas conexiones fallaron. Verifica los errores arriba." -ForegroundColor Yellow
} else {
    Write-Host "❌ Todas las conexiones fallaron. Verifica:" -ForegroundColor Red
    Write-Host "   - Conectividad de red a las instancias SQL" -ForegroundColor Gray
    Write-Host "   - Permisos del usuario actual" -ForegroundColor Gray
    Write-Host "   - Firewall y puertos SQL Server" -ForegroundColor Gray
}

Write-Host ""

