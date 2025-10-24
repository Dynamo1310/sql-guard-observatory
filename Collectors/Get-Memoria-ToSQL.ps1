<#
.SYNOPSIS
    Collector de Health Score V2 - Memoria

.DESCRIPTION
    Recolecta PLE, memory grants pending, committed/target memory
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
$CollectorName = "Get-Memoria-ToSQL"
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

$memoriaQuery = @"
SET NOCOUNT ON;

-- PLE mínimo por NUMA node
DECLARE @PLE_Min int = (
    SELECT MIN(cntr_value)
    FROM sys.dm_os_performance_counters
    WHERE object_name LIKE '%Buffer Node%'
      AND counter_name = 'Page life expectancy'
);

-- Target GB (para calcular PLE objetivo: 300s × GB)
DECLARE @TargetGB decimal(10,2) = (
    SELECT cntr_value / 1024.0 / 1024
    FROM sys.dm_os_performance_counters
    WHERE counter_name = 'Target Server Memory (KB)'
);

-- PLE objetivo: 300 segundos por GB
DECLARE @PLE_Target int = CAST(@TargetGB * 300 AS int);

-- Memory grants pending
DECLARE @GrantsPending int = (
    SELECT COUNT(*)
    FROM sys.dm_exec_query_memory_grants
    WHERE grant_time IS NULL
);

-- Committed memory
DECLARE @CommittedGB decimal(10,2) = (
    SELECT cntr_value / 1024.0 / 1024
    FROM sys.dm_os_performance_counters
    WHERE counter_name = 'Total Server Memory (KB)'
);

SELECT 
    @PLE_Min AS PLE_MinNUMA,
    @PLE_Target AS PLE_Target_sec,
    @GrantsPending AS MemoryGrantsPending,
    @CommittedGB AS CommittedGB,
    @TargetGB AS TargetGB;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $memData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $memoriaQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($memData) {
                $insertQuery = @"
INSERT INTO dbo.InventarioMemoriaSnapshot (Instance, SnapshotAt, PLE_MinNUMA, PLE_Target_sec, MemoryGrantsPending, CommittedGB, TargetGB)
VALUES ('$instanceName', '$SnapshotAt', $($memData.PLE_MinNUMA), $($memData.PLE_Target_sec), 
        $($memData.MemoryGrantsPending), $($memData.CommittedGB), $($memData.TargetGB));
"@
                Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                
                $plePct = if ($memData.PLE_Target_sec -gt 0) { [math]::Round(($memData.PLE_MinNUMA * 100.0 / $memData.PLE_Target_sec), 0) } else { 100 }
                $level = if ($plePct -lt 30) { "Warn" } else { "Info" }
                Write-CollectorLog -Instance $instanceName -Level $level -Message "PLE=$($memData.PLE_MinNUMA)s (${plePct}% objetivo), Grants=$($memData.MemoryGrantsPending)"
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

