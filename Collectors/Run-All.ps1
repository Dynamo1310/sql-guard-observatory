<#
.SYNOPSIS
    Script maestro para ejecutar todos los collectors de Health Score V2

.DESCRIPTION
    Ejecuta los collectors con la frecuencia recomendada:
    - CPU/IO/Conectividad/Memoria/ErroresSev: cada 1-5 min
    - Discos/AG: cada 5-10 min
    - Backups/Mantenimientos/ConfigTempdb: cada 1-24 h

.PARAMETER Mode
    Modo de ejecución:
    - All: Ejecuta todos los collectors (default)
    - Frequent: Solo collectors frecuentes (1-5 min)
    - Periodic: Solo collectors periódicos (5-10 min)
    - Daily: Solo collectors diarios

.PARAMETER Parallel
    Ejecutar collectors en paralelo (requiere PowerShell 7+)

.PARAMETER Debug
    Habilitar modo debug con salida detallada

.EXAMPLE
    .\Run-All.ps1 -Mode Frequent -Debug
    
.EXAMPLE
    .\Run-All.ps1 -Mode All -Parallel

.NOTES
    Para scheduling con Task Scheduler, crear 3 tareas:
    1. Frequent: cada 5 minutos
    2. Periodic: cada 10 minutos
    3. Daily: cada 24 horas
#>

[CmdletBinding()]
param(
    [ValidateSet('All', 'Frequent', 'Periodic', 'Daily')]
    [string]$Mode = 'All',
    
    [string]$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/",
    [string]$SqlServer = "SQLNova",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 30,
    [switch]$Parallel,
    [switch]$Debug
)

$ErrorActionPreference = "Continue"
$ScriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

# Banner
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Health Score V2 - Collector Master" -ForegroundColor Cyan
Write-Host "  Modo: $Mode" -ForegroundColor Cyan
Write-Host "  Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Definir collectors por categoría
$CollectorsFrequent = @(
    'Get-CPU-ToSQL.ps1',
    'Get-IO-ToSQL.ps1',
    'Get-Conectividad-ToSQL.ps1',
    'Get-Memoria-ToSQL.ps1',
    'Get-ErroresSev-ToSQL.ps1'
)

$CollectorsPeriodic = @(
    'Get-Discos-ToSQL.ps1',
    'Get-AG-ToSQL.ps1'
)

$CollectorsDaily = @(
    'Get-Backups-ToSQL.ps1',
    'Get-Mantenimiento-ToSQL.ps1',
    'Get-ConfigTempdb-ToSQL.ps1'
)

# Seleccionar collectors según modo
$CollectorsToRun = @()
switch ($Mode) {
    'All' { 
        $CollectorsToRun = $CollectorsFrequent + $CollectorsPeriodic + $CollectorsDaily 
    }
    'Frequent' { 
        $CollectorsToRun = $CollectorsFrequent 
    }
    'Periodic' { 
        $CollectorsToRun = $CollectorsPeriodic 
    }
    'Daily' { 
        $CollectorsToRun = $CollectorsDaily 
    }
}

Write-Host "Collectors a ejecutar: $($CollectorsToRun.Count)" -ForegroundColor Yellow
Write-Host ""

# Función para ejecutar collector
function Invoke-Collector {
    param(
        [string]$CollectorScript,
        [string]$ApiUrl,
        [string]$SqlServer,
        [string]$SqlDatabase,
        [int]$TimeoutSec,
        [bool]$DebugMode
    )
    
    $collectorPath = Join-Path $ScriptPath $CollectorScript
    
    if (-not (Test-Path $collectorPath)) {
        Write-Host "  [ERROR] No se encuentra: $CollectorScript" -ForegroundColor Red
        return @{ Success = $false; Collector = $CollectorScript; Error = "File not found" }
    }
    
    try {
        $params = @{
            ApiUrl = $ApiUrl
            SqlServer = $SqlServer
            SqlDatabase = $SqlDatabase
            TimeoutSec = $TimeoutSec
        }
        
        if ($DebugMode) {
            $params.Add('Debug', $true)
        }
        
        $startTime = Get-Date
        & $collectorPath @params
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        
        return @{ 
            Success = $LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE
            Collector = $CollectorScript
            Duration = $duration
            Error = $null
        }
    } catch {
        return @{ 
            Success = $false
            Collector = $CollectorScript
            Duration = 0
            Error = $_.Exception.Message
        }
    }
}

# Ejecutar collectors
$results = @()
$startTimeTotal = Get-Date

if ($Parallel -and $PSVersionTable.PSVersion.Major -ge 7) {
    Write-Host "Ejecutando en modo PARALELO (PowerShell 7+)..." -ForegroundColor Green
    Write-Host ""
    
    $results = $CollectorsToRun | ForEach-Object -Parallel {
        $collectorScript = $_
        $scriptPath = $using:ScriptPath
        $apiUrl = $using:ApiUrl
        $sqlServer = $using:SqlServer
        $sqlDatabase = $using:SqlDatabase
        $timeoutSec = $using:TimeoutSec
        $debugMode = $using:Debug
        
        $collectorPath = Join-Path $scriptPath $collectorScript
        
        if (-not (Test-Path $collectorPath)) {
            return @{ Success = $false; Collector = $collectorScript; Error = "File not found"; Duration = 0 }
        }
        
        try {
            $params = @{
                ApiUrl = $apiUrl
                SqlServer = $sqlServer
                SqlDatabase = $sqlDatabase
                TimeoutSec = $timeoutSec
            }
            
            if ($debugMode) { $params.Add('Debug', $true) }
            
            $startTime = Get-Date
            & $collectorPath @params
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalSeconds
            
            return @{ 
                Success = $LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE
                Collector = $collectorScript
                Duration = $duration
                Error = $null
            }
        } catch {
            return @{ 
                Success = $false
                Collector = $collectorScript
                Duration = 0
                Error = $_.Exception.Message
            }
        }
    } -ThrottleLimit 5
    
} else {
    Write-Host "Ejecutando en modo SECUENCIAL..." -ForegroundColor Yellow
    Write-Host ""
    
    foreach ($collector in $CollectorsToRun) {
        $result = Invoke-Collector -CollectorScript $collector -ApiUrl $ApiUrl -SqlServer $SqlServer -SqlDatabase $SqlDatabase -TimeoutSec $TimeoutSec -DebugMode $Debug
        $results += $result
        Write-Host ""
    }
}

$endTimeTotal = Get-Date
$durationTotal = ($endTimeTotal - $startTimeTotal).TotalSeconds

# Resumen
Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  RESUMEN DE EJECUCIÓN" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

$successCount = ($results | Where-Object { $_.Success }).Count
$errorCount = ($results | Where-Object { -not $_.Success }).Count

Write-Host "Total collectors: $($results.Count)" -ForegroundColor White
Write-Host "Exitosos: $successCount" -ForegroundColor Green
Write-Host "Errores: $errorCount" -ForegroundColor $(if($errorCount -gt 0){"Red"}else{"Green"})
Write-Host "Duración total: $([math]::Round($durationTotal, 2))s" -ForegroundColor Yellow
Write-Host ""

# Detalle de errores
if ($errorCount -gt 0) {
    Write-Host "Collectors con errores:" -ForegroundColor Red
    foreach ($result in ($results | Where-Object { -not $_.Success })) {
        Write-Host "  - $($result.Collector): $($result.Error)" -ForegroundColor Red
    }
    Write-Host ""
}

# Detalle de tiempos
Write-Host "Tiempos por collector:" -ForegroundColor White
foreach ($result in ($results | Sort-Object Duration -Descending)) {
    $color = if ($result.Success) { "Green" } else { "Red" }
    $status = if ($result.Success) { "OK" } else { "ERROR" }
    Write-Host "  [$status] $($result.Collector): $([math]::Round($result.Duration, 2))s" -ForegroundColor $color
}

Write-Host ""
Write-Host "Finalizado: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host ""

# Exit code
if ($errorCount -gt 0) {
    exit 1
} else {
    exit 0
}

