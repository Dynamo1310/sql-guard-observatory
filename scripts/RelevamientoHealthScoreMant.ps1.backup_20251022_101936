<#
    RelevamientoHealthScoreMant.ps1
    - Consulta la API de inventario
    - Por cada instancia, calcula un HealthScore (0-100) basado en métricas de salud
    - Guarda resultados en JSON, CSV y opcionalmente en tabla SQL
    
    Métricas evaluadas:
    - Availability (30%): Conectividad y latencia
    - Jobs & Backups (25%): Recencia de backups y maintenance jobs
    - Disks & Resources (20%): Espacio en disco, CPU, memoria
    - AlwaysOn (15%): Estado de sincronización (si aplica)
    - Errorlog (10%): Errores críticos últimas 24h
#>

# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InstanceHealthSnapshot"
$TimeoutSec  = 10

# Archivos de salida
$OutJson     = ".\InstanceHealth.json"
$OutCsv      = ".\InstanceHealth.csv"

# Procesamiento paralelo
$UseParallel = $false  # ⚠️ Cambiar a $true para procesamiento paralelo (experimental)
$Throttle    = 8       # Número de threads paralelos (si UseParallel = $true)
                       # NOTA: El modo paralelo tiene limitaciones técnicas en PowerShell 7+
                       # Se recomienda usar modo secuencial para mayor estabilidad

# Escritura a SQL
$WriteToSql  = $false  # Cambiar a $true para guardar en base de datos SQL

# ========= MODO DE PRUEBA =========
$TestMode = $false  # Cambiar a $true para pruebas rápidas
$TestLimit = 5      # Número máximo de instancias a procesar en modo prueba

# ========= FILTROS DE INSTANCIAS =========
$IncludeAWS = $true   # Cambiar a $false para excluir instancias AWS
$OnlyAWS = $false     # Cambiar a $true para procesar SOLO instancias AWS

# Credenciales SQL (null = usa Windows Authentication)
$SqlCredential = $null

# ========= INICIALIZACIÓN =========

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Verificar PowerShell 7+
if ($PSVersionTable.PSVersion.Major -lt 7) {
    Write-Error "Este script requiere PowerShell 7 o superior. Versión actual: $($PSVersionTable.PSVersion)"
    exit 1
}

# TLS 1.2+
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ========= CONFIGURACIÓN MODO DE PRUEBA =========

if ($TestMode) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║                                        ║" -ForegroundColor Yellow
    Write-Host "║     🧪 MODO DE PRUEBA ACTIVADO 🧪     ║" -ForegroundColor Yellow
    Write-Host "║                                        ║" -ForegroundColor Yellow
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
    
    # Aplicar configuración de prueba
    if ($TestLimit -eq 0) {
        $TestLimit = 5
        Write-Host "  → Límite de instancias: $TestLimit" -ForegroundColor Cyan
    }
    
    # NO escribir a SQL en modo test (a menos que se especifique explícitamente con -WriteToSql)
    if (-not $PSBoundParameters.ContainsKey('WriteToSql')) {
        $WriteToSql = $false
        Write-Host "  → Escritura a SQL: DESHABILITADA (usar -WriteToSql para forzar)" -ForegroundColor Cyan
    }
    
    Write-Host "  → Salida detallada: HABILITADA" -ForegroundColor Cyan
    Write-Host "  → Archivos JSON/CSV: HABILITADOS" -ForegroundColor Cyan
    Write-Host ""
}

# Verificar e instalar módulo SqlServer si es necesario
if (-not (Get-Module -ListAvailable -Name SqlServer)) {
    Write-Host "Módulo SqlServer no encontrado. Instalando..." -ForegroundColor Yellow
    try {
        Install-Module SqlServer -Scope CurrentUser -Force -AllowClobber -SkipPublisherCheck | Out-Null
        Write-Host "[OK] Módulo SqlServer instalado" -ForegroundColor Green
    } catch {
        Write-Error "Error instalando SqlServer: $($_.Exception.Message)"
        exit 1
    }
}

Import-Module SqlServer -ErrorAction Stop

# ========= FUNCIONES DE MÉTRICAS =========

function Test-SqlAvailability {
    <#
    .SYNOPSIS
        Prueba la disponibilidad de una instancia SQL y mide la latencia.
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec,
        [pscredential]$Credential
    )
    
    $result = @{
        Success = $false
        LatencyMs = $null
        ErrorMessage = $null
    }
    
    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        
        $params = @{
            ServerInstance = $InstanceName
            Query = "SELECT @@SERVERNAME AS ServerName"
            ConnectionTimeout = $TimeoutSec
            QueryTimeout = $TimeoutSec
            TrustServerCertificate = $true
            ErrorAction = "Stop"
        }
        
        if ($Credential) {
            $params.Username = $Credential.UserName
            $params.Password = $Credential.GetNetworkCredential().Password
        }
        
        $response = Invoke-Sqlcmd @params
        $stopwatch.Stop()
        
        $result.Success = $true
        $result.LatencyMs = [int]$stopwatch.ElapsedMilliseconds
        
    } catch {
        $result.Success = $false
        $result.ErrorMessage = $_.Exception.Message
    }
    
    return $result
}

function Get-ErrorlogSummary {
    <#
    .SYNOPSIS
        Obtiene resumen de errores críticos del errorlog (últimas 24h).
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec,
        [pscredential]$Credential
    )
    
    $result = @{
        Severity20PlusCount = 0
        Skipped = $false
        ErrorMessage = $null
    }
    
    try {
        $query = @"
DECLARE @TimeAgo DATETIME = DATEADD(HOUR, -24, GETDATE());
CREATE TABLE #ErrorLog (
    LogDate DATETIME,
    ProcessInfo NVARCHAR(50),
    [Text] NVARCHAR(MAX)
);

BEGIN TRY
    INSERT INTO #ErrorLog
    EXEC xp_readerrorlog 0, 1, N'Severity: 2', NULL, @TimeAgo;
END TRY
BEGIN CATCH
    -- Si no tiene permisos, no falla
END CATCH;

SELECT COUNT(*) AS ErrorCount FROM #ErrorLog;
DROP TABLE #ErrorLog;
"@
        
        $params = @{
            ServerInstance = $InstanceName
            Query = $query
            ConnectionTimeout = $TimeoutSec
            QueryTimeout = $TimeoutSec
            TrustServerCertificate = $true
            ErrorAction = "Stop"
        }
        
        if ($Credential) {
            $params.Username = $Credential.UserName
            $params.Password = $Credential.GetNetworkCredential().Password
        }
        
        $response = Invoke-Sqlcmd @params
        $result.Severity20PlusCount = [int]$response.ErrorCount
        
    } catch {
        # Si falla, probablemente sea por permisos
        $result.Skipped = $true
        $result.ErrorMessage = $_.Exception.Message
    }
    
    return $result
}

