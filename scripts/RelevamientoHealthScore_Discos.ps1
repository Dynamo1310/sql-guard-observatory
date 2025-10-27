<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de ESPACIO EN DISCOS Y DIAGNÓSTICO I/O
    
.DESCRIPTION
    Script de frecuencia media (cada 10 minutos) que recolecta:
    
    ESPACIO EN DISCOS:
    - Espacio libre por disco/volumen
    - Clasificación por rol (Data, Log, Backup, TempDB)
    - Tendencia de crecimiento
    
    DIAGNÓSTICO DE DISCOS (NUEVO v3.1):
    - Tipo de disco físico (HDD/SSD/NVMe) via PowerShell remoting
    - Bus Type (SATA/SAS/NVMe/iSCSI)
    - Health Status (Healthy/Warning/Unhealthy)
    - Operational Status (Online/Offline/Degraded)
    
    MÉTRICAS DE CARGA I/O:
    - Page Reads/Writes per sec
    - Lazy Writes per sec (presión de memoria)
    - Checkpoint Pages per sec
    - Batch Requests per sec
    
    ANÁLISIS DE COMPETENCIA:
    - Cuántas bases de datos por volumen
    - Cuántos archivos por volumen
    - Lista de bases de datos en cada disco
    
    Guarda en: InstanceHealth_Discos
    
    Peso en scoring: 8%
    Criterios: ≥20% libre = 100, 15–19% = 80, 10–14% = 60, 5–9% = 40, <5% = 0
    Cap: Data o Log <10% libre => cap 40
    
    NOTA: El tipo de disco físico requiere PowerShell remoting habilitado.
    Si falla, el sistema inferirá el tipo por latencia en el Consolidador.
    
.NOTES
    Versión: 3.1 (Diagnóstico Inteligente de I/O)
    Frecuencia: Cada 10 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
    - PowerShell Remoting habilitado (opcional, para tipo de disco)
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

function Get-DiskMediaType {
    <#
    .SYNOPSIS
        Obtiene el tipo de disco físico (HDD/SSD/NVMe) y su estado de salud
    #>
    param(
        [string]$InstanceName,
        [string]$MountPoint
    )
    
    try {
        # Obtener servidor físico (sin instancia nombrada)
        $serverName = $InstanceName.Split('\')[0]
        
        # Limpiar mount point para obtener letra de unidad (E:\ -> E)
        $driveLetter = $MountPoint.TrimEnd('\').TrimEnd(':')
        
        # Intentar obtener información del disco físico vía PowerShell remoting
        $diskInfo = Invoke-Command -ComputerName $serverName -ScriptBlock {
            param($drive)
            
            try {
                # Obtener partición por letra de unidad
                $partition = Get-Partition | Where-Object { $_.DriveLetter -eq $drive } | Select-Object -First 1
                
                if ($partition) {
                    # Obtener disco físico
                    $disk = Get-Disk -Number $partition.DiskNumber
                    
                    return @{
                        MediaType = $disk.MediaType           # HDD, SSD, Unspecified
                        BusType = $disk.BusType               # SATA, SAS, NVMe, iSCSI, etc.
                        HealthStatus = $disk.HealthStatus     # Healthy, Warning, Unhealthy
                        OperationalStatus = $disk.OperationalStatus  # Online, Offline, Degraded
                    }
                }
                
                return $null
                
            } catch {
                return $null
            }
        } -ArgumentList $driveLetter -ErrorAction SilentlyContinue
        
        if ($diskInfo) {
            return $diskInfo
        }
        
    } catch {
        # Si falla PowerShell remoting, no es crítico
        # El sistema inferirá tipo de disco por latencia después
    }
    
    # Fallback: valores desconocidos
    return @{
        MediaType = "Unknown"
        BusType = "Unknown"
        HealthStatus = "Unknown"
        OperationalStatus = "Unknown"
    }
}

function Get-DiskMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        WorstFreePct = 100
        DataDiskAvgFreePct = 100
        LogDiskAvgFreePct = 100
        TempDBDiskFreePct = 100
        Volumes = @()
        DataVolumes = @()
        LogVolumes = @()
    }
    
    try {
        # Query 1: Espacio en discos con clasificación por rol
        $querySpace = @"
-- Espacio en discos con clasificación por rol
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct,
    -- Determinar rol del disco basado en tipo de archivo
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole,
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.type_desc AS FileType
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
"@

        # Query 2: Métricas de carga de I/O del sistema
        $queryIOLoad = @"
-- Métricas de carga de I/O
SELECT 
    -- Page Life Expectancy como indicador de presión de memoria -> más I/O
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Page life expectancy' 
     AND object_name LIKE '%Buffer Manager%') AS PageLifeExpectancy,
    
    -- Page reads/writes per sec (carga actual de I/O)
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Page reads/sec' 
     AND object_name LIKE '%Buffer Manager%') AS PageReadsPerSec,
    
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Page writes/sec' 
     AND object_name LIKE '%Buffer Manager%') AS PageWritesPerSec,
    
    -- Lazy writes (indicador de memoria presionada)
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Lazy writes/sec' 
     AND object_name LIKE '%Buffer Manager%') AS LazyWritesPerSec,
    
    -- Checkpoint pages/sec (carga de escritura por checkpoints)
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Checkpoint pages/sec' 
     AND object_name LIKE '%Buffer Manager%') AS CheckpointPagesPerSec,
    
    -- Batch Requests/sec (carga general del servidor)
    (SELECT cntr_value 
     FROM sys.dm_os_performance_counters 
     WHERE counter_name = 'Batch Requests/sec' 
     AND object_name LIKE '%SQL Statistics%') AS BatchRequestsPerSec;
"@

        # Query 3: Análisis de competencia por disco (cuántas DBs/archivos por volumen)
        $queryCompetition = @"
-- Análisis de competencia por volumen
SELECT 
    vs.volume_mount_point AS MountPoint,
    COUNT(DISTINCT mf.database_id) AS DatabaseCount,
    COUNT(mf.file_id) AS FileCount,
    SUM(mf.size * 8.0 / 1024) AS TotalSizeMB,
    STRING_AGG(DB_NAME(mf.database_id), ',') AS DatabaseList
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
GROUP BY vs.volume_mount_point;
"@
        
        # Ejecutar queries
        $dataSpace = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $querySpace `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $dataIOLoad = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryIOLoad `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $dataCompetition = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryCompetition `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        # Almacenar métricas de I/O del sistema (globales)
        if ($dataIOLoad) {
            $result.PageLifeExpectancy = [int]($dataIOLoad.PageLifeExpectancy ?? 0)
            $result.PageReadsPerSec = [int]($dataIOLoad.PageReadsPerSec ?? 0)
            $result.PageWritesPerSec = [int]($dataIOLoad.PageWritesPerSec ?? 0)
            $result.LazyWritesPerSec = [int]($dataIOLoad.LazyWritesPerSec ?? 0)
            $result.CheckpointPagesPerSec = [int]($dataIOLoad.CheckpointPagesPerSec ?? 0)
            $result.BatchRequestsPerSec = [int]($dataIOLoad.BatchRequestsPerSec ?? 0)
        }
        
        if ($dataSpace) {
            # Obtener volúmenes únicos para procesamiento
            $uniqueVolumes = $dataSpace | Select-Object -Property MountPoint, VolumeName, TotalGB, FreeGB, FreePct -Unique
            
            # Procesar cada volumen único
            $result.Volumes = $uniqueVolumes | ForEach-Object {
                $mountPoint = $_.MountPoint
                
                # Obtener info de competencia para este volumen
                $competition = $dataCompetition | Where-Object { $_.MountPoint -eq $mountPoint } | Select-Object -First 1
                
                # Determinar roles del volumen
                $volumeRoles = $dataSpace | Where-Object { $_.MountPoint -eq $mountPoint }
                $isTempDB = ($volumeRoles | Where-Object { $_.DiskRole -eq 'TempDB' }) -ne $null
                $isData = ($volumeRoles | Where-Object { $_.DiskRole -eq 'Data' }) -ne $null
                $isLog = ($volumeRoles | Where-Object { $_.DiskRole -eq 'Log' }) -ne $null
                
                # Obtener tipo de disco físico (puede ser lento, usar con precaución)
                $diskTypeInfo = Get-DiskMediaType -InstanceName $InstanceName -MountPoint $mountPoint
                
                # Crear objeto de volumen enriquecido
                @{
                    MountPoint = $mountPoint
                    VolumeName = $_.VolumeName
                    TotalGB = [decimal]$_.TotalGB
                    FreeGB = [decimal]$_.FreeGB
                    FreePct = [decimal]$_.FreePct
                    
                    # Flags de rol
                    IsTempDBDisk = $isTempDB
                    IsDataDisk = $isData
                    IsLogDisk = $isLog
                    
                    # Información de disco físico
                    MediaType = $diskTypeInfo.MediaType
                    BusType = $diskTypeInfo.BusType
                    HealthStatus = $diskTypeInfo.HealthStatus
                    OperationalStatus = $diskTypeInfo.OperationalStatus
                    
                    # Competencia (cuántas DBs/archivos)
                    DatabaseCount = if ($competition) { [int]$competition.DatabaseCount } else { 0 }
                    FileCount = if ($competition) { [int]$competition.FileCount } else { 0 }
                    DatabaseList = if ($competition) { $competition.DatabaseList } else { "" }
                }
            }
            
            # Peor porcentaje libre
            $result.WorstFreePct = [decimal](($dataSpace | Measure-Object -Property FreePct -Minimum).Minimum)
            
            # Promedio por rol
            $dataDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Data' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($dataDisks) {
                $result.DataDiskAvgFreePct = [decimal](($dataDisks | Measure-Object -Property FreePct -Average).Average)
                $result.DataVolumes = $dataDisks | ForEach-Object { $_.MountPoint }
            }
            
            $logDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Log' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($logDisks) {
                $result.LogDiskAvgFreePct = [decimal](($logDisks | Measure-Object -Property FreePct -Average).Average)
                $result.LogVolumes = $logDisks | ForEach-Object { $_.MountPoint }
            }
            
            $tempdbDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'TempDB' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($tempdbDisks) {
                $result.TempDBDiskFreePct = [decimal](($tempdbDisks | Measure-Object -Property FreePct -Average).Average)
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo disk metrics en ${InstanceName}: $($_.Exception.Message)"
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
            # Convertir volumes a JSON (ahora incluye mucha más información)
            $volumesJson = ($row.Volumes | ConvertTo-Json -Compress -Depth 3) -replace "'", "''"
            
            # Valores para métricas de I/O (globales)
            $pageLifeExp = if ($row.PageLifeExpectancy) { $row.PageLifeExpectancy } else { 0 }
            $pageReadsPerSec = if ($row.PageReadsPerSec) { $row.PageReadsPerSec } else { 0 }
            $pageWritesPerSec = if ($row.PageWritesPerSec) { $row.PageWritesPerSec } else { 0 }
            $lazyWritesPerSec = if ($row.LazyWritesPerSec) { $row.LazyWritesPerSec } else { 0 }
            $checkpointPagesPerSec = if ($row.CheckpointPagesPerSec) { $row.CheckpointPagesPerSec } else { 0 }
            $batchRequestsPerSec = if ($row.BatchRequestsPerSec) { $row.BatchRequestsPerSec } else { 0 }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Discos (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    WorstFreePct,
    DataDiskAvgFreePct,
    LogDiskAvgFreePct,
    TempDBDiskFreePct,
    VolumesJson,
    PageLifeExpectancy,
    PageReadsPerSec,
    PageWritesPerSec,
    LazyWritesPerSec,
    CheckpointPagesPerSec,
    BatchRequestsPerSec
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.WorstFreePct),
    $($row.DataDiskAvgFreePct),
    $($row.LogDiskAvgFreePct),
    $($row.TempDBDiskFreePct),
    '$volumesJson',
    $pageLifeExp,
    $pageReadsPerSec,
    $pageWritesPerSec,
    $lazyWritesPerSec,
    $checkpointPagesPerSec,
    $batchRequestsPerSec
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
Write-Host "║  Health Score v3.0 - ESPACIO EN DISCOS               ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 10 minutos                               ║" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de discos..." -ForegroundColor Yellow

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
    
    $diskMetrics = Get-DiskMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($diskMetrics.WorstFreePct -lt 5) {
        $status = "🚨 CRÍTICO!"
    }
    elseif ($diskMetrics.DataDiskAvgFreePct -lt 10 -or $diskMetrics.LogDiskAvgFreePct -lt 10) {
        $status = "🚨 DATA/LOG BAJO!"
    }
    elseif ($diskMetrics.WorstFreePct -lt 10) {
        $status = "⚠️ BAJO!"
    }
    elseif ($diskMetrics.WorstFreePct -lt 20) {
        $status = "⚠️ ADVERTENCIA"
    }
    
    Write-Host "   $status $instanceName - Worst:$([int]$diskMetrics.WorstFreePct)% Data:$([int]$diskMetrics.DataDiskAvgFreePct)% Log:$([int]$diskMetrics.LogDiskAvgFreePct)%" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        WorstFreePct = $diskMetrics.WorstFreePct
        DataDiskAvgFreePct = $diskMetrics.DataDiskAvgFreePct
        LogDiskAvgFreePct = $diskMetrics.LogDiskAvgFreePct
        TempDBDiskFreePct = $diskMetrics.TempDBDiskFreePct
        Volumes = $diskMetrics.Volumes
        
        # Nuevas métricas de I/O (globales)
        PageLifeExpectancy = $diskMetrics.PageLifeExpectancy
        PageReadsPerSec = $diskMetrics.PageReadsPerSec
        PageWritesPerSec = $diskMetrics.PageWritesPerSec
        LazyWritesPerSec = $diskMetrics.LazyWritesPerSec
        CheckpointPagesPerSec = $diskMetrics.CheckpointPagesPerSec
        BatchRequestsPerSec = $diskMetrics.BatchRequestsPerSec
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
Write-Host "║  RESUMEN - DISCOS                                     ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgWorst = ($results | Measure-Object -Property WorstFreePct -Average).Average
$avgData = ($results | Measure-Object -Property DataDiskAvgFreePct -Average).Average
$avgLog = ($results | Measure-Object -Property LogDiskAvgFreePct -Average).Average

Write-Host "║  Worst % promedio:     $([int]$avgWorst)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Data % promedio:      $([int]$avgData)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Log % promedio:       $([int]$avgLog)%".PadRight(53) "║" -ForegroundColor White

$critical = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count
Write-Host "║  Discos críticos (<10%): $critical".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

