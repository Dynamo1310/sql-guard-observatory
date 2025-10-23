<#
.SYNOPSIS
    Health Score v2.0 - Recolección de métricas de BACKUPS
    
.DESCRIPTION
    Script de frecuencia media (cada 15 minutos) que recolecta:
    - FULL Backups (15 pts)
    - LOG Backups (15 pts)
    
    Guarda en: InstanceHealth_Backups
    
.NOTES
    Versión: 2.0 (dbatools)
    Frecuencia: Cada 15 minutos
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
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-BackupStatus {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        LastFullBackup = $null
        LastLogBackup = $null
        FullBackupBreached = $false
        LogBackupBreached = $false
        Details = @()
    }
    
    try {
        $query = @"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    MAX(CASE WHEN bs.type = 'D' THEN bs.backup_finish_date END) AS LastFullBackup,
    MAX(CASE WHEN bs.type = 'L' THEN bs.backup_finish_date END) AS LastLogBackup
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset bs 
    ON d.name = bs.database_name
WHERE d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
  AND d.database_id > 4
GROUP BY d.name, d.recovery_model_desc;
"@
        
        # Usar dbatools para ejecutar queries
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            # Umbrales
            $fullThreshold = (Get-Date).AddDays(-1)   # 24 horas
            $logThreshold = (Get-Date).AddHours(-2)   # 2 horas
            
            # Encontrar el backup FULL más reciente y más antiguo
            $fullBackups = $data | Where-Object { $_.LastFullBackup -ne [DBNull]::Value } | 
                Select-Object -ExpandProperty LastFullBackup
            
            if ($fullBackups) {
                $result.LastFullBackup = ($fullBackups | Measure-Object -Maximum).Maximum
                
                # Si alguna DB está sin backup o vencido
                $breachedDbs = $data | Where-Object { 
                    $_.LastFullBackup -eq [DBNull]::Value -or 
                    ([datetime]$_.LastFullBackup -lt $fullThreshold)
                }
                
                $result.FullBackupBreached = ($breachedDbs.Count -gt 0)
            } else {
                $result.FullBackupBreached = $true
            }
            
            # LOG backups (solo para FULL recovery)
            $fullRecoveryDbs = $data | Where-Object { $_.RecoveryModel -eq 'FULL' }
            
            if ($fullRecoveryDbs) {
                $logBackups = $fullRecoveryDbs | Where-Object { $_.LastLogBackup -ne [DBNull]::Value } | 
                    Select-Object -ExpandProperty LastLogBackup
                
                if ($logBackups) {
                    $result.LastLogBackup = ($logBackups | Measure-Object -Maximum).Maximum
                    
                    # Si alguna DB FULL está sin LOG backup o vencido
                    $breachedLogs = $fullRecoveryDbs | Where-Object { 
                        $_.LastLogBackup -eq [DBNull]::Value -or 
                        ([datetime]$_.LastLogBackup -lt $logThreshold)
                    }
                    
                    $result.LogBackupBreached = ($breachedLogs.Count -gt 0)
                } else {
                    $result.LogBackupBreached = $true
                }
            }
            
            # Detalles
            $result.Details = $data | ForEach-Object {
                $fullAge = if ($_.LastFullBackup -ne [DBNull]::Value) { 
                    ((Get-Date) - [datetime]$_.LastFullBackup).TotalHours 
                } else { 999 }
                
                "$($_.DatabaseName):FULL=$([int]$fullAge)h"
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo backups en ${InstanceName}: $($_.Exception.Message)"
        $result.FullBackupBreached = $true
        $result.LogBackupBreached = $true
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

function Sync-AlwaysOnBackups {
    <#
    .SYNOPSIS
        Sincroniza datos de backups entre nodos de AlwaysOn.
    .DESCRIPTION
        Toma el MEJOR valor de cada grupo (backup más reciente) y lo aplica a TODOS los nodos.
    #>
    param(
        [Parameter(Mandatory)]
        [array]$AllResults,
        [Parameter(Mandatory)]
        [hashtable]$AGInfo
    )
    
    Write-Host ""
    Write-Host "🔄 [POST-PROCESO] Sincronizando backups entre nodos AlwaysOn..." -ForegroundColor Cyan
    
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
        
        # Encontrar el MEJOR LastFullBackup (más reciente)
        $bestFull = $groupResults | 
            Where-Object { $_.LastFullBackup -ne $null } | 
            Sort-Object LastFullBackup -Descending | 
            Select-Object -First 1
        
        # Encontrar el MEJOR LastLogBackup (más reciente)
        $bestLog = $groupResults | 
            Where-Object { $_.LastLogBackup -ne $null } | 
            Sort-Object LastLogBackup -Descending | 
            Select-Object -First 1
        
        $bestFullDate = if ($bestFull) { $bestFull.LastFullBackup } else { $null }
        $bestLogDate = if ($bestLog) { $bestLog.LastLogBackup } else { $null }
        
        Write-Host "    🔄 Mejor FULL: $bestFullDate" -ForegroundColor Gray
        Write-Host "    🔄 Mejor LOG:  $bestLogDate" -ForegroundColor Gray
        
        # Aplicar los MEJORES valores a TODOS los nodos del grupo
        foreach ($nodeResult in $groupResults) {
            $nodeResult.LastFullBackup = $bestFullDate
            $nodeResult.LastLogBackup = $bestLogDate
            
            # Recalcular breaches con los valores sincronizados
            if ($bestFullDate) {
                $fullAge = (Get-Date) - $bestFullDate
                $nodeResult.FullBackupBreached = $fullAge.TotalHours -gt 24
            } else {
                $nodeResult.FullBackupBreached = $true
            }
            
            if ($bestLogDate) {
                $logAge = (Get-Date) - $bestLogDate
                $nodeResult.LogBackupBreached = $logAge.TotalHours -gt 2
            } else {
                $nodeResult.LogBackupBreached = $false  # Si no hay LOG backup, no se considera breach
            }
            
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
            $lastFull = if ($row.LastFullBackup) { "'$($row.LastFullBackup.ToString('yyyy-MM-dd HH:mm:ss'))'" } else { "NULL" }
            $lastLog = if ($row.LastLogBackup) { "'$($row.LastLogBackup.ToString('yyyy-MM-dd HH:mm:ss'))'" } else { "NULL" }
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Backups (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    LastFullBackup,
    LastLogBackup,
    FullBackupBreached,
    LogBackupBreached,
    BackupDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $lastFull,
    $lastLog,
    $(if ($row.FullBackupBreached) {1} else {0}),
    $(if ($row.LogBackupBreached) {1} else {0}),
    '$($row.BackupDetails -join "|")'
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
Write-Host "║  Health Score v2.0 - BACKUP METRICS                   ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 15 minutos                               ║" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de backups..." -ForegroundColor Yellow

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
    $backups = Get-BackupStatus -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($backups.FullBackupBreached -and $backups.LogBackupBreached) { 
        $status = "🚨 FULL+LOG!" 
    }
    elseif ($backups.FullBackupBreached) { 
        $status = "🚨 FULL BACKUP!" 
    }
    elseif ($backups.LogBackupBreached) { 
        $status = "⚠️ LOG BACKUP!" 
    }
    
    $fullAge = if ($backups.LastFullBackup) { 
        ((Get-Date) - $backups.LastFullBackup).TotalHours 
    } else { 999 }
    
    $logAge = if ($backups.LastLogBackup) { 
        ((Get-Date) - $backups.LastLogBackup).TotalHours 
    } else { 999 }
    
    Write-Host "   $status $instanceName - FULL:$([int]$fullAge)h LOG:$([int]$logAge)h" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        LastFullBackup = $backups.LastFullBackup
        LastLogBackup = $backups.LastLogBackup
        FullBackupBreached = $backups.FullBackupBreached
        LogBackupBreached = $backups.LogBackupBreached
        BackupDetails = $backups.Details
    }
}

Write-Progress -Activity "Recolectando métricas" -Completed

# 4. Post-procesamiento: Sincronizar backups de AlwaysOn
$results = Sync-AlwaysOnBackups -AllResults $results -AGInfo $agInfo

# 5. Guardar en SQL
Write-Host ""
Write-Host "3️⃣  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN - BACKUPS                                    ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  FULL Backup OK:       $(($results | Where-Object {-not $_.FullBackupBreached}).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  FULL Backup vencido:  $(($results | Where-Object FullBackupBreached).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "║  LOG Backup vencido:   $(($results | Where-Object LogBackupBreached).Count)".PadRight(53) "║" -ForegroundColor White
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion
