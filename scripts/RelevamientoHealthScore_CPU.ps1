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
        $versionResult = Invoke-Sqlcmd -ServerInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -TrustServerCertificate
        $version = [int]($versionResult.Version.Split('.')[0])
        
        # Para SQL 2005/2008 (versiones 9.x y 10.x), usar query simplificada
        if ($version -le 10) {
            $query = @"
-- Aproximación de CPU basada en schedulers activos (SQL 2005/2008)
-- Usar current_tasks_count y work_queue_count como indicadores
SELECT 
    ISNULL(SUM(current_tasks_count), 0) AS TotalCurrentTasks,
    ISNULL(SUM(work_queue_count), 0) AS TotalWorkQueue,
    ISNULL(SUM(runnable_tasks_count), 0) AS RunnableTasksTotal,
    COUNT(*) AS ActiveSchedulers
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255
  AND status = 'VISIBLE ONLINE';

-- Runnable tasks (schedulers con tareas esperando CPU) - Compatible con SQL 2005+
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
        
        $datasets = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate
        
        if ($datasets -and $datasets.Tables.Count -gt 0) {
            # Procesar múltiples resultsets correctamente
            $resultSets = $datasets.Tables
            
            if ($version -le 10) {
                # SQL 2005/2008: Procesar resultsets simplificados
                # ResultSet 1: Métricas de schedulers
                if ($resultSets.Count -ge 1 -and $resultSets[0].Rows.Count -gt 0) {
                    $schedulerData = $resultSets[0].Rows[0]
                    
                    $totalTasks = if ($schedulerData.TotalCurrentTasks -ne [DBNull]::Value) { [int]$schedulerData.TotalCurrentTasks } else { 0 }
                    $workQueue = if ($schedulerData.TotalWorkQueue -ne [DBNull]::Value) { [int]$schedulerData.TotalWorkQueue } else { 0 }
                    $runnableTotal = if ($schedulerData.RunnableTasksTotal -ne [DBNull]::Value) { [int]$schedulerData.RunnableTasksTotal } else { 0 }
                    $schedulers = if ($schedulerData.ActiveSchedulers -ne [DBNull]::Value) { [int]$schedulerData.ActiveSchedulers } else { 1 }
                    
                    # Aproximación de CPU basada en carga de schedulers
                    # Fórmula: (tareas_activas / schedulers) * factor_ajuste
                    # Factor de ajuste: 12 (para aproximar % de CPU cuando hay carga)
                    if ($schedulers -gt 0) {
                        $approxCPU = [int](($totalTasks / $schedulers) * 12)
                        # Agregar factor por work queue (indica presión adicional)
                        if ($workQueue -gt 0) {
                            $approxCPU += [int](($workQueue / $schedulers) * 5)
                        }
                        # Limitar a rango 0-100
                        if ($approxCPU -gt 100) { $approxCPU = 100 }
                        if ($approxCPU -lt 0) { $approxCPU = 0 }
                        
                        # Si hay tareas pero calculamos 0, al menos poner 1%
                        if ($approxCPU -eq 0 -and $totalTasks -gt 0) {
                            $approxCPU = 1
                        }
                        
                        $result.SQLProcessUtilization = $approxCPU
                        $result.AvgCPUPercentLast10Min = $approxCPU
                        $result.P95CPUPercent = $approxCPU
                        $result.SystemIdleProcess = 0  # No disponible en SQL 2005/2008
                        $result.OtherProcessUtilization = 0
                    }
                    
                    # Obtener RunnableTasksTotal
                    if ($runnableTotal -gt 0) {
                        $result.RunnableTasks = $runnableTotal
                    }
                }
                
                # ResultSet 2: Runnable tasks (contador de schedulers con tareas)
                if ($resultSets.Count -ge 2 -and $resultSets[1].Rows.Count -gt 0) {
                    $runnableData = $resultSets[1].Rows[0]
                    if ($runnableData.RunnableTasksCount -ne [DBNull]::Value) {
                        $runnableCount = [int]$runnableData.RunnableTasksCount
                        # Sobrescribir solo si tenemos un valor válido
                        if ($runnableCount -gt 0) {
                            $result.RunnableTasks = $runnableCount
                        }
                    }
                }
                
                # ResultSet 3: Pending I/O
                if ($resultSets.Count -ge 3 -and $resultSets[2].Rows.Count -gt 0) {
                    $ioData = $resultSets[2].Rows[0]
                    if ($ioData.PendingDiskIO -ne [DBNull]::Value) {
                        $result.PendingDiskIOCount = [int]$ioData.PendingDiskIO
                    }
                }
                
            } else {
                # SQL 2012+: Procesar resultsets completos
                # ResultSet 1: CPU Utilization (últimos 10 minutos)
                if ($resultSets.Count -ge 1 -and $resultSets[0].Rows.Count -gt 0) {
                    # Convertir DataTable rows a objetos PowerShell
                    $cpuRows = @()
                    foreach ($row in $resultSets[0].Rows) {
                        $cpuRows += [PSCustomObject]@{
                            SQLServerCPU = [int]$row.SQLServerCPU
                            SystemIdle = [int]$row.SystemIdle
                            OtherProcessCPU = [int]$row.OtherProcessCPU
                        }
                    }
                    
                    if ($cpuRows.Count -gt 0) {
                        # Calcular promedio
                        $result.AvgCPUPercentLast10Min = [int](($cpuRows | Measure-Object -Property SQLServerCPU -Average).Average)
                        
                        # Calcular P95 (percentil 95)
                        $sortedCPU = $cpuRows | Sort-Object -Property SQLServerCPU
                        $p95Index = [Math]::Floor($sortedCPU.Count * 0.95)
                        if ($p95Index -ge $sortedCPU.Count) { $p95Index = $sortedCPU.Count - 1 }
                        $result.P95CPUPercent = [int]$sortedCPU[$p95Index].SQLServerCPU
                        
                        # Últimos valores (primero en el resultset)
                        $latest = $cpuRows[0]
                        $result.SQLProcessUtilization = [int]$latest.SQLServerCPU
                        $result.SystemIdleProcess = [int]$latest.SystemIdle
                        $result.OtherProcessUtilization = [int]$latest.OtherProcessCPU
                    }
                }
                
                # ResultSet 2: Runnable tasks
                if ($resultSets.Count -ge 2 -and $resultSets[1].Rows.Count -gt 0) {
                    $runnableData = $resultSets[1].Rows[0]
                    if ($runnableData.RunnableTasksCount -ne [DBNull]::Value) {
                        $result.RunnableTasks = [int]$runnableData.RunnableTasksCount
                    }
                }
                
                # ResultSet 3: Pending I/O
                if ($resultSets.Count -ge 3 -and $resultSets[2].Rows.Count -gt 0) {
                    $ioData = $resultSets[2].Rows[0]
                    if ($ioData.PendingDiskIO -ne [DBNull]::Value) {
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
    GETDATE(),
    $($row.SQLProcessUtilization),
    $($row.SystemIdleProcess),
    $($row.OtherProcessUtilization),
    $($row.RunnableTasks),
    $($row.PendingDiskIOCount),
    $($row.AvgCPUPercentLast10Min),
    $($row.P95CPUPercent)
);
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate
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

