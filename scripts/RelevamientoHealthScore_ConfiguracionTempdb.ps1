<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de CONFIGURACIÓN & TEMPDB
    
.DESCRIPTION
    Script de baja frecuencia (cada 30 minutos) que recolecta:
    - Configuración de TempDB (archivos, tamaños, growth)
    - Contención en TempDB (PAGELATCH waits)
    - Latencia de TempDB
    - Max Server Memory configurado vs óptimo
    
    Guarda en: InstanceHealth_ConfiguracionTempdb
    
    Peso en scoring: 10%
    Fórmula: 60% tempdb + 40% memoria configurada
    Cap: Contención PAGELATCH => cap 65
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 30 minutos
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

function Get-ConfigTempdbMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        # TempDB
        TempDBFileCount = 0
        TempDBAllSameSize = $false
        TempDBAllSameGrowth = $false
        TempDBAvgLatencyMs = 0
        TempDBPageLatchWaits = 0
        TempDBContentionScore = 100
        # Configuración
        MaxServerMemoryMB = 0
        TotalPhysicalMemoryMB = 0
        MaxMemoryPctOfPhysical = 0
        MaxMemoryWithinOptimal = $false
        CPUCount = 0
        Details = @()
    }
    
    try {
        # Detectar versión de SQL Server para compatibilidad
        $versionQuery = "SELECT SERVERPROPERTY('ProductVersion') AS Version"
        $versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
        $version = $versionResult.Version
        $majorVersion = [int]($version.Split('.')[0])
        
        # SQL 2008/2008 R2 usa physical_memory_in_bytes, SQL 2012+ usa physical_memory_kb
        $memoryColumn = if ($majorVersion -ge 11) { 
            "physical_memory_kb / 1024" 
        } else { 
            "physical_memory_in_bytes / 1024 / 1024" 
        }
        
        # Query 1: TempDB Files
        $queryTempDBFiles = @"
SELECT 
    COUNT(*) AS FileCount,
    MIN(size * 8 / 1024) AS MinSizeMB,
    MAX(size * 8 / 1024) AS MaxSizeMB,
    MIN(growth * 8 / 1024) AS MinGrowthMB,
    MAX(growth * 8 / 1024) AS MaxGrowthMB,
    CASE WHEN MIN(size) = MAX(size) THEN 1 ELSE 0 END AS AllSameSize,
    CASE WHEN MIN(growth) = MAX(growth) THEN 1 ELSE 0 END AS AllSameGrowth
FROM sys.master_files
WHERE database_id = DB_ID('tempdb')
  AND type_desc = 'ROWS';
"@
        
        $tempdbFiles = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryTempDBFiles -QueryTimeout $TimeoutSec -EnableException
        if ($tempdbFiles) {
            $result.TempDBFileCount = [int]$tempdbFiles.FileCount
            $result.TempDBAllSameSize = ([int]$tempdbFiles.AllSameSize -eq 1)
            $result.TempDBAllSameGrowth = ([int]$tempdbFiles.AllSameGrowth -eq 1)
            
            $result.Details += "Files=$($result.TempDBFileCount)"
            if (-not $result.TempDBAllSameSize) {
                $result.Details += "SizeMismatch=$($tempdbFiles.MinSizeMB)MB-$($tempdbFiles.MaxSizeMB)MB"
            }
            if (-not $result.TempDBAllSameGrowth) {
                $result.Details += "GrowthMismatch"
            }
        }
        
        # Query 2: TempDB Latency
        $queryLatency = @"
SELECT 
    CASE WHEN num_of_reads = 0 THEN 0 
         ELSE (io_stall_read_ms / num_of_reads) 
    END AS AvgReadLatencyMs,
    CASE WHEN num_of_writes = 0 THEN 0 
         ELSE (io_stall_write_ms / num_of_writes) 
    END AS AvgWriteLatencyMs
FROM sys.dm_io_virtual_file_stats(DB_ID('tempdb'), NULL)
WHERE file_id = 1;
"@
        
        $latency = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryLatency -QueryTimeout $TimeoutSec -EnableException
        if ($latency) {
            $avgRead = if ($latency.AvgReadLatencyMs -ne [DBNull]::Value) { [decimal]$latency.AvgReadLatencyMs } else { 0 }
            $avgWrite = if ($latency.AvgWriteLatencyMs -ne [DBNull]::Value) { [decimal]$latency.AvgWriteLatencyMs } else { 0 }
            $result.TempDBAvgLatencyMs = [decimal](($avgRead + $avgWrite) / 2)
        }
        
        # Query 3: PAGELATCH Waits
        $queryPageLatch = @"
SELECT 
    ISNULL(SUM(wait_time_ms), 0) AS PageLatchWaitMs,
    ISNULL(SUM(waiting_tasks_count), 0) AS PageLatchWaitCount
FROM sys.dm_os_wait_stats
WHERE wait_type LIKE 'PAGELATCH%'
  AND wait_type NOT LIKE 'PAGELATCH_SH%';
"@
        
        $pageLatch = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryPageLatch -QueryTimeout $TimeoutSec -EnableException
        if ($pageLatch -and $pageLatch.PageLatchWaitMs -ne [DBNull]::Value) {
            $result.TempDBPageLatchWaits = [int]$pageLatch.PageLatchWaitMs
            
            # Calcular score de contención (inversamente proporcional a waits)
            if ($result.TempDBPageLatchWaits -eq 0) {
                $result.TempDBContentionScore = 100
            }
            elseif ($result.TempDBPageLatchWaits -lt 100) {
                $result.TempDBContentionScore = 90
            }
            elseif ($result.TempDBPageLatchWaits -lt 1000) {
                $result.TempDBContentionScore = 70
            }
            elseif ($result.TempDBPageLatchWaits -lt 10000) {
                $result.TempDBContentionScore = 40
            }
            else {
                $result.TempDBContentionScore = 0
            }
        }
        
        # Query 4: Max Server Memory
        $queryMaxMem = @"
SELECT CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations
WHERE name = 'max server memory (MB)';
"@
        
        $maxMem = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryMaxMem -QueryTimeout $TimeoutSec -EnableException
        if ($maxMem -and $maxMem.MaxServerMemoryMB -ne [DBNull]::Value) {
            $result.MaxServerMemoryMB = [int]$maxMem.MaxServerMemoryMB
        }
        
        # Query 5: System Info (compatible con SQL 2008+)
        $querySysInfo = @"
SELECT 
    $memoryColumn AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
        
        $sysInfo = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySysInfo -QueryTimeout $TimeoutSec -EnableException
        if ($sysInfo) {
            if ($sysInfo.TotalPhysicalMemoryMB -ne [DBNull]::Value) {
                $result.TotalPhysicalMemoryMB = [int]$sysInfo.TotalPhysicalMemoryMB
            }
            if ($sysInfo.CPUCount -ne [DBNull]::Value) {
                $result.CPUCount = [int]$sysInfo.CPUCount
            }
        }
        
        # Calcular si Max Memory está dentro del rango óptimo
        if ($result.TotalPhysicalMemoryMB -gt 0 -and $result.MaxServerMemoryMB -gt 0) {
            $result.MaxMemoryPctOfPhysical = [decimal](($result.MaxServerMemoryMB * 100.0) / $result.TotalPhysicalMemoryMB)
            
            # Considerar óptimo si está entre 70% y 95%
            if ($result.MaxMemoryPctOfPhysical -ge 70 -and $result.MaxMemoryPctOfPhysical -le 95) {
                $result.MaxMemoryWithinOptimal = $true
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo config/tempdb metrics en ${InstanceName}: $($_.Exception.Message)"
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
            $details = ($row.Details -join "|") -replace "'", "''"
            
            $query = @"
INSERT INTO dbo.InstanceHealth_ConfiguracionTempdb (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    TempDBFileCount,
    TempDBAllSameSize,
    TempDBAllSameGrowth,
    TempDBAvgLatencyMs,
    TempDBPageLatchWaits,
    TempDBContentionScore,
    MaxServerMemoryMB,
    TotalPhysicalMemoryMB,
    MaxMemoryPctOfPhysical,
    MaxMemoryWithinOptimal,
    CPUCount,
    ConfigDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.TempDBFileCount),
    $(if ($row.TempDBAllSameSize) {1} else {0}),
    $(if ($row.TempDBAllSameGrowth) {1} else {0}),
    $($row.TempDBAvgLatencyMs),
    $($row.TempDBPageLatchWaits),
    $($row.TempDBContentionScore),
    $($row.MaxServerMemoryMB),
    $($row.TotalPhysicalMemoryMB),
    $($row.MaxMemoryPctOfPhysical),
    $(if ($row.MaxMemoryWithinOptimal) {1} else {0}),
    $($row.CPUCount),
    '$details'
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
Write-Host "║  Health Score v3.0 - CONFIGURACIÓN & TEMPDB          ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 30 minutos                               ║" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de configuración y TempDB..." -ForegroundColor Yellow

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
    
    $configMetrics = Get-ConfigTempdbMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    $warnings = @()
    
    if ($configMetrics.TempDBPageLatchWaits -gt 10000) {
        $status = "🚨 CONTENTION!"
        $warnings += "High PAGELATCH"
    }
    elseif (-not $configMetrics.TempDBAllSameSize) {
        $warnings += "Size mismatch"
    }
    elseif (-not $configMetrics.MaxMemoryWithinOptimal) {
        $warnings += "Max mem not optimal"
    }
    
    if ($warnings.Count -gt 0 -and $status -eq "✅") {
        $status = "⚠️ " + ($warnings -join ", ")
    }
    
    Write-Host "   $status $instanceName - TempDB:$($configMetrics.TempDBFileCount)files MaxMem:$([int]$configMetrics.MaxMemoryPctOfPhysical)% Contention:$($configMetrics.TempDBContentionScore)" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        TempDBFileCount = $configMetrics.TempDBFileCount
        TempDBAllSameSize = $configMetrics.TempDBAllSameSize
        TempDBAllSameGrowth = $configMetrics.TempDBAllSameGrowth
        TempDBAvgLatencyMs = $configMetrics.TempDBAvgLatencyMs
        TempDBPageLatchWaits = $configMetrics.TempDBPageLatchWaits
        TempDBContentionScore = $configMetrics.TempDBContentionScore
        MaxServerMemoryMB = $configMetrics.MaxServerMemoryMB
        TotalPhysicalMemoryMB = $configMetrics.TotalPhysicalMemoryMB
        MaxMemoryPctOfPhysical = $configMetrics.MaxMemoryPctOfPhysical
        MaxMemoryWithinOptimal = $configMetrics.MaxMemoryWithinOptimal
        CPUCount = $configMetrics.CPUCount
        Details = $configMetrics.Details
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
Write-Host "║  RESUMEN - CONFIGURACIÓN & TEMPDB                     ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgFiles = ($results | Measure-Object -Property TempDBFileCount -Average).Average
Write-Host "║  TempDB files avg:     $([int]$avgFiles)".PadRight(53) "║" -ForegroundColor White

$sameSize = ($results | Where-Object {$_.TempDBAllSameSize}).Count
Write-Host "║  Con same size:        $sameSize".PadRight(53) "║" -ForegroundColor White

$withContention = ($results | Where-Object {$_.TempDBContentionScore -lt 70}).Count
Write-Host "║  Con contención:       $withContention".PadRight(53) "║" -ForegroundColor White

$optimalMem = ($results | Where-Object {$_.MaxMemoryWithinOptimal}).Count
Write-Host "║  Max mem óptimo:       $optimalMem".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

