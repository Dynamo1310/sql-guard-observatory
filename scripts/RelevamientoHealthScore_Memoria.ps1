<#
.SYNOPSIS
    Health Score v3.0 - RecolecciÃ³n de mÃ©tricas de MEMORIA
    
.DESCRIPTION
    Script de frecuencia media (cada 5 minutos) que recolecta:
    - Page Life Expectancy (PLE)
    - Memory Grants pendientes y activos
    - Uso de memoria total y por buffer pool
    - Buffer cache hit ratio
    
    Guarda en: InstanceHealth_Memoria
    
    Peso en scoring: 7%
    FÃ³rmula: 0.6Ã—PLE + 0.25Ã—MemoryGrants + 0.15Ã—UsoMemoria
    PLE objetivo = 300 s Ã— GB buffer pool
    Cap: PLE <0.15Ã—objetivo o Grants>10 => cap 60
    
.NOTES
    VersiÃ³n: 3.0
    Frecuencia: Cada 5 minutos
    Timeout: 15 segundos
    
.REQUIRES
    - dbatools (Install-Module -Name dbatools -Force)
    - PowerShell 5.1 o superior
#>

[CmdletBinding()]
param()

if (-not (Get-Module -ListAvailable -Name dbatools)) {
    Write-Error "âŒ dbatools no estÃ¡ instalado. Ejecuta: Install-Module -Name dbatools -Force"
    exit 1
}

if (Get-Module -Name SqlServer) {
    Remove-Module SqlServer -Force -ErrorAction SilentlyContinue
}

Import-Module dbatools -Force

#region ===== CONFIGURACIÃ“N =====

$ApiUrl = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 15
$TestMode = $false
$IncludeAWS = $false
$OnlyAWS = $false

#endregion

#region ===== FUNCIONES =====

function Get-MemoryMetrics {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 15
    )
    
    $result = @{
        PageLifeExpectancy = 0
        BufferCacheHitRatio = 100.0
        TotalServerMemoryMB = 0
        TargetServerMemoryMB = 0
        MaxServerMemoryMB = 0
        BufferPoolSizeMB = 0
        MemoryGrantsPending = 0
        MemoryGrantsActive = 0
        PLETarget = 0
        MemoryPressure = $false
        StolenServerMemoryMB = 0  # NUEVO: Memoria robada del buffer pool
    }
    
    try {
        # Detectar versiÃ³n de SQL Server para compatibilidad
        $versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS Version;"
        $versionResult = Invoke-Sqlcmd -ServerInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -TrustServerCertificate
        $version = $versionResult.Version
        $majorVersion = [int]($version.Split('.')[0])
        
        # SQL 2008/2008 R2 usan nombres diferentes en sys.dm_os_sys_info
        $sysInfoQuery = if ($majorVersion -le 10) {
            # SQL 2008/2008 R2
            @"
SELECT 
    physical_memory_in_bytes / 1024 / 1024 AS TotalPhysicalMemoryMB,
    bpool_committed / 128 AS CommittedMemoryMB,
    bpool_commit_target / 128 AS CommittedTargetMB
FROM sys.dm_os_sys_info;
"@
        } else {
            # SQL 2012+
            @"
SELECT 
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    committed_kb / 1024 AS CommittedMemoryMB,
    committed_target_kb / 1024 AS CommittedTargetMB
FROM sys.dm_os_sys_info;
"@
        }
        
        $query = @"
-- Memory counters
SELECT 
    counter_name,
    cntr_value
FROM sys.dm_os_performance_counters WITH (NOLOCK)
WHERE object_name LIKE '%Buffer Manager%'
   OR object_name LIKE '%Memory Manager%'
ORDER BY counter_name;

-- Memory Grants
SELECT 
    COUNT(*) AS GrantsPending
FROM sys.dm_exec_query_memory_grants WITH (NOLOCK)
WHERE grant_time IS NULL;

SELECT 
    COUNT(*) AS GrantsActive
FROM sys.dm_exec_query_memory_grants WITH (NOLOCK)
WHERE grant_time IS NOT NULL;

-- Server Memory (version-specific)
$sysInfoQuery

-- Max Server Memory configurado
SELECT 
    CAST(value AS INT) AS MaxServerMemoryMB
FROM sys.configurations WITH (NOLOCK)
WHERE name = 'max server memory (MB)';
"@
        
        $data = Invoke-Sqlcmd -ServerInstance $InstanceName `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -As DataSet  # â† Forzar a devolver como DataSet para mÃºltiples resultsets
        
        if ($data -and $data.Tables.Count -gt 0) {
            # Procesar mÃºltiples resultsets desde DataSet
            
            # ResultSet 1: Performance Counters
            if ($data.Tables.Count -ge 1) {
                $counters = $data.Tables[0].Rows
                
                foreach ($counter in $counters) {
                    $counterName = $counter.counter_name
                    $counterValue = $counter.cntr_value
                    
                    if ($counterName -like '*Page life expectancy*') {
                        $result.PageLifeExpectancy = [int]$counterValue
                    }
                    elseif ($counterName -like '*Buffer cache hit ratio*' -and $counterName -notlike '*base*') {
                        # Necesitamos el ratio y la base
                        $ratioValue = $counterValue
                        $baseValue = ($counters | Where-Object { $_.counter_name -like '*Buffer cache hit ratio base*' }).cntr_value
                        if ($baseValue -and $baseValue -gt 0) {
                            $result.BufferCacheHitRatio = [decimal](($ratioValue * 100.0) / $baseValue)
                        }
                    }
                    elseif ($counterName -like '*Total Server Memory*') {
                        $result.TotalServerMemoryMB = [int]($counterValue / 1024)
                    }
                    elseif ($counterName -like '*Target Server Memory*') {
                        $result.TargetServerMemoryMB = [int]($counterValue / 1024)
                    }
                    elseif ($counterName -like '*Stolen Server Memory*') {
                        # Stolen memory: memoria usada por objetos fuera del buffer pool
                        $result.StolenServerMemoryMB = [int]($counterValue / 1024)
                    }
                }
            }
            
            # ResultSet 2: Memory Grants Pending
            if ($data.Tables.Count -ge 2 -and $data.Tables[1].Rows.Count -gt 0) {
                $grantsPending = $data.Tables[1].Rows[0]
                if ($grantsPending.GrantsPending -ne [DBNull]::Value) {
                    $result.MemoryGrantsPending = [int]$grantsPending.GrantsPending
                }
            }
            
            # ResultSet 3: Memory Grants Active
            if ($data.Tables.Count -ge 3 -and $data.Tables[2].Rows.Count -gt 0) {
                $grantsActive = $data.Tables[2].Rows[0]
                if ($grantsActive.GrantsActive -ne [DBNull]::Value) {
                    $result.MemoryGrantsActive = [int]$grantsActive.GrantsActive
                }
            }
            
            # ResultSet 4: System Info (no usado directamente)
            # if ($data.Tables.Count -ge 4 -and $data.Tables[3].Rows.Count -gt 0) { }
            
            # ResultSet 5: Max Server Memory
            if ($data.Tables.Count -ge 5 -and $data.Tables[4].Rows.Count -gt 0) {
                $maxMem = $data.Tables[4].Rows[0]
                if ($maxMem.MaxServerMemoryMB -ne [DBNull]::Value) {
                    $result.MaxServerMemoryMB = [int]$maxMem.MaxServerMemoryMB
                }
            }
            
            # Calcular buffer pool size y PLE target
            if ($result.TotalServerMemoryMB -gt 0) {
                $result.BufferPoolSizeMB = $result.TotalServerMemoryMB
                $bufferPoolGB = $result.BufferPoolSizeMB / 1024.0
                $result.PLETarget = [int]($bufferPoolGB * 300)  # 300 segundos por GB
            }
            
            # Determinar memory pressure
            if ($result.PageLifeExpectancy -lt ($result.PLETarget * 0.5) -or $result.MemoryGrantsPending -gt 10) {
                $result.MemoryPressure = $true
            }
        }
        
    } catch {
        Write-Warning "Error obteniendo memory metrics en ${InstanceName}: $($_.Exception.Message)"
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
INSERT INTO dbo.InstanceHealth_Memoria (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    PageLifeExpectancy,
    BufferCacheHitRatio,
    TotalServerMemoryMB,
    TargetServerMemoryMB,
    MaxServerMemoryMB,
    BufferPoolSizeMB,
    MemoryGrantsPending,
    MemoryGrantsActive,
    PLETarget,
    MemoryPressure,
    StolenServerMemoryMB
) VALUES (
    '$($row.InstanceName)',
    '$($row.Ambiente)',
    '$($row.HostingSite)',
    '$($row.SqlVersion)',
    GETDATE(),
    $($row.PageLifeExpectancy),
    $($row.BufferCacheHitRatio),
    $($row.TotalServerMemoryMB),
    $($row.TargetServerMemoryMB),
    $($row.MaxServerMemoryMB),
    $($row.BufferPoolSizeMB),
    $($row.MemoryGrantsPending),
    $($row.MemoryGrantsActive),
    $($row.PLETarget),
    $(if ($row.MemoryPressure) {1} else {0}),
    $(if ($row.StolenServerMemoryMB) {$row.StolenServerMemoryMB} else {0})
);
"@
            
            Invoke-Sqlcmd -ServerInstance $SqlServer `
                -Database $SqlDatabase `
                -Query $query `
                -QueryTimeout 30 `
                -TrustServerCertificate
        }
        
        Write-Host "âœ… Guardados $($Data.Count) registros en SQL Server" -ForegroundColor Green
        
    } catch {
        Write-Error "Error guardando en SQL: $($_.Exception.Message)"
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Cyan
Write-Host "â•‘  Health Score v3.0 - MEMORIA METRICS                 â•‘" -ForegroundColor Cyan
Write-Host "â•‘  Frecuencia: 5 minutos                                â•‘" -ForegroundColor Cyan
Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Cyan
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
Write-Host "2ï¸âƒ£  Recolectando mÃ©tricas de memoria..." -ForegroundColor Yellow

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
    
    if (-not (Test-SqlConnection -InstanceName $instanceName -TimeoutSec $TimeoutSec)) {
        Write-Host "   âš ï¸  $instanceName - SIN CONEXIÃ“N (skipped)" -ForegroundColor Red
        continue
    }
    
    $memMetrics = Get-MemoryMetrics -InstanceName $instanceName -TimeoutSec $TimeoutSec
    
    # LÃ³gica de alertas mejorada
    $status = "âœ…"
    $alerts = @()
    
    # No alertar si PLE y Target son ambos 0 (indica error de recolecciÃ³n, no problema real)
    $hasValidPLE = $memMetrics.PageLifeExpectancy -gt 0 -or $memMetrics.PLETarget -gt 0
    
    if ($hasValidPLE) {
        if ($memMetrics.MemoryPressure) {
            $status = "ðŸš¨ PRESSURE!"
            $alerts += "Memory Pressure"
        }
        elseif ($memMetrics.PageLifeExpectancy -gt 0 -and $memMetrics.PageLifeExpectancy -lt 300) {
            $status = "âš ï¸ LOW PLE!"
            $alerts += "PLE < 300s"
        }
    }
    
    if ($memMetrics.MemoryGrantsPending -gt 5) {
        if ($status -eq "âœ…") { $status = "âš ï¸ GRANTS!" }
        $alerts += "Grants Pending: $($memMetrics.MemoryGrantsPending)"
    }
    
    # Display mejorado de porcentajes (truncar valores absurdos)
    $pleDisplay = ""
    if ($memMetrics.PLETarget -gt 0) {
        $pleRatio = [decimal](($memMetrics.PageLifeExpectancy * 100.0) / $memMetrics.PLETarget)
        if ($pleRatio -gt 999) {
            $pleDisplay = "(>999%)"  # Truncar valores absurdos
        } else {
            $pleDisplay = "($([int]$pleRatio)%)"
        }
    } else {
        $pleDisplay = "(N/A)"
    }
    
    # Mostrar Stolen Memory si es significativo
    $stolenInfo = ""
    if ($memMetrics.StolenServerMemoryMB -gt 0) {
        $stolenPct = if ($memMetrics.TotalServerMemoryMB -gt 0) {
            [int](($memMetrics.StolenServerMemoryMB * 100.0) / $memMetrics.TotalServerMemoryMB)
        } else { 0 }
        
        if ($stolenPct -gt 30) {
            $stolenInfo = " Stolen:${stolenPct}%âš ï¸"
            if ($status -eq "âœ…") { $status = "âš ï¸ Stolen!" }
        }
        elseif ($stolenPct -gt 20) {
            $stolenInfo = " Stolen:${stolenPct}%"
        }
    }
    
    Write-Host "   $status $instanceName - PLE:$($memMetrics.PageLifeExpectancy)s $pleDisplay Target:$($memMetrics.PLETarget)s Grants:$($memMetrics.MemoryGrantsPending)$stolenInfo" -ForegroundColor $(if ($status -like "*ðŸš¨*") { "Red" } elseif ($status -like "*âš ï¸*") { "Yellow" } else { "Gray" })
    
    $results += [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $ambiente
        HostingSite = $hostingSite
        SqlVersion = $sqlVersion
        PageLifeExpectancy = $memMetrics.PageLifeExpectancy
        BufferCacheHitRatio = $memMetrics.BufferCacheHitRatio
        TotalServerMemoryMB = $memMetrics.TotalServerMemoryMB
        TargetServerMemoryMB = $memMetrics.TargetServerMemoryMB
        MaxServerMemoryMB = $memMetrics.MaxServerMemoryMB
        BufferPoolSizeMB = $memMetrics.BufferPoolSizeMB
        MemoryGrantsPending = $memMetrics.MemoryGrantsPending
        MemoryGrantsActive = $memMetrics.MemoryGrantsActive
        PLETarget = $memMetrics.PLETarget
        MemoryPressure = $memMetrics.MemoryPressure
        StolenServerMemoryMB = $memMetrics.StolenServerMemoryMB  # NUEVO
    }
}

Write-Progress -Activity "Recolectando mÃ©tricas" -Completed

# 3. Guardar en SQL
Write-Host ""
Write-Host "3ï¸âƒ£  Guardando en SQL Server..." -ForegroundColor Yellow

Write-ToSqlServer -Data $results

# 4. Resumen
Write-Host ""
Write-Host "â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—" -ForegroundColor Cyan
Write-Host "â•‘  RESUMEN - MEMORIA                                    â•‘" -ForegroundColor Cyan
Write-Host "â• â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•£" -ForegroundColor Cyan
Write-Host "â•‘  Total instancias:        $($results.Count.ToString().PadLeft(3))                       â•‘" -ForegroundColor Cyan

# Page Life Expectancy
$avgPLE = ($results | Measure-Object -Property PageLifeExpectancy -Average).Average
$lowPLE = ($results | Where-Object {$_.PageLifeExpectancy -gt 0 -and $_.PageLifeExpectancy -lt 300}).Count
$criticalPLE = ($results | Where-Object {$_.PageLifeExpectancy -gt 0 -and $_.PageLifeExpectancy -lt 100}).Count
Write-Host "â•‘  PLE promedio:            $([int]$avgPLE)s".PadRight(53) "â•‘" -ForegroundColor Cyan
Write-Host "â•‘  PLE bajo (<300s):        $(${lowPLE}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($lowPLE -gt 0) { "Yellow" } else { "Cyan" })
Write-Host "â•‘  PLE crÃ­tico (<100s):     $(${criticalPLE}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($criticalPLE -gt 0) { "Red" } else { "Cyan" })

# Memory Pressure
$withPressure = ($results | Where-Object {$_.MemoryPressure}).Count
Write-Host "â•‘  Con memory pressure:     $(${withPressure}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($withPressure -gt 0) { "Red" } else { "Cyan" })

# Memory Grants
$highGrants = ($results | Where-Object {$_.MemoryGrantsPending -gt 10}).Count
$moderateGrants = ($results | Where-Object {$_.MemoryGrantsPending -gt 5 -and $_.MemoryGrantsPending -le 10}).Count
Write-Host "â•‘  Grants Pending >10:      $(${highGrants}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($highGrants -gt 0) { "Red" } else { "Cyan" })
Write-Host "â•‘  Grants Pending 5-10:     $(${moderateGrants}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($moderateGrants -gt 0) { "Yellow" } else { "Cyan" })

# Stolen Memory
$highStolen = ($results | Where-Object {
    $_.StolenServerMemoryMB -gt 0 -and $_.TotalServerMemoryMB -gt 0 -and 
    (($_.StolenServerMemoryMB * 100.0) / $_.TotalServerMemoryMB) -gt 30
}).Count
$moderateStolen = ($results | Where-Object {
    $_.StolenServerMemoryMB -gt 0 -and $_.TotalServerMemoryMB -gt 0 -and 
    (($_.StolenServerMemoryMB * 100.0) / $_.TotalServerMemoryMB) -gt 20 -and
    (($_.StolenServerMemoryMB * 100.0) / $_.TotalServerMemoryMB) -le 30
}).Count
Write-Host "â•‘  Stolen Memory >30%:      $(${highStolen}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($highStolen -gt 0) { "Red" } else { "Cyan" })
Write-Host "â•‘  Stolen Memory 20-30%:    $(${moderateStolen}.ToString().PadLeft(3))                       â•‘" -ForegroundColor $(if ($moderateStolen -gt 0) { "Yellow" } else { "Cyan" })

Write-Host "â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•" -ForegroundColor Cyan

# Top 5 instancias con PLE mÃ¡s bajo
Write-Host "`nðŸ“Š TOP 5 INSTANCIAS CON PLE MÃS BAJO:" -ForegroundColor Yellow
$top5LowPLE = $results | Where-Object {$_.PageLifeExpectancy -gt 0} | Sort-Object -Property PageLifeExpectancy | Select-Object -First 5
foreach ($inst in $top5LowPLE) {
    $pleRatio = if ($inst.PLETarget -gt 0) {
        [int](($inst.PageLifeExpectancy * 100.0) / $inst.PLETarget)
    } else { 0 }
    $color = if ($inst.PageLifeExpectancy -lt 100) { "Red" } elseif ($inst.PageLifeExpectancy -lt 300) { "Yellow" } else { "Gray" }
    Write-Host "   $($inst.InstanceName.PadRight(25)) - PLE: $($inst.PageLifeExpectancy)s (${pleRatio}% del target)" -ForegroundColor $color
}

# Top 5 instancias con Grants Pending
$top5Grants = $results | Where-Object {$_.MemoryGrantsPending -gt 0} | Sort-Object -Property MemoryGrantsPending -Descending | Select-Object -First 5
if ($top5Grants.Count -gt 0) {
    Write-Host "`nâš ï¸  TOP 5 INSTANCIAS CON MEMORY GRANTS PENDING:" -ForegroundColor Yellow
    foreach ($inst in $top5Grants) {
        Write-Host "   $($inst.InstanceName.PadRight(25)) - Grants Pending: $($inst.MemoryGrantsPending)" -ForegroundColor Yellow
    }
} else {
    Write-Host "`nâœ… No hay instancias con Memory Grants Pending (todas las queries tienen memoria suficiente)" -ForegroundColor Green
}

# Top 5 instancias con Stolen Memory mÃ¡s alto
$top5Stolen = $results | Where-Object {$_.StolenServerMemoryMB -gt 0 -and $_.TotalServerMemoryMB -gt 0} | 
    Select-Object InstanceName, StolenServerMemoryMB, TotalServerMemoryMB, @{
        Name='StolenPct'
        Expression={[int](($_.StolenServerMemoryMB * 100.0) / $_.TotalServerMemoryMB)}
    } | 
    Sort-Object -Property StolenPct -Descending | 
    Select-Object -First 5

if ($top5Stolen.Count -gt 0) {
    Write-Host "`nâš ï¸  TOP 5 INSTANCIAS CON STOLEN MEMORY MÃS ALTO:" -ForegroundColor Yellow
    foreach ($inst in $top5Stolen) {
        $color = if ($inst.StolenPct -gt 50) { "Red" } elseif ($inst.StolenPct -gt 30) { "Yellow" } else { "Gray" }
        Write-Host "   $($inst.InstanceName.PadRight(25)) - Stolen: $($inst.StolenServerMemoryMB)MB ($($inst.StolenPct)%)" -ForegroundColor $color
    }
    Write-Host "`n   ðŸ’¡ Stolen Memory = memoria usada fuera del buffer pool (planes, CLR, XPs, etc.)" -ForegroundColor DarkGray
}

Write-Host "`nâœ… Script completado!" -ForegroundColor Green

#endregion


