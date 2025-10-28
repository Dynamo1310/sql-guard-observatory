<#
.SYNOPSIS
    Health Score v3.0 - Database States Monitor
    Detecta databases en estados problemÃ¡ticos

.DESCRIPTION
    CategorÃ­a: DATABASE STATES (Peso: 3%)
    
    MÃ©tricas clave:
    - Databases Suspect/Emergency (CRÃTICOS)
    - Recovery Pending
    - Single User / Restoring
    - Suspect Pages (corrupciÃ³n)
    
    NOTA: Databases OFFLINE se excluyen (pueden estar offline por mantenimiento intencional)
    
    Scoring (0-100):
    - 100 pts: Todas las DBs en estado OK, 0 suspect pages
    - 60 pts: 1 DB en single user o restoring
    - 40 pts: 1 DB en recovery pending o suspect pages detectadas
    - 20 pts: >1 DB en estado problemÃ¡tico
    - 0 pts: Alguna DB crÃ­tica SUSPECT/EMERGENCY
    
    Cap: 0 si DB crÃ­tica SUSPECT/EMERGENCY, 50 si hay suspect pages

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
#>

#Requires -Modules dbatools

[CmdletBinding()]
param()

# Verificar que dbatools estÃ¡ disponible
if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

# Descargar SqlServer si estÃ¡ cargado (conflicto con dbatools)
if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

# Importar dbatools con force para evitar conflictos
Import-Module dbatools -Force

#region ===== CONFIGURACIÃ“N =====

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
-- Database States (excluye OFFLINE - puede ser intencional por mantenimiento)
SELECT 
    d.name AS DatabaseName,
    d.state_desc AS State,
    d.user_access_desc AS UserAccess,
    d.is_in_standby AS IsStandby,
    CASE 
        WHEN d.state_desc IN ('SUSPECT', 'EMERGENCY', 'RECOVERY_PENDING') THEN 1
        WHEN d.user_access_desc = 'SINGLE_USER' THEN 1
        ELSE 0
    END AS IsProblematic
FROM sys.databases d
WHERE d.database_id > 4
  AND d.state_desc <> 'OFFLINE'  -- Excluir bases offline (mantenimiento intencional)
ORDER BY IsProblematic DESC, State;

-- Suspect Pages
SELECT COUNT(*) AS SuspectPageCount
FROM msdb.dbo.suspect_pages
WHERE last_update_date > DATEADD(DAY, -30, GETDATE());
"@
    
    try {
        $datasets = Invoke-Sqlcmd -ServerInstance $Instance -Query $query -QueryTimeout $TimeoutSec -TrustServerCertificate
        
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
        
        # Detalles de DBs problemÃ¡ticas
        $problematicDBs = $dbStates | Where-Object { $_.IsProblematic -eq 1 } | Select-Object DatabaseName, State, UserAccess
        $details = $problematicDBs | ConvertTo-Json -Compress
        if ($null -eq $details -or $details -eq "") { $details = "[]" }
        
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
        
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate `
               
        }
        
        Write-Host "âœ… Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
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
Write-Host "1ï¸âƒ£  Obteniendo instancias desde API..." -ForegroundColor Yellow

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
Write-Host "2ï¸âƒ£  Recolectando estados de databases..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instance in $instances) {
    $counter++
    $instanceName = $instance.NombreInstancia
    
    Write-Progress -Activity "Recolectando mÃ©tricas" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    $ambiente = if ($instance.PSObject.Properties.Name -contains "ambiente") { $instance.ambiente } else { "N/A" }
    $hostingSite = if ($instance.PSObject.Properties.Name -contains "hostingSite") { $instance.hostingSite } else { "N/A" }
    $sqlVersion = if ($instance.PSObject.Properties.Name -contains "MajorVersion") { $instance.MajorVersion } else { "N/A" }
    
    # Test connection
    try {
        $connection = Test-DbaConnection -SqlInstance $instanceName -EnableException
        if (-not $connection.IsPingable) {
            Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
            continue
        }
    } catch {
        Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
        continue
    }
    
    # Obtener mÃ©tricas
    $dbStatus = Get-DatabaseStatesStatus -Instance $instanceName
    
    if ($null -eq $dbStatus) {
        Write-Host "   âš ï¸  $instanceName - Sin datos (skipped)" -ForegroundColor Yellow
        continue
    }
    
    $totalProblematic = $dbStatus.SuspectCount + $dbStatus.EmergencyCount + $dbStatus.RecoveryPendingCount
    
    $status = "âœ…"
    if ($dbStatus.SuspectCount -gt 0 -or $dbStatus.EmergencyCount -gt 0) {
        $status = "ðŸš¨ CRITICAL STATE!"
    } elseif ($dbStatus.SuspectPageCount -gt 0) {
        $status = "âš ï¸  SUSPECT PAGES"
    } elseif ($totalProblematic -gt 0) {
        $status = "âš ï¸  PROBLEMATIC"
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
        DatabaseStateDetails = ($dbStatus.Details | ConvertTo-Json -Compress)
    }
}

Write-Progress -Activity "Recolectando mÃ©tricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3ï¸âƒ£  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Green
Write-Host "â•‘  RESUMEN - DATABASE STATES                            â•‘" -ForegroundColor Green
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Green
Write-Host "â•‘  Total instancias:     $($results.Count)".PadRight(53) "â•‘" -ForegroundColor White

$totalSuspect = ($results | Measure-Object -Property SuspectCount -Sum).Sum
Write-Host "â•‘  DBs Suspect:          $totalSuspect".PadRight(53) "â•‘" -ForegroundColor White

$totalEmergency = ($results | Measure-Object -Property EmergencyCount -Sum).Sum
Write-Host "â•‘  DBs Emergency:        $totalEmergency".PadRight(53) "â•‘" -ForegroundColor White

$totalRecovPending = ($results | Measure-Object -Property RecoveryPendingCount -Sum).Sum
Write-Host "â•‘  DBs Recovery Pending: $totalRecovPending".PadRight(53) "â•‘" -ForegroundColor White

$totalSuspectPages = ($results | Measure-Object -Property SuspectPageCount -Sum).Sum
Write-Host "â•‘  Suspect Pages:        $totalSuspectPages".PadRight(53) "â•‘" -ForegroundColor White

Write-Host "â•‘                                                       â•‘" -ForegroundColor White
Write-Host "â•‘  â„¹ï¸  OFFLINE DBs se excluyen (mantenimiento OK)      â•‘" -ForegroundColor DarkGray
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Green
Write-Host ""
Write-Host "âœ… Script completado!" -ForegroundColor Green

#endregion


