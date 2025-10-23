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
$TestMode = $false
$IncludeAWS = $false  # Cambiar a $true para incluir AWS
$OnlyAWS = $false     # Cambiar a $true para SOLO AWS

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
    CollectedAtUtc,
    LastFullBackup,
    LastLogBackup,
    FullBackupBreached,
    LogBackupBreached,
    BackupDetails
) VALUES (
    '$($row.InstanceName)',
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
        LastFullBackup = $backups.LastFullBackup
        LastLogBackup = $backups.LastLogBackup
        FullBackupBreached = $backups.FullBackupBreached
        LogBackupBreached = $backups.LogBackupBreached
        BackupDetails = $backups.Details
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
