<#
.SYNOPSIS
    Relevamiento de métricas CRÍTICAS de SQL Server (ejecutar cada 5 minutos).

.DESCRIPTION
    Recolecta métricas que cambian rápidamente y requieren monitoreo frecuente:
    - Conectividad y latencia
    - Estado de discos
    - Estado de sincronización AlwaysOn
    
    Guarda en tabla: InstanceHealth_Critical

.NOTES
    Autor: SQL Guard Observatory Team
    Versión: 2.1 - Separación por frecuencia
    Fecha: 2025-10-23
    Frecuencia: Cada 5 minutos
#>

[CmdletBinding()]
param()

#region ===== CONFIGURACIÓN =====

$TestMode = $true          # $true = solo 5 instancias | $false = todas
$IncludeAWS = $true        # $true = incluir AWS | $false = excluir AWS
$OnlyAWS = $false          # $true = solo AWS | $false = incluir On-premise

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 10

$OutJson = ".\InstanceHealth_Critical_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"

#endregion

#region ===== FUNCIONES DE CONECTIVIDAD =====

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        Success = $false
        LatencyMs = 0
        ErrorMessage = $null
    }
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        $query = "SELECT @@SERVERNAME AS ServerName"
        $null = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        $stopwatch.Stop()
        $result.Success = $true
        $result.LatencyMs = [int]$stopwatch.ElapsedMilliseconds
        
    } catch {
        $result.ErrorMessage = $_.Exception.Message
    }
    
    return $result
}

#endregion

#region ===== FUNCIONES DE MÉTRICAS =====

function Get-DiskStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        WorstFreePct = 100
        Volumes = @()
    }
    
    try {
        $query = @"
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    vs.total_bytes / 1024 / 1024 / 1024 AS TotalGB,
    vs.available_bytes / 1024 / 1024 / 1024 AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC
"@
        
        $volumes = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        foreach ($vol in $volumes) {
            $result.Volumes += @{
                MountPoint = $vol.MountPoint
                TotalGB = [int]$vol.TotalGB
                FreeGB = [int]$vol.FreeGB
                FreePct = [decimal]$vol.FreePct
            }
            
            if ($vol.FreePct -lt $result.WorstFreePct) {
                $result.WorstFreePct = [decimal]$vol.FreePct
            }
        }
        
    } catch {
        Write-Verbose "Error obteniendo discos de $InstanceName : $_"
    }
    
    return $result
}

function Get-AlwaysOnStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10,
        [bool]$IsAlwaysOnEnabled = $false
    )
    
    $result = @{
        Enabled = $IsAlwaysOnEnabled
        WorstState = "OK"
        Issues = @()
    }
    
    if (-not $IsAlwaysOnEnabled) {
        return $result
    }
    
    try {
        $query = @"
SELECT 
    ag.name AS AGName,
    db.database_name AS DatabaseName,
    ar.availability_mode_desc AS SyncMode,
    drs.synchronization_state_desc AS SyncState,
    drs.synchronization_health_desc AS SyncHealth,
    drs.redo_queue_size AS RedoQueueKB,
    DATEDIFF(SECOND, drs.last_commit_time, GETDATE()) AS SecondsBehind
FROM sys.dm_hadr_database_replica_states drs
JOIN sys.availability_databases_cluster db ON drs.group_database_id = db.group_database_id
JOIN sys.availability_groups ag ON ag.group_id = drs.group_id
JOIN sys.availability_replicas ar ON ar.replica_id = drs.replica_id
WHERE drs.is_local = 1
"@
        
        $agStates = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        if ($agStates.Count -gt 0) {
            $result.Enabled = $true
        }
        
        foreach ($ag in $agStates) {
            # 1. Check SyncHealth
            if ($ag.SyncHealth -eq 'NOT_HEALTHY') {
                $result.Issues += "BD $($ag.DatabaseName) NO saludable"
                $result.WorstState = "NOT_SYNC"
            }
            
            # 2. Solo verificar sincronización si es SYNCHRONOUS
            if ($ag.SyncMode -eq 'SYNCHRONOUS_COMMIT' -and $ag.SyncState -ne 'SYNCHRONIZED') {
                $result.Issues += "BD $($ag.DatabaseName) no SYNC (modo sync)"
                if ($result.WorstState -eq "OK") {
                    $result.WorstState = "NOT_SYNC"
                }
            }
            
            # 3. Redo queue grande
            if ($ag.RedoQueueKB -and $ag.RedoQueueKB -ne [DBNull]::Value) {
                try {
                    $redoQueueKB = [int64]$ag.RedoQueueKB
                    if ($redoQueueKB -gt 512000) {
                        $result.Issues += "BD $($ag.DatabaseName) redo queue: $redoQueueKB KB"
                        if ($result.WorstState -eq "OK") {
                            $result.WorstState = "HIGH_REDO"
                        }
                    }
                } catch {
                    Write-Verbose "Error comparando RedoQueueKB: $_"
                }
            }
            
            # 4. Lag solo para nodos síncronos
            if ($ag.SyncMode -eq 'SYNCHRONOUS_COMMIT' -and $ag.SecondsBehind -and $ag.SecondsBehind -ne [DBNull]::Value) {
                try {
                    $secondsBehind = [int]$ag.SecondsBehind
                    if ($secondsBehind -gt 900) {
                        $result.Issues += "BD $($ag.DatabaseName) lag: ${secondsBehind}s"
                        if ($result.WorstState -eq "OK") {
                            $result.WorstState = "LAGGING"
                        }
                    }
                } catch {
                    Write-Verbose "Error comparando SecondsBehind: $_"
                }
            }
        }
        
    } catch {
        Write-Verbose "Error obteniendo AlwaysOn de $InstanceName : $_"
    }
    
    return $result
}

