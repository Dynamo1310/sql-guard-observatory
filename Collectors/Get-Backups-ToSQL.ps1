<#
.SYNOPSIS
    Collector de Health Score V2 - Backups

.DESCRIPTION
    Lee el inventario de instancias desde la API y recolecta información de backups
    para insertar en SQLNova.dbo.InventarioBackupSnapshot

.PARAMETER ApiUrl
    URL de la API de inventario (default: http://asprbm-nov-01/InventoryDBA/inventario/)

.PARAMETER SqlServer
    Servidor SQL central (default: SQLNova)

.PARAMETER SqlDatabase
    Base de datos central (default: SQLNova)

.PARAMETER TimeoutSec
    Timeout en segundos para queries (default: 30)

.PARAMETER Debug
    Modo debug con salida detallada

.EXAMPLE
    .\Get-Backups-ToSQL.ps1 -Debug
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
$CollectorName = "Get-Backups-ToSQL"
$SnapshotAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Write-CollectorLog {
    param(
        [string]$Instance,
        [string]$Level,
        [string]$Message
    )
    
    if ($Debug) {
        Write-Host "[$Level] $Instance : $Message" -ForegroundColor $(
            switch($Level) {
                "Info" { "Green" }
                "Warn" { "Yellow" }
                "Error" { "Red" }
                default { "White" }
            }
        )
    }
    
    try {
        $logQuery = @"
INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message])
VALUES ('$CollectorName', '$Instance', '$Level', '$($Message.Replace("'", "''"))');
"@
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $logQuery -ConnectionTimeout 5 -QueryTimeout 5 -ErrorAction SilentlyContinue
    } catch {
        # Silenciar errores de log
    }
}

# Consulta T-SQL para obtener backups
$backupQuery = @"
SET NOCOUNT ON;

SELECT 
    d.name AS DBName,
    d.recovery_model_desc AS RecoveryModel,
    -- FULL
    (SELECT MAX(backup_finish_date) 
     FROM msdb.dbo.backupset bs 
     WHERE bs.database_name = d.name AND bs.type = 'D') AS LastFull,
    DATEDIFF(MINUTE, 
        ISNULL((SELECT MAX(backup_finish_date) 
                FROM msdb.dbo.backupset bs 
                WHERE bs.database_name = d.name AND bs.type = 'D'), '1900-01-01'),
        GETDATE()) AS FullAgeMin,
    -- DIFF
    (SELECT MAX(backup_finish_date) 
     FROM msdb.dbo.backupset bs 
     WHERE bs.database_name = d.name AND bs.type = 'I') AS LastDiff,
    -- LOG
    (SELECT MAX(backup_finish_date) 
     FROM msdb.dbo.backupset bs 
     WHERE bs.database_name = d.name AND bs.type = 'L') AS LastLog,
    DATEDIFF(MINUTE, 
        ISNULL((SELECT MAX(backup_finish_date) 
                FROM msdb.dbo.backupset bs 
                WHERE bs.database_name = d.name AND bs.type = 'L'), '1900-01-01'),
        GETDATE()) AS LogAgeMin,
    -- Cadena OK (simplificado: si hay LOG reciente en FULL recovery)
    CASE 
        WHEN d.recovery_model_desc = 'FULL' 
             AND EXISTS (SELECT 1 FROM msdb.dbo.backupset bs 
                         WHERE bs.database_name = d.name AND bs.type = 'L' 
                           AND bs.backup_finish_date >= DATEADD(HOUR, -24, GETDATE()))
        THEN 1
        WHEN d.recovery_model_desc <> 'FULL' THEN 1
        ELSE 0
    END AS ChainOK
FROM sys.databases d
WHERE d.database_id > 4  -- Excluir system DBs
  AND d.state_desc = 'ONLINE'
  AND d.is_read_only = 0;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    Write-Host "Obteniendo inventario desde: $ApiUrl"
    
    # Obtener inventario desde API
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    
    if (-not $instances) {
        throw "No se obtuvo inventario de la API"
    }
    
    Write-Host "Inventario obtenido: $($instances.Count) instancias"
    
    $successCount = 0
    $errorCount = 0
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { 
            "$($inst.ServerName)\$($inst.NombreInstancia)" 
        } else { 
            $inst.ServerName 
        }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            
            # Ejecutar query de backups
            $backupData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $backupQuery `
                -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($backupData) {
                # Insertar en SQLNova
                foreach ($row in $backupData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioBackupSnapshot 
    (Instance, SnapshotAt, DBName, LastFull, LastDiff, LastLog, FullAgeMin, LogAgeMin, ChainOK, RecoveryModel)
VALUES 
    ('$instanceName', '$SnapshotAt', '$($row.DBName)', 
     $(if($row.LastFull) {"'$($row.LastFull.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $(if($row.LastDiff) {"'$($row.LastDiff.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $(if($row.LastLog) {"'$($row.LastLog.ToString('yyyy-MM-dd HH:mm:ss'))'"} else {"NULL"}),
     $($row.FullAgeMin), 
     $(if($row.LogAgeMin) {$row.LogAgeMin} else {"NULL"}),
     $($row.ChainOK), 
     '$($row.RecoveryModel)');
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery `
                        -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Procesadas $($backupData.Count) DBs"
                $successCount++
            }
            
        } catch {
            Write-CollectorLog -Instance $instanceName -Level "Error" -Message "Error: $($_.Exception.Message)"
            Write-Host "    ERROR: $($_.Exception.Message)" -ForegroundColor Red
            $errorCount++
        }
    }
    
    Write-Host ""
    Write-Host "Resumen: $successCount exitosas, $errorCount errores" -ForegroundColor $(if($errorCount -eq 0){"Green"}else{"Yellow"})
    
} catch {
    Write-Host "ERROR FATAL: $($_.Exception.Message)" -ForegroundColor Red
    Write-CollectorLog -Instance "COLLECTOR" -Level "Error" -Message "Error fatal: $($_.Exception.Message)"
    exit 1
}

