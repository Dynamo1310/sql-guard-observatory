<#
.SYNOPSIS
    Collector de Health Score V2 - Mantenimiento

.DESCRIPTION
    Recolecta información de CHECKDB, Index Optimize y Stats Update
    Intenta usar Ola Hallengren CommandLog, fallback a msdb si no existe
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
$CollectorName = "Get-Mantenimiento-ToSQL"
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

$mantenimientoQuery = @"
SET NOCOUNT ON;

-- Detectar si existe CommandLog de Ola Hallengren
DECLARE @HasOlaHallengren bit = 0;
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'DBATools')
   AND EXISTS (SELECT 1 FROM DBATools.sys.tables WHERE name = 'CommandLog')
BEGIN
    SET @HasOlaHallengren = 1;
END

-- Query unificada
WITH MaintenanceData AS (
    SELECT
        d.name AS DBName,
        -- CHECKDB: buscar en CommandLog o msdb
        (SELECT TOP 1 StartTime
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType = 'DBCC_CHECKDB'
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
         ORDER BY cl.StartTime DESC) AS LastCheckDB_Ola,
        
        -- Fallback: buscar en msdb.dbo.sysjobhistory (job que contenga "CHECKDB")
        NULL AS LastCheckDB_Job,
        
        -- IndexOptimize
        (SELECT TOP 1 StartTime
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType IN ('ALTER_INDEX_REBUILD', 'ALTER_INDEX_REORGANIZE')
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
         ORDER BY cl.StartTime DESC) AS LastIndexOpt,
        
        -- StatsUpdate
        (SELECT TOP 1 StartTime
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType = 'UPDATE_STATISTICS'
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
         ORDER BY cl.StartTime DESC) AS LastStats,
        
        -- Contadores de éxitos en 14 días
        (SELECT COUNT(*)
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType = 'DBCC_CHECKDB'
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
           AND cl.StartTime >= DATEADD(DAY, -14, GETDATE())) AS Success14d_CheckDB,
        
        (SELECT COUNT(*)
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType IN ('ALTER_INDEX_REBUILD', 'ALTER_INDEX_REORGANIZE')
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
           AND cl.StartTime >= DATEADD(DAY, -14, GETDATE())) AS Success14d_Index,
        
        (SELECT COUNT(*)
         FROM DBATools.dbo.CommandLog cl
         WHERE cl.CommandType = 'UPDATE_STATISTICS'
           AND cl.DatabaseName = d.name
           AND cl.ErrorNumber = 0
           AND cl.StartTime >= DATEADD(DAY, -14, GETDATE())) AS Success14d_Stats
    FROM sys.databases d
    WHERE d.database_id > 4
      AND d.state_desc = 'ONLINE'
      AND d.is_read_only = 0
)
SELECT 
    DBName,
    ISNULL(LastCheckDB_Ola, LastCheckDB_Job) AS LastCheckDB,
    DATEDIFF(DAY, ISNULL(LastCheckDB_Ola, LastCheckDB_Job), GETDATE()) AS CheckDB_AgeDays,
    CASE 
        WHEN DATEDIFF(DAY, ISNULL(LastCheckDB_Ola, LastCheckDB_Job), GETDATE()) <= 7 THEN 1 
        ELSE 0 
    END AS CheckDB_WithinSLA,
    LastIndexOpt AS LastIndexOptimize,
    DATEDIFF(DAY, LastIndexOpt, GETDATE()) AS IndexOpt_AgeDays,
    LastStats AS LastStatsUpdate,
    DATEDIFF(DAY, LastStats, GETDATE()) AS Stats_AgeDays,
    ISNULL(Success14d_CheckDB, 0) AS Success14d_CheckDB,
    ISNULL(Success14d_Index, 0) AS Success14d_Index,
    ISNULL(Success14d_Stats, 0) AS Success14d_Stats
FROM MaintenanceData;
"@

# Query simplificada si no existe DBATools
$mantenimientoQuerySimple = @"
SET NOCOUNT ON;

SELECT 
    d.name AS DBName,
    CAST(NULL AS datetime) AS LastCheckDB,
    999 AS CheckDB_AgeDays,
    0 AS CheckDB_WithinSLA,
    CAST(NULL AS datetime) AS LastIndexOptimize,
    999 AS IndexOpt_AgeDays,
    CAST(NULL AS datetime) AS LastStatsUpdate,
    999 AS Stats_AgeDays,
    0 AS Success14d_CheckDB,
    0 AS Success14d_Index,
    0 AS Success14d_Stats
FROM sys.databases d
WHERE d.database_id > 4
  AND d.state_desc = 'ONLINE'
  AND d.is_read_only = 0;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            
            # Intentar query completa, fallback a simple
            $mantData = $null
            try {
                $mantData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $mantenimientoQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            } catch {
                Write-Host "    Usando modo simple (sin DBATools.CommandLog)" -ForegroundColor Yellow
                $mantData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $mantenimientoQuerySimple -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            }
            
            if ($mantData) {
                foreach ($row in $mantData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioMantenimientoSnapshot 
    (Instance, SnapshotAt, DBName, LastCheckDB, CheckDB_AgeDays, CheckDB_WithinSLA, 
     LastIndexOptimize, IndexOpt_AgeDays, LastStatsUpdate, Stats_AgeDays, 
     Success14d_CheckDB, Success14d_Index, Success14d_Stats)
VALUES 
    ('$instanceName', '$SnapshotAt', '$($row.DBName)', 
     $(if($row.LastCheckDB) {"'$($row.LastCheckDB.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $(if($row.CheckDB_AgeDays) {$row.CheckDB_AgeDays} else {"NULL"}),
     $($row.CheckDB_WithinSLA),
     $(if($row.LastIndexOptimize) {"'$($row.LastIndexOptimize.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $(if($row.IndexOpt_AgeDays) {$row.IndexOpt_AgeDays} else {"NULL"}),
     $(if($row.LastStatsUpdate) {"'$($row.LastStatsUpdate.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $(if($row.Stats_AgeDays) {$row.Stats_AgeDays} else {"NULL"}),
     $($row.Success14d_CheckDB), $($row.Success14d_Index), $($row.Success14d_Stats));
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Procesadas $($mantData.Count) DBs"
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

