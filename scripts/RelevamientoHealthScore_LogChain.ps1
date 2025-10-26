<#
.SYNOPSIS
    Health Score v3.0 - Log Chain Integrity Monitor
    Verifica integridad de la cadena de logs de transacciones

.DESCRIPTION
    Categoría: LOG CHAIN INTEGRITY (Peso: 5%)
    
    Métricas clave:
    - Databases con log chain roto
    - Recovery model vs backups
    - Tiempo desde último log backup
    - Databases en Full sin log backups
    
    Scoring (0-100):
    - 100 pts: Todas las DBs críticas con log chain intacto
    - 80 pts: 1 DB no crítica con log chain roto
    - 50 pts: 1 DB crítica con log chain roto
    - 20 pts: >2 DBs con log chain roto
    - 0 pts: DBs críticas con log chain roto >24h
    
    Cap: 0 si DB crítica con log chain roto >24h

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
    Frecuencia: Cada 15 minutos
    Timeout: 30s inicial, 60s retry
    AlwaysOn: Sincronización automática entre nodos del mismo AG
#>

#Requires -Modules dbatools

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
$TimeoutSec = 30           # Aumentado a 30 segundos
$TimeoutSecRetry = 60      # Timeout para retry en caso de fallo
$TestMode = $false         # $true = solo 5 instancias para testing
$IncludeAWS = $false       # Cambiar a $true para incluir AWS
$OnlyAWS = $false          # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-LogChainStatus {
    param(
        [string]$Instance,
        [int]$TimeoutSec = 30,
        [int]$RetryTimeoutSec = 60
    )
    
    # Query optimizada con límite de fechas
    $cutoffDate = (Get-Date).AddDays(-7).ToString('yyyy-MM-dd')
    
    $query = @"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    d.log_reuse_wait_desc AS LogReuseWait,
    bs_full.backup_finish_date AS LastFullBackup,
    bs_log.backup_finish_date AS LastLogBackup,
    DATEDIFF(HOUR, bs_log.backup_finish_date, GETDATE()) AS HoursSinceLastLog,
    CASE 
        WHEN d.recovery_model_desc = 'FULL' AND bs_log.backup_finish_date IS NULL THEN 1
        WHEN d.recovery_model_desc = 'FULL' AND DATEDIFF(HOUR, bs_log.backup_finish_date, GETDATE()) > 24 THEN 1
        ELSE 0
    END AS LogChainAtRisk,
    d.state_desc AS DatabaseState
FROM sys.databases d
LEFT JOIN (
    SELECT database_name, MAX(backup_finish_date) AS backup_finish_date
    FROM msdb.dbo.backupset WITH (NOLOCK)
    WHERE type = 'D' AND backup_finish_date >= '$cutoffDate'
    GROUP BY database_name
) bs_full ON d.name = bs_full.database_name
LEFT JOIN (
    SELECT database_name, MAX(backup_finish_date) AS backup_finish_date
    FROM msdb.dbo.backupset WITH (NOLOCK)
    WHERE type = 'L' AND backup_finish_date >= '$cutoffDate'
    GROUP BY database_name
) bs_log ON d.name = bs_log.database_name
WHERE d.database_id > 4  -- Excluir system databases
  AND d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
  AND d.is_read_only = 0
ORDER BY LogChainAtRisk DESC, HoursSinceLastLog DESC;
"@
    
    # Intentar con timeout normal, retry si falla
    $results = $null
    $attemptCount = 0
    $lastError = $null
    
    while ($attemptCount -lt 2 -and $results -eq $null) {
        $attemptCount++
        $currentTimeout = if ($attemptCount -eq 1) { $TimeoutSec } else { $RetryTimeoutSec }
        
        try {
            if ($attemptCount -eq 2) {
                Write-Verbose "  🔁 Retry con timeout extendido ($RetryTimeoutSec s)"
            }
            
            $results = Invoke-DbaQuery -SqlInstance $Instance -Query $query -QueryTimeout $currentTimeout -EnableException
            
        } catch {
            $lastError = $_
            if ($attemptCount -lt 2) {
                Write-Verbose "  ⚠️  Timeout en intento $attemptCount, reintentando..."
            }
        }
    }
    
    if ($results -eq $null) {
        Write-Warning "Error obteniendo log chain status de ${Instance}: $lastError"
        return $null
    }
    
    # Calcular métricas
    $brokenChainDBs = ($results | Where-Object { $_.LogChainAtRisk -eq 1 }).Count
    $fullDBsWithoutLog = ($results | Where-Object { $_.RecoveryModel -eq 'FULL' -and $null -eq $_.LastLogBackup }).Count
    $maxHoursSinceLog = ($results | Where-Object { $_.RecoveryModel -eq 'FULL' } | Measure-Object -Property HoursSinceLastLog -Maximum).Maximum
    
    if ($null -eq $maxHoursSinceLog) { $maxHoursSinceLog = 0 }
    
    # Detalles en JSON (forzar array con @())
    $detailsArray = @($results | Where-Object { $_.LogChainAtRisk -eq 1 } | Select-Object DatabaseName, RecoveryModel, HoursSinceLastLog, LogReuseWait)
    if ($detailsArray.Count -eq 0) {
        $details = "[]"
    } else {
        $details = $detailsArray | ConvertTo-Json -Compress -AsArray
    }
    
    return @{
        BrokenChainCount = $brokenChainDBs
        FullDBsWithoutLogBackup = $fullDBsWithoutLog
        MaxHoursSinceLogBackup = $maxHoursSinceLog
        Details = $details
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

function Sync-AlwaysOnLogChain {
    <#
    .SYNOPSIS
        Sincroniza datos de log chain entre nodos de AlwaysOn.
    .DESCRIPTION
        Toma el MEJOR valor de cada grupo (menor cantidad de problemas) y lo aplica a TODOS los nodos.
    #>
    param(
        [Parameter(Mandatory)]
        [array]$AllResults,
        [Parameter(Mandatory)]
        [hashtable]$AGInfo
    )
    
    Write-Host ""
    Write-Host "🔄 [POST-PROCESO] Sincronizando log chain entre nodos AlwaysOn..." -ForegroundColor Cyan
    
    $agGroups = $AGInfo.Groups
    $syncedCount = 0
    
    foreach ($agName in $agGroups.Keys) {
        $agGroup = $agGroups[$agName]
        $nodeNames = $agGroup.Nodes
        
        Write-Host "  📦 Procesando AG: $agName" -ForegroundColor Yellow
        Write-Host "    Nodos: $($nodeNames -join ', ')" -ForegroundColor Gray
        
        # Obtener resultados de todos los nodos del grupo
        $groupResults = $AllResults | Where-Object { $nodeNames -contains $_.InstanceName }
        
        if ($groupResults.Count -eq 0) {
            Write-Host "    ⚠️  Sin resultados para este grupo" -ForegroundColor Gray
            continue
        }
        
        # Encontrar el MEJOR estado (menor cantidad de cadenas rotas)
        $bestBrokenChain = ($groupResults | Measure-Object -Property BrokenChainCount -Minimum).Minimum
        $bestFullWithoutLog = ($groupResults | Measure-Object -Property FullDBsWithoutLogBackup -Minimum).Minimum
        $bestMaxHours = ($groupResults | Measure-Object -Property MaxHoursSinceLogBackup -Minimum).Minimum
        
        Write-Host "    🔄 Mejor BrokenChain: $bestBrokenChain" -ForegroundColor Gray
        Write-Host "    🔄 Mejor FullWithoutLog: $bestFullWithoutLog" -ForegroundColor Gray
        Write-Host "    🔄 Mejor MaxHours: $bestMaxHours" -ForegroundColor Gray
        
        # Aplicar los MEJORES valores a TODOS los nodos del grupo
        foreach ($nodeResult in $groupResults) {
            $nodeResult.BrokenChainCount = $bestBrokenChain
            $nodeResult.FullDBsWithoutLogBackup = $bestFullWithoutLog
            $nodeResult.MaxHoursSinceLogBackup = $bestMaxHours
            
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
            # Sanitizar valores numéricos (pueden ser NULL o vacíos)
            $brokenChainCount = if ([string]::IsNullOrEmpty($row.BrokenChainCount)) { 0 } else { [int]$row.BrokenChainCount }
            $fullDBsWithoutLog = if ([string]::IsNullOrEmpty($row.FullDBsWithoutLogBackup)) { 0 } else { [int]$row.FullDBsWithoutLogBackup }
            $maxHoursSinceLog = if ([string]::IsNullOrEmpty($row.MaxHoursSinceLogBackup)) { 0 } else { [int]$row.MaxHoursSinceLogBackup }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_LogChain (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    BrokenChainCount,
    FullDBsWithoutLogBackup,
    MaxHoursSinceLogBackup,
    LogChainDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $brokenChainCount,
    $fullDBsWithoutLog,
    $maxHoursSinceLog,
    '$($row.LogChainDetails -replace "'", "''")'
);
"@
        
            try {
                Invoke-DbaQuery -SqlInstance $SqlServer `
                    -Database $SqlDatabase `
                    -Query $query `
                    -QueryTimeout 30 `
                    -EnableException
            }
            catch {
                Write-Warning "Error al insertar $($row.InstanceName):"
                Write-Warning "Query: $query"
                Write-Warning "Error: $_"
                throw
            }
        }
        
        Write-Host "✅ Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 - LOG CHAIN INTEGRITY" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    $instances = $response
    
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # FILTRO DMZ - Excluir instancias con DMZ en el nombre
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
Write-Host "2️⃣  Recolectando métricas de log chain..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Test connection
    try {
        $connection = Test-DbaConnection -SqlInstance $instanceName -EnableException
        if (-not $connection.IsPingable) {
            Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
            continue
        }
    } catch {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Obtener métricas con retry
    $logChainStatus = Get-LogChainStatus -Instance $instanceName -TimeoutSec $TimeoutSec -RetryTimeoutSec $TimeoutSecRetry
    
    if ($null -eq $logChainStatus) {
        Write-Host "   ⚠️  $instanceName - Sin datos (skipped)" -ForegroundColor Yellow
        continue
    }
    
    $status = "✅"
    if ($logChainStatus.BrokenChainCount -gt 0) {
        $status = "🚨 BROKEN CHAINS!"
    } elseif ($logChainStatus.FullDBsWithoutLogBackup -gt 0) {
        $status = "⚠️  NO LOG BACKUPS"
    } elseif ($logChainStatus.MaxHoursSinceLogBackup -gt 24) {
        $status = "⚠️  LOG BACKUP OLD"
    }
    
    Write-Host "   $status $instanceName - Broken:$($logChainStatus.BrokenChainCount) NoLogBkp:$($logChainStatus.FullDBsWithoutLogBackup) MaxHours:$($logChainStatus.MaxHoursSinceLogBackup)h" -ForegroundColor Gray
    
    # Crear objeto de resultado
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        BrokenChainCount = $logChainStatus.BrokenChainCount
        FullDBsWithoutLogBackup = $logChainStatus.FullDBsWithoutLogBackup
        MaxHoursSinceLogBackup = $logChainStatus.MaxHoursSinceLogBackup
        LogChainDetails = $logChainStatus.Details  # Ya es JSON string
    }
}

Write-Progress -Activity "Recolectando métricas" -Completed

# 4. Post-procesamiento: Sincronizar log chain de AlwaysOn
$results = Sync-AlwaysOnLogChain -AllResults $results -AGInfo $agInfo

# 5. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - LOG CHAIN INTEGRITY                        ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$brokenChains = ($results | Where-Object { $_.BrokenChainCount -gt 0 }).Count
Write-Host "║  Con broken chains:    $brokenChains".PadRight(53) "║" -ForegroundColor White

$totalBroken = ($results | Measure-Object -Property BrokenChainCount -Sum).Sum
Write-Host "║  Total DBs con log chain roto: $totalBroken".PadRight(53) "║" -ForegroundColor White

$noLogBackup = ($results | Where-Object { $_.FullDBsWithoutLogBackup -gt 0 }).Count
Write-Host "║  Con DBs sin LOG backup:   $noLogBackup".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

