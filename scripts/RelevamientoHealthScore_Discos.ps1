<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de ESPACIO EN DISCOS
    
.DESCRIPTION
    Script de frecuencia media (cada 10 minutos) que recolecta:
    - Espacio libre por disco/volumen
    - Clasificación por rol (Data, Log, Backup, TempDB)
    - Tendencia de crecimiento
    
    Guarda en: InstanceHealth_Discos
    
    Peso en scoring: 8%
    Criterios: ≥20% libre = 100, 15–19% = 80, 10–14% = 60, 5–9% = 40, <5% = 0
    Cap: Data o Log <10% libre => cap 40
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 10 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "❌ dbatools no está instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false
$IncludeAWS = $false
$OnlyAWS = $false

#endregion

#region ===== FUNCIONES =====

function Get-DiskMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        WorstFreePct = 100
        DataDiskAvgFreePct = 100
        LogDiskAvgFreePct = 100
        TempDBDiskFreePct = 100
        Volumes = @()
        DataVolumes = @()
        LogVolumes = @()
    }
    
    try {
        $query = @"
-- Espacio en discos con clasificación por rol
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct,
    -- Determinar rol del disco basado en tipo de archivo
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole,
    DB_NAME(mf.database_id) AS DatabaseName,
    mf.type_desc AS FileType
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
"@
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            # Procesar todos los volúmenes
            $result.Volumes = $data | ForEach-Object {
                @{
                    MountPoint = $_.MountPoint
                    VolumeName = $_.VolumeName
                    TotalGB = [decimal]$_.TotalGB
                    FreeGB = [decimal]$_.FreeGB
                    FreePct = [decimal]$_.FreePct
                    DiskRole = $_.DiskRole
                    DatabaseName = $_.DatabaseName
                }
            }
            
            # Peor porcentaje libre
            $result.WorstFreePct = [decimal](($data | Measure-Object -Property FreePct -Minimum).Minimum)
            
            # Promedio por rol
            $dataDisks = $data | Where-Object { $_.DiskRole -eq 'Data' } | Select-Object -Unique MountPoint, FreePct
            if ($dataDisks) {
                $result.DataDiskAvgFreePct = [decimal](($dataDisks | Measure-Object -Property FreePct -Average).Average)
                $result.DataVolumes = $dataDisks | ForEach-Object { $_.MountPoint }
            }
            
            $logDisks = $data | Where-Object { $_.DiskRole -eq 'Log' } | Select-Object -Unique MountPoint, FreePct
            if ($logDisks) {
                $result.LogDiskAvgFreePct = [decimal](($logDisks | Measure-Object -Property FreePct -Average).Average)
                $result.LogVolumes = $logDisks | ForEach-Object { $_.MountPoint }
            }
            
            $tempdbDisks = $data | Where-Object { $_.DiskRole -eq 'TempDB' } | Select-Object -Unique MountPoint, FreePct
            if ($tempdbDisks) {
                $result.TempDBDiskFreePct = [decimal](($tempdbDisks | Measure-Object -Property FreePct -Average).Average)
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo disk metrics en ${InstanceName}: $($_.Exception.Message)"
    }
    
    return $result
}

function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10
    )
    
    try {
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
            # Convertir volumes a JSON
            $volumesJson = ($row.Volumes | ConvertTo-Json -Compress -Depth 3) -replace "'", "''"
            
            $query = @"
INSERT INTO dbo.InstanceHealth_Discos (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    WorstFreePct,
    DataDiskAvgFreePct,
    LogDiskAvgFreePct,
    TempDBDiskFreePct,
    VolumesJson
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.WorstFreePct),
    $($row.DataDiskAvgFreePct),
    $($row.LogDiskAvgFreePct),
    $($row.TempDBDiskFreePct),
    '$volumesJson'
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
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v3.0 - ESPACIO EN DISCOS               ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 10 minutos                               ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de discos..." -ForegroundColor Yellow

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
    
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   ⚠️  $instanceName - SIN CONEXIÓN (skipped)" -ForegroundColor Red
        continue
    }
    
    $diskMetrics = Get-DiskMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($diskMetrics.WorstFreePct -lt 5) {
        $status = "🚨 CRÍTICO!"
    }
    elseif ($diskMetrics.DataDiskAvgFreePct -lt 10 -or $diskMetrics.LogDiskAvgFreePct -lt 10) {
        $status = "🚨 DATA/LOG BAJO!"
    }
    elseif ($diskMetrics.WorstFreePct -lt 10) {
        $status = "⚠️ BAJO!"
    }
    elseif ($diskMetrics.WorstFreePct -lt 20) {
        $status = "⚠️ ADVERTENCIA"
    }
    
    Write-Host "   $status $instanceName - Worst:$([int]$diskMetrics.WorstFreePct)% Data:$([int]$diskMetrics.DataDiskAvgFreePct)% Log:$([int]$diskMetrics.LogDiskAvgFreePct)%" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        WorstFreePct = $diskMetrics.WorstFreePct
        DataDiskAvgFreePct = $diskMetrics.DataDiskAvgFreePct
        LogDiskAvgFreePct = $diskMetrics.LogDiskAvgFreePct
        TempDBDiskFreePct = $diskMetrics.TempDBDiskFreePct
        Volumes = $diskMetrics.Volumes
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
Write-Host "║  RESUMEN - DISCOS                                     ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgWorst = ($results | Measure-Object -Property WorstFreePct -Average).Average
$avgData = ($results | Measure-Object -Property DataDiskAvgFreePct -Average).Average
$avgLog = ($results | Measure-Object -Property LogDiskAvgFreePct -Average).Average

Write-Host "║  Worst % promedio:     $([int]$avgWorst)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Data % promedio:      $([int]$avgData)%".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Log % promedio:       $([int]$avgLog)%".PadRight(53) "║" -ForegroundColor White

$critical = ($results | Where-Object {$_.WorstFreePct -lt 10}).Count
Write-Host "║  Discos críticos (<10%): $critical".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