function Get-JobAndBackupStatus {
    <#
    .SYNOPSIS
        Obtiene estado de jobs de mantenimiento y backups.
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec,
        [pscredential]$Credential,
        [array]$ReplicaServers = @()  # Lista pre-calculada de nodos del AG
    )
    
    $result = @{
        CheckdbOk = $false
        IndexOptimizeOk = $false
        LastCheckdb = $null
        LastIndexOptimize = $null
        BackupBreaches = @()
        LastFullBackup = $null
        LastDiffBackup = $null
        LastLogBackup = $null
        BackupSummary = @{}
    }
    
    try {
        # Verificar jobs de mantenimiento (SOLO EXITOSOS)
        $jobQuery = @"
SELECT 
    j.name AS JobName,
    MAX(jh.run_date) AS LastRunDate,
    MAX(jh.run_time) AS LastRunTime
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh 
    ON j.job_id = jh.job_id 
    AND jh.step_id = 0 
    AND jh.run_status = 1  -- SOLO EXITOSOS
WHERE j.enabled = 1
  AND (j.name LIKE '%IntegrityCheck%' OR j.name LIKE '%IndexOptimize%')
GROUP BY j.name
"@
        
        $params = @{
            ServerInstance = $InstanceName
            Query = $jobQuery
            ConnectionTimeout = $TimeoutSec
            QueryTimeout = $TimeoutSec
            TrustServerCertificate = $true
            ErrorAction = "Stop"
        }
        
        if ($Credential) {
            $params.Username = $Credential.UserName
            $params.Password = $Credential.GetNetworkCredential().Password
        }
        
        $jobs = Invoke-Sqlcmd @params
        
        # Procesar jobs locales
        foreach ($job in $jobs) {
            if ($job.JobName -like '*IntegrityCheck*' -and $job.LastRunDate) {
                $lastRun = [datetime]::ParseExact($job.LastRunDate.ToString(), "yyyyMMdd", $null)
                # Si ya hay un LastCheckdb, tomar el más reciente
                if ($null -eq $result.LastCheckdb -or $lastRun -gt $result.LastCheckdb) {
                    $result.LastCheckdb = $lastRun
                    $result.CheckdbOk = ($lastRun -gt (Get-Date).AddDays(-7))
                }
            }
            if ($job.JobName -like '*IndexOptimize*' -and $job.LastRunDate) {
                $lastRun = [datetime]::ParseExact($job.LastRunDate.ToString(), "yyyyMMdd", $null)
                # Si ya hay un LastIndexOptimize, tomar el más reciente
                if ($null -eq $result.LastIndexOptimize -or $lastRun -gt $result.LastIndexOptimize) {
                    $result.LastIndexOptimize = $lastRun
                    $result.IndexOptimizeOk = ($lastRun -gt (Get-Date).AddDays(-7))
                }
            }
        }
        
        # Si hay réplicas pre-calculadas, consultar jobs en ellas
        if ($ReplicaServers.Count -gt 0) {
            Write-Verbose "Consultando jobs en $($ReplicaServers.Count) réplica(s) del AG..."
            
            foreach ($replicaServer in $ReplicaServers) {
                # Skip el nodo local (ya lo consultamos arriba)
                if ($replicaServer -eq $InstanceName) {
                    continue
                }
                try {
                    $params.ServerInstance = $replicaServer
                    $params.Query = $jobQuery
                    $replicaJobs = Invoke-Sqlcmd @params
                    
                    foreach ($job in $replicaJobs) {
                        # CHECKDB: Tomar el más reciente entre todos los nodos
                        if ($job.JobName -like '*IntegrityCheck*' -and $job.LastRunDate) {
                            $lastRun = [datetime]::ParseExact($job.LastRunDate.ToString(), "yyyyMMdd", $null)
                            if ($null -eq $result.LastCheckdb -or $lastRun -gt $result.LastCheckdb) {
                                $result.LastCheckdb = $lastRun
                                $result.CheckdbOk = ($lastRun -gt (Get-Date).AddDays(-7))
                            }
                        }
                        
                        # IndexOptimize: Tomar el más reciente entre todos los nodos
                        if ($job.JobName -like '*IndexOptimize*' -and $job.LastRunDate) {
                            $lastRun = [datetime]::ParseExact($job.LastRunDate.ToString(), "yyyyMMdd", $null)
                            if ($null -eq $result.LastIndexOptimize -or $lastRun -gt $result.LastIndexOptimize) {
                                $result.LastIndexOptimize = $lastRun
                                $result.IndexOptimizeOk = ($lastRun -gt (Get-Date).AddDays(-7))
                            }
                        }
                    }
                } catch {
                    # Si falla la conexión a una réplica, continuar sin sobrescribir valores existentes
                    Write-Verbose "No se pudo conectar a réplica $replicaServer : $($_.Exception.Message)"
                }
            }
            
            # Restaurar ServerInstance original
            $params.ServerInstance = $InstanceName
        }
        
        # Verificar backups (compatible con SQL 2008 R2+)
        $backupQuery = @"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    (SELECT TOP 1 backup_finish_date 
     FROM msdb.dbo.backupset 
     WHERE database_name = d.name AND type = 'D' 
     ORDER BY backup_finish_date DESC) AS LastFullBackup,
    (SELECT TOP 1 backup_finish_date 
     FROM msdb.dbo.backupset 
     WHERE database_name = d.name AND type = 'I' 
     ORDER BY backup_finish_date DESC) AS LastDiffBackup,
    (SELECT TOP 1 backup_finish_date 
     FROM msdb.dbo.backupset 
     WHERE database_name = d.name AND type = 'L' 
     ORDER BY backup_finish_date DESC) AS LastLogBackup
FROM sys.databases d
WHERE d.database_id > 4  -- Excluir bases de sistema
  AND d.state = 0         -- Solo ONLINE
  AND d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
"@
        
        $params.Query = $backupQuery
        $backups = Invoke-Sqlcmd @params
        
        Write-Verbose "Consultando backups en $InstanceName : $($backups.Count) base(s) encontrada(s)"
        
        $now = Get-Date
        
        # Inicializar tracking de backups más recientes
        $mostRecentFull = $null
        $mostRecentDiff = $null
        $mostRecentLog = $null
        
        # Recolectar los backups más recientes (sin reportar breaches aún)
        $basesConBackupFull = 0
        $basesConBackupLog = 0
        
        foreach ($db in $backups) {
            $dbName = $db.DatabaseName
            
            # FULL backup
            if ($db.LastFullBackup) {
                $fullDate = [datetime]$db.LastFullBackup
                $basesConBackupFull++
                
                Write-Verbose "  Base $dbName : FULL backup = $fullDate"
                
                # Actualizar el más reciente
                if ($null -eq $mostRecentFull -or $fullDate -gt $mostRecentFull) {
                    $mostRecentFull = $fullDate
                }
            } else {
                Write-Verbose "  Base $dbName : Sin FULL backup"
            }
            
            # DIFF backup
            if ($db.LastDiffBackup) {
                $diffDate = [datetime]$db.LastDiffBackup
                if ($null -eq $mostRecentDiff -or $diffDate -gt $mostRecentDiff) {
                    $mostRecentDiff = $diffDate
                }
            }
            
            # LOG backup (solo para FULL/BULK_LOGGED)
            if ($db.RecoveryModel -in @('FULL', 'BULK_LOGGED')) {
                if ($db.LastLogBackup) {
                    $logDate = [datetime]$db.LastLogBackup
                    $basesConBackupLog++
                    
                    Write-Verbose "  Base $dbName : LOG backup = $logDate"
                    
                    # Actualizar el más reciente
                    if ($null -eq $mostRecentLog -or $logDate -gt $mostRecentLog) {
                        $mostRecentLog = $logDate
                    }
                } else {
                    Write-Verbose "  Base $dbName : Sin LOG backup"
                }
            }
        }
        
        # Guardar los backups más recientes (local)
        $result.LastFullBackup = $mostRecentFull
        $result.LastDiffBackup = $mostRecentDiff
        $result.LastLogBackup = $mostRecentLog
        
        Write-Verbose "Backups finales en $InstanceName : FULL=$mostRecentFull, LOG=$mostRecentLog"
        
    } catch {
        $result.ErrorMessage = $_.Exception.Message
    }
    
    # Si hay réplicas, consultar backups en otros nodos del AG
    # (los backups se toman en UN SOLO nodo, así que debemos buscar el más reciente entre todos)
    if ($ReplicaServers.Count -gt 0) {
        Write-Verbose "Consultando backups en réplicas del AG..."
        
        foreach ($replicaServer in $ReplicaServers) {
            # Skip el nodo local (ya lo consultamos arriba)
            if ($replicaServer -eq $InstanceName) {
                continue
            }
            try {
                $replicaParams = @{
                    ServerInstance = $replicaServer
                    Query = $backupQuery
                    QueryTimeout = $TimeoutSec
                    ConnectionTimeout = $TimeoutSec
                    TrustServerCertificate = $true
                    ErrorAction = 'Stop'
                }
                
                if ($Credential) {
                    $replicaParams.Username = $Credential.UserName
                    $replicaParams.Password = $Credential.GetNetworkCredential().Password
                }
                
                $replicaBackups = Invoke-Sqlcmd @replicaParams
                $now = Get-Date
                
                foreach ($db in $replicaBackups) {
                    $dbName = $db.DatabaseName
                    
                    # FULL backup
                    if ($db.LastFullBackup) {
                        $fullDate = [datetime]$db.LastFullBackup
                        $ageHours = ($now - $fullDate).TotalHours
                        
                        # Actualizar si es más reciente
                        if ($null -eq $result.LastFullBackup -or $fullDate -gt $result.LastFullBackup) {
                            $result.LastFullBackup = $fullDate
                            Write-Verbose "  Backup FULL más reciente en $replicaServer : $fullDate"
                        }
                        
                        # Actualizar breaches si este nodo tiene el backup más reciente
                        if ($ageHours -gt 25) {
                            # Verificar si ya está en breaches
                            $breachMsg = "FULL de $dbName antiguo ($([int]$ageHours)h)"
                            if ($result.BackupBreaches -notcontains $breachMsg) {
                                # Solo agregar si es el backup más reciente de esta base
                                $result.BackupBreaches += $breachMsg
                            }
                        }
                    }
                    
                    # DIFF backup
                    if ($db.LastDiffBackup) {
                        $diffDate = [datetime]$db.LastDiffBackup
                        if ($null -eq $result.LastDiffBackup -or $diffDate -gt $result.LastDiffBackup) {
                            $result.LastDiffBackup = $diffDate
                            Write-Verbose "  Backup DIFF más reciente en $replicaServer : $diffDate"
                        }
                    }
                    
                    # LOG backup
                    if ($db.RecoveryModel -in @('FULL', 'BULK_LOGGED')) {
                        if ($db.LastLogBackup) {
                            $logDate = [datetime]$db.LastLogBackup
                            $ageHours = ($now - $logDate).TotalHours
                            
                            # Actualizar si es más reciente
                            if ($null -eq $result.LastLogBackup -or $logDate -gt $result.LastLogBackup) {
                                $result.LastLogBackup = $logDate
                                Write-Verbose "  Backup LOG más reciente en $replicaServer : $logDate"
                            }
                            
                            # Actualizar breaches
                            if ($ageHours -gt 2) {
                                $breachMsg = "LOG de $dbName antiguo ($([int]$ageHours)h)"
                                if ($result.BackupBreaches -notcontains $breachMsg) {
                                    $result.BackupBreaches += $breachMsg
                                }
                            }
                        }
                    }
                }
                
            } catch {
                Write-Verbose "No se pudo consultar backups en réplica $replicaServer : $($_.Exception.Message)"
            }
        }
        
    }
    
    # Calcular breaches basándose en los valores FINALES
    # SIMPLIFICADO: Solo verificar si hay backups recientes
    if ($result.LastFullBackup) {
        $ageHours = ((Get-Date) - $result.LastFullBackup).TotalHours
        if ($ageHours -gt 25) {
            $result.BackupBreaches += "FULL backup: $([int]$ageHours)h (SLA: 25h)"
        }
    }
    
    if ($result.LastLogBackup) {
        $ageHours = ((Get-Date) - $result.LastLogBackup).TotalHours
        if ($ageHours -gt 2) {
            $result.BackupBreaches += "LOG backup: $([int]$ageHours)h (SLA: 2h)"
        }
    }
    
    Write-Verbose "Breaches finales: $($result.BackupBreaches.Count)"
    
    return $result
}

function Get-StorageAndResourceStatus {
    <#
    .SYNOPSIS
        Obtiene estado de almacenamiento y recursos (CPU, memoria).
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec,
        [pscredential]$Credential
    )
    
    $result = @{
        WorstVolumeFreePct = 100
        Volumes = @()
        CpuHighFlag = $false
        MemoryPressureFlag = $false
        RawCounters = @{}
    }
    
    try {
        # Espacio en discos
        $diskQuery = @"
SELECT DISTINCT
    vs.volume_mount_point AS Drive,
    vs.total_bytes / 1073741824.0 AS TotalGB,
    vs.available_bytes / 1073741824.0 AS FreeGB,
    (vs.available_bytes * 100.0 / vs.total_bytes) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
"@
        
        $params = @{
            ServerInstance = $InstanceName
            Query = $diskQuery
            ConnectionTimeout = $TimeoutSec
            QueryTimeout = $TimeoutSec
            TrustServerCertificate = $true
            ErrorAction = "Stop"
        }
        
        if ($Credential) {
            $params.Username = $Credential.UserName
            $params.Password = $Credential.GetNetworkCredential().Password
        }
        
        $disks = Invoke-Sqlcmd @params
        
        foreach ($disk in $disks) {
            $freePct = [decimal]$disk.FreePct
            if ($freePct -lt $result.WorstVolumeFreePct) {
                $result.WorstVolumeFreePct = $freePct
            }
            
            $result.Volumes += @{
                Drive = $disk.Drive
                TotalGB = [Math]::Round($disk.TotalGB, 2)
                FreeGB = [Math]::Round($disk.FreeGB, 2)
                FreePct = [Math]::Round($freePct, 2)
            }
        }
        
        # CPU y Memoria (performance counters)
        $perfQuery = @"
SELECT 
    counter_name,
    cntr_value
FROM sys.dm_os_performance_counters
WHERE counter_name IN ('CPU usage %', 'Page life expectancy', 'Memory Grants Pending')
  AND instance_name = ''
"@
        
        $params.Query = $perfQuery
        $counters = Invoke-Sqlcmd @params
        
        foreach ($counter in $counters) {
            $result.RawCounters[$counter.counter_name] = $counter.cntr_value
        }
        
        # Aproximación de presión de memoria
        if ($result.RawCounters['Page life expectancy'] -and $result.RawCounters['Page life expectancy'] -lt 300) {
            $result.MemoryPressureFlag = $true
        }
        
    } catch {
        # Si falla, dejar valores por defecto (neutro)
    }
    
    return $result
}

function Get-AlwaysOnStatus {
    <#
    .SYNOPSIS
        Obtiene estado de AlwaysOn (si está habilitado).
    #>
    param(
        [string]$InstanceName,
        [int]$TimeoutSec,
        [pscredential]$Credential
    )
    
    $result = @{
        Enabled = $false
        Neutral = $true
        WorstState = "OK"
        Issues = @()
    }
    
    try {
        # Verificar si AlwaysOn está habilitado
        $hadrQuery = "SELECT SERVERPROPERTY('IsHadrEnabled') AS IsHadrEnabled"
        
        $params = @{
            ServerInstance = $InstanceName
            Query = $hadrQuery
            ConnectionTimeout = $TimeoutSec
            QueryTimeout = $TimeoutSec
            TrustServerCertificate = $true
            ErrorAction = "Stop"
        }
        
        if ($Credential) {
            $params.Username = $Credential.UserName
            $params.Password = $Credential.GetNetworkCredential().Password
        }
        
        $hadrEnabled = Invoke-Sqlcmd @params
        
        if ($hadrEnabled.IsHadrEnabled -eq 1) {
            $result.Enabled = $true
            $result.Neutral = $false
            
            # Verificar estado de sincronización
            $syncQuery = @"
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
            
            $params.Query = $syncQuery
            $agStates = Invoke-Sqlcmd @params
            
            foreach ($ag in $agStates) {
                # SOLO penalizar si hay problemas REALES de salud
                # NO penalizar por ser asincrónico (eso es configuración normal para DR)
                
                # 1. Verificar salud de sincronización (esto SÍ es problema)
                if ($ag.SyncHealth -eq 'NOT_HEALTHY') {
                    $result.Issues += "Base $($ag.DatabaseName) en AG $($ag.AGName) NO saludable: $($ag.SyncHealth)"
                    $result.WorstState = "NOT_SYNC"
                }
                
                # 2. Solo verificar sincronización si el modo es SYNCHRONOUS
                # Si es ASYNCHRONOUS (DR), es NORMAL no estar SYNCHRONIZED
                if ($ag.SyncMode -eq 'SYNCHRONOUS_COMMIT' -and $ag.SyncState -ne 'SYNCHRONIZED') {
                    $result.Issues += "Base $($ag.DatabaseName) en AG $($ag.AGName) (sync) no sincronizada: $($ag.SyncState)"
                    if ($result.WorstState -eq "OK") {
                        $result.WorstState = "NOT_SYNC"
                    }
                }
                
                # 3. Redo queue grande (puede ser problema incluso en async)
                if ($ag.RedoQueueKB -gt 512000) { # > 500MB (umbral más alto)
                    $result.Issues += "Base $($ag.DatabaseName) con redo queue grande: $($ag.RedoQueueKB) KB"
                    if ($result.WorstState -eq "OK") {
                        $result.WorstState = "HIGH_REDO"
                    }
                }
                
                # 4. Retraso solo para nodos sincrónicos
                if ($ag.SyncMode -eq 'SYNCHRONOUS_COMMIT' -and $ag.SecondsBehind -gt 900) { # > 15 min
                    $result.Issues += "Base $($ag.DatabaseName) con retraso: $($ag.SecondsBehind) segundos"
                    if ($result.WorstState -eq "OK") {
                        $result.WorstState = "LAGGING"
                    }
                }
            }
        }
        
    } catch {
        # Si falla, asumir que no está habilitado o no hay permisos
        $result.Enabled = $false
        $result.Neutral = $true
    }
    
    return $result
}

function Compute-HealthScore {
    <#
    .SYNOPSIS
        Calcula el HealthScore basado en todas las métricas recolectadas.
    #>
    param(
        [hashtable]$Availability,
        [hashtable]$JobBackup,
        [hashtable]$Storage,
        [hashtable]$AlwaysOn,
        [hashtable]$Errorlog
    )
    
    $scores = @{
        Availability = 0
        JobBackup = 0
        Storage = 0
        AlwaysOn = 0
        Errorlog = 0
    }
    
    # Pesos
    $weights = @{
        Availability = 0.30
        JobBackup = 0.25
        Storage = 0.20
        AlwaysOn = 0.15
        Errorlog = 0.10
    }
    
    # 1. AVAILABILITY (30%)
    if ($Availability.Success) {
        if ($Availability.LatencyMs -le 3000) {
            $scores.Availability = 100
        } elseif ($Availability.LatencyMs -le 5000) {
            # Degradación lineal entre 3s y 5s
            $scores.Availability = 100 - (($Availability.LatencyMs - 3000) / 20)
        } else {
            $scores.Availability = 0
        }
    } else {
        $scores.Availability = 0
    }
    
    # 2. JOB & BACKUP (25%)
    $jobScore = 0
    if ($JobBackup.CheckdbOk) { $jobScore += 40 }
    if ($JobBackup.IndexOptimizeOk) { $jobScore += 30 }
    if ($JobBackup.BackupBreaches.Count -eq 0) { 
        $jobScore += 30 
    } elseif ($JobBackup.BackupBreaches.Count -le 2) {
        $jobScore += 15
    }
    $scores.JobBackup = $jobScore
    
    # 3. STORAGE & RESOURCES (20%)
    $storageScore = 100
    if ($Storage.WorstVolumeFreePct -lt 5) {
        $storageScore = 0
    } elseif ($Storage.WorstVolumeFreePct -lt 10) {
        $storageScore = 30
    } elseif ($Storage.WorstVolumeFreePct -lt 15) {
        $storageScore = 60
    } elseif ($Storage.WorstVolumeFreePct -lt 20) {
        $storageScore = 80
    }
    
    if ($Storage.MemoryPressureFlag) {
        $storageScore = [Math]::Max(0, $storageScore - 20)
    }
    
    $scores.Storage = $storageScore
    
    # 4. ALWAYSON (15%)
    if ($AlwaysOn.Neutral) {
        $scores.AlwaysOn = 100  # Neutral = perfecto (no aplica)
    } else {
        if ($AlwaysOn.WorstState -eq "OK") {
            $scores.AlwaysOn = 100
        } elseif ($AlwaysOn.WorstState -eq "LAGGING") {
            $scores.AlwaysOn = 60
        } elseif ($AlwaysOn.WorstState -eq "HIGH_REDO") {
            $scores.AlwaysOn = 40
        } else {
            $scores.AlwaysOn = 0
        }
    }
    
    # 5. ERRORLOG (10%)
    if ($Errorlog.Skipped) {
        $scores.Errorlog = 100  # Neutral si no se pudo leer
    } else {
        if ($Errorlog.Severity20PlusCount -eq 0) {
            $scores.Errorlog = 100
        } elseif ($Errorlog.Severity20PlusCount -le 2) {
            $scores.Errorlog = 50
        } else {
            $scores.Errorlog = 0
        }
    }
    
    # Cálculo final ponderado
    $finalScore = 0
    foreach ($key in $weights.Keys) {
        $finalScore += $scores[$key] * $weights[$key]
    }
    
    # Determinar status
    $status = "Critical"
    if ($finalScore -ge 90) {
        $status = "Healthy"
    } elseif ($finalScore -ge 70) {
        $status = "Warning"
    }
    
    return @{
        Score = [int][Math]::Round($finalScore)
        Status = $status
        Details = $scores
    }
}

