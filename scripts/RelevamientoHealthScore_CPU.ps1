<#
.SYNOPSIS
    Health Score v3.0 - Recolección de métricas de CPU
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Uso de CPU (promedio y p95)
    - Runnable tasks (cola de espera de CPU)
    - Signal waits vs Resource waits
    
    Guarda en: InstanceHealth_CPU
    
    Peso en scoring: 10%
    Criterios: p95 ≤80% = 100, 81–90 = 70, >90 = 40
    Cap: RunnableTask >1 sostenido => cap 70
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 5 minutos
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

function Get-CPUMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        SQLProcessUtilization = 0
        SystemIdleProcess = 0
        OtherProcessUtilization = 0
        RunnableTasks = 0
        PendingDiskIOCount = 0
        AvgCPUPercentLast10Min = 0
        P95CPUPercent = 0
    }
    
    try {
        # Detectar versión de SQL Server
        $versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) AS Version;"
        $versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
        $version = [int]($versionResult.Version.Split('.')[0])
        
        # Para SQL 2005/2008 (versiones 9.x y 10.x), usar query simplificada
        if ($version -le 10) {
            $query = @"
-- Runnable tasks (tareas esperando CPU) - Compatible con SQL 2005+
SELECT 
    ISNULL(COUNT(*), 0) AS RunnableTasksCount
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE status = 'VISIBLE ONLINE'
  AND runnable_tasks_count > 0;

-- Work queued (I/O pendiente) - Compatible con SQL 2005+
SELECT 
    ISNULL(SUM(pending_disk_io_count), 0) AS PendingDiskIO
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255;

-- CPU Snapshot actual de Performance Counter
SELECT 
    CAST(ISNULL(cntr_value, 0) AS INT) AS CPUValue
FROM sys.dm_os_performance_counters WITH (NOLOCK)
WHERE counter_name LIKE 'CPU usage %'
  AND instance_name = 'default';
"@
        } else {
            # Para SQL 2012+ (versiones 11.x+), usar query completa
            $query = @"
-- CPU Utilization (últimos 10 minutos) - SQL 2012+
DECLARE @ts_now bigint;
SELECT @ts_now = cpu_ticks / (cpu_ticks / ms_ticks) FROM sys.dm_os_sys_info WITH (NOLOCK);

WITH CPUHistory AS (
    SELECT 
        record.value('(./Record/@id)[1]', 'int') AS record_id,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS SystemIdle,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS SQLProcessUtilization,
        [timestamp]
    FROM (
        SELECT [timestamp], CONVERT(xml, record) AS [record]
        FROM sys.dm_os_ring_buffers WITH (NOLOCK)
        WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
          AND record LIKE N'%<SystemHealth>%'
    ) AS x
)
SELECT TOP(10)
    DATEADD(ms, -1 * (@ts_now - [timestamp]), GETDATE()) AS EventTime,
    SQLProcessUtilization AS SQLServerCPU,
    SystemIdle,
    100 - SystemIdle - SQLProcessUtilization AS OtherProcessCPU
FROM CPUHistory
ORDER BY record_id DESC;

-- Runnable tasks (tareas esperando CPU)
SELECT 
    ISNULL(COUNT(*), 0) AS RunnableTasksCount
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE status = 'VISIBLE ONLINE'
  AND runnable_tasks_count > 0;

-- Work queued (I/O pendiente)
SELECT 
    ISNULL(SUM(pending_disk_io_count), 0) AS PendingDiskIO
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255;
"@
        }
        
        $data = Invoke-DbaQuery -SqlInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        if ($data) {
            # Procesar múltiples resultsets
            $resultSets = @($data)
            
            if ($version -le 10) {
                # SQL 2005/2008: Procesar resultsets simplificados
                # ResultSet 1: Runnable tasks
                if ($resultSets.Count -ge 1 -and $resultSets[0]) {
                    $runnableData = $resultSets[0] | Select-Object -First 1
                    if ($runnableData -and $runnableData.RunnableTasksCount -ne [DBNull]::Value) {
                        $result.RunnableTasks = [int]$runnableData.RunnableTasksCount
                    }
                }
                
                # ResultSet 2: Pending I/O
                if ($resultSets.Count -ge 2 -and $resultSets[1]) {
                    $ioData = $resultSets[1] | Select-Object -First 1
                    if ($ioData -and $ioData.PendingDiskIO -ne [DBNull]::Value) {
                        $result.PendingDiskIOCount = [int]$ioData.PendingDiskIO
                    }
                }
                
                # ResultSet 3: CPU Value (snapshot actual)
                if ($resultSets.Count -ge 3 -and $resultSets[2]) {
                    $cpuData = $resultSets[2] | Select-Object -First 1
                    if ($cpuData -and $cpuData.CPUValue -ne [DBNull]::Value) {
                        $cpuValue = [int]$cpuData.CPUValue
                        # Usar el valor actual como promedio y p95 (no hay histórico)
                        $result.SQLProcessUtilization = $cpuValue
                        $result.AvgCPUPercentLast10Min = $cpuValue
                        $result.P95CPUPercent = $cpuValue
                        $result.SystemIdleProcess = 0  # No disponible en SQL 2005/2008
                        $result.OtherProcessUtilization = 0
                    }
                }
                
            } else {
                # SQL 2012+: Procesar resultsets completos
                # ResultSet 1: CPU Utilization (últimos 10 minutos)
                if ($resultSets.Count -ge 1 -and $resultSets[0]) {
                    $cpuData = $resultSets[0]
                    
                    if ($cpuData -and $cpuData.Count -gt 0) {
                        # Calcular promedio
                        $result.AvgCPUPercentLast10Min = [int](($cpuData | Measure-Object -Property SQLServerCPU -Average).Average)
                        
                        # Calcular P95 (percentil 95)
                        $sortedCPU = $cpuData | Sort-Object -Property SQLServerCPU
                        $p95Index = [Math]::Floor($sortedCPU.Count * 0.95)
                        if ($p95Index -ge $sortedCPU.Count) { $p95Index = $sortedCPU.Count - 1 }
                        $result.P95CPUPercent = [int]$sortedCPU[$p95Index].SQLServerCPU
                        
                        # Últimos valores
                        $latest = $cpuData | Select-Object -First 1
                        $result.SQLProcessUtilization = [int]$latest.SQLServerCPU
                        $result.SystemIdleProcess = [int]$latest.SystemIdle
                        $result.OtherProcessUtilization = [int]$latest.OtherProcessCPU
                    }
                }
                
                # ResultSet 2: Runnable tasks
                if ($resultSets.Count -ge 2 -and $resultSets[1]) {
                    $runnableData = $resultSets[1] | Select-Object -First 1
                    if ($runnableData -and $runnableData.RunnableTasksCount -ne [DBNull]::Value) {
                        $result.RunnableTasks = [int]$runnableData.RunnableTasksCount
                    }
                }
                
                # ResultSet 3: Pending I/O
                if ($resultSets.Count -ge 3 -and $resultSets[2]) {
                    $ioData = $resultSets[2] | Select-Object -First 1
                    if ($ioData -and $ioData.PendingDiskIO -ne [DBNull]::Value) {
                        $result.PendingDiskIOCount = [int]$ioData.PendingDiskIO
                    }
                }
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo CPU metrics en ${InstanceName}: $($_.Exception.Message)"
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
            $query = @"
INSERT INTO dbo.InstanceHealth_CPU (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    SQLProcessUtilization,
    SystemIdleProcess,
    OtherProcessUtilization,
    RunnableTasks,
    PendingDiskIOCount,
    AvgCPUPercentLast10Min,
    P95CPUPercent
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETUTCDATE(),
    $($row.SQLProcessUtilization),
    $($row.SystemIdleProcess),
    $($row.OtherProcessUtilization),
    $($row.RunnableTasks),
    $($row.PendingDiskIOCount),
    $($row.AvgCPUPercentLast10Min),
    $($row.P95CPUPercent)
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
Write-Host "║  Health Score v3.0 - CPU METRICS                     ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 5 minutos                                ║" -ForegroundColor Cyan
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
Write-Host "2️⃣  Recolectando métricas de CPU..." -ForegroundColor Yellow

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
    
    $cpuMetrics = Get-CPUMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    $status = "✅"
    if ($cpuMetrics.P95CPUPercent -gt 90) {
        $status = "🚨 CPU HIGH!"
    }
    elseif ($cpuMetrics.RunnableTasks -gt 1) {
        $status = "⚠️ RUNNABLE!"
    }
    elseif ($cpuMetrics.P95CPUPercent -gt 80) {
        $status = "⚠️ CPU WARN"
    }
    
    Write-Host "   $status $instanceName - Avg:$($cpuMetrics.AvgCPUPercentLast10Min)% P95:$($cpuMetrics.P95CPUPercent)% Runnable:$($cpuMetrics.RunnableTasks)" -ForegroundColor Gray
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        SQLProcessUtilization = $cpuMetrics.SQLProcessUtilization
        SystemIdleProcess = $cpuMetrics.SystemIdleProcess
        OtherProcessUtilization = $cpuMetrics.OtherProcessUtilization
        RunnableTasks = $cpuMetrics.RunnableTasks
        PendingDiskIOCount = $cpuMetrics.PendingDiskIOCount
        AvgCPUPercentLast10Min = $cpuMetrics.AvgCPUPercentLast10Min
        P95CPUPercent = $cpuMetrics.P95CPUPercent
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
Write-Host "║  RESUMEN - CPU                                        ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgCPU = ($results | Measure-Object -Property AvgCPUPercentLast10Min -Average).Average
Write-Host "║  CPU promedio:         $([int]$avgCPU)%".PadRight(53) "║" -ForegroundColor White

$highCPU = ($results | Where-Object {$_.P95CPUPercent -gt 80}).Count
Write-Host "║  CPU alto (>80%):      $highCPU".PadRight(53) "║" -ForegroundColor White

$withRunnable = ($results | Where-Object {$_.RunnableTasks -gt 0}).Count
Write-Host "║  Con runnable tasks:   $withRunnable".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Script completado!" -ForegroundColor Green

#endregion

