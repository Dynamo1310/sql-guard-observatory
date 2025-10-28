<#
.SYNOPSIS
    Health Score v3.0 - RecolecciÃ³n de mÃ©tricas de CONFIGURACIÃ“N & TEMPDB
    
.DESCRIPTION
    Script de baja frecuencia (cada 30 minutos) que recolecta:
    - ConfiguraciÃ³n de TempDB (archivos, tamaÃ±os, growth)
    - ContenciÃ³n en TempDB (PAGELATCH waits)
    - Latencia de TempDB (read/write separadas)
    - Espacio libre y version store
    - Max Server Memory configurado vs Ã³ptimo
    
    Guarda en: InstanceHealth_ConfiguracionTempdb
    
    TempDB Health Score Compuesto (0-100 puntos):
    - 40% ContenciÃ³n (PAGELATCH waits)
    - 30% Latencia de disco (write latency)
    - 20% ConfiguraciÃ³n (archivos, same size, growth)
    - 10% Recursos (espacio libre, version store)
    
    Peso en HealthScore v3: 8%
    FÃ³rmula consolidador: 60% tempdb health + 40% memoria configurada
    
.NOTES
    VersiÃ³n: 3.0.1 (Score Compuesto)
    Frecuencia: Cada 30 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÃ“N =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false
$IncludeAWS = $false
$OnlyAWS = $false

#endregion

#region ===== FUNCIONES =====

function Calculate-TempDBHealthScore {
    <#
    .SYNOPSIS
        Calcula un score compuesto de TempDB considerando TODAS las mÃ©tricas
    .DESCRIPTION
        FÃ³rmula del TempDB Health Score (0-100 puntos):
        
        1. CONTENCIÃ“N (40%) - PAGELATCH waits
           - 0 waits = 100 pts
           - <100 waits = 90 pts
           - <1,000 waits = 70 pts
           - <10,000 waits = 40 pts
           - â‰¥10,000 waits = 0 pts
        
        2. LATENCIA DE DISCO (30%) - Write latency promedio
           - â‰¤5ms = 100 pts
           - â‰¤10ms = 90 pts
           - â‰¤20ms = 70 pts
           - â‰¤50ms = 40 pts
           - >50ms = 0 pts
        
        3. CONFIGURACIÃ“N (20%) - Files, same size, same growth
           - Archivos Ã³ptimos (1 por CPU, mÃ¡x 8)
           - Same size
           - Same growth
           - Growth config OK (â‰¥64MB, no % growth)
        
        4. RECURSOS (10%) - Espacio libre, version store
           - Free space â‰¥20% = 100 pts
           - Free space 10-19% = 60 pts
           - Free space <10% = 0 pts
           - Version store penalizaciÃ³n
    #>
    param(
        [int]$PageLatchWaits,
        [decimal]$AvgWriteLatencyMs,
        [int]$FileCount,
        [int]$CPUCount,
        [bool]$AllSameSize,
        [bool]$AllSameGrowth,
        [bool]$GrowthConfigOK,
        [decimal]$FreeSpacePct,
        [int]$VersionStoreMB
    )
    
    # 1. CONTENCIÃ“N (40 pts)
    $contentionScore = 0
    if ($PageLatchWaits -eq 0) {
        $contentionScore = 100
    }
    elseif ($PageLatchWaits -lt 100) {
        $contentionScore = 90
    }
    elseif ($PageLatchWaits -lt 1000) {
        $contentionScore = 70
    }
    elseif ($PageLatchWaits -lt 10000) {
        $contentionScore = 40
    }
    else {
        $contentionScore = 0
    }
    $contentionContribution = $contentionScore * 0.40
    
    # 2. LATENCIA DE DISCO (30 pts)
    $diskScore = 0
    if ($AvgWriteLatencyMs -eq 0) {
        $diskScore = 100  # Sin datos, asumir OK
    }
    elseif ($AvgWriteLatencyMs -le 5) {
        $diskScore = 100  # Excelente (SSD/NVMe)
    }
    elseif ($AvgWriteLatencyMs -le 10) {
        $diskScore = 90   # Muy bueno
    }
    elseif ($AvgWriteLatencyMs -le 20) {
        $diskScore = 70   # Aceptable
    }
    elseif ($AvgWriteLatencyMs -le 50) {
        $diskScore = 40   # Lento
    }
    else {
        $diskScore = 0    # CrÃ­tico
    }
    $diskContribution = $diskScore * 0.30
    
    # 3. CONFIGURACIÃ“N (20 pts)
    $configScore = 100
    
    # NÃºmero Ã³ptimo de archivos (mÃ­nimo 4, mÃ¡ximo 8)
    # Best practice moderna: MIN(MAX(CPUs, 4), 8)
    if ($CPUCount -le 0) { 
        $optimalFiles = 4  # Default si no hay CPUCount
    } else {
        $optimalFiles = [Math]::Min([Math]::Max($CPUCount, 4), 8)
    }
    
    if ($FileCount -eq $optimalFiles) {
        # Perfecto
        $configScore -= 0
    }
    elseif ($FileCount -ge ($optimalFiles / 2)) {
        # Aceptable (al menos la mitad)
        $configScore -= 20
    }
    elseif ($FileCount -ge 2) {
        # SubÃ³ptimo
        $configScore -= 40
    }
    elseif ($FileCount -eq 1) {
        # CrÃ­tico - un solo archivo
        $configScore -= 60
    }
    else {
        # Sin datos
        $configScore -= 30
    }
    
    # Same size (fundamental para evitar hotspots)
    if (-not $AllSameSize) {
        $configScore -= 20
    }
    
    # Same growth (importante para mantener balance)
    if (-not $AllSameGrowth) {
        $configScore -= 10
    }
    
    # Growth config OK (â‰¥64MB, no % growth)
    if (-not $GrowthConfigOK) {
        $configScore -= 10
    }
    
    if ($configScore -lt 0) { $configScore = 0 }
    $configContribution = $configScore * 0.20
    
    # 4. RECURSOS (10 pts)
    $resourceScore = 100
    
    # Espacio libre
    if ($FreeSpacePct -eq 0) {
        # Sin datos, penalizar moderadamente
        $resourceScore -= 20
    }
    elseif ($FreeSpacePct -ge 20) {
        # Ã“ptimo
        $resourceScore -= 0
    }
    elseif ($FreeSpacePct -ge 10) {
        # Aceptable
        $resourceScore -= 40
    }
    else {
        # CrÃ­tico
        $resourceScore -= 100
    }
    
    # Version store (penalizaciÃ³n si es muy grande)
    if ($VersionStoreMB -gt 5120) {
        # >5 GB = problema serio
        $resourceScore -= 50
    }
    elseif ($VersionStoreMB -gt 2048) {
        # >2 GB = advertencia
        $resourceScore -= 30
    }
    elseif ($VersionStoreMB -gt 1024) {
        # >1 GB = monitorear
        $resourceScore -= 10
    }
    
    if ($resourceScore -lt 0) { $resourceScore = 0 }
    $resourceContribution = $resourceScore * 0.10
    
    # SCORE FINAL
    $finalScore = [int][Math]::Round($contentionContribution + $diskContribution + $configContribution + $resourceContribution, 0)
    
    return $finalScore
}

function Get-ConfigTempdbMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    # Inicializar variables de versiÃ³n con valores por defecto seguros
    $isSql2005 = $false
    $majorVersion = 10  # Asumir SQL 2008+ por defecto
    
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
        TempDBMountPoint = ""
        TempDBPageLatchWaits = 0
        TempDBContentionScore = 100
        TempDBVersionStoreMB = 0
        
        # TempDB - ConfiguraciÃ³n
        TempDBAvgFileSizeMB = 0
        TempDBMinFileSizeMB = 0
        TempDBMaxFileSizeMB = 0
        TempDBGrowthConfigOK = $true
        
        # ConfiguraciÃ³n del Servidor
        MaxServerMemoryMB = 0
        TotalPhysicalMemoryMB = 0
        MaxMemoryPctOfPhysical = 0
        MaxMemoryWithinOptimal = $false
        CPUCount = 0
        Details = @()
    }
    
    try {
        # Detectar versiÃ³n de SQL Server para compatibilidad (una sola vez)
        try {
            $versionQuery = "SELECT SERVERPROPERTY('ProductVersion') AS Version, @@VERSION AS VersionString"
            $versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
            $version = $versionResult.Version
            $majorVersion = [int]($version.Split('.')[0])
            $isSql2005 = ($majorVersion -lt 10)  # SQL 2005 = version 9.x, SQL 2008 = version 10.x
        } catch {
            # Si falla la detecciÃ³n, usar valores por defecto (SQL 2008+)
            Write-Verbose "No se pudo detectar versiÃ³n de SQL Server en ${InstanceName}, asumiendo SQL 2008+"
        }
        
        # Query 1: TempDB Files (extendido con mÃ¡s mÃ©tricas)
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
        
        try {
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
                
                Write-Verbose "${InstanceName}: TempDB Files = $($result.TempDBFileCount), Total Size = $($result.TempDBTotalSizeMB) MB"
            }
            else {
                Write-Warning "âš ï¸  ${InstanceName}: Query de archivos TempDB no retornÃ³ datos"
                $result.Details += "TempDBFilesQueryEmpty"
            }
        }
        catch {
            Write-Warning "âš ï¸  ${InstanceName}: Error obteniendo archivos de TempDB: $($_.Exception.Message)"
            $result.Details += "TempDBFilesQueryFailed"
        }
        
        # Query 2: TempDB Latency y Mount Point (para diagnÃ³stico de disco)
        # Intentar primero con sys.dm_os_volume_stats, si falla usar fallback
        $latencySuccess = $false
        
        if (-not $isSql2005) {
            # Intentar SQL 2008+ (query con sys.dm_os_volume_stats)
            try {
                $queryLatency = @"
SELECT 
    AVG(CASE WHEN vfs.num_of_reads = 0 THEN 0 ELSE (vfs.io_stall_read_ms * 1.0 / vfs.num_of_reads) END) AS AvgReadLatencyMs,
    AVG(CASE WHEN vfs.num_of_writes = 0 THEN 0 ELSE (vfs.io_stall_write_ms * 1.0 / vfs.num_of_writes) END) AS AvgWriteLatencyMs,
    (SELECT TOP 1 vs.volume_mount_point 
     FROM sys.master_files mf2
     CROSS APPLY sys.dm_os_volume_stats(mf2.database_id, mf2.file_id) vs
     WHERE mf2.database_id = DB_ID('tempdb') AND mf2.type = 0
     ORDER BY mf2.file_id) AS MountPoint
FROM sys.dm_io_virtual_file_stats(DB_ID('tempdb'), NULL) vfs
INNER JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
WHERE mf.type = 0;  -- Solo archivos de datos (ROWS)
"@
                $latency = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryLatency -QueryTimeout $TimeoutSec -EnableException
                $latencySuccess = $true
            } catch {
                # Si falla (permisos, DMV no disponible, etc.), usar fallback
                Write-Verbose "sys.dm_os_volume_stats no disponible en ${InstanceName}, usando fallback"
            }
        }
        
        # FALLBACK: Si es SQL 2005 o si fallÃ³ el query anterior
        if (-not $latencySuccess) {
            try {
                $queryLatency = @"
SELECT 
    AVG(CASE WHEN vfs.num_of_reads = 0 THEN 0 ELSE (vfs.io_stall_read_ms * 1.0 / vfs.num_of_reads) END) AS AvgReadLatencyMs,
    AVG(CASE WHEN vfs.num_of_writes = 0 THEN 0 ELSE (vfs.io_stall_write_ms * 1.0 / vfs.num_of_writes) END) AS AvgWriteLatencyMs,
    (SELECT TOP 1 LEFT(physical_name, 3)
     FROM sys.master_files
     WHERE database_id = DB_ID('tempdb') AND type = 0
     ORDER BY file_id) AS MountPoint
FROM sys.dm_io_virtual_file_stats(DB_ID('tempdb'), NULL) vfs
INNER JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
WHERE mf.type = 0;  -- Solo archivos de datos (ROWS)
"@
                $latency = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryLatency -QueryTimeout $TimeoutSec -EnableException
                $latencySuccess = $true
            } catch {
                Write-Warning "No se pudo obtener latencia de TempDB en ${InstanceName}: $($_.Exception.Message)"
            }
        }
        
        if ($latencySuccess -and $latency) {
            $result.TempDBAvgReadLatencyMs = if ($latency.AvgReadLatencyMs -ne [DBNull]::Value) { [Math]::Round([decimal]$latency.AvgReadLatencyMs, 2) } else { 0 }
            $result.TempDBAvgWriteLatencyMs = if ($latency.AvgWriteLatencyMs -ne [DBNull]::Value) { [Math]::Round([decimal]$latency.AvgWriteLatencyMs, 2) } else { 0 }
            # Limitar MountPoint a mÃ¡ximo 10 caracteres para evitar truncamiento SQL
            $mountPoint = if ($latency.MountPoint -ne [DBNull]::Value) { $latency.MountPoint.ToString().Trim() } else { "" }
            $result.TempDBMountPoint = if ($mountPoint.Length -gt 10) { $mountPoint.Substring(0, 10) } else { $mountPoint }
            
            # DiagnÃ³stico de disco
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
        }
        
        # Query 3.5: Espacio usado en TempDB (SQL 2012+)
        # IMPORTANTE: sys.dm_db_file_space_usage puede devolver NULL si TempDB no tiene actividad
        # En ese caso, usar TotalSizeMB de sys.master_files (ya obtenido en Query 1)
        if ($majorVersion -ge 11) {
            $querySpaceUsage = @"
SELECT 
    ISNULL(SUM(total_page_count) * 8 / 1024, 0) AS TotalSizeMB,
    ISNULL(SUM(allocated_extent_page_count) * 8 / 1024, 0) AS UsedSpaceMB,
    ISNULL(SUM(version_store_reserved_page_count) * 8 / 1024, 0) AS VersionStoreMB,
    CASE 
        WHEN SUM(total_page_count) > 0 
        THEN CAST((SUM(total_page_count) - SUM(allocated_extent_page_count)) * 100.0 / SUM(total_page_count) AS DECIMAL(5,2))
        ELSE 0 
    END AS FreeSpacePct,
    COUNT(*) AS RecordCount  -- Para detectar si la DMV tiene datos
FROM sys.dm_db_file_space_usage
WHERE database_id = DB_ID('tempdb');
"@
            
            try {
                $spaceUsage = Invoke-DbaQuery -SqlInstance $InstanceName -Query $querySpaceUsage -QueryTimeout $TimeoutSec -EnableException
                if ($spaceUsage) {
                    # Verificar si la DMV tiene datos reales (RecordCount > 0 y valores no nulos)
                    $hasRealData = ($spaceUsage.RecordCount -gt 0) -and ($spaceUsage.TotalSizeMB -gt 0)
                    
                    if ($hasRealData) {
                        # DMV con datos vÃ¡lidos - usar esos valores
                        $result.TempDBUsedSpaceMB = [int]$spaceUsage.UsedSpaceMB
                        $result.TempDBFreeSpacePct = [decimal]$spaceUsage.FreeSpacePct
                        $result.TempDBVersionStoreMB = [int]$spaceUsage.VersionStoreMB
                        
                        Write-Verbose "${InstanceName}: TempDB UsedSpace = $($result.TempDBUsedSpaceMB) MB (from DMV)"
                    }
                    else {
                        # DMV vacÃ­a o sin actividad - calcular FreeSpace estimado desde sys.master_files
                        if ($result.TempDBTotalSizeMB -gt 0) {
                            # Asumir que estÃ¡ mayormente libre si no hay actividad
                            $result.TempDBUsedSpaceMB = 0
                            $result.TempDBFreeSpacePct = 95.0  # EstimaciÃ³n conservadora
                            $result.TempDBVersionStoreMB = 0
                            
                            Write-Verbose "${InstanceName}: TempDB sin actividad en DMV - usando valores por defecto (FreeSpace estimado: 95%)"
                            $result.Details += "TempDB-NoActivity"
                        }
                        else {
                            Write-Warning "âš ï¸  ${InstanceName}: sys.dm_db_file_space_usage vacÃ­a Y TotalSizeMB=0"
                            $result.Details += "TempDB-NoData"
                        }
                    }
                    
                    # Alertas (solo si hay datos reales)
                    if ($hasRealData) {
                        if ($result.TempDBFreeSpacePct -lt 10) {
                            $result.Details += "LowFreeSpace(<10%)"
                        }
                        if ($result.TempDBVersionStoreMB -gt 1024) {
                            $result.Details += "LargeVersionStore(>1GB)"
                        }
                    }
                }
                else {
                    Write-Warning "âš ï¸  ${InstanceName}: sys.dm_db_file_space_usage no retornÃ³ filas"
                    $result.Details += "NoSpaceData"
                }
            }
            catch {
                Write-Warning "âš ï¸  ${InstanceName}: Error obteniendo espacio de TempDB: $($_.Exception.Message)"
                $result.Details += "SpaceQueryFailed"
            }
        }
        else {
            # SQL 2008 o anterior - no tiene sys.dm_db_file_space_usage
            Write-Verbose "${InstanceName}: SQL $majorVersion - sys.dm_db_file_space_usage no disponible (requiere SQL 2012+)"
            $result.Details += "SQL2008-NoSpaceData"
        }
        
        # Query 4: Max Server Memory
        $queryMaxMem = @"
SELECT CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations
WHERE name = 'max server memory (MB)';
"@
        
        try {
            $maxMem = Invoke-DbaQuery -SqlInstance $InstanceName -Query $queryMaxMem -QueryTimeout $TimeoutSec -EnableException
            if ($maxMem -and $maxMem.MaxServerMemoryMB -ne [DBNull]::Value) {
                $maxMemValue = [int]$maxMem.MaxServerMemoryMB
                
                # Detectar valor por defecto "unlimited" (2147483647 = 2^31-1)
                # Este es el mÃ¡ximo de INT32 y significa que no estÃ¡ configurado
                if ($maxMemValue -eq 2147483647) {
                    $result.MaxServerMemoryMB = 0  # Marcar como no configurado
                    $result.Details += "MaxMem=UNLIMITED(NotSet)"
                    Write-Verbose "${InstanceName}: Max Server Memory = UNLIMITED (valor por defecto, no configurado)"
                }
                else {
                    $result.MaxServerMemoryMB = $maxMemValue
                    Write-Verbose "${InstanceName}: Max Server Memory = $maxMemValue MB"
                }
            }
            else {
                Write-Warning "âš ï¸  ${InstanceName}: Query de Max Memory no retornÃ³ datos"
                $result.Details += "MaxMemQueryEmpty"
            }
        }
        catch {
            Write-Warning "âš ï¸  ${InstanceName}: Error obteniendo Max Server Memory: $($_.Exception.Message)"
            $result.Details += "MaxMemQueryFailed"
        }
        
        # Query 5: System Info (compatible con SQL 2008+)
        # Construir query segÃºn versiÃ³n para evitar problemas de expansiÃ³n de variables
        if ($majorVersion -ge 11) {
            # SQL Server 2012+ (versiÃ³n 11+): usa physical_memory_kb
            $querySysInfo = @"
SELECT 
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    cpu_count AS CPUCount
FROM sys.dm_os_sys_info;
"@
        }
        else {
            # SQL Server 2008/2008 R2 (versiÃ³n 10): usa physical_memory_in_bytes
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
                    Write-Warning "Valor de memoria fÃ­sica sospechoso en ${InstanceName}: $rawValue MB"
                    # Intentar obtener de otra fuente
                    $altQuery = "SELECT total_physical_memory_kb / 1024 AS TotalPhysicalMemoryMB FROM sys.dm_os_sys_memory"
                    try {
                        $altMem = Invoke-DbaQuery -SqlInstance $InstanceName -Query $altQuery -QueryTimeout $TimeoutSec -EnableException
                        if ($altMem -and $altMem.TotalPhysicalMemoryMB -gt 0) {
                            $result.TotalPhysicalMemoryMB = [int]$altMem.TotalPhysicalMemoryMB
                        }
                    }
                    catch {
                        Write-Warning "âš ï¸  ${InstanceName}: sys.dm_os_sys_memory no disponible (SQL 2008 o anterior)"
                    }
                }
            }
            if ($sysInfo.CPUCount -ne [DBNull]::Value) {
                $result.CPUCount = [int]$sysInfo.CPUCount
            }
            
            Write-Verbose "${InstanceName}: Physical Memory = $($result.TotalPhysicalMemoryMB) MB, CPU Count = $($result.CPUCount)"
        }
        else {
            Write-Warning "âš ï¸  ${InstanceName}: Query de System Info no retornÃ³ datos"
            $result.Details += "SysInfoQueryEmpty"
        }
        
        # Calcular si Max Memory estÃ¡ dentro del rango Ã³ptimo (con validaciones)
        if ($result.MaxServerMemoryMB -eq 0) {
            # Max Memory no estÃ¡ configurado (valor por defecto unlimited)
            $result.MaxMemoryPctOfPhysical = 0
            $result.MaxMemoryWithinOptimal = $false
        }
        elseif ($result.TotalPhysicalMemoryMB -gt 512 -and $result.MaxServerMemoryMB -gt 0) {
            $calculatedPct = ($result.MaxServerMemoryMB * 100.0) / $result.TotalPhysicalMemoryMB
            
            # Validar que el porcentaje sea razonable (>0%)
            if ($calculatedPct -ge 0) {
                # Truncar a 999.99 para evitar overflow en SQL (DECIMAL(5,2))
                if ($calculatedPct -gt 999.99) {
                    $result.MaxMemoryPctOfPhysical = 999.99
                    Write-Warning "âš ï¸  Max Memory configurado EXCESIVAMENTE alto en ${InstanceName}: $([Math]::Round($calculatedPct, 2))% (MaxMem=$($result.MaxServerMemoryMB)MB > Total=$($result.TotalPhysicalMemoryMB)MB) - Posible error de configuraciÃ³n"
                }
                else {
                    $result.MaxMemoryPctOfPhysical = [Math]::Round($calculatedPct, 2)
                    
                    # Advertir si estÃ¡ configurado por encima del 100% (no recomendado)
                    if ($calculatedPct -gt 100) {
                        Write-Warning "âš ï¸  Max Memory configurado por ENCIMA de RAM fÃ­sica en ${InstanceName}: $([Math]::Round($calculatedPct, 2))% (MaxMem=$($result.MaxServerMemoryMB)MB, Total=$($result.TotalPhysicalMemoryMB)MB)"
                    }
                }
                
                # Considerar Ã³ptimo si estÃ¡ entre 70% y 95%
                if ($result.MaxMemoryPctOfPhysical -ge 70 -and $result.MaxMemoryPctOfPhysical -le 95) {
                    $result.MaxMemoryWithinOptimal = $true
                }
            }
            else {
                # Porcentaje negativo (no deberÃ­a pasar)
                Write-Warning "âŒ Porcentaje de memoria negativo en ${InstanceName}: $calculatedPct% - Datos incorrectos"
                $result.MaxMemoryPctOfPhysical = 0
            }
        }
        else {
            if ($result.TotalPhysicalMemoryMB -le 512) {
                Write-Warning "Memoria fÃ­sica muy baja o invÃ¡lida en ${InstanceName}: $($result.TotalPhysicalMemoryMB)MB"
            }
        }
        
    } catch {
        Write-Warning "âŒ Error GENERAL obteniendo config/tempdb metrics en ${InstanceName}: $($_.Exception.Message)"
        $result.Details += "GeneralError"
    }
    
    # Calcular TempDB Health Score Compuesto (considerando TODAS las mÃ©tricas)
    $result.TempDBContentionScore = Calculate-TempDBHealthScore `
        -PageLatchWaits $result.TempDBPageLatchWaits `
        -AvgWriteLatencyMs $result.TempDBAvgWriteLatencyMs `
        -FileCount $result.TempDBFileCount `
        -CPUCount $result.CPUCount `
        -AllSameSize $result.TempDBAllSameSize `
        -AllSameGrowth $result.TempDBAllSameGrowth `
        -GrowthConfigOK $result.TempDBGrowthConfigOK `
        -FreeSpacePct $result.TempDBFreeSpacePct `
        -VersionStoreMB $result.TempDBVersionStoreMB
    
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
                Write-Warning "MaxMemoryPctOfPhysical truncado para $($row.InstanceName): $maxMemPct â†’ 999.99"
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
    TempDBMountPoint,
    TempDBPageLatchWaits,
    TempDBContentionScore,
    TempDBVersionStoreMB,
    -- TempDB - ConfiguraciÃ³n
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
    GETDATE(),
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
    '$($row.TempDBMountPoint)',
    $($row.TempDBPageLatchWaits),
    $($row.TempDBContentionScore),
    $($row.TempDBVersionStoreMB),
    -- TempDB - ConfiguraciÃ³n
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
        
        Write-Host "âœ… Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Cyan
Write-Host "â•‘  Health Score v3.0 - CONFIGURACIÃ“N & TEMPDB          â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Frecuencia: 30 minutos                               â•‘" -ForegroundColor Cyan
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1ï¸âƒ£  Obteniendo instancias desde API..." -ForegroundColor Yellow

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
Write-Host "2ï¸âƒ£  Recolectando mÃ©tricas de configuraciÃ³n y TempDB..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando mÃ©tricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
        continue
    }
    
    $configMetrics = Get-ConfigTempdbMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "âœ…"
    $warnings = @()
    
    # Validar si hay datos vÃ¡lidos
    if ($configMetrics.MaxMemoryPctOfPhysical -eq 0 -and $configMetrics.TempDBFileCount -eq 0) {
        $status = "âŒ NO DATA"
        Write-Host "   $status $instanceName - No se pudieron obtener mÃ©tricas" -ForegroundColor Red
    }
    else {
        # Verificar si Max Memory estÃ¡ sin configurar (UNLIMITED)
        $isUnlimited = ($configMetrics.MaxServerMemoryMB -eq 0 -and $configMetrics.Details -like "*UNLIMITED*")
        
        # Verificar problemas crÃ­ticos
        if ($configMetrics.TempDBContentionScore -lt 40) {
            $status = "ðŸš¨ CRÃTICO!"
            if ($configMetrics.TempDBPageLatchWaits -gt 10000) {
                $warnings += "PAGELATCH_CRÃTICO"
            }
            if ($configMetrics.TempDBAvgWriteLatencyMs -gt 50) {
                $warnings += "Disco_Lento(>50ms)"
            }
        }
        elseif ($configMetrics.TempDBContentionScore -lt 70) {
            $warnings += "TempDB_Score=$($configMetrics.TempDBContentionScore)"
        }
        
        # Verificar configuraciÃ³n
        if (-not $configMetrics.TempDBAllSameSize -and $configMetrics.TempDBFileCount -gt 1) {
            $warnings += "Size mismatch"
        }
        
        # Problema crÃ­tico: Max Memory no configurado
        if ($isUnlimited) {
            $warnings += "MaxMem=UNLIMITEDâš ï¸"
        }
        elseif (-not $configMetrics.MaxMemoryWithinOptimal -and $configMetrics.MaxMemoryPctOfPhysical -gt 0) {
            $warnings += "MaxMem=$([int]$configMetrics.MaxMemoryPctOfPhysical)%"
        }
        
        # Solo 1 archivo de TempDB
        if ($configMetrics.TempDBFileCount -eq 1) {
            $warnings += "1 file only!"
        }
        
        if ($warnings.Count -gt 0 -and $status -eq "âœ…") {
            $status = "âš ï¸ " + ($warnings -join ", ")
        }
        
        # Formato mejorado con mÃ©tricas adicionales
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
        
        # InformaciÃ³n de latencia si estÃ¡ disponible
        $latencyInfo = ""
        if ($configMetrics.TempDBAvgWriteLatencyMs -gt 50) {
            $latencyInfo = " [Disk:$([Math]::Round($configMetrics.TempDBAvgWriteLatencyMs, 0))msðŸŒ]"
        }
        elseif ($configMetrics.TempDBAvgWriteLatencyMs -gt 20) {
            $latencyInfo = " [Disk:$([Math]::Round($configMetrics.TempDBAvgWriteLatencyMs, 0))ms]"
        }
        
        # InformaciÃ³n de espacio si estÃ¡ disponible
        $spaceInfo = ""
        if ($configMetrics.Details -contains "TempDB-NoActivity") {
            $spaceInfo = " [NoActivity~95%]"
        }
        elseif ($configMetrics.TempDBFreeSpacePct -gt 0 -and $configMetrics.TempDBFreeSpacePct -lt 10) {
            $spaceInfo = " [Free:$([Math]::Round($configMetrics.TempDBFreeSpacePct, 0))%âš ï¸]"
        }
        elseif ($configMetrics.TempDBFreeSpacePct -gt 0) {
            $spaceInfo = " [Free:$([Math]::Round($configMetrics.TempDBFreeSpacePct, 0))%]"
        }
        
        Write-Host "   $status $instanceName" -ForegroundColor Gray -NoNewline
        Write-Host " | Files:$($configMetrics.TempDBFileCount) Mem:$memDisplay TempDB_Score:$($configMetrics.TempDBContentionScore)$latencyInfo$spaceInfo" -ForegroundColor $color
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
        TempDBMountPoint = $configMetrics.TempDBMountPoint
        TempDBPageLatchWaits = $configMetrics.TempDBPageLatchWaits
        TempDBContentionScore = $configMetrics.TempDBContentionScore
        TempDBVersionStoreMB = $configMetrics.TempDBVersionStoreMB
        # TempDB - ConfiguraciÃ³n
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

Write-Progress -Activity "Recolectando mÃ©tricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3ï¸âƒ£  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Green
Write-Host "â•‘  RESUMEN - CONFIGURACIÃ“N & TEMPDB                     â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  ðŸ“Š GENERAL                                           â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Total instancias:     $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White

$avgFiles = ($results | Measure-Object -Property TempDBFileCount -Average).Average
Write-Host "â•‘  TempDB files avg:     $([int]$avgFiles)".PadRight(53) "â•‘" -ForegroundColor White

$sameSize = ($results | Where-Object {$_.TempDBAllSameSize}).Count
Write-Host "â•‘  Con same size:        $sameSize".PadRight(53) "â•‘" -ForegroundColor White

$goodGrowth = ($results | Where-Object {$_.TempDBGrowthConfigOK}).Count
Write-Host "â•‘  Growth bien config:   $goodGrowth".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•‘                                                       â•‘" -ForegroundColor White
Write-Host "â•‘  ðŸ¥ TEMPDB HEALTH SCORE (Score Compuesto)            â•‘" -ForegroundColor Cyan

$withProblems = ($results | Where-Object {$_.TempDBContentionScore -lt 70}).Count
$pctProblems = if ($results.Count -gt 0) { [Math]::Round(($withProblems * 100.0) / $results.Count, 1) } else { 0 }
Write-Host "â•‘  Score <70 (problemas): $withProblems ($pctProblems%)".PadRight(53) "â•‘" -ForegroundColor $(if ($withProblems -gt 50) {"Red"} elseif ($withProblems -gt 20) {"Yellow"} else {"White"})

$criticalHealth = ($results | Where-Object {$_.TempDBContentionScore -lt 40}).Count
Write-Host "â•‘  Score <40 (crÃ­tico):   $criticalHealth".PadRight(53) "â•‘" -ForegroundColor $(if ($criticalHealth -gt 0) {"Red"} else {"White"})

$avgScore = if ($results.Count -gt 0) { [Math]::Round(($results | Measure-Object -Property TempDBContentionScore -Average).Average, 1) } else { 0 }
Write-Host "â•‘  Score promedio:        $avgScore/100".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•‘                                                       â•‘" -ForegroundColor White
Write-Host "â•‘  ðŸ’¾ DISCO                                             â•‘" -ForegroundColor Cyan

$slowDisk = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 20}).Count
if ($slowDisk -gt 0) {
    Write-Host "â•‘  âš ï¸  Disco lento (>20ms): $slowDisk".PadRight(53) "â•‘" -ForegroundColor Yellow
}

$verySlowDisk = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 50}).Count
if ($verySlowDisk -gt 0) {
    Write-Host "â•‘  ðŸš¨ Disco MUY lento:    $verySlowDisk".PadRight(53) "â•‘" -ForegroundColor Red
}

$avgWriteLatency = ($results | Where-Object {$_.TempDBAvgWriteLatencyMs -gt 0} | Measure-Object -Property TempDBAvgWriteLatencyMs -Average).Average
if ($avgWriteLatency -gt 0) {
    Write-Host "â•‘  Latencia write avg:   $([Math]::Round($avgWriteLatency, 1))ms".PadRight(53) "â•‘" -ForegroundColor White
}

Write-Host "â•‘                                                       â•‘" -ForegroundColor White
Write-Host "â•‘  ðŸ§  MEMORIA                                           â•‘" -ForegroundColor Cyan

$optimalMem = ($results | Where-Object {$_.MaxMemoryWithinOptimal}).Count
Write-Host "â•‘  Max mem Ã³ptimo:       $optimalMem".PadRight(53) "â•‘" -ForegroundColor White

$unlimitedMem = ($results | Where-Object {$_.MaxServerMemoryMB -eq 0}).Count
if ($unlimitedMem -gt 0) {
    Write-Host "â•‘  âš ï¸  Max mem UNLIMITED:  $unlimitedMem".PadRight(53) "â•‘" -ForegroundColor Yellow
}

$lowSpace = ($results | Where-Object {$_.TempDBFreeSpacePct -gt 0 -and $_.TempDBFreeSpacePct -lt 20}).Count
if ($lowSpace -gt 0) {
    Write-Host "â•‘  âš ï¸  Espacio bajo (<20%): $lowSpace".PadRight(53) "â•‘" -ForegroundColor Yellow
}

$bigVersionStore = ($results | Where-Object {$_.TempDBVersionStoreMB -gt 1024}).Count
if ($bigVersionStore -gt 0) {
    Write-Host "â•‘  âš ï¸  Version store >1GB:  $bigVersionStore".PadRight(53) "â•‘" -ForegroundColor Yellow
}

Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green
Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


