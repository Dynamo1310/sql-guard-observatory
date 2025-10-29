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
        ProblematicFilesQueryFailed = $false  # Indica si la query de archivos problemáticos falló
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

        # Query 1b: Archivos con poco espacio interno Y crecimiento habilitado (CRÍTICO)
        # Solo alertar si el archivo puede crecer (growth != 0) y tiene poco espacio libre interno
        # Mejorada: ignora bases offline/restoring para evitar errores con FILEPROPERTY
        $queryProblematicFiles = @"
-- Archivos con poco espacio interno Y crecimiento habilitado (compatible SQL 2008+)
-- Basado en la lógica del usuario: solo alertar si growth != 0 y espacio interno < 30MB
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
        
        # Query de archivos problemáticos: solo para SQL 2008+ con sys.dm_os_volume_stats
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
                Write-Warning "      ⚠️  No se pudo obtener archivos problemáticos en ${InstanceName}: $($_.Exception.Message)"
            }
        } else {
            # SQL 2005 o SQL 2008 sin sys.dm_os_volume_stats: No soportado
            if (-not $hasVolumeStats) {
                Write-Verbose "      ℹ️  Archivos problemáticos no disponible en ${InstanceName} (SQL $sqlVersion - falta sys.dm_os_volume_stats)"
            } else {
                Write-Verbose "      ℹ️  Archivos problemáticos no disponible en SQL 2005 para ${InstanceName}"
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
            # Obtener volúmenes únicos para procesamiento usando Group-Object (más robusto)
            $uniqueVolumes = $dataSpace | 
                Group-Object -Property MountPoint | 
                ForEach-Object {
                    # Tomar el primer elemento de cada grupo (todos tienen los mismos valores de espacio)
                    $_.Group[0]
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
                    $mp = $roleEntry.MountPoint
                    if (-not $volumeRoles.ContainsKey($mp)) {
                        $volumeRoles[$mp] = @()
                    }
                    $volumeRoles[$mp] += $roleEntry.DiskRole
                }
            }
            catch {
                Write-Verbose "      No se pudo detectar roles de volúmenes para ${InstanceName}"
            }
            
            # Procesar cada volumen único
            $result.Volumes = $uniqueVolumes | ForEach-Object {
                $mountPoint = $_.MountPoint
                
                # Obtener info de competencia para este volumen
                $competition = $dataCompetition | Where-Object { $_.MountPoint -eq $mountPoint } | Select-Object -First 1
                
                # Determinar roles del volumen (puede tener múltiples roles)
                $roles = if ($volumeRoles.ContainsKey($mountPoint)) { $volumeRoles[$mountPoint] } else { @() }
                $isTempDB = ($roles -contains 'TempDB')
                $isData = ($roles -contains 'Data')
                $isLog = ($roles -contains 'Log')
                
                # Obtener archivos problemáticos en este volumen (poco espacio interno + growth habilitado)
                $driveLetter = $mountPoint.TrimEnd('\').TrimEnd(':') + ':'
                $problematicFilesInVolume = @()
                if ($dataProblematicFiles) {
                    $problematicFilesInVolume = $dataProblematicFiles | Where-Object { 
                        $_.DriveLetter -eq $driveLetter 
                    }
                }
                $problematicFileCount = if ($problematicFilesInVolume) { $problematicFilesInVolume.Count } else { 0 }
                
                # Obtener tipo de disco físico (puede ser lento, usar con precaución)
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
                    
                    # Información de disco físico
                    MediaType = $diskTypeInfo.MediaType
                    BusType = $diskTypeInfo.BusType
                    HealthStatus = $diskTypeInfo.HealthStatus
                    OperationalStatus = $diskTypeInfo.OperationalStatus
                    
                    # Competencia (cuántas DBs/archivos)
                    DatabaseCount = if ($competition) { ConvertTo-SafeInt $competition.DatabaseCount } else { 0 }
                    FileCount = if ($competition) { ConvertTo-SafeInt $competition.FileCount } else { 0 }
                    DatabaseList = if ($competition) { $competition.DatabaseList } else { "" }
                    
                    # Archivos problemáticos (poco espacio interno + growth habilitado)
                    ProblematicFileCount = $problematicFileCount
                }
            }
            
            # Peor porcentaje libre (del conjunto único de volúmenes ya procesado)
            $result.WorstFreePct = ConvertTo-SafeDecimal (($uniqueVolumes | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
            
            # Promedio por rol (usando los roles detectados)
            $dataDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                $roles -contains 'Data'
            }
            
            if ($dataDisks) {
                $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.DataVolumes = $dataDisks | ForEach-Object { $_.MountPoint }
            }
            
            $logDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                $roles -contains 'Log'
            }
            
            if ($logDisks) {
                $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                $result.LogVolumes = $logDisks | ForEach-Object { $_.MountPoint }
            }
            
            $tempdbDisks = $uniqueVolumes | Where-Object { 
                $mp = $_.MountPoint
                $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                $roles -contains 'TempDB'
            }
            
            if ($tempdbDisks) {
                $result.TempDBDiskFreePct = ConvertTo-SafeDecimal (($tempdbDisks | Measure-Object -Property FreePct -Average).Average) 100.0
            }
        }
        
        # Guardar si la query de archivos problemáticos falló
        $result.ProblematicFilesQueryFailed = $problematicFilesQueryFailed
        
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
if ($EnableParallel) {
    Write-Host "   🚀 Modo PARALELO activado (ThrottleLimit: $ThrottleLimit)" -ForegroundColor Cyan
    Write-Host "   ℹ️  Modo paralelo: Recolección simplificada de espacio en discos (sin análisis de archivos problemáticos)" -ForegroundColor DarkGray
} else {
    Write-Host "   🐌 Modo SECUENCIAL activado - Recolección completa con todas las funciones" -ForegroundColor DarkGray
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
                    # Obtener volúmenes únicos usando Group-Object (más robusto)
                    $uniqueVolumes = $dataSpace | 
                        Group-Object -Property MountPoint | 
                        ForEach-Object { $_.Group[0] }
                    
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
                            $mp = $roleEntry.MountPoint
                            if (-not $volumeRoles.ContainsKey($mp)) {
                                $volumeRoles[$mp] = @()
                            }
                            $volumeRoles[$mp] += $roleEntry.DiskRole
                        }
                    } catch { }
                    
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
                    
                    # Peor porcentaje libre
                    $result.WorstFreePct = ConvertTo-SafeDecimal (($uniqueVolumes | Measure-Object -Property FreePct -Minimum).Minimum) 100.0
                    
                    # Promedio por rol (usando roles detectados)
                    $dataDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                        $roles -contains 'Data'
                    }
                    if ($dataDisks) {
                        $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $logDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                        $roles -contains 'Log'
                    }
                    if ($logDisks) {
                        $result.LogDiskAvgFreePct = ConvertTo-SafeDecimal (($logDisks | Measure-Object -Property FreePct -Average).Average) 100.0
                    }
                    
                    $tempdbDisks = $uniqueVolumes | Where-Object { 
                        $mp = $_.MountPoint
                        $roles = if ($volumeRoles.ContainsKey($mp)) { $volumeRoles[$mp] } else { @() }
                        $roles -contains 'TempDB'
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
        
        # Lógica simplificada de alertas (modo paralelo rápido - sin análisis de archivos)
        $status = "✅"
        if ($diskMetrics.WorstFreePct -lt 5) {
            $status = "🚨 CRÍTICO!"
        }
        elseif ($diskMetrics.WorstFreePct -lt 10) {
            $status = "⚠️ BAJO!"
        }
        elseif ($diskMetrics.WorstFreePct -lt 20) {
            $status = "⚠️ ADVERTENCIA"
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
        
        # Contar archivos problemáticos
        $totalProblematicFiles = 0
        if ($diskMetrics.Volumes) {
            foreach ($vol in $diskMetrics.Volumes) {
                if ($vol.ProblematicFileCount) {
                    $totalProblematicFiles += $vol.ProblematicFileCount
                }
            }
        }
        
        # Lógica de alertas
        $status = "✅"
        $statusMessage = ""
        
        if ($totalProblematicFiles -gt 0) {
            if ($diskMetrics.WorstFreePct -lt 10 -or $totalProblematicFiles -ge 5) {
                $status = "🚨 CRÍTICO!"
                $statusMessage = " ($totalProblematicFiles archivos con <30MB libres)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 20 -or $totalProblematicFiles -ge 2) {
                $status = "⚠️ ADVERTENCIA"
                $statusMessage = " ($totalProblematicFiles archivos con <30MB libres)"
            }
        }
        else {
            if ($diskMetrics.WorstFreePct -lt 5) {
                $status = "📊 Disco bajo (archivos OK)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 10) {
                $status = "📊 Disco bajo (archivos OK)"
            }
            elseif ($diskMetrics.WorstFreePct -lt 20) {
                $status = "📊 Monitorear"
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
Write-Host "║  RESUMEN - DISCOS                                     ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgWorst = ($results | Measure-Object -Property WorstFreePct -Average).Average
$avgData = ($results | Measure-Object -Property DataDiskAvgFreePct -Average).Average
$avgLog = ($results | Measure-Object -Property LogDiskAvgFreePct -Average).Average

Write-Host "║  Worst % promedio:     $([int]$avgWorst)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Data % promedio:      $([int]$avgData)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Log % promedio:       $([int]$avgLog)%".PadRight(53) "║" -ForegroundColor White

# Contar instancias con archivos problemáticos (< 30MB libres internos + growth habilitado)
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

Write-Host "║" -NoNewline -ForegroundColor Green
Write-Host "" -ForegroundColor White
$critical = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count
Write-Host "║  Discos críticos (<10%): $critical".PadRight(53) "║" -ForegroundColor White

Write-Host "║  Instancias con archivos problemáticos: $instancesWithProblematicFiles".PadRight(53) "║" -ForegroundColor $(if ($instancesWithProblematicFiles -gt 0) { "Yellow" } else { "White" })
Write-Host "║  Total archivos con <30MB libres: $totalProblematicFilesCount".PadRight(53) "║" -ForegroundColor $(if ($totalProblematicFilesCount -gt 0) { "Yellow" } else { "White" })
Write-Host "║  (Solo archivos con growth habilitado)".PadRight(53) "║" -ForegroundColor DarkGray

# Contar instancias donde falló la query de archivos problemáticos
$instancesWithQueryFailed = ($results | Where-Object { $_.ProblematicFilesQueryFailed -eq $true }).Count
if ($instancesWithQueryFailed -gt 0) {
    Write-Host "║" -NoNewline -ForegroundColor Green
    Write-Host "" -ForegroundColor White
    Write-Host "║  ⚠️  Instancias con error en query de archivos: $instancesWithQueryFailed".PadRight(53) "║" -ForegroundColor Yellow
    Write-Host "║      (Datos de archivos problemáticos incompletos)".PadRight(53) "║" -ForegroundColor DarkGray
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green

# Mostrar TOP instancias con archivos problemáticos si existen
if ($instancesWithProblematicFiles -gt 0) {
    Write-Host ""
    Write-Host "🚨 TOP INSTANCIAS CON ARCHIVOS PROBLEMÁTICOS (<30MB libres + growth habilitado):" -ForegroundColor Red
    
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
        $emoji = if ($_.ProblematicFileCount -ge 5) { "🚨" } elseif ($_.ProblematicFileCount -ge 2) { "⚠️" } else { "📊" }
        Write-Host "   $emoji $($_.InstanceName.PadRight(30)) - $($_.ProblematicFileCount) archivos - Worst: $([int]$_.WorstFreePct)%" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

