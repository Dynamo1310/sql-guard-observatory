<#
.SYNOPSIS
    Collector de Health Score V2 - Discos

.DESCRIPTION
    Recolecta espacio libre en discos por rol (SO/Data/Log/Backups/Temp)
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
$CollectorName = "Get-Discos-ToSQL"
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

$discosQuery = @"
SET NOCOUNT ON;

-- Obtener discos únicos de archivos SQL Server
WITH Volumes AS (
    SELECT DISTINCT
        vs.volume_mount_point AS DriveLetter,
        vs.total_bytes / 1024.0 / 1024 / 1024 AS SizeGB,
        vs.available_bytes / 1024.0 / 1024 / 1024 AS FreeGB,
        CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS decimal(5,2)) AS FreePct,
        -- Inferir rol basado en la letra típica o archivos presentes
        CASE
            WHEN vs.volume_mount_point LIKE '%C:%' THEN 'SO'
            WHEN EXISTS (SELECT 1 FROM sys.master_files mf 
                         WHERE mf.physical_name LIKE vs.volume_mount_point + '%' 
                           AND mf.type_desc = 'LOG') THEN 'Log'
            WHEN EXISTS (SELECT 1 FROM sys.master_files mf 
                         WHERE mf.physical_name LIKE vs.volume_mount_point + '%' 
                           AND mf.type_desc = 'ROWS' 
                           AND mf.database_id = 2) THEN 'Temp'
            WHEN EXISTS (SELECT 1 FROM sys.master_files mf 
                         WHERE mf.physical_name LIKE vs.volume_mount_point + '%' 
                           AND mf.type_desc = 'ROWS') THEN 'Data'
            ELSE 'Backups'
        END AS [Role]
    FROM sys.dm_os_volume_stats(NULL, NULL) vs
)
SELECT 
    DriveLetter,
    [Role],
    FreePct,
    SizeGB,
    0.0 AS GrowthPct7d  -- Placeholder: calcular en siguiente iteración
FROM Volumes;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            $discosData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $discosQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($discosData) {
                foreach ($row in $discosData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioDiscosSnapshot (Instance, SnapshotAt, DriveLetter, [Role], FreePct, SizeGB, GrowthPct7d)
VALUES ('$instanceName', '$SnapshotAt', '$($row.DriveLetter)', '$($row.Role)', 
        $($row.FreePct), $($row.SizeGB), $($row.GrowthPct7d));
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                
                $critico = $discosData | Where-Object { $_.FreePct -lt 10 }
                $level = if ($critico) { "Warn" } else { "Info" }
                Write-CollectorLog -Instance $instanceName -Level $level -Message "Procesados $($discosData.Count) discos"
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

