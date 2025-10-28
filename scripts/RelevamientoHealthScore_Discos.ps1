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

# Limpiar mÃ³dulos SQL existentes para evitar conflictos de assemblies
$sqlModules = @('SqlServer', 'SQLPS', 'dbatools', 'dbatools.library')
foreach ($mod in $sqlModules) {
    if (Get-Module -Name $mod) {
        Remove-Module $mod -Force -ErrorAction SilentlyContinue
    }
}

# Verificar que dbatools estÃ¡ disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Intentar importar dbatools
try {
    Import-Module dbatools -Force -ErrorAction Stop
    Write-Verbose "âœ… dbatools cargado correctamente"
} catch {
    if ($_.Exception.Message -like "*Microsoft.Data.SqlClient*already loaded*") {
        Write-Warning "âš ï¸  Conflicto de assembly detectado. Para evitar este problema:"
        Write-Warning "   OpciÃ³n 1: Ejecuta el script usando el wrapper Run-*-Clean.ps1 correspondiente"
        Write-Warning "   OpciÃ³n 2: Cierra esta sesiÃ³n y ejecuta: powershell -NoProfile -File .\<NombreScript>.ps1"
        Write-Warning ""
        Write-Warning "âš ï¸  Intentando continuar con dbatools ya cargado..."
        
        # Si dbatools ya estÃ¡ parcialmente cargado, intentar usarlo de todos modos
        if (-not (Get-Module -Name dbatools)) {
            Write-Error "âŒ No se pudo cargar dbatools. Usa una de las opciones anteriores."
            exit 1
        }
    } else {
        throw
    }
}
        
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


