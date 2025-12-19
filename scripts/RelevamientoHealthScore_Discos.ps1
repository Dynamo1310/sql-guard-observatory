<#
.SYNOPSIS
    Health Score v3.3 - Recolección de métricas de ESPACIO EN DISCOS Y DIAGNÓSTICO I/O
    
.DESCRIPTION
    Script de frecuencia media (cada 10 minutos) que recolecta:
    
    ESPACIO EN DISCOS:
    - Espacio libre por disco/volumen
    - Clasificación por rol (Data, Log, Backup, TempDB)
    - Tendencia de crecimiento
    
    DIAGNÓSTICO DE DISCOS:
    - Tipo de disco físico (HDD/SSD/NVMe) via PowerShell remoting
    - Bus Type (SATA/SAS/NVMe/iSCSI)
    - Health Status (Healthy/Warning/Unhealthy)
    - Operational Status (Online/Offline/Degraded)
    
    ESPACIO LIBRE REAL (NUEVO v3.3):
    - Calcula el espacio libre REAL considerando:
      * Espacio libre en disco físico
      * Espacio libre INTERNO en archivos con growth habilitado
    - Solo alerta discos donde:
      * Los archivos tienen growth habilitado (pueden crecer)
      * El espacio libre REAL (disco + interno) es <= 10%
    - NO alerta discos donde:
      * Los archivos NO tienen growth (no van a crecer)
      * Los archivos tienen espacio interno disponible
    
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
    
    Peso en scoring: 7%
    Criterios de alerta v3.3:
    - Solo se alerta si: FilesWithGrowth > 0 AND RealFreePct <= 10%
    - RealFreePct = (FreeGB + FreeSpaceInGrowableFilesGB) / TotalGB * 100
    - NO se alerta si archivos sin growth o tienen espacio interno
    
    NOTA: El tipo de disco físico requiere PowerShell remoting habilitado.
    Si falla, el sistema inferirá el tipo por latencia en el Consolidador.
    
.NOTES
    Versión: 3.3 (Espacio Libre REAL)
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

# Configuración de paralelismo
$EnableParallel = $true      # $true para procesamiento paralelo, $false para secuencial
$ThrottleLimit = 10           # Número de instancias a procesar simultáneamente (5-15 recomendado)

#endregion

#region ===== FUNCIONES =====

# Función para convertir valores que pueden ser DBNull a int de forma segura
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

# Función para convertir valores que pueden ser DBNull a decimal de forma segura
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

# Función para normalizar mount point a solo letra de unidad
# Convierte "E:\DWM\DWM4\" -> "E:\" y "E:\" -> "E:\"
function Get-NormalizedDriveLetter {
    param([string]$MountPoint)
    
    if ([string]::IsNullOrWhiteSpace($MountPoint)) {
        return $MountPoint
    }
    
    # Extraer solo la letra de unidad (primeros caracteres como "E:" o "E:\")
    if ($MountPoint -match '^([A-Za-z]:)') {
        return $matches[1] + "\"
    }
    
    return $MountPoint
}

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
        FileAnalysisQueryFailed = $false  # Indica si la query de análisis de archivos falló
    }
    
    try {
        # Detectar versión de SQL Server primero
        $sqlVersion = "Unknown"
        $servicePack = "Unknown"
        $edition = "Unknown"
        $majorVersion = 0
        $minorVersion = 0
        
        try {
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
        } catch {
            Write-Verbose "      ℹ️  No se pudo detectar versión de ${InstanceName}, asumiendo versión antigua"
            # Asumir versión muy antigua (SQL 2000/2005) sin sys.dm_os_volume_stats
            $majorVersion = 8  # SQL 2000
        }
        
        # Verificar si sys.dm_os_volume_stats está disponible
        # SQL 2005 (9.x) = No tiene sys.dm_os_volume_stats
        # SQL 2008 RTM (10.0.x) = Puede no tenerlo
        # SQL 2008 R2+ (10.50.x+) = Sí tiene sys.dm_os_volume_stats
        $hasVolumeStats = $true
        
        if ($majorVersion -lt 10) {
            # SQL 2005 o anterior: definitivamente no tiene sys.dm_os_volume_stats
            $hasVolumeStats = $false
            Write-Verbose "      ℹ️  ${InstanceName}: SQL $majorVersion.x detectado, usando fallback xp_fixeddrives"
        }
        elseif ($majorVersion -eq 10 -and $minorVersion -lt 50) {
            # SQL 2008 RTM/SP1/SP2/SP3 (10.0.x - 10.49.x): verificar si tiene sys.dm_os_volume_stats
            try {
                $checkQuery = "SELECT 1 FROM sys.system_objects WHERE name = 'dm_os_volume_stats'"
                $checkResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $checkQuery -TimeoutSec 5 -MaxRetries 1
                $hasVolumeStats = ($checkResult -ne $null)
                if (-not $hasVolumeStats) {
                    Write-Verbose "      ℹ️  ${InstanceName}: SQL 2008 RTM sin sys.dm_os_volume_stats, usando fallback"
                }
            } catch {
                $hasVolumeStats = $false
                Write-Verbose "      ℹ️  ${InstanceName}: Error verificando sys.dm_os_volume_stats, usando fallback"
            }
        }
        
        # Query 1: Espacio en discos con clasificación por rol + archivos problemáticos
        if ($majorVersion -lt 10 -or -not $hasVolumeStats) {
            # FALLBACK para SQL Server 2005 o SQL 2008 sin sys.dm_os_volume_stats
            # Usar xp_fixeddrives + WMI para obtener info completa
            if (-not $hasVolumeStats) {
                Write-Verbose "      ℹ️  ${InstanceName}: sys.dm_os_volume_stats no disponible (SQL $sqlVersion $servicePack), usando xp_fixeddrives + WMI"
            }
            
            # Query para obtener solo espacio libre
            $querySpace = @"
-- SQL 2005/2008 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive AS DriveLetter,
    MBFree AS MBFree
FROM #DriveSpace

DROP TABLE #DriveSpace
"@
        } else {
            # SQL 2008+ (query simplificada: SOLO volúmenes únicos, sin roles para evitar duplicados)
            $querySpace = @"
-- Espacio en discos (deduplicado por volumen físico)
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
"@
        }

        # Query 1b: Análisis completo de archivos por disco (MEJORADO v3.3)
        # Calcula métricas por volumen: archivos con/sin growth, espacio interno, ESPACIO LIBRE REAL
        # NOTA: Usa sys.dm_db_file_space_used que requiere iterar por cada base de datos
        $queryFileAnalysis = @"
-- Análisis de espacio interno en archivos usando sys.dm_db_file_space_used
-- Esta query itera por cada base de datos para obtener el espacio usado real
-- v3.3: Calcula FreeSpaceInGrowableFilesMB correctamente

-- Tabla temporal para resultados
IF OBJECT_ID('tempdb..#FileSpaceAnalysis') IS NOT NULL DROP TABLE #FileSpaceAnalysis;
CREATE TABLE #FileSpaceAnalysis (
    DriveLetter VARCHAR(2),
    TotalFiles INT,
    FilesWithoutGrowth INT,
    FilesWithGrowth INT,
    TotalFileSizeMB DECIMAL(18,2),
    TotalFreeSpaceInFilesMB DECIMAL(18,2),
    FreeSpaceInGrowableFilesMB DECIMAL(18,2),
    ProblematicFiles INT
);