#endregion

#region ===== PROCESAMIENTO =====

function Get-CriticalMetrics {
    param(
        [Parameter(Mandatory)]
        [object]$Instance,
        [int]$TimeoutSec = 10
    )
    
    $instanceName = if ($Instance.NombreInstancia) { $Instance.NombreInstancia } else { $Instance.ServerName }
    
    Write-Verbose "Procesando: $instanceName"
    
    # 1. Conectividad
    $connectivity = Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    if (-not $connectivity.Success) {
        return [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $Instance.Ambiente
            HostingSite = $Instance.hostingSite
            Version = $Instance.Version
            ConnectSuccess = $false
            ConnectLatencyMs = 0
            DiskWorstFreePct = 100
            DiskVolumesJson = "[]"
            AlwaysOnEnabled = ($Instance.AlwaysOn -eq "Enabled")
            AlwaysOnWorstState = "UNKNOWN"
            AlwaysOnIssuesJson = '["No conecta"]'
            CollectedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            ErrorMessage = $connectivity.ErrorMessage
        }
    }
    
    # 2. Obtener métricas
    $isAlwaysOn = ($Instance.AlwaysOn -eq "Enabled")
    
    $disks = Get-DiskStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $alwaysOn = Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -IsAlwaysOnEnabled $isAlwaysOn
    
    # 3. Construir objeto resultado
    $result = [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $Instance.Ambiente
        HostingSite = $Instance.hostingSite
        Version = $Instance.Version
        ConnectSuccess = $true
        ConnectLatencyMs = $connectivity.LatencyMs
        DiskWorstFreePct = $disks.WorstFreePct
        DiskVolumesJson = ($disks.Volumes | ConvertTo-Json -Compress -Depth 2)
        AlwaysOnEnabled = $alwaysOn.Enabled
        AlwaysOnWorstState = $alwaysOn.WorstState
        AlwaysOnIssuesJson = ($alwaysOn.Issues | ConvertTo-Json -Compress)
        CollectedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        ErrorMessage = $null
    }
    
    return $result
}

#endregion

#region ===== FUNCIONES DE SALIDA =====

function Write-ToSqlCritical {
    param(
        [array]$Results,
        [string]$SqlServer,
        [string]$SqlDatabase
    )
    
    Write-Host ""
    Write-Host "[SQL] Escribiendo a InstanceHealth_Critical..." -ForegroundColor Cyan
    
    foreach ($result in $Results) {
        try {
            $instanceName = $result.InstanceName -replace "'", "''"
            $ambiente = if ($result.Ambiente) { "N'$($result.Ambiente -replace "'", "''")'" } else { "NULL" }
            $hostingSite = if ($result.HostingSite) { "N'$($result.HostingSite -replace "'", "''")'" } else { "NULL" }
            $version = if ($result.Version) { "N'$($result.Version -replace "'", "''")'" } else { "NULL" }
            $errorMsg = if ($result.ErrorMessage) { "N'$($result.ErrorMessage -replace "'", "''")'" } else { "NULL" }
            
            $diskVolumesJson = $result.DiskVolumesJson -replace "'", "''"
            $alwaysOnIssuesJson = $result.AlwaysOnIssuesJson -replace "'", "''"
            
            $insertQuery = @"
INSERT INTO [$SqlDatabase].[dbo].[InstanceHealth_Critical] 
(InstanceName, Ambiente, HostingSite, Version, ConnectSuccess, ConnectLatencyMs, 
 DiskWorstFreePct, DiskVolumesJson, AlwaysOnEnabled, AlwaysOnWorstState, AlwaysOnIssuesJson,
 CollectedAtUtc, ErrorMessage)
VALUES 
(N'$instanceName', $ambiente, $hostingSite, $version, 
 $($result.ConnectSuccess -as [int]), $($result.ConnectLatencyMs),
 $($result.DiskWorstFreePct), N'$diskVolumesJson',
 $($result.AlwaysOnEnabled -as [int]), N'$($result.AlwaysOnWorstState)', N'$alwaysOnIssuesJson',
 GETUTCDATE(), $errorMsg)
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $insertQuery `
                -ConnectionTimeout 30 `
                -QueryTimeout 30 `
                -TrustServerCertificate `
                -ErrorAction Stop
            
        } catch {
            Write-Warning "Error escribiendo $($result.InstanceName): $_"
        }
    }
    
    Write-Host "  [OK] $($Results.Count) registro(s) insertado(s)" -ForegroundColor Green
}

#endregion

#region ===== MAIN EXECUTION =====

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Health Score - CRITICAL Metrics" -ForegroundColor Cyan
Write-Host " (Conectividad, Discos, AlwaysOn)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "[STEP 1/3] Obteniendo instancias desde API..." -ForegroundColor Cyan
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "  [OK] $($instances.Count) instancia(s) obtenida(s)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo obtener instancias: $_" -ForegroundColor Red
    exit 1
}

# 2. Filtrar
Write-Host ""
Write-Host "[STEP 2/3] Filtrando instancias..." -ForegroundColor Cyan

$instancesFiltered = $instances | Where-Object {
    $serverName = if ($_.NombreInstancia) { $_.NombreInstancia } else { $_.ServerName }
    $serverName -notmatch "DMZ"
}

if ($OnlyAWS) {
    $instancesFiltered = $instancesFiltered | Where-Object { $_.hostingSite -eq "AWS" }
} elseif (-not $IncludeAWS) {
    $instancesFiltered = $instancesFiltered | Where-Object { $_.hostingSite -ne "AWS" }
}

if ($TestMode) {
    $instancesFiltered = $instancesFiltered | Select-Object -First 5
    Write-Host "  [TEST MODE] Procesando solo 5 instancias" -ForegroundColor Yellow
}

Write-Host "  [OK] $($instancesFiltered.Count) instancia(s) a procesar" -ForegroundColor Green

# 3. Procesar
Write-Host ""
Write-Host "[STEP 3/3] Procesando instancias..." -ForegroundColor Cyan

$allResults = @()
$progress = 0

foreach ($instance in $instancesFiltered) {
    $progress++
    $pct = [int](($progress / $instancesFiltered.Count) * 100)
    Write-Progress -Activity "Procesando métricas críticas" -Status "$progress de $($instancesFiltered.Count)" -PercentComplete $pct
    
    $result = Get-CriticalMetrics -Instance $instance -TimeoutSec $TimeoutSec
    $allResults += $result
}

Write-Progress -Activity "Procesando métricas críticas" -Completed
Write-Host "  [OK] $($allResults.Count) instancia(s) procesada(s)" -ForegroundColor Green

# 4. Guardar JSON
Write-Host ""
Write-Host "[EXPORT] Guardando JSON..." -ForegroundColor Cyan
$allResults | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutJson -Encoding UTF8
Write-Host "  [OK] JSON: $OutJson" -ForegroundColor Green

# 5. Escribir a SQL
Write-ToSqlCritical -Results $allResults -SqlServer $SqlServer -SqlDatabase $SqlDatabase

# Resumen
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " RESUMEN" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

$connectedCount = ($allResults | Where-Object { $_.ConnectSuccess }).Count
$disconnectedCount = ($allResults | Where-Object { -not $_.ConnectSuccess }).Count
$diskWarningCount = ($allResults | Where-Object { $_.DiskWorstFreePct -lt 20 }).Count
$agIssueCount = ($allResults | Where-Object { $_.AlwaysOnWorstState -ne "OK" -and $_.AlwaysOnEnabled }).Count

Write-Host "  Conectadas    : $connectedCount" -ForegroundColor Green
Write-Host "  Desconectadas : $disconnectedCount" -ForegroundColor $(if ($disconnectedCount -gt 0) { "Red" } else { "Gray" })
Write-Host "  Discos < 20%  : $diskWarningCount" -ForegroundColor $(if ($diskWarningCount -gt 0) { "Yellow" } else { "Gray" })
Write-Host "  Issues AG     : $agIssueCount" -ForegroundColor $(if ($agIssueCount -gt 0) { "Yellow" } else { "Gray" })
Write-Host ""
Write-Host "Completado exitosamente!" -ForegroundColor Green
Write-Host ""

#endregion