function Process-Instance {
    <#
    .SYNOPSIS
        Procesa una instancia individual y retorna su objeto de salud completo.
    #>
    param(
        [object]$Instance,
        [int]$TimeoutSec,
        [pscredential]$Credential,
        [hashtable]$AGInfo = @{ Groups = @{}; NodeToGroup = @{} }
    )
    
    $instanceName = if ($Instance.NombreInstancia) { $Instance.NombreInstancia } else { $Instance.ServerName }
    
    # Obtener lista de réplicas del AG (pre-calculada)
    $replicaServers = @()
    if ($AGInfo.NodeToGroup.ContainsKey($instanceName)) {
        $agKey = $AGInfo.NodeToGroup[$instanceName]
        $replicaServers = $AGInfo.Groups[$agKey].Nodes
    }
    
    # Métricas
    $availability = Test-SqlAvailability -InstanceName $instanceName -TimeoutSec $TimeoutSec -Credential $Credential
    
    if ($availability.Success) {
        $errorlog = Get-ErrorlogSummary -InstanceName $instanceName -TimeoutSec $TimeoutSec -Credential $Credential
        $jobBackup = Get-JobAndBackupStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -Credential $Credential -ReplicaServers $replicaServers
        $storage = Get-StorageAndResourceStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -Credential $Credential
        $alwaysOn = Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec -Credential $Credential
    } else {
        # Si no se puede conectar, valores por defecto
        $errorlog = @{ Severity20PlusCount = 0; Skipped = $true }
        $jobBackup = @{ 
            CheckdbOk = $false
            IndexOptimizeOk = $false
            BackupBreaches = @()
            LastCheckdb = $null
            LastIndexOptimize = $null
            LastFullBackup = $null
            LastDiffBackup = $null
            LastLogBackup = $null
            BackupSummary = @{}
        }
        $storage = @{ WorstVolumeFreePct = 100; Volumes = @(); CpuHighFlag = $false; MemoryPressureFlag = $false; RawCounters = @{} }
        $alwaysOn = @{ Enabled = $false; Neutral = $true; WorstState = "UNKNOWN"; Issues = @() }
    }
    
    # Calcular score
    $health = Compute-HealthScore -Availability $availability -JobBackup $jobBackup -Storage $storage -AlwaysOn $alwaysOn -Errorlog $errorlog
    
    # Construir objeto resultado
    $result = [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $Instance.ambiente
        HostingSite = $Instance.hostingSite
        Version = $Instance.MajorVersion
        ConnectSuccess = $availability.Success
        ConnectLatencyMs = $availability.LatencyMs
        BackupSummary = @{
            LastFullBackup = $jobBackup.LastFullBackup
            LastDiffBackup = $jobBackup.LastDiffBackup
            LastLogBackup = $jobBackup.LastLogBackup
            Breaches = $jobBackup.BackupBreaches
        }
        MaintenanceSummary = @{
            CheckdbOk = $jobBackup.CheckdbOk
            IndexOptimizeOk = $jobBackup.IndexOptimizeOk
            LastCheckdb = if ($jobBackup.LastCheckdb) { $jobBackup.LastCheckdb.ToString("yyyy-MM-dd") } else { $null }
            LastIndexOptimize = if ($jobBackup.LastIndexOptimize) { $jobBackup.LastIndexOptimize.ToString("yyyy-MM-dd") } else { $null }
        }
        DiskSummary = @{
            WorstVolumeFreePct = [Math]::Round($storage.WorstVolumeFreePct, 2)
            Volumes = $storage.Volumes
        }
        ResourceSummary = @{
            CpuHighFlag = $storage.CpuHighFlag
            MemoryPressureFlag = $storage.MemoryPressureFlag
            RawCounters = $storage.RawCounters
        }
        AlwaysOnSummary = @{
            Enabled = $alwaysOn.Enabled
            WorstState = $alwaysOn.WorstState
            Issues = $alwaysOn.Issues
        }
        ErrorlogSummary = @{
            Severity20PlusCount24h = $errorlog.Severity20PlusCount
            Skipped = $errorlog.Skipped
        }
        HealthScore = $health.Score
        HealthStatus = $health.Status
        ScoreDetails = $health.Details
        ErrorMessage = $availability.ErrorMessage
        GeneratedAtUtc = (Get-Date).ToUniversalTime()
    }
    
    return $result
}

function Get-AlwaysOnGroups {
    <#
    .SYNOPSIS
        Pre-procesa TODAS las instancias para identificar grupos AlwaysOn reales.
        Consulta dinámicamente sys.availability_replicas en cada nodo para obtener
        la lista REAL de réplicas, sin depender del campo AlwaysOn de la API.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [array]$Instances,
        
        [int]$TimeoutSec = 10,
        [pscredential]$Credential = $null
    )
    
    Write-Host ""
    Write-Host "[PRE-PROCESO] Identificando grupos AlwaysOn..." -ForegroundColor Cyan
    
    $agGroups = @{}
    $processedInstances = @{}
    
    # Ordenar instancias por nombre
    $sortedInstances = $Instances | Sort-Object { 
        if ($_.NombreInstancia) { $_.NombreInstancia } else { $_.ServerName } 
    }
    
    foreach ($inst in $sortedInstances) {
        $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
        
        # Si ya procesamos esta instancia como parte de un AG, skip
        if ($processedInstances.ContainsKey($instanceName)) {
            continue
        }
        
        # Intentar conectar y verificar si tiene AlwaysOn habilitado
        try {
            $params = @{
                ServerInstance = $instanceName
                Query = "SELECT CAST(SERVERPROPERTY('IsHadrEnabled') AS INT) AS IsHadrEnabled"
                QueryTimeout = $TimeoutSec
                ConnectionTimeout = $TimeoutSec
                TrustServerCertificate = $true
                ErrorAction = 'Stop'
            }
            
            if ($Credential) {
                $params.Username = $Credential.UserName
                $params.Password = $Credential.GetNetworkCredential().Password
            }
            
            $hadrCheck = Invoke-Sqlcmd @params
            $isHadrEnabled = ($hadrCheck.IsHadrEnabled -eq 1)
            
            if ($isHadrEnabled) {
                # Consultar réplicas reales
                $replicaQuery = @"
SELECT DISTINCT
    ar.replica_server_name AS ReplicaServer,
    ag.name AS AGName
FROM sys.availability_replicas ar
INNER JOIN sys.availability_groups ag ON ar.group_id = ag.group_id
ORDER BY ar.replica_server_name
"@
                $params.Query = $replicaQuery
                $replicas = Invoke-Sqlcmd @params
                
                if ($replicas) {
                    # Agrupar por AG (puede haber múltiples AGs en un nodo)
                    $agsByName = $replicas | Group-Object AGName
                    
                    foreach ($ag in $agsByName) {
                        $agName = $ag.Name
                        $agNodes = @($ag.Group | ForEach-Object { $_.ReplicaServer } | Select-Object -Unique)
                        
                        # Crear grupo AG
                        $agGroupKey = "$agName"
                        
                        if (-not $agGroups.ContainsKey($agGroupKey)) {
                            $agGroups[$agGroupKey] = @{
                                AGName = $agName
                                Nodes = @()
                            }
                        }
                        
                        # Agregar todos los nodos
                        foreach ($node in $agNodes) {
                            if ($agGroups[$agGroupKey].Nodes -notcontains $node) {
                                $agGroups[$agGroupKey].Nodes += $node
                            }
                            $processedInstances[$node] = $agGroupKey
                        }
                        
                        Write-Host "      [AG] $agName" -ForegroundColor Green
                        Write-Host "           Nodos: $($agNodes -join ', ')" -ForegroundColor Gray
                    }
                }
            }
            
        } catch {
            # Si falla la conexión, intentar con patrón de nombres como fallback
            Write-Verbose "No se pudo consultar $instanceName : $($_.Exception.Message)"
        }
    }
    
    # Fallback: usar patrón de nombres para instancias que no pudimos consultar
    foreach ($inst in $sortedInstances) {
        $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
        
        # Si ya está en un AG, skip
        if ($processedInstances.ContainsKey($instanceName)) {
            continue
        }
        
        # Detectar patrón 01↔51, 02↔52
        if ($instanceName -match '^(.+?)(\d{2})$') {
            $baseName = $Matches[1]
            $lastTwoDigits = $Matches[2]
            
            $pairMap = @{
                '01' = '51'
                '51' = '01'
                '02' = '52'
                '52' = '02'
            }
            
            if ($pairMap.ContainsKey($lastTwoDigits)) {
                $pairNode = $baseName + $pairMap[$lastTwoDigits]
                
                # Verificar si el nodo par existe en el inventario
                $pairExists = $sortedInstances | Where-Object {
                    $name = if ($_.NombreInstancia) { $_.NombreInstancia } else { $_.ServerName }
                    $name -eq $pairNode
                }
                
                if ($pairExists) {
                    $agGroupKey = "$baseName-AG-$lastTwoDigits"
                    
                    if (-not $agGroups.ContainsKey($agGroupKey)) {
                        $agGroups[$agGroupKey] = @{
                            AGName = "$baseName-AG"
                            Nodes = @($instanceName, $pairNode)
                        }
                        
                        $processedInstances[$instanceName] = $agGroupKey
                        $processedInstances[$pairNode] = $agGroupKey
                        
                        Write-Host "      [AG-Pattern] $agGroupKey (inferido por nombre)" -ForegroundColor Yellow
                        Write-Host "                   Nodos: $instanceName, $pairNode" -ForegroundColor Gray
                    }
                }
            }
        }
    }
    
    if ($agGroups.Count -eq 0) {
        Write-Host "      [INFO] No se detectaron grupos AlwaysOn" -ForegroundColor Gray
    } else {
        Write-Host "      [OK] $($agGroups.Count) grupo(s) AlwaysOn detectado(s)" -ForegroundColor Green
    }
    
    return @{
        Groups = $agGroups
        NodeToGroup = $processedInstances
    }
}

function Sync-AlwaysOnMaintenanceValues {
    <#
    .SYNOPSIS
        Sincroniza los valores de mantenimiento (LastCheckdb, LastIndexOptimize) 
        entre todos los nodos de un mismo AlwaysOn Availability Group.
        
        Encuentra el valor MÁS RECIENTE entre todos los nodos y lo aplica a todos.
    #>
    param(
        [Parameter(Mandatory=$true)]
        [array]$AllResults,
        
        [Parameter(Mandatory=$true)]
        [hashtable]$AGInfo
    )
    
    Write-Host ""
    Write-Host "[POST-PROCESO] Sincronizando valores en nodos AlwaysOn..." -ForegroundColor Cyan
    
    $agGroups = $AGInfo.Groups
    
    if ($agGroups.Count -eq 0) {
        Write-Host "      [INFO] No hay grupos AlwaysOn para sincronizar" -ForegroundColor Gray
        return $AllResults
    }
    
    Write-Host "      [INFO] Sincronizando $($agGroups.Count) grupo(s)" -ForegroundColor Gray
    
    # Sincronizar cada grupo
    $syncedCount = 0
    
    foreach ($agKey in $agGroups.Keys) {
        $agGroup = $agGroups[$agKey]
        $nodeNames = $agGroup.Nodes
        
        # Buscar los resultados de estos nodos
        $groupResults = $AllResults | Where-Object { $nodeNames -contains $_.InstanceName }
        
        if ($groupResults.Count -lt 2) {
            continue  # Solo un nodo procesado, no hay nada que sincronizar
        }
        
        # Encontrar valores MÁS RECIENTES de Mantenimiento y Backups
        $mostRecentCheckdb = $null
        $mostRecentIndexOptimize = $null
        $mostRecentFullBackup = $null
        $mostRecentLogBackup = $null
        $mostRecentDiffBackup = $null
        
        foreach ($node in $groupResults) {
            if ($node.MaintenanceSummary.LastCheckdb) {
                $checkdbDate = [datetime]::Parse($node.MaintenanceSummary.LastCheckdb)
                if ($null -eq $mostRecentCheckdb -or $checkdbDate -gt $mostRecentCheckdb) {
                    $mostRecentCheckdb = $checkdbDate
                }
            }
            
            if ($node.MaintenanceSummary.LastIndexOptimize) {
                $indexOptDate = [datetime]::Parse($node.MaintenanceSummary.LastIndexOptimize)
                if ($null -eq $mostRecentIndexOptimize -or $indexOptDate -gt $mostRecentIndexOptimize) {
                    $mostRecentIndexOptimize = $indexOptDate
                }
            }
            
            # Backups
            if ($node.BackupSummary.LastFullBackup) {
                $fullDate = [datetime]$node.BackupSummary.LastFullBackup
                if ($null -eq $mostRecentFullBackup -or $fullDate -gt $mostRecentFullBackup) {
                    $mostRecentFullBackup = $fullDate
                }
            }
            
            if ($node.BackupSummary.LastLogBackup) {
                $logDate = [datetime]$node.BackupSummary.LastLogBackup
                if ($null -eq $mostRecentLogBackup -or $logDate -gt $mostRecentLogBackup) {
                    $mostRecentLogBackup = $logDate
                }
            }
            
            if ($node.BackupSummary.LastDiffBackup) {
                $diffDate = [datetime]$node.BackupSummary.LastDiffBackup
                if ($null -eq $mostRecentDiffBackup -or $diffDate -gt $mostRecentDiffBackup) {
                    $mostRecentDiffBackup = $diffDate
                }
            }
        }
        
        # Aplicar los valores más recientes a TODOS los nodos del grupo
        $nodeList = ($groupResults | ForEach-Object { $_.InstanceName }) -join ", "
        
        if ($mostRecentCheckdb -or $mostRecentIndexOptimize -or $mostRecentFullBackup -or $mostRecentLogBackup) {
            Write-Host "      [SYNC] $($agGroup.AGName)" -ForegroundColor Yellow
            Write-Host "             Nodos: $nodeList" -ForegroundColor Gray
            
            if ($mostRecentCheckdb) {
                $checkdbStr = $mostRecentCheckdb.ToString("yyyy-MM-dd")
                $checkdbOk = $mostRecentCheckdb -gt (Get-Date).AddDays(-7)
                Write-Host "             LastCheckdb: $checkdbStr (OK=$checkdbOk)" -ForegroundColor Gray
            }
            
            if ($mostRecentIndexOptimize) {
                $indexOptStr = $mostRecentIndexOptimize.ToString("yyyy-MM-dd")
                $indexOptOk = $mostRecentIndexOptimize -gt (Get-Date).AddDays(-7)
                Write-Host "             LastIndexOptimize: $indexOptStr (OK=$indexOptOk)" -ForegroundColor Gray
            }
            
            if ($mostRecentFullBackup) {
                Write-Host "             LastFullBackup: $($mostRecentFullBackup.ToString("yyyy-MM-dd HH:mm"))" -ForegroundColor Gray
            }
            
            if ($mostRecentLogBackup) {
                Write-Host "             LastLogBackup: $($mostRecentLogBackup.ToString("yyyy-MM-dd HH:mm"))" -ForegroundColor Gray
            }
            
            # Actualizar cada nodo del grupo
            foreach ($node in $groupResults) {
                $originalCheckdb = $node.MaintenanceSummary.LastCheckdb
                $originalIndexOpt = $node.MaintenanceSummary.LastIndexOptimize
                $originalFullBackup = $node.BackupSummary.LastFullBackup
                $originalLogBackup = $node.BackupSummary.LastLogBackup
                
                if ($mostRecentCheckdb) {
                    $node.MaintenanceSummary.LastCheckdb = $mostRecentCheckdb.ToString("yyyy-MM-dd")
                    $node.MaintenanceSummary.CheckdbOk = $mostRecentCheckdb -gt (Get-Date).AddDays(-7)
                }
                
                if ($mostRecentIndexOptimize) {
                    $node.MaintenanceSummary.LastIndexOptimize = $mostRecentIndexOptimize.ToString("yyyy-MM-dd")
                    $node.MaintenanceSummary.IndexOptimizeOk = $mostRecentIndexOptimize -gt (Get-Date).AddDays(-7)
                }
                
                # Actualizar backups SOLO si encontramos valores más recientes
                if ($mostRecentFullBackup) {
                    $node.BackupSummary.LastFullBackup = $mostRecentFullBackup.ToString("yyyy-MM-ddTHH:mm:ss")
                }
                
                if ($mostRecentLogBackup) {
                    $node.BackupSummary.LastLogBackup = $mostRecentLogBackup.ToString("yyyy-MM-ddTHH:mm:ss")
                }
                
                if ($mostRecentDiffBackup) {
                    $node.BackupSummary.LastDiffBackup = $mostRecentDiffBackup.ToString("yyyy-MM-ddTHH:mm:ss")
                }
                
                # Recalcular breaches de backups SOLO si actualizamos algo
                if ($mostRecentFullBackup -or $mostRecentLogBackup) {
                    $newBreaches = @()
                    
                    if ($mostRecentFullBackup) {
                        $ageHours = ((Get-Date) - $mostRecentFullBackup).TotalHours
                        if ($ageHours -gt 25) {
                            $newBreaches += "FULL backup antiguo ($([int]$ageHours)h > 25h)"
                        }
                    } else {
                        $newBreaches += "Sin FULL backup"
                    }
                    
                    if ($mostRecentLogBackup) {
                        $ageHours = ((Get-Date) - $mostRecentLogBackup).TotalHours
                        if ($ageHours -gt 2) {
                            $newBreaches += "LOG backup antiguo ($([int]$ageHours)h > 2h)"
                        }
                    } else {
                        $newBreaches += "Sin LOG backup"
                    }
                    
                    $node.BackupSummary.Breaches = $newBreaches
                }
                
                # Sincronizar estado de AlwaysOn (TODOS los nodos del AG deben reportar Enabled=true)
                $node.AlwaysOnSummary.Enabled = $true
                
                # Recalcular HealthScore si hubo cambios
                if ($originalCheckdb -ne $node.MaintenanceSummary.LastCheckdb -or 
                    $originalIndexOpt -ne $node.MaintenanceSummary.LastIndexOptimize -or
                    $originalFullBackup -ne $node.BackupSummary.LastFullBackup -or
                    $originalLogBackup -ne $node.BackupSummary.LastLogBackup) {
                    
                    # Construir JobBackup para recalcular score
                    $jobBackup = @{
                        CheckdbOk = $node.MaintenanceSummary.CheckdbOk
                        IndexOptimizeOk = $node.MaintenanceSummary.IndexOptimizeOk
                        BackupBreaches = if ($node.BackupSummary.Breaches) { $node.BackupSummary.Breaches } else { @() }
                    }
                    
                    # Recalcular HealthScore
                    $availability = @{ Success = $node.ConnectSuccess; LatencyMs = $node.ConnectLatencyMs }
                    $storage = @{ 
                        WorstVolumeFreePct = $node.DiskSummary.WorstVolumeFreePct
                        CpuHighFlag = $node.ResourceSummary.CpuHighFlag
                        MemoryPressureFlag = $node.ResourceSummary.MemoryPressureFlag
                    }
                    $alwaysOn = @{ 
                        Neutral = ($node.AlwaysOnSummary.Enabled -eq $false)
                        WorstState = $node.AlwaysOnSummary.WorstState 
                    }
                    $errorlog = @{ 
                        Skipped = $node.ErrorlogSummary.Skipped
                        Severity20PlusCount = $node.ErrorlogSummary.Severity20PlusCount24h
                    }
                    
                    $newHealth = Compute-HealthScore -Availability $availability -JobBackup $jobBackup -Storage $storage -AlwaysOn $alwaysOn -Errorlog $errorlog
                    
                    $node.HealthScore = $newHealth.Score
                    $node.HealthStatus = $newHealth.Status
                    $node.ScoreDetails = $newHealth.Details
                    
                    $syncedCount++
                }
            }
        }
    }
    
    if ($syncedCount -gt 0) {
        Write-Host "      [OK] $syncedCount nodo(s) sincronizado(s)" -ForegroundColor Green
    } else {
        Write-Host "      [INFO] No se requirieron cambios" -ForegroundColor Gray
    }
    
    # Segunda pasada: Asegurar que TODOS los nodos de un AG tienen Enabled=true
    # (incluso si uno falló la detección inicial)
    Write-Host ""
    Write-Host "      [VALIDACIÓN] Verificando consistencia de AlwaysOn.Enabled..." -ForegroundColor Cyan
    
    $enabledFixed = 0
    foreach ($agKey in $agGroups.Keys) {
        $agGroup = $agGroups[$agKey]
        $nodeNames = $agGroup.Nodes
        
        foreach ($nodeName in $nodeNames) {
            $nodeResult = $AllResults | Where-Object { $_.InstanceName -eq $nodeName }
            if ($nodeResult -and -not $nodeResult.AlwaysOnSummary.Enabled) {
                $nodeResult.AlwaysOnSummary.Enabled = $true
                Write-Verbose "      Corregido AlwaysOn.Enabled en $nodeName"
                $enabledFixed++
            }
        }
    }
    
    if ($enabledFixed -gt 0) {
        Write-Host "      [OK] $enabledFixed nodo(s) corregido(s)" -ForegroundColor Green
    } else {
        Write-Host "      [OK] Todos consistentes" -ForegroundColor Green
    }
    
    return $AllResults
}

function Create-HealthTableIfNotExists {
    <#
    .SYNOPSIS
        Crea la tabla InstanceHealthSnapshot si no existe.
    #>
    param(
        [string]$SqlServer,
        [string]$SqlDatabase,
        [string]$SqlSchema,
        [string]$SqlTable
    )
    
    $createSql = @"
IF NOT EXISTS (
    SELECT 1 FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = '$SqlTable' AND s.name = '$SqlSchema'
)
BEGIN
    CREATE TABLE [$SqlSchema].[$SqlTable] (
        [InstanceName]         NVARCHAR(200)  NOT NULL,
        [Ambiente]             NVARCHAR(50)   NULL,
        [HostingSite]          NVARCHAR(50)   NULL,
        [Version]              NVARCHAR(100)  NULL,
        [ConnectSuccess]       BIT            NOT NULL,
        [ConnectLatencyMs]     INT            NULL,
        [BackupJson]           NVARCHAR(MAX)  NULL,
        [MaintenanceJson]      NVARCHAR(MAX)  NULL,
        [DiskJson]             NVARCHAR(MAX)  NULL,
        [ResourceJson]         NVARCHAR(MAX)  NULL,
        [AlwaysOnJson]         NVARCHAR(MAX)  NULL,
        [ErrorlogJson]         NVARCHAR(MAX)  NULL,
        [HealthScore]          INT            NOT NULL,
        [HealthStatus]         VARCHAR(10)    NOT NULL,
        [GeneratedAtUtc]       DATETIME2      NOT NULL,
        CONSTRAINT PK_${SqlTable} PRIMARY KEY ([InstanceName], [GeneratedAtUtc])
    );
    
    CREATE INDEX IX_${SqlTable}_Status ON [$SqlSchema].[$SqlTable] ([HealthStatus], [GeneratedAtUtc]);
    CREATE INDEX IX_${SqlTable}_Score ON [$SqlSchema].[$SqlTable] ([HealthScore] DESC, [GeneratedAtUtc]);
END
"@
    
    Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $createSql -TrustServerCertificate -ErrorAction Stop | Out-Null
}

function Get-MockInstances {
    <#
    .SYNOPSIS
        Genera instancias mock para testing.
    #>
    
    return @(
        [PSCustomObject]@{
            ServerName = "MOCK-HEALTHY-01"
            NombreInstancia = "MOCK-HEALTHY-01"
            MajorVersion = "Microsoft SQL Server 2019"
            ambiente = "Test"
            hostingSite = "Onpremise"
        },
        [PSCustomObject]@{
            ServerName = "MOCK-CRITICAL-01"
            NombreInstancia = "MOCK-CRITICAL-01"
            MajorVersion = "Microsoft SQL Server 2016"
            ambiente = "Desarrollo"
            hostingSite = "AWS"
        }
    )
}

function Get-MockInstanceHealth {
    <#
    .SYNOPSIS
        Genera datos mock de salud para una instancia.
    #>
    param([string]$InstanceName)
    
    $isHealthy = $InstanceName -like "*HEALTHY*"
    
    $result = [PSCustomObject]@{
        InstanceName = $InstanceName
        Ambiente = if ($isHealthy) { "Test" } else { "Desarrollo" }
        HostingSite = if ($isHealthy) { "Onpremise" } else { "AWS" }
        Version = if ($isHealthy) { "Microsoft SQL Server 2019" } else { "Microsoft SQL Server 2016" }
        ConnectSuccess = $isHealthy
        ConnectLatencyMs = if ($isHealthy) { 150 } else { $null }
        BackupSummary = @{
            LastFullBackup = if ($isHealthy) { (Get-Date).AddHours(-8) } else { (Get-Date).AddDays(-3) }
            LastDiffBackup = if ($isHealthy) { (Get-Date).AddHours(-4) } else { $null }
            LastLogBackup = if ($isHealthy) { (Get-Date).AddMinutes(-30) } else { $null }
            Breaches = if ($isHealthy) { @() } else { @("FULL de TestDB antiguo (72h)", "LOG de TestDB nunca ejecutado") }
        }
        MaintenanceSummary = @{
            CheckdbOk = $isHealthy
            IndexOptimizeOk = $isHealthy
            LastCheckdb = if ($isHealthy) { (Get-Date).AddDays(-2).ToString("yyyy-MM-dd") } else { $null }
            LastIndexOptimize = if ($isHealthy) { (Get-Date).AddHours(-12).ToString("yyyy-MM-dd") } else { $null }
        }
        DiskSummary = @{
            WorstVolumeFreePct = if ($isHealthy) { 45.50 } else { 5.20 }
            Volumes = @(
                @{ Drive = "C:\"; TotalGB = 100; FreeGB = if ($isHealthy) { 45.5 } else { 5.2 }; FreePct = if ($isHealthy) { 45.5 } else { 5.2 } }
            )
        }
        ResourceSummary = @{
            CpuHighFlag = -not $isHealthy
            MemoryPressureFlag = -not $isHealthy
            RawCounters = @{ "Page life expectancy" = if ($isHealthy) { 500 } else { 150 } }
        }
        AlwaysOnSummary = @{
            Enabled = $false
            WorstState = "OK"
            Issues = @()
        }
        ErrorlogSummary = @{
            Severity20PlusCount24h = if ($isHealthy) { 0 } else { 5 }
            Skipped = $false
        }
        HealthScore = if ($isHealthy) { 95 } else { 25 }
        HealthStatus = if ($isHealthy) { "Healthy" } else { "Critical" }
        ScoreDetails = @{
            Availability = if ($isHealthy) { 100 } else { 0 }
            JobBackup = if ($isHealthy) { 100 } else { 10 }
            Storage = if ($isHealthy) { 100 } else { 30 }
            AlwaysOn = 100
            Errorlog = if ($isHealthy) { 100 } else { 0 }
        }
        ErrorMessage = if ($isHealthy) { $null } else { "Connection timeout" }
        GeneratedAtUtc = (Get-Date).ToUniversalTime()
    }
    
    return $result
}

# ========= MAIN =========

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " SQL Server Health Score - Relevamiento" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ($Mock) {
    Write-Host "[MODO MOCK ACTIVADO]" -ForegroundColor Yellow
    Write-Host ""
}

$startTime = Get-Date

# 1. Obtener inventario
Write-Host "[1/5] Obteniendo inventario..." -ForegroundColor Cyan

if ($Mock) {
    $instances = Get-MockInstances
    Write-Host "      [MOCK] 2 instancias sintéticas generadas" -ForegroundColor Yellow
} else {
    try {
        $instances = Invoke-RestMethod -Uri $ApiUrl -Method GET -Headers @{"Accept"="application/json"} -TimeoutSec 60
        Write-Host "      [OK] $($instances.Count) instancias obtenidas" -ForegroundColor Green
    } catch {
        Write-Error "Error consultando API: $($_.Exception.Message)"
        exit 1
    }
}

# 2. Filtrar instancias (excluir DMZ y aplicar filtros AWS)
Write-Host ""
Write-Host "[2/5] Filtrando instancias..." -ForegroundColor Cyan

$instancesFiltered = $instances | Where-Object {
    $name1 = [string]($_.NombreInstancia)
    $name2 = [string]($_.ServerName)
    $hosting = [string]($_.hostingSite)
    
    # Excluir DMZ
    $notDmz = ($name1 -notmatch '(?i)DMZ') -and ($name2 -notmatch '(?i)DMZ')
    
    # Filtro AWS
    $isAws = $hosting -match '^(?i)aws$'
    
    if ($OnlyAWS) {
        # Solo AWS
        $awsFilter = $isAws
    } elseif (-not $IncludeAWS) {
        # Excluir AWS (solo On-Premise)
        $awsFilter = -not $isAws
    } else {
        # Incluir todo
        $awsFilter = $true
    }
    
    $notDmz -and $awsFilter
}

# Mensaje de filtrado
$awsCount = ($instancesFiltered | Where-Object { $_.hostingSite -match '^(?i)aws$' }).Count
$onpremCount = $instancesFiltered.Count - $awsCount

if ($OnlyAWS) {
    Write-Host "      [FILTRO] Solo instancias AWS" -ForegroundColor Yellow
} elseif (-not $IncludeAWS) {
    Write-Host "      [FILTRO] Solo instancias On-Premise (AWS excluido)" -ForegroundColor Yellow
}

if ($TestLimit -gt 0) {
    $instancesFiltered = $instancesFiltered | Select-Object -First $TestLimit
    Write-Host "      [OK] $($instancesFiltered.Count) instancias a procesar (límite: $TestLimit)" -ForegroundColor Yellow
    Write-Host "           AWS: $awsCount | On-Premise: $onpremCount" -ForegroundColor Gray
} else {
    Write-Host "      [OK] $($instancesFiltered.Count) instancias a procesar" -ForegroundColor Green
    Write-Host "           AWS: $awsCount | On-Premise: $onpremCount" -ForegroundColor Gray
}

if ($instancesFiltered.Count -eq 0) {
    Write-Warning "No hay instancias para procesar"
    exit 0
}

# 2.5. Identificar grupos AlwaysOn (PRE-PROCESAMIENTO)
$agInfo = @{ Groups = @{}; NodeToGroup = @{} }
if (-not $Mock) {
    $agInfo = Get-AlwaysOnGroups -Instances $instancesFiltered -TimeoutSec $TimeoutSec -Credential $SqlCredential
}

# 3. Procesar instancias
Write-Host ""
Write-Host "[3/5] Procesando instancias..." -ForegroundColor Cyan
Write-Host ""

$allResults = @()

if ($Mock) {
    # Modo mock
    foreach ($inst in $instancesFiltered) {
        $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
        Write-Host "  → $instanceName (MOCK)" -ForegroundColor Gray
        $result = Get-MockInstanceHealth -InstanceName $instanceName
        $allResults += $result
    }
} elseif ($UseParallel) {
    # Modo paralelo - EXPERIMENTAL
    Write-Host "  [Modo paralelo: $Throttle threads - EXPERIMENTAL]" -ForegroundColor Yellow
    Write-Host "  ⚠️  ADVERTENCIA: El modo paralelo tiene limitaciones técnicas" -ForegroundColor Yellow
    Write-Host "  ⚠️  Si hay errores, cambia `$UseParallel = `$false en el script" -ForegroundColor Yellow
    Write-Host ""
    
    # NOTA: ForEach-Object -Parallel tiene limitaciones con funciones complejas
    # Por ahora, se procesa de forma secuencial incluso si $UseParallel = $true
    # Para procesamiento paralelo real, considera usar Start-Job o Invoke-Command
    
    Write-Host "  [INFO] Procesando de forma secuencial (modo paralelo no disponible)" -ForegroundColor Cyan
    Write-Host ""
    
    $counter = 0
    foreach ($inst in $instancesFiltered) {
        $counter++
        $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
        
        Write-Host "  [$counter/$($instancesFiltered.Count)] $instanceName" -NoNewline
        
        try {
            $result = Process-Instance -Instance $inst -TimeoutSec $TimeoutSec -Credential $SqlCredential -AGInfo $agInfo
            $allResults += $result
            
            $color = switch ($result.HealthStatus) {
                "Healthy" { "Green" }
                "Warning" { "Yellow" }
                "Critical" { "Red" }
            }
            Write-Host " - [$($result.HealthStatus)] Score: $($result.HealthScore)" -ForegroundColor $color
            
        } catch {
            Write-Host " - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
} else {
    # Modo secuencial
    $counter = 0
    foreach ($inst in $instancesFiltered) {
        $counter++
        $instanceName = if ($inst.NombreInstancia) { $inst.NombreInstancia } else { $inst.ServerName }
        
        Write-Host "  [$counter/$($instancesFiltered.Count)] $instanceName" -NoNewline
        
        try {
            $result = Process-Instance -Instance $inst -TimeoutSec $TimeoutSec -Credential $SqlCredential -AGInfo $agInfo
            $allResults += $result
            
            $color = switch ($result.HealthStatus) {
                "Healthy" { "Green" }
                "Warning" { "Yellow" }
                "Critical" { "Red" }
            }
            Write-Host " - [$($result.HealthStatus)] Score: $($result.HealthScore)" -ForegroundColor $color
            
            # Salida detallada en modo test
            if ($TestMode) {
                Write-Host "      Latencia: $($result.ConnectLatencyMs)ms | Disco: $($result.DiskSummary.WorstVolumeFreePct)% libre" -ForegroundColor Gray
                
                if ($result.BackupSummary.Breaches.Count -gt 0) {
                    Write-Host "      ⚠️  Backups: $($result.BackupSummary.Breaches.Count) breach(es)" -ForegroundColor Yellow
                }
                
                if ($result.AlwaysOnSummary.Issues.Count -gt 0) {
                    Write-Host "      ⚠️  AlwaysOn: $($result.AlwaysOnSummary.Issues.Count) issue(s)" -ForegroundColor Yellow
                }
                
                if ($result.ErrorlogSummary.Severity20PlusCount24h -gt 0) {
                    Write-Host "      ⚠️  Errores críticos: $($result.ErrorlogSummary.Severity20PlusCount24h)" -ForegroundColor Yellow
                }
                
                Write-Host ""
            }
            
        } catch {
            Write-Host " - ERROR: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

# 3.5. Sincronizar valores de mantenimiento y backups en grupos AlwaysOn
if (-not $Mock) {
    $allResults = Sync-AlwaysOnMaintenanceValues -AllResults $allResults -AGInfo $agInfo
}

# 4. Guardar archivos de salida
Write-Host ""
Write-Host "[4/5] Guardando archivos..." -ForegroundColor Cyan

# JSON
try {
    $jsonContent = $allResults | ConvertTo-Json -Depth 10
    $jsonContent | Out-File -FilePath $OutJson -Encoding UTF8 -Force
    Write-Host "      [OK] JSON: $OutJson" -ForegroundColor Green
} catch {
    Write-Warning "Error guardando JSON: $($_.Exception.Message)"
}

# CSV (flatten)
try {
    $csvData = $allResults | ForEach-Object {
        [PSCustomObject]@{
            InstanceName = $_.InstanceName
            Ambiente = $_.Ambiente
            HostingSite = $_.HostingSite
            HealthStatus = $_.HealthStatus
            HealthScore = $_.HealthScore
            ConnectSuccess = $_.ConnectSuccess
            ConnectLatencyMs = $_.ConnectLatencyMs
            WorstVolumeFreePct = $_.DiskSummary.WorstVolumeFreePct
            BackupBreachesCount = $_.BackupSummary.Breaches.Count
            AlwaysOnIssuesCount = $_.AlwaysOnSummary.Issues.Count
            Severity20PlusCount24h = $_.ErrorlogSummary.Severity20PlusCount24h
            GeneratedAtUtc = $_.GeneratedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
        }
    }
    
    $csvData | Export-Csv -Path $OutCsv -NoTypeInformation -Encoding UTF8 -Force
    Write-Host "      [OK] CSV: $OutCsv" -ForegroundColor Green
} catch {
    Write-Warning "Error guardando CSV: $($_.Exception.Message)"
}

# 5. Escribir a SQL (si se solicitó)
if ($WriteToSql -and -not $Mock) {
    Write-Host ""
    Write-Host "[5/5] Escribiendo a base de datos..." -ForegroundColor Cyan
    
    try {
        # Crear tabla si no existe
        Create-HealthTableIfNotExists -SqlServer $SqlServer -SqlDatabase $SqlDatabase -SqlSchema $SqlSchema -SqlTable $SqlTable
        Write-Host "      [OK] Tabla verificada: $SqlServer.$SqlDatabase.$SqlSchema.$SqlTable" -ForegroundColor Green
        
        # Preparar datos para inserción
        $sqlData = $allResults | ForEach-Object {
            [PSCustomObject]@{
                InstanceName = $_.InstanceName
                Ambiente = $_.Ambiente
                HostingSite = $_.HostingSite
                Version = $_.Version
                ConnectSuccess = $_.ConnectSuccess
                ConnectLatencyMs = $_.ConnectLatencyMs
                BackupJson = ($_.BackupSummary | ConvertTo-Json -Compress)
                MaintenanceJson = ($_.MaintenanceSummary | ConvertTo-Json -Compress)
                DiskJson = ($_.DiskSummary | ConvertTo-Json -Compress)
                ResourceJson = ($_.ResourceSummary | ConvertTo-Json -Compress)
                AlwaysOnJson = ($_.AlwaysOnSummary | ConvertTo-Json -Compress)
                ErrorlogJson = ($_.ErrorlogSummary | ConvertTo-Json -Compress)
                HealthScore = $_.HealthScore
                HealthStatus = $_.HealthStatus
                GeneratedAtUtc = $_.GeneratedAtUtc
            }
        }
        
        # Insertar registros
        foreach ($row in $sqlData) {
            # Escapar comillas simples en strings
            $safeInstanceName = $row.InstanceName -replace "'", "''"
            $safeAmbiente = if ($row.Ambiente) { $row.Ambiente -replace "'", "''" } else { "" }
            $safeHostingSite = if ($row.HostingSite) { $row.HostingSite -replace "'", "''" } else { "" }
            $safeVersion = if ($row.Version) { $row.Version -replace "'", "''" } else { "" }
            $safeBackupJson = $row.BackupJson -replace "'", "''"
            $safeMaintenanceJson = $row.MaintenanceJson -replace "'", "''"
            $safeDiskJson = $row.DiskJson -replace "'", "''"
            $safeResourceJson = $row.ResourceJson -replace "'", "''"
            $safeAlwaysOnJson = $row.AlwaysOnJson -replace "'", "''"
            $safeErrorlogJson = $row.ErrorlogJson -replace "'", "''"
            $safeHealthStatus = $row.HealthStatus -replace "'", "''"
            $safeGeneratedAtUtc = $row.GeneratedAtUtc.ToString("yyyy-MM-dd HH:mm:ss")
            
            # Construir query con interpolación directa
            $insertQuery = @"
INSERT INTO [$SqlSchema].[$SqlTable] (
    InstanceName, Ambiente, HostingSite, Version, ConnectSuccess, ConnectLatencyMs,
    BackupJson, MaintenanceJson, DiskJson, ResourceJson, AlwaysOnJson, ErrorlogJson,
    HealthScore, HealthStatus, GeneratedAtUtc
) VALUES (
    N'$safeInstanceName',
    $(if ($row.Ambiente) { "N'$safeAmbiente'" } else { "NULL" }),
    $(if ($row.HostingSite) { "N'$safeHostingSite'" } else { "NULL" }),
    $(if ($row.Version) { "N'$safeVersion'" } else { "NULL" }),
    $(if ($row.ConnectSuccess) { "1" } else { "0" }),
    $(if ($row.ConnectLatencyMs) { $row.ConnectLatencyMs } else { "NULL" }),
    N'$safeBackupJson',
    N'$safeMaintenanceJson',
    N'$safeDiskJson',
    N'$safeResourceJson',
    N'$safeAlwaysOnJson',
    N'$safeErrorlogJson',
    $($row.HealthScore),
    '$safeHealthStatus',
    '$safeGeneratedAtUtc'
)
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer -Database $SqlDatabase -Query $insertQuery -TrustServerCertificate -ErrorAction Stop | Out-Null
        }
        
        Write-Host "      [OK] $($sqlData.Count) registros insertados" -ForegroundColor Green
        
    } catch {
        Write-Warning "Error escribiendo a SQL: $($_.Exception.Message)"
    }
} elseif ($WriteToSql -and $Mock) {
    Write-Host ""
    Write-Host "[5/5] Escritura a SQL omitida (modo MOCK)" -ForegroundColor Yellow
} else {
    Write-Host ""
    Write-Host "[5/5] Escritura a SQL no solicitada (usar -WriteToSql)" -ForegroundColor Gray
}

# Resumen final
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " RESUMEN" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$healthyCount = ($allResults | Where-Object { $_.HealthStatus -eq "Healthy" }).Count
$warningCount = ($allResults | Where-Object { $_.HealthStatus -eq "Warning" }).Count
$criticalCount = ($allResults | Where-Object { $_.HealthStatus -eq "Critical" }).Count

Write-Host "Instancias procesadas: $($allResults.Count)" -ForegroundColor Cyan
Write-Host "  Healthy (>=90):      $healthyCount" -ForegroundColor Green
Write-Host "  Warning (70-89):     $warningCount" -ForegroundColor Yellow
Write-Host "  Critical (<70):      $criticalCount" -ForegroundColor Red
Write-Host ""

$avgScore = if ($allResults.Count -gt 0) { 
    [int]($allResults | Measure-Object -Property HealthScore -Average).Average 
} else { 
    0 
}
Write-Host "Score promedio: $avgScore" -ForegroundColor Cyan
Write-Host ""

$endTime = Get-Date
$duration = $endTime - $startTime
$durationFormatted = "{0:00}:{1:00}:{2:00}" -f $duration.Hours, $duration.Minutes, $duration.Seconds

Write-Host "Tiempo de ejecución: $durationFormatted" -ForegroundColor Gray
Write-Host ""

if ($Mock) {
    Write-Host "[MODO MOCK]" -ForegroundColor Yellow
}

if ($TestMode) {
    Write-Host ""
    Write-Host "╔════════════════════════════════════════╗" -ForegroundColor Yellow
    Write-Host "║                                        ║" -ForegroundColor Yellow
    Write-Host "║    🧪 MODO DE PRUEBA COMPLETADO 🧪    ║" -ForegroundColor Yellow
    Write-Host "║                                        ║" -ForegroundColor Yellow
    Write-Host "╚════════════════════════════════════════╝" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Próximos pasos:" -ForegroundColor Cyan
    Write-Host "  1. Revisar archivos generados:" -ForegroundColor White
    Write-Host "     • $OutJson" -ForegroundColor Gray
    Write-Host "     • $OutCsv" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  2. Ver resultados en consola:" -ForegroundColor White
    Write-Host "     Import-Csv '$OutCsv' | Format-Table" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  3. Para ejecutar sobre TODAS las instancias:" -ForegroundColor White
    Write-Host "     .\RelevamientoHealthScoreMant.ps1 -Parallel -WriteToSql" -ForegroundColor Gray
    Write-Host ""
    
    # Mostrar detalle de instancias procesadas
    if ($allResults.Count -gt 0) {
        Write-Host "Detalle de instancias procesadas:" -ForegroundColor Cyan
        $allResults | ForEach-Object {
            $statusIcon = switch ($_.HealthStatus) {
                "Healthy" { "✅" }
                "Warning" { "⚠️ " }
                "Critical" { "❌" }
            }
            $statusColor = switch ($_.HealthStatus) {
                "Healthy" { "Green" }
                "Warning" { "Yellow" }
                "Critical" { "Red" }
            }
            Write-Host "  $statusIcon $($_.InstanceName) - Score: $($_.HealthScore) - $($_.HealthStatus)" -ForegroundColor $statusColor
        }
        Write-Host ""
    }
}

Write-Host "[OK] Proceso completado" -ForegroundColor Green
Write-Host ""

