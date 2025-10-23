<#
.SYNOPSIS
    Relevamiento de Health Score para instancias SQL Server.

.DESCRIPTION
    Script simplificado que:
    1. Obtiene instancias desde API
    2. Calcula métricas individuales por instancia
    3. Sincroniza valores entre nodos AlwaysOn
    4. Calcula HealthScore final
    5. Guarda resultados en JSON, CSV y SQL

.NOTES
    Autor: SQL Guard Observatory Team
    Versión: 2.0 - Refactorización completa
    Fecha: 2025-10-22
#>

[CmdletBinding()]
param()

#region ===== CONFIGURACIÓN INTERNA =====

# Modo de ejecución
$TestMode = $true          # $true = solo 5 instancias | $false = todas
$WriteToSql = $false       # $true = guardar en SSPR17MON-01.SQLNova
$IncludeAWS = $true        # $true = incluir AWS | $false = excluir AWS
$OnlyAWS = $false          # $true = solo AWS | $false = incluir On-premise

# Configuración de API y SQL
$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 10

# Archivos de salida
$OutJson = ".\InstanceHealth_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
$OutCsv = ".\InstanceHealth_$(Get-Date -Format 'yyyyMMdd_HHmmss').csv"

# Credenciales SQL (null = Windows Auth)
$SqlCredential = $null

#endregion

#region ===== FUNCIONES DE CONECTIVIDAD =====

function Test-SqlConnection {
    <#
    .SYNOPSIS
        Prueba conectividad SQL y mide latencia.
    #>
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

#region ===== FUNCIONES DE MÉTRICAS INDIVIDUALES =====

function Get-MaintenanceJobs {
    <#
    .SYNOPSIS
        Obtiene TODOS los IntegrityCheck e IndexOptimize (excluyendo STOP).
        Evalúa si TODOS están OK o si alguno está vencido.
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        LastCheckdb = $null
        LastIndexOptimize = $null
        CheckdbOk = $false
        IndexOptimizeOk = $false
        CheckdbJobs = @()
        IndexOptimizeJobs = @()
    }
    
    try {
        $query = @"
-- TODOS los IntegrityCheck con su última ejecución (excluir STOP)
-- Compatible con SQL 2008 R2+
-- Usa TIEMPO DE FINALIZACIÓN (run_date + run_time + run_duration) para ordenar
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        -- Calcular tiempo de finalización: run_date + run_time + run_duration
        -- run_duration está en formato HHMMSS (int): 20107 = 2m 7s
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 +  -- Horas
            ((jh.run_duration / 100) % 100) * 60 + -- Minutos
            (jh.run_duration % 100),  -- Segundos
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS HistoryFinishTime,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY 
            DATEADD(SECOND, 
                (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
                CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
            ) DESC,
            -- En caso de empate de tiempo, priorizar: Succeeded(1) > Failed(0) > Canceled(3)
            CASE WHEN jh.run_status = 1 THEN 0 WHEN jh.run_status = 0 THEN 1 WHEN jh.run_status = 3 THEN 2 ELSE 3 END ASC
        ) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;

-- TODOS los IndexOptimize con su última ejecución (excluir STOP)
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        -- Calcular tiempo de finalización
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
        ) AS HistoryFinishTime,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY 
            DATEADD(SECOND, 
                (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
                CAST(CAST(jh.run_date AS VARCHAR) + ' ' + STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') AS DATETIME)
            ) DESC,
            CASE WHEN jh.run_status = 1 THEN 0 WHEN jh.run_status = 0 THEN 1 WHEN jh.run_status = 3 THEN 2 ELSE 3 END ASC
        ) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
"@
        
        $datasets = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        $cutoffDate = (Get-Date).AddDays(-7)
        $cutoffDateInt = [int]$cutoffDate.ToString("yyyyMMdd")
        
        # Procesar IntegrityCheck jobs
        $checkdbJobs = $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' }
        $allCheckdbOk = $true
        $mostRecentCheckdb = $null
        
        foreach ($job in $checkdbJobs) {
            Write-Verbose "  Procesando CheckDB job: $($job.JobName)"
            
            # Usar LastFinishTime si está disponible, sino calcular desde LastRunDate + LastRunTime
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {
                    Write-Verbose "    ❌ Error parseando fecha: $_"
                }
            }
            
            if ($lastRun) {
                $isSuccess = ($job.LastRunStatus -eq 1)
                $isRecent = ($lastRun -ge $cutoffDate -and $isSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
            
                Write-Verbose "    LastFinish=$lastRun, Duration=$duration, Status=$($job.LastRunStatus), Success=$isSuccess, Recent=$isRecent"
            
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                }
                
                # Actualizar más reciente
                if (-not $mostRecentCheckdb -or $lastRun -gt $mostRecentCheckdb) {
                    $mostRecentCheckdb = $lastRun
                }
                
                # Si alguno NO está OK, marcar como no OK
                if (-not $isRecent) {
                    $allCheckdbOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente
                Write-Verbose "    ⚠️  Job SIN datos de ejecución"
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                }
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
            Write-Verbose "  Procesando IndexOptimize job: $($job.JobName)"
            
            # Usar LastFinishTime si está disponible, sino calcular desde LastRunDate + LastRunTime
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {
                    Write-Verbose "    ❌ Error parseando fecha: $_"
                }
            }
            
            if ($lastRun) {
                $isSuccess = ($job.LastRunStatus -eq 1)
                $isRecent = ($lastRun -ge $cutoffDate -and $isSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
            
                Write-Verbose "    LastFinish=$lastRun, Duration=$duration, Status=$($job.LastRunStatus), Success=$isSuccess, Recent=$isRecent"
            
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                }
                
                # Actualizar más reciente
                if (-not $mostRecentIndexOpt -or $lastRun -gt $mostRecentIndexOpt) {
                    $mostRecentIndexOpt = $lastRun
                }
                
                # Si alguno NO está OK, marcar como no OK
                if (-not $isRecent) {
                    $allIndexOptOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente
                Write-Verbose "    ⚠️  Job SIN datos de ejecución"
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                }
                $allIndexOptOk = $false
            }
        }
        
        if ($indexOptJobs.Count -gt 0) {
            $result.LastIndexOptimize = $mostRecentIndexOpt
            $result.IndexOptimizeOk = $allIndexOptOk
        }
        
        Write-Verbose "  IntegrityCheck: $($checkdbJobs.Count) job(s), AllOK=$allCheckdbOk"
        Write-Verbose "  IndexOptimize: $($indexOptJobs.Count) job(s), AllOK=$allIndexOptOk"
        
    } catch {
        Write-Verbose "Error obteniendo jobs de $InstanceName : $_"
    }
    
    return $result
}

function Get-BackupStatus {
    <#
    .SYNOPSIS
        Obtiene estado de backups (solo instancia local).
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        LastFullBackup = $null
        LastDiffBackup = $null
        LastLogBackup = $null
        Breaches = @()
    }
    
    try {
        $query = @"
-- Obtener últimos backups por tipo (todas las bases de usuario)
SELECT 
    'FULL' AS BackupType,
    MAX(backup_finish_date) AS LastBackup
FROM msdb.dbo.backupset
WHERE type = 'D'
  AND database_name NOT IN ('master', 'model', 'msdb', 'tempdb')

UNION ALL

SELECT 
    'DIFF' AS BackupType,
    MAX(backup_finish_date) AS LastBackup
FROM msdb.dbo.backupset
WHERE type = 'I'
  AND database_name NOT IN ('master', 'model', 'msdb', 'tempdb')

UNION ALL

SELECT 
    'LOG' AS BackupType,
    MAX(backup_finish_date) AS LastBackup
FROM msdb.dbo.backupset
WHERE type = 'L'
  AND database_name NOT IN ('master', 'model', 'msdb', 'tempdb')
"@
        
        $backups = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        foreach ($backup in $backups) {
            if ($backup.LastBackup) {
                switch ($backup.BackupType) {
                    'FULL' { $result.LastFullBackup = $backup.LastBackup }
                    'DIFF' { $result.LastDiffBackup = $backup.LastBackup }
                    'LOG'  { $result.LastLogBackup = $backup.LastBackup }
                }
            }
        }
        
        # Calcular breaches (sin agregar "Sin backup" aquí)
        if ($result.LastFullBackup -and $result.LastFullBackup -is [datetime]) {
            try {
                $ageHours = ((Get-Date) - [datetime]$result.LastFullBackup).TotalHours
                if ($ageHours -gt 25) {
                    $result.Breaches += "FULL: $([int]$ageHours)h > 25h"
                }
            } catch {
                Write-Verbose "Error calculando antigüedad de FULL backup: $_"
            }
        }
        
        if ($result.LastLogBackup -and $result.LastLogBackup -is [datetime]) {
            try {
                $ageHours = ((Get-Date) - [datetime]$result.LastLogBackup).TotalHours
                if ($ageHours -gt 2) {
                    $result.Breaches += "LOG: $([int]$ageHours)h > 2h"
                }
            } catch {
                Write-Verbose "Error calculando antigüedad de LOG backup: $_"
            }
        }
        
    } catch {
        Write-Verbose "Error obteniendo backups de $InstanceName : $_"
    }
    
    return $result
}

function Get-DiskStatus {
    <#
    .SYNOPSIS
        Obtiene estado de discos.
    #>
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

function Get-ResourceStatus {
    <#
    .SYNOPSIS
        Obtiene estado de CPU/Memoria.
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        CpuHighFlag = $false
        MemoryPressureFlag = $false
        RawCounters = @{}
    }
    
    try {
        $query = @"
SELECT 
    counter_name,
    cntr_value
FROM sys.dm_os_performance_counters
WHERE (counter_name LIKE '%CPU%' OR counter_name LIKE '%Memory%')
  AND cntr_type = 65792
"@
        
        $counters = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        foreach ($counter in $counters) {
            $result.RawCounters[$counter.counter_name] = $counter.cntr_value
        }
        
        # Heurística simple (esto es aproximado)
        if ($result.RawCounters.Count -gt 0) {
            # Si hay counters disponibles, marcar flags según valores
            $result.CpuHighFlag = $false  # Simplificado
            $result.MemoryPressureFlag = $false  # Simplificado
        }
        
    } catch {
        Write-Verbose "Error obteniendo recursos de $InstanceName : $_"
    }
    
    return $result
}

function Get-AlwaysOnStatus {
    <#
    .SYNOPSIS
        Obtiene estado de AlwaysOn (solo instancia local).
    #>
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
            # 1. Check SyncHealth (siempre es problema)
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
            
            # 3. Redo queue grande (500MB threshold para DR)
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

function Get-ErrorlogStatus {
    <#
    .SYNOPSIS
        Obtiene errores severity >= 20 en últimas 24h.
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        Severity20PlusCount = 0
        Skipped = $false
    }
    
    try {
        $query = @"
CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(50),
    Text NVARCHAR(MAX)
);

INSERT INTO #ErrorLog
EXEC xp_readerrorlog 0, 1;

SELECT COUNT(*) AS ErrorCount
FROM #ErrorLog
WHERE Text LIKE '%Severity: 2[0-9]%'
  AND LogDate >= DATEADD(HOUR, -24, GETDATE());

DROP TABLE #ErrorLog;
"@
        
        $errorCount = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -ConnectionTimeout $TimeoutSec `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
        $result.Severity20PlusCount = $errorCount.ErrorCount
        
    } catch {
        $result.Skipped = $true
        Write-Verbose "Error obteniendo errorlog de $InstanceName (puede no tener permisos): $_"
    }
    
    return $result
}

#endregion

#region ===== FUNCIÓN DE PROCESAMIENTO INDIVIDUAL =====

function Get-InstanceHealth {
    <#
    .SYNOPSIS
        Obtiene TODAS las métricas de UNA instancia (sin sincronizar con otros nodos).
    #>
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
        # Si no conecta, devolver objeto con valores predeterminados
        return [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $Instance.Ambiente
            HostingSite = $Instance.hostingSite
            Version = $Instance.Version
            ConnectSuccess = $false
            ConnectLatencyMs = 0
            MaintenanceSummary = @{
                LastCheckdb = $null
                LastIndexOptimize = $null
                CheckdbOk = $false
                IndexOptimizeOk = $false
            }
            BackupSummary = @{
                LastFullBackup = $null
                LastDiffBackup = $null
                LastLogBackup = $null
                Breaches = @()
            }
            DiskSummary = @{
                WorstFreePct = 100
                Volumes = @()
            }
            ResourceSummary = @{
                CpuHighFlag = $false
                MemoryPressureFlag = $false
                RawCounters = @{}
            }
            AlwaysOnSummary = @{
                Enabled = ($Instance.AlwaysOn -eq "Enabled")
                WorstState = "UNKNOWN"
                Issues = @("No conecta")
            }
            ErrorlogSummary = @{
                Severity20PlusCount = 0
                Skipped = $true
            }
            HealthScore = 0
            HealthStatus = "Critical"
            GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            ErrorMessage = $connectivity.ErrorMessage
        }
    }
    
    # 2. Obtener métricas individuales
    $isAlwaysOn = ($Instance.AlwaysOn -eq "Enabled")
    
    $maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $backups = Get-BackupStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $disks = Get-DiskStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $resources = Get-ResourceStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $alwaysOn = Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -IsAlwaysOnEnabled $isAlwaysOn
    $errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    # 3. Construir objeto resultado
    $result = [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $Instance.Ambiente
        HostingSite = $Instance.hostingSite
        Version = $Instance.Version
        ConnectSuccess = $true
        ConnectLatencyMs = $connectivity.LatencyMs
        MaintenanceSummary = $maintenance
        BackupSummary = $backups
        DiskSummary = $disks
        ResourceSummary = $resources
        AlwaysOnSummary = $alwaysOn
        ErrorlogSummary = $errorlog
        HealthScore = 0  # Se calculará después de sincronización
        HealthStatus = "Unknown"
        GeneratedAtUtc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        ErrorMessage = $null
    }
    
    return $result
}

#endregion

#region ===== FUNCIÓN DE CÁLCULO DE HEALTH SCORE =====

function Calculate-HealthScore {
    <#
    .SYNOPSIS
        Calcula el HealthScore basándose en todas las métricas.
    #>
    param(
        [Parameter(Mandatory)]
        [PSCustomObject]$InstanceData
    )
    
    $score = 0
    
    # 1. Availability (30 puntos)
    if ($InstanceData.ConnectSuccess) {
        if ($InstanceData.ConnectLatencyMs -lt 3000) {
            $score += 30
        } elseif ($InstanceData.ConnectLatencyMs -lt 5000) {
            $score += 15
        }
    }
    
    # 2. Jobs & Backups (25 puntos)
    $jobScore = 0
    if ($InstanceData.MaintenanceSummary.CheckdbOk) { $jobScore += 5 }
    if ($InstanceData.MaintenanceSummary.IndexOptimizeOk) { $jobScore += 5 }
    if ($InstanceData.BackupSummary.Breaches.Count -eq 0) { $jobScore += 15 }
    $score += $jobScore
    
    # 3. Disks (20 puntos)
    $diskPct = $InstanceData.DiskSummary.WorstFreePct
    if ($diskPct -ge 20) {
        $score += 20
    } elseif ($diskPct -ge 10) {
        $score += 10
    } elseif ($diskPct -ge 5) {
        $score += 5
    }
    
    # 4. AlwaysOn (15 puntos)
    if ($InstanceData.AlwaysOnSummary.Enabled) {
        if ($InstanceData.AlwaysOnSummary.WorstState -eq "OK") {
            $score += 15
        } elseif ($InstanceData.AlwaysOnSummary.WorstState -eq "HIGH_REDO") {
            $score += 10
        } elseif ($InstanceData.AlwaysOnSummary.WorstState -eq "LAGGING") {
            $score += 5
        }
    } else {
        # Neutral para standalone
        $score += 15
    }
    
    # 5. Errorlog (10 puntos)
    if (-not $InstanceData.ErrorlogSummary.Skipped) {
        if ($InstanceData.ErrorlogSummary.Severity20PlusCount -eq 0) {
            $score += 10
        } elseif ($InstanceData.ErrorlogSummary.Severity20PlusCount -lt 5) {
            $score += 5
        }
    } else {
        # Neutral si no se pudo consultar
        $score += 10
    }
    
    # Determinar estado
    $status = "Critical"
    if ($score -ge 90) {
        $status = "Healthy"
    } elseif ($score -ge 70) {
        $status = "Warning"
    }
    
    $InstanceData.HealthScore = $score
    $InstanceData.HealthStatus = $status
}

#endregion

#region ===== PRE-PROCESAMIENTO: IDENTIFICAR GRUPOS ALWAYSON =====

function Get-AlwaysOnGroups {
    <#
    .SYNOPSIS
        Identifica grupos de AlwaysOn consultando sys.availability_replicas.
    #>
    param(
        [Parameter(Mandatory)]
        [array]$Instances,
        [int]$TimeoutSec = 10
    )
    
    $agGroups = @{}  # Key = AGName, Value = @{ Nodes = @() }
    $nodeToGroup = @{}  # Key = NodeName, Value = AGName
    
    Write-Host ""
    Write-Host "[PRE-PROCESO] Identificando grupos de AlwaysOn..." -ForegroundColor Cyan
    
    foreach ($instance in $Instances) {
        $instanceName = if ($instance.NombreInstancia) { $instance.NombreInstancia } else { $instance.ServerName }
        
        # Solo procesar si es AlwaysOn
        if ($instance.AlwaysOn -ne "Enabled") {
            continue
        }
        
        try {
            $query = @"
SELECT DISTINCT
    ag.name AS AGName,
    ar.replica_server_name AS ReplicaServer
FROM sys.availability_groups ag
INNER JOIN sys.availability_replicas ar ON ag.group_id = ar.group_id
ORDER BY ag.name, ar.replica_server_name
"@
            
            $replicas = Invoke-Sqlcmd -ServerInstance $instanceName `
                -Query $query `
                -ConnectionTimeout $TimeoutSec `
                -QueryTimeout $TimeoutSec `
                -TrustServerCertificate `
                -ErrorAction Stop
            
            foreach ($replica in $replicas) {
                $agName = $replica.AGName
                $replicaServer = $replica.ReplicaServer
                
                if (-not $agGroups.ContainsKey($agName)) {
                    $agGroups[$agName] = @{ Nodes = @() }
                }
                
                if ($agGroups[$agName].Nodes -notcontains $replicaServer) {
                    $agGroups[$agName].Nodes += $replicaServer
                }
                
                $nodeToGroup[$replicaServer] = $agName
            }
            
        } catch {
            Write-Verbose "No se pudo consultar AG en $instanceName : $_"
        }
    }
    
    # Mostrar resumen
    if ($agGroups.Count -gt 0) {
        Write-Host "  [OK] $($agGroups.Count) grupo(s) identificado(s):" -ForegroundColor Green
        foreach ($agName in $agGroups.Keys) {
            $nodes = $agGroups[$agName].Nodes -join ", "
            Write-Host "    - $agName : $nodes" -ForegroundColor Gray
        }
    } else {
        Write-Host "  [INFO] No se encontraron grupos AlwaysOn" -ForegroundColor Gray
    }
    
    return @{
        Groups = $agGroups
        NodeToGroup = $nodeToGroup
    }
}

#endregion

#region ===== POST-PROCESAMIENTO: SINCRONIZAR ALWAYSON =====

function Sync-AlwaysOnData {
    <#
    .SYNOPSIS
        Sincroniza valores de mantenimiento y backups entre nodos de AlwaysOn.
        Toma el MEJOR valor de cada grupo y lo aplica a TODOS los nodos.
    #>
    param(
        [Parameter(Mandatory)]
        [array]$AllResults,
        [Parameter(Mandatory)]
        [hashtable]$AGInfo
    )
    
    Write-Host ""
    Write-Host "[POST-PROCESO] Sincronizando datos entre nodos AlwaysOn..." -ForegroundColor Cyan
    
    $agGroups = $AGInfo.Groups
    $syncedCount = 0
    
    foreach ($agName in $agGroups.Keys) {
        $agGroup = $agGroups[$agName]
        $nodeNames = $agGroup.Nodes
        
        Write-Host "  Procesando AG: $agName" -ForegroundColor Yellow
        Write-Host "    Nodos: $($nodeNames -join ', ')" -ForegroundColor Gray
        
        # Obtener resultados de todos los nodos del grupo
        $groupResults = $AllResults | Where-Object { $nodeNames -contains $_.InstanceName }
        
        if ($groupResults.Count -eq 0) {
            Write-Host "    [SKIP] No hay resultados para este grupo" -ForegroundColor Gray
            continue
        }
        
        # ===== ENCONTRAR LOS MEJORES VALORES DEL GRUPO =====
        
        # Mantenimiento: Recopilar TODOS los jobs de TODOS los nodos
        $allCheckdbJobs = @()
        $allIndexOptimizeJobs = @()
        
        foreach ($nodeResult in $groupResults) {
            $allCheckdbJobs += $nodeResult.MaintenanceSummary.CheckdbJobs
            $allIndexOptimizeJobs += $nodeResult.MaintenanceSummary.IndexOptimizeJobs
        }
        
        # Para AlwaysOn: Evaluar CADA TIPO de job independientemente
        # Ejemplo: IntegrityCheck-SystemDBs y IntegrityCheck-UserDBs se evalúan por separado
        $allCheckdbOk = $true
        $bestCheckdb = $null
        $cutoffDate = (Get-Date).AddDays(-7)
        
        if ($allCheckdbJobs.Count -gt 0) {
            # Agrupar jobs por nombre (para evaluar cada tipo de job independientemente)
            $checkdbByName = $allCheckdbJobs | Group-Object -Property JobName
            
            foreach ($jobGroup in $checkdbByName) {
                # Encontrar el más reciente de este tipo de job
                # Ordenar por tiempo de finalización DESC, luego por status (Succeeded > Failed > Canceled)
                $mostRecentJob = $jobGroup.Group | Sort-Object `
                    @{Expression={$_.LastRun}; Descending=$true}, `
                    @{Expression={
                        if ($_.LastRunStatus -eq 1) { 0 }      # Succeeded - máxima prioridad
                        elseif ($_.LastRunStatus -eq 0) { 1 }  # Failed - segunda prioridad
                        elseif ($_.LastRunStatus -eq 3) { 2 }  # Canceled - tercera prioridad
                        else { 3 }                              # Otros/SinDatos - menor prioridad
                    }; Descending=$false} | Select-Object -First 1
                
                # Si el más reciente de este tipo NO está OK, marcar grupo como no OK
                if (-not $mostRecentJob.LastRun -or $mostRecentJob.LastRun -lt $cutoffDate -or -not $mostRecentJob.IsSuccess) {
                    $allCheckdbOk = $false
                    Write-Verbose "      Job $($jobGroup.Name) del grupo NO está OK (Finish=$($mostRecentJob.LastRun), Status=$($mostRecentJob.LastRunStatus), Duration=$($mostRecentJob.Duration))"
                } else {
                    Write-Verbose "      Job $($jobGroup.Name) del grupo OK (Finish=$($mostRecentJob.LastRun), Status=$($mostRecentJob.LastRunStatus), Duration=$($mostRecentJob.Duration))"
                }
                
                # Actualizar el más reciente global
                if ($mostRecentJob.LastRun -and (-not $bestCheckdb -or $mostRecentJob.LastRun -gt $bestCheckdb)) {
                    $bestCheckdb = $mostRecentJob.LastRun
                }
            }
        } else {
            $allCheckdbOk = $false
        }
        
        $allIndexOptimizeOk = $true
        $bestIndexOptimize = $null
        
        if ($allIndexOptimizeJobs.Count -gt 0) {
            # Agrupar jobs por nombre (para evaluar cada tipo de job independientemente)
            $indexOptByName = $allIndexOptimizeJobs | Group-Object -Property JobName
            
            foreach ($jobGroup in $indexOptByName) {
                # Encontrar el más reciente de este tipo de job
                # Ordenar por tiempo de finalización DESC, luego por status (Succeeded > Failed > Canceled)
                $mostRecentJob = $jobGroup.Group | Sort-Object `
                    @{Expression={$_.LastRun}; Descending=$true}, `
                    @{Expression={
                        if ($_.LastRunStatus -eq 1) { 0 }      # Succeeded - máxima prioridad
                        elseif ($_.LastRunStatus -eq 0) { 1 }  # Failed - segunda prioridad
                        elseif ($_.LastRunStatus -eq 3) { 2 }  # Canceled - tercera prioridad
                        else { 3 }                              # Otros/SinDatos - menor prioridad
                    }; Descending=$false} | Select-Object -First 1
                
                # Si el más reciente de este tipo NO está OK, marcar grupo como no OK
                if (-not $mostRecentJob.LastRun -or $mostRecentJob.LastRun -lt $cutoffDate -or -not $mostRecentJob.IsSuccess) {
                    $allIndexOptimizeOk = $false
                    Write-Verbose "      Job $($jobGroup.Name) del grupo NO está OK (Finish=$($mostRecentJob.LastRun), Status=$($mostRecentJob.LastRunStatus), Duration=$($mostRecentJob.Duration))"
                } else {
                    Write-Verbose "      Job $($jobGroup.Name) del grupo OK (Finish=$($mostRecentJob.LastRun), Status=$($mostRecentJob.LastRunStatus), Duration=$($mostRecentJob.Duration))"
                }
                
                # Actualizar el más reciente global
                if ($mostRecentJob.LastRun -and (-not $bestIndexOptimize -or $mostRecentJob.LastRun -gt $bestIndexOptimize)) {
                    $bestIndexOptimize = $mostRecentJob.LastRun
                }
            }
        } else {
            $allIndexOptimizeOk = $false
        }
        
        Write-Verbose "    CheckdbJobs del grupo: $($allCheckdbJobs.Count), AllOK=$allCheckdbOk"
        Write-Verbose "      Jobs: $($allCheckdbJobs | ForEach-Object { "$($_.JobName): $($_.LastRun), Success=$($_.IsSuccess), Recent=$($_.IsRecent)" } | Out-String)"
        Write-Verbose "    IndexOptimizeJobs del grupo: $($allIndexOptimizeJobs.Count), AllOK=$allIndexOptimizeOk"
        Write-Verbose "      Jobs: $($allIndexOptimizeJobs | ForEach-Object { "$($_.JobName): $($_.LastRun), Success=$($_.IsSuccess), Recent=$($_.IsRecent)" } | Out-String)"
        
        # Backups
        $bestFullBackup = $groupResults | Where-Object { $_.BackupSummary.LastFullBackup } | 
            Sort-Object { $_.BackupSummary.LastFullBackup } -Descending | 
            Select-Object -First 1 -ExpandProperty BackupSummary | 
            Select-Object -ExpandProperty LastFullBackup
        
        $bestDiffBackup = $groupResults | Where-Object { $_.BackupSummary.LastDiffBackup } | 
            Sort-Object { $_.BackupSummary.LastDiffBackup } -Descending | 
            Select-Object -First 1 -ExpandProperty BackupSummary | 
            Select-Object -ExpandProperty LastDiffBackup
        
        $bestLogBackup = $groupResults | Where-Object { $_.BackupSummary.LastLogBackup } | 
            Sort-Object { $_.BackupSummary.LastLogBackup } -Descending | 
            Select-Object -First 1 -ExpandProperty BackupSummary | 
            Select-Object -ExpandProperty LastLogBackup
        
        # ===== APLICAR A TODOS LOS NODOS =====
        
        foreach ($node in $groupResults) {
            $changed = $false
            
            # Aplicar mantenimiento: Sincronizar valores y flags de TODOS los jobs
            if ($bestCheckdb -and $node.MaintenanceSummary.LastCheckdb -ne $bestCheckdb) {
                $node.MaintenanceSummary.LastCheckdb = $bestCheckdb
                $changed = $true
            }
            
            if ($node.MaintenanceSummary.CheckdbOk -ne $allCheckdbOk) {
                $node.MaintenanceSummary.CheckdbOk = $allCheckdbOk
                $changed = $true
            }
            
            if ($bestIndexOptimize -and $node.MaintenanceSummary.LastIndexOptimize -ne $bestIndexOptimize) {
                $node.MaintenanceSummary.LastIndexOptimize = $bestIndexOptimize
                $changed = $true
            }
            
            if ($node.MaintenanceSummary.IndexOptimizeOk -ne $allIndexOptimizeOk) {
                $node.MaintenanceSummary.IndexOptimizeOk = $allIndexOptimizeOk
                $changed = $true
            }
            
            # Sincronizar lista completa de jobs (para visibilidad en JSON)
            $node.MaintenanceSummary.CheckdbJobs = $allCheckdbJobs
            $node.MaintenanceSummary.IndexOptimizeJobs = $allIndexOptimizeJobs
            
            # Aplicar backups
            if ($bestFullBackup -and $node.BackupSummary.LastFullBackup -ne $bestFullBackup) {
                $node.BackupSummary.LastFullBackup = $bestFullBackup
                $changed = $true
            }
            
            if ($bestDiffBackup -and $node.BackupSummary.LastDiffBackup -ne $bestDiffBackup) {
                $node.BackupSummary.LastDiffBackup = $bestDiffBackup
                $changed = $true
            }
            
            if ($bestLogBackup -and $node.BackupSummary.LastLogBackup -ne $bestLogBackup) {
                $node.BackupSummary.LastLogBackup = $bestLogBackup
                $changed = $true
            }
            
            # Recalcular breaches de backups
            $newBreaches = @()
            
            if ($bestFullBackup -and $bestFullBackup -is [datetime]) {
                try {
                    $ageHours = ((Get-Date) - [datetime]$bestFullBackup).TotalHours
                    if ($ageHours -gt 25) {
                        $newBreaches += "FULL: $([int]$ageHours)h > 25h"
                    }
                } catch {
                    Write-Verbose "Error calculando antigüedad de FULL backup en sincronización: $_"
                }
            }
            
            if ($bestLogBackup -and $bestLogBackup -is [datetime]) {
                try {
                    $ageHours = ((Get-Date) - [datetime]$bestLogBackup).TotalHours
                    if ($ageHours -gt 2) {
                        $newBreaches += "LOG: $([int]$ageHours)h > 2h"
                    }
                } catch {
                    Write-Verbose "Error calculando antigüedad de LOG backup en sincronización: $_"
                }
            }
            
            $node.BackupSummary.Breaches = $newBreaches
            
            # Asegurar que AlwaysOn.Enabled = true
            if (-not $node.AlwaysOnSummary.Enabled) {
                $node.AlwaysOnSummary.Enabled = $true
                $changed = $true
            }
            
            # Recalcular HealthScore
            Calculate-HealthScore -InstanceData $node
            
            if ($changed) {
                $syncedCount++
                Write-Host "    [SYNC] $($node.InstanceName)" -ForegroundColor Green
            }
        }
    }
    
    Write-Host ""
    if ($syncedCount -gt 0) {
        Write-Host "  [OK] $syncedCount nodo(s) sincronizado(s)" -ForegroundColor Green
    } else {
        Write-Host "  [INFO] No se requirieron cambios" -ForegroundColor Gray
    }
    
    return $AllResults
}

