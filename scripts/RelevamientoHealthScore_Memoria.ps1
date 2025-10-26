<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de MEMORIA
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Page Life Expectancy (PLE)
    - Memory Grants pendientes y activos
    - Uso de memoria total y por buffer pool
    - Buffer cache hit ratio
    
    Guarda en: InstanceHealth_Memoria
    
    Peso en scoring: 7%
    Fórmula: 0.6×PLE + 0.25×MemoryGrants + 0.15×UsoMemoria
    PLE objetivo = 300 s × GB buffer pool
    Cap: PLE <0.15×objetivo o Grants>10 => cap 60
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 5 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false
$IncludeAWS = $false
$OnlyAWS = $false

#endregion

#region ===== FUNCIONES =====

function Get-MemoryMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        PageLifeExpectancy = 0
        BufferCacheHitRatio = 100.0
        TotalServerMemoryMB = 0
        TargetServerMemoryMB = 0
        MaxServerMemoryMB = 0
        BufferPoolSizeMB = 0
        MemoryGrantsPending = 0
        MemoryGrantsActive = 0
        PLETarget = 0
        MemoryPressure = $false
        StolenServerMemoryMB = 0  # NUEVO: Memoria robada del buffer pool
    }
    
    try {
        $query = @"
-- Memory counters
SELECT 
    counter_name,
    cntr_value
FROM sys.dm_os_performance_counters
WHERE object_name LIKE '%Buffer Manager%'
   OR object_name LIKE '%Memory Manager%'
ORDER BY counter_name;

-- Memory Grants
SELECT 
    COUNT(*) AS GrantsPending
FROM sys.dm_exec_query_memory_grants
WHERE grant_time IS NULL;

SELECT 
    COUNT(*) AS GrantsActive
FROM sys.dm_exec_query_memory_grants
WHERE grant_time IS NOT NULL;

-- Server Memory
SELECT 
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    committed_kb / 1024 AS CommittedMemoryMB,
    committed_target_kb / 1024 AS CommittedTargetMB
FROM sys.dm_os_sys_info;

-- Max Server Memory configurado
SELECT 
    CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations
WHERE name = 'max server memory (MB)';
"@
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            # Procesar múltiples resultsets
            $resultSets = @($data)
            
            # ResultSet 1: Performance Counters
            if ($resultSets.Count -ge 1 -and $resultSets[0]) {
                $counters = $resultSets[0]
                
                foreach ($counter in $counters) {
                    $counterName = $counter.counter_name
                    $counterValue = $counter.cntr_value
                    
                    if ($counterName -like '*Page life expectancy*') {
                        $result.PageLifeExpectancy = [int]$counterValue
                    }
                    elseif ($counterName -like '*Buffer cache hit ratio*' -and $counterName -notlike '*base*') {
                        # Necesitamos el ratio y la base
                        $ratioValue = $counterValue
                        $baseValue = ($counters | Where-Object { $_.counter_name -like '*Buffer cache hit ratio base*' }).cntr_value
                        if ($baseValue -and $baseValue -gt 0) {
                            $result.BufferCacheHitRatio = [decimal](($ratioValue * 100.0) / $baseValue)
                        }
                    }
                    elseif ($counterName -like '*Total Server Memory*') {
                        $result.TotalServerMemoryMB = [int]($counterValue / 1024)
                    }
                    elseif ($counterName -like '*Target Server Memory*') {
                        $result.TargetServerMemoryMB = [int]($counterValue / 1024)
                    }
                    elseif ($counterName -like '*Stolen Server Memory*') {
                        # Stolen memory: memoria usada por objetos fuera del buffer pool
                        $result.StolenServerMemoryMB = [int]($counterValue / 1024)
                    }
                }
            }
            
            # ResultSet 2: Memory Grants Pending
            if ($resultSets.Count -ge 2 -and $resultSets[1]) {
                $grantsPending = $resultSets[1] | Select-Object -First 1
                if ($grantsPending.GrantsPending -ne [DBNull]::Value) {
                    $result.MemoryGrantsPending = [int]$grantsPending.GrantsPending
                }
            }
            
            # ResultSet 3: Memory Grants Active
            if ($resultSets.Count -ge 3 -and $resultSets[2]) {
                $grantsActive = $resultSets[2] | Select-Object -First 1
                if ($grantsActive.GrantsActive -ne [DBNull]::Value) {
                    $result.MemoryGrantsActive = [int]$grantsActive.GrantsActive
                }
            }
            
            # ResultSet 4: System Info (no usado directamente, pero capturamos por si acaso)
            # if ($resultSets.Count -ge 4 -and $resultSets[3]) { }
            
            # ResultSet 5: Max Server Memory
            if ($resultSets.Count -ge 5 -and $resultSets[4]) {
                $maxMem = $resultSets[4] | Select-Object -First 1
                if ($maxMem.MaxServerMemoryMB -ne [DBNull]::Value) {
                    $result.MaxServerMemoryMB = [int]$maxMem.MaxServerMemoryMB
                }
            }
            
            # Calcular buffer pool size y PLE target
            if ($result.TotalServerMemoryMB -gt 0) {
                $result.BufferPoolSizeMB = $result.TotalServerMemoryMB
                $bufferPoolGB = $result.BufferPoolSizeMB / 1024.0
                $result.PLETarget = [int]($bufferPoolGB * 300)  # 300 segundos por GB
            }
            
            # Determinar memory pressure
            if ($result.PageLifeExpectancy -lt ($result.PLETarget * 0.5) -or $result.MemoryGrantsPending -gt 10) {
                $result.MemoryPressure = $true
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo memory metrics en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
        return $connection.IsPingable
    } catch {
        return $false
    }
}

function Write-ToSqlServer {
    param(
        [array]$Data
    )
    
    if ($Data.Count -eq 0) {
        Write-Host "No hay datos para guardar." -ForegroundColor Yellow
        return
    }
    
    try {
        foreach ($row in $Data) {
            $query = @"
INSERT INTO dbo.InstanceHealth_Memoria (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    PageLifeExpectancy,
    BufferCacheHitRatio,
    TotalServerMemoryMB,
    TargetServerMemoryMB,
    MaxServerMemoryMB,
    BufferPoolSizeMB,
    MemoryGrantsPending,
    MemoryGrantsActive,
    PLETarget,
    MemoryPressure,
    StolenServerMemoryMB
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.PageLifeExpectancy),
    $($row.BufferCacheHitRatio),
    $($row.TotalServerMemoryMB),
    $($row.TargetServerMemoryMB),
    $($row.MaxServerMemoryMB),
    $($row.BufferPoolSizeMB),
    $($row.MemoryGrantsPending),
    $($row.MemoryGrantsActive),
    $($row.PLETarget),
    $(if ($row.MemoryPressure) {1} else {0}),
    $($row.StolenServerMemoryMB)
);
"@
            
            Invoke-DbaQuery -SqlInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -EnableException
        }
        
        Write-Host "✅ Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v3.0 - MEMORIA METRICS                 ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 5 minutos                                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    $instances = $instances | Where-Object { $_.NombreInstancia -notlike "*DMZ*" }
    
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Instancias a procesar: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de memoria..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    $memMetrics = Get-MemoryMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($memMetrics.MemoryPressure) {
        $status = "🚨 PRESSURE!"
    }
    elseif ($memMetrics.PageLifeExpectancy -lt 300) {
        $status = "⚠️ LOW PLE!"
    }
    elseif ($memMetrics.MemoryGrantsPending -gt 5) {
        $status = "⚠️ GRANTS!"
    }
    
    $pleRatio = if ($memMetrics.PLETarget -gt 0) { 
        [int](($memMetrics.PageLifeExpectancy * 100) / $memMetrics.PLETarget) 
    } else { 
        100 
    }
    
    Write-Host "   $status $instanceName - PLE:$($memMetrics.PageLifeExpectancy)s ($pleRatio%) Target:$($memMetrics.PLETarget)s Grants:$($memMetrics.MemoryGrantsPending)" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        PageLifeExpectancy = $memMetrics.PageLifeExpectancy
        BufferCacheHitRatio = $memMetrics.BufferCacheHitRatio
        TotalServerMemoryMB = $memMetrics.TotalServerMemoryMB
        TargetServerMemoryMB = $memMetrics.TargetServerMemoryMB
        MaxServerMemoryMB = $memMetrics.MaxServerMemoryMB
        BufferPoolSizeMB = $memMetrics.BufferPoolSizeMB
        MemoryGrantsPending = $memMetrics.MemoryGrantsPending
        MemoryGrantsActive = $memMetrics.MemoryGrantsActive
        PLETarget = $memMetrics.PLETarget
        MemoryPressure = $memMetrics.MemoryPressure
    }
}

Write-Progress -Activity "Recolectando métricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - MEMORIA                                    ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgPLE = ($results | Measure-Object -Property PageLifeExpectancy -Average).Average
Write-Host "║  PLE promedio:         $([int]$avgPLE)s".PadRight(53) "║" -ForegroundColor White

$withPressure = ($results | Where-Object {$_.MemoryPressure}).Count
Write-Host "║  Con memory pressure:  $withPressure".PadRight(53) "║" -ForegroundColor White

$lowPLE = ($results | Where-Object {$_.PageLifeExpectancy -lt 300}).Count
Write-Host "║  PLE bajo (<300s):     $lowPLE".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

