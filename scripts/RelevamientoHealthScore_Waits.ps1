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
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

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
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response
    
    # Filtrar por AWS
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # SIEMPRE excluir instancias con DMZ en el nombre
    $instances = $instances | Where-Object { $_.NombreInstancia -notlike "*DMZ*" }
    
    # Test mode: solo 5 instancias
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
    $instanceName = $instance.NombreInstancia
    
    try {
        # Test connection
        $canConnect = Test-SqlConnection -InstanceName $instanceName -TimeoutSec 10
        
        if (-not $canConnect) {
            Write-Host "   ❌ NO CONECTA $instanceName" -ForegroundColor Red
            continue
        }
        
        # Get wait statistics
        $waits = Get-WaitStatistics -InstanceName $instanceName -TimeoutSec $TimeoutSec
        
        # Add metadata from API
        $waits.InstanceName = $instanceName
        $waits.Ambiente = if ($instance.Ambiente) { $instance.Ambiente } else { "N/A" }
        $waits.HostingSite = if ($instance.hostingSite) { $instance.hostingSite } else { "Onpremise" }
        $waits.SqlVersion = if ($instance.Version) { $instance.Version } else { "N/A" }
        
        $results += [PSCustomObject]$waits
        
        # Console output
        $status = "✅"
        $alerts = @()
        $metrics = @()
        
        # Total Wait Time (para mostrar siempre)
        if ($waits.TotalWaitMs -gt 0) {
            $waitHours = [Math]::Round($waits.TotalWaitMs / 1000.0 / 3600.0, 1)
            $metrics += "Wait:${waitHours}h"
        }
        
        # Top Wait Type (siempre mostrar)
        if ($waits.TopWait1Type) {
            $topWaitSec = [Math]::Round($waits.TopWait1Ms / 1000.0, 0)
            $metrics += "Top:$($waits.TopWait1Type)"
        }
        
        # Blocking
        if ($waits.BlockedSessionCount -gt 10) {
            $status = "🚨 BLOCKING!"
            $alerts += "Blocked:$($waits.BlockedSessionCount)"
        }
        elseif ($waits.BlockedSessionCount -gt 0) {
            $status = "⚠️ Blocking"
            $alerts += "Blocked:$($waits.BlockedSessionCount)"
        }
        
        if ($waits.TotalWaits -gt 0 -and $waits.TotalWaitMs -gt 0) {
            # PAGEIOLATCH - thresholds más sensibles
            if ($waits.PageIOLatchWaitMs -gt 0) {
                $pct = [Math]::Round([decimal](($waits.PageIOLatchWaitMs / $waits.TotalWaitMs) * 100), 2)
                if ($pct -gt 10) {
                    $status = "🚨 I/O WAITS!"
                    $alerts += "PAGEIOLATCH:${pct}%"
                }
                elseif ($pct -gt 5) {
                    if ($status -eq "✅") { $status = "⚠️ I/O" }
                    $alerts += "PAGEIOLATCH:${pct}%"
                }
                elseif ($pct -gt 1) {
                    $metrics += "PageIO:${pct}%"
                }
            }
            
            # CXPACKET - thresholds más sensibles
            if ($waits.CXPacketWaitMs -gt 0) {
                $pct = [Math]::Round([decimal](($waits.CXPacketWaitMs / $waits.TotalWaitMs) * 100), 2)
                if ($pct -gt 15) {
                    $status = "🚨 PARALLELISM!"
                    $alerts += "CXPACKET:${pct}%"
                }
                elseif ($pct -gt 10) {
                    if ($status -eq "✅") { $status = "⚠️ CXPACKET" }
                    $alerts += "CXPACKET:${pct}%"
                }
                elseif ($pct -gt 1) {
                    $metrics += "CXP:${pct}%"
                }
            }
            
            # RESOURCE_SEMAPHORE - thresholds más sensibles
            if ($waits.ResourceSemaphoreWaitMs -gt 0) {
                $pct = [Math]::Round([decimal](($waits.ResourceSemaphoreWaitMs / $waits.TotalWaitMs) * 100), 2)
                if ($pct -gt 5) {
                    $status = "🚨 MEMORY GRANTS!"
                    $alerts += "RESOURCE_SEM:${pct}%"
                }
                elseif ($pct -gt 2) {
                    if ($status -eq "✅") { $status = "⚠️ MemGrant" }
                    $alerts += "RESOURCE_SEM:${pct}%"
                }
                elseif ($pct -gt 0.5) {
                    $metrics += "ResSem:${pct}%"
                }
            }
            
            # WRITELOG - alto en términos absolutos
            if ($waits.WriteLogWaitMs -gt 0) {
                $pct = [Math]::Round([decimal](($waits.WriteLogWaitMs / $waits.TotalWaitMs) * 100), 2)
                if ($pct -gt 10) {
                    if ($status -eq "✅") { $status = "⚠️ WriteLog" }
                    $alerts += "WRITELOG:${pct}%"
                }
                elseif ($pct -gt 5) {
                    $metrics += "WriteLog:${pct}%"
                }
            }
            
            # THREADPOOL - siempre crítico si existe
            if ($waits.ThreadPoolWaitMs -gt 0) {
                $status = "🚨 THREADPOOL!"
                $pct = [Math]::Round([decimal](($waits.ThreadPoolWaitMs / $waits.TotalWaitMs) * 100), 2)
                $alerts += "THREADPOOL:${pct}%"
            }
            
            # SOS_SCHEDULER_YIELD - indica CPU pressure
            if ($waits.SOSSchedulerYieldMs -gt 0) {
                $pct = [Math]::Round([decimal](($waits.SOSSchedulerYieldMs / $waits.TotalWaitMs) * 100), 2)
                if ($pct -gt 10) {
                    if ($status -eq "✅") { $status = "⚠️ CPU Pressure" }
                    $alerts += "SOS_YIELD:${pct}%"
                }
                elseif ($pct -gt 5) {
                    $metrics += "SOSYield:${pct}%"
                }
            }
        }
        
        $alertText = if ($alerts.Count -gt 0) { " [$($alerts -join ', ')]" } else { "" }
        $metricsText = if ($metrics.Count -gt 0) { " | $($metrics -join ', ')" } else { "" }
        Write-Host "   $status $instanceName$alertText$metricsText" -ForegroundColor $(if ($status -like "*🚨*") { "Red" } elseif ($status -like "*⚠️*") { "Yellow" } else { "Gray" })
        
    } catch {
        Write-Host "   ❌ ERROR $instanceName - $($_.Exception.Message)" -ForegroundColor Red
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
Write-Host "║  Total instancias:        $($results.Count.ToString().PadLeft(3))                       ║" -ForegroundColor Cyan

# Blocking
$withBlocking = ($results | Where-Object {$_.BlockedSessionCount -gt 0}).Count
$severeBlocking = ($results | Where-Object {$_.BlockedSessionCount -gt 10}).Count
Write-Host "║  Con blocking:            $(${withBlocking}.ToString().PadLeft(3))                       ║" -ForegroundColor Cyan
Write-Host "║  Blocking severo (>10):   $(${severeBlocking}.ToString().PadLeft(3))                       ║" -ForegroundColor Cyan

# PAGEIOLATCH (I/O waits) - ajustado a nuevos thresholds
$pageIOHigh = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -gt 10}).Count
$pageIOModerate = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -gt 5 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -le 10}).Count
$pageIOLow = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -gt 1 -and ($_.PageIOLatchWaitMs / $_.TotalWaitMs * 100) -le 5}).Count
Write-Host "║  PAGEIOLATCH >10%:        $(${pageIOHigh}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($pageIOHigh -gt 0) { "Red" } else { "Cyan" })
Write-Host "║  PAGEIOLATCH 5-10%:       $(${pageIOModerate}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($pageIOModerate -gt 0) { "Yellow" } else { "Cyan" })
Write-Host "║  PAGEIOLATCH 1-5%:        $(${pageIOLow}.ToString().PadLeft(3))                       ║" -ForegroundColor Cyan

# CXPACKET (parallelism waits) - ajustado a nuevos thresholds
$cxpacketHigh = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -gt 15}).Count
$cxpacketModerate = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -gt 10 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -le 15}).Count
$cxpacketLow = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -gt 1 -and ($_.CXPacketWaitMs / $_.TotalWaitMs * 100) -le 10}).Count
Write-Host "║  CXPACKET >15%:           $(${cxpacketHigh}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($cxpacketHigh -gt 0) { "Red" } else { "Cyan" })
Write-Host "║  CXPACKET 10-15%:         $(${cxpacketModerate}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($cxpacketModerate -gt 0) { "Yellow" } else { "Cyan" })
Write-Host "║  CXPACKET 1-10%:          $(${cxpacketLow}.ToString().PadLeft(3))                       ║" -ForegroundColor Cyan

# RESOURCE_SEMAPHORE (memory grants)
$memGrantsHigh = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.ResourceSemaphoreWaitMs / $_.TotalWaitMs * 100) -gt 5}).Count
$memGrantsModerate = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.ResourceSemaphoreWaitMs / $_.TotalWaitMs * 100) -gt 2 -and ($_.ResourceSemaphoreWaitMs / $_.TotalWaitMs * 100) -le 5}).Count
Write-Host "║  RESOURCE_SEM >5%:        $(${memGrantsHigh}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($memGrantsHigh -gt 0) { "Red" } else { "Cyan" })
Write-Host "║  RESOURCE_SEM 2-5%:       $(${memGrantsModerate}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($memGrantsModerate -gt 0) { "Yellow" } else { "Cyan" })

# WRITELOG
$writeLogHigh = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.WriteLogWaitMs / $_.TotalWaitMs * 100) -gt 10}).Count
Write-Host "║  WRITELOG >10%:           $(${writeLogHigh}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($writeLogHigh -gt 0) { "Yellow" } else { "Cyan" })

# THREADPOOL (siempre crítico)
$threadPoolAny = ($results | Where-Object {$_.ThreadPoolWaitMs -gt 0}).Count
Write-Host "║  THREADPOOL (crítico):    $(${threadPoolAny}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($threadPoolAny -gt 0) { "Red" } else { "Cyan" })

# SOS_SCHEDULER_YIELD (CPU pressure)
$sosYieldHigh = ($results | Where-Object {$_.TotalWaitMs -gt 0 -and ($_.SOSSchedulerYieldMs / $_.TotalWaitMs * 100) -gt 10}).Count
Write-Host "║  SOS_YIELD >10%:          $(${sosYieldHigh}.ToString().PadLeft(3))                       ║" -ForegroundColor $(if ($sosYieldHigh -gt 0) { "Yellow" } else { "Cyan" })

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Top 5 instancias por wait time
Write-Host "`n📊 TOP 5 INSTANCIAS POR WAIT TIME:" -ForegroundColor Yellow
$top5 = $results | Sort-Object -Property TotalWaitMs -Descending | Select-Object -First 5
foreach ($inst in $top5) {
    if ($inst.TotalWaitMs -gt 0) {
        $waitHours = [Math]::Round($inst.TotalWaitMs / 1000.0 / 3600.0, 1)
        $topWait = if ($inst.TopWait1Type) { $inst.TopWait1Type } else { "N/A" }
        Write-Host "   $($inst.InstanceName.PadRight(25)) - ${waitHours}h total | Top: $topWait" -ForegroundColor Gray
    }
}

Write-Host "`n✅ Script completado!" -ForegroundColor Green

#endregion

