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
-- TODOS los IntegrityCheck con su última ejecución REAL (todos los pasos OK)
WITH JobExecutions AS (
    -- Obtener todas las ejecuciones del job (step_id = 0 es el resumen)
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
           AND jh2.run_status <> 1) AS FailedSteps
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
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
        -- Un job es realmente exitoso si:
        -- 1. El job terminó exitoso (run_status = 1)
        -- 2. Todos los pasos fueron exitosos (FailedSteps = 0)
        -- 3. Se ejecutó al menos 1 paso
        CASE WHEN run_status = 1 
              AND FailedSteps = 0 
              AND TotalSteps >= 1
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM JobExecutions
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
        r.IsRealSuccess
    FROM RankedExecutions r
    LEFT JOIN msdb.dbo.sysjobservers js ON r.job_id = js.job_id
    WHERE r.rn = 1
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    -- Mantener el status original para mostrar, pero agregar IsRealSuccess para validación
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime,
    TotalSteps,
    SuccessfulSteps,
    FailedSteps,
    IsRealSuccess
FROM LastJobRuns;

-- ===SPLIT_INDEXOPTIMIZE===
-- TODOS los IndexOptimize con su última ejecución REAL (todos los pasos OK)
WITH JobExecutions AS (
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
           AND jh2.run_status <> 1) AS FailedSteps
    FROM msdb.dbo.sysjobs j
    INNER JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IndexOptimize%'
      AND j.name NOT LIKE '%STOP%'
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
        CASE WHEN run_status = 1 
              AND FailedSteps = 0 
              AND TotalSteps >= 1
             THEN 1 ELSE 0 END AS IsRealSuccess,
        ROW_NUMBER() OVER (PARTITION BY job_id ORDER BY FinishTime DESC) AS rn
    FROM JobExecutions
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
        r.IsRealSuccess
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
    IsRealSuccess
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
            # Usar LastFinishTime si está disponible, sino calcular desde LastRunDate + LastRunTime
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {}
            }
            
            if ($lastRun) {
                # Usar IsRealSuccess que valida que TODOS los pasos terminaron OK
                $isRealSuccess = if ($job.IsRealSuccess -ne $null -and $job.IsRealSuccess -ne [DBNull]::Value) { 
                    $job.IsRealSuccess -eq 1 
                } else { 
                    $job.LastRunStatus -eq 1 
                }
                $isRecent = ($lastRun -ge $cutoffDate -and $isRealSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
                
                # Info de pasos para diagnóstico
                $totalSteps = if ($job.TotalSteps -ne $null -and $job.TotalSteps -ne [DBNull]::Value) { $job.TotalSteps } else { 0 }
                $successfulSteps = if ($job.SuccessfulSteps -ne $null -and $job.SuccessfulSteps -ne [DBNull]::Value) { $job.SuccessfulSteps } else { 0 }
                $failedSteps = if ($job.FailedSteps -ne $null -and $job.FailedSteps -ne [DBNull]::Value) { $job.FailedSteps } else { 0 }
            
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isRealSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                    TotalSteps = $totalSteps
                    SuccessfulSteps = $successfulSteps
                    FailedSteps = $failedSteps
                    IsRealSuccess = $isRealSuccess
                }
                
                # Actualizar más reciente (solo si fue éxito real)
                if ($isRealSuccess -and (-not $mostRecentCheckdb -or $lastRun -gt $mostRecentCheckdb)) {
                    $mostRecentCheckdb = $lastRun
                }
                
                # Si alguno NO está OK (con validación de todos los pasos), marcar como no OK
                if (-not $isRecent) {
                    $allCheckdbOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente
                $result.CheckdbJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                    TotalSteps = 0
                    SuccessfulSteps = 0
                    FailedSteps = 0
                    IsRealSuccess = $false
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
            # Usar LastFinishTime si está disponible, sino calcular desde LastRunDate + LastRunTime
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
                try {
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                } catch {}
            }
            
            if ($lastRun) {
                # Usar IsRealSuccess que valida que TODOS los pasos terminaron OK
                $isRealSuccess = if ($job.IsRealSuccess -ne $null -and $job.IsRealSuccess -ne [DBNull]::Value) { 
                    $job.IsRealSuccess -eq 1 
                } else { 
                    $job.LastRunStatus -eq 1 
                }
                $isRecent = ($lastRun -ge $cutoffDate -and $isRealSuccess)
                $duration = if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) { $job.LastRunDuration } else { 0 }
                
                # Info de pasos para diagnóstico
                $totalSteps = if ($job.TotalSteps -ne $null -and $job.TotalSteps -ne [DBNull]::Value) { $job.TotalSteps } else { 0 }
                $successfulSteps = if ($job.SuccessfulSteps -ne $null -and $job.SuccessfulSteps -ne [DBNull]::Value) { $job.SuccessfulSteps } else { 0 }
                $failedSteps = if ($job.FailedSteps -ne $null -and $job.FailedSteps -ne [DBNull]::Value) { $job.FailedSteps } else { 0 }
            
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $lastRun
                    IsSuccess = $isRealSuccess
                    IsRecent = $isRecent
                    LastRunStatus = $job.LastRunStatus
                    Duration = $duration
                    TotalSteps = $totalSteps
                    SuccessfulSteps = $successfulSteps
                    FailedSteps = $failedSteps
                    IsRealSuccess = $isRealSuccess
                }
                
                # Actualizar más reciente (solo si fue éxito real)
                if ($isRealSuccess -and (-not $mostRecentIndexOpt -or $lastRun -gt $mostRecentIndexOpt)) {
                    $mostRecentIndexOpt = $lastRun
                }
                
                # Si alguno NO está OK (con validación de todos los pasos), marcar como no OK
                if (-not $isRecent) {
                    $allIndexOptOk = $false
                }
            } else {
                # Job existe pero no tiene historial reciente
                $result.IndexOptimizeJobs += @{
                    JobName = $job.JobName
                    LastRun = $null
                    IsSuccess = $false
                    IsRecent = $false
                    LastRunStatus = 999  # Indicador de "sin datos"
                    Duration = 0
                    TotalSteps = 0
                    SuccessfulSteps = 0
                    FailedSteps = 0
                    IsRealSuccess = $false
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
        
        # === ENCONTRAR EL MEJOR CHECKDB PARA EL AG ===
        # En un AG, el mantenimiento solo se ejecuta en el primario.
        # Lógica: Si ALGÚN nodo tiene un job exitoso reciente, el AG está OK.
        # Buscamos el job EXITOSO más reciente entre todos los nodos.
        $allCheckdbOk = $false  # Asumimos false hasta encontrar uno exitoso
        $bestCheckdb = $null
        $cutoffDate = (Get-Date).AddDays(-7)
        
        if ($allCheckdbJobs.Count -gt 0) {
            # Filtrar solo jobs exitosos
            $successfulCheckdbJobs = $allCheckdbJobs | Where-Object { $_.IsSuccess -eq $true }
            
            if ($successfulCheckdbJobs.Count -gt 0) {
                # Encontrar el más reciente EXITOSO
                $mostRecentSuccessful = $successfulCheckdbJobs | Sort-Object -Property LastRun -Descending | Select-Object -First 1
                
                if ($mostRecentSuccessful.LastRun -and $mostRecentSuccessful.LastRun -ge $cutoffDate) {
                    $allCheckdbOk = $true
                    $bestCheckdb = $mostRecentSuccessful.LastRun
                } else {
                    # El más reciente exitoso está vencido
                    $bestCheckdb = $mostRecentSuccessful.LastRun
                }
            }
            # Si no hay exitosos, bestCheckdb queda null y allCheckdbOk queda false
        }
        
        # === ENCONTRAR EL MEJOR INDEX OPTIMIZE PARA EL AG ===
        # Misma lógica: Si ALGÚN nodo tiene un job exitoso reciente, el AG está OK.
        $allIndexOptimizeOk = $false
        $bestIndexOptimize = $null
        
        if ($allIndexOptimizeJobs.Count -gt 0) {
            # Filtrar solo jobs exitosos
            $successfulIndexOptJobs = $allIndexOptimizeJobs | Where-Object { $_.IsSuccess -eq $true }
            
            if ($successfulIndexOptJobs.Count -gt 0) {
                # Encontrar el más reciente EXITOSO
                $mostRecentSuccessful = $successfulIndexOptJobs | Sort-Object -Property LastRun -Descending | Select-Object -First 1
                
                if ($mostRecentSuccessful.LastRun -and $mostRecentSuccessful.LastRun -ge $cutoffDate) {
                    $allIndexOptimizeOk = $true
                    $bestIndexOptimize = $mostRecentSuccessful.LastRun
                } else {
                    # El más reciente exitoso está vencido
                    $bestIndexOptimize = $mostRecentSuccessful.LastRun
                }
            }
            # Si no hay exitosos, bestIndexOptimize queda null y allIndexOptimizeOk queda false
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
    IndexOptimizeOk
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $lastCheckdb,
    $(if ($row.CheckdbOk) {1} else {0}),
    $lastIndexOpt,
    $(if ($row.IndexOptimizeOk) {1} else {0})
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
    
    Write-Host "   $status $instanceName - CHECKDB:$checkdbAge days IndexOpt:$indexOptAge days$extraInfo" -ForegroundColor $statusColor
    
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
