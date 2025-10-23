<#
.SYNOPSIS
    Script de prueba rápida para validar Health Score v2.0

.DESCRIPTION
    Prueba el script en instancias específicas para validar:
    - Detección de backups (standalone y AlwaysOn)
    - Sincronización de nodos AlwaysOn
    - Consistencia de AlwaysOn.Enabled

.EXAMPLE
    .\Test-HealthScoreV2.ps1 -InstanceNames "SSPR19MBK-01","SSPR19MBK-51"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string[]]$InstanceNames = @("SSPR19MBK-01", "SSPR19MBK-51", "SSPR17SQL-01"),
    
    [int]$TimeoutSec = 10
)

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Test Health Score v2.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Ejecutar script principal en modo de prueba
Write-Host "[1/3] Ejecutando relevamiento..." -ForegroundColor Yellow

# Crear archivo temporal con instancias de prueba
$apiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $allInstances = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    
    # Filtrar solo las instancias solicitadas
    $testInstances = $allInstances | Where-Object {
        $serverName = if ($_.NombreInstancia) { $_.NombreInstancia } else { $_.ServerName }
        $InstanceNames -contains $serverName
    }
    
    Write-Host "  [OK] $($testInstances.Count) instancia(s) encontrada(s)" -ForegroundColor Green
    
} catch {
    Write-Host "  [ERROR] No se pudo obtener instancias: $_" -ForegroundColor Red
    exit 1
}

# Guardar resultados temporales
$tempJson = ".\Test_HealthScore_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

# Crear un mini-script inline
$scriptBlock = {
    param($Instances, $JsonPath)
    
    # Importar funciones del script principal
    . ".\scripts\RelevamientoHealthScoreMant.ps1"
    
    # Procesar instancias
    $agInfo = Get-AlwaysOnGroups -Instances $Instances -TimeoutSec 10
    
    $results = @()
    foreach ($instance in $Instances) {
        $result = Get-InstanceHealth -Instance $instance -TimeoutSec 10
        Calculate-HealthScore -InstanceData $result
        $results += $result
    }
    
    # Sincronizar AlwaysOn
    if ($agInfo.Groups.Count -gt 0) {
        $results = Sync-AlwaysOnData -AllResults $results -AGInfo $agInfo
    }
    
    # Guardar
    $results | ConvertTo-Json -Depth 10 | Out-File -FilePath $JsonPath -Encoding UTF8
    
    return $results
}

# Ejecutar
try {
    $results = & $scriptBlock -Instances $testInstances -JsonPath $tempJson
    Write-Host "  [OK] Procesamiento completado" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Error durante procesamiento: $_" -ForegroundColor Red
    exit 1
}

# Análisis de resultados
Write-Host ""
Write-Host "[2/3] Analizando resultados..." -ForegroundColor Yellow

$report = @()

foreach ($result in $results) {
    $instanceName = $result.InstanceName
    $healthScore = $result.HealthScore
    $healthStatus = $result.HealthStatus
    
    # Backups
    $lastFull = if ($result.BackupSummary.LastFullBackup) { 
        ([datetime]$result.BackupSummary.LastFullBackup).ToString("yyyy-MM-dd HH:mm") 
    } else { 
        "N/A" 
    }
    
    $lastLog = if ($result.BackupSummary.LastLogBackup) { 
        ([datetime]$result.BackupSummary.LastLogBackup).ToString("yyyy-MM-dd HH:mm") 
    } else { 
        "N/A" 
    }
    
    $backupBreaches = $result.BackupSummary.Breaches.Count
    
    # Mantenimiento
    $lastCheckdb = if ($result.MaintenanceSummary.LastCheckdb) { 
        ([datetime]$result.MaintenanceSummary.LastCheckdb).ToString("yyyy-MM-dd HH:mm") 
    } else { 
        "N/A" 
    }
    
    $lastIndexOpt = if ($result.MaintenanceSummary.LastIndexOptimize) { 
        ([datetime]$result.MaintenanceSummary.LastIndexOptimize).ToString("yyyy-MM-dd HH:mm") 
    } else { 
        "N/A" 
    }
    
    # AlwaysOn
    $aoEnabled = $result.AlwaysOnSummary.Enabled
    $aoState = $result.AlwaysOnSummary.WorstState
    $aoIssues = $result.AlwaysOnSummary.Issues.Count
    
    $report += [PSCustomObject]@{
        Instance = $instanceName
        HealthScore = $healthScore
        Status = $healthStatus
        LastFull = $lastFull
        LastLog = $lastLog
        BackupBreaches = $backupBreaches
        LastCheckdb = $lastCheckdb
        LastIndexOpt = $lastIndexOpt
        AOEnabled = $aoEnabled
        AOState = $aoState
        AOIssues = $aoIssues
    }
}

# Mostrar reporte
Write-Host ""
Write-Host "  Resumen de Resultados:" -ForegroundColor Cyan
Write-Host ""

$report | Format-Table -AutoSize

# Validaciones
Write-Host ""
Write-Host "[3/3] Validaciones..." -ForegroundColor Yellow

$validations = @()

# Validación 1: AlwaysOn - Nodos del mismo AG deben tener valores idénticos
$agNodes = $report | Where-Object { $_.AOEnabled -eq $true }
if ($agNodes.Count -gt 1) {
    $groupedByBackup = $agNodes | Group-Object -Property LastFull, LastLog
    
    if ($groupedByBackup.Count -eq 1) {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Backups sincronizados"
            Result = "PASS"
            Details = "Todos los nodos AG tienen los mismos valores de backup"
        }
    } else {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Backups sincronizados"
            Result = "FAIL"
            Details = "Los nodos AG tienen valores de backup diferentes"
        }
    }
    
    # Validación de mantenimiento
    $groupedByMaint = $agNodes | Group-Object -Property LastCheckdb, LastIndexOpt
    
    if ($groupedByMaint.Count -eq 1) {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Mantenimiento sincronizado"
            Result = "PASS"
            Details = "Todos los nodos AG tienen los mismos valores de mantenimiento"
        }
    } else {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Mantenimiento sincronizado"
            Result = "FAIL"
            Details = "Los nodos AG tienen valores de mantenimiento diferentes"
        }
    }
    
    # Validación de AlwaysOn.Enabled
    $allEnabled = ($agNodes | Where-Object { $_.AOEnabled -eq $false }).Count -eq 0
    
    if ($allEnabled) {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Enabled consistente"
            Result = "PASS"
            Details = "Todos los nodos AG tienen Enabled = true"
        }
    } else {
        $validations += [PSCustomObject]@{
            Test = "AlwaysOn - Enabled consistente"
            Result = "FAIL"
            Details = "Algunos nodos AG tienen Enabled = false"
        }
    }
}

# Validación 2: Backups - Ninguna instancia debe tener LastFullBackup = null (excepto si realmente no tiene)
$standaloneWithBackups = $report | Where-Object { $_.AOEnabled -eq $false -and $_.LastFull -ne "N/A" }
$standaloneWithoutBackups = $report | Where-Object { $_.AOEnabled -eq $false -and $_.LastFull -eq "N/A" }

if ($standaloneWithoutBackups.Count -eq 0 -or $standaloneWithBackups.Count -gt 0) {
    $validations += [PSCustomObject]@{
        Test = "Standalone - Detección de backups"
        Result = "PASS"
        Details = "$($standaloneWithBackups.Count) instancia(s) con backups detectados"
    }
} else {
    $validations += [PSCustomObject]@{
        Test = "Standalone - Detección de backups"
        Result = "WARNING"
        Details = "No se detectaron backups en instancias standalone"
    }
}

# Mostrar validaciones
Write-Host ""
$validations | Format-Table -AutoSize

# Resumen final
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

$passCount = ($validations | Where-Object { $_.Result -eq "PASS" }).Count
$failCount = ($validations | Where-Object { $_.Result -eq "FAIL" }).Count
$warnCount = ($validations | Where-Object { $_.Result -eq "WARNING" }).Count

if ($failCount -eq 0 -and $warnCount -eq 0) {
    Write-Host " ✅ TODAS LAS VALIDACIONES PASARON" -ForegroundColor Green
} elseif ($failCount -eq 0) {
    Write-Host " ⚠️ VALIDACIONES PASARON CON ADVERTENCIAS" -ForegroundColor Yellow
} else {
    Write-Host " ❌ ALGUNAS VALIDACIONES FALLARON" -ForegroundColor Red
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "JSON guardado en: $tempJson" -ForegroundColor Gray
Write-Host ""

