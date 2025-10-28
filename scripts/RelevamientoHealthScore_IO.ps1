<#
.SYNOPSIS
    Health Score v3.0 - RecolecciÃ³n de mÃ©tricas de IO (Latencia / IOPS)
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Latencia de lectura/escritura (data y log)
    - IOPS por disco
    - Stalls (tiempo de espera en I/O)
    
    Guarda en: InstanceHealth_IO
    
    Peso en scoring: 10%
    Criterios: Latencia data/log â‰¤5ms=100; 6â€“10=80; 11â€“20=60; >20=40
    Cap: Log p95 >20ms => cap 70
    
.NOTES
    VersiÃ³n: 3.0
    Frecuencia: Cada 5 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

# Verificar que dbatools estÃ¡ disponible
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

function Get-IOMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        AvgReadLatencyMs = 0
        AvgWriteLatencyMs = 0
        MaxReadLatencyMs = 0
        MaxWriteLatencyMs = 0
        DataFileAvgReadMs = 0
        DataFileAvgWriteMs = 0
        LogFileAvgWriteMs = 0
        TotalIOPS = 0
        ReadIOPS = 0
        WriteIOPS = 0
        Details = @()
    }
    
    try {
        $query = @"
-- Obtener uptime del servidor en segundos
DECLARE @UptimeSeconds BIGINT;
SELECT @UptimeSeconds = DATEDIFF(SECOND, sqlserver_start_time, GETDATE())
FROM sys.dm_os_sys_info;

-- Evitar divisiÃ³n por cero si el servidor acaba de reiniciar
IF @UptimeSeconds < 60 SET @UptimeSeconds = 60;

-- Latencias por archivo (data vs log) + IOPS calculados
SELECT 
    DB_NAME(vfs.database_id) AS DatabaseName,
    mf.type_desc AS FileType,
    mf.physical_name AS PhysicalName,
    vfs.num_of_reads AS NumReads,
    vfs.num_of_writes AS NumWrites,
    CASE WHEN vfs.num_of_reads = 0 THEN 0 
         ELSE (vfs.io_stall_read_ms / vfs.num_of_reads) 
    END AS AvgReadLatencyMs,
    CASE WHEN vfs.num_of_writes = 0 THEN 0 
         ELSE (vfs.io_stall_write_ms / vfs.num_of_writes) 
    END AS AvgWriteLatencyMs,
    vfs.io_stall_read_ms AS TotalReadStallMs,
    vfs.io_stall_write_ms AS TotalWriteStallMs,
    -- IOPS = operaciones totales / uptime en segundos
    CAST(CAST(vfs.num_of_reads AS BIGINT) * 1.0 / @UptimeSeconds AS DECIMAL(18,2)) AS ReadIOPS,
    CAST(CAST(vfs.num_of_writes AS BIGINT) * 1.0 / @UptimeSeconds AS DECIMAL(18,2)) AS WriteIOPS,
    @UptimeSeconds AS UptimeSeconds
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
INNER JOIN sys.master_files mf 
    ON vfs.database_id = mf.database_id 
    AND vfs.file_id = mf.file_id
WHERE vfs.num_of_reads > 0 OR vfs.num_of_writes > 0
ORDER BY 
    CASE WHEN vfs.num_of_reads > 0 THEN (vfs.io_stall_read_ms / vfs.num_of_reads) ELSE 0 END DESC,
    CASE WHEN vfs.num_of_writes > 0 THEN (vfs.io_stall_write_ms / vfs.num_of_writes) ELSE 0 END DESC;
"@
        
        $data = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        if ($data) {
            # Calcular mÃ©tricas agregadas
            $allReads = $data | Where-Object { $_.NumReads -gt 0 }
            $allWrites = $data | Where-Object { $_.NumWrites -gt 0 }
            
            if ($allReads) {
                $result.AvgReadLatencyMs = [decimal](($allReads | Measure-Object -Property AvgReadLatencyMs -Average).Average)
                $result.MaxReadLatencyMs = [decimal](($allReads | Measure-Object -Property AvgReadLatencyMs -Maximum).Maximum)
                # Sumar todos los ReadIOPS de todos los archivos
                $result.ReadIOPS = [decimal](($allReads | Measure-Object -Property ReadIOPS -Sum).Sum)
            }
            
            if ($allWrites) {
                $result.AvgWriteLatencyMs = [decimal](($allWrites | Measure-Object -Property AvgWriteLatencyMs -Average).Average)
                $result.MaxWriteLatencyMs = [decimal](($allWrites | Measure-Object -Property AvgWriteLatencyMs -Maximum).Maximum)
                # Sumar todos los WriteIOPS de todos los archivos
                $result.WriteIOPS = [decimal](($allWrites | Measure-Object -Property WriteIOPS -Sum).Sum)
            }
            
            # IOPS totales = suma de lectura + escritura
            $result.TotalIOPS = $result.ReadIOPS + $result.WriteIOPS
            
            # MÃ©tricas especÃ­ficas por tipo de archivo
            $dataFiles = $data | Where-Object { $_.FileType -eq 'ROWS' }
            $logFiles = $data | Where-Object { $_.FileType -eq 'LOG' }
            
            if ($dataFiles) {
                $dataReads = $dataFiles | Where-Object { $_.NumReads -gt 0 }
                $dataWrites = $dataFiles | Where-Object { $_.NumWrites -gt 0 }
                
                if ($dataReads) {
                    $result.DataFileAvgReadMs = [decimal](($dataReads | Measure-Object -Property AvgReadLatencyMs -Average).Average)
                }
                if ($dataWrites) {
                    $result.DataFileAvgWriteMs = [decimal](($dataWrites | Measure-Object -Property AvgWriteLatencyMs -Average).Average)
                }
            }
            
            if ($logFiles) {
                $logWrites = $logFiles | Where-Object { $_.NumWrites -gt 0 }
                if ($logWrites) {
                    $result.LogFileAvgWriteMs = [decimal](($logWrites | Measure-Object -Property AvgWriteLatencyMs -Average).Average)
                }
            }
            
            # Top 5 archivos con mayor latencia
            $result.Details = $data | Select-Object -First 5 | ForEach-Object {
                "$($_.DatabaseName):$($_.FileType):Read=$([int]$_.AvgReadLatencyMs)ms:Write=$([int]$_.AvgWriteLatencyMs)ms"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo IO metrics en ${InstanceName}: $($_.Exception.Message)"
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
INSERT INTO dbo.InstanceHealth_IO (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    AvgReadLatencyMs,
    AvgWriteLatencyMs,
    MaxReadLatencyMs,
    MaxWriteLatencyMs,
    DataFileAvgReadMs,
    DataFileAvgWriteMs,
    LogFileAvgWriteMs,
    TotalIOPS,
    ReadIOPS,
    WriteIOPS,
    IODetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $($row.AvgReadLatencyMs),
    $($row.AvgWriteLatencyMs),
    $($row.MaxReadLatencyMs),
    $($row.MaxWriteLatencyMs),
    $($row.DataFileAvgReadMs),
    $($row.DataFileAvgWriteMs),
    $($row.LogFileAvgWriteMs),
    $($row.TotalIOPS),
    $($row.ReadIOPS),
    $($row.WriteIOPS),
    '$details'
);
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate `
                -ErrorAction Stop
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
Write-Host "â•‘  Health Score v3.0 - IO METRICS (Latencia / IOPS)    â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Frecuencia: 5 minutos                                â•‘" -ForegroundColor Cyan
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
Write-Host "2ï¸âƒ£  Recolectando mÃ©tricas de IO..." -ForegroundColor Yellow

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
    
    $ioMetrics = Get-IOMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "âœ…"
    if ($ioMetrics.LogFileAvgWriteMs -gt 20) {
        $status = "ðŸš¨ LOG SLOW!"
    }
    elseif ($ioMetrics.MaxReadLatencyMs -gt 50 -or $ioMetrics.MaxWriteLatencyMs -gt 50) {
        $status = "âš ï¸ IO SLOW!"
    }
    elseif ($ioMetrics.AvgReadLatencyMs -gt 10 -or $ioMetrics.AvgWriteLatencyMs -gt 10) {
        $status = "âš ï¸ IO WARN"
    }
    
    Write-Host "   $status $instanceName - Read:$([int]$ioMetrics.AvgReadLatencyMs)ms Write:$([int]$ioMetrics.AvgWriteLatencyMs)ms Log:$([int]$ioMetrics.LogFileAvgWriteMs)ms | IOPS: $([int]$ioMetrics.TotalIOPS) (R:$([int]$ioMetrics.ReadIOPS) W:$([int]$ioMetrics.WriteIOPS))" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        AvgReadLatencyMs = $ioMetrics.AvgReadLatencyMs
        AvgWriteLatencyMs = $ioMetrics.AvgWriteLatencyMs
        MaxReadLatencyMs = $ioMetrics.MaxReadLatencyMs
        MaxWriteLatencyMs = $ioMetrics.MaxWriteLatencyMs
        DataFileAvgReadMs = $ioMetrics.DataFileAvgReadMs
        DataFileAvgWriteMs = $ioMetrics.DataFileAvgWriteMs
        LogFileAvgWriteMs = $ioMetrics.LogFileAvgWriteMs
        TotalIOPS = $ioMetrics.TotalIOPS
        ReadIOPS = $ioMetrics.ReadIOPS
        WriteIOPS = $ioMetrics.WriteIOPS
        Details = $ioMetrics.Details
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
Write-Host "â•‘  RESUMEN - IO                                         â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  Total instancias:     $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White

$avgReadLatency = ($results | Measure-Object -Property AvgReadLatencyMs -Average).Average
$avgWriteLatency = ($results | Measure-Object -Property AvgWriteLatencyMs -Average).Average
$avgLogLatency = ($results | Where-Object {$_.LogFileAvgWriteMs -gt 0} | Measure-Object -Property LogFileAvgWriteMs -Average).Average

Write-Host "â•‘  Read latency avg:     $([int]$avgReadLatency)ms".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Write latency avg:    $([int]$avgWriteLatency)ms".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  Log latency avg:      $([int]$avgLogLatency)ms".PadRight(53) "â•‘" -ForegroundColor White

$slowIO = ($results | Where-Object {$_.MaxReadLatencyMs -gt 20 -or $_.MaxWriteLatencyMs -gt 20}).Count
Write-Host "â•‘  IO lento (>20ms):     $slowIO".PadRight(53) "â•‘" -ForegroundColor White

$avgTotalIOPS = ($results | Measure-Object -Property TotalIOPS -Average).Average
$avgReadIOPS = ($results | Measure-Object -Property ReadIOPS -Average).Average
$avgWriteIOPS = ($results | Measure-Object -Property WriteIOPS -Average).Average

Write-Host "â•‘  ----------------------------------------------------- â•‘" -ForegroundColor Gray
Write-Host "â•‘  IOPS promedio total:  $([int]$avgTotalIOPS)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  IOPS promedio read:   $([int]$avgReadIOPS)".PadRight(53) "â•‘" -ForegroundColor White
Write-Host "â•‘  IOPS promedio write:  $([int]$avgWriteIOPS)".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green
Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


