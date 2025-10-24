<#
.SYNOPSIS
    Collector de Health Score V2 - CPU

.DESCRIPTION
    Recolecta métricas de CPU: percentil 95 y runnable tasks
#>

[CmdletBinding()]
param(
    [string]$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/",
    [string]$SqlServer = "SQLNova",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 30,
    [switch]$Debug
)

$ErrorActionPreference = "Continue"
$CollectorName = "Get-CPU-ToSQL"
$SnapshotAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-CollectorLog {
    param([string]$Instance, [string]$Level, [string]$Message)
    if ($Debug) {
        Write-Host "[$Level] $Instance : $Message" -ForegroundColor $(switch($Level){"Info"{"Green"}"Warn"{"Yellow"}"Error"{"Red"}default{"White"}})
    }
    try {
        $logQuery = "INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message]) VALUES ('$CollectorName', '$Instance', '$Level', '$($Message.Replace("'", "''"))');"
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $logQuery -ConnectionTimeout 5 -QueryTimeout 5 -ErrorAction SilentlyContinue
    } catch {}
}

$cpuQuery = @"
SET NOCOUNT ON;

DECLARE @ts_now bigint = (SELECT cpu_ticks/(cpu_ticks/ms_ticks) FROM sys.dm_os_sys_info);
DECLARE @samples TABLE (cpu_pct decimal(5,2));

-- Capturar samples de CPU últimos 10 minutos (Ring Buffer)
INSERT INTO @samples
SELECT TOP 100
    100 - record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS cpu_pct
FROM (
    SELECT CAST(record AS xml) AS record
    FROM sys.dm_os_ring_buffers
    WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
      AND record LIKE '%<SystemHealth>%'
) AS x
ORDER BY record.value('(./Record/@id)[1]', 'bigint') DESC;

-- Percentil 95 y runnable tasks promedio
SELECT 
    (SELECT PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cpu_pct) FROM @samples) AS CpuPct_p95,
    AVG(CAST(runnable_tasks_count AS decimal(10,2))) AS RunnableTasksAvg
FROM sys.dm_os_schedulers
WHERE scheduler_id < 255
  AND is_online = 1;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $cpuData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $cpuQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($cpuData) {
                $insertQuery = @"
INSERT INTO dbo.InventarioCPUSnapshot (Instance, SnapshotAt, CpuPct_p95, RunnableTasksAvg)
VALUES ('$instanceName', '$SnapshotAt', $($cpuData.CpuPct_p95), $($cpuData.RunnableTasksAvg));
"@
                Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                
                $msg = "CPU p95=$($cpuData.CpuPct_p95)%, Runnable=$($cpuData.RunnableTasksAvg)"
                $level = if ($cpuData.CpuPct_p95 -gt 85) { "Warn" } else { "Info" }
                Write-CollectorLog -Instance $instanceName -Level $level -Message $msg
            }
        } catch {
            Write-CollectorLog -Instance $instanceName -Level "Error" -Message "Error: $($_.Exception.Message)"
            Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    Write-Host "Completado" -ForegroundColor Green
} catch {
    Write-Host "ERROR FATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