-- Iterar por cada base de datos online
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'
USE ' + QUOTENAME(d.name) + N';
INSERT INTO #FileSpaceAnalysis
SELECT 
    RTRIM(LEFT(mf.physical_name, 2)) AS DriveLetter,
    COUNT(*) AS TotalFiles,
    SUM(CASE WHEN mf.growth = 0 THEN 1 ELSE 0 END) AS FilesWithoutGrowth,
    SUM(CASE WHEN mf.growth != 0 THEN 1 ELSE 0 END) AS FilesWithGrowth,
    CAST(SUM(mf.size * 8.0 / 1024) AS DECIMAL(18,2)) AS TotalFileSizeMB,
    CAST(SUM(fs.unallocated_extent_page_count * 8.0 / 1024) AS DECIMAL(18,2)) AS TotalFreeSpaceInFilesMB,
    CAST(SUM(CASE WHEN mf.growth != 0 THEN fs.unallocated_extent_page_count * 8.0 / 1024 ELSE 0 END) AS DECIMAL(18,2)) AS FreeSpaceInGrowableFilesMB,
    SUM(CASE WHEN mf.growth != 0 AND fs.unallocated_extent_page_count * 8.0 / 1024 < 30 THEN 1 ELSE 0 END) AS ProblematicFiles
FROM sys.database_files mf
INNER JOIN sys.dm_db_file_space_used fs ON mf.file_id = fs.file_id
WHERE mf.type IN (0, 1)  -- ROWS y LOG
GROUP BY RTRIM(LEFT(mf.physical_name, 2));
'
FROM sys.databases d
WHERE d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
  AND d.state = 0  -- ONLINE
  AND d.is_read_only = 0;

EXEC sp_executesql @sql;

-- Agregar resultados por letra de unidad
SELECT 
    DriveLetter,
    SUM(TotalFiles) AS TotalFiles,
    SUM(FilesWithoutGrowth) AS FilesWithoutGrowth,
    SUM(FilesWithGrowth) AS FilesWithGrowth,
    SUM(TotalFileSizeMB) AS TotalFileSizeMB,
    SUM(TotalFreeSpaceInFilesMB) AS TotalFreeSpaceInFilesMB,
    SUM(FreeSpaceInGrowableFilesMB) AS FreeSpaceInGrowableFilesMB,
    SUM(ProblematicFiles) AS ProblematicFiles,
    CAST(CASE WHEN SUM(FilesWithGrowth) > 0 
         THEN SUM(FreeSpaceInGrowableFilesMB) / SUM(FilesWithGrowth) 
         ELSE 0 END AS DECIMAL(10,2)) AS AvgFreeSpaceInGrowableFilesMB,
    CAST(CASE WHEN SUM(TotalFileSizeMB) > 0 AND SUM(FilesWithGrowth) > 0
         THEN (SUM(FreeSpaceInGrowableFilesMB) * 100.0 / SUM(TotalFileSizeMB))
         ELSE 0 END AS DECIMAL(5,2)) AS AvgFreeSpacePctInGrowableFiles
FROM #FileSpaceAnalysis
GROUP BY DriveLetter
ORDER BY SUM(ProblematicFiles) DESC, SUM(TotalFreeSpaceInFilesMB) ASC;

DROP TABLE #FileSpaceAnalysis;
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
        # Usar FOR XML PATH para compatibilidad con SQL 2008+
        $queryCompetition = @"
