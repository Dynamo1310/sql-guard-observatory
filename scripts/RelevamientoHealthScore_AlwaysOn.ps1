<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de ALWAYSON (AG)
    
.DESCRIPTION
    Script de frecuencia media (cada 2-5 minutos) que recolecta:
    - Estado de sincronización de bases en AG
    - Send queue y redo queue
    - Estado de salud de las réplicas
    
    Guarda en: InstanceHealth_AlwaysOn
    
    Peso en scoring: 14%
    Criterios: 
    - Réplicas SYNCHRONOUS_COMMIT: 100 si están SYNCHRONIZED
    - Réplicas ASYNCHRONOUS_COMMIT: 100 si están SYNCHRONIZED o SYNCHRONIZING (no se penalizan)
    - Penaliza send_queue y redo_queue altos
    Cap: DB SUSPENDED o no sincronizada (sync mode) >2 min => cap 60
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 2-5 minutos
    Timeout: 15 segundos
    
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
$TimeoutSec = 15
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
$VerboseOutput = $false  # $true = mostrar detalles de cada nodo para diagnóstico
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-AlwaysOnStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        Enabled = $false
        WorstState = "N/A"
        DatabaseCount = 0
        SynchronizedCount = 0
        SuspendedCount = 0
        AvgSendQueueKB = 0
        MaxSendQueueKB = 0
        AvgRedoQueueKB = 0
        MaxRedoQueueKB = 0
        MaxSecondsBehind = 0
        Details = @()
    }
    
    try {
        # PASO 1: Verificar si AlwaysOn está habilitado a nivel de instancia
        $checkHadrQuery = "SELECT SERVERPROPERTY('IsHadrEnabled') AS IsHadrEnabled;"
        
        $hadrCheck = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $checkHadrQuery `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        $isHadrEnabled = $hadrCheck.IsHadrEnabled
        
        if ($isHadrEnabled -eq $null -or $isHadrEnabled -eq [DBNull]::Value -or $isHadrEnabled -eq 0) {
            # AlwaysOn NO está habilitado a nivel de instancia
            $result.Enabled = $false
            $result.WorstState = "N/A"
            return $result
        }
        
        # PASO 2: AlwaysOn SÍ está habilitado, obtener estado de los AGs
        $result.Enabled = $true  # ✅ Marcar como habilitado
        
        try {
            # Query mejorada que funciona tanto en primarios como secundarios
            # Incluye availability_mode_desc para distinguir SYNC vs ASYNC
            $agQuery = @"
SELECT 
    ag.name AS AGName,
    ar.replica_server_name AS ReplicaName,
    ar.availability_mode_desc AS AvailabilityMode,
    ars.role_desc AS Role,
    ars.synchronization_health_desc AS SyncHealth,
    drs.synchronization_state_desc AS DBSyncState,
    DB_NAME(drs.database_id) AS DatabaseName,
    drs.is_suspended AS IsSuspended,
    drs.suspend_reason_desc AS SuspendReason,
    ISNULL(drs.log_send_queue_size, 0) AS SendQueueKB,
    ISNULL(drs.redo_queue_size, 0) AS RedoQueueKB,
    ISNULL(DATEDIFF(SECOND, drs.last_commit_time, GETDATE()), 0) AS SecondsBehind
FROM sys.availability_replicas ar
INNER JOIN sys.dm_hadr_availability_replica_states ars 
    ON ar.replica_id = ars.replica_id
INNER JOIN sys.availability_groups ag 
    ON ar.group_id = ag.group_id
LEFT JOIN sys.dm_hadr_database_replica_states drs 
    ON ar.replica_id = drs.replica_id
WHERE ars.is_local = 1
  AND drs.database_id IS NOT NULL;
"@
            
            $data = Invoke-DbaQuery -SqlInstance $InstanceName `
                -Query $agQuery `
                -QueryTimeout $TimeoutSec `
                -EnableException
            
            if ($data -and $data.Count -gt 0) {
                # Hay datos de AGs - bases de datos participando en este nodo
                $result.DatabaseCount = $data.Count
                
                # Contar bases "saludables" según su modo de disponibilidad:
                # - SYNCHRONOUS_COMMIT: debe estar SYNCHRONIZED
                # - ASYNCHRONOUS_COMMIT: puede estar SYNCHRONIZING (es normal y esperado)
                $healthyDBs = $data | Where-Object { 
                    ($_.AvailabilityMode -eq 'ASYNCHRONOUS_COMMIT' -and $_.DBSyncState -in @('SYNCHRONIZED', 'SYNCHRONIZING')) -or
                    ($_.AvailabilityMode -eq 'SYNCHRONOUS_COMMIT' -and $_.DBSyncState -eq 'SYNCHRONIZED')
                }
                $result.SynchronizedCount = if ($healthyDBs) { $healthyDBs.Count } else { 0 }
                
                # Contar bases suspendidas
                $suspended = $data | Where-Object { $_.IsSuspended -eq $true }
                $result.SuspendedCount = if ($suspended) { $suspended.Count } else { 0 }
                
                # Calcular queues (solo para bases no suspendidas)
                $activeDBs = $data | Where-Object { $_.IsSuspended -eq $false }
                if ($activeDBs) {
                    $result.AvgSendQueueKB = [int](($activeDBs | Measure-Object -Property SendQueueKB -Average).Average)
                    $result.MaxSendQueueKB = [int](($activeDBs | Measure-Object -Property SendQueueKB -Maximum).Maximum)
                    $result.AvgRedoQueueKB = [int](($activeDBs | Measure-Object -Property RedoQueueKB -Average).Average)
                    $result.MaxRedoQueueKB = [int](($activeDBs | Measure-Object -Property RedoQueueKB -Maximum).Maximum)
                    
                    # Lag máximo (solo para nodos sincronos)
                    $syncNodes = $activeDBs | Where-Object { $_.SecondsBehind -ne [DBNull]::Value }
                    if ($syncNodes) {
                        $result.MaxSecondsBehind = [int](($syncNodes | Measure-Object -Property SecondsBehind -Maximum).Maximum)
                    }
                }
                
                # Determinar peor estado (considerando modo async)
                $states = $data | Select-Object -ExpandProperty SyncHealth -Unique
                
                # Contar bases con problemas REALES (no incluir async SYNCHRONIZING como problema)
                $problemDBs = $data | Where-Object { 
                    $_.IsSuspended -eq $true -or
                    ($_.AvailabilityMode -eq 'SYNCHRONOUS_COMMIT' -and $_.DBSyncState -ne 'SYNCHRONIZED') -or
                    ($_.AvailabilityMode -eq 'ASYNCHRONOUS_COMMIT' -and $_.DBSyncState -notin @('SYNCHRONIZED', 'SYNCHRONIZING'))
                }
                
                if ($result.SuspendedCount -gt 0) {
                    $result.WorstState = "SUSPENDED"
                }
                elseif ($states -contains "NOT_HEALTHY") {
                    $result.WorstState = "NOT_HEALTHY"
                }
                elseif ($states -contains "PARTIALLY_HEALTHY") {
                    $result.WorstState = "PARTIALLY_HEALTHY"
                }
                elseif ($problemDBs -and $problemDBs.Count -gt 0) {
                    $result.WorstState = "NOT_SYNCHRONIZED"
                }
                else {
                    $result.WorstState = "HEALTHY"
                }
                
                # Detalles (incluir rol y modo para diagnóstico)
                $result.Details = $data | ForEach-Object {
                    $agName = if ($_.AGName) { $_.AGName } else { "NULL" }
                    $dbName = if ($_.DatabaseName) { $_.DatabaseName } else { "NULL" }
                    $syncState = if ($_.DBSyncState) { $_.DBSyncState } else { "NULL" }
                    $role = if ($_.Role) { $_.Role } else { "NULL" }
                    $mode = if ($_.AvailabilityMode) { $_.AvailabilityMode } else { "NULL" }
                    
                    "${agName}:${dbName}:${syncState}:${role}:${mode}"
                }
            }
            else {
                # AlwaysOn está habilitado pero no hay AGs configurados (o no es parte de ningún AG)
                $result.WorstState = "OK"
                $result.Details = @("AlwaysOn habilitado pero sin AGs configurados")
            }
        }
        catch {
            # Error al consultar AGs, pero AlwaysOn está habilitado
            # Establecer estado por defecto
            $result.WorstState = "OK"
            $result.Details = @("AlwaysOn habilitado - no se pudo consultar estado de AGs")
            Write-Warning "Error obteniendo estado de AGs en ${InstanceName}: $($_.Exception.Message)"
        }
        
    } catch {
        # Error al verificar si AlwaysOn está habilitado
        # Mantener valores por defecto (Enabled = false, WorstState = "N/A")
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
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
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
            $query = @"
INSERT INTO dbo.InstanceHealth_AlwaysOn (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    DatabaseCount,
    SynchronizedCount,
    SuspendedCount,
    AvgSendQueueKB,
    MaxSendQueueKB,
    AvgRedoQueueKB,
    MaxRedoQueueKB,
    MaxSecondsBehind,
    AlwaysOnDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $(if ($row.AlwaysOnEnabled) {1} else {0}),
    '$($row.AlwaysOnWorstState)',
    $($row.DatabaseCount),
    $($row.SynchronizedCount),
    $($row.SuspendedCount),
    $($row.AvgSendQueueKB),
    $($row.MaxSendQueueKB),
    $($row.AvgRedoQueueKB),
    $($row.MaxRedoQueueKB),
    $($row.MaxSecondsBehind),
    '$($row.AlwaysOnDetails -join "|")'
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
Write-Host "║  Health Score v3.0 - ALWAYSON (AG) METRICS           ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 2-5 minutos                              ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener instancias desde API
Write-Host "1️⃣  Obteniendo instancias desde API..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri $ApiUrl -TimeoutSec 30
    # La API devuelve directamente un array, no un objeto con .message
    $instances = $response
    
    Write-Host "   Total encontradas: $($instances.Count)" -ForegroundColor Gray
    
    # Filtros
    if (-not $IncludeAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -ne "AWS" }
    }
    if ($OnlyAWS) {
        $instances = $instances | Where-Object { $_.hostingSite -eq "AWS" }
    }
    
    # Excluir instancias con DMZ en el nombre
    $instances = $instances | Where-Object { $_.NombreInstancia -notlike "*DMZ*" }
    
    # Filtrar solo instancias con AlwaysOn habilitado (según API)
    $instancesWithAG = $instances | Where-Object { $_.AlwaysOn -eq "Enabled" }
    
    Write-Host "   Con AlwaysOn habilitado: $($instancesWithAG.Count)" -ForegroundColor Gray
    
    if ($TestMode) {
        $instancesWithAG = $instancesWithAG | Select-Object -First 5
    }
    
    Write-Host "   Después de filtros: $($instancesWithAG.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

if ($instancesWithAG.Count -eq 0) {
    Write-Host ""
    Write-Host "ℹ️  No hay instancias con AlwaysOn habilitado para procesar." -ForegroundColor Yellow
    Write-Host "✅ Script completado!" -ForegroundColor Green
    exit 0
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de AlwaysOn..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instancesWithAG) {
    $counter++
    # La propiedad correcta es NombreInstancia (con mayúscula inicial)
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando métricas" `
        -Status "$counter de $($instancesWithAG.Count): $instanceName" `
        -PercentComplete (($counter / $instancesWithAG.Count) * 100)
    
    # Capturar metadata de la instancia desde API
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Verificar conectividad primero
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    # Recolectar métricas de AlwaysOn
    $alwaysOn = Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    # Determinar el rol de este nodo (PRIMARY o SECONDARY)
    $role = "UNKNOWN"
    $availabilityMode = "N/A"
    if ($alwaysOn.Details -and $alwaysOn.Details.Count -gt 0) {
        $firstDetail = $alwaysOn.Details[0]
        
        # Verificar si es un mensaje descriptivo (comienza con "AlwaysOn")
        if ($firstDetail -like "AlwaysOn*") {
            # Es un mensaje descriptivo (ej: "AlwaysOn habilitado pero sin AGs configurados")
            $role = "NO_AG"
            $availabilityMode = "N/A"
        }
        else {
            # Es data real, parsear: AGName:DatabaseName:DBSyncState:Role:AvailabilityMode
            $parts = $firstDetail -split ":"
            if ($parts.Count -ge 4) {
                $role = $parts[3].Trim()
            }
            if ($parts.Count -ge 5) {
                $availabilityMode = $parts[4].Trim()
                # Abreviar para display
                if ($availabilityMode -eq "ASYNCHRONOUS_COMMIT") {
                    $availabilityMode = "ASYNC"
                } elseif ($availabilityMode -eq "SYNCHRONOUS_COMMIT") {
                    $availabilityMode = "SYNC"
                }
            }
        }
    }
    
    $status = "✅"
    if ($alwaysOn.WorstState -eq "SUSPENDED") { 
        $status = "🚨 SUSPENDED!" 
    }
    elseif ($alwaysOn.WorstState -eq "NOT_HEALTHY") { 
        $status = "🚨 NOT HEALTHY!" 
    }
    elseif ($alwaysOn.WorstState -eq "NOT_SYNCHRONIZED") { 
        $status = "⚠️ NOT SYNC!" 
    }
    elseif ($alwaysOn.WorstState -eq "PARTIALLY_HEALTHY") { 
        $status = "⚠️ PARTIAL!" 
    }
    
    $color = "Gray"
    if ($role -in @("UNKNOWN", "NO_AG")) {
        $color = "Yellow"
    }
    
    Write-Host "   $status $instanceName [$role/$availabilityMode] - State:$($alwaysOn.WorstState) DBs:$($alwaysOn.DatabaseCount) Healthy:$($alwaysOn.SynchronizedCount) SendQ:$($alwaysOn.MaxSendQueueKB)KB" -ForegroundColor $color
    
    # Mostrar detalles SIEMPRE que hay UNKNOWN para diagnóstico
    if ($role -eq "UNKNOWN" -and $alwaysOn.Details) {
        Write-Host "      → DIAGNOSTICO: $($alwaysOn.Details[0])" -ForegroundColor Magenta
        Write-Host "      → Parts count: $(($alwaysOn.Details[0] -split ':').Count)" -ForegroundColor Magenta
    }
    # Mostrar detalles si está en modo verbose Y hay algo inusual
    elseif ($VerboseOutput -and $role -eq "NO_AG" -and $alwaysOn.Details) {
        Write-Host "      → Details: $($alwaysOn.Details -join ' | ')" -ForegroundColor DarkGray
    }
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        AlwaysOnEnabled = $alwaysOn.Enabled
        AlwaysOnWorstState = $alwaysOn.WorstState
        DatabaseCount = $alwaysOn.DatabaseCount
        SynchronizedCount = $alwaysOn.SynchronizedCount
        SuspendedCount = $alwaysOn.SuspendedCount
        AvgSendQueueKB = $alwaysOn.AvgSendQueueKB
        MaxSendQueueKB = $alwaysOn.MaxSendQueueKB
        AvgRedoQueueKB = $alwaysOn.AvgRedoQueueKB
        MaxRedoQueueKB = $alwaysOn.MaxRedoQueueKB
        MaxSecondsBehind = $alwaysOn.MaxSecondsBehind
        AlwaysOnDetails = $alwaysOn.Details
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
Write-Host "║  RESUMEN - ALWAYSON                                   ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Healthy:              $(($results | Where-Object {$_.AlwaysOnWorstState -eq 'HEALTHY'}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Partially Healthy:    $(($results | Where-Object {$_.AlwaysOnWorstState -eq 'PARTIALLY_HEALTHY'}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Not Healthy:          $(($results | Where-Object {$_.AlwaysOnWorstState -eq 'NOT_HEALTHY'}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Suspended:            $(($results | Where-Object {$_.AlwaysOnWorstState -eq 'SUSPENDED'}).Count)".PadRight(53) "║" -ForegroundColor White

$totalDBs = ($results | Measure-Object -Property DatabaseCount -Sum).Sum
$totalHealthy = ($results | Measure-Object -Property SynchronizedCount -Sum).Sum
Write-Host "║  Total bases:          $totalDBs".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Saludables:           $totalHealthy".PadRight(53) "║" -ForegroundColor White

# Contar roles y modos (basado en detalles)
$primaryCount = 0
$secondaryCount = 0
$syncCount = 0
$asyncCount = 0
$noAGCount = 0
foreach ($result in $results) {
    if ($result.AlwaysOnDetails -and $result.AlwaysOnDetails.Count -gt 0) {
        $firstDetail = $result.AlwaysOnDetails[0]
        
        # Verificar si es un mensaje descriptivo
        if ($firstDetail -like "AlwaysOn*") {
            $noAGCount++
        }
        else {
            # Formato: AGName:DatabaseName:DBSyncState:Role:AvailabilityMode
            $parts = $firstDetail -split ":"
            if ($parts.Count -ge 4) {
                $rolePart = $parts[3].Trim()
                if ($rolePart -eq "PRIMARY") { $primaryCount++ }
                elseif ($rolePart -eq "SECONDARY") { $secondaryCount++ }
            }
            if ($parts.Count -ge 5) {
                $modePart = $parts[4].Trim()
                if ($modePart -eq "SYNCHRONOUS_COMMIT") { $syncCount++ }
                elseif ($modePart -eq "ASYNCHRONOUS_COMMIT") { $asyncCount++ }
            }
        }
    }
}

Write-Host "║".PadRight(56) "║" -ForegroundColor White
Write-Host "║  Nodos PRIMARY:        $primaryCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Nodos SECONDARY:      $secondaryCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Réplicas SYNC:        $syncCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Réplicas ASYNC:       $asyncCount".PadRight(53) "║" -ForegroundColor White
if ($noAGCount -gt 0) {
    Write-Host "║  Sin AG configurado:   $noAGCount".PadRight(53) "║" -ForegroundColor Yellow
}

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

