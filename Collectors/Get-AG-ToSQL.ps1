<#
.SYNOPSIS
    Collector de Health Score V2 - AlwaysOn Availability Groups

.DESCRIPTION
    Recolecta estado de sincronización de AG para SQLNova.dbo.InventarioAGSnapshot
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
$CollectorName = "Get-AG-ToSQL"
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

$agQuery = @"
SET NOCOUNT ON;

SELECT 
    ag.name AS AGName,
    ar.replica_server_name AS Replica,
    db.database_name AS DBName,
    drs.synchronization_state_desc AS SyncState,
    drs.is_suspended AS IsSuspended,
    ISNULL(drs.log_send_queue_size, 0) AS SendQueueKB,
    ISNULL(drs.redo_queue_size, 0) AS RedoQueueKB,
    ISNULL(drs.log_send_rate, 0) AS SendRateKBs,
    ISNULL(drs.redo_rate, 0) AS RedoRateKBs
FROM sys.dm_hadr_database_replica_states drs
INNER JOIN sys.availability_replicas ar ON drs.replica_id = ar.replica_id
INNER JOIN sys.availability_groups ag ON ar.group_id = ag.group_id
INNER JOIN sys.databases db ON drs.database_id = db.database_id
WHERE ar.replica_server_name = @@SERVERNAME;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    $successCount = 0
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $agData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $agQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($agData) {
                foreach ($row in $agData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioAGSnapshot (Instance, SnapshotAt, AGName, Replica, DBName, SyncState, IsSuspended, SendQueueKB, RedoQueueKB, SendRateKBs, RedoRateKBs)
VALUES ('$instanceName', '$SnapshotAt', '$($row.AGName)', '$($row.Replica)', '$($row.DBName)', 
        '$($row.SyncState)', $($row.IsSuspended), $($row.SendQueueKB), $($row.RedoQueueKB), 
        $($row.SendRateKBs), $($row.RedoRateKBs));
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Procesadas $($agData.Count) DBs en AG"
                $successCount++
            } else {
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Sin AG configurado"
            }
        } catch {
            if ($_.Exception.Message -notmatch "Invalid object name.*hadr") {
                Write-CollectorLog -Instance $instanceName -Level "Error" -Message "Error: $($_.Exception.Message)"
                Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    }
    Write-Host "Completado: $successCount instancias con AG" -ForegroundColor Green
} catch {
    Write-Host "ERROR FATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