-- Análisis de competencia por volumen (compatible SQL 2008+)
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
        
        # Ejecutar queries con reintentos automáticos
        $dataSpace = $null
        try {
            $rawDataSpace = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                -Query $querySpace `
                -TimeoutSec $TimeoutSec `
                -MaxRetries 2
            
            # Si usamos el fallback de xp_fixeddrives, procesar con WMI
            if ($majorVersion -lt 10 -or -not $hasVolumeStats) {
                if ($rawDataSpace -and $rawDataSpace[0].PSObject.Properties.Name -contains 'DriveLetter') {
                    # Es resultado de xp_fixeddrives, necesita procesamiento con WMI
                    
                    # Detectar roles de discos vía sysaltfiles
                    $diskRoles = @{}
                    try {
                        $queryDetectRoles = @"
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'
"@
                        $rolesResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryDetectRoles -TimeoutSec 5 -MaxRetries 1
                        foreach ($role in $rolesResult) {
                            $diskRoles[$role.DriveLetter] = $role.DiskRole
                        }
                        Write-Verbose "      ℹ️  ${InstanceName}: Detectados roles de $($diskRoles.Count) discos vía sysaltfiles"
                    }
                    catch {
                        Write-Verbose "      ⚠️  ${InstanceName}: No se pudo detectar roles de discos, asumiendo todos como Data"
                    }
                    
                    $serverName = $InstanceName.Split('\')[0]
                    $dataSpace = @()
                    
                    foreach ($drive in $rawDataSpace) {
                        $driveLetter = $drive.DriveLetter
                        $freeGB = [decimal]($drive.MBFree / 1024.0)
                        
                        # Determinar rol del disco
                        $diskRole = if ($diskRoles.ContainsKey($driveLetter)) { 
                            $diskRoles[$driveLetter] 
                        } else { 
                            'Data' 
                        }
                        
                        $totalGB = 0
                        $freePct = 0
                        
                        # Intentar WMI para tamaño total
                        try {
                            $diskInfo = Get-WmiObject -ComputerName $serverName -Class Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" -ErrorAction SilentlyContinue
                            if ($diskInfo) {
                                $totalGB = [decimal]($diskInfo.Size / 1GB)
                                if ($totalGB -gt 0) {
                                    $freePct = [decimal](($freeGB / $totalGB) * 100)
                                }
                            }
                        }
                        catch {
                            Write-Verbose "      No se pudo obtener tamaño total del disco $driveLetter en $serverName vía WMI"
                        }
                        
                        # Si no pudimos obtener tamaño total, estimar
                        if ($totalGB -eq 0 -and $freeGB -gt 0) {
                            $totalGB = $freeGB * 5
                            $freePct = 20
                        }
                        
                        $dataSpace += [PSCustomObject]@{
                            MountPoint = "${driveLetter}:\"
                            VolumeName = "Drive $driveLetter"
                            TotalGB = $totalGB
                            FreeGB = $freeGB
                            FreePct = $freePct
                            DiskRole = $diskRole
                        }
                    }
                    
                    Write-Verbose "      ℹ️  ${InstanceName}: Procesados $($dataSpace.Count) volúmenes con xp_fixeddrives + WMI"
                }
                else {
                    # No es xp_fixeddrives o falló, usar datos tal cual
                    $dataSpace = $rawDataSpace
                }
            }
            else {
                # SQL 2008+, usar datos tal cual
                $dataSpace = $rawDataSpace
            }
        }
        catch {
            # Si falla por "Invalid object name 'sys.dm_os_volume_stats'", usar fallback
            if ($_.Exception.Message -match "Invalid object name.*dm_os_volume_stats") {
                Write-Warning "      ⚠️  ${InstanceName}: sys.dm_os_volume_stats no disponible (SQL muy antiguo), usando fallback xp_fixeddrives"
                
                # Reintentamos con el fallback de xp_fixeddrives + WMI para tamaño total
                try {
                    # Paso 1: Detectar qué discos tienen archivos de datos vs logs
                    $queryDetectRoles = @"
-- Detectar roles de discos según archivos (compatible SQL 2005+)
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'
"@
                    $diskRoles = @{}
                    try {
                        $rolesResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                            -Query $queryDetectRoles `
                            -TimeoutSec 5 `
                            -MaxRetries 1
                        
                        foreach ($role in $rolesResult) {
                            $diskRoles[$role.DriveLetter] = $role.DiskRole
                        }
                        Write-Verbose "      ℹ️  ${InstanceName}: Detectados roles de $($diskRoles.Count) discos vía sysaltfiles"
                    }
                    catch {
                        Write-Verbose "      ⚠️  ${InstanceName}: No se pudo detectar roles de discos, asumiendo todos como Data"
                    }
                    
                    # Paso 2: Obtener espacio libre con xp_fixeddrives
                    $querySpaceFallback = @"
-- SQL 2000/2005 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive AS DriveLetter,
    MBFree AS MBFree
FROM #DriveSpace

DROP TABLE #DriveSpace
"@
                    $xpFixedDrivesResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                        -Query $querySpaceFallback `
                        -TimeoutSec $TimeoutSec `
                        -MaxRetries 1
                    
                    if ($xpFixedDrivesResult) {
                        # Paso 3: Obtener tamaño total con WMI (si es accesible)
                        $serverName = $InstanceName.Split('\')[0]
                        $dataSpace = @()
                        
                        foreach ($drive in $xpFixedDrivesResult) {
                            $driveLetter = $drive.DriveLetter
                            $freeGB = [decimal]($drive.MBFree / 1024.0)
                            
                            # Determinar rol del disco (desde detección vía sysaltfiles)
                            $diskRole = if ($diskRoles.ContainsKey($driveLetter)) { 
                                $diskRoles[$driveLetter] 
                            } else { 
                                'Data'  # Por defecto si no se pudo detectar
                            }
                            
                            # Intentar obtener tamaño total con WMI
                            $totalGB = 0
                            $freePct = 0
                            
                            try {
                                $diskInfo = Get-WmiObject -ComputerName $serverName -Class Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" -ErrorAction SilentlyContinue
                                if ($diskInfo) {
                                    $totalGB = [decimal]($diskInfo.Size / 1GB)
                                    if ($totalGB -gt 0) {
                                        $freePct = [decimal](($freeGB / $totalGB) * 100)
                                    }
                                }
                            }
                            catch {
                                # Si falla WMI, usar valores por defecto
                                Write-Verbose "      No se pudo obtener tamaño total del disco $driveLetter en $serverName vía WMI"
                            }
                            
                            # Si no pudimos obtener el tamaño total, estimar basado en el espacio libre
                            if ($totalGB -eq 0 -and $freeGB -gt 0) {
                                # Estimar: Si tiene X GB libres, asumir un disco razonable
                                # Esta es una estimación conservadora para no dar falsas alarmas
                                $totalGB = $freeGB * 5  # Asumir 20% libre como promedio
                                $freePct = 20
                            }
                            
                            $dataSpace += [PSCustomObject]@{
                                MountPoint = "${driveLetter}:\"
                                VolumeName = "Drive $driveLetter"
                                TotalGB = $totalGB
                                FreeGB = $freeGB
                                FreePct = $freePct
                                DiskRole = $diskRole
                            }
                        }
                        
                        Write-Verbose "      ℹ️  ${InstanceName}: Obtenidos $($dataSpace.Count) volúmenes con xp_fixeddrives"
                    }
                    else {
                        Write-Warning "      ❌ ${InstanceName}: xp_fixeddrives no devolvió datos"
                        $dataSpace = $null
                    }
                }
                catch {
                    Write-Warning "      ❌ ${InstanceName}: Fallback xp_fixeddrives también falló: $($_.Exception.Message)"
                    $dataSpace = $null
                }
            }
            else {
                # Otro tipo de error, propagar
                throw
            }
        }
        
        # Query de análisis de archivos: solo para SQL 2008+ con sys.dm_os_volume_stats
        $dataFileAnalysis = $null
        $fileAnalysisQueryFailed = $false
        if ($majorVersion -ge 10 -and $hasVolumeStats) {
            try {
                $dataFileAnalysis = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                    -Query $queryFileAnalysis `
                    -TimeoutSec $TimeoutSec `
                    -MaxRetries 2
            } catch {
                $fileAnalysisQueryFailed = $true
                Write-Warning "      ⚠️  No se pudo obtener análisis de archivos en ${InstanceName}: $($_.Exception.Message)"
            }
        } else {
            # SQL 2005 o SQL 2008 sin sys.dm_os_volume_stats: No soportado
            if (-not $hasVolumeStats) {
                Write-Verbose "      ℹ️  Análisis de archivos no disponible en ${InstanceName} (SQL $sqlVersion - falta sys.dm_os_volume_stats)"
            } else {
                Write-Verbose "      ℹ️  Análisis de archivos no disponible en SQL 2005 para ${InstanceName}"
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
        
        # Almacenar métricas de I/O del sistema (globales)
        if ($dataIOLoad) {
            $result.PageLifeExpectancy = ConvertTo-SafeInt $dataIOLoad.PageLifeExpectancy
            $result.PageReadsPerSec = ConvertTo-SafeInt $dataIOLoad.PageReadsPerSec
            $result.PageWritesPerSec = ConvertTo-SafeInt $dataIOLoad.PageWritesPerSec
            $result.LazyWritesPerSec = ConvertTo-SafeInt $dataIOLoad.LazyWritesPerSec
            $result.CheckpointPagesPerSec = ConvertTo-SafeInt $dataIOLoad.CheckpointPagesPerSec
            $result.BatchRequestsPerSec = ConvertTo-SafeInt $dataIOLoad.BatchRequestsPerSec
        }
        
        if ($dataSpace) {
            # Normalizar y agrupar volúmenes por letra de unidad
            # Esto combina mount points como E:\DWM\DWM4\, E:\DWM\DWM5\ en un solo E:\
            $uniqueVolumes = $dataSpace | 
                ForEach-Object {
                    # Agregar propiedad de letra normalizada
                    $_ | Add-Member -NotePropertyName NormalizedDrive -NotePropertyValue (Get-NormalizedDriveLetter $_.MountPoint) -PassThru
                } |
                Group-Object -Property NormalizedDrive | 
                ForEach-Object {
                    # Para cada letra de unidad, combinar los datos de todos los mount points
                    $volumesInDrive = $_.Group
                    $firstVol = $volumesInDrive[0]
                    
                    # Sumar espacio total y libre de todos los mount points (son volúmenes en el mismo disco físico)
                    $combinedTotalGB = ($volumesInDrive | Measure-Object -Property TotalGB -Sum).Sum
                    $combinedFreeGB = ($volumesInDrive | Measure-Object -Property FreeGB -Sum).Sum
                    $combinedFreePct = if ($combinedTotalGB -gt 0) { ($combinedFreeGB / $combinedTotalGB) * 100.0 } else { 100.0 }
                    
                    # Crear objeto combinado con la letra normalizada
                    [PSCustomObject]@{
                        MountPoint = $firstVol.NormalizedDrive
                        VolumeName = $firstVol.VolumeName
                        TotalGB = [math]::Round($combinedTotalGB, 2)
                        FreeGB = [math]::Round($combinedFreeGB, 2)
                        FreePct = [math]::Round($combinedFreePct, 2)
                        OriginalMountPoints = ($volumesInDrive | ForEach-Object { $_.MountPoint }) -join ", "
                        MountPointCount = $volumesInDrive.Count
                    }
                }
            
            # Detectar roles de cada volumen consultando qué archivos tiene
            $queryRoles = @"
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
"@
            $volumeRoles = @{}
            try {
                $rolesData = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
                    -Query $queryRoles `
                    -TimeoutSec 5 `
                    -MaxRetries 1
                
                foreach ($roleEntry in $rolesData) {
                    # Normalizar el mount point para agrupar roles por letra de unidad
                    $mp = Get-NormalizedDriveLetter $roleEntry.MountPoint
                    if (-not $volumeRoles.ContainsKey($mp)) {
                        $volumeRoles[$mp] = @()
                    }
                    if ($volumeRoles[$mp] -notcontains $roleEntry.DiskRole) {
                        $volumeRoles[$mp] += $roleEntry.DiskRole
                    }
                }
            }
            catch {
                Write-Verbose "      No se pudo detectar roles de volúmenes para ${InstanceName}"
            }
            
            # Procesar cada volumen único
            $result.Volumes = $uniqueVolumes | ForEach-Object {
                $mountPoint = Get-NormalizedDriveLetter $_.MountPoint
                
                # Obtener info de competencia para este volumen (buscar por todos los mount points originales)
                $competitionData = $dataCompetition | Where-Object { 
                    (Get-NormalizedDriveLetter $_.MountPoint) -eq $mountPoint 
                }
                # Combinar datos de competencia de todos los mount points
                $combinedDbCount = ($competitionData | Measure-Object -Property DatabaseCount -Sum).Sum
                $combinedFileCount = ($competitionData | Measure-Object -Property FileCount -Sum).Sum
                $combinedDbList = ($competitionData | ForEach-Object { $_.DatabaseList } | Where-Object { $_ }) -join ","
                # Eliminar duplicados en la lista de DBs
                $combinedDbList = ($combinedDbList -split ',' | Select-Object -Unique | Sort-Object) -join ','
                $competition = if ($competitionData) {
                    [PSCustomObject]@{
                        DatabaseCount = $combinedDbCount
                        FileCount = $combinedFileCount
                        DatabaseList = $combinedDbList
                    }
                } else { $null }
                
                # Determinar roles del volumen (puede tener múltiples roles)
                $roles = if ($volumeRoles.ContainsKey($mountPoint)) { $volumeRoles[$mountPoint] } else { @() }
                $isTempDB = ($roles -contains 'TempDB')
                $isData = ($roles -contains 'Data')
                $isLog = ($roles -contains 'Log')
                
                # Obtener análisis de archivos en este volumen
                # MountPoint viene como "E:\" - extraer solo "E:" para match con query
                $driveLetter = $mountPoint.Substring(0, [Math]::Min(2, $mountPoint.Length))
                $fileAnalysisForVolume = $null
                if ($dataFileAnalysis) {
                    $fileAnalysisForVolume = $dataFileAnalysis | Where-Object { 
                        $_.DriveLetter.ToString().Trim() -eq $driveLetter.Trim() 
                    } | Select-Object -First 1
                }
                
                # Extraer métricas de archivos (si están disponibles)
                $totalFiles = if ($fileAnalysisForVolume) { [int]$fileAnalysisForVolume.TotalFiles } else { 0 }
                $filesWithoutGrowth = if ($fileAnalysisForVolume) { [int]$fileAnalysisForVolume.FilesWithoutGrowth } else { 0 }
                $filesWithGrowth = if ($fileAnalysisForVolume) { [int]$fileAnalysisForVolume.FilesWithGrowth } else { 0 }
                $totalFreeSpaceInFilesMB = if ($fileAnalysisForVolume) { ConvertTo-SafeDecimal $fileAnalysisForVolume.TotalFreeSpaceInFilesMB } else { 0 }
                $freeSpaceInGrowableFilesMB = if ($fileAnalysisForVolume) { ConvertTo-SafeDecimal $fileAnalysisForVolume.FreeSpaceInGrowableFilesMB } else { 0 }
                
                # HARDCODED: Servidores DWH siempre tienen growth habilitado
                $isDWHServer = $InstanceName -match 'DWH'
                if ($isDWHServer -and $filesWithGrowth -eq 0 -and $totalFiles -gt 0) {
                    $filesWithGrowth = $totalFiles
                    $filesWithoutGrowth = 0
                }
                # Si es DWH y no hay datos de archivos, asumir al menos 1 archivo con growth
                if ($isDWHServer -and $filesWithGrowth -eq 0) {
                    $filesWithGrowth = 1
                }
                $problematicFileCount = if ($fileAnalysisForVolume) { [int]$fileAnalysisForVolume.ProblematicFiles } else { 0 }
                $avgFreeSpaceInGrowableFilesMB = if ($fileAnalysisForVolume) { ConvertTo-SafeDecimal $fileAnalysisForVolume.AvgFreeSpaceInGrowableFilesMB } else { 0 }
                $avgFreeSpacePctInGrowableFiles = if ($fileAnalysisForVolume) { ConvertTo-SafeDecimal $fileAnalysisForVolume.AvgFreeSpacePctInGrowableFiles } else { 0 }
                
                # Obtener tipo de disco físico (puede ser lento, usar con precaución)
                $diskTypeInfo = Get-DiskMediaType -InstanceName $InstanceName -MountPoint $mountPoint
                
                # Valores de espacio
                $totalGB = ConvertTo-SafeDecimal $_.TotalGB
                $freeGB = ConvertTo-SafeDecimal $_.FreeGB
                $freePct = ConvertTo-SafeDecimal $_.FreePct
                
                # NUEVO v3.3: Cálculo de ESPACIO LIBRE REAL
                # Espacio Libre Real = Espacio libre en disco + Espacio interno en archivos con growth
                $freeSpaceInGrowableFilesGB = $freeSpaceInGrowableFilesMB / 1024.0
                $realFreeGB = $freeGB + $freeSpaceInGrowableFilesGB
                $realFreePct = if ($totalGB -gt 0) { ($realFreeGB / $totalGB) * 100.0 } else { 100.0 }
                
                # NUEVO v3.3: Determinar si el disco debe alertarse
                # Solo alertar si:
                # 1. Tiene archivos con growth habilitado (pueden crecer y consumir disco)
                # 2. El espacio libre REAL (disco + interno en archivos) es <= 10%
                $isAlerted = ($filesWithGrowth -gt 0) -and ($realFreePct -le 10)
                
                # Crear objeto de volumen enriquecido
                @{
                    MountPoint = $mountPoint
                    VolumeName = $_.VolumeName
                    TotalGB = $totalGB
                    FreeGB = $freeGB
                    FreePct = $freePct
                    
                    # NUEVO v3.3: Espacio Libre REAL
                    FreeSpaceInGrowableFilesMB = $freeSpaceInGrowableFilesMB
                    FreeSpaceInGrowableFilesGB = [math]::Round($freeSpaceInGrowableFilesGB, 2)
                    RealFreeGB = [math]::Round($realFreeGB, 2)
                    RealFreePct = [math]::Round($realFreePct, 2)
                    IsAlerted = $isAlerted
                    
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
                    DatabaseCount = if ($competition) { ConvertTo-SafeInt $competition.DatabaseCount } else { 0 }
                    FileCount = if ($competition) { ConvertTo-SafeInt $competition.FileCount } else { 0 }
                    DatabaseList = if ($competition) { $competition.DatabaseList } else { "" }
                    
                    # Análisis de archivos (growth y espacio interno)
                    TotalFiles = $totalFiles
                    FilesWithoutGrowth = $filesWithoutGrowth
                    FilesWithGrowth = $filesWithGrowth
                    TotalFreeSpaceInFilesMB = $totalFreeSpaceInFilesMB
                    ProblematicFileCount = $problematicFileCount
                    AvgFreeSpaceInGrowableFilesMB = $avgFreeSpaceInGrowableFilesMB
                    AvgFreeSpacePctInGrowableFiles = $avgFreeSpacePctInGrowableFiles
                }
            }
            
            # Peor porcentaje libre (del conjunto único de volúmenes ya procesado)
            $result.WorstFreePct = ConvertTo-SafeDecimal (($uniqueVolumes | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
            
            # Promedio por rol (usando los roles detectados)
            # Si no se detectaron roles, asumir que todos los discos tienen Data+Log
            $hasRoles = $volumeRoles.Count -gt 0
            
            $dataDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                if ($hasRoles) {
                    $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                    $roles -contains 'Data'
                } else {
                    $true  # Si no hay roles detectados, todos son Data
                }
            }
            
            if ($dataDisks) {
                $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.DataVolumes = $dataDisks | ForEach-Object { $_.MountPoint }
            }
            
            $logDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                if ($hasRoles) {
                    $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                    $roles -contains 'Log'
                } else {
                    $true  # Si no hay roles detectados, todos son Log
                }
            }
            
            if ($logDisks) {
                $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.LogVolumes = $logDisks | ForEach-Object { $_.MountPoint }
            }
            
            $tempdbDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                if ($hasRoles) {
                    $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                    $roles -contains 'TempDB'
                } else {
                    $false  # Si no hay roles detectados, ninguno es TempDB por defecto
                }
            }
            
            if ($tempdbDisks) {
                $result.TempDBDiskFreePct = ConvertTo-SafeDecimal (($tempdbDisks | Measure-Object -Property FreePct -Average).Average) 100.0
            }
        }
        
        # Guardar si la query de análisis de archivos falló
        $result.FileAnalysisQueryFailed = $fileAnalysisQueryFailed
        
    } catch {
        $errorMsg = $_.Exception.Message
        
        # Construir mensaje con información de versión si está disponible
        $versionInfo = if ($sqlVersion) { 
            "SQL $sqlVersion $servicePack" 
        } else { 
            "versión desconocida" 
        }
        
        # Identificar tipo de error
        if ($errorMsg -match "Timeout") {
            Write-Warning "⏱️  TIMEOUT obteniendo disk metrics en ${InstanceName} ($versionInfo) (después de reintentos)"
        }
        elseif ($errorMsg -match "Connection|Network|Transport") {
            Write-Warning "🔌 ERROR DE CONEXIÓN obteniendo disk metrics en ${InstanceName} ($versionInfo): $errorMsg"
        }
        elseif ($errorMsg -match "sys\.dm_os_volume_stats") {
            Write-Warning "⚠️  ERROR obteniendo disk metrics en ${InstanceName} ($versionInfo): sys.dm_os_volume_stats no disponible. Usa SQL 2008 R2+ o verifica permisos VIEW SERVER STATE."
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
        Prueba conexión con reintentos
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
                Write-Verbose "Intento $attempt falló para $InstanceName, reintentando..."
                Start-Sleep -Seconds 2
            }
        }
    }
    
    return $false
}

