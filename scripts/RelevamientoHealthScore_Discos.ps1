<#
.SYNOPSIS
    Health Score v3.0 - RecolecciÃ³n de mÃ©tricas de ESPACIO EN DISCOS Y DIAGNÃ“STICO I/O
    
.DESCRIPTION
    Script de frecuencia media (cada 10 minutos) que recolecta:
    
    ESPACIO EN DISCOS:
    - Espacio libre por disco/volumen
    - ClasificaciÃ³n por rol (Data, Log, Backup, TempDB)
    - Tendencia de crecimiento
    
    DIAGNÃ“STICO DE DISCOS (NUEVO v3.1):
    - Tipo de disco fÃ­sico (HDD/SSD/NVMe) via PowerShell remoting
    - Bus Type (SATA/SAS/NVMe/iSCSI)
    - Health Status (Healthy/Warning/Unhealthy)
    - Operational Status (Online/Offline/Degraded)
    
    MÃ‰TRICAS DE CARGA I/O:
    - Page Reads/Writes per sec
    - Lazy Writes per sec (presiÃ³n de memoria)
    - Checkpoint Pages per sec
    - Batch Requests per sec
    
    ANÃLISIS DE COMPETENCIA:
    - CuÃ¡ntas bases de datos por volumen
    - CuÃ¡ntos archivos por volumen
    - Lista de bases de datos en cada disco
    
    Guarda en: InstanceHealth_Discos
    
    Peso en scoring: 8%
    Criterios: â‰¥20% libre = 100, 15â€“19% = 80, 10â€“14% = 60, 5â€“9% = 40, <5% = 0
    Cap: Data o Log <10% libre => cap 40
    
    NOTA: El tipo de disco fÃ­sico requiere PowerShell remoting habilitado.
    Si falla, el sistema inferirÃ¡ el tipo por latencia en el Consolidador.
    
.NOTES
    VersiÃ³n: 3.1 (DiagnÃ³stico Inteligente de I/O)
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
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force

#region ===== CONFIGURACIÃ“N =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false
$IncludeAWS = $false
$OnlyAWS = $false

# ConfiguraciÃ³n de paralelismo
$EnableParallel = $true      # $true para procesamiento paralelo, $false para secuencial
$ThrottleLimit = 10           # NÃºmero de instancias a procesar simultÃ¡neamente (5-15 recomendado)

#endregion

#region ===== FUNCIONES =====

# FunciÃ³n para convertir valores que pueden ser DBNull a int de forma segura
function ConvertTo-SafeInt {
    param($Value, $Default = 0)
    
    if ($null -eq $Value -or $Value -is [System.DBNull]) {
        return $Default
    }
    
    try {
        return [int]$Value
    }
    catch {
        return $Default
    }
}

# FunciÃ³n para convertir valores que pueden ser DBNull a decimal de forma segura
function ConvertTo-SafeDecimal {
    param($Value, $Default = 0.0)
    
    if ($null -eq $Value -or $Value -is [System.DBNull]) {
        return $Default
    }
    
    try {
        return [decimal]$Value
    }
    catch {
        return $Default
    }
}

function Get-DiskMediaType {
    <#
    .SYNOPSIS
        Obtiene el tipo de disco fÃ­sico (HDD/SSD/NVMe) y su estado de salud
    #>
    param(
        [string]$InstanceName,
        [string]$MountPoint
    )
    
    try {
        # Obtener servidor fÃ­sico (sin instancia nombrada)
        $serverName = $InstanceName.Split('\')[0]
        
        # Limpiar mount point para obtener letra de unidad (E:\ -> E)
        $driveLetter = $MountPoint.TrimEnd('\').TrimEnd(':')
        
        # Intentar obtener informaciÃ³n del disco fÃ­sico vÃ­a PowerShell remoting
        $diskInfo = Invoke-Command -ComputerName $serverName -ScriptBlock {
            param($drive)
            
            try {
                # Obtener particiÃ³n por letra de unidad
                $partition = Get-Partition | Where-Object { $_.DriveLetter -eq $drive } | Select-Object -First 1
                
                if ($partition) {
                    # Obtener disco fÃ­sico
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
        # Si falla PowerShell remoting, no es crÃ­tico
        # El sistema inferirÃ¡ tipo de disco por latencia despuÃ©s
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
        ProblematicFilesQueryFailed = $false  # Indica si la query de archivos problemÃ¡ticos fallÃ³
    }
    
    try {
        # Detectar versiÃ³n de SQL Server primero
        $versionQuery = @"
SELECT 
    CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version,
    CAST(SERVERPROPERTY('ProductLevel') AS VARCHAR(20)) AS ServicePack,
    CAST(SERVERPROPERTY('Edition') AS VARCHAR(100)) AS Edition
"@
        $versionResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $versionQuery -TimeoutSec 5 -MaxRetries 1
        $sqlVersion = $versionResult.Version
        $servicePack = $versionResult.ServicePack
        $edition = $versionResult.Edition
        $majorVersion = [int]($sqlVersion -split '\.')[0]
        $minorVersion = [int]($sqlVersion -split '\.')[1]
        
        # Verificar si sys.dm_os_volume_stats estÃ¡ disponible
        # SQL 2008 RTM (10.0.x) puede no tenerlo, pero SQL 2008 R2 (10.50.x) sÃ­
        $hasVolumeStats = $true
        if ($majorVersion -eq 10 -and $minorVersion -lt 50) {
            # SQL 2008 RTM/SP1/SP2/SP3 (10.0.x - 10.49.x) puede no tener sys.dm_os_volume_stats
            # Verificar si existe
            try {
                $checkQuery = "SELECT 1 FROM sys.system_objects WHERE name = 'dm_os_volume_stats'"
                $checkResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $checkQuery -TimeoutSec 5 -MaxRetries 1
                $hasVolumeStats = ($checkResult -ne $null)
            } catch {
                $hasVolumeStats = $false
            }
        }
        
        # Query 1: Espacio en discos con clasificaciÃ³n por rol + archivos problemÃ¡ticos
        if ($majorVersion -lt 10 -or -not $hasVolumeStats) {
            # FALLBACK para SQL Server 2005 o SQL 2008 sin sys.dm_os_volume_stats
            if (-not $hasVolumeStats) {
                Write-Verbose "      â„¹ï¸  ${InstanceName}: sys.dm_os_volume_stats no disponible (SQL $sqlVersion $servicePack), usando xp_fixeddrives"
            }
            $querySpace = @"
-- SQL 2005/2008 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive + ':' AS MountPoint,
    'Drive ' + Drive AS VolumeName,
    CAST(0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(MBFree / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST(100 AS DECIMAL(5,2)) AS FreePct,
    'Data' AS DiskRole,
    'N/A' AS DatabaseName,
    'ROWS' AS FileType
FROM #DriveSpace

DROP TABLE #DriveSpace
"@
        } else {
            # SQL 2008+ (query normal con sys.dm_os_volume_stats)
            $querySpace = @"
-- Espacio en discos con clasificaciÃ³n por rol
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
        }

        # Query 1b: Archivos con poco espacio interno Y crecimiento habilitado (CRÃTICO)
        # Solo alertar si el archivo puede crecer (growth != 0) y tiene poco espacio libre interno
        # Mejorada: ignora bases offline/restoring para evitar errores con FILEPROPERTY
        $queryProblematicFiles = @"
-- Archivos con poco espacio interno Y crecimiento habilitado (compatible SQL 2008+)
-- Basado en la lÃ³gica del usuario: solo alertar si growth != 0 y espacio interno < 30MB
-- Mejorada: ignora bases offline/restoring/recovering para evitar errores
SELECT 
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.name AS FileName,
    mf.type_desc AS FileType,
    SUBSTRING(mf.physical_name, 1, 3) AS DriveLetter,
    CAST(mf.size * 8.0 / 1024 AS DECIMAL(10,2)) AS FileSizeMB,
    CAST((mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 AS DECIMAL(10,2)) AS FreeSpaceInFileMB,
    CAST(mf.growth * 8.0 / 1024 AS DECIMAL(10,2)) AS GrowthMB,
    mf.is_percent_growth AS IsPercentGrowth,
    mf.max_size AS MaxSize
FROM sys.master_files mf
INNER JOIN sys.databases d ON mf.database_id = d.database_id
WHERE d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
  AND d.state = 0  -- ONLINE (evita errores con FILEPROPERTY en bases offline)
  AND d.is_read_only = 0  -- No read-only (pueden dar problemas con FILEPROPERTY)
  AND mf.growth != 0  -- Solo archivos con crecimiento habilitado
  AND (mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 < 30  -- Menos de 30MB libres internos
ORDER BY FreeSpaceInFileMB ASC;
"@

        # Query 2: MÃ©tricas de carga de I/O del sistema
        $queryIOLoad = @"
-- MÃ©tricas de carga de I/O
SELECT 
    -- Page Life Expectancy como indicador de presiÃ³n de memoria -> mÃ¡s I/O
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

        # Query 3: AnÃ¡lisis de competencia por disco (cuÃ¡ntas DBs/archivos por volumen)
        # Usar FOR XML PATH para compatibilidad con SQL 2008+
        $queryCompetition = @"
-- AnÃ¡lisis de competencia por volumen (compatible SQL 2008+)
SELECT 
    vs.volume_mount_point AS MountPoint,
    COUNT(DISTINCT mf.database_id) AS DatabaseCount,
    COUNT(mf.file_id) AS FileCount,
    SUM(mf.size * 8.0 / 1024) AS TotalSizeMB,
    STUFF((
        SELECT ',' + DB_NAME(mf2.database_id)
        FROM sys.master_files mf2
        CROSS APPLY sys.dm_os_volume_stats(mf2.database_id, mf2.file_id) vs2
        WHERE vs2.volume_mount_point = vs.volume_mount_point
        GROUP BY mf2.database_id
        FOR XML PATH(''), TYPE
    ).value('.', 'NVARCHAR(MAX)'), 1, 1, '') AS DatabaseList
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
GROUP BY vs.volume_mount_point;
"@
        
        # Ejecutar queries con reintentos automÃ¡ticos
        $dataSpace = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
            -Query $querySpace `
            -TimeoutSec $TimeoutSec `
            -MaxRetries 2
        
        # Query de archivos problemÃ¡ticos: solo para SQL 2008+ con sys.dm_os_volume_stats
        $dataProblematicFiles = $null
        $problematicFilesQueryFailed = $false
        if ($majorVersion -ge 10 -and $hasVolumeStats) {
            try {
                $dataProblematicFiles = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                    -Query $queryProblematicFiles `
                    -TimeoutSec $TimeoutSec `
                    -MaxRetries 2
            } catch {
                $problematicFilesQueryFailed = $true
                Write-Warning "      âš ï¸  No se pudo obtener archivos problemÃ¡ticos en ${InstanceName}: $($_.Exception.Message)"
            }
        } else {
            # SQL 2005 o SQL 2008 sin sys.dm_os_volume_stats: No soportado
            if (-not $hasVolumeStats) {
                Write-Verbose "      â„¹ï¸  Archivos problemÃ¡ticos no disponible en ${InstanceName} (SQL $sqlVersion - falta sys.dm_os_volume_stats)"
            } else {
                Write-Verbose "      â„¹ï¸  Archivos problemÃ¡ticos no disponible en SQL 2005 para ${InstanceName}"
            }
        }
        
        $dataIOLoad = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
            -Query $queryIOLoad `
            -TimeoutSec $TimeoutSec `
            -MaxRetries 2
        
        # Query de competition: solo si tiene sys.dm_os_volume_stats
        $dataCompetition = $null
        if ($hasVolumeStats) {
            $dataCompetition = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                -Query $queryCompetition `
                -TimeoutSec $TimeoutSec `
                -MaxRetries 2
        }
        
        # Almacenar mÃ©tricas de I/O del sistema (globales)
        if ($dataIOLoad) {
            $result.PageLifeExpectancy = ConvertTo-SafeInt $dataIOLoad.PageLifeExpectancy
            $result.PageReadsPerSec = ConvertTo-SafeInt $dataIOLoad.PageReadsPerSec
            $result.PageWritesPerSec = ConvertTo-SafeInt $dataIOLoad.PageWritesPerSec
            $result.LazyWritesPerSec = ConvertTo-SafeInt $dataIOLoad.LazyWritesPerSec
            $result.CheckpointPagesPerSec = ConvertTo-SafeInt $dataIOLoad.CheckpointPagesPerSec
            $result.BatchRequestsPerSec = ConvertTo-SafeInt $dataIOLoad.BatchRequestsPerSec
        }
        
        if ($dataSpace) {
            # Obtener volÃºmenes Ãºnicos para procesamiento
            $uniqueVolumes = $dataSpace | Select-Object -Property MountPoint, VolumeName, TotalGB, FreeGB, FreePct -Unique
            
            # Procesar cada volumen Ãºnico
            $result.Volumes = $uniqueVolumes | ForEach-Object {
                $mountPoint = $_.MountPoint
                
                # Obtener info de competencia para este volumen
                $competition = $dataCompetition | Where-Object { $_.MountPoint -eq $mountPoint } | Select-Object -First 1
                
                # Determinar roles del volumen
                $volumeRoles = $dataSpace | Where-Object { $_.MountPoint -eq $mountPoint }
                $isTempDB = ($volumeRoles | Where-Object { $_.DiskRole -eq 'TempDB' }) -ne $null
                $isData = ($volumeRoles | Where-Object { $_.DiskRole -eq 'Data' }) -ne $null
                $isLog = ($volumeRoles | Where-Object { $_.DiskRole -eq 'Log' }) -ne $null
                
                # Obtener archivos problemÃ¡ticos en este volumen (poco espacio interno + growth habilitado)
                $driveLetter = $mountPoint.TrimEnd('\').TrimEnd(':') + ':'
                $problematicFilesInVolume = @()
                if ($dataProblematicFiles) {
                    $problematicFilesInVolume = $dataProblematicFiles | Where-Object { 
                        $_.DriveLetter -eq $driveLetter 
                    }
                }
                $problematicFileCount = if ($problematicFilesInVolume) { $problematicFilesInVolume.Count } else { 0 }
                
                # Obtener tipo de disco fÃ­sico (puede ser lento, usar con precauciÃ³n)
                $diskTypeInfo = Get-DiskMediaType -InstanceName $InstanceName -MountPoint $mountPoint
                
                # Crear objeto de volumen enriquecido
                @{
                    MountPoint = $mountPoint
                    VolumeName = $_.VolumeName
                    TotalGB = ConvertTo-SafeDecimal $_.TotalGB
                    FreeGB = ConvertTo-SafeDecimal $_.FreeGB
                    FreePct = ConvertTo-SafeDecimal $_.FreePct
                    
                    # Flags de rol
                    IsTempDBDisk = $isTempDB
                    IsDataDisk = $isData
                    IsLogDisk = $isLog
                    
                    # InformaciÃ³n de disco fÃ­sico
                    MediaType = $diskTypeInfo.MediaType
                    BusType = $diskTypeInfo.BusType
                    HealthStatus = $diskTypeInfo.HealthStatus
                    OperationalStatus = $diskTypeInfo.OperationalStatus
                    
                    # Competencia (cuÃ¡ntas DBs/archivos)
                    DatabaseCount = if ($competition) { ConvertTo-SafeInt $competition.DatabaseCount } else { 0 }
                    FileCount = if ($competition) { ConvertTo-SafeInt $competition.FileCount } else { 0 }
                    DatabaseList = if ($competition) { $competition.DatabaseList } else { "" }
                    
                    # Archivos problemÃ¡ticos (poco espacio interno + growth habilitado)
                    ProblematicFileCount = $problematicFileCount
                }
            }
            
            # Peor porcentaje libre
            $result.WorstFreePct = ConvertTo-SafeDecimal (($dataSpace | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
            
            # Promedio por rol
            $dataDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Data' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($dataDisks) {
                $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.DataVolumes = $dataDisks | ForEach-Object { $_.MountPoint }
            }
            
            $logDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Log' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($logDisks) {
                $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.LogVolumes = $logDisks | ForEach-Object { $_.MountPoint }
            }
            
            $tempdbDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'TempDB' } | Select-Object -Property MountPoint, FreePct -Unique
            if ($tempdbDisks) {
                $result.TempDBDiskFreePct = ConvertTo-SafeDecimal (($tempdbDisks | Measure-Object -Property FreePct -Average).Average) 100.0
            }
        }
        
        # Guardar si la query de archivos problemÃ¡ticos fallÃ³
        $result.ProblematicFilesQueryFailed = $problematicFilesQueryFailed
        
    } catch {
        $errorMsg = $_.Exception.Message
        
        # Construir mensaje con informaciÃ³n de versiÃ³n si estÃ¡ disponible
        $versionInfo = if ($sqlVersion) { 
            "SQL $sqlVersion $servicePack" 
        } else { 
            "versiÃ³n desconocida" 
        }
        
        # Identificar tipo de error
        if ($errorMsg -match "Timeout") {
            Write-Warning "â±ï¸  TIMEOUT obteniendo disk metrics en ${InstanceName} ($versionInfo) (despuÃ©s de reintentos)"
        }
        elseif ($errorMsg -match "Connection|Network|Transport") {
            Write-Warning "ðŸ”Œ ERROR DE CONEXIÃ“N obteniendo disk metrics en ${InstanceName} ($versionInfo): $errorMsg"
        }
        elseif ($errorMsg -match "sys\.dm_os_volume_stats") {
            Write-Warning "âš ï¸  ERROR obteniendo disk metrics en ${InstanceName} ($versionInfo): sys.dm_os_volume_stats no disponible. Usa SQL 2008 R2+ o verifica permisos VIEW SERVER STATE."
        }
        else {
            Write-Warning "Error obteniendo disk metrics en ${InstanceName} ($versionInfo): $errorMsg"
        }
    }
    
    return $result
}

function Test-SqlConnection {
    <#
    .SYNOPSIS
        Prueba conexiÃ³n con reintentos
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10,
        [int]$MaxRetries = 2
    )
    
    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
            if ($connection.IsPingable) {
                return $true
            }
        } catch {
            if ($attempt -lt $MaxRetries) {
                Write-Verbose "Intento $attempt fallÃ³ para $InstanceName, reintentando..."
                Start-Sleep -Seconds 2
            }
        }
    }
    
    return $false
}

function Invoke-SqlQueryWithRetry {
    <#
    .SYNOPSIS
        Ejecuta query SQL con reintentos automÃ¡ticos en caso de timeout
    #>
    param(
        [string]$InstanceName,
        [string]$Query,
        [int]$TimeoutSec = 15,
        [int]$MaxRetries = 2
    )
    
    $attempt = 0
    $lastError = $null
    
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $result = Invoke-Sqlcmd -ServerInstance $InstanceName `
                -Query $Query `
                -QueryTimeout $TimeoutSec `
                -TrustServerCertificate
            
            return $result
        }
        catch {
            $lastError = $_
            
            # Si es timeout o connection reset, reintentar
            if ($_.Exception.Message -match "Timeout|Connection|Network|Transport") {
                if ($attempt -lt $MaxRetries) {
                    Write-Verbose "Query timeout/error en $InstanceName (intento $attempt/$MaxRetries), reintentando en 3s..."
                    Start-Sleep -Seconds 3
                    continue
                }
            }
            
            # Si es otro error, lanzar inmediatamente
            throw
        }
    }
    
    # Si llegamos aquÃ­, todos los reintentos fallaron
    throw $lastError
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
            # Convertir volumes a JSON (ahora incluye mucha mÃ¡s informaciÃ³n)
            $volumesJson = ($row.Volumes | ConvertTo-Json -Compress -Depth 3) -replace "'", "''"
            
            # Valores para mÃ©tricas de I/O (globales)
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
    GETDATE(),
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
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate
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
Write-Host "â•‘  Health Score v3.0 - ESPACIO EN DISCOS               â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Frecuencia: 10 minutos                               â•‘" -ForegroundColor Cyan
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
Write-Host "2ï¸âƒ£  Recolectando mÃ©tricas de discos..." -ForegroundColor Yellow
if ($EnableParallel) {
    Write-Host "   ðŸš€ Modo PARALELO activado (ThrottleLimit: $ThrottleLimit)" -ForegroundColor Cyan
    Write-Host "   â„¹ï¸  Modo paralelo: RecolecciÃ³n simplificada de espacio en discos (sin anÃ¡lisis de archivos problemÃ¡ticos)" -ForegroundColor DarkGray
} else {
    Write-Host "   ðŸŒ Modo SECUENCIAL activado - RecolecciÃ³n completa con todas las funciones" -ForegroundColor DarkGray
}

$results = @()

if ($EnableParallel -and $PSVersionTable.PSVersion.Major -ge 7) {
    #region ===== PROCESAMIENTO PARALELO (PowerShell 7+) =====
    
    Write-Host "   â„¹ï¸  Usando ForEach-Object -Parallel (PS 7+)" -ForegroundColor DarkGray
    
    $results = $instances | ForEach-Object -ThrottleLimit $ThrottleLimit -Parallel {
        $instance = $_
        $instanceName = $instance.NombreInstancia
        $TimeoutSec = $using:TimeoutSec
        $SqlServer = $using:SqlServer
        $SqlDatabase = $using:SqlDatabase
        
        # Importar mÃ³dulo en cada runspace paralelo
        Import-Module dbatools -ErrorAction SilentlyContinue
        
        # Redefinir funciones helper dentro del runspace paralelo
        function ConvertTo-SafeInt {
            param($Value, $Default = 0)
            if ($null -eq $Value -or $Value -is [System.DBNull]) { return $Default }
            try { return [int]$Value } catch { return $Default }
        }
        
        function ConvertTo-SafeDecimal {
            param($Value, $Default = 0.0)
            if ($null -eq $Value -or $Value -is [System.DBNull]) { return $Default }
            try { return [decimal]$Value } catch { return $Default }
        }
        
        function Test-SqlConnection {
            param([string]$InstanceName, [int]$TimeoutSec = 10, [int]$MaxRetries = 2)
            $attempt = 0
            while ($attempt -lt $MaxRetries) {
                $attempt++
                try {
                    $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
                    if ($connection.IsPingable) { return $true }
                } catch {
                    if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds 2 }
                }
            }
            return $false
        }
        
        function Invoke-SqlQueryWithRetry {
            param([string]$InstanceName, [string]$Query, [int]$TimeoutSec = 15, [int]$MaxRetries = 2)
            $attempt = 0
            $lastError = $null
            while ($attempt -lt $MaxRetries) {
                $attempt++
                try {
                    return Invoke-Sqlcmd -ServerInstance $InstanceName -Query $Query -QueryTimeout $TimeoutSec -TrustServerCertificate
                } catch {
                    $lastError = $_
                    if ($_.Exception.Message -match "Timeout|Connection|Network|Transport") {
                        if ($attempt -lt $MaxRetries) { Start-Sleep -Seconds 3; continue }
                    }
                    throw
                }
            }
            throw $lastError
        }
        
        # FunciÃ³n simplificada Get-DiskMetrics inline
        function Get-DiskMetrics {
            param([string]$InstanceName, [int]$TimeoutSec = 15)
            
            $result = @{
                WorstFreePct = 100.0
                DataDiskAvgFreePct = 100.0
                LogDiskAvgFreePct = 100.0
                TempDBDiskFreePct = 100.0
                Volumes = @()
                DataVolumes = @()
                LogVolumes = @()
                PageLifeExpectancy = 0
                PageReadsPerSec = 0
                PageWritesPerSec = 0
                LazyWritesPerSec = 0
                CheckpointPagesPerSec = 0
                BatchRequestsPerSec = 0
            }
            
            try {
                # Detectar versiÃ³n de SQL Server
                $versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version"
                $versionResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $versionQuery -TimeoutSec 5 -MaxRetries 1
                $sqlVersion = $versionResult.Version
                $majorVersion = [int]($sqlVersion -split '\.')[0]
                
                # SQL 2005 = version 9.x (no tiene sys.dm_os_volume_stats)
                # SQL 2008+ = version 10.x+ (tiene sys.dm_os_volume_stats)
                
                if ($majorVersion -lt 10) {
                    # FALLBACK para SQL Server 2005 (usar xp_fixeddrives)
                    $querySpace = @"
-- SQL 2005 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive + ':' AS MountPoint,
    'Drive ' + Drive AS VolumeName,
    CAST(0 AS DECIMAL(10,2)) AS TotalGB,  -- xp_fixeddrives no da total
    CAST(MBFree / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST(100 AS DECIMAL(5,2)) AS FreePct,  -- No podemos calcular % sin total
    'Data' AS DiskRole  -- Asumimos Data por defecto
FROM #DriveSpace

DROP TABLE #DriveSpace
"@
                } else {
                    # SQL 2008+ (query normal con sys.dm_os_volume_stats)
                    $querySpace = @"
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct,
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
"@
                }
                
                $dataSpace = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $querySpace -TimeoutSec $TimeoutSec -MaxRetries 2
                
                if ($dataSpace) {
                    $uniqueVolumes = $dataSpace | Select-Object -Property MountPoint, VolumeName, TotalGB, FreeGB, FreePct -Unique
                    $result.Volumes = $uniqueVolumes | ForEach-Object {
                        @{
                            MountPoint = $_.MountPoint
                            VolumeName = $_.VolumeName
                            TotalGB = ConvertTo-SafeDecimal $_.TotalGB
                            FreeGB = ConvertTo-SafeDecimal $_.FreeGB
                            FreePct = ConvertTo-SafeDecimal $_.FreePct
                            ProblematicFileCount = 0  # Simplificado para velocidad
                        }
                    }
                    
                    $result.WorstFreePct = ConvertTo-SafeDecimal (($dataSpace | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
                    
                    $dataDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Data' } | Select-Object -Property MountPoint, FreePct -Unique
                    if ($dataDisks) {
                        $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $logDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Log' } | Select-Object -Property MountPoint, FreePct -Unique
                    if ($logDisks) {
                        $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $tempdbDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'TempDB' } | Select-Object -Property MountPoint, FreePct -Unique
                    if ($tempdbDisks) {
                        $result.TempDBDiskFreePct = ConvertTo-SafeDecimal (($tempdbDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                }
            } catch {
                Write-Warning "Error obteniendo disk metrics en ${InstanceName}: $($_.Exception.Message)"
            }
            
            return $result
        }
        
        $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
        $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
        $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
        
        if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
            Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
            return $null
        }
        
        $diskMetrics = Get-DiskMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
        
        # LÃ³gica simplificada de alertas (modo paralelo rÃ¡pido - sin anÃ¡lisis de archivos)
        $status = "âœ…"
        if ($diskMetrics.WorstFreePct -lt 5) {
            $status = "ðŸš¨ CRÃTICO!"
        }
        elseif ($diskMetrics.WorstFreePct -lt 10) {
            $status = "âš ï¸ BAJO!"
        }
        elseif ($diskMetrics.WorstFreePct -lt 20) {
            $status = "âš ï¸ ADVERTENCIA"
        }
        
        Write-Host "   $status $instanceName - Worst:$([int]$diskMetrics.WorstFreePct)% Data:$([int]$diskMetrics.DataDiskAvgFreePct)% Log:$([int]$diskMetrics.LogDiskAvgFreePct)%" -ForegroundColor Gray
        
        # Devolver resultado
        [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $ambiente
            HostingSite = $hostingSite
            SqlVersion = $sqlVersion
            WorstFreePct = $diskMetrics.WorstFreePct
            DataDiskAvgFreePct = $diskMetrics.DataDiskAvgFreePct
            LogDiskAvgFreePct = $diskMetrics.LogDiskAvgFreePct
            TempDBDiskFreePct = $diskMetrics.TempDBDiskFreePct
            Volumes = $diskMetrics.Volumes
            PageLifeExpectancy = $diskMetrics.PageLifeExpectancy
            PageReadsPerSec = $diskMetrics.PageReadsPerSec
            PageWritesPerSec = $diskMetrics.PageWritesPerSec
            LazyWritesPerSec = $diskMetrics.LazyWritesPerSec
            CheckpointPagesPerSec = $diskMetrics.CheckpointPagesPerSec
            BatchRequestsPerSec = $diskMetrics.BatchRequestsPerSec
        }
    }
    
    # Filtrar nulos (instancias sin conexiÃ³n)
    $results = $results | Where-Object { $_ -ne $null }
    
    #endregion
}
else {
    #region ===== PROCESAMIENTO SECUENCIAL (PowerShell 5.1 o $EnableParallel = $false) =====
    
    if ($EnableParallel -and $PSVersionTable.PSVersion.Major -lt 7) {
        Write-Host "   âš ï¸  Procesamiento paralelo requiere PowerShell 7+. Usando modo secuencial." -ForegroundColor Yellow
    }
    
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
        
        $diskMetrics = Get-DiskMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
        
        # Contar archivos problemÃ¡ticos
        $totalProblematicFiles = 0
        if ($diskMetrics.Volumes) {
            foreach ($vol in $diskMetrics.Volumes) {
                if ($vol.ProblematicFileCount) {
                    $totalProblematicFiles += $vol.ProblematicFileCount
                }
            }
        }
        
        # LÃ³gica de alertas
        $status = "âœ…"
        $statusMessage = ""
        
        if ($totalProblematicFiles -gt 0) {
            if ($diskMetrics.WorstFreePct -lt 10 -or $totalProblematicFiles -ge 5) {
                $status = "ðŸš¨ CRÃTICO!"
                $statusMessage = " ($totalProblematicFiles archivos con <30MB libres)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 20 -or $totalProblematicFiles -ge 2) {
                $status = "âš ï¸ ADVERTENCIA"
                $statusMessage = " ($totalProblematicFiles archivos con <30MB libres)"
            }
        }
        else {
            if ($diskMetrics.WorstFreePct -lt 5) {
                $status = "ðŸ“Š Disco bajo (archivos OK)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 10) {
                $status = "ðŸ“Š Disco bajo (archivos OK)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 20) {
                $status = "ðŸ“Š Monitorear"
            }
        }
        
        Write-Host "   $status $instanceName - Worst:$([int]$diskMetrics.WorstFreePct)% Data:$([int]$diskMetrics.DataDiskAvgFreePct)% Log:$([int]$diskMetrics.LogDiskAvgFreePct)%$statusMessage" -ForegroundColor Gray
        
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
            PageLifeExpectancy = $diskMetrics.PageLifeExpectancy
            PageReadsPerSec = $diskMetrics.PageReadsPerSec
            PageWritesPerSec = $diskMetrics.PageWritesPerSec
            LazyWritesPerSec = $diskMetrics.LazyWritesPerSec
            CheckpointPagesPerSec = $diskMetrics.CheckpointPagesPerSec
            BatchRequestsPerSec = $diskMetrics.BatchRequestsPerSec
        }
    }
    
    Write-Progress -Activity "Recolectando mÃ©tricas" -Completed
    
    #endregion
}

# 3. Guardar en SQL
Write-Host ""
Write-Host "3ï¸âƒ£  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Green
Write-Host "â•‘  RESUMEN - DISCOS                                     â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  Total instancias:     $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White

$avgWorst = ($results | Measure-Object -Property WorstFreePct -Average).Average
$avgData = ($results | Measure-Object -Property DataDiskAvgFreePct -Average).Average
$avgLog = ($results | Measure-Object -Property LogDiskAvgFreePct -Average).Average

Write-Host "â•‘  Worst % promedio:     $([int]$avgWorst)%".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Data % promedio:      $([int]$avgData)%".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Log % promedio:       $([int]$avgLog)%".PadRight(53) "â•‘" -ForegroundColor White

# Contar instancias con archivos problemÃ¡ticos (< 30MB libres internos + growth habilitado)
$instancesWithProblematicFiles = 0
$totalProblematicFilesCount = 0
foreach ($r in $results) {
    if ($r.Volumes) {
        $instanceFiles = 0
        foreach ($vol in $r.Volumes) {
            if ($vol.ProblematicFileCount) {
                $instanceFiles += $vol.ProblematicFileCount
            }
        }
        if ($instanceFiles -gt 0) {
            $instancesWithProblematicFiles++
            $totalProblematicFilesCount += $instanceFiles
        }
    }
}

Write-Host "â•‘" -NoNewline -ForegroundColor Green
Write-Host "" -ForegroundColor White
$critical = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count
Write-Host "â•‘  Discos crÃ­ticos (<10%): $critical".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•‘  Instancias con archivos problemÃ¡ticos: $instancesWithProblematicFiles".PadRight(53) "â•‘" -ForegroundColor $(if ($instancesWithProblematicFiles -gt 0) { "Yellow" } else { "White" })
Write-Host "â•‘  Total archivos con <30MB libres: $totalProblematicFilesCount".PadRight(53) "â•‘" -ForegroundColor $(if ($totalProblematicFilesCount -gt 0) { "Yellow" } else { "White" })
Write-Host "â•‘  (Solo archivos con growth habilitado)".PadRight(53) "â•‘" -ForegroundColor DarkGray

# Contar instancias donde fallÃ³ la query de archivos problemÃ¡ticos
$instancesWithQueryFailed = ($results | Where-Object { $_.ProblematicFilesQueryFailed -eq $true }).Count
if ($instancesWithQueryFailed -gt 0) {
    Write-Host "â•‘" -NoNewline -ForegroundColor Green
    Write-Host "" -ForegroundColor White
    Write-Host "â•‘  âš ï¸  Instancias con error en query de archivos: $instancesWithQueryFailed".PadRight(53) "â•‘" -ForegroundColor Yellow
    Write-Host "â•‘      (Datos de archivos problemÃ¡ticos incompletos)".PadRight(53) "â•‘" -ForegroundColor DarkGray
}

Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green

# Mostrar TOP instancias con archivos problemÃ¡ticos si existen
if ($instancesWithProblematicFiles -gt 0) {
    Write-Host ""
    Write-Host "ðŸš¨ TOP INSTANCIAS CON ARCHIVOS PROBLEMÃTICOS (<30MB libres + growth habilitado):" -ForegroundColor Red
    
    $topProblematic = @()
    foreach ($r in $results) {
        if ($r.Volumes) {
            $instanceFiles = 0
            foreach ($vol in $r.Volumes) {
                if ($vol.ProblematicFileCount) {
                    $instanceFiles += $vol.ProblematicFileCount
                }
            }
            if ($instanceFiles -gt 0) {
                $topProblematic += [PSCustomObject]@{
                    InstanceName = $r.InstanceName
                    ProblematicFileCount = $instanceFiles
                    WorstFreePct = $r.WorstFreePct
                }
            }
        }
    }
    
    $topProblematic | Sort-Object -Property ProblematicFileCount -Descending | Select-Object -First 10 | ForEach-Object {
        $emoji = if ($_.ProblematicFileCount -ge 5) { "ðŸš¨" } elseif ($_.ProblematicFileCount -ge 2) { "âš ï¸" } else { "ðŸ“Š" }
        Write-Host "   $emoji $($_.InstanceName.PadRight(30)) - $($_.ProblematicFileCount) archivos - Worst: $([int]$_.WorstFreePct)%" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


