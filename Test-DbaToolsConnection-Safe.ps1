<#
.SYNOPSIS
    Test de conectividad que se ejecuta en una nueva sesión de PowerShell
    
.DESCRIPTION
    Este script lanza una nueva sesión de PowerShell para evitar conflictos
    de assemblies con módulos ya cargados.
    
.EXAMPLE
    .\Test-DbaToolsConnection-Safe.ps1
#>

[CmdletBinding()]
param(
    [int]$Top = 5
)

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Test de Conectividad SEGURO (nueva sesión)          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Write-Host "🔄 Lanzando test en nueva sesión de PowerShell..." -ForegroundColor Yellow
Write-Host ""

# Script interno que se ejecutará en la nueva sesión
$scriptBlock = @"
# Importar dbatools (sesión limpia)
Import-Module dbatools -Force -ErrorAction Stop

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Test de Conectividad con dbatools                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    `$response = Invoke-RestMethod -Uri "http://asprbm-nov-01/InventoryDBA/inventario/" -TimeoutSec 30
    `$instances = `$response.message | Select-Object -First $Top
    
    Write-Host "   Total en API: `$(`$response.message.Count)" -ForegroundColor Gray
    Write-Host "   Probando primeras: `$(`$instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "❌ Error obteniendo instancias: `$(`$_.Exception.Message)"
    exit 1
}

if (`$instances.Count -eq 0) {
    Write-Host ""
    Write-Host "⚠️  No se obtuvieron instancias de la API" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Diagnóstico de la respuesta de la API:" -ForegroundColor Cyan
    Write-Host "`$response.message | Select-Object -First 3 | Format-List" -ForegroundColor Gray
    `$response.message | Select-Object -First 3 | Format-List
    exit 1
}

# Probar conexiones
Write-Host ""
Write-Host "2️⃣  Probando conexiones con Test-DbaConnection..." -ForegroundColor Yellow
Write-Host ""

`$results = @()
`$successCount = 0
`$failCount = 0

foreach (`$instance in `$instances) {
    `$instanceName = `$instance.nombreInstancia
    
    if ([string]::IsNullOrEmpty(`$instanceName)) {
        Write-Host "   ⚠️  Instancia sin nombre - usando propiedad alternativa..." -ForegroundColor Yellow
        # Intentar otras propiedades comunes
        `$instanceName = `$instance.name ?? `$instance.instanceName ?? `$instance.serverName ?? `$instance.server
    }
    
    if ([string]::IsNullOrEmpty(`$instanceName)) {
        Write-Host "   ❌ No se pudo determinar el nombre de la instancia" -ForegroundColor Red
        continue
    }
    
    Write-Host "   🔍 Probando: `$instanceName" -ForegroundColor Gray -NoNewline
    
    try {
        `$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        `$connection = Test-DbaConnection -SqlInstance `$instanceName -ConnectTimeout 10 -TrustServerCertificate -EnableException
        
        `$stopwatch.Stop()
        
        if (`$connection.IsPingable) {
            `$successCount++
            Write-Host " ✅ OK (`$(`$stopwatch.ElapsedMilliseconds)ms)" -ForegroundColor Green
            
            `$results += [PSCustomObject]@{
                Instance = `$instanceName
                Status = "✅ Conectado"
                LatencyMs = `$stopwatch.ElapsedMilliseconds
                SqlVersion = `$connection.SqlVersion
                DomainName = `$connection.DomainName
                Error = `$null
            }
        } else {
            `$failCount++
            Write-Host " ❌ NO PINGABLE" -ForegroundColor Red
            
            `$results += [PSCustomObject]@{
                Instance = `$instanceName
                Status = "❌ No Pingable"
                LatencyMs = 0
                SqlVersion = "N/A"
                DomainName = "N/A"
                Error = "No pingable"
            }
        }
        
    } catch {
        `$failCount++
        Write-Host " ❌ ERROR" -ForegroundColor Red
        
        `$results += [PSCustomObject]@{
            Instance = `$instanceName
            Status = "❌ Error"
            LatencyMs = 0
            SqlVersion = "N/A"
            DomainName = "N/A"
            Error = `$_.Exception.Message
        }
    }
}

# Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN                                              ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total probadas:    `$(`$results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ✅ Exitosas:       `$successCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ❌ Fallidas:       `$failCount".PadRight(53) "║" -ForegroundColor White

if (`$successCount -gt 0) {
    `$avgLatency = (`$results | Where-Object { `$_.LatencyMs -gt 0 } | Measure-Object -Property LatencyMs -Average).Average
    Write-Host "║  ⚡ Latencia promedio: `$([int]`$avgLatency)ms".PadRight(53) "║" -ForegroundColor White
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# Detalles
if (`$successCount -gt 0) {
    Write-Host "✅ Instancias conectadas:" -ForegroundColor Green
    Write-Host ""
    `$results | Where-Object { `$_.Status -eq "✅ Conectado" } | Format-Table -AutoSize
}

if (`$failCount -gt 0) {
    Write-Host ""
    Write-Host "❌ Instancias con errores:" -ForegroundColor Red
    Write-Host ""
    `$results | Where-Object { `$_.Status -ne "✅ Conectado" } | Format-Table Instance, Status, Error -AutoSize
}
"@

# Crear archivo temporal con el script
$tempScript = Join-Path $env:TEMP "test-dba-$(Get-Date -Format 'yyyyMMddHHmmss').ps1"
$scriptBlock | Out-File -FilePath $tempScript -Encoding UTF8

try {
    # Ejecutar en nueva sesión de PowerShell
    & pwsh.exe -NoProfile -ExecutionPolicy Bypass -File $tempScript
    
} catch {
    Write-Error "Error ejecutando test: $($_.Exception.Message)"
} finally {
    # Limpiar archivo temporal
    if (Test-Path $tempScript) {
        Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "✅ Test completado en sesión limpia" -ForegroundColor Green
Write-Host ""

