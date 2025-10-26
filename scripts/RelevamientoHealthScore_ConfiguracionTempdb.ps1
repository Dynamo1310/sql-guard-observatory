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
        # TempDB - Archivos
        TempDBFileCount = 0
        TempDBAllSameSize = $false
        TempDBAllSameGrowth = $false
        TempDBTotalSizeMB = 0
        TempDBUsedSpaceMB = 0
        TempDBFreeSpacePct = 0
        
        # TempDB - Rendimiento
        TempDBAvgReadLatencyMs = 0
        TempDBAvgWriteLatencyMs = 0
        TempDBPageLatchWaits = 0
        TempDBContentionScore = 100
        TempDBVersionStoreMB = 0
        
        # TempDB - Configuración
        TempDBAvgFileSizeMB = 0
        TempDBMinFileSizeMB = 0
        TempDBMaxFileSizeMB = 0
        TempDBGrowthConfigOK = $true
        
        # Configuración del Servidor
        MaxServerMemoryMB = 0
        TotalPhysicalMemoryMB = 0
        MaxMemoryPctOfPhysical = 0
        MaxMemoryWithinOptimal = $false
        CPUCount = 0
        Details = @()
    }
    
    try {
        # Detectar versión de SQL Server para compatibilidad
        $versionQuery = "SELECT SERVERPROPERTY('ProductVersion') AS Version, @@VERSION AS VersionString"
        $versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
        $version = $versionResult.Version
        $majorVersion = [int]($version.Split('.')[0])
        
        # Query 1: TempDB Files (extendido con más métricas)
        $queryTempDBFiles = @"
SELECT 
    COUNT(*) AS FileCount,
    SUM(size * 8 / 1024) AS TotalSizeMB,
    AVG(size * 8 / 1024) AS AvgSizeMB,
    MIN(size * 8 / 1024) AS MinSizeMB,
    MAX(size * 8 / 1024) AS MaxSizeMB,
    MIN(growth * 8 / 1024) AS MinGrowthMB,
    MAX(growth * 8 / 1024) AS MaxGrowthMB,
    CASE WHEN MIN(size) = MAX(size) THEN 1 ELSE 0 END AS AllSameSize,
    CASE WHEN MIN(growth) = MAX(growth) THEN 1 ELSE 0 END AS AllSameGrowth,
    CASE WHEN MIN(growth) >= 64 AND SUM(CAST(is_percent_growth AS INT)) = 0 THEN 1 ELSE 0 END AS GrowthConfigOK
FROM sys.master_files
WHERE database_id = DB_ID('tempdb')
  AND type_desc = 'ROWS';
"@
        
        $tempdbFiles = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryTempDBFiles -QueryTimeout $TimeoutSec -EnableException
        if ($tempdbFiles) {
            $result.TempDBFileCount = [int]$tempdbFiles.FileCount
            $result.TempDBTotalSizeMB = [int]$tempdbFiles.TotalSizeMB
            $result.TempDBAvgFileSizeMB = [int]$tempdbFiles.AvgSizeMB
            $result.TempDBMinFileSizeMB = [int]$tempdbFiles.MinSizeMB
            $result.TempDBMaxFileSizeMB = [int]$tempdbFiles.MaxSizeMB
            $result.TempDBAllSameSize = ([int]$tempdbFiles.AllSameSize -eq 1)
            $result.TempDBAllSameGrowth = ([int]$tempdbFiles.AllSameGrowth -eq 1)
            $result.TempDBGrowthConfigOK = ([int]$tempdbFiles.GrowthConfigOK -eq 1)
            
            $result.Details += "Files=$($result.TempDBFileCount)"
            if (-not $result.TempDBAllSameSize) {
                $result.Details += "SizeMismatch=$($tempdbFiles.MinSizeMB)MB-$($tempdbFiles.MaxSizeMB)MB"
            }
            if (-not $result.TempDBAllSameGrowth) {
                $result.Details += "GrowthMismatch"
            }
            if (-not $result.TempDBGrowthConfigOK) {
                $result.Details += "SmallGrowth"
            }
        }
        
        # Query 2: TempDB Latency (separar read/write para mejor diagnóstico)
        $queryLatency = @"
SELECT 
    AVG(CASE WHEN vfs.num_of_reads = 0 THEN 0 ELSE (vfs.io_stall_read_ms * 1.0 / vfs.num_of_reads) END) AS AvgReadLatencyMs,
    AVG(CASE WHEN vfs.num_of_writes = 0 THEN 0 ELSE (vfs.io_stall_write_ms * 1.0 / vfs.num_of_writes) END) AS AvgWriteLatencyMs
FROM sys.dm_io_virtual_file_stats(DB_ID('tempdb'), NULL) vfs
INNER JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
WHERE mf.type = 0;  -- Solo archivos de datos (ROWS)
"@
        
        $latency = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryLatency -QueryTimeout $TimeoutSec -EnableException
        if ($latency) {
            $result.TempDBAvgReadLatencyMs = if ($latency.AvgReadLatencyMs -ne [DBNull]::Value) { [Math]::Round([decimal]$latency.AvgReadLatencyMs, 2) } else { 0 }
            $result.TempDBAvgWriteLatencyMs = if ($latency.AvgWriteLatencyMs -ne [DBNull]::Value) { [Math]::Round([decimal]$latency.AvgWriteLatencyMs, 2) } else { 0 }
            
            # Diagnóstico de disco
            if ($result.TempDBAvgWriteLatencyMs -gt 50) {
                $result.Details += "SlowDisk(>50ms)"
            }
            elseif ($result.TempDBAvgWriteLatencyMs -gt 20) {
                $result.Details += "RegularDisk(>20ms)"
            }
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
        
        # Query 3.5: Espacio usado en TempDB (SQL 2012+)
        if ($majorVersion -ge 11) {
            $querySpaceUsage = @"
SELECT 
    SUM(total_page_count) * 8 / 1024 AS TotalSizeMB,
    SUM(allocated_extent_page_count) * 8 / 1024 AS UsedSpaceMB,
    SUM(version_store_reserved_page_count) * 8 / 1024 AS VersionStoreMB,
    CASE 
        WHEN SUM(total_page_count) > 0 
        THEN CAST((SUM(total_page_count) - SUM(allocated_extent_page_count)) * 100.0 / SUM(total_page_count) AS DECIMAL(5,2))
        ELSE 0 
    END AS FreeSpacePct
FROM sys.dm_db_file_space_usage
WHERE database_id = DB_ID('tempdb');
"@
            
            try {
                $spaceUsage = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySpaceUsage -QueryTimeout $TimeoutSec -EnableException
                if ($spaceUsage) {
                    $result.TempDBUsedSpaceMB = if ($spaceUsage.UsedSpaceMB -ne [DBNull]::Value) { [int]$spaceUsage.UsedSpaceMB } else { 0 }
                    $result.TempDBFreeSpacePct = if ($spaceUsage.FreeSpacePct -ne [DBNull]::Value) { [decimal]$spaceUsage.FreeSpacePct } else { 0 }
                    $result.TempDBVersionStoreMB = if ($spaceUsage.VersionStoreMB -ne [DBNull]::Value) { [int]$spaceUsage.VersionStoreMB } else { 0 }
                    
                    # Alertas
                    if ($result.TempDBFreeSpacePct -lt 10) {
                        $result.Details += "LowFreeSpace(<10%)"
                    }
                    if ($result.TempDBVersionStoreMB -gt 1024) {
                        $result.Details += "LargeVersionStore(>1GB)"
                    }
                }
            }
            catch {
                # sys.dm_db_file_space_usage puede no estar disponible en algunas versiones
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
            $maxMemValue = [int]$maxMem.MaxServerMemoryMB
            
            # Detectar valor por defecto "unlimited" (2147483647 = 2^31-1)
            # Este es el máximo de INT32 y significa que no está configurado
            if ($maxMemValue -eq 2147483647) {
                $result.MaxServerMemoryMB = 0  # Marcar como no configurado
                $result.Details += "MaxMem=UNLIMITED(NotSet)"
            }
            else {
                $result.MaxServerMemoryMB = $maxMemValue
            }
        }
        
        # Query 5: System Info (compatible con SQL 2008+)
        # Construir query según versión para evitar problemas de expansión de variables
        if ($majorVersion -ge 11) {
            # SQL Server 2012+ (versión 11+): usa physical_memory_kb
            $querySysInfo = @"
SELECT 
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
        }
        else {
            # SQL Server 2008/2008 R2 (versión 10): usa physical_memory_in_bytes
            $querySysInfo = @"
SELECT 
    physical_memory_in_bytes / 1024 / 1024 AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
        }
        
        $sysInfo = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySysInfo -QueryTimeout $TimeoutSec -EnableException
        if ($sysInfo) {
            if ($sysInfo.TotalPhysicalMemoryMB -ne [DBNull]::Value) {
                $rawValue = [long]$sysInfo.TotalPhysicalMemoryMB
                
                # Validar que el valor sea razonable (entre 512 MB y 16 TB)
                if ($rawValue -gt 0 -and $rawValue -lt 16777216) {
                    $result.TotalPhysicalMemoryMB = [int]$rawValue
                }
                else {
                    Write-Warning "Valor de memoria física sospechoso en ${InstanceName}: $rawValue MB"
                    # Intentar obtener de otra fuente
                    $altQuery = "SELECT total_physical_memory_kb / 1024 AS TotalPhysicalMemoryMB FROM sys.dm_os_sys_memory"
                    try {
                        $altMem = Invoke-DbaQuery -SqlInstance $InstanceName -Query $altQuery -QueryTimeout $TimeoutSec -EnableException
                        if ($altMem -and $altMem.TotalPhysicalMemoryMB -gt 0) {
                            $result.TotalPhysicalMemoryMB = [int]$altMem.TotalPhysicalMemoryMB
                        }
                    }
                    catch {
                        # SQL 2008 no tiene sys.dm_os_sys_memory
                    }
                }
            }
            if ($sysInfo.CPUCount -ne [DBNull]::Value) {
                $result.CPUCount = [int]$sysInfo.CPUCount
            }
        }
        
        # Calcular si Max Memory está dentro del rango óptimo (con validaciones)
        if ($result.MaxServerMemoryMB -eq 0) {
            # Max Memory no está configurado (valor por defecto unlimited)
            $result.MaxMemoryPctOfPhysical = 0
            $result.MaxMemoryWithinOptimal = $false
        }
        elseif ($result.TotalPhysicalMemoryMB -gt 512 -and $result.MaxServerMemoryMB -gt 0) {
            $calculatedPct = ($result.MaxServerMemoryMB * 100.0) / $result.TotalPhysicalMemoryMB
            
            # Validar que el porcentaje sea razonable (0-200%)
            if ($calculatedPct -ge 0 -and $calculatedPct -le 200) {
                $result.MaxMemoryPctOfPhysical = [Math]::Round($calculatedPct, 2)
                
                # Considerar óptimo si está entre 70% y 95%
                if ($result.MaxMemoryPctOfPhysical -ge 70 -and $result.MaxMemoryPctOfPhysical -le 95) {
                    $result.MaxMemoryWithinOptimal = $true
                }
            }
            else {
                Write-Warning "Porcentaje de memoria inválido en ${InstanceName}: $calculatedPct% (MaxMem=$($result.MaxServerMemoryMB)MB, Total=$($result.TotalPhysicalMemoryMB)MB)"
                $result.MaxMemoryPctOfPhysical = 0
            }
        }
        else {
            if ($result.TotalPhysicalMemoryMB -le 512) {
                Write-Warning "Memoria física muy baja o inválida en ${InstanceName}: $($result.TotalPhysicalMemoryMB)MB"
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
            
            # Validar y truncar MaxMemoryPctOfPhysical para que no exceda DECIMAL(5,2)
            $maxMemPct = $row.MaxMemoryPctOfPhysical
            if ($maxMemPct -gt 999.99) {
                Write-Warning "MaxMemoryPctOfPhysical truncado para $($row.InstanceName): $maxMemPct → 999.99"
                $maxMemPct = 999.99
            }
            if ($maxMemPct -lt -999.99) {
                $maxMemPct = -999.99
            }
            
            # Validar TempDBFreeSpacePct para DECIMAL(5,2)
            $freeSpacePct = $row.TempDBFreeSpacePct
            if ($freeSpacePct -gt 999.99) { $freeSpacePct = 999.99 }
            if ($freeSpacePct -lt 0) { $freeSpacePct = 0 }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_ConfiguracionTempdb (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    -- TempDB - Archivos
    TempDBFileCount,
    TempDBAllSameSize,
    TempDBAllSameGrowth,
    TempDBTotalSizeMB,
    TempDBUsedSpaceMB,
    TempDBFreeSpacePct,
    -- TempDB - Rendimiento
    TempDBAvgReadLatencyMs,
    TempDBAvgWriteLatencyMs,
    TempDBPageLatchWaits,
    TempDBContentionScore,
    TempDBVersionStoreMB,
    -- TempDB - Configuración
    TempDBAvgFileSizeMB,
    TempDBMinFileSizeMB,
    TempDBMaxFileSizeMB,
    TempDBGrowthConfigOK,
    -- Servidor
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
    -- TempDB - Archivos
    $($row.TempDBFileCount),
    $(if ($row.TempDBAllSameSize) {1} else {0}),
    $(if ($row.TempDBAllSameGrowth) {1} else {0}),
    $($row.TempDBTotalSizeMB),
    $($row.TempDBUsedSpaceMB),
    $freeSpacePct,
    -- TempDB - Rendimiento
    $($row.TempDBAvgReadLatencyMs),
    $($row.TempDBAvgWriteLatencyMs),
    $($row.TempDBPageLatchWaits),
    $($row.TempDBContentionScore),
    $($row.TempDBVersionStoreMB),
    -- TempDB - Configuración
    $($row.TempDBAvgFileSizeMB),
    $($row.TempDBMinFileSizeMB),
    $($row.TempDBMaxFileSizeMB),
    $(if ($row.TempDBGrowthConfigOK) {1} else {0}),
    -- Servidor
    $($row.MaxServerMemoryMB),
    $($row.TotalPhysicalMemoryMB),
    $maxMemPct,
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
    
    # Validar si hay datos válidos
    if ($configMetrics.MaxMemoryPctOfPhysical -eq 0 -and $configMetrics.TempDBFileCount -eq 0) {
        $status = "❌ NO DATA"
        Write-Host "   $status $instanceName - No se pudieron obtener métricas" -ForegroundColor Red
    }
    else {
        # Verificar si Max Memory está sin configurar (UNLIMITED)
        $isUnlimited = ($configMetrics.MaxServerMemoryMB -eq 0 -and $configMetrics.Details -like "*UNLIMITED*")
        
        # Verificar problemas críticos
        if ($configMetrics.TempDBContentionScore -eq 0) {
            $status = "🚨 CONTENTION!"
            $warnings += "PAGELATCH=$($configMetrics.TempDBPageLatchWaits)ms"
        }
        elseif ($configMetrics.TempDBContentionScore -lt 70) {
            $warnings += "Contention=$($configMetrics.TempDBContentionScore)"
        }
        
        # Verificar configuración
        if (-not $configMetrics.TempDBAllSameSize -and $configMetrics.TempDBFileCount -gt 1) {
            $warnings += "Size mismatch"
        }
        
        # Problema crítico: Max Memory no configurado
        if ($isUnlimited) {
            $warnings += "MaxMem=UNLIMITED⚠️"
        }
        elseif (-not $configMetrics.MaxMemoryWithinOptimal -and $configMetrics.MaxMemoryPctOfPhysical -gt 0) {
            $warnings += "MaxMem=$([int]$configMetrics.MaxMemoryPctOfPhysical)%"
        }
        
        # Solo 1 archivo de TempDB
        if ($configMetrics.TempDBFileCount -eq 1) {
            $warnings += "1 file only!"
        }
        
        if ($warnings.Count -gt 0 -and $status -eq "✅") {
            $status = "⚠️ " + ($warnings -join ", ")
        }
        
        # Formato mejorado con métricas adicionales
        if ($isUnlimited) {
            $memDisplay = "UNLIMITED"
            $color = "Yellow"
        }
        elseif ($configMetrics.MaxMemoryPctOfPhysical -gt 0) {
            $memDisplay = "$([Math]::Round($configMetrics.MaxMemoryPctOfPhysical, 1))%"
            $color = "DarkGray"
        }
        else {
            $memDisplay = "N/A"
            $color = "DarkGray"
        }
        
        # Información de latencia si está disponible
        $latencyInfo = ""
        if ($configMetrics.TempDBAvgWriteLatencyMs -gt 50) {
            $latencyInfo = " [Disk:$([Math]::Round($configMetrics.TempDBAvgWriteLatencyMs, 0))ms🐌]"
        }
        elseif ($configMetrics.TempDBAvgWriteLatencyMs -gt 20) {
            $latencyInfo = " [Disk:$([Math]::Round($configMetrics.TempDBAvgWriteLatencyMs, 0))ms]"
        }
        
        # Información de espacio si está disponible
        $spaceInfo = ""
        if ($configMetrics.TempDBFreeSpacePct -gt 0 -and $configMetrics.TempDBFreeSpacePct -lt 10) {
            $spaceInfo = " [Free:$([Math]::Round($configMetrics.TempDBFreeSpacePct, 0))%⚠️]"
        }
        
        Write-Host "   $status $instanceName" -ForegroundColor Gray -NoNewline
        Write-Host " | Files:$($configMetrics.TempDBFileCount) Mem:$memDisplay Score:$($configMetrics.TempDBContentionScore)$latencyInfo$spaceInfo" -ForegroundColor $color
    }
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        # TempDB - Archivos
        TempDBFileCount = $configMetrics.TempDBFileCount
        TempDBAllSameSize = $configMetrics.TempDBAllSameSize
        TempDBAllSameGrowth = $configMetrics.TempDBAllSameGrowth
        TempDBTotalSizeMB = $configMetrics.TempDBTotalSizeMB
        TempDBUsedSpaceMB = $configMetrics.TempDBUsedSpaceMB
        TempDBFreeSpacePct = $configMetrics.TempDBFreeSpacePct
        # TempDB - Rendimiento
        TempDBAvgReadLatencyMs = $configMetrics.TempDBAvgReadLatencyMs
        TempDBAvgWriteLatencyMs = $configMetrics.TempDBAvgWriteLatencyMs
        TempDBPageLatchWaits = $configMetrics.TempDBPageLatchWaits
        TempDBContentionScore = $configMetrics.TempDBContentionScore
        TempDBVersionStoreMB = $configMetrics.TempDBVersionStoreMB
        # TempDB - Configuración
        TempDBAvgFileSizeMB = $configMetrics.TempDBAvgFileSizeMB
        TempDBMinFileSizeMB = $configMetrics.TempDBMinFileSizeMB
        TempDBMaxFileSizeMB = $configMetrics.TempDBMaxFileSizeMB
        TempDBGrowthConfigOK = $configMetrics.TempDBGrowthConfigOK
        # Servidor
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
Write-Host "║  📊 GENERAL                                           ║" -ForegroundColor Cyan
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgFiles = ($results | Measure-Object -Property TempDBFileCount -Average).Average
Write-Host "║  TempDB files avg:     $([int]$avgFiles)".PadRight(53) "║" -ForegroundColor White

$sameSize = ($results | Where-Object {$_.TempDBAllSameSize}).Count
Write-Host "║  Con same size:        $sameSize".PadRight(53) "║" -ForegroundColor White

$goodGrowth = ($results | Where-Object {$_.TempDBGrowthConfigOK}).Count
Write-Host "║  Growth bien config:   $goodGrowth".PadRight(53) "║" -ForegroundColor White

Write-Host "║                                                       ║" -ForegroundColor White
Write-Host "║  🔥 CONTENCIÓN                                        ║" -ForegroundColor Cyan

$withContention = ($results | Where-Object {$_.TempDBContentionScore -lt 70}).Count
$pctContention = if ($results.Count -gt 0) { [Math]::Round(($withContention * 100.0) / $results.Count, 1) } else { 0 }
Write-Host "║  Con contención:       $withContention ($pctContention%)".PadRight(53) "║" -ForegroundColor $(if ($withContention -gt 50) {"Red"} elseif ($withContention -gt 20) {"Yellow"} else {"White"})

$criticalContention = ($results | Where-Object {$_.TempDBContentionScore -eq 0}).Count
Write-Host "║  Contención crítica:   $criticalContention".PadRight(53) "║" -ForegroundColor $(if ($criticalContention -gt 0) {"Red"} else {"White"})

Write-Host "║                                                       ║" -ForegroundColor White
Write-Host "║  💾 DISCO                                             ║" -ForegroundColor Cyan

$slowDisk = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 20}).Count
if ($slowDisk -gt 0) {
    Write-Host "║  ⚠️  Disco lento (>20ms): $slowDisk".PadRight(53) "║" -ForegroundColor Yellow
}

$verySlowDisk = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 50}).Count
if ($verySlowDisk -gt 0) {
    Write-Host "║  🚨 Disco MUY lento:    $verySlowDisk".PadRight(53) "║" -ForegroundColor Red
}

$avgWriteLatency = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 0} | Measure-Object -Property TempDBAvgWriteLatencyMs -Average).Average
if ($avgWriteLatency -gt 0) {
    Write-Host "║  Latencia write avg:   $([Math]::Round($avgWriteLatency, 1))ms".PadRight(53) "║" -ForegroundColor White
}

Write-Host "║                                                       ║" -ForegroundColor White
Write-Host "║  🧠 MEMORIA                                           ║" -ForegroundColor Cyan

$optimalMem = ($results | Where-Object {$_.MaxMemoryWithinOptimal}).Count
Write-Host "║  Max mem óptimo:       $optimalMem".PadRight(53) "║" -ForegroundColor White

$unlimitedMem = ($results | Where-Object {$_.MaxServerMemoryMB -eq 0}).Count
if ($unlimitedMem -gt 0) {
    Write-Host "║  ⚠️  Max mem UNLIMITED:  $unlimitedMem".PadRight(53) "║" -ForegroundColor Yellow
}

$lowSpace = ($results | Where-Object {$_.TempDBFreeSpacePct -gt 0 -and $_.TempDBFreeSpacePct -lt 20}).Count
if ($lowSpace -gt 0) {
    Write-Host "║  ⚠️  Espacio bajo (<20%): $lowSpace".PadRight(53) "║" -ForegroundColor Yellow
}

$bigVersionStore = ($results | Where-Object {$_.TempDBVersionStoreMB -gt 1024}).Count
if ($bigVersionStore -gt 0) {
    Write-Host "║  ⚠️  Version store >1GB:  $bigVersionStore".PadRight(53) "║" -ForegroundColor Yellow
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

