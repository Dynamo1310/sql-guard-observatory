<#
.SYNOPSIS
    Health Score v3.0 - Database States Monitor
    Detecta databases en estados problemáticos

.DESCRIPTION
    Categoría: DATABASE STATES (Peso: 3%)
    
    Métricas clave:
    - Databases Offline/Suspect/Emergency
    - Recovery Pending
    - Single User / Restoring
    - Suspect Pages (corrupción)
    
    Scoring (0-100):
    - 100 pts: Todas las DBs ONLINE, 0 suspect pages
    - 80 pts: 1 DB no crítica offline por mantenimiento planeado
    - 60 pts: 1 DB en single user o restoring
    - 40 pts: 1 DB en recovery pending o suspect pages detectadas
    - 20 pts: >1 DB en estado problemático
    - 0 pts: Alguna DB crítica OFFLINE/SUSPECT/EMERGENCY
    
    Cap: 0 si DB crítica SUSPECT/OFFLINE, 50 si hay suspect pages

.NOTES
    Author: SQL Guard Observatory
    Version: 3.0
#>

#Requires -Modules dbatools

[CmdletBinding()]
param(
    [string]$ApiBaseUrl = "http://localhost:5000",
    [string]$SqlServer = "asprbm-nov-01\API",
    [string]$SqlDatabase = "SQLNova",
    [int]$TimeoutSec = 300
)

#region ===== CONFIGURACIÓN =====

$ErrorActionPreference = "Stop"

#endregion

#region ===== FUNCIONES =====

function Get-AllInstanceNames {
    try {
        $response = Invoke-RestMethod -Uri "$ApiBaseUrl/api/instances/active" -Method Get -TimeoutSec 30
        return $response | Where-Object { $_.isActive } | Select-Object -ExpandProperty instanceName
    }
    catch {
        Write-Error "Error obteniendo instancias desde API: $_"
        return @()
    }
}

function Get-DatabaseStatesStatus {
    param([string]$Instance)
    
    $query = @"
-- Database States
SELECT 
    d.name AS DatabaseName,
    d.state_desc AS State,
    d.user_access_desc AS UserAccess,
    d.is_in_standby AS IsStandby,
    CASE 
        WHEN d.state_desc IN ('OFFLINE', 'SUSPECT', 'EMERGENCY', 'RECOVERY_PENDING') THEN 1
        WHEN d.user_access_desc = 'SINGLE_USER' THEN 1
        ELSE 0
    END AS IsProblematic
FROM sys.databases d
WHERE d.database_id > 4
ORDER BY IsProblematic DESC, State;

-- Suspect Pages
SELECT COUNT(*) AS SuspectPageCount
FROM msdb.dbo.suspect_pages
WHERE event_time > DATEADD(DAY, -30, GETDATE());
"@
    
    try {
        $datasets = Invoke-DbaQuery -SqlInstance $Instance -Query $query -QueryTimeout $TimeoutSec -EnableException -As DataSet
        
        $dbStates = $datasets.Tables[0]
        $suspectPages = $datasets.Tables[1]
        
        $offlineCount = ($dbStates | Where-Object { $_.State -eq 'OFFLINE' }).Count
        $suspectCount = ($dbStates | Where-Object { $_.State -eq 'SUSPECT' }).Count
        $emergencyCount = ($dbStates | Where-Object { $_.State -eq 'EMERGENCY' }).Count
        $recoveryPendingCount = ($dbStates | Where-Object { $_.State -eq 'RECOVERY_PENDING' }).Count
        $singleUserCount = ($dbStates | Where-Object { $_.UserAccess -eq 'SINGLE_USER' }).Count
        $restoringCount = ($dbStates | Where-Object { $_.State -eq 'RESTORING' }).Count
        $suspectPageCount = if ($suspectPages.Count -gt 0) { $suspectPages[0].SuspectPageCount } else { 0 }
        
        # Detalles de DBs problemáticas
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
        [PSCustomObject]$Data
    )
    
    try {
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
    '$($Data.InstanceName)',
    '$($Data.Ambiente)',
    '$($Data.HostingSite)',
    '$($Data.SqlVersion)',
    GETUTCDATE(),
    $($Data.OfflineCount),
    $($Data.SuspectCount),
    $($Data.EmergencyCount),
    $($Data.RecoveryPendingCount),
    $($Data.SingleUserCount),
    $($Data.RestoringCount),
    $($Data.SuspectPageCount),
    '$($Data.DatabaseStateDetails -replace "'", "''")'
);
"@
        
        Invoke-DbaQuery -SqlInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        return $true
    }
    catch {
        Write-Error "Error guardando en SQL: $_"
        return $false
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
Write-Host "[1/2] Obteniendo instancias..." -ForegroundColor Yellow
$instances = Get-AllInstanceNames

if ($instances.Count -eq 0) {
    Write-Error "No se encontraron instancias activas!"
    exit 1
}

Write-Host "   Encontradas: $($instances.Count) instancias" -ForegroundColor Green

# 2. Procesar cada instancia
Write-Host ""
Write-Host "[2/2] Recolectando estados de databases..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instanceName in $instances) {
    $counter++
    $progress = [math]::Round(($counter / $instances.Count) * 100)
    Write-Progress -Activity "Recolectando database states" -Status "$instanceName ($counter/$($instances.Count))" -PercentComplete $progress
    
    # Obtener metadatos
    try {
        $server = Connect-DbaInstance -SqlInstance $instanceName -NonPooledConnection
        $ambiente = if ($server.Name -like "*PRD*" -or $server.Name -like "*PROD*") { "Produccion" } 
                    elseif ($server.Name -like "*QA*" -or $server.Name -like "*TST*") { "QA" }
                    elseif ($server.Name -like "*DEV*") { "Desarrollo" }
                    else { "Otro" }
        $hostingSite = if ($server.ComputerName -like "*AWS*") { "AWS" } 
                       elseif ($server.ComputerName -like "*AZURE*") { "Azure" }
                       else { "OnPremise" }
        $sqlVersion = $server.VersionString
    }
    catch {
        Write-Warning "No se pudo conectar a ${instanceName}: $_"
        continue
    }
    
    # Obtener métricas
    $dbStatus = Get-DatabaseStatesStatus -Instance $instanceName
    
    if ($null -eq $dbStatus) {
        Write-Warning "Saltando $instanceName (sin datos)"
        continue
    }
    
    # Crear objeto de resultado
    $result = [PSCustomObject]@{
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
    
    # Guardar en SQL
    if (Write-ToSqlServer -Data $result) {
        $results += $result
        $totalProblematic = $result.OfflineCount + $result.SuspectCount + $result.EmergencyCount + $result.RecoveryPendingCount
        Write-Host "   ✓ $instanceName - Problematic DBs: $totalProblematic" -ForegroundColor Gray
    }
}

Write-Progress -Activity "Recolectando database states" -Completed

# 3. Resumen
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host " RESUMEN - DATABASE STATES" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Total instancias procesadas: $($results.Count)" -ForegroundColor White
Write-Host "  DBs Offline: $(($results | Measure-Object -Property OfflineCount -Sum).Sum)" -ForegroundColor White
Write-Host "  DBs Suspect: $(($results | Measure-Object -Property SuspectCount -Sum).Sum)" -ForegroundColor White
Write-Host "  DBs Emergency: $(($results | Measure-Object -Property EmergencyCount -Sum).Sum)" -ForegroundColor White
Write-Host "  Suspect Pages: $(($results | Measure-Object -Property SuspectPageCount -Sum).Sum)" -ForegroundColor White
Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Recoleccion completada!" -ForegroundColor Green

#endregion

