<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de MANTENIMIENTO
    
.DESCRIPTION
    Script de baja frecuencia (cada 1 hora) que recolecta:
    - CHECKDB status (basado en estado del job)
    - IndexOptimize status (basado en estado del job)
    - Errorlog severity 20+ (últimas 24 horas)
    
    Incluye sincronización AlwaysOn:
    - Identifica grupos AG automáticamente
    - Sincroniza CHECKDB/IndexOptimize entre nodos del mismo AG
    - Aplica el MEJOR valor a todos los nodos
    
    Guarda en: InstanceHealth_Maintenance
    
.NOTES
    Versión: 2.0 (dbatools) + AlwaysOn Sync
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
$TimeoutSec = 30
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

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
-- TODOS los IntegrityCheck con su última ejecución (excluir STOP)
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
        
        # Usar dbatools para ejecutar queries (devuelve array de 2 datasets)
        $datasets = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $cutoffDate = (Get-Date).AddDays(-7)
        
        # Procesar IntegrityCheck jobs (primer resultset)
        $checkdbJobs = if ($datasets -is [array] -and $datasets.Count -gt 0) { 
            $datasets[0] 
        } else { 
            $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' } 
        }
        $allCheckdbOk = $true
        $mostRecentCheckdb = $null
        
        foreach ($job in $checkdbJobs) {
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                # Usar tiempo de finalización calculado por SQL
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
                try {
                    # Fallback: calcular tiempo de inicio + duración
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                    
                    # Sumar duración si existe (formato HHMMSS)
                    if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) {
                        $duration = [int]$job.LastRunDuration
                        $hours = [Math]::Floor($duration / 10000)
                        $minutes = [Math]::Floor(($duration % 10000) / 100)
                        $seconds = $duration % 100
                        $lastRun = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
                    } else {
                        $lastRun = $startTime
                    }
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
        
        # Procesar IndexOptimize jobs (segundo resultset)
        $indexOptJobs = if ($datasets -is [array] -and $datasets.Count -gt 1) { 
            $datasets[1] 
        } else { 
            $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' } 
        }
        $allIndexOptOk = $true
        $mostRecentIndexOpt = $null
        
        foreach ($job in $indexOptJobs) {
            $lastRun = $null
            if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
                # Usar tiempo de finalización calculado por SQL
                $lastRun = [datetime]$job.LastFinishTime
            } elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
                try {
                    # Fallback: calcular tiempo de inicio + duración
                    $runDate = $job.LastRunDate.ToString()
                    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
                    $startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
                    
                    # Sumar duración si existe (formato HHMMSS)
                    if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) {
                        $duration = [int]$job.LastRunDuration
                        $hours = [Math]::Floor($duration / 10000)
                        $minutes = [Math]::Floor(($duration % 10000) / 100)
                        $seconds = $duration % 100
                        $lastRun = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
                    } else {
                        $lastRun = $startTime
                    }
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
        
        # === ENCONTRAR EL MEJOR CHECKDB (LÓGICA ORIGINAL) ===
        # Agrupar jobs por nombre para evaluar cada TIPO de job independientemente
        # Ejemplo: "IntegrityCheck-SYSTEM" y "IntegrityCheck-USER" se evalúan por separado
        $bestCheckdb = $null
        $checkdbOk = $true  # Asumimos OK, luego cambiamos si algún job no está OK
        $cutoffDate = (Get-Date).AddDays(-7)
        
        if ($allCheckdbJobs.Count -gt 0) {
            # Agrupar por nombre de job
            $checkdbByName = $allCheckdbJobs | Group-Object -Property JobName
            
            foreach ($jobGroup in $checkdbByName) {
                # Encontrar el más reciente de este TIPO de job
                # Ordenar por fecha DESC, luego por status (Succeeded > Failed > Canceled)
                $mostRecentJob = $jobGroup.Group | Sort-Object `
                    @{Expression={$_.LastRun}; Descending=$true}, `
                    @{Expression={
                        if ($_.IsSuccess -eq $true) { 0 }      # Succeeded - máxima prioridad
                        else { 1 }                              # Failed/otros - menor prioridad
                    }; Descending=$false} | Select-Object -First 1
                
                # Si el más reciente de este TIPO NO está OK, marcar grupo como no OK
                if (-not $mostRecentJob.LastRun -or $mostRecentJob.LastRun -lt $cutoffDate -or -not $mostRecentJob.IsSuccess) {
                    $checkdbOk = $false
                }
                
                # Actualizar el más reciente GLOBAL (de todos los tipos)
                if ($mostRecentJob.LastRun -and (-not $bestCheckdb -or $mostRecentJob.LastRun -gt $bestCheckdb)) {
                    $bestCheckdb = $mostRecentJob.LastRun
                }
            }
        } else {
            $checkdbOk = $false
        }
        
        # === ENCONTRAR EL MEJOR INDEX OPTIMIZE (LÓGICA ORIGINAL) ===
        $bestIndexOptimize = $null
        $indexOptimizeOk = $true  # Asumimos OK, luego cambiamos si algún job no está OK
        
        if ($allIndexOptimizeJobs.Count -gt 0) {
            # Agrupar por nombre de job
            $indexOptByName = $allIndexOptimizeJobs | Group-Object -Property JobName
            
            foreach ($jobGroup in $indexOptByName) {
                # Encontrar el más reciente de este TIPO de job
                $mostRecentJob = $jobGroup.Group | Sort-Object `
                    @{Expression={$_.LastRun}; Descending=$true}, `
                    @{Expression={
                        if ($_.IsSuccess -eq $true) { 0 }      # Succeeded - máxima prioridad
                        else { 1 }                              # Failed/otros - menor prioridad
                    }; Descending=$false} | Select-Object -First 1
                
                # Si el más reciente de este TIPO NO está OK, marcar grupo como no OK
                if (-not $mostRecentJob.LastRun -or $mostRecentJob.LastRun -lt $cutoffDate -or -not $mostRecentJob.IsSuccess) {
                    $indexOptimizeOk = $false
                }
                
                # Actualizar el más reciente GLOBAL
                if ($mostRecentJob.LastRun -and (-not $bestIndexOptimize -or $mostRecentJob.LastRun -gt $bestIndexOptimize)) {
                    $bestIndexOptimize = $mostRecentJob.LastRun
                }
            }
        } else {
            $indexOptimizeOk = $false
        }
        
        Write-Host "    🔄 Mejor CHECKDB: $bestCheckdb (OK: $checkdbOk)" -ForegroundColor Gray
        Write-Host "    🔄 Mejor IndexOptimize: $bestIndexOptimize (OK: $indexOptimizeOk)" -ForegroundColor Gray
        
        # === APLICAR LOS MEJORES VALORES A TODOS LOS NODOS ===
        foreach ($nodeResult in $groupResults) {
            $nodeResult.LastCheckdb = $bestCheckdb
            $nodeResult.CheckdbOk = $checkdbOk
            $nodeResult.LastIndexOptimize = $bestIndexOptimize
            $nodeResult.IndexOptimizeOk = $indexOptimizeOk
            
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
    IndexOptimizeOk,
    Severity20PlusCount,
    ErrorlogDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $lastCheckdb,
    $(if ($row.CheckdbOk) {1} else {0}),
    $lastIndexOpt,
    $(if ($row.IndexOptimizeOk) {1} else {0}),
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
    $maintenance = Get-MaintenanceJobs -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $errorlog = Get-ErrorlogStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    # Determinar estado (priorizar AMBOS fallidos como más crítico)
    $status = "✅"
    if (-not $maintenance.CheckdbOk -and -not $maintenance.IndexOptimizeOk) { 
        $status = "🚨 CRITICAL!" 
    }
    elseif (-not $maintenance.CheckdbOk) { 
        $status = "⚠️ NO CHECKDB!" 
    }
    elseif (-not $maintenance.IndexOptimizeOk) { 
        $status = "⚠️ NO INDEX OPT!" 
    }
    elseif ($errorlog.Severity20PlusCount -gt 0) { 
        $status = "🚨 ERRORS!" 
    }
    
    $checkdbAge = if ($maintenance.LastCheckdb) { ((Get-Date) - $maintenance.LastCheckdb).Days } else { "N/A" }
    $indexOptAge = if ($maintenance.LastIndexOptimize) { ((Get-Date) - $maintenance.LastIndexOptimize).Days } else { "N/A" }
    
    Write-Host "   $status $instanceName - CHECKDB:$checkdbAge days IndexOpt:$indexOptAge days Errors:$($errorlog.Severity20PlusCount)" -ForegroundColor Gray
    
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
        Severity20PlusCount = $errorlog.Severity20PlusCount
        ErrorlogDetails = $errorlog.Details
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
Write-Host "║  Con errores severity 20+: $(($results | Where-Object {$_.Severity20PlusCount -gt 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion
