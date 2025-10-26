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

function Get-LogChainStatus {
    param([string]$Instance)
    
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
    FROM msdb.dbo.backupset
    WHERE type = 'D'
    GROUP BY database_name
) bs_full ON d.name = bs_full.database_name
LEFT JOIN (
    SELECT database_name, MAX(backup_finish_date) AS backup_finish_date
    FROM msdb.dbo.backupset
    WHERE type = 'L'
    GROUP BY database_name
) bs_log ON d.name = bs_log.database_name
WHERE d.database_id > 4  -- Excluir system databases
  AND d.state_desc = 'ONLINE'
  AND d.name NOT IN ('tempdb')
ORDER BY LogChainAtRisk DESC, HoursSinceLastLog DESC;
"@
    
    try {
        $results = Invoke-DbaQuery -SqlInstance $Instance -Query $query -QueryTimeout $TimeoutSec -EnableException
        
        $brokenChainDBs = ($results | Where-Object { $_.LogChainAtRisk -eq 1 }).Count
        $fullDBsWithoutLog = ($results | Where-Object { $_.RecoveryModel -eq 'FULL' -and $null -eq $_.LastLogBackup }).Count
        $maxHoursSinceLog = ($results | Where-Object { $_.RecoveryModel -eq 'FULL' } | Measure-Object -Property HoursSinceLastLog -Maximum).Maximum
        
        if ($null -eq $maxHoursSinceLog) { $maxHoursSinceLog = 0 }
        
        # Detalles en JSON
        $details = $results | Where-Object { $_.LogChainAtRisk -eq 1 } | Select-Object DatabaseName, RecoveryModel, HoursSinceLastLog, LogReuseWait | ConvertTo-Json -Compress
        if ($null -eq $details -or $details -eq "") { $details = "[]" }
        
        return @{
            BrokenChainCount = $brokenChainDBs
            FullDBsWithoutLogBackup = $fullDBsWithoutLog
            MaxHoursSinceLogBackup = $maxHoursSinceLog
            Details = $details
        }
    }
    catch {
        Write-Warning "Error obteniendo log chain status de ${Instance}: $_"
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
    $($row.BrokenChainCount),
    $($row.FullDBsWithoutLogBackup),
    $($row.MaxHoursSinceLogBackup),
    '$($row.LogChainDetails -replace "'", "''")'
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

# 2. Procesar cada instancia
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
    
    # Obtener métricas
    $logChainStatus = Get-LogChainStatus -Instance $instanceName
    
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
        LogChainDetails = ($logChainStatus.Details | ConvertTo-Json -Compress)
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