function Invoke-SqlQueryWithRetry {
    <#
    .SYNOPSIS
        Ejecuta query SQL con reintentos automáticos en caso de timeout
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
            $result = Invoke-DbaQuery -SqlInstance $InstanceName `
                -Query $Query `
                -QueryTimeout $TimeoutSec `
                -EnableException
            
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
    
    # Si llegamos aquí, todos los reintentos fallaron
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
Write-Host "║  Health Score v3.3 - ESPACIO EN DISCOS               ║" -ForegroundColor Cyan
Write-Host "║  Espacio Libre REAL (disco + interno archivos)        ║" -ForegroundColor Cyan
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
if ($EnableParallel) {
    Write-Host "   🚀 Modo PARALELO activado (ThrottleLimit: $ThrottleLimit)" -ForegroundColor Cyan
    Write-Host "   ℹ️  v3.3: Calcula espacio REAL (disco + interno) para alertas precisas" -ForegroundColor DarkGray
} else {
    Write-Host "   🐌 Modo SECUENCIAL activado" -ForegroundColor DarkGray
    Write-Host "   ℹ️  v3.3: Calcula espacio REAL (disco + interno) para alertas precisas" -ForegroundColor DarkGray
}

$results = @()

if ($EnableParallel -and $PSVersionTable.PSVersion.Major -ge 7) {
    #region ===== PROCESAMIENTO PARALELO (PowerShell 7+) =====
    
    Write-Host "   ℹ️  Usando ForEach-Object -Parallel (PS 7+)" -ForegroundColor DarkGray
    
    $results = $instances | ForEach-Object -ThrottleLimit $ThrottleLimit -Parallel {
        $instance = $_
        $instanceName = $instance.NombreInstancia
        $TimeoutSec = $using:TimeoutSec
        $SqlServer = $using:SqlServer
        $SqlDatabase = $using:SqlDatabase
        
        # Importar módulo en cada runspace paralelo
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
        
        # Función para normalizar mount point a solo letra de unidad
        function Get-NormalizedDriveLetter {
            param([string]$MountPoint)
            if ([string]::IsNullOrWhiteSpace($MountPoint)) { return $MountPoint }
            if ($MountPoint -match '^([A-Za-z]:)') { return $matches[1] + "\" }
            return $MountPoint
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
                    return Invoke-DbaQuery -SqlInstance $InstanceName -Query $Query -QueryTimeout $TimeoutSec -EnableException
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
        
        # Función simplificada Get-DiskMetrics inline
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
                # Detectar versión de SQL Server
                $sqlVersion = "Unknown"
                $majorVersion = 0
                $minorVersion = 0
                
                try {
                    $versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version"
                    $versionResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $versionQuery -TimeoutSec 5 -MaxRetries 1
                    $sqlVersion = $versionResult.Version
                    $majorVersion = [int]($sqlVersion -split '\.')[0]
                    $minorVersion = [int]($sqlVersion -split '\.')[1]
                } catch {
                    # Asumir versión antigua si falla detección
                    $majorVersion = 8  # SQL 2000/2005
                }
                
                # SQL 2005 = version 9.x (no tiene sys.dm_os_volume_stats)
                # SQL 2008+ = version 10.x+ (puede tener sys.dm_os_volume_stats)
                
                # Determinar query según versión
                $querySpaceFallback = @"
-- SQL 2000/2005 compatible (usando xp_fixeddrives)
CREATE TABLE #DriveSpace (
    Drive VARCHAR(10),
    MBFree INT
)

INSERT INTO #DriveSpace
EXEC xp_fixeddrives

SELECT 
    Drive AS DriveLetter,
    MBFree AS MBFree
FROM #DriveSpace

DROP TABLE #DriveSpace
"@

                $querySpaceModern = @"
-- Espacio en discos (deduplicado por volumen físico)
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
"@

                # Seleccionar query según versión
                $querySpace = if ($majorVersion -lt 10) { $querySpaceFallback } else { $querySpaceModern }
                $usesFallback = ($querySpace -eq $querySpaceFallback)
                
                # Ejecutar query con fallback automático si falla
                $dataSpace = $null
                try {
                    $rawData = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $querySpace -TimeoutSec $TimeoutSec -MaxRetries 2
                    
                    # Procesar xp_fixeddrives con WMI si es necesario
                    if ($usesFallback -and $rawData -and $rawData[0].PSObject.Properties.Name -contains 'DriveLetter') {
                        # Detectar roles de discos vía sysaltfiles
                        $diskRoles = @{}
                        try {
                            $queryDetectRoles = @"
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'
"@
                            $rolesResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryDetectRoles -TimeoutSec 5 -MaxRetries 1
                            foreach ($role in $rolesResult) {
                                $diskRoles[$role.DriveLetter] = $role.DiskRole
                            }
                        } catch { }
                        
                        $serverName = $InstanceName.Split('\')[0]
                        $dataSpace = @()
                        
                        foreach ($drive in $rawData) {
                            $driveLetter = $drive.DriveLetter
                            $freeGB = [decimal]($drive.MBFree / 1024.0)
                            
                            # Determinar rol del disco
                            $diskRole = if ($diskRoles.ContainsKey($driveLetter)) { 
                                $diskRoles[$driveLetter] 
                            } else { 
                                'Data' 
                            }
                            
                            $totalGB = 0
                            $freePct = 0
                            
                            try {
                                $diskInfo = Get-WmiObject -ComputerName $serverName -Class Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" -ErrorAction SilentlyContinue
                                if ($diskInfo) {
                                    $totalGB = [decimal]($diskInfo.Size / 1GB)
                                    if ($totalGB -gt 0) { $freePct = [decimal](($freeGB / $totalGB) * 100) }
                                }
                            } catch { }
                            
                            if ($totalGB -eq 0 -and $freeGB -gt 0) {
                                $totalGB = $freeGB * 5
                                $freePct = 20
                            }
                            
                            $dataSpace += [PSCustomObject]@{
                                MountPoint = "${driveLetter}:\"
                                VolumeName = "Drive $driveLetter"
                                TotalGB = $totalGB
                                FreeGB = $freeGB
                                FreePct = $freePct
                                DiskRole = $diskRole
                            }
                        }
                    }
                    else {
                        $dataSpace = $rawData
                    }
                }
                catch {
                    # Si falla por sys.dm_os_volume_stats, usar fallback mejorado
                    if ($_.Exception.Message -match "Invalid object name.*dm_os_volume_stats" -and $querySpace -eq $querySpaceModern) {
                        Write-Warning "      ⚠️  ${InstanceName}: sys.dm_os_volume_stats no disponible, usando xp_fixeddrives + WMI"
                        
                        try {
                            # Detectar roles de discos vía sysaltfiles
                            $queryDetectRoles = @"
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'
"@
                            $diskRoles = @{}
                            try {
                                $rolesResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryDetectRoles -TimeoutSec 5 -MaxRetries 1
                                foreach ($role in $rolesResult) {
                                    $diskRoles[$role.DriveLetter] = $role.DiskRole
                                }
                            } catch { }
                            
                            # Query simplificada de xp_fixeddrives
                            $queryFallbackSimple = @"
CREATE TABLE #DriveSpace (Drive VARCHAR(10), MBFree INT)
INSERT INTO #DriveSpace EXEC xp_fixeddrives
SELECT Drive AS DriveLetter, MBFree AS MBFree FROM #DriveSpace
DROP TABLE #DriveSpace
"@
                            $xpResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryFallbackSimple -TimeoutSec $TimeoutSec -MaxRetries 1
                            
                            if ($xpResult) {
                                $serverName = $InstanceName.Split('\')[0]
                                $dataSpace = @()
                                
                                foreach ($drive in $xpResult) {
                                    $driveLetter = $drive.DriveLetter
                                    $freeGB = [decimal]($drive.MBFree / 1024.0)
                                    
                                    # Determinar rol del disco
                                    $diskRole = if ($diskRoles.ContainsKey($driveLetter)) { 
                                        $diskRoles[$driveLetter] 
                                    } else { 
                                        'Data' 
                                    }
                                    
                                    $totalGB = 0
                                    $freePct = 0
                                    
                                    # Intentar WMI
                                    try {
                                        $diskInfo = Get-WmiObject -ComputerName $serverName -Class Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" -ErrorAction SilentlyContinue
                                        if ($diskInfo) {
                                            $totalGB = [decimal]($diskInfo.Size / 1GB)
                                            if ($totalGB -gt 0) {
                                                $freePct = [decimal](($freeGB / $totalGB) * 100)
                                            }
                                        }
                                    } catch { }
                                    
                                    # Fallback: estimar
                                    if ($totalGB -eq 0 -and $freeGB -gt 0) {
                                        $totalGB = $freeGB * 5
                                        $freePct = 20
                                    }
                                    
                                    $dataSpace += [PSCustomObject]@{
                                        MountPoint = "${driveLetter}:\"
                                        VolumeName = "Drive $driveLetter"
                                        TotalGB = $totalGB
                                        FreeGB = $freeGB
                                        FreePct = $freePct
                                        DiskRole = $diskRole
                                    }
                                }
                            }
                        }
                        catch {
                            Write-Warning "      ❌ ${InstanceName}: Fallback también falló"
                            throw
                        }
                    }
                    else {
                        throw
                    }
                }
                
                if ($dataSpace) {
                    # Normalizar y agrupar volúmenes por letra de unidad
                    $uniqueVolumes = $dataSpace | 
                        ForEach-Object {
                            $_ | Add-Member -NotePropertyName NormalizedDrive -NotePropertyValue (Get-NormalizedDriveLetter $_.MountPoint) -PassThru
                        } |
                        Group-Object -Property NormalizedDrive | 
                        ForEach-Object {
                            $volumesInDrive = $_.Group
                            $firstVol = $volumesInDrive[0]
                            $combinedTotalGB = ($volumesInDrive | Measure-Object -Property TotalGB -Sum).Sum
                            $combinedFreeGB = ($volumesInDrive | Measure-Object -Property FreeGB -Sum).Sum
                            $combinedFreePct = if ($combinedTotalGB -gt 0) { ($combinedFreeGB / $combinedTotalGB) * 100.0 } else { 100.0 }
                            [PSCustomObject]@{
                                MountPoint = $firstVol.NormalizedDrive
                                VolumeName = $firstVol.VolumeName
                                TotalGB = [math]::Round($combinedTotalGB, 2)
                                FreeGB = [math]::Round($combinedFreeGB, 2)
                                FreePct = [math]::Round($combinedFreePct, 2)
                            }
                        }
                    
                    # Detectar roles de volúmenes (simplificado para modo paralelo)
                    $queryRoles = @"
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
"@
                    $volumeRoles = @{}
                    try {
                        $rolesData = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryRoles -TimeoutSec 5 -MaxRetries 1
                        foreach ($roleEntry in $rolesData) {
                            # Normalizar mount point para agrupar roles por letra de unidad
                            $mp = Get-NormalizedDriveLetter $roleEntry.MountPoint
                            if (-not $volumeRoles.ContainsKey($mp)) {
                                $volumeRoles[$mp] = @()
                            }
                            if ($volumeRoles[$mp] -notcontains $roleEntry.DiskRole) {
                                $volumeRoles[$mp] += $roleEntry.DiskRole
                            }
                        }
                    } catch { }
                    
                    # NUEVO v3.3: Query de análisis de archivos para modo paralelo
                    $queryFileAnalysisParallel = @"
-- Análisis de espacio interno usando sys.dm_db_file_space_used (cross-database)
IF OBJECT_ID('tempdb..#FileSpaceAnalysis') IS NOT NULL DROP TABLE #FileSpaceAnalysis;
CREATE TABLE #FileSpaceAnalysis (
    DriveLetter VARCHAR(2),
    FilesWithoutGrowth INT,
    FilesWithGrowth INT,
    FreeSpaceInGrowableFilesMB DECIMAL(18,2)
);

DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + N'
USE ' + QUOTENAME(d.name) + N';
INSERT INTO #FileSpaceAnalysis
SELECT 
    RTRIM(LEFT(mf.physical_name, 2)),
    SUM(CASE WHEN mf.growth = 0 THEN 1 ELSE 0 END),
    SUM(CASE WHEN mf.growth != 0 THEN 1 ELSE 0 END),
    CAST(SUM(CASE WHEN mf.growth != 0 THEN fs.unallocated_extent_page_count * 8.0 / 1024 ELSE 0 END) AS DECIMAL(18,2))
FROM sys.database_files mf
INNER JOIN sys.dm_db_file_space_used fs ON mf.file_id = fs.file_id
WHERE mf.type IN (0, 1)
GROUP BY RTRIM(LEFT(mf.physical_name, 2));
'
FROM sys.databases d
WHERE d.name NOT IN ('master', 'model', 'msdb', 'tempdb') AND d.state = 0 AND d.is_read_only = 0;

EXEC sp_executesql @sql;

SELECT DriveLetter, SUM(FilesWithoutGrowth) AS FilesWithoutGrowth, SUM(FilesWithGrowth) AS FilesWithGrowth, SUM(FreeSpaceInGrowableFilesMB) AS FreeSpaceInGrowableFilesMB
FROM #FileSpaceAnalysis GROUP BY DriveLetter;

DROP TABLE #FileSpaceAnalysis;
"@
                    $fileAnalysisData = $null
                    try {
                        $fileAnalysisData = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryFileAnalysisParallel -TimeoutSec 15 -MaxRetries 1
                    } catch { }
                    
                    $result.Volumes = $uniqueVolumes | ForEach-Object {
                        $totalGB = ConvertTo-SafeDecimal $_.TotalGB
                        $freeGB = ConvertTo-SafeDecimal $_.FreeGB
                        $freePct = ConvertTo-SafeDecimal $_.FreePct
                        
                        # El MountPoint ya viene normalizado desde el agrupamiento anterior
                        $mountPoint = $_.MountPoint
                        
                        # Buscar análisis de archivos para este volumen
                        # Extraer solo "E:" para match con query
                        $driveLetter = if ($mountPoint.Length -ge 2) { $mountPoint.Substring(0, 2) } else { $mountPoint }
                        $fileAnalysis = $fileAnalysisData | Where-Object { $_.DriveLetter.ToString().Trim() -eq $driveLetter.Trim() } | Select-Object -First 1
                        
                        $filesWithGrowth = if ($fileAnalysis) { [int]$fileAnalysis.FilesWithGrowth } else { 0 }
                        $filesWithoutGrowth = if ($fileAnalysis) { [int]$fileAnalysis.FilesWithoutGrowth } else { 0 }
                        $totalFilesVol = $filesWithGrowth + $filesWithoutGrowth
                        $freeSpaceInGrowableFilesMB = if ($fileAnalysis) { ConvertTo-SafeDecimal $fileAnalysis.FreeSpaceInGrowableFilesMB } else { 0 }
                        
                        # HARDCODED: Servidores DWH siempre tienen growth habilitado
                        $isDWHServer = $InstanceName -match 'DWH'
                        if ($isDWHServer -and $filesWithGrowth -eq 0 -and $totalFilesVol -gt 0) {
                            $filesWithGrowth = $totalFilesVol
                            $filesWithoutGrowth = 0
                        }
                        if ($isDWHServer -and $filesWithGrowth -eq 0) {
                            $filesWithGrowth = 1
                        }
                        
                        # NUEVO v3.3: Cálculo de ESPACIO LIBRE REAL
                        $freeSpaceInGrowableFilesGB = $freeSpaceInGrowableFilesMB / 1024.0
                        $realFreeGB = $freeGB + $freeSpaceInGrowableFilesGB
                        $realFreePct = if ($totalGB -gt 0) { ($realFreeGB / $totalGB) * 100.0 } else { 100.0 }
                        
                        # Solo alertar si tiene archivos con growth Y espacio real <= 10%
                        $isAlerted = ($filesWithGrowth -gt 0) -and ($realFreePct -le 10)
                        
                        @{
                            MountPoint = $mountPoint
                            VolumeName = $_.VolumeName
                            TotalGB = $totalGB
                            FreeGB = $freeGB
                            FreePct = $freePct
                            FilesWithGrowth = $filesWithGrowth
                            FilesWithoutGrowth = $filesWithoutGrowth
                            TotalFiles = $filesWithGrowth + $filesWithoutGrowth
                            FreeSpaceInGrowableFilesMB = $freeSpaceInGrowableFilesMB
                            FreeSpaceInGrowableFilesGB = [math]::Round($freeSpaceInGrowableFilesGB, 2)
                            RealFreeGB = [math]::Round($realFreeGB, 2)
                            RealFreePct = [math]::Round($realFreePct, 2)
                            IsAlerted = $isAlerted
                        }
                    }
                    
                    # Peor porcentaje libre
                    $result.WorstFreePct = ConvertTo-SafeDecimal (($uniqueVolumes | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
                    
                    # Promedio por rol (usando roles detectados)
                    # Si no se detectaron roles, asumir que todos los discos tienen Data+Log
                    $hasRoles = $volumeRoles.Count -gt 0
                    
                    $dataDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        if ($hasRoles) {
                            $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                            $roles -contains 'Data'
                        } else {
                            $true
                        }
                    }
                    if ($dataDisks) {
                        $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $logDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        if ($hasRoles) {
                            $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                            $roles -contains 'Log'
                        } else {
                            $true
                        }
                    }
                    if ($logDisks) {
                        $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $tempdbDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        if ($hasRoles) {
                            $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                            $roles -contains 'TempDB'
                        } else {
                            $false
                        }
                    }
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
            Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
            return $null
        }
        
        $diskMetrics = Get-DiskMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
        
        # NUEVO v3.3: Lógica de alertas basada en ESPACIO LIBRE REAL
        $alertedVolumes = @()
        $worstRealFreePct = 100.0
        if ($diskMetrics.Volumes) {
            foreach ($vol in $diskMetrics.Volumes) {
                if ($vol.RealFreePct -lt $worstRealFreePct) {
                    $worstRealFreePct = $vol.RealFreePct
                }
                if ($vol.IsAlerted) {
                    $alertedVolumes += $vol
                }
            }
        }
        
        $status = "✅"
        $statusMessage = ""
        if ($alertedVolumes.Count -gt 0) {
            $worstAlertedPct = ($alertedVolumes | Measure-Object -Property RealFreePct -Minimum).Minimum
            if ($worstAlertedPct -le 5) {
                $status = "🚨 CRÍTICO!"
            } else {
                $status = "⚠️ ALERTA!"
            }
            $statusMessage = " ($($alertedVolumes.Count) disco(s) con ≤10% espacio REAL)"
        }
        elseif ($diskMetrics.WorstFreePct -lt 10) {
            $status = "📊 Disco bajo (sin riesgo)"
        }
        elseif ($diskMetrics.WorstFreePct -lt 20) {
            $status = "📊 Monitorear"
        }
        
        Write-Host "   $status $instanceName - Disco:$([int]$diskMetrics.WorstFreePct)% Real:$([int]$worstRealFreePct)%$statusMessage" -ForegroundColor Gray
        
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
    
    # Filtrar nulos (instancias sin conexión)
    $results = $results | Where-Object { $_ -ne $null }
    
    #endregion
}
else {
    #region ===== PROCESAMIENTO SECUENCIAL (PowerShell 5.1 o $EnableParallel = $false) =====
    
    if ($EnableParallel -and $PSVersionTable.PSVersion.Major -lt 7) {
        Write-Host "   ⚠️  Procesamiento paralelo requiere PowerShell 7+. Usando modo secuencial." -ForegroundColor Yellow
    }
    
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
        
        # NUEVO v3.3: Contar discos alertados (RealFreePct <= 10% Y tiene archivos con growth)
        $alertedVolumes = @()
        $worstRealFreePct = 100.0
        if ($diskMetrics.Volumes) {
            foreach ($vol in $diskMetrics.Volumes) {
                # Actualizar peor porcentaje REAL
                if ($vol.RealFreePct -lt $worstRealFreePct) {
                    $worstRealFreePct = $vol.RealFreePct
                }
                # Contar volúmenes alertados
                if ($vol.IsAlerted) {
                    $alertedVolumes += $vol
                }
            }
        }
        
        # NUEVO v3.3: Lógica de alertas basada en ESPACIO LIBRE REAL
        # Solo alertar si: archivos con growth + espacio real <= 10%
        $status = "✅"
        $statusMessage = ""
        
        if ($alertedVolumes.Count -gt 0) {
            # Hay volúmenes con riesgo REAL (growth habilitado + poco espacio real)
            $worstAlertedPct = ($alertedVolumes | Measure-Object -Property RealFreePct -Minimum).Minimum
            if ($worstAlertedPct -le 5) {
                $status = "🚨 CRÍTICO!"
                $statusMessage = " ($($alertedVolumes.Count) disco(s) con ≤10% espacio REAL)"
            }
            else {
                $status = "⚠️ ALERTA!"
                $statusMessage = " ($($alertedVolumes.Count) disco(s) con ≤10% espacio REAL)"
            }
        }
        elseif ($diskMetrics.WorstFreePct -lt 10) {
            # Disco bajo pero SIN riesgo real (no hay archivos con growth o tienen espacio interno)
            $status = "📊 Disco bajo (sin riesgo)"
        }
        elseif ($diskMetrics.WorstFreePct -lt 20) {
            $status = "📊 Monitorear"
        }
        
        Write-Host "   $status $instanceName - Disco:$([int]$diskMetrics.WorstFreePct)% Real:$([int]$worstRealFreePct)%$statusMessage" -ForegroundColor Gray
        
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
    
    Write-Progress -Activity "Recolectando métricas" -Completed
    
    #endregion
}

# 3. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - DISCOS v3.3 (Espacio Libre REAL)           ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgWorst = ($results | Measure-Object -Property WorstFreePct -Average).Average
$avgData = ($results | Measure-Object -Property DataDiskAvgFreePct -Average).Average
$avgLog = ($results | Measure-Object -Property LogDiskAvgFreePct -Average).Average

Write-Host "║  Worst disco % promedio:     $([int]$avgWorst)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Data disco % promedio:      $([int]$avgData)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Log disco % promedio:       $([int]$avgLog)%".PadRight(53) "║" -ForegroundColor White

# NUEVO v3.3: Contar instancias REALMENTE alertadas (espacio REAL <= 10%)
$instancesWithRealAlerts = 0
$totalAlertedVolumes = 0
$alertedInstanceDetails = @()

foreach ($r in $results) {
    if ($r.Volumes) {
        $alertedVols = @()
        $worstRealPct = 100.0
        foreach ($vol in $r.Volumes) {
            if ($vol.RealFreePct -lt $worstRealPct) {
                $worstRealPct = $vol.RealFreePct
            }
            if ($vol.IsAlerted) {
                $alertedVols += $vol
            }
        }
        if ($alertedVols.Count -gt 0) {
            $instancesWithRealAlerts++
            $totalAlertedVolumes += $alertedVols.Count
            $alertedInstanceDetails += [PSCustomObject]@{
                InstanceName = $r.InstanceName
                AlertedVolumes = $alertedVols.Count
                WorstRealFreePct = $worstRealPct
                WorstDiskPct = $r.WorstFreePct
            }
        }
    }
}

Write-Host "║" -NoNewline -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "║  ══════════ ALERTAS REALES (v3.3) ══════════".PadRight(53) "║" -ForegroundColor Cyan

# Discos físicos bajo (sin considerar espacio interno)
$disksBelowTenPct = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count
Write-Host "║  Discos físicos <10%:        $disksBelowTenPct".PadRight(53) "║" -ForegroundColor White

# Discos REALMENTE alertados (espacio REAL <= 10%)
$alertColor = if ($instancesWithRealAlerts -gt 0) { "Red" } else { "Green" }
Write-Host "║  🚨 Instancias ALERTADAS:    $instancesWithRealAlerts".PadRight(53) "║" -ForegroundColor $alertColor
Write-Host "║  🚨 Volúmenes alertados:     $totalAlertedVolumes".PadRight(53) "║" -ForegroundColor $alertColor
Write-Host "║" -NoNewline -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "║  Criterio: Growth + EspacioReal ≤10%".PadRight(53) "║" -ForegroundColor DarkGray
Write-Host "║  EspacioReal = Disco + EspacioInternoEnArchivos".PadRight(53) "║" -ForegroundColor DarkGray

# Contar instancias donde falló la query de análisis de archivos
$instancesWithQueryFailed = ($results | Where-Object { $_.FileAnalysisQueryFailed -eq $true }).Count
if ($instancesWithQueryFailed -gt 0) {
    Write-Host "║" -NoNewline -ForegroundColor Green
    Write-Host "" -ForegroundColor White
    Write-Host "║  ⚠️  Instancias con error en query: $instancesWithQueryFailed".PadRight(53) "║" -ForegroundColor Yellow
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green

# NUEVO v3.3: Mostrar TOP instancias REALMENTE alertadas
if ($instancesWithRealAlerts -gt 0) {
    Write-Host ""
    Write-Host "🚨 INSTANCIAS CON ESPACIO REAL ≤10% (Growth habilitado + disco/interno bajo):" -ForegroundColor Red
    
    $alertedInstanceDetails | Sort-Object -Property WorstRealFreePct | Select-Object -First 10 | ForEach-Object {
        $emoji = if ($_.WorstRealFreePct -le 5) { "🚨" } else { "⚠️" }
        Write-Host "   $emoji $($_.InstanceName.PadRight(35)) Disco:$([int]$_.WorstDiskPct)% → Real:$([int]$_.WorstRealFreePct)% ($($_.AlertedVolumes) vol)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "   💡 Estos discos tienen archivos con growth habilitado y poco espacio" -ForegroundColor DarkGray
    Write-Host "      disponible tanto en disco como internamente en los archivos." -ForegroundColor DarkGray
}

# Mostrar instancias con disco bajo pero SIN alerta (para información)
$diskLowNoAlert = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count - $instancesWithRealAlerts
if ($diskLowNoAlert -gt 0) {
    Write-Host ""
    Write-Host "📊 $diskLowNoAlert instancia(s) con disco <10% pero SIN alerta (archivos sin growth o con espacio interno)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

