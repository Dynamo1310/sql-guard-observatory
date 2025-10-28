<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de RECURSOS
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Espacio en discos (15 pts)
    - IOPS / Latencia de I/O (15 pts)
    - Queries lentos en ejecución (10 pts)
    
    Guarda en: InstanceHealth_Critical_Resources
    
.NOTES
    Versión: 2.0 (dbatools)
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

# Descargar SqlServer si está cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-DiskStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        WorstFreePct = 100
        Details = @()
    }
    
    try {
        $query = @"
SELECT DISTINCT 
    vs.volume_mount_point AS Drive,
    vs.total_bytes / 1024 / 1024 / 1024 AS TotalGB,
    vs.available_bytes / 1024 / 1024 / 1024 AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS INT) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.WorstFreePct = ($data | Measure-Object -Property FreePct -Minimum).Minimum
            $result.Details = $data | ForEach-Object {
                # Formato: C:\|500.5|125.2|25
                "$($_.Drive)|$([Math]::Round($_.TotalGB, 2))|$([Math]::Round($_.FreeGB, 2))|$($_.FreePct)"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo discos en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-IOLatency {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        AvgReadLatencyMs = 0
        AvgWriteLatencyMs = 0
        MaxReadLatencyMs = 0
        MaxWriteLatencyMs = 0
        TotalIOPS = 0
        WorstDatabaseLatency = "N/A"
    }
    
    try {
        $query = @"
WITH IOStats AS (
    SELECT 
        DB_NAME(database_id) AS DatabaseName,
        file_id,
        io_stall_read_ms,
        num_of_reads,
        io_stall_write_ms,
        num_of_writes,
        CASE 
            WHEN num_of_reads > 0 
            THEN CAST(io_stall_read_ms AS DECIMAL(20,2)) / num_of_reads 
            ELSE 0 
        END AS avg_read_latency_ms,
        CASE 
            WHEN num_of_writes > 0 
            THEN CAST(io_stall_write_ms AS DECIMAL(20,2)) / num_of_writes 
            ELSE 0 
        END AS avg_write_latency_ms
    FROM sys.dm_io_virtual_file_stats(NULL, NULL)
    WHERE database_id > 4  -- Excluir system DBs
      AND (num_of_reads > 100 OR num_of_writes > 100)
)
SELECT 
    AVG(avg_read_latency_ms) AS AvgReadLatency,
    AVG(avg_write_latency_ms) AS AvgWriteLatency,
    MAX(avg_read_latency_ms) AS MaxReadLatency,
    MAX(avg_write_latency_ms) AS MaxWriteLatency,
    SUM(num_of_reads + num_of_writes) AS TotalIO,
    (SELECT TOP 1 DatabaseName 
     FROM IOStats 
     ORDER BY avg_read_latency_ms DESC) AS WorstDB
FROM IOStats;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.AvgReadLatencyMs = [decimal]$data.AvgReadLatency
            $result.AvgWriteLatencyMs = [decimal]$data.AvgWriteLatency
            $result.MaxReadLatencyMs = [decimal]$data.MaxReadLatency
            $result.MaxWriteLatencyMs = [decimal]$data.MaxWriteLatency
            $result.TotalIOPS = [decimal]($data.TotalIO / 300)  # IOPS promedio últimos 5 min
            $result.WorstDatabaseLatency = $data.WorstDB
        }
        
    } catch {
        Write-Warning "Error obteniendo IO latency en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-SlowQueries {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        SlowQueriesCount = 0
        LongRunningCount = 0
        TopQueries = @()
    }
    
    try {
        $query = @"
SELECT 
    session_id,
    total_elapsed_time / 1000 AS elapsed_seconds,
    wait_type,
    DB_NAME(database_id) AS database_name,
    SUBSTRING(st.text, (r.statement_start_offset/2)+1,   
        ((CASE r.statement_end_offset  
            WHEN -1 THEN DATALENGTH(st.text)  
            ELSE r.statement_end_offset  
        END - r.statement_start_offset)/2) + 1) AS statement_text
FROM sys.dm_exec_requests r
CROSS APPLY sys.dm_exec_sql_text(r.sql_handle) st
WHERE session_id > 50
  AND total_elapsed_time > 30000  -- >30 segundos
ORDER BY total_elapsed_time DESC;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.SlowQueriesCount = ($data | Where-Object { $_.elapsed_seconds -lt 300 }).Count  # 30s-5min
            $result.LongRunningCount = ($data | Where-Object { $_.elapsed_seconds -ge 300 }).Count  # >5min
            
            $result.TopQueries = $data | Select-Object -First 5 | ForEach-Object {
                "SID$($_.session_id):$($_.elapsed_seconds)s"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo slow queries en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        # Usar dbatools para test de conexión (comando simple sin parámetros de certificado)
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
            # Sanitizar valores NULL
            $diskWorst = if ($row.DiskWorstFreePct -eq $null) { "NULL" } else { $row.DiskWorstFreePct }
            $avgRead = if ($row.AvgReadLatencyMs -eq $null) { "NULL" } else { $row.AvgReadLatencyMs }
            $avgWrite = if ($row.AvgWriteLatencyMs -eq $null) { "NULL" } else { $row.AvgWriteLatencyMs }
            $maxRead = if ($row.MaxReadLatencyMs -eq $null) { "NULL" } else { $row.MaxReadLatencyMs }
            $totalIOPS = if ($row.TotalIOPS -eq $null) { "NULL" } else { $row.TotalIOPS }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Critical_Resources (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    DiskWorstFreePct,
    DiskDetails,
    AvgReadLatencyMs,
    AvgWriteLatencyMs,
    MaxReadLatencyMs,
    MaxWriteLatencyMs,
    TotalIOPS,
    WorstDatabaseLatency,
    SlowQueriesCount,
    LongRunningQueriesCount,
    TopSlowQueries
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $diskWorst,
    '$($row.DiskDetails -join ",")',
    $avgRead,
    $avgWrite,
    $maxRead,
    $($row.MaxWriteLatencyMs),
    $totalIOPS,
    '$($row.WorstDatabaseLatency)',
    $($row.SlowQueriesCount),
    $($row.LongRunningCount),
    '$($row.TopQueries -join ",")'
);
"@
            
            # Usar dbatools para insertar datos
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
Write-Host "║  Health Score v2.0 - RESOURCE METRICS                 ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 5 minutos                                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # Excluir instancias con DMZ en el nombre
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
Write-Host "2️⃣  Recolectando métricas de recursos..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    # La propiedad correcta es NombreInstancia (con mayúscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Capturar metadata de la instancia desde API
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar métricas
    $disks = Get-DiskStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $io = Get-IOLatency -InstanceName $instanceName -TimeoutSec $TimeoutSec
    # NOTA: Queries lentos deshabilitado por request del usuario
    # $queries = Get-SlowQueries -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $queries = @{ SlowQueriesCount = 0; LongRunningCount = 0; TopQueries = @() }
    
    $status = "✅"
    if ($disks.WorstFreePct -lt 10) { $status = "🚨 DISK!" }
    elseif ($io.AvgReadLatencyMs -gt 50) { $status = "⚠️ SLOW I/O!" }
    # Queries check deshabilitado
    # elseif ($queries.SlowQueriesCount -gt 5) { $status = "⚠️ SLOW QUERIES!" }
    
    Write-Host "   $status $instanceName - Disk:$($disks.WorstFreePct)% IO:$([int]$io.AvgReadLatencyMs)ms" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        DiskWorstFreePct = $disks.WorstFreePct
        DiskDetails = $disks.Details
        AvgReadLatencyMs = $io.AvgReadLatencyMs
        AvgWriteLatencyMs = $io.AvgWriteLatencyMs
        MaxReadLatencyMs = $io.MaxReadLatencyMs
        MaxWriteLatencyMs = $io.MaxWriteLatencyMs
        TotalIOPS = $io.TotalIOPS
        WorstDatabaseLatency = $io.WorstDatabaseLatency
        SlowQueriesCount = $queries.SlowQueriesCount
        LongRunningCount = $queries.LongRunningCount
        TopQueries = $queries.TopQueries
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
Write-Host "║  RESUMEN - RESOURCES                                  ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Disk crítico (<10%):  $(($results | Where-Object {$_.DiskWorstFreePct -lt 10}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  I/O lento (>20ms):    $(($results | Where-Object {$_.AvgReadLatencyMs -gt 20}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

