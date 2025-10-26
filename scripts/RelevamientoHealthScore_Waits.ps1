<#
.SYNOPSIS
    Health Score v3.1 - Recolección de WAIT STATISTICS & BLOCKING
    
.DESCRIPTION
    Script de alta frecuencia (cada 5 minutos) que recolecta:
    - Wait Statistics (PAGEIOLATCH, RESOURCE_SEMAPHORE, CXPACKET, WRITELOG, etc.)
    - Blocking activo (sesiones bloqueadas, tiempo de bloqueo)
    - Top 10 wait types por instancia
    - Aggregates por categoría (CPU waits, Memory waits, I/O waits, Lock waits)
    
    Guarda en: InstanceHealth_Waits
    
    Impacto en Health Score v3.1:
    - BLOCKING → Errores & Blocking (7%)
    - PAGEIOLATCH → I/O (7%)
    - RESOURCE_SEMAPHORE → Memoria (7%)
    - CXPACKET → CPU (10%)
    - WRITELOG → I/O (7%)
    
.NOTES
    Versión: 3.1.0 (Waits & Blocking)
    Frecuencia: Cada 5 minutos
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

function Get-WaitStatistics {
    <#
    .SYNOPSIS
        Obtiene wait statistics agregadas y categorizadas por tipo
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        # Blocking
        BlockedSessionCount = 0
        MaxBlockTimeSeconds = 0
        BlockerSessionIds = ""
        
        # Top Wait Types
        TopWait1Type = ""
        TopWait1Count = 0
        TopWait1Ms = 0
        TopWait2Type = ""
        TopWait2Count = 0
        TopWait2Ms = 0
        TopWait3Type = ""
        TopWait3Count = 0
        TopWait3Ms = 0
        TopWait4Type = ""
        TopWait4Count = 0
        TopWait4Ms = 0
        TopWait5Type = ""
        TopWait5Count = 0
        TopWait5Ms = 0
        
        # I/O Waits
        PageIOLatchWaitCount = 0
        PageIOLatchWaitMs = 0
        WriteLogWaitCount = 0
        WriteLogWaitMs = 0
        AsyncIOCompletionCount = 0
        AsyncIOCompletionMs = 0
        
        # Memory Waits
        ResourceSemaphoreWaitCount = 0
        ResourceSemaphoreWaitMs = 0
        
        # CPU/Parallelism Waits
        CXPacketWaitCount = 0
        CXPacketWaitMs = 0
        CXConsumerWaitCount = 0
        CXConsumerWaitMs = 0
        SOSSchedulerYieldCount = 0
        SOSSchedulerYieldMs = 0
        ThreadPoolWaitCount = 0
        ThreadPoolWaitMs = 0
        
        # Lock Waits
        LockWaitCount = 0
        LockWaitMs = 0
        
        # Config
        MaxDOP = 0
        
        # Metadata
        TotalWaits = 0
        TotalWaitMs = 0
    }
    
    try {
        # Query 1: Blocking Info
        $queryBlocking = @"
-- Blocking activo
SELECT 
    COUNT(*) AS BlockedCount,
    ISNULL(MAX(r.wait_time / 1000), 0) AS MaxBlockSeconds,
    STUFF((
        SELECT DISTINCT ',' + CAST(blocking_session_id AS VARCHAR(10))
        FROM sys.dm_exec_requests WITH (NOLOCK)
        WHERE blocking_session_id > 0
        GROUP BY blocking_session_id
        FOR XML PATH('')
    ), 1, 1, '') AS BlockerIds
FROM sys.dm_exec_requests r WITH (NOLOCK)
WHERE r.blocking_session_id > 0;
"@
        
        # Query 2: Top 10 Wait Types
        $queryTopWaits = @"
-- Top 10 wait types (excluyendo benign waits)
SELECT TOP 10
    wait_type,
    waiting_tasks_count,
    wait_time_ms
FROM sys.dm_os_wait_stats WITH (NOLOCK)
WHERE wait_type NOT IN (
    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
    'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
    'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
    'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
    'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 
    'SQLTRACE_INCREMENTAL_FLUSH_SLEEP', 'DIRTY_PAGE_POLL',
    'HADR_FILESTREAM_IOMGR_IOCOMPLETION', 'ONDEMAND_TASK_QUEUE',
    'FT_IFTSHC_MUTEX', 'CLR_AUTO_EVENT', 'BROKER_EVENTHANDLER',
    'BROKER_RECEIVE_WAITFOR', 'SP_SERVER_DIAGNOSTICS_SLEEP',
    'QDS_PERSIST_TASK_MAIN_LOOP_SLEEP', 'QDS_ASYNC_QUEUE',
    'QDS_CLEANUP_STALE_QUERIES_TASK_MAIN_LOOP_SLEEP', 'DBMIRROR_DBM_MUTEX',
    'DBMIRROR_EVENTS_QUEUE', 'DBMIRRORING_CMD', 'HADR_CLUSAPI_CALL',
    'HADR_LOGCAPTURE_WAIT', 'HADR_NOTIFICATION_DEQUEUE', 'HADR_TIMER_TASK',
    'HADR_WORK_QUEUE', 'KSOURCE_WAKEUP', 'PREEMPTIVE_OS_LIBRARYOPS',
    'PREEMPTIVE_OS_COMOPS', 'PREEMPTIVE_OS_CRYPTOPS',
    'PREEMPTIVE_OS_PIPEOPS', 'PREEMPTIVE_OS_AUTHENTICATIONOPS',
    'PREEMPTIVE_OS_GENERICOPS', 'PREEMPTIVE_OS_VERIFYTRUST'
)
AND wait_time_ms > 0
ORDER BY wait_time_ms DESC;
"@
        
        # Query 3: Wait Aggregates por Categoría
        $queryWaitAggregates = @"
-- Waits agregados por categoría
SELECT
    -- I/O Waits
    SUM(CASE WHEN wait_type LIKE 'PAGEIOLATCH%' THEN waiting_tasks_count ELSE 0 END) AS PageIOLatchCount,
    SUM(CASE WHEN wait_type LIKE 'PAGEIOLATCH%' THEN wait_time_ms ELSE 0 END) AS PageIOLatchMs,
    SUM(CASE WHEN wait_type = 'WRITELOG' THEN waiting_tasks_count ELSE 0 END) AS WriteLogCount,
    SUM(CASE WHEN wait_type = 'WRITELOG' THEN wait_time_ms ELSE 0 END) AS WriteLogMs,
    SUM(CASE WHEN wait_type LIKE 'ASYNC_IO_COMPLETION' THEN waiting_tasks_count ELSE 0 END) AS AsyncIOCount,
    SUM(CASE WHEN wait_type LIKE 'ASYNC_IO_COMPLETION' THEN wait_time_ms ELSE 0 END) AS AsyncIOMs,
    
    -- Memory Waits
    SUM(CASE WHEN wait_type LIKE 'RESOURCE_SEMAPHORE%' THEN waiting_tasks_count ELSE 0 END) AS ResourceSemCount,
    SUM(CASE WHEN wait_type LIKE 'RESOURCE_SEMAPHORE%' THEN wait_time_ms ELSE 0 END) AS ResourceSemMs,
    
    -- CPU/Parallelism Waits
    SUM(CASE WHEN wait_type = 'CXPACKET' THEN waiting_tasks_count ELSE 0 END) AS CXPacketCount,
    SUM(CASE WHEN wait_type = 'CXPACKET' THEN wait_time_ms ELSE 0 END) AS CXPacketMs,
    SUM(CASE WHEN wait_type = 'CXCONSUMER' THEN waiting_tasks_count ELSE 0 END) AS CXConsumerCount,
    SUM(CASE WHEN wait_type = 'CXCONSUMER' THEN wait_time_ms ELSE 0 END) AS CXConsumerMs,
    SUM(CASE WHEN wait_type = 'SOS_SCHEDULER_YIELD' THEN waiting_tasks_count ELSE 0 END) AS SOSYieldCount,
    SUM(CASE WHEN wait_type = 'SOS_SCHEDULER_YIELD' THEN wait_time_ms ELSE 0 END) AS SOSYieldMs,
    SUM(CASE WHEN wait_type LIKE 'THREADPOOL%' THEN waiting_tasks_count ELSE 0 END) AS ThreadPoolCount,
    SUM(CASE WHEN wait_type LIKE 'THREADPOOL%' THEN wait_time_ms ELSE 0 END) AS ThreadPoolMs,
    
    -- Lock Waits
    SUM(CASE WHEN wait_type LIKE 'LCK_%' THEN waiting_tasks_count ELSE 0 END) AS LockCount,
    SUM(CASE WHEN wait_type LIKE 'LCK_%' THEN wait_time_ms ELSE 0 END) AS LockMs,
    
    -- Totals
    SUM(waiting_tasks_count) AS TotalCount,
    SUM(wait_time_ms) AS TotalMs
FROM sys.dm_os_wait_stats WITH (NOLOCK)
WHERE wait_type NOT IN (
    'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE',
    'SLEEP_TASK', 'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH',
    'WAITFOR', 'LOGMGR_QUEUE', 'CHECKPOINT_QUEUE',
    'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT', 'BROKER_TO_FLUSH',
    'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT', 'CLR_AUTO_EVENT',
    'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
    'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 
    'SQLTRACE_INCREMENTAL_FLUSH_SLEEP'
);
"@
        
        # Query 4: MaxDOP Config
        $queryMaxDOP = @"
SELECT CAST(value_in_use AS INT) AS MaxDOP
FROM sys.configurations WITH (NOLOCK)
WHERE name = 'max degree of parallelism';
"@
        
        # Ejecutar queries
        $dataBlocking = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryBlocking `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $dataTopWaits = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryTopWaits `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $dataAggregates = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryWaitAggregates `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $dataMaxDOP = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $queryMaxDOP `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        # Procesar Blocking
        if ($dataBlocking) {
            $result.BlockedSessionCount = [int]$dataBlocking.BlockedCount
            $result.MaxBlockTimeSeconds = [int]$dataBlocking.MaxBlockSeconds
            $result.BlockerSessionIds = if ($dataBlocking.BlockerIds) { $dataBlocking.BlockerIds } else { "" }
        }
        
        # Procesar Top Waits
        if ($dataTopWaits -and $dataTopWaits.Count -gt 0) {
            for ($i = 0; $i -lt [Math]::Min(5, $dataTopWaits.Count); $i++) {
                $wait = $dataTopWaits[$i]
                $idx = $i + 1
                $result."TopWait${idx}Type" = $wait.wait_type
                $result."TopWait${idx}Count" = [bigint]$wait.waiting_tasks_count
                $result."TopWait${idx}Ms" = [bigint]$wait.wait_time_ms
            }
        }
        
        # Procesar Aggregates
        if ($dataAggregates) {
            $agg = $dataAggregates
            
            # I/O Waits
            $result.PageIOLatchWaitCount = [bigint]$agg.PageIOLatchCount
            $result.PageIOLatchWaitMs = [bigint]$agg.PageIOLatchMs
            $result.WriteLogWaitCount = [bigint]$agg.WriteLogCount
            $result.WriteLogWaitMs = [bigint]$agg.WriteLogMs
            $result.AsyncIOCompletionCount = [bigint]$agg.AsyncIOCount
            $result.AsyncIOCompletionMs = [bigint]$agg.AsyncIOMs
            
            # Memory Waits
            $result.ResourceSemaphoreWaitCount = [bigint]$agg.ResourceSemCount
            $result.ResourceSemaphoreWaitMs = [bigint]$agg.ResourceSemMs
            
            # CPU Waits
            $result.CXPacketWaitCount = [bigint]$agg.CXPacketCount
            $result.CXPacketWaitMs = [bigint]$agg.CXPacketMs
            $result.CXConsumerWaitCount = [bigint]$agg.CXConsumerCount
            $result.CXConsumerWaitMs = [bigint]$agg.CXConsumerMs
            $result.SOSSchedulerYieldCount = [bigint]$agg.SOSYieldCount
            $result.SOSSchedulerYieldMs = [bigint]$agg.SOSYieldMs
            $result.ThreadPoolWaitCount = [bigint]$agg.ThreadPoolCount
            $result.ThreadPoolWaitMs = [bigint]$agg.ThreadPoolMs
            
            # Lock Waits
            $result.LockWaitCount = [bigint]$agg.LockCount
            $result.LockWaitMs = [bigint]$agg.LockMs
            
            # Totals
            $result.TotalWaits = [bigint]$agg.TotalCount
            $result.TotalWaitMs = [bigint]$agg.TotalMs
        }
        
        # Procesar MaxDOP
        if ($dataMaxDOP) {
            $result.MaxDOP = [int]$dataMaxDOP.MaxDOP
        }
        
    } catch {
        Write-Warning "Error obteniendo wait statistics en ${InstanceName}: $($_.Exception.Message)"
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
            $query = @"
INSERT INTO dbo.InstanceHealth_Waits (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    -- Blocking
    BlockedSessionCount,
    MaxBlockTimeSeconds,
    BlockerSessionIds,
    -- Top Waits
    TopWait1Type, TopWait1Count, TopWait1Ms,
    TopWait2Type, TopWait2Count, TopWait2Ms,
    TopWait3Type, TopWait3Count, TopWait3Ms,
    TopWait4Type, TopWait4Count, TopWait4Ms,
    TopWait5Type, TopWait5Count, TopWait5Ms,
    -- I/O Waits
    PageIOLatchWaitCount, PageIOLatchWaitMs,
    WriteLogWaitCount, WriteLogWaitMs,
    AsyncIOCompletionCount, AsyncIOCompletionMs,
    -- Memory Waits
    ResourceSemaphoreWaitCount, ResourceSemaphoreWaitMs,
    -- CPU Waits
    CXPacketWaitCount, CXPacketWaitMs,
    CXConsumerWaitCount, CXConsumerWaitMs,
    SOSSchedulerYieldCount, SOSSchedulerYieldMs,
    ThreadPoolWaitCount, ThreadPoolWaitMs,
    -- Lock Waits
    LockWaitCount, LockWaitMs,
    -- Config
    MaxDOP,
    -- Totals
    TotalWaits, TotalWaitMs
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.BlockedSessionCount),
    $($row.MaxBlockTimeSeconds),
    '$($row.BlockerSessionIds)',
    '$($row.TopWait1Type)', $($row.TopWait1Count), $($row.TopWait1Ms),
    '$($row.TopWait2Type)', $($row.TopWait2Count), $($row.TopWait2Ms),
    '$($row.TopWait3Type)', $($row.TopWait3Count), $($row.TopWait3Ms),
    '$($row.TopWait4Type)', $($row.TopWait4Count), $($row.TopWait4Ms),
    '$($row.TopWait5Type)', $($row.TopWait5Count), $($row.TopWait5Ms),
    $($row.PageIOLatchWaitCount), $($row.PageIOLatchWaitMs),
    $($row.WriteLogWaitCount), $($row.WriteLogWaitMs),
    $($row.AsyncIOCompletionCount), $($row.AsyncIOCompletionMs),
    $($row.ResourceSemaphoreWaitCount), $($row.ResourceSemaphoreWaitMs),
    $($row.CXPacketWaitCount), $($row.CXPacketWaitMs),
    $($row.CXConsumerWaitCount), $($row.CXConsumerWaitMs),
    $($row.SOSSchedulerYieldCount), $($row.SOSSchedulerYieldMs),
    $($row.ThreadPoolWaitCount), $($row.ThreadPoolWaitMs),
    $($row.LockWaitCount), $($row.LockWaitMs),
    $($row.MaxDOP),
    $($row.TotalWaits), $($row.TotalWaitMs)
);
"@
            
            Invoke-DbaQuery -SqlInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -EnableException | Out-Null
        }
        
        Write-Host "✅ Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== SCRIPT PRINCIPAL =====

