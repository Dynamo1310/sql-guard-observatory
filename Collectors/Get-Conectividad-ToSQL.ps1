<#
.SYNOPSIS
    Collector de Health Score V2 - Conectividad

.DESCRIPTION
    Verifica conectividad, autenticación y RTT de instancias SQL
#>

[CmdletBinding()]
param(
    [string]$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/",
    [string]$SqlServer = "SQLNova",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 10,
    [switch]$Debug
)

$ErrorActionPreference = "Continue"
$CollectorName = "Get-Conectividad-ToSQL"
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

$failedLoginsQuery = @"
SELECT COUNT(*) AS FailedLogins
FROM sys.dm_exec_sessions
WHERE last_request_end_time >= DATEADD(MINUTE, -15, GETDATE())
  AND status = 'sleeping'
  AND login_name LIKE '%failed%';
"@

try {
    Write-Host "=== $CollectorName ===" -ForegroundColor Cyan
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "Testeando $($instances.Count) instancias"
    
    foreach ($inst in $instances) {
        $instanceName = if ($inst.NombreInstancia) { "$($inst.ServerName)\$($inst.NombreInstancia)" } else { $inst.ServerName }
        $reachable = 0
        $authOK = 0
        $rttMs = $null
        $failedLogins = 0
        
        try {
            Write-Host "  Testeando: $instanceName" -ForegroundColor Gray
            
            # Test conectividad con ping
            $pingStart = Get-Date
            $testQuery = "SELECT 1 AS Test;"
            $result = Invoke-Sqlcmd -ServerInstance $instanceName -Query $testQuery -ConnectionTimeout $TimeoutSec -QueryTimeout 5 -ErrorAction Stop
            $pingEnd = Get-Date
            
            if ($result.Test -eq 1) {
                $reachable = 1
                $authOK = 1
                $rttMs = [int](($pingEnd - $pingStart).TotalMilliseconds)
                
                # Obtener logins fallidos (simplificado)
                try {
                    $failedData = Invoke-Sqlcmd -ServerInstance $instanceName -Query $failedLoginsQuery -ConnectionTimeout 5 -QueryTimeout 5 -ErrorAction SilentlyContinue
                    if ($failedData) { $failedLogins = $failedData.FailedLogins }
                } catch {}
                
                Write-CollectorLog -Instance $instanceName -Level "Info" -Message "Conectividad OK (RTT=${rttMs}ms)"
            }
        } catch {
            if ($_.Exception.Message -match "Login failed") {
                $reachable = 1
                $authOK = 0
                Write-CollectorLog -Instance $instanceName -Level "Warn" -Message "Alcanzable pero fallo autenticación"
            } else {
                $reachable = 0
                Write-CollectorLog -Instance $instanceName -Level "Error" -Message "No alcanzable: $($_.Exception.Message)"
            }
        }
        
        # Insertar resultado
        $insertQuery = @"
INSERT INTO dbo.InventarioConectividadSnapshot (Instance, SnapshotAt, Reachable, AuthOK, RTTms, FailedLogins15m)
VALUES ('$instanceName', '$SnapshotAt', $reachable, $authOK, $(if($rttMs){"$rttMs"}else{"NULL"}), $failedLogins);
"@
        Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -ConnectionTimeout 15 -QueryTimeout 15 -ErrorAction Stop
    }
    
    Write-Host "Conectividad testeada completamente" -ForegroundColor Green
} catch {
    Write-Host "ERROR FATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

