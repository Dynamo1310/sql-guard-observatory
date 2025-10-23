# Script de prueba para diagnosticar detección de backups

param(
    [Parameter(Mandatory=$true)]
    [string]$InstanceName
)

Write-Host ""
Write-Host "=== TEST DE DETECCIÓN DE BACKUPS ===" -ForegroundColor Cyan
Write-Host "Instancia: $InstanceName" -ForegroundColor Cyan
Write-Host ""

# 1. Probar consulta de bases de datos
Write-Host "[1] Bases de datos ONLINE (sin sistema):" -ForegroundColor Yellow
$queryBases = @"
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    d.state_desc AS State
FROM sys.databases d
WHERE d.database_id > 4
  AND d.state = 0
  AND d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
ORDER BY d.name
"@

try {
    $bases = Invoke-Sqlcmd -ServerInstance $InstanceName -Query $queryBases -TrustServerCertificate -ErrorAction Stop
    Write-Host "  Encontradas: $($bases.Count) base(s)" -ForegroundColor Green
    $bases | Format-Table -AutoSize
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""

# 2. Probar consulta de backups (versión con subqueries)
Write-Host "[2] Backups detectados (método subqueries):" -ForegroundColor Yellow
$queryBackups1 = @"
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
WHERE d.database_id > 4
  AND d.state = 0
  AND d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
ORDER BY d.name
"@

try {
    $backups1 = Invoke-Sqlcmd -ServerInstance $InstanceName -Query $queryBackups1 -TrustServerCertificate -ErrorAction Stop
    Write-Host "  Encontradas: $($backups1.Count) base(s) con info de backup" -ForegroundColor Green
    
    foreach ($db in $backups1) {
        Write-Host "  - $($db.DatabaseName) ($($db.RecoveryModel))" -ForegroundColor White
        if ($db.LastFullBackup) {
            Write-Host "      FULL: $($db.LastFullBackup)" -ForegroundColor Green
        } else {
            Write-Host "      FULL: (ninguno)" -ForegroundColor Red
        }
        
        if ($db.LastLogBackup) {
            Write-Host "      LOG:  $($db.LastLogBackup)" -ForegroundColor Green
        } else {
            if ($db.RecoveryModel -in @('FULL', 'BULK_LOGGED')) {
                Write-Host "      LOG:  (ninguno)" -ForegroundColor Red
            } else {
                Write-Host "      LOG:  (N/A - SIMPLE)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Probar consulta de backups directo de msdb
Write-Host "[3] Últimos 10 backups en msdb.dbo.backupset:" -ForegroundColor Yellow
$queryBackupset = @"
SELECT TOP 10
    database_name,
    type,
    CASE type
        WHEN 'D' THEN 'FULL'
        WHEN 'I' THEN 'DIFF'
        WHEN 'L' THEN 'LOG'
        ELSE type
    END AS BackupType,
    backup_finish_date,
    DATEDIFF(HOUR, backup_finish_date, GETDATE()) AS HoursAgo
FROM msdb.dbo.backupset
WHERE database_name NOT IN ('master', 'model', 'msdb', 'tempdb')
ORDER BY backup_finish_date DESC
"@

try {
    $backupset = Invoke-Sqlcmd -ServerInstance $InstanceName -Query $queryBackupset -TrustServerCertificate -ErrorAction Stop
    if ($backupset.Count -gt 0) {
        Write-Host "  Últimos backups registrados:" -ForegroundColor Green
        $backupset | Format-Table database_name, BackupType, backup_finish_date, HoursAgo -AutoSize
    } else {
        Write-Host "  NO hay backups registrados en msdb.dbo.backupset" -ForegroundColor Red
    }
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 4. Resumen
Write-Host "[RESUMEN]" -ForegroundColor Cyan
$basesConFullBackup = ($backups1 | Where-Object { $_.LastFullBackup -ne $null }).Count
$basesConLogBackup = ($backups1 | Where-Object { $_.LastLogBackup -ne $null }).Count
$basesSinFullBackup = ($backups1 | Where-Object { $_.LastFullBackup -eq $null }).Count

Write-Host "  Bases con FULL backup: $basesConFullBackup de $($backups1.Count)" -ForegroundColor $(if ($basesConFullBackup -eq $backups1.Count) { "Green" } else { "Yellow" })
Write-Host "  Bases con LOG backup:  $basesConLogBackup" -ForegroundColor $(if ($basesConLogBackup -gt 0) { "Green" } else { "Yellow" })
Write-Host "  Bases SIN FULL backup: $basesSinFullBackup" -ForegroundColor $(if ($basesSinFullBackup -eq 0) { "Green" } else { "Red" })

if ($basesSinFullBackup -gt 0) {
    Write-Host ""
    Write-Host "  ⚠️  BASES SIN FULL BACKUP:" -ForegroundColor Red
    $backups1 | Where-Object { $_.LastFullBackup -eq $null } | ForEach-Object {
        Write-Host "     - $($_.DatabaseName)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== FIN DEL TEST ===" -ForegroundColor Cyan

