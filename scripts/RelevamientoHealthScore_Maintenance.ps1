<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de MANTENIMIENTO
    
.DESCRIPTION
    Script de baja frecuencia (cada 1 hora) que recolecta:
    - CHECKDB status (basado en estado del job)
    - IndexOptimize status (basado en estado del job)
    
    Incluye sincronización AlwaysOn:
    - Identifica grupos AG automáticamente
    - Sincroniza CHECKDB/IndexOptimize entre nodos del mismo AG
    - Aplica el MEJOR valor a todos los nodos
    
    Guarda en: InstanceHealth_Maintenance
    
.NOTES
    Versión: 2.1 (dbatools con retry) + AlwaysOn Sync
    Frecuencia: Cada 1 hora
    Timeout: 30 segundos (60 segundos en retry para instancias lentas)
    
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

# Descargar SqlServer si está cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30           # Timeout inicial
$TimeoutSecRetry = 60      # Timeout para retry en caso de fallo
$TestMode = $false         # $true = solo 5 instancias para testing
$IncludeAWS = $false       # Cambiar a $true para incluir AWS
$OnlyAWS = $false          # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-MaintenanceJobs {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 30,
        [int]$RetryTimeoutSec = 60
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
        # Query para IntegrityCheck - Valida que TODOS los pasos del job estén OK
        # Un job solo se considera exitoso si:
        # 1. El step_id = 0 (resumen) está en status 1 (Succeeded)
        # 2. TODOS los pasos individuales (step_id > 0) de esa ejecución están en status 1
        # 3. Se ejecutó más de 1 paso (evita jobs que solo verifican rol primario y salen)
        $query = @"
