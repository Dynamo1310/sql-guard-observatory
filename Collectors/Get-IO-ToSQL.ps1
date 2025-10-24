<#
.SYNOPSIS
    Collector de Health Score V2 - IO

.DESCRIPTION
    Recolecta latencias y IOPS por archivo (Data/Log/Tempdb)
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
$CollectorName = "Get-IO-ToSQL"
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

$ioQuery = @"
SET NOCOUNT ON;

SELECT 
    DB_NAME(mf.database_id) AS DbName,
    CASE 
        WHEN mf.database_id = 2 THEN 'Tempdb'
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        ELSE 'Data'
    END AS FileType,
    CASE 
        WHEN vfs.num_of_reads > 0 
        THEN CAST((vfs.io_stall_read_ms * 1.0 / vfs.num_of_reads) AS decimal(10,2))
        ELSE 0 
    END AS AvgLatencyRead_ms,
    CASE 
        WHEN vfs.num_of_writes > 0 
        THEN CAST((vfs.io_stall_write_ms * 1.0 / vfs.num_of_writes) AS decimal(10,2))
        ELSE 0 
    END AS AvgLatencyWrite_ms,
    vfs.num_of_reads AS IOPS_Read,
    vfs.num_of_writes AS IOPS_Write
FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs
INNER JOIN sys.master_files mf ON vfs.database_id = mf.database_id AND vfs.file_id = mf.file_id
WHERE mf.database_id > 4 OR mf.database_id = 2  -- User DBs + tempdb
ORDER BY DbName, FileType;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $ioData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $ioQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($ioData) {
                foreach ($row in $ioData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioIOSnapshot (Instance, SnapshotAt, DbName, FileType, AvgLatencyRead_ms, AvgLatencyWrite_ms, IOPS_Read, IOPS_Write)
VALUES ('$instanceName', '$SnapshotAt', '$($row.DbName)', '$($row.FileType)', 
        $($row.AvgLatencyRead_ms), $($row.AvgLatencyWrite_ms), $($row.IOPS_Read), $($row.IOPS_Write));
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Procesados $($ioData.Count) archivos"
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

