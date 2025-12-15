<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de IO (Latencia / IOPS)
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Latencia de lectura/escritura (data y log)
    - IOPS por disco
    - Stalls (tiempo de espera en I/O)
    
    Guarda en: InstanceHealth_IO
    
    Peso en scoring: 10%
    Criterios: Latencia data/log ≤5ms=100; 6–10=80; 11–20=60; >20=40
    Cap: Log p95 >20ms => cap 70
    
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

# Verificar que dbatools está disponible
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
        IOByVolume = @()
    }
    
    try {
        $query = @"
-- Obtener uptime del servidor en segundos
DECLARE @UptimeSeconds BIGINT;
SELECT @UptimeSeconds = DATEDIFF(SECOND, sqlserver_start_time, GETDATE())
FROM sys.dm_os_sys_info;

-- Evitar división por cero si el servidor acaba de reiniciar
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
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            # Calcular métricas agregadas usando PROMEDIO PONDERADO
            # Fórmula correcta: TotalStallMs / TotalOperaciones (igual que Performance Monitor)
            $allReads = $data | Where-Object { $_.NumReads -gt 0 }
            $allWrites = $data | Where-Object { $_.NumWrites -gt 0 }
            
            if ($allReads) {
                # Promedio ponderado: suma de stalls / suma de operaciones
                $totalReadStall = ($allReads | Measure-Object -Property TotalReadStallMs -Sum).Sum
                $totalReadOps = ($allReads | Measure-Object -Property NumReads -Sum).Sum
                $result.AvgReadLatencyMs = if ($totalReadOps -gt 0) { [decimal]($totalReadStall / $totalReadOps) } else { 0 }
                $result.MaxReadLatencyMs = [decimal](($allReads | Measure-Object -Property AvgReadLatencyMs -Maximum).Maximum)
                # Sumar todos los ReadIOPS de todos los archivos
                $result.ReadIOPS = [decimal](($allReads | Measure-Object -Property ReadIOPS -Sum).Sum)
            }
            
            if ($allWrites) {
                # Promedio ponderado: suma de stalls / suma de operaciones
                $totalWriteStall = ($allWrites | Measure-Object -Property TotalWriteStallMs -Sum).Sum
                $totalWriteOps = ($allWrites | Measure-Object -Property NumWrites -Sum).Sum
                $result.AvgWriteLatencyMs = if ($totalWriteOps -gt 0) { [decimal]($totalWriteStall / $totalWriteOps) } else { 0 }
                $result.MaxWriteLatencyMs = [decimal](($allWrites | Measure-Object -Property AvgWriteLatencyMs -Maximum).Maximum)
                # Sumar todos los WriteIOPS de todos los archivos
                $result.WriteIOPS = [decimal](($allWrites | Measure-Object -Property WriteIOPS -Sum).Sum)
            }
            
            # IOPS totales = suma de lectura + escritura
            $result.TotalIOPS = $result.ReadIOPS + $result.WriteIOPS
            
            # Métricas específicas por tipo de archivo (también con promedio ponderado)
            $dataFiles = $data | Where-Object { $_.FileType -eq 'ROWS' }
            $logFiles = $data | Where-Object { $_.FileType -eq 'LOG' }
            
            if ($dataFiles) {
                $dataReads = $dataFiles | Where-Object { $_.NumReads -gt 0 }
                $dataWrites = $dataFiles | Where-Object { $_.NumWrites -gt 0 }
                
                if ($dataReads) {
                    $totalDataReadStall = ($dataReads | Measure-Object -Property TotalReadStallMs -Sum).Sum
                    $totalDataReadOps = ($dataReads | Measure-Object -Property NumReads -Sum).Sum
                    $result.DataFileAvgReadMs = if ($totalDataReadOps -gt 0) { [decimal]($totalDataReadStall / $totalDataReadOps) } else { 0 }
                }
                if ($dataWrites) {
                    $totalDataWriteStall = ($dataWrites | Measure-Object -Property TotalWriteStallMs -Sum).Sum
                    $totalDataWriteOps = ($dataWrites | Measure-Object -Property NumWrites -Sum).Sum
                    $result.DataFileAvgWriteMs = if ($totalDataWriteOps -gt 0) { [decimal]($totalDataWriteStall / $totalDataWriteOps) } else { 0 }
                }
            }
            
            if ($logFiles) {
                $logWrites = $logFiles | Where-Object { $_.NumWrites -gt 0 }
                if ($logWrites) {
                    $totalLogWriteStall = ($logWrites | Measure-Object -Property TotalWriteStallMs -Sum).Sum
                    $totalLogWriteOps = ($logWrites | Measure-Object -Property NumWrites -Sum).Sum
                    $result.LogFileAvgWriteMs = if ($totalLogWriteOps -gt 0) { [decimal]($totalLogWriteStall / $totalLogWriteOps) } else { 0 }
                }
            }
            
            # Top 5 archivos con mayor latencia
            $result.Details = $data | Select-Object -First 5 | ForEach-Object {
                "$($_.DatabaseName):$($_.FileType):Read=$([int]$_.AvgReadLatencyMs)ms:Write=$([int]$_.AvgWriteLatencyMs)ms"
            }
            
            # Agrupar métricas por volumen (disco físico) usando PROMEDIO PONDERADO
            $volumeMetrics = @{}
            foreach ($file in $data) {
                # Extraer letra de unidad del physical_name (ej: "C:\..." -> "C:")
                if ($file.PhysicalName -match '^([A-Z]:)') {
                    $volume = $matches[1]
                    
                    if (-not $volumeMetrics.ContainsKey($volume)) {
                        $volumeMetrics[$volume] = @{
                            MountPoint = $volume
                            TotalReadStallMs = 0      # Suma de stalls (para promedio ponderado)
                            TotalWriteStallMs = 0     # Suma de stalls (para promedio ponderado)
                            TotalNumReads = 0         # Suma de operaciones de lectura
                            TotalNumWrites = 0        # Suma de operaciones de escritura
                            TotalReadIOPS = 0
                            TotalWriteIOPS = 0
                            MaxReadLatency = 0
                            MaxWriteLatency = 0
                        }
                    }
                    
                    # Acumular métricas usando stalls totales y operaciones totales
                    $vol = $volumeMetrics[$volume]
                    if ($file.NumReads -gt 0) {
                        $vol.TotalReadStallMs += $file.TotalReadStallMs
                        $vol.TotalNumReads += $file.NumReads
                        $vol.TotalReadIOPS += $file.ReadIOPS
                        if ($file.AvgReadLatencyMs -gt $vol.MaxReadLatency) {
                            $vol.MaxReadLatency = $file.AvgReadLatencyMs
                        }
                    }
                    if ($file.NumWrites -gt 0) {
                        $vol.TotalWriteStallMs += $file.TotalWriteStallMs
                        $vol.TotalNumWrites += $file.NumWrites
                        $vol.TotalWriteIOPS += $file.WriteIOPS
                        if ($file.AvgWriteLatencyMs -gt $vol.MaxWriteLatency) {
                            $vol.MaxWriteLatency = $file.AvgWriteLatencyMs
                        }
                    }
                }
            }
            
            # Calcular promedios PONDERADOS y crear lista de volúmenes
            # Fórmula: TotalStallMs / TotalOperaciones (igual que Performance Monitor)
            $result.IOByVolume = $volumeMetrics.Keys | Sort-Object | ForEach-Object {
                $vol = $volumeMetrics[$_]
                $avgRead = if ($vol.TotalNumReads -gt 0) { $vol.TotalReadStallMs / $vol.TotalNumReads } else { 0 }
                $avgWrite = if ($vol.TotalNumWrites -gt 0) { $vol.TotalWriteStallMs / $vol.TotalNumWrites } else { 0 }
                
                [PSCustomObject]@{
                    MountPoint = $vol.MountPoint
                    AvgReadLatencyMs = [math]::Round($avgRead, 2)
                    AvgWriteLatencyMs = [math]::Round($avgWrite, 2)
                    MaxReadLatencyMs = [math]::Round($vol.MaxReadLatency, 2)
                    MaxWriteLatencyMs = [math]::Round($vol.MaxWriteLatency, 2)
                    ReadIOPS = [math]::Round($vol.TotalReadIOPS, 2)
                    WriteIOPS = [math]::Round($vol.TotalWriteIOPS, 2)
                    TotalIOPS = [math]::Round($vol.TotalReadIOPS + $vol.TotalWriteIOPS, 2)
                }
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
            
            # Convertir IOByVolume a JSON
            $ioByVolumeJson = if ($row.IOByVolume -and $row.IOByVolume.Count -gt 0) {
                ($row.IOByVolume | ConvertTo-Json -Compress) -replace "'", "''"
            } else {
                $null
            }
            
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
    IODetails,
    IOByVolumeJson
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
    '$details',
    $(if ($ioByVolumeJson) { "'$ioByVolumeJson'" } else { "NULL" })
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
Write-Host "║  Health Score v3.0 - IO METRICS (Latencia / IOPS)    ║" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de IO..." -ForegroundColor Yellow

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
    
    $ioMetrics = Get-IOMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($ioMetrics.LogFileAvgWriteMs -gt 20) {
        $status = "🚨 LOG SLOW!"
    }
    elseif ($ioMetrics.MaxReadLatencyMs -gt 50 -or $ioMetrics.MaxWriteLatencyMs -gt 50) {
        $status = "⚠️ IO SLOW!"
    }
    elseif ($ioMetrics.AvgReadLatencyMs -gt 10 -or $ioMetrics.AvgWriteLatencyMs -gt 10) {
        $status = "⚠️ IO WARN"
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
        IOByVolume = $ioMetrics.IOByVolume
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
Write-Host "║  RESUMEN - IO                                         ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgReadLatency = ($results | Measure-Object -Property AvgReadLatencyMs -Average).Average
$avgWriteLatency = ($results | Measure-Object -Property AvgWriteLatencyMs -Average).Average
$avgLogLatency = ($results | Where-Object {$_.LogFileAvgWriteMs -gt 0} | Measure-Object -Property LogFileAvgWriteMs -Average).Average

Write-Host "║  Read latency avg:     $([int]$avgReadLatency)ms".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Write latency avg:    $([int]$avgWriteLatency)ms".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Log latency avg:      $([int]$avgLogLatency)ms".PadRight(53) "║" -ForegroundColor White

$slowIO = ($results | Where-Object {$_.MaxReadLatencyMs -gt 20 -or $_.MaxWriteLatencyMs -gt 20}).Count
Write-Host "║  IO lento (>20ms):     $slowIO".PadRight(53) "║" -ForegroundColor White

$avgTotalIOPS = ($results | Measure-Object -Property TotalIOPS -Average).Average
$avgReadIOPS = ($results | Measure-Object -Property ReadIOPS -Average).Average
$avgWriteIOPS = ($results | Measure-Object -Property WriteIOPS -Average).Average

Write-Host "║  ----------------------------------------------------- ║" -ForegroundColor Gray
Write-Host "║  IOPS promedio total:  $([int]$avgTotalIOPS)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  IOPS promedio read:   $([int]$avgReadIOPS)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  IOPS promedio write:  $([int]$avgWriteIOPS)".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