-- TODOS los IntegrityCheck con su última ejecución
-- Incluye jobs SIN historial pero CON datos en sysjobservers
WITH JobsWithHistory AS (
    -- Jobs que tienen historial en sysjobhistory
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        -- Calcular tiempo de finalización
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        -- Contar total de pasos ejecutados en esta ejecución (excluyendo step 0)
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0) AS TotalSteps,
        -- Contar pasos exitosos en esta ejecución (excluyendo step 0)
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status = 1) AS SuccessfulSteps,
        -- Contar pasos fallidos en esta ejecución
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
),
JobsWithoutHistory AS (
    -- Jobs SIN historial pero CON datos en sysjobservers (última ejecución)
    -- Estos jobs participan igual que los demás en la selección del más reciente
    SELECT 
        j.job_id,
        j.name AS JobName,
        js.last_run_date AS run_date,
        js.last_run_time AS run_time,
        js.last_run_duration AS run_duration,
        js.last_run_outcome AS run_status,
        -- Calcular tiempo de finalización desde sysjobservers
        CASE WHEN js.last_run_date > 0 THEN
            DATEADD(SECOND, 
                (js.last_run_duration / 10000) * 3600 + ((js.last_run_duration / 100) % 100) * 60 + (js.last_run_duration % 100),
                CAST(CAST(js.last_run_date AS VARCHAR) + ' ' + 
                     STUFF(STUFF(RIGHT('000000' + CAST(js.last_run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                     AS DATETIME)
            )
        ELSE NULL END AS FinishTime,
        -- Sin historial detallado, asumimos TotalSteps = 2 para que participe normalmente
        -- El resultado (OK/FAIL) se determina por run_status, no por los pasos
        2 AS TotalSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 2 ELSE 0 END AS SuccessfulSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 0 ELSE 2 END AS FailedSteps,
        0 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
      AND js.last_run_date > 0  -- Tiene datos de última ejecución
      AND NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobhistory jh WHERE jh.job_id = j.job_id AND jh.step_id = 0)
),
AllJobExecutions AS (
    SELECT * FROM JobsWithHistory
    UNION ALL
    SELECT * FROM JobsWithoutHistory
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS HistoryRunDate,
        run_time AS HistoryRunTime,
        run_duration AS HistoryRunDuration,
        run_status AS HistoryRunStatus,
        FinishTime AS HistoryFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        -- Un job es realmente exitoso si:
        -- 1. El job terminó exitoso (run_status = 1)
        -- 2. Todos los pasos fueron exitosos (FailedSteps = 0)
        -- 3. Se ejecutó al menos 1 paso
        CASE WHEN run_status = 1 
              AND FailedSteps = 0 
              AND TotalSteps >= 1
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM AllJobExecutions
),
LastJobRuns AS (
    SELECT 
        r.job_id,
        r.JobName,
        r.HistoryRunDate,
        r.HistoryRunTime,
        r.HistoryRunDuration,
        r.HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        r.HistoryFinishTime,
        r.TotalSteps,
        r.SuccessfulSteps,
        r.FailedSteps,
        r.IsRealSuccess,
        r.HasHistory
    FROM RankedExecutions r
    LEFT JOIN msdb.dbo.sysjobservers js ON r.job_id = js.job_id
    WHERE r.rn = 1
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM LastJobRuns;

-- ===SPLIT_INDEXOPTIMIZE===
-- TODOS los IndexOptimize con su última ejecución
-- Incluye jobs SIN historial pero CON datos en sysjobservers
WITH JobsWithHistory AS (
    -- Jobs que tienen historial en sysjobhistory
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date,
        jh.run_time,
        jh.run_duration,
        jh.run_status,
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + ((jh.run_duration / 100) % 100) * 60 + (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS FinishTime,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0) AS TotalSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status = 1) AS SuccessfulSteps,
        (SELECT COUNT(*) 
         FROM msdb.dbo.sysjobhistory jh2 
         WHERE jh2.job_id = j.job_id 
           AND jh2.run_date = jh.run_date 
           AND jh2.step_id > 0 
           AND jh2.run_status <> 1) AS FailedSteps,
        1 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
),
JobsWithoutHistory AS (
    -- Jobs SIN historial pero CON datos en sysjobservers (última ejecución)
    -- Estos jobs participan igual que los demás en la selección del más reciente
    SELECT 
        j.job_id,
        j.name AS JobName,
        js.last_run_date AS run_date,
        js.last_run_time AS run_time,
        js.last_run_duration AS run_duration,
        js.last_run_outcome AS run_status,
        CASE WHEN js.last_run_date > 0 THEN
            DATEADD(SECOND, 
                (js.last_run_duration / 10000) * 3600 + ((js.last_run_duration / 100) % 100) * 60 + (js.last_run_duration % 100),
                CAST(CAST(js.last_run_date AS VARCHAR) + ' ' + 
                     STUFF(STUFF(RIGHT('000000' + CAST(js.last_run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                     AS DATETIME)
            )
        ELSE NULL END AS FinishTime,
        -- Sin historial detallado, asumimos TotalSteps = 2 para que participe normalmente
        -- El resultado (OK/FAIL) se determina por run_status, no por los pasos
        2 AS TotalSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 2 ELSE 0 END AS SuccessfulSteps,
        CASE WHEN js.last_run_outcome = 1 THEN 0 ELSE 2 END AS FailedSteps,
        0 AS HasHistory
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
      AND js.last_run_date > 0  -- Tiene datos de última ejecución
      AND NOT EXISTS (SELECT 1 FROM msdb.dbo.sysjobhistory jh WHERE jh.job_id = j.job_id AND jh.step_id = 0)
),
AllJobExecutions AS (
    SELECT * FROM JobsWithHistory
    UNION ALL
    SELECT * FROM JobsWithoutHistory
),
RankedExecutions AS (
    SELECT 
        job_id,
        JobName,
        run_date AS HistoryRunDate,
        run_time AS HistoryRunTime,
        run_duration AS HistoryRunDuration,
        run_status AS HistoryRunStatus,
        FinishTime AS HistoryFinishTime,
        TotalSteps,
        SuccessfulSteps,
        FailedSteps,
        HasHistory,
        CASE WHEN run_status = 1 
              AND FailedSteps = 0 
              AND TotalSteps >= 1
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM AllJobExecutions
),
LastJobRuns AS (
    SELECT 
        r.job_id,
        r.JobName,
        r.HistoryRunDate,
        r.HistoryRunTime,
        r.HistoryRunDuration,
        r.HistoryRunStatus,
        js.last_run_date AS ServerRunDate,
        js.last_run_time AS ServerRunTime,
        js.last_run_duration AS ServerRunDuration,
        js.last_run_outcome AS ServerRunOutcome,
        r.HistoryFinishTime,
        r.TotalSteps,
        r.SuccessfulSteps,
        r.FailedSteps,
        r.IsRealSuccess,
        r.HasHistory
    FROM RankedExecutions r
    LEFT JOIN msdb.dbo.sysjobservers js ON r.job_id = js.job_id
    WHERE r.rn = 1
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess,
    HasHistory
FROM LastJobRuns;
"@
        
        # dbatools NO devuelve múltiples resultsets correctamente, ejecutar queries por separado
        # Ejecutar query CHECKDB con retry
        $checkdbQuery = ($query -split '-- ===SPLIT_INDEXOPTIMIZE===')[0]
        $checkdbJobs = $null
        $attemptCount = 0
        $lastError = $null
        
        while ($attemptCount -lt 2 -and $checkdbJobs -eq $null) {
            $attemptCount++
            $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
            
            try {
                if ($attemptCount -eq 2) {
                    Write-Verbose "Reintentando CHECKDB en $InstanceName con timeout extendido de ${RetryTimeoutSec}s..."
                }
                
                $checkdbJobs = Invoke-DbaQuery -SqlInstance $InstanceName `
                    -Query $checkdbQuery `
                    -QueryTimeout $currentTimeout `
                    -EnableException
                    
                break
                
            } catch {
                $lastError = $_
                if ($attemptCount -eq 1) {
                    Write-Verbose "Timeout en CHECKDB $InstanceName (intento 1/${TimeoutSec}s), reintentando..."
                    Start-Sleep -Milliseconds 500
                } else {
                    # Segundo intento falló, capturar detalles
                    Write-Verbose "Error en CHECKDB: $($_.Exception.Message)"
                    if ($_.Exception.InnerException) {
                        Write-Verbose "Inner: $($_.Exception.InnerException.Message)"
                    }
                }
            }
        }
        
        if ($checkdbJobs -eq $null) {
            # Si la query falla (probablemente porque no hay jobs), asumir resultado vacío
            Write-Verbose "Query CHECKDB falló, asumiendo 0 jobs: $($lastError.Exception.Message)"
            $checkdbJobs = @()  # Array vacío en lugar de error
        }
        
        # Ejecutar query IndexOptimize con retry
        $indexOptQuery = ($query -split '-- ===SPLIT_INDEXOPTIMIZE===')[1]
        $indexOptJobs = $null
        $attemptCount = 0
        $lastError = $null
        
        while ($attemptCount -lt 2 -and $indexOptJobs -eq $null) {
            $attemptCount++
            $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
            
            try {
                if ($attemptCount -eq 2) {
                    Write-Verbose "Reintentando IndexOptimize en $InstanceName con timeout extendido de ${RetryTimeoutSec}s..."
                }
                
                $indexOptJobs = Invoke-DbaQuery -SqlInstance $InstanceName `
                    -Query $indexOptQuery `
                    -QueryTimeout $currentTimeout `
                    -EnableException
                    
                break
                
            } catch {
                $lastError = $_
                if ($attemptCount -eq 1) {
                    Write-Verbose "Timeout en IndexOptimize $InstanceName (intento 1/${TimeoutSec}s), reintentando..."
                    Start-Sleep -Milliseconds 500
                } else {
                    # Segundo intento falló, capturar detalles
                    Write-Verbose "Error en IndexOptimize: $($_.Exception.Message)"
                    if ($_.Exception.InnerException) {
                        Write-Verbose "Inner: $($_.Exception.InnerException.Message)"
                    }
                }
            }
        }
        
        if ($indexOptJobs -eq $null) {
            # Si la query falla (probablemente porque no hay jobs), asumir resultado vacío
            Write-Verbose "Query IndexOptimize falló, asumiendo 0 jobs: $($lastError.Exception.Message)"
            $indexOptJobs = @()  # Array vacío en lugar de error
        }
        
        $cutoffDate = (Get-Date).AddDays(-7)
        
        # Procesar IntegrityCheck jobs
        # Ahora usamos IsRealSuccess que valida que TODOS los pasos del job estén OK
        # y que se haya ejecutado mantenimiento real (no solo verificación de rol primario)
        $checkdbJobs = $checkdbJobs  # Ya viene filtrado
        $allCheckdbOk = $true
        $mostRecentCheckdb = $null
        
        foreach ($job in $checkdbJobs) {
            # Usar LastFinishTime si está disponible, sino calcular tiempo de FINALIZACIÓN desde LastRunDate + LastRunTime + Duration
            $finishTime = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $finishTime = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                    
                    # Calcular tiempo de FINALIZACIÓN: inicio + duración
                    $durationInt = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { [int]$job.LastRunDuration } else { 0 }
                    # Formato HHMMSS: horas = /10000, minutos = (/100)%100, segundos = %100
                    $hours = [math]::Floor($durationInt / 10000)
                    $minutes = [math]::Floor(($durationInt / 100) % 100)
                    $seconds = $durationInt % 100
                    $finishTime = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
                } catch {}
            }
            
            if ($finishTime) {
                # Usar IsRealSuccess que valida que TODOS los pasos terminaron OK
                $isRealSuccess = if ($job.IsRealSuccess -ne $null -and $job.IsRealSuccess -ne [DBNull]::Value) { 
                    $job.IsRealSuccess -eq 1 
                } else { 
                    $job.LastRunStatus -eq 1 
                }
                $isRecent = ($finishTime -ge $cutoffDate -and $isRealSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
                
                # Info de pasos para diagnóstico
                $totalSteps = if ($job.TotalSteps -ne $null -and $job.TotalSteps -ne [DBNull]::Value) { $job.TotalSteps } else { 0 }
                $successfulSteps = if ($job.SuccessfulSteps -ne $null -and $job.SuccessfulSteps -ne [DBNull]::Value) { $job.SuccessfulSteps } else { 0 }
                $failedSteps = if ($job.FailedSteps -ne $null -and $job.FailedSteps -ne [DBNull]::Value) { $job.FailedSteps } else { 0 }
                $hasHistory = if ($job.HasHistory -ne $null -and $job.HasHistory -ne [DBNull]::Value) { $job.HasHistory -eq 1 } else { $true }
            
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $finishTime
                    FinishTime = $finishTime  # Tiempo de FINALIZACIÓN (no inicio)
                    IsSuccess = $isRealSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                    TotalSteps = $totalSteps
                    SuccessfulSteps = $successfulSteps
                    FailedSteps = $failedSteps
                    IsRealSuccess = $isRealSuccess
                    HasHistory = $hasHistory
                }
                
                # Actualizar más reciente (solo si fue éxito real)
                if ($isRealSuccess -and (-not $mostRecentCheckdb -or $finishTime -gt $mostRecentCheckdb)) {
                    $mostRecentCheckdb = $finishTime
                }
                
                # Si alguno NO está OK (con validación de todos los pasos), marcar como no OK
                if (-not $isRecent) {
                    $allCheckdbOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente ni datos válidos
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    FinishTime = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                    TotalSteps = 0
                    SuccessfulSteps = 0
                    FailedSteps = 0
                    IsRealSuccess = $false
                    HasHistory = $false
                }
                $allCheckdbOk = $false
            }
        }
        
        if ($checkdbJobs.Count -gt 0) {
            $result.LastCheckdb = $mostRecentCheckdb
            $result.CheckdbOk = $allCheckdbOk
        }
        
        # Procesar IndexOptimize jobs (misma lógica con IsRealSuccess)
        $indexOptJobs = $indexOptJobs  # Ya viene filtrado
        $allIndexOptOk = $true
        $mostRecentIndexOpt = $null
        
        foreach ($job in $indexOptJobs) {
            # Usar LastFinishTime si está disponible, sino calcular tiempo de FINALIZACIÓN desde LastRunDate + LastRunTime + Duration
            $finishTime = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $finishTime = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                    
                    # Calcular tiempo de FINALIZACIÓN: inicio + duración
                    $durationInt = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { [int]$job.LastRunDuration } else { 0 }
                    # Formato HHMMSS: horas = /10000, minutos = (/100)%100, segundos = %100
                    $hours = [math]::Floor($durationInt / 10000)
                    $minutes = [math]::Floor(($durationInt / 100) % 100)
                    $seconds = $durationInt % 100
                    $finishTime = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
                } catch {}
            }
            
            if ($finishTime) {
                # Usar IsRealSuccess que valida que TODOS los pasos terminaron OK
                $isRealSuccess = if ($job.IsRealSuccess -ne $null -and $job.IsRealSuccess -ne [DBNull]::Value) { 
                    $job.IsRealSuccess -eq 1 
                } else { 
                    $job.LastRunStatus -eq 1 
                }
                $isRecent = ($finishTime -ge $cutoffDate -and $isRealSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
                
                # Info de pasos para diagnóstico
                $totalSteps = if ($job.TotalSteps -ne $null -and $job.TotalSteps -ne [DBNull]::Value) { $job.TotalSteps } else { 0 }
                $successfulSteps = if ($job.SuccessfulSteps -ne $null -and $job.SuccessfulSteps -ne [DBNull]::Value) { $job.SuccessfulSteps } else { 0 }
                $failedSteps = if ($job.FailedSteps -ne $null -and $job.FailedSteps -ne [DBNull]::Value) { $job.FailedSteps } else { 0 }
                $hasHistory = if ($job.HasHistory -ne $null -and $job.HasHistory -ne [DBNull]::Value) { $job.HasHistory -eq 1 } else { $true }
            
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $finishTime
                    FinishTime = $finishTime  # Tiempo de FINALIZACIÓN (no inicio)
                    IsSuccess = $isRealSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                    TotalSteps = $totalSteps
                    SuccessfulSteps = $successfulSteps
                    FailedSteps = $failedSteps
                    IsRealSuccess = $isRealSuccess
                    HasHistory = $hasHistory
                }
                
                # Actualizar más reciente (solo si fue éxito real)
                if ($isRealSuccess -and (-not $mostRecentIndexOpt -or $finishTime -gt $mostRecentIndexOpt)) {
                    $mostRecentIndexOpt = $finishTime
                }
                
                # Si alguno NO está OK (con validación de todos los pasos), marcar como no OK
                if (-not $isRecent) {
                    $allIndexOptOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente ni datos válidos
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    FinishTime = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                    TotalSteps = 0
                    SuccessfulSteps = 0
                    FailedSteps = 0
                    IsRealSuccess = $false
                    HasHistory = $false
                }
                $allIndexOptOk = $false
            }
        }
        
        if ($indexOptJobs.Count -gt 0) {
            $result.LastIndexOptimize = $mostRecentIndexOpt
            $result.IndexOptimizeOk = $allIndexOptOk
        }
        
    } catch {
        # Error en el procesamiento post-query (no en las queries mismas)
        $errorDetails = $_.Exception.Message
        Write-Warning "Error procesando maintenance jobs en ${InstanceName}: $errorDetails"
        Write-Verbose "  Línea: $($_.InvocationInfo.ScriptLineNumber)"
    }
    
    return $result
}


function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
        # Usar dbatools para test de conexión (comando simple sin parámetros de certificado)
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
        return $connection.IsPingable
    } catch {
        return $false
    }
}