Clear-Host

Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v3.1 - WAIT STATISTICS & BLOCKING     ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 5 minutos                                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias desde la API
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30
    $instances = $response | Where-Object { 
        $_.NombreServidor -and 
        (-not $_.EsAWS -or $IncludeAWS) -and
        (-not $OnlyAWS -or $_.EsAWS)
    } | Select-Object -ExpandProperty NombreServidor -Unique
    
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Instancias a procesar: $($instances.Count)" -ForegroundColor Green
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Recolectar wait statistics
Write-Host "`n2️⃣  Recolectando wait statistics..." -ForegroundColor Yellow

$results = @()

foreach ($instance in $instances) {
    try {
        # Test connection
        $canConnect = Test-SqlConnection -InstanceName $instance -TimeoutSec 10
        
        if (-not $canConnect) {
            Write-Host "   ❌ NO CONECTA $instance" -ForegroundColor Red
            continue
        }
        
        # Get wait statistics
        $waits = Get-WaitStatistics -InstanceName $instance -TimeoutSec $TimeoutSec
        
        # Add metadata
        $waits.InstanceName = $instance
        $waits.Ambiente = "Produccion"  # TODO: Obtener del API
        $waits.HostingSite = "Onpremise"  # TODO: Obtener del API
        $waits.SqlVersion = "N/A"  # TODO: Obtener versión
        
        $results += [PSCustomObject]$waits
        
        # Console output
        $status = "✅"
        $alerts = @()
        
        if ($waits.BlockedSessionCount -gt 10) {
            $status = "🚨 BLOCKING!"
            $alerts += "Blocked:$($waits.BlockedSessionCount)"
        }
        elseif ($waits.BlockedSessionCount -gt 0) {
            $status = "⚠️ Blocking"
            $alerts += "Blocked:$($waits.BlockedSessionCount)"
        }
        
        if ($waits.TotalWaits -gt 0) {
            # Check for high percentages
            if ($waits.PageIOLatchWaitMs -gt 0) {
                $pct = [Math]::Round(($waits.PageIOLatchWaitMs / $waits.TotalWaitMs) * 100, 1)
                if ($pct -gt 20) {
                    $alerts += "PAGEIOLATCH:${pct}%"
                }
            }
            
            if ($waits.CXPacketWaitMs -gt 0) {
                $pct = [Math]::Round(($waits.CXPacketWaitMs / $waits.TotalWaitMs) * 100, 1)
                if ($pct -gt 30) {
                    $alerts += "CXPACKET:${pct}%"
                }
            }
            
            if ($waits.ResourceSemaphoreWaitMs -gt 0) {
                $pct = [Math]::Round(($waits.ResourceSemaphoreWaitMs / $waits.TotalWaitMs) * 100, 1)
                if ($pct -gt 10) {
                    $alerts += "RESOURCE_SEM:${pct}%"
                }
            }
        }
        
        $alertText = if ($alerts.Count -gt 0) { " [$($alerts -join ', ')]" } else { "" }
        Write-Host "   $status $instance$alertText" -ForegroundColor $(if ($status -like "*🚨*") { "Red" } elseif ($status -like "*⚠️*") { "Yellow" } else { "Gray" })
        
    } catch {
        Write-Host "   ❌ ERROR $instance - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 3. Guardar en SQL Server
Write-Host "`n3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  RESUMEN - WAIT STATISTICS & BLOCKING                ║" -ForegroundColor Cyan
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Cyan
Write-Host "║  Total instancias:     $($results.Count.ToString().PadLeft(3))                          ║" -ForegroundColor Cyan
Write-Host "║  Con blocking:         $(($results | Where-Object {$_.BlockedSessionCount -gt 0}).Count.ToString().PadLeft(3))                          ║" -ForegroundColor Cyan
Write-Host "║  Blocking severo (>10):$(($results | Where-Object {$_.BlockedSessionCount -gt 10}).Count.ToString().PadLeft(3))                          ║" -ForegroundColor Cyan
Write-Host "║  Con PAGEIOLATCH alto: $(($results | Where-Object {$_.TotalWaits -gt 0 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -gt 20}).Count.ToString().PadLeft(3))                          ║" -ForegroundColor Cyan
Write-Host "║  Con CXPACKET alto:    $(($results | Where-Object {$_.TotalWaits -gt 0 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -gt 30}).Count.ToString().PadLeft(3))                          ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host "`n✅ Script completado!" -ForegroundColor Green

#endregion

