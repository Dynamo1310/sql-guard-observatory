<#
.SYNOPSIS
    Health Score v3.0 - Database States Monitor
    Detecta databases en estados problemáticos

.DESCRIPTION
    Categoría: DATABASE STATES (Peso: 3%)
    
    Métricas clave:
    - Databases Suspect/Emergency (CRÍTICOS)
    - Recovery Pending
    - Single User / Restoring
    - Suspect Pages (corrupción)
    
    NOTA: Databases OFFLINE se excluyen (pueden estar offline por mantenimiento intencional)
    
    Scoring (0-100):
    - 100 pts: Todas las DBs en estado OK, 0 suspect pages
    - 60 pts: 1 DB en single user o restoring
    - 40 pts: 1 DB en recovery pending o suspect pages detectadas
    - 20 pts: >1 DB en estado problemático
    - 0 pts: Alguna DB crítica SUSPECT/EMERGENCY
    
    Cap: 0 si DB crítica SUSPECT/EMERGENCY, 50 si hay suspect pages

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
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
$TimeoutSec = 15
$TestMode = $false    # $true = solo 5 instancias para testing
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS
# NOTA: Instancias con DMZ en el nombre siempre se excluyen

#endregion

#region ===== FUNCIONES =====

function Get-DatabaseStatesStatus {
    param([string]$Instance)
    
    $query = @"
-- Bases en estado ANORMAL: state_desc <> ONLINE/OFFLINE (OFFLINE es intencional),
-- o con acceso restringido (SINGLE_USER/RESTRICTED_USER) aunque estén ONLINE.
-- Se excluyen bases read-only y standby (log shipping) por ser intencionales.
SELECT
    d.name AS DatabaseName,
    d.state_desc AS State,
    d.user_access_desc AS UserAccess
FROM sys.databases d
WHERE d.database_id > 4
  AND d.is_read_only = 0
  AND d.is_in_standby = 0
  AND (d.state_desc NOT IN ('ONLINE', 'OFFLINE')
       OR d.user_access_desc <> 'MULTI_USER')
ORDER BY d.state_desc, d.name;

-- Suspect Pages
SELECT COUNT(*) AS SuspectPageCount
FROM msdb.dbo.suspect_pages
WHERE last_update_date > DATEADD(DAY, -30, GETDATE());
"@
    
    try {
        $datasets = Invoke-DbaQuery -SqlInstance $Instance -Query $query -QueryTimeout $TimeoutSec -EnableException -As DataSet
        
        $dbStates = $datasets.Tables[0]
        $suspectPages = $datasets.Tables[1]
        
        # OFFLINE se excluye - no se captura (puede ser mantenimiento intencional)
        $offlineCount = 0
        $suspectCount = ($dbStates | Where-Object { $_.State -eq 'SUSPECT' }).Count
        $emergencyCount = ($dbStates | Where-Object { $_.State -eq 'EMERGENCY' }).Count
        $recoveryPendingCount = ($dbStates | Where-Object { $_.State -eq 'RECOVERY_PENDING' }).Count
        $singleUserCount = ($dbStates | Where-Object { $_.UserAccess -eq 'SINGLE_USER' }).Count
        $restoringCount = ($dbStates | Where-Object { $_.State -eq 'RESTORING' }).Count
        $suspectPageCount = if ($suspectPages.Count -gt 0) { $suspectPages[0].SuspectPageCount } else { 0 }
        
        # Detalle de TODAS las bases en estado anormal (el query ya las filtró).
        # Forzamos forma de array JSON aun con 0 o 1 base (Windows PowerShell 5.1 no
        # tiene ConvertTo-Json -AsArray y desenvuelve los arrays de un solo elemento).
        $abnormalDBs = @($dbStates | Select-Object DatabaseName, State, UserAccess)
        if ($abnormalDBs.Count -eq 0) {
            $details = "[]"
        } elseif ($abnormalDBs.Count -eq 1) {
            $details = "[" + ($abnormalDBs[0] | ConvertTo-Json -Compress) + "]"
        } else {
            $details = $abnormalDBs | ConvertTo-Json -Compress
        }
        
        return @{
            OfflineCount = $offlineCount
            SuspectCount = $suspectCount
            EmergencyCount = $emergencyCount
            RecoveryPendingCount = $recoveryPendingCount
            SingleUserCount = $singleUserCount
            RestoringCount = $restoringCount
            SuspectPageCount = $suspectPageCount
            Details = $details
        }
    }
    catch {
        Write-Warning "Error obteniendo database states de ${Instance}: $_"
        return $null
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
INSERT INTO dbo.InstanceHealth_DatabaseStates (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    OfflineCount,
    SuspectCount,
    EmergencyCount,
    RecoveryPendingCount,
    SingleUserCount,
    RestoringCount,
    SuspectPageCount,
    DatabaseStateDetails
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $($row.OfflineCount),
    $($row.SuspectCount),
    $($row.EmergencyCount),
    $($row.RecoveryPendingCount),
    $($row.SingleUserCount),
    $($row.RestoringCount),
    $($row.SuspectPageCount),
    '$($row.DatabaseStateDetails -replace "'", "''")'
);
"@
        
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
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 - DATABASE STATES" -ForegroundColor Cyan
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

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Recolectando estados de databases..." -ForegroundColor Yellow

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
    
    # Obtener métricas
    $dbStatus = Get-DatabaseStatesStatus -Instance $instanceName
    
    if ($null -eq $dbStatus) {
        Write-Host "   ⚠️  $instanceName - Sin datos (skipped)" -ForegroundColor Yellow
        continue
    }
    
    $totalProblematic = $dbStatus.SuspectCount + $dbStatus.EmergencyCount + $dbStatus.RecoveryPendingCount
    
    $status = "✅"
    if ($dbStatus.SuspectCount -gt 0 -or $dbStatus.EmergencyCount -gt 0) {
        $status = "🚨 CRITICAL STATE!"
    } elseif ($dbStatus.SuspectPageCount -gt 0) {
        $status = "⚠️  SUSPECT PAGES"
    } elseif ($totalProblematic -gt 0) {
        $status = "⚠️  PROBLEMATIC"
    }
    
    Write-Host "   $status $instanceName - Suspect:$($dbStatus.SuspectCount) Emergency:$($dbStatus.EmergencyCount) RecovPending:$($dbStatus.RecoveryPendingCount) SuspectPages:$($dbStatus.SuspectPageCount)" -ForegroundColor Gray
    
    # Crear objeto de resultado
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        OfflineCount = $dbStatus.OfflineCount
        SuspectCount = $dbStatus.SuspectCount
        EmergencyCount = $dbStatus.EmergencyCount
        RecoveryPendingCount = $dbStatus.RecoveryPendingCount
        SingleUserCount = $dbStatus.SingleUserCount
        RestoringCount = $dbStatus.RestoringCount
        SuspectPageCount = $dbStatus.SuspectPageCount
        DatabaseStateDetails = $dbStatus.Details
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
Write-Host "║  RESUMEN - DATABASE STATES                            ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$totalSuspect = ($results | Measure-Object -Property SuspectCount -Sum).Sum
Write-Host "║  DBs Suspect:          $totalSuspect".PadRight(53) "║" -ForegroundColor White

$totalEmergency = ($results | Measure-Object -Property EmergencyCount -Sum).Sum
Write-Host "║  DBs Emergency:        $totalEmergency".PadRight(53) "║" -ForegroundColor White

$totalRecovPending = ($results | Measure-Object -Property RecoveryPendingCount -Sum).Sum
Write-Host "║  DBs Recovery Pending: $totalRecovPending".PadRight(53) "║" -ForegroundColor White

$totalSuspectPages = ($results | Measure-Object -Property SuspectPageCount -Sum).Sum
Write-Host "║  Suspect Pages:        $totalSuspectPages".PadRight(53) "║" -ForegroundColor White

Write-Host "║                                                       ║" -ForegroundColor White
Write-Host "║  ℹ️  OFFLINE DBs se excluyen (mantenimiento OK)      ║" -ForegroundColor DarkGray
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