function Get-AlwaysOnGroups {
    <#
    .SYNOPSIS
        Identifica grupos de AlwaysOn consultando sys.availability_replicas.
    .DESCRIPTION
        Pre-procesa las instancias para identificar qué nodos pertenecen al mismo AG.
        Solo procesa instancias donde la API indica AlwaysOn = "Enabled".
    #>
    param(
        [Parameter(Mandatory)]
        [array]$Instances,
        [int]$TimeoutSec = 10
    )
    
    $agGroups = @{}  # Key = AGName, Value = @{ Nodes = @() }
    $nodeToGroup = @{}  # Key = NodeName, Value = AGName
    
    Write-Host ""
    Write-Host "🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn..." -ForegroundColor Cyan
    
    foreach ($instance in $Instances) {
        $instanceName = $instance.NombreInstancia
        
        # Solo procesar si la API indica que AlwaysOn está habilitado
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
            
            $replicas = Invoke-DbaQuery -SqlInstance $instanceName `
                -Query $query `
                -QueryTimeout $TimeoutSec `
                -EnableException
            
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
        Write-Host "  ✅ $($agGroups.Count) grupo(s) identificado(s):" -ForegroundColor Green
        foreach ($agName in $agGroups.Keys) {
            $nodes = $agGroups[$agName].Nodes -join ", "
            Write-Host "    • $agName : $nodes" -ForegroundColor Gray
        }
    } else {
        Write-Host "  ℹ️  No se encontraron grupos AlwaysOn" -ForegroundColor Gray
    }
    
    return @{
        Groups = $agGroups
        NodeToGroup = $nodeToGroup
    }
}

function Sync-AlwaysOnMaintenance {
    <#
    .SYNOPSIS
        Sincroniza datos de mantenimiento entre nodos de AlwaysOn.
    .DESCRIPTION
        Recopila TODOS los jobs de TODOS los nodos del grupo.
        Para cada TIPO de job (IntegrityCheck, IndexOptimize), toma el ÚLTIMO run exitoso.
        Aplica ese valor a TODOS los nodos del grupo.
    #>
    param(
        [Parameter(Mandatory)]
        [array]$AllResults,
        [Parameter(Mandatory)]
        [hashtable]$AGInfo
    )
    
    Write-Host ""
    Write-Host "🔄 [POST-PROCESO] Sincronizando mantenimiento entre nodos AlwaysOn..." -ForegroundColor Cyan
    
    $agGroups = $AGInfo.Groups
    $syncedCount = 0
    
    foreach ($agName in $agGroups.Keys) {
        $agGroup = $agGroups[$agName]
        $nodeNames = $agGroup.Nodes
        
        Write-Host "  🔧 Procesando AG: $agName" -ForegroundColor Yellow
        Write-Host "    Nodos: $($nodeNames -join ', ')" -ForegroundColor Gray
        
        # Obtener resultados de todos los nodos del grupo
        $groupResults = $AllResults | Where-Object { $nodeNames -contains $_.InstanceName }
        
        if ($groupResults.Count -eq 0) {
            Write-Host "    ⚠️  Sin resultados para este grupo" -ForegroundColor Gray
            continue
        }
        
        # === RECOPILAR TODOS LOS JOBS DE TODOS LOS NODOS ===
        $allCheckdbJobs = @()
        $allIndexOptimizeJobs = @()
        
        foreach ($nodeResult in $groupResults) {
            $allCheckdbJobs += $nodeResult.CheckdbJobs
            $allIndexOptimizeJobs += $nodeResult.IndexOptimizeJobs
        }
        
        # === ENCONTRAR EL RESULTADO REAL DE CHECKDB PARA EL AG ===
        # En un AG, el mantenimiento solo se ejecuta en el primario.
        # Lógica: 
        #   1. Filtrar jobs que ejecutaron TODOS los pasos (TotalSteps > 1)
        #      - Jobs con TotalSteps = 1 solo verificaron rol primario y salieron
        #   2. De esos, tomar el que tenga FINISH TIME MÁS RECIENTE (sin importar si fue exitoso o fallido)
        #   3. Ese es el resultado REAL del AG
        $allCheckdbOk = $false
        $bestCheckdb = $null
        $cutoffDate = (Get-Date).AddDays(-7)
        
        if ($allCheckdbJobs.Count -gt 0) {
            # Filtrar jobs que ejecutaron más de 1 paso (mantenimiento real, no solo verificación de rol)
            $realCheckdbJobs = $allCheckdbJobs | Where-Object { $_.TotalSteps -gt 1 }
            
            if ($realCheckdbJobs.Count -gt 0) {
                # Tomar el que tenga FINISH TIME más reciente (sin importar si fue exitoso o fallido)
                $mostRecentReal = $realCheckdbJobs | Sort-Object -Property FinishTime -Descending | Select-Object -First 1
                
                $bestCheckdb = $mostRecentReal.FinishTime
                # El AG está OK si el más reciente que ejecutó todos los pasos fue exitoso Y está dentro de 7 días
                $allCheckdbOk = ($mostRecentReal.IsSuccess -eq $true) -and ($mostRecentReal.FinishTime -ge $cutoffDate)
            }
            # Si no hay jobs con mantenimiento real, buscar en todos (fallback)
            else {
                $mostRecent = $allCheckdbJobs | Sort-Object -Property FinishTime -Descending | Select-Object -First 1
                if ($mostRecent.FinishTime) {
                    $bestCheckdb = $mostRecent.FinishTime
                    $allCheckdbOk = ($mostRecent.IsSuccess -eq $true) -and ($mostRecent.FinishTime -ge $cutoffDate)
                }
            }
        }
        
        # === ENCONTRAR EL RESULTADO REAL DE INDEX OPTIMIZE PARA EL AG ===
        # Misma lógica: jobs con TotalSteps > 1 son los que ejecutaron mantenimiento real
        # Ordenar por FINISH TIME (tiempo de finalización), no tiempo de inicio
        $allIndexOptimizeOk = $false
        $bestIndexOptimize = $null
        
        if ($allIndexOptimizeJobs.Count -gt 0) {
            # Filtrar jobs que ejecutaron más de 1 paso (mantenimiento real)
            $realIndexOptJobs = $allIndexOptimizeJobs | Where-Object { $_.TotalSteps -gt 1 }
            
            if ($realIndexOptJobs.Count -gt 0) {
                # Tomar el que tenga FINISH TIME más reciente (sin importar si fue exitoso o fallido)
                $mostRecentReal = $realIndexOptJobs | Sort-Object -Property FinishTime -Descending | Select-Object -First 1
                
                $bestIndexOptimize = $mostRecentReal.FinishTime
                # El AG está OK si el más reciente que ejecutó todos los pasos fue exitoso Y está dentro de 7 días
                $allIndexOptimizeOk = ($mostRecentReal.IsSuccess -eq $true) -and ($mostRecentReal.FinishTime -ge $cutoffDate)
            }
            # Fallback si no hay jobs con mantenimiento real
            else {
                $mostRecent = $allIndexOptimizeJobs | Sort-Object -Property FinishTime -Descending | Select-Object -First 1
                if ($mostRecent.FinishTime) {
                    $bestIndexOptimize = $mostRecent.FinishTime
                    $allIndexOptimizeOk = ($mostRecent.IsSuccess -eq $true) -and ($mostRecent.FinishTime -ge $cutoffDate)
                }
            }
        }
        
        Write-Host "    🔄 Mejor CHECKDB: $bestCheckdb (OK: $allCheckdbOk)" -ForegroundColor Gray
        Write-Host "    🔄 Mejor IndexOptimize: $bestIndexOptimize (OK: $allIndexOptimizeOk)" -ForegroundColor Gray
        
        # === APLICAR LOS MEJORES VALORES A TODOS LOS NODOS ===
        foreach ($nodeResult in $groupResults) {
            $nodeResult.LastCheckdb = $bestCheckdb
            $nodeResult.CheckdbOk = $allCheckdbOk
            $nodeResult.LastIndexOptimize = $bestIndexOptimize
            $nodeResult.IndexOptimizeOk = $allIndexOptimizeOk
            
            $syncedCount++
        }
        
        Write-Host "    ✅ Sincronizados $($groupResults.Count) nodos" -ForegroundColor Green
    }
    
    Write-Host "  ✅ Total: $syncedCount nodos sincronizados" -ForegroundColor Green
    
    return $AllResults
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
            $agName = if ($row.AGName) { "'$($row.AGName)'" } else { "NULL" }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Maintenance (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    AGName
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $lastCheckdb,
    $(if ($row.CheckdbOk) {1} else {0}),
    $lastIndexOpt,
    $(if ($row.IndexOptimizeOk) {1} else {0}),
    $agName
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
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # Excluir instancias con DMZ en el nombre
    $instances = $instances | Where-Object { $_.NombreInstancia -notlike "*DMZ*" }
    
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Instancias a procesar: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Pre-procesamiento: Identificar grupos AlwaysOn
$agInfo = Get-AlwaysOnGroups -Instances $instances -TimeoutSec $TimeoutSec

# 3. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de mantenimiento..." -ForegroundColor Yellow
Write-Host "   (Esto puede tardar varios minutos...)" -ForegroundColor Gray

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    # La propiedad correcta es NombreInstancia (con mayúscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Capturar metadata de la instancia desde API
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar métricas
    $maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
    
    # Determinar estado (priorizar AMBOS fallidos como más crítico)
    $status = "✅"
    $statusColor = "Gray"
    $extraInfo = ""
    
    if (-not $maintenance.CheckdbOk -and -not $maintenance.IndexOptimizeOk) { 
        $status = "🚨 CRITICAL!" 
        $statusColor = "Red"
    }
    elseif (-not $maintenance.CheckdbOk) { 
        $status = "⚠️ NO CHECKDB!" 
        $statusColor = "Yellow"
    }
    elseif (-not $maintenance.IndexOptimizeOk) { 
        $status = "⚠️ NO INDEX OPT!" 
        $statusColor = "Yellow"
    }
    
    # Detectar si hay pasos fallidos
    $checkdbFailedSteps = ($maintenance.CheckdbJobs | Where-Object { $_.FailedSteps -gt 0 }).Count
    $indexOptFailedSteps = ($maintenance.IndexOptimizeJobs | Where-Object { $_.FailedSteps -gt 0 }).Count
    
    if ($checkdbFailedSteps -gt 0 -or $indexOptFailedSteps -gt 0) {
        $extraInfo = " [Pasos fallidos detectados]"
    }
    
    $checkdbAge = if ($maintenance.LastCheckdb) { ((Get-Date) - $maintenance.LastCheckdb).Days } else { "N/A" }
    $indexOptAge = if ($maintenance.LastIndexOptimize) { ((Get-Date) - $maintenance.LastIndexOptimize).Days } else { "N/A" }
    
    # Obtener nombre del AG si la instancia pertenece a uno
    $agName = $agInfo.NodeToGroup[$instanceName]
    $agDisplay = if ($agName) { " [AG: $agName]" } else { "" }
    
    Write-Host "   $status $instanceName$agDisplay - CHECKDB:$checkdbAge days IndexOpt:$indexOptAge days$extraInfo" -ForegroundColor $statusColor
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        LastCheckdb = $maintenance.LastCheckdb
        CheckdbOk = $maintenance.CheckdbOk
        LastIndexOptimize = $maintenance.LastIndexOptimize
        IndexOptimizeOk = $maintenance.IndexOptimizeOk
        CheckdbJobs = $maintenance.CheckdbJobs  # Para sincronización AlwaysOn
        IndexOptimizeJobs = $maintenance.IndexOptimizeJobs  # Para sincronización AlwaysOn
        AGName = $agName  # Nombre del AG (null si no pertenece a ninguno)
    }
}

Write-Progress -Activity "Recolectando métricas" -Completed

# 4. Post-procesamiento: Sincronizar mantenimiento de AlwaysOn
$results = Sync-AlwaysOnMaintenance -AllResults $results -AGInfo $agInfo

# 5. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - MAINTENANCE                                ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:         $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  CHECKDB OK:               $(($results | Where-Object CheckdbOk).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  IndexOptimize OK:         $(($results | Where-Object IndexOptimizeOk).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion
