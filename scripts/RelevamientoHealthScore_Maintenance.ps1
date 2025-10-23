<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de MANTENIMIENTO
    
.DESCRIPTION
    Script de baja frecuencia (cada 1 hora) que recolecta:
    - CHECKDB (10 pts)
    - IndexOptimize (5 pts)
    - Fragmentación de índices (nuevo)
    - Errorlog severity 20+ (5 pts)
    
    Guarda en: InstanceHealth_Maintenance
    
.NOTES
    Versión: 2.0 (dbatools)
    Frecuencia: Cada 1 hora
    Timeout: 30 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

# Verificar que dbatools está disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}
Import-Module dbatools -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30
$TestMode = $false
$IncludeAWS = $true
$OnlyAWS = $false

#endregion

#region ===== FUNCIONES =====

function Get-MaintenanceJobs {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 30
    )
    
    $result = @{
        LastCheckdb = $null
        CheckdbOk = $false
        LastIndexOptimize = $null
        IndexOptimizeOk = $false
        CheckdbJobs = @()
        IndexOptimizeJobs = @()
    }
    
    try {
        $query = @"
-- Query para obtener TODOS los jobs (IntegrityCheck e IndexOptimize)
SELECT 
    j.name AS JobName,
    js.last_run_date AS LastRunDate,
    js.last_run_time AS LastRunTime,
    js.last_run_outcome AS LastRunStatus,  -- 1=Success
    js.last_run_duration AS LastRunDuration,
    jh.run_finish_time AS LastFinishTime
FROM msdb.dbo.sysjobs j
INNER JOIN msdb.dbo.sysjobsteps js 
    ON j.job_id = js.job_id
LEFT JOIN (
    SELECT 
        job_id,
        step_id,
        MAX(run_date * 1000000 + run_time) AS MaxRunDateTime,
        MAX(CASE 
            WHEN run_date > 0 AND run_time > 0 THEN
                CONVERT(DATETIME, 
                    CAST(run_date AS VARCHAR(8)) + ' ' + 
                    STUFF(STUFF(RIGHT('000000' + CAST(run_time AS VARCHAR(6)), 6), 5, 0, ':'), 3, 0, ':'))
            END) AS run_finish_time
    FROM msdb.dbo.sysjobhistory
    WHERE step_id > 0
    GROUP BY job_id, step_id
) jh ON j.job_id = jh.job_id AND js.step_id = jh.step_id
WHERE (j.name LIKE '%IntegrityCheck%' 
    OR j.name LIKE '%IndexOptimize%')
  AND j.name NOT LIKE '%STOP%'
  AND js.step_id = 1;
"@
        
        # Usar dbatools para ejecutar queries
        $datasets = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $cutoffDate = (Get-Date).AddDays(-7)
        
        # Procesar IntegrityCheck jobs
        $checkdbJobs = $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' }
        $allCheckdbOk = $true
        $mostRecentCheckdb = $null
        
        foreach ($job in $checkdbJobs) {
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {}
            }
            
            if ($lastRun) {
                $isSuccess = ($job.LastRunStatus -eq 1)
                $isRecent = ($lastRun -ge $cutoffDate -and $isSuccess)
                
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isSuccess
                    IsRecent = $isRecent
                }
                
                if (-not $mostRecentCheckdb -or $lastRun -gt $mostRecentCheckdb) {
                    $mostRecentCheckdb = $lastRun
                }
                
                if (-not $isRecent) {
                    $allCheckdbOk = $false
                }
            } else {
                $allCheckdbOk = $false
            }
        }
        
        if ($checkdbJobs.Count -gt 0) {
            $result.LastCheckdb = $mostRecentCheckdb
            $result.CheckdbOk = $allCheckdbOk
        }
        
        # Procesar IndexOptimize jobs
        $indexOptJobs = $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' }
        $allIndexOptOk = $true
        $mostRecentIndexOpt = $null
        
        foreach ($job in $indexOptJobs) {
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {}
            }
            
            if ($lastRun) {
                $isSuccess = ($job.LastRunStatus -eq 1)
                $isRecent = ($lastRun -ge $cutoffDate -and $isSuccess)
                
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isSuccess
                    IsRecent = $isRecent
                }
                
                if (-not $mostRecentIndexOpt -or $lastRun -gt $mostRecentIndexOpt) {
                    $mostRecentIndexOpt = $lastRun
                }
                
                if (-not $isRecent) {
                    $allIndexOptOk = $false
                }
            } else {
                $allIndexOptOk = $false
            }
        }
        
        if ($indexOptJobs.Count -gt 0) {
            $result.LastIndexOptimize = $mostRecentIndexOpt
            $result.IndexOptimizeOk = $allIndexOptOk
        }
        
    } catch {
        Write-Warning "Error obteniendo maintenance jobs en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-IndexFragmentation {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 30
    )
    
    $result = @{
        AvgFragmentation = 0
        HighFragmentationCount = 0
    }
    
    try {
        # Query ligero que solo mira índices grandes (>1000 pages)
        $query = @"
SELECT 
    AVG(ips.avg_fragmentation_in_percent) AS AvgFragmentation,
    SUM(CASE WHEN ips.avg_fragmentation_in_percent > 30 THEN 1 ELSE 0 END) AS HighFragCount
FROM sys.dm_db_index_physical_stats(NULL, NULL, NULL, NULL, 'LIMITED') ips
WHERE ips.index_id > 0
  AND ips.page_count > 1000
  AND ips.avg_fragmentation_in_percent > 0;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data -and $data.AvgFragmentation -ne [DBNull]::Value) {
            $result.AvgFragmentation = [decimal]$data.AvgFragmentation
            $result.HighFragmentationCount = [int]$data.HighFragCount
        }
        
    } catch {
        Write-Warning "Error obteniendo fragmentación en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-ErrorlogStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 30
    )
    
    $result = @{
        Severity20PlusCount = 0
        Details = @()
    }
    
    try {
        $query = @"
CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(128),
    [Text] NVARCHAR(MAX)
);

INSERT INTO #ErrorLog
EXEC sp_readerrorlog 0;

SELECT 
    COUNT(*) AS Severity20Count
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE());

SELECT TOP 5 
    LogDate,
    [Text]
FROM #ErrorLog
WHERE [Text] LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE())
ORDER BY LogDate DESC;

DROP TABLE #ErrorLog;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $countRow = $data | Select-Object -First 1
            $result.Severity20PlusCount = [int]$countRow.Severity20Count
            
            $detailRows = $data | Select-Object -Skip 1 -First 5
            $result.Details = $detailRows | ForEach-Object {
                "$($_.LogDate): $($_.Text.Substring(0, [Math]::Min(100, $_.Text.Length)))"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo errorlog en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        # Usar dbatools para test de conexión
        $connection = Test-DbaConnection -SqlInstance $InstanceName -ConnectTimeout $TimeoutSec -EnableException
        return $connection.IsPingable
    } catch {
        return $false
    }
}

function Write-ToSqlServer {
    param(
        [array]$Data
    )
    
    if ($Data.Count -eq 0) {
        Write-Host "No hay datos para guardar." -ForegroundColor Yellow
        return
    }
    
    try {
        foreach ($row in $Data) {
            # Sanitizar valores NULL
            $lastCheckdb = if ($row.LastCheckdb) { "'$($row.LastCheckdb.ToString('yyyy-MM-dd HH:mm:ss'))'" } else { "NULL" }
            $lastIndexOpt = if ($row.LastIndexOptimize) { "'$($row.LastIndexOptimize.ToString('yyyy-MM-dd HH:mm:ss'))'" } else { "NULL" }
            $avgFrag = if ($row.AvgFragmentation -ne $null) { $row.AvgFragmentation } else { "NULL" }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Maintenance (
    InstanceName,
    CollectedAtUtc,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    AvgIndexFragmentation,
    HighFragmentationCount,
    Severity20PlusCount,
    ErrorlogDetails
) VALUES (
    '$($row.InstanceName)',
    GETUTCDATE(),
    $lastCheckdb,
    $(if ($row.CheckdbOk) {1} else {0}),
    $lastIndexOpt,
    $(if ($row.IndexOptimizeOk) {1} else {0}),
    $avgFrag,
    $($row.HighFragmentationCount),
    $($row.Severity20PlusCount),
    '$($row.ErrorlogDetails -join "|")'
);
"@
            
            # Usar dbatools para insertar datos
            Invoke-DbaQuery -SqlInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -EnableException
        }
        
        Write-Host "✅ Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v2.0 - MAINTENANCE METRICS              ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 1 hora                                   ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response.message
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.Ambiente -notlike "*AWS*" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.Ambiente -like "*AWS*" }
    }
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Instancias a procesar: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de mantenimiento..." -ForegroundColor Yellow
Write-Host "   (Esto puede tardar varios minutos...)" -ForegroundColor Gray

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.nombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar métricas (estas son pesadas)
    $maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $fragmentation = Get-IndexFragmentation -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if (-not $maintenance.CheckdbOk) { $status = "⚠️ NO CHECKDB!" }
    elseif (-not $maintenance.IndexOptimizeOk) { $status = "⚠️ NO INDEX OPT!" }
    elseif ($errorlog.Severity20PlusCount -gt 0) { $status = "🚨 ERRORS!" }
    
    $checkdbAge = if ($maintenance.LastCheckdb) { ((Get-Date) - $maintenance.LastCheckdb).Days } else { "N/A" }
    
    Write-Host "   $status $instanceName - CHECKDB:$checkdbAge days Frag:$([int]$fragmentation.AvgFragmentation)% Errors:$($errorlog.Severity20PlusCount)" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        LastCheckdb = $maintenance.LastCheckdb
        CheckdbOk = $maintenance.CheckdbOk
        LastIndexOptimize = $maintenance.LastIndexOptimize
        IndexOptimizeOk = $maintenance.IndexOptimizeOk
        AvgFragmentation = $fragmentation.AvgFragmentation
        HighFragmentationCount = $fragmentation.HighFragmentationCount
        Severity20PlusCount = $errorlog.Severity20PlusCount
        ErrorlogDetails = $errorlog.Details
    }
}

Write-Progress -Activity "Recolectando métricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - MAINTENANCE                                ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:        $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  CHECKDB OK:              $(($results | Where-Object CheckdbOk).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  IndexOptimize OK:        $(($results | Where-Object IndexOptimizeOk).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Con fragmentación >30%:  $(($results | Where-Object {$_.AvgFragmentation -gt 30}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Con errores severity 20+: $(($results | Where-Object {$_.Severity20PlusCount -gt 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion
