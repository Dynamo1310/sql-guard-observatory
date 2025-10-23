<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de DISPONIBILIDAD
    
.DESCRIPTION
    Script de alta frecuencia (cada 1-2 minutos) que recolecta:
    - Conectividad y latencia (20 pts)
    - Blocking activo (10 pts)
    - Memory pressure / PLE (10 pts)
    - AlwaysOn status (10 pts)
    
    Guarda en: InstanceHealth_Critical_Availability
    
.NOTES
    Versión: 2.0 (dbatools)
    Frecuencia: Cada 1-2 minutos
    Timeout: 10 segundos
    
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
$TimeoutSec = 10
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

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
        
        # Usar dbatools para test de conexión (comando simple sin parámetros de certificado)
        $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
        
        $stopwatch.Stop()
        
        if ($connection.IsPingable) {
            $result.Success = $true
            $result.LatencyMs = [int]$stopwatch.ElapsedMilliseconds
        }
        
    } catch {
        $result.ErrorMessage = $_.Exception.Message
    }
    
    return $result
}

function Get-BlockingInfo {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        BlockingCount = 0
        MaxBlockTimeSeconds = 0
        BlockedSessions = @()
    }
    
    try {
        $query = @"
SELECT 
    blocking_session_id AS BlockerId,
    session_id AS BlockedSessionId,
    wait_time / 1000 AS BlockTimeSeconds,
    wait_type AS WaitType,
    DB_NAME(database_id) AS DatabaseName
FROM sys.dm_exec_requests
WHERE blocking_session_id > 0
  AND wait_time > 5000  -- >5 segundos
ORDER BY wait_time DESC;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.BlockingCount = $data.Count
            $result.MaxBlockTimeSeconds = ($data | Measure-Object -Property BlockTimeSeconds -Maximum).Maximum
            $result.BlockedSessions = $data | Select-Object -First 10 | ForEach-Object {
                "$($_.BlockedSessionId):$($_.BlockTimeSeconds)s"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo blocking en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-MemoryPressure {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        PageLifeExpectancy = 0
        BufferCacheHitRatio = 100.0
    }
    
    try {
        $query = @"
SELECT 
    MAX(CASE WHEN counter_name = 'Page life expectancy' THEN cntr_value ELSE 0 END) AS PageLifeExpectancy,
    CAST(
        MAX(CASE WHEN counter_name = 'Buffer cache hit ratio' THEN cntr_value ELSE 0 END) * 1.0 
        / NULLIF(MAX(CASE WHEN counter_name = 'Buffer cache hit ratio base' THEN cntr_value ELSE 1 END), 0) * 100.0
        AS DECIMAL(5,2)
    ) AS BufferCacheHitRatio
FROM sys.dm_os_performance_counters
WHERE object_name LIKE '%Buffer Manager%'
  AND counter_name IN ('Page life expectancy', 'Buffer cache hit ratio', 'Buffer cache hit ratio base');
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.PageLifeExpectancy = [int]$data.PageLifeExpectancy
            $result.BufferCacheHitRatio = [decimal]$data.BufferCacheHitRatio
        }
        
    } catch {
        Write-Warning "Error obteniendo memory metrics en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Get-AlwaysOnStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    $result = @{
        Enabled = $false
        WorstState = "N/A"
        Details = @()
    }
    
    try {
        $query = @"
IF SERVERPROPERTY('IsHadrEnabled') = 1
BEGIN
    SELECT 
        ag.name AS AGName,
        ar.replica_server_name AS ReplicaName,
        ars.role_desc AS Role,
        ars.synchronization_health_desc AS SyncHealth,
        drs.synchronization_state_desc AS DBSyncState,
        drs.database_name AS DatabaseName
    FROM sys.availability_replicas ar
    INNER JOIN sys.dm_hadr_availability_replica_states ars 
        ON ar.replica_id = ars.replica_id
    INNER JOIN sys.availability_groups ag 
        ON ar.group_id = ag.group_id
    LEFT JOIN sys.dm_hadr_database_replica_states drs 
        ON ar.replica_id = drs.replica_id
    WHERE ar.replica_server_name = @@SERVERNAME;
END
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            $result.Enabled = $true
            
            # Determinar peor estado
            $states = $data | Select-Object -ExpandProperty SyncHealth -Unique
            if ($states -contains "NOT_HEALTHY") {
                $result.WorstState = "CRITICAL"
            }
            elseif ($states -contains "PARTIALLY_HEALTHY") {
                $result.WorstState = "WARNING"
            }
            else {
                $result.WorstState = "HEALTHY"
            }
            
            $result.Details = $data | ForEach-Object {
                "$($_.AGName):$($_.DatabaseName):$($_.SyncHealth)"
            }
        }
        
    } catch {
        # Si falla, asumimos que no tiene AlwaysOn
    }
    
    return $result
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
INSERT INTO dbo.InstanceHealth_Critical_Availability (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    ConnectSuccess,
    ConnectLatencyMs,
    BlockingCount,
    MaxBlockTimeSeconds,
    BlockedSessionIds,
    PageLifeExpectancy,
    BufferCacheHitRatio,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    AlwaysOnDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $(if ($row.ConnectSuccess) {1} else {0}),
    $($row.ConnectLatencyMs),
    $($row.BlockingCount),
    $($row.MaxBlockTimeSeconds),
    '$($row.BlockedSessionIds -join ",")',
    $($row.PageLifeExpectancy),
    $($row.BufferCacheHitRatio),
    $(if ($row.AlwaysOnEnabled) {1} else {0}),
    '$($row.AlwaysOnWorstState)',
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
Write-Host "║  Health Score v2.0 - AVAILABILITY METRICS             ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 1-2 minutos                              ║" -ForegroundColor Cyan
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
    
    if ($TestMode) {
        $instances = $instances | Select-Object -First 5
    }
    
    Write-Host "   Después de filtros: $($instances.Count)" -ForegroundColor Green
    
} catch {
    Write-Error "Error obteniendo instancias: $($_.Exception.Message)"
    exit 1
}

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando métricas de disponibilidad..." -ForegroundColor Yellow

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
    
    # Conectividad
    $connTest = Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    if (-not $connTest.Success) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN" -ForegroundColor Red
        
        $results += [PSCustomObject]@{
            InstanceName = $instanceName
            Ambiente = $ambiente
            HostingSite = $hostingSite
            SqlVersion = "N/A"
            ConnectSuccess = $false
            ConnectLatencyMs = 0
            BlockingCount = 0
            MaxBlockTimeSeconds = 0
            BlockedSessionIds = @()
            PageLifeExpectancy = 0
            BufferCacheHitRatio = 0
            AlwaysOnEnabled = $false
            AlwaysOnWorstState = "N/A"
            AlwaysOnDetails = @()
        }
        continue
    }
    
    # Capturar versión de SQL Server
    $sqlVersion = "N/A"
    try {
        $versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(100)) AS Version"
        $versionResult = Invoke-DbaQuery -SqlInstance $instanceName -Query $versionQuery -QueryTimeout 5 -EnableException -ErrorAction SilentlyContinue
        if ($versionResult) {
            $sqlVersion = $versionResult.Version
        }
    } catch {
        # Si falla, usar N/A
    }
    
    # Recolectar métricas (solo si conecta)
    $blocking = Get-BlockingInfo -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $memory = Get-MemoryPressure -InstanceName $instanceName -TimeoutSec $TimeoutSec
    $alwaysOn = Get-AlwaysOnStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($blocking.BlockingCount -gt 10) { $status = "🚨 BLOCKING!" }
    elseif ($memory.PageLifeExpectancy -lt 100) { $status = "⚠️ MEMORY!" }
    
    Write-Host "   $status $instanceName - Lat:$($connTest.LatencyMs)ms Block:$($blocking.BlockingCount) PLE:$($memory.PageLifeExpectancy)" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        ConnectSuccess = $true
        ConnectLatencyMs = $connTest.LatencyMs
        BlockingCount = $blocking.BlockingCount
        MaxBlockTimeSeconds = $blocking.MaxBlockTimeSeconds
        BlockedSessionIds = $blocking.BlockedSessions
        PageLifeExpectancy = $memory.PageLifeExpectancy
        BufferCacheHitRatio = $memory.BufferCacheHitRatio
        AlwaysOnEnabled = $alwaysOn.Enabled
        AlwaysOnWorstState = $alwaysOn.WorstState
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
Write-Host "║  RESUMEN - AVAILABILITY                               ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Conectadas:           $(($results | Where-Object ConnectSuccess).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Con blocking:         $(($results | Where-Object {$_.BlockingCount -gt 0}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Memory pressure:      $(($results | Where-Object {$_.PageLifeExpectancy -lt 300}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  AlwaysOn enabled:     $(($results | Where-Object AlwaysOnEnabled).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