#endregion

#region ===== FUNCIONES DE SALIDA =====

function Export-Results {
    param(
        [array]$Results,
        [string]$JsonPath,
        [string]$CsvPath
    )
    
    Write-Host ""
    Write-Host "[EXPORT] Guardando resultados..." -ForegroundColor Cyan
    
    # JSON completo
    $Results | ConvertTo-Json -Depth 10 | Out-File -FilePath $JsonPath -Encoding UTF8
    Write-Host "  [OK] JSON: $JsonPath" -ForegroundColor Green
    
    # CSV simplificado
    $csvData = $Results | Select-Object `
        InstanceName,
        Ambiente,
        HostingSite,
        Version,
        HealthStatus,
        HealthScore,
        ConnectLatencyMs,
        @{N='WorstFreePct';E={$_.DiskSummary.WorstFreePct}},
        @{N='BackupBreaches';E={$_.BackupSummary.Breaches.Count}},
        @{N='AlwaysOnIssues';E={$_.AlwaysOnSummary.Issues.Count}},
        @{N='Severity20Plus';E={$_.ErrorlogSummary.Severity20PlusCount}},
        GeneratedAtUtc
    
    $csvData | Export-Csv -Path $CsvPath -NoTypeInformation -Encoding UTF8
    Write-Host "  [OK] CSV: $CsvPath" -ForegroundColor Green
}

function Write-ToSql {
    param(
        [array]$Results,
        [string]$SqlServer,
        [string]$SqlDatabase
    )
    
    Write-Host ""
    Write-Host "[SQL] Escribiendo a base de datos..." -ForegroundColor Cyan
    
    foreach ($result in $Results) {
        try {
            # Escapar comillas y preparar valores
            $instanceName = $result.InstanceName -replace "'", "''"
            $ambiente = if ($result.Ambiente) { "N'$($result.Ambiente -replace "'", "''")'" } else { "NULL" }
            $hostingSite = if ($result.HostingSite) { "N'$($result.HostingSite -replace "'", "''")'" } else { "NULL" }
            $version = if ($result.Version) { "N'$($result.Version -replace "'", "''")'" } else { "NULL" }
            
            $maintenanceJson = ($result.MaintenanceSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            $backupJson = ($result.BackupSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            $diskJson = ($result.DiskSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            $resourceJson = ($result.ResourceSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            $alwaysOnJson = ($result.AlwaysOnSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            $errorlogJson = ($result.ErrorlogSummary | ConvertTo-Json -Compress -Depth 5) -replace "'", "''"
            
            $insertQuery = @"
INSERT INTO [$SqlDatabase].[dbo].[InstanceHealthSnapshot] 
(InstanceName, Ambiente, HostingSite, Version, ConnectSuccess, ConnectLatencyMs, 
 MaintenanceJson, BackupJson, DiskJson, ResourceJson, AlwaysOnJson, ErrorlogJson, 
 HealthScore, HealthStatus, GeneratedAtUtc)
VALUES 
(N'$instanceName', $ambiente, $hostingSite, $version, $($result.ConnectSuccess -as [int]), $($result.ConnectLatencyMs),
 N'$maintenanceJson', N'$backupJson', N'$diskJson', N'$resourceJson', N'$alwaysOnJson', N'$errorlogJson',
 $($result.HealthScore), '$($result.HealthStatus)', GETUTCDATE())
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $insertQuery `
                -ConnectionTimeout 30 `
                -QueryTimeout 30 `
                -TrustServerCertificate `
                -ErrorAction Stop
            
        } catch {
            Write-Warning "Error escribiendo $($result.InstanceName) a SQL: $_"
        }
    }
    
    Write-Host "  [OK] Registros insertados" -ForegroundColor Green
}

#endregion

#region ===== MAIN EXECUTION =====

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Health Score - SQL Server Instances v2.0" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[CONFIG] Modo de prueba: $TestMode" -ForegroundColor Yellow
Write-Host "[CONFIG] Escribir a SQL: $WriteToSql" -ForegroundColor Yellow
Write-Host "[CONFIG] Incluir AWS: $IncludeAWS" -ForegroundColor Yellow
Write-Host "[CONFIG] Solo AWS: $OnlyAWS" -ForegroundColor Yellow

# 1. Obtener instancias desde API
Write-Host ""
Write-Host "[STEP 1/5] Obteniendo instancias desde API..." -ForegroundColor Cyan
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $instances = Invoke-RestMethod -Uri $ApiUrl -Method Get -TimeoutSec 30 -ErrorAction Stop
    Write-Host "  [OK] $($instances.Count) instancia(s) obtenida(s)" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] No se pudo obtener instancias: $_" -ForegroundColor Red
    exit 1
}

# 2. Filtrar instancias
Write-Host ""
Write-Host "[STEP 2/5] Filtrando instancias..." -ForegroundColor Cyan

# Excluir DMZ
$instancesFiltered = $instances | Where-Object {
    $serverName = if ($_.NombreInstancia) { $_.NombreInstancia } else { $_.ServerName }
    $serverName -notmatch "DMZ"
}

# Filtrar por AWS
if ($OnlyAWS) {
    $instancesFiltered = $instancesFiltered | Where-Object { $_.hostingSite -eq "AWS" }
} elseif (-not $IncludeAWS) {
    $instancesFiltered = $instancesFiltered | Where-Object { $_.hostingSite -ne "AWS" }
}

# Modo de prueba: solo 5 instancias
if ($TestMode) {
    $instancesFiltered = $instancesFiltered | Select-Object -First 5
    Write-Host "  [TEST MODE] Procesando solo 5 instancias" -ForegroundColor Yellow
}

Write-Host "  [OK] $($instancesFiltered.Count) instancia(s) a procesar" -ForegroundColor Green

# 3. Pre-procesamiento: Identificar grupos AlwaysOn
$agInfo = Get-AlwaysOnGroups -Instances $instancesFiltered -TimeoutSec $TimeoutSec

# 4. Procesar cada instancia
Write-Host ""
Write-Host "[STEP 3/5] Procesando instancias..." -ForegroundColor Cyan

$allResults = @()
$progress = 0

foreach ($instance in $instancesFiltered) {
    $progress++
    $pct = [int](($progress / $instancesFiltered.Count) * 100)
    Write-Progress -Activity "Procesando instancias" -Status "$progress de $($instancesFiltered.Count)" -PercentComplete $pct
    
    $result = Get-InstanceHealth -Instance $instance -TimeoutSec $TimeoutSec
    
    # Calcular HealthScore inicial
    Calculate-HealthScore -InstanceData $result
    
    $allResults += $result
}

Write-Progress -Activity "Procesando instancias" -Completed

Write-Host "  [OK] $($allResults.Count) instancia(s) procesada(s)" -ForegroundColor Green

# 5. Post-procesamiento: Sincronizar AlwaysOn
$allResults = Sync-AlwaysOnData -AllResults $allResults -AGInfo $agInfo

# 6. Exportar resultados
Write-Host ""
Write-Host "[STEP 4/5] Exportando resultados..." -ForegroundColor Cyan
Export-Results -Results $allResults -JsonPath $OutJson -CsvPath $OutCsv

# 7. Escribir a SQL (opcional)
if ($WriteToSql) {
    Write-Host ""
    Write-Host "[STEP 5/5] Escribiendo a SQL..." -ForegroundColor Cyan
    Write-ToSql -Results $allResults -SqlServer $SqlServer -SqlDatabase $SqlDatabase
} else {
    Write-Host ""
    Write-Host "[STEP 5/5] SKIP - Escritura a SQL deshabilitada" -ForegroundColor Gray
}

# Resumen final
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " RESUMEN FINAL" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green

$healthyCount = ($allResults | Where-Object { $_.HealthStatus -eq "Healthy" }).Count
$warningCount = ($allResults | Where-Object { $_.HealthStatus -eq "Warning" }).Count
$criticalCount = ($allResults | Where-Object { $_.HealthStatus -eq "Critical" }).Count

Write-Host "  Healthy  : $healthyCount" -ForegroundColor Green
Write-Host "  Warning  : $warningCount" -ForegroundColor Yellow
Write-Host "  Critical : $criticalCount" -ForegroundColor Red
Write-Host ""
Write-Host "Completado exitosamente!" -ForegroundColor Green
Write-Host ""

#endregion
