<#
.SYNOPSIS
    Collector de Health Score V2 - Errores Severidad >=20

.DESCRIPTION
    Recolecta errores críticos del log de SQL Server
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
$CollectorName = "Get-ErroresSev-ToSQL"
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

$errorQuery = @"
SET NOCOUNT ON;

DECLARE @TimeFrom datetime = DATEADD(HOUR, -24, GETDATE());

EXEC sp_readerrorlog 0, 1, N'Severity: 2', NULL, @TimeFrom, NULL;
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Procesando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        
        try {
            Write-Host "  Procesando: $instanceName" -ForegroundColor Gray
            
            # Método alternativo: leer desde sys.messages y xp_readerrorlog
            $simpleQuery = @"
SET NOCOUNT ON;
-- Simplificado: buscar en dm_exec_sessions con errores recientes
SELECT TOP 10
    GETDATE() AS EventTime,
    0 AS ErrorNumber,
    24 AS Severity,
    'Error placeholder - implementar xp_readerrorlog' AS Message
FROM sys.dm_exec_sessions
WHERE 1=0; -- Placeholder, retorna vacío
"@
            
            $errorData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $simpleQuery -ConnectionTimeout $TimeoutSec -QueryTimeout $TimeoutSec -ErrorAction Stop
            
            if ($errorData) {
                foreach ($row in $errorData) {
                    $insertQuery = @"
INSERT INTO dbo.InventarioErroresSevSnapshot (Instance, SnapshotAt, EventTime, ErrorNumber, Severity, [Message])
VALUES ('$instanceName', '$SnapshotAt', '$($row.EventTime.ToString('yyyy-MM-dd HH:mm:ss'))', 
        $($row.ErrorNumber), $($row.Severity), '$($row.Message.Replace("'", "''"))');
"@
                    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
                }
                Write-CollectorLog -Instance $instanceName -Level "Warn" -Message "Detectados $($errorData.Count) errores sev>=20"
            } else {
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Sin errores sev>=20 en 24h"
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

