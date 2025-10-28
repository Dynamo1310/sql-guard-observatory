<#
.SYNOPSIS
    Health Score v3.0 - CONSOLIDADOR y Cálculo Final
    
.DESCRIPTION
    Script que:
    1. Lee datos de las 10 tablas especializadas
    2. Calcula HealthScore final (100 puntos)
    3. Aplica pesos según categoría
    4. Aplica caps y penalizaciones
    5. Guarda en InstanceHealth_Score
    
    CATEGORÍAS Y PESOS (100 puntos):
    1. 🗄️  Backups (RPO/RTO)           18%
    2. ♻️  AlwaysOn (AG)               14%
    3. 🌐 Conectividad                 10%
    4. 🚨 Errores sev≥20               7%
    5. ⚙️  CPU                          10%
    6. 💽 IO (Latencia / IOPS)         10%
    7. 🧱 Espacio en discos            8%
    8. 🧠 Memoria (PLE + Grants)       7%
    9. 🧹 Mantenimientos               6%
    10. 🧩 Configuración & tempdb      10%
    
    SEMÁFORO:
    🟢 Healthy (85-100): Optimal performance
    🟡 Warning (70-84): Requires attention
    🟠 Risk (50-69): Action required
    🔴 Critical (<50): Immediate action
    
.NOTES
    Versión: 3.0
    Frecuencia: Cada 2-5 minutos
    Ejecutar DESPUÉS de los scripts de recolección
    
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

Import-Module dbatools -Force

#region ===== CONFIGURACIÓN =====

$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30

# Pesos de las categorías (total = 100%)
$PESOS = @{
    Backups = 18
    AlwaysOn = 14
    Conectividad = 10
    ErroresCriticos = 7
    CPU = 10
    IO = 10
    Discos = 8
    Memoria = 7
    Mantenimientos = 6
    ConfiguracionTempdb = 10
}

#endregion

#region ===== FUNCIONES DE SCORING =====

# 1. BACKUPS (18%)
function Calculate-BackupsScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Cadena LOG rota => 0 pts y cap global 60
    if ($Data.LogBackupBreached -eq $true) {
        $score = 0
        $cap = 60
    }
    # FULL backup vencido
    elseif ($Data.FullBackupBreached -eq $true) {
        $score = 0
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 2. ALWAYSON (14%)
function Calculate-AlwaysOnScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Si no tiene AlwaysOn habilitado, score perfecto
    if (-not $Data.AlwaysOnEnabled) {
        return @{ Score = 100; Cap = 100 }
    }
    
    # DB SUSPENDED => cap 60
    if ($Data.SuspendedCount -gt 0) {
        $score = 0
        $cap = 60
    }
    # No todas sincronizadas
    elseif ($Data.SynchronizedCount -lt $Data.DatabaseCount) {
        $score = 50
        $cap = 60
    }
    # Send queue alto
    elseif ($Data.MaxSendQueueKB -gt 100000) {  # >100 MB
        $score = 70
    }
    # Redo queue alto
    elseif ($Data.MaxRedoQueueKB -gt 100000) {  # >100 MB
        $score = 80
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 3. CONECTIVIDAD (10%)
function Calculate-ConectividadScore {
    param(
        [object]$Data
    )
    
    $score = 0
    $cap = 100
    
    if (-not $Data.ConnectSuccess) {
        return @{ Score = 0; Cap = 100 }
    }
    
    # RTT ≤15ms = 100, 16–50ms = 70, >50ms = 40
    if ($Data.ConnectLatencyMs -le 15) {
        $score = 100
    }
    elseif ($Data.ConnectLatencyMs -le 50) {
        $score = 70
    }
    else {
        $score = 40
    }
    
    # Fallos de login anómalos => penalización
    if ($Data.LoginFailuresLast1h -gt 20) {
        $score -= 40
        if ($score -lt 0) { $score = 0 }
    }
    elseif ($Data.LoginFailuresLast1h -gt 10) {
        $score -= 20
        if ($score -lt 0) { $score = 0 }
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 4. ERRORES CRÍTICOS (7%)
function Calculate-ErroresCriticosScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # 0 errores = 100, −10 por cada evento (máx −40)
    if ($Data.Severity20PlusCount -eq 0) {
        $score = 100
    }
    else {
        $score = 100 - ($Data.Severity20PlusCount * 10)
        if ($score -lt 60) { $score = 60 }  # Máximo −40
    }
    
    # Si hay evento reciente => cap 70
    if ($Data.Severity20PlusLast1h -gt 0) {
        $cap = 70
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 5. CPU (10%)
function Calculate-CPUScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # p95 ≤80% = 100, 81–90 = 70, >90 = 40
    if ($Data.P95CPUPercent -le 80) {
        $score = 100
    }
    elseif ($Data.P95CPUPercent -le 90) {
        $score = 70
    }
    else {
        $score = 40
    }
    
    # RunnableTask >1 sostenido => cap 70
    if ($Data.RunnableTasks -gt 1) {
        $cap = 70
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 6. IO (10%)
function Calculate-IOScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Calcular latencia promedio ponderada (data + log)
    $avgLatency = ($Data.DataFileAvgReadMs + $Data.DataFileAvgWriteMs + $Data.LogFileAvgWriteMs) / 3
    
    # Latencia ≤5ms=100; 6–10=80; 11–20=60; >20=40
    if ($avgLatency -le 5) {
        $score = 100
    }
    elseif ($avgLatency -le 10) {
        $score = 80
    }
    elseif ($avgLatency -le 20) {
        $score = 60
    }
    else {
        $score = 40
    }
    
    # Log p95 >20ms => cap 70
    if ($Data.LogFileAvgWriteMs -gt 20) {
        $cap = 70
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 7. DISCOS (8%)
function Calculate-DiscosScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Promedio ponderado: priorizar Data y Log
    $dataWeight = 0.5
    $logWeight = 0.3
    $otherWeight = 0.2
    
    $weightedFreePct = ($Data.DataDiskAvgFreePct * $dataWeight) + 
                       ($Data.LogDiskAvgFreePct * $logWeight) + 
                       ($Data.WorstFreePct * $otherWeight)
    
    # ≥20% = 100, 15–19% = 80, 10–14% = 60, 5–9% = 40, <5% = 0
    if ($weightedFreePct -ge 20) {
        $score = 100
    }
    elseif ($weightedFreePct -ge 15) {
        $score = 80
    }
    elseif ($weightedFreePct -ge 10) {
        $score = 60
    }
    elseif ($weightedFreePct -ge 5) {
        $score = 40
    }
    else {
        $score = 0
    }
    
    # Data o Log <10% => cap 40
    if ($Data.DataDiskAvgFreePct -lt 10 -or $Data.LogDiskAvgFreePct -lt 10) {
        $cap = 40
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 8. MEMORIA (7%)
function Calculate-MemoriaScore {
    param(
        [object]$Data
    )
    
    $score = 0
    $cap = 100
    
    # 0.6×PLE + 0.25×MemoryGrants + 0.15×UsoMemoria
    
    # PLE objetivo = 300 s × GB buffer pool
    $pleScore = 0
    if ($Data.PLETarget -gt 0) {
        $pleRatio = $Data.PageLifeExpectancy / $Data.PLETarget
        if ($pleRatio -ge 1.0) { $pleScore = 100 }
        elseif ($pleRatio -ge 0.7) { $pleScore = 80 }
        elseif ($pleRatio -ge 0.5) { $pleScore = 60 }
        elseif ($pleRatio -ge 0.3) { $pleScore = 40 }
        else { $pleScore = 20 }
    } else {
        # Si no hay target, usar PLE absoluto
        if ($Data.PageLifeExpectancy -ge 300) { $pleScore = 100 }
        elseif ($Data.PageLifeExpectancy -ge 200) { $pleScore = 80 }
        elseif ($Data.PageLifeExpectancy -ge 100) { $pleScore = 60 }
        else { $pleScore = 40 }
    }
    
    # Memory Grants score
    $grantsScore = 100
    if ($Data.MemoryGrantsPending -gt 10) { $grantsScore = 0 }
    elseif ($Data.MemoryGrantsPending -gt 5) { $grantsScore = 50 }
    elseif ($Data.MemoryGrantsPending -gt 0) { $grantsScore = 80 }
    
    # Uso de memoria score (basado en Target vs Max)
    $usoScore = 100
    if ($Data.MaxServerMemoryMB -gt 0) {
        $usoRatio = $Data.TotalServerMemoryMB / $Data.MaxServerMemoryMB
        if ($usoRatio -ge 0.95) { $usoScore = 100 }  # Casi al máximo configurado (óptimo)
        elseif ($usoRatio -ge 0.80) { $usoScore = 90 }
        elseif ($usoRatio -ge 0.60) { $usoScore = 70 }
        else { $usoScore = 50 }  # Muy por debajo del máximo (posible problema)
    }
    
    # Fórmula ponderada
    $score = ($pleScore * 0.6) + ($grantsScore * 0.25) + ($usoScore * 0.15)
    
    # PLE <0.15×objetivo o Grants>10 => cap 60
    if ($Data.PLETarget -gt 0 -and $Data.PageLifeExpectancy -lt ($Data.PLETarget * 0.15)) {
        $cap = 60
    }
    if ($Data.MemoryGrantsPending -gt 10) {
        $cap = 60
    }
    
    return @{ Score = [int]$score; Cap = $cap }
}

# 9. MANTENIMIENTOS (6%)
function Calculate-MantenimientosScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # 100 si CHECKDB ≤7 días
    if ($Data.LastCheckdb -eq $null -or [string]::IsNullOrWhiteSpace($Data.LastCheckdb)) {
        $score = 0
    }
    else {
        try {
            # Convertir a DateTime si viene como string
            $lastCheckdbDate = if ($Data.LastCheckdb -is [DateTime]) {
                $Data.LastCheckdb
            } else {
                [DateTime]::Parse($Data.LastCheckdb)
            }
            
            $checkdbAge = ((Get-Date) - $lastCheckdbDate).Days
            
            if ($checkdbAge -le 7) {
                $score = 100
            }
            elseif ($checkdbAge -le 14) {
                $score = 80
            }
            elseif ($checkdbAge -le 30) {
                $score = 50
            }
            else {
                $score = 0  # >30 días => 0 pts
            }
        }
        catch {
            # Si no se puede parsear la fecha, asumir sin datos
            $score = 0
        }
    }
    
    # Index/Stats actualizados = bonus (si hubiera datos)
    # Por ahora solo consideramos CHECKDB
    
    return @{ Score = $score; Cap = $cap }
}

# 10. CONFIGURACIÓN & TEMPDB (10%)
function Calculate-ConfiguracionTempdbScore {
    param(
        [object]$Data
    )
    
    $score = 0
    $cap = 100
    
    # 60% tempdb + 40% memoria configurada
    
    # TEMPDB score (60%)
    $tempdbScore = 100
    
    # Archivos óptimos (1 por CPU core, máx 8)
    $optimalFiles = [Math]::Min($Data.CPUCount, 8)
    if ($Data.TempDBFileCount -eq $optimalFiles) {
        $tempdbScore -= 0
    }
    elseif ($Data.TempDBFileCount -ge ($optimalFiles / 2)) {
        $tempdbScore -= 10
    }
    else {
        $tempdbScore -= 30
    }
    
    # Same size y growth
    if (-not $Data.TempDBAllSameSize) { $tempdbScore -= 15 }
    if (-not $Data.TempDBAllSameGrowth) { $tempdbScore -= 10 }
    
    # Contención (inversamente proporcional a contention score)
    $contentionPenalty = (100 - $Data.TempDBContentionScore) * 0.35
    $tempdbScore -= $contentionPenalty
    
    # Latencia
    if ($Data.TempDBAvgLatencyMs -gt 20) { $tempdbScore -= 10 }
    elseif ($Data.TempDBAvgLatencyMs -gt 10) { $tempdbScore -= 5 }
    
    if ($tempdbScore -lt 0) { $tempdbScore = 0 }
    
    # MEMORIA CONFIGURADA score (40%)
    $memoryScore = 100
    if (-not $Data.MaxMemoryWithinOptimal) {
        $memoryScore = 60  # No está dentro del rango óptimo
    }
    
    # Score final ponderado
    $score = ($tempdbScore * 0.6) + ($memoryScore * 0.4)
    
    # Contención PAGELATCH => cap 65
    if ($Data.TempDBContentionScore -lt 50) {
        $cap = 65
    }
    
    return @{ Score = [int]$score; Cap = $cap }
}

# Función para aplicar caps
function Apply-Cap {
    param(
        [int]$Score,
        [int]$Cap
    )
    
    if ($Score -gt $Cap) {
        return $Cap
    }
    return $Score
}

# Función para determinar estado según rango
function Get-HealthStatus {
    param([decimal]$Score)
    
    if ($Score -ge 85) { return "Healthy" }
    if ($Score -ge 70) { return "Warning" }
    if ($Score -ge 50) { return "Risk" }
    return "Critical"
}

# Función para mostrar estado con emoji (solo para consola)
function Get-HealthStatusDisplay {
    param([string]$Status)
    
    switch ($Status) {
        "Healthy" { return "[OK] Optimo" }
        "Warning" { return "[WARN] Advertencia" }
        "Risk" { return "[RISK] Riesgo" }
        "Critical" { return "[CRIT] Critico" }
        default { return $Status }
    }
}

#endregion

#region ===== FUNCIONES DE DATOS =====

function Get-LatestInstanceData {
    param([string]$InstanceName)
    
    try {
        # Query consolidado que trae datos de las 10 tablas
        $query = @"
WITH LatestBackups AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Backups
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestAlwaysOn AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_AlwaysOn
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestConectividad AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Conectividad
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestErrores AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_ErroresCriticos
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestCPU AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_CPU
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestIO AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_IO
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestDiscos AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Discos
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestMemoria AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Memoria
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestMaintenance AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Maintenance
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestConfig AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_ConfiguracionTempdb
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
)
SELECT 
    '$InstanceName' AS InstanceName,
    -- Metadata
    COALESCE(b.Ambiente, ag.Ambiente, c.Ambiente, mnt.Ambiente, 'N/A') AS Ambiente,
    COALESCE(b.HostingSite, ag.HostingSite, c.HostingSite, mnt.HostingSite, 'N/A') AS HostingSite,
    COALESCE(b.SqlVersion, ag.SqlVersion, c.SqlVersion, mnt.SqlVersion, 'N/A') AS SqlVersion,
    -- Backups
    b.FullBackupBreached,
    b.LogBackupBreached,
    -- AlwaysOn
    ag.AlwaysOnEnabled,
    ag.DatabaseCount AS AGDatabaseCount,
    ag.SynchronizedCount AS AGSynchronizedCount,
    ag.SuspendedCount AS AGSuspendedCount,
    ag.MaxSendQueueKB AS AGMaxSendQueueKB,
    ag.MaxRedoQueueKB AS AGMaxRedoQueueKB,
    -- Conectividad
    c.ConnectSuccess,
    c.ConnectLatencyMs,
    c.LoginFailuresLast1h,
    -- Errores
    e.Severity20PlusCount,
    e.Severity20PlusLast1h,
    -- CPU
    cpu.P95CPUPercent,
    cpu.RunnableTasks,
    -- IO
    io.DataFileAvgReadMs,
    io.DataFileAvgWriteMs,
    io.LogFileAvgWriteMs,
    -- Discos
    d.WorstFreePct,
    d.DataDiskAvgFreePct,
    d.LogDiskAvgFreePct,
    -- Memoria
    mem.PageLifeExpectancy,
    mem.BufferPoolSizeMB,
    mem.MemoryGrantsPending,
    mem.TotalServerMemoryMB,
    mem.MaxServerMemoryMB,
    mem.PLETarget,
    -- Maintenance
    mnt.LastCheckdb,
    mnt.CheckdbOk,
    -- Config/TempDB
    cfg.TempDBFileCount,
    cfg.TempDBAllSameSize,
    cfg.TempDBAllSameGrowth,
    cfg.TempDBAvgLatencyMs,
    cfg.TempDBContentionScore,
    cfg.MaxMemoryWithinOptimal,
    cfg.CPUCount
FROM LatestBackups b
LEFT JOIN LatestAlwaysOn ag ON 1=1
LEFT JOIN LatestConectividad c ON 1=1
LEFT JOIN LatestErrores e ON 1=1
LEFT JOIN LatestCPU cpu ON 1=1
LEFT JOIN LatestIO io ON 1=1
LEFT JOIN LatestDiscos d ON 1=1
LEFT JOIN LatestMemoria mem ON 1=1
LEFT JOIN LatestMaintenance mnt ON 1=1
LEFT JOIN LatestConfig cfg ON 1=1;
"@
        
        $data = Invoke-DbaQuery -SqlInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        return $data
        
    } catch {
        Write-Warning "Error obteniendo datos para ${InstanceName}: $($_.Exception.Message)"
        return $null
    }
}

function Get-AllInstanceNames {
    try {
        $query = @"
SELECT DISTINCT InstanceName
FROM (
    SELECT InstanceName FROM dbo.InstanceHealth_Backups
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_Conectividad
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_AlwaysOn
) AS AllInstances
ORDER BY InstanceName;
"@
        
        $data = Invoke-DbaQuery -SqlInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        return $data | Select-Object -ExpandProperty InstanceName
        
    } catch {
        Write-Error "Error obteniendo lista de instancias: $($_.Exception.Message)"
        return @()
    }
}

function Save-HealthScore {
    param(
        [PSCustomObject]$ScoreData
    )
    
    try {
        $query = @"
INSERT INTO dbo.InstanceHealth_Score (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    HealthScore,
    HealthStatus,
    -- Scores Individuales (0-100)
    BackupsScore,
    AlwaysOnScore,
    ConectividadScore,
    ErroresCriticosScore,
    CPUScore,
    IOScore,
    DiscosScore,
    MemoriaScore,
    MantenimientosScore,
    ConfiguracionTempdbScore,
    -- Contribuciones Ponderadas (0-peso máximo)
    BackupsContribution,
    AlwaysOnContribution,
    ConectividadContribution,
    ErroresCriticosContribution,
    CPUContribution,
    IOContribution,
    DiscosContribution,
    MemoriaContribution,
    MantenimientosContribution,
    ConfiguracionTempdbContribution,
    GlobalCap
) VALUES (
    '$($ScoreData.InstanceName)',
    '$($ScoreData.Ambiente)',
    '$($ScoreData.HostingSite)',
    '$($ScoreData.SqlVersion)',
    GETUTCDATE(),
    $($ScoreData.HealthScore),
    '$($ScoreData.HealthStatus)',
    -- Scores Individuales (0-100)
    $($ScoreData.BackupsScore),
    $($ScoreData.AlwaysOnScore),
    $($ScoreData.ConectividadScore),
    $($ScoreData.ErroresCriticosScore),
    $($ScoreData.CPUScore),
    $($ScoreData.IOScore),
    $($ScoreData.DiscosScore),
    $($ScoreData.MemoriaScore),
    $($ScoreData.MantenimientosScore),
    $($ScoreData.ConfiguracionTempdbScore),
    -- Contribuciones Ponderadas (ya redondeadas a entero en el cálculo)
    $($ScoreData.BackupsContribution),
    $($ScoreData.AlwaysOnContribution),
    $($ScoreData.ConectividadContribution),
    $($ScoreData.ErroresCriticosContribution),
    $($ScoreData.CPUContribution),
    $($ScoreData.IOContribution),
    $($ScoreData.DiscosContribution),
    $($ScoreData.MemoriaContribution),
    $($ScoreData.MantenimientosContribution),
    $($ScoreData.ConfiguracionTempdbContribution),
    $($ScoreData.GlobalCap)
);
"@
        
        Invoke-DbaQuery -SqlInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -EnableException
        
        return $true
        
    } catch {
        Write-Error "Error guardando score para $($ScoreData.InstanceName): $($_.Exception.Message)"
        return $false
    }
}

#endregion

#region ===== MAIN =====

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host " Health Score v3.0 - CONSOLIDATOR (10 categorias)" -ForegroundColor Cyan
Write-Host " Sistema de puntuacion: 100 puntos totales" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener todas las instancias
Write-Host "[1/2] Obteniendo lista de instancias..." -ForegroundColor Yellow

$instances = Get-AllInstanceNames

if ($instances.Count -eq 0) {
    Write-Error "No se encontraron instancias en las tablas!"
    exit 1
}

Write-Host "   Encontradas: $($instances.Count) instancias" -ForegroundColor Green

# 2. Procesar cada instancia
Write-Host ""
Write-Host "[2/2] Calculando Health Score..." -ForegroundColor Yellow

$results = @()
$counter = 0

foreach ($instanceName in $instances) {
    $counter++
    
    Write-Progress -Activity "Calculando Health Score" `
        -Status "$counter de $($instances.Count): $instanceName" `
        -PercentComplete (($counter / $instances.Count) * 100)
    
    # Obtener datos consolidados
    $data = Get-LatestInstanceData -InstanceName $instanceName
    
    if (-not $data) {
        Write-Host "   ⚠️  $instanceName - Sin datos suficientes" -ForegroundColor Yellow
        continue
    }
    
    # Calcular scores por categoría
    $backupsResult = Calculate-BackupsScore -Data $data
    $alwaysOnResult = Calculate-AlwaysOnScore -Data $data
    $conectividadResult = Calculate-ConectividadScore -Data $data
    $erroresResult = Calculate-ErroresCriticosScore -Data $data
    $cpuResult = Calculate-CPUScore -Data $data
    $ioResult = Calculate-IOScore -Data $data
    $discosResult = Calculate-DiscosScore -Data $data
    $memoriaResult = Calculate-MemoriaScore -Data $data
    $mantenimientosResult = Calculate-MantenimientosScore -Data $data
    $configTempdbResult = Calculate-ConfiguracionTempdbScore -Data $data
    
    # Aplicar caps individuales
    $backupsScore = Apply-Cap -Score $backupsResult.Score -Cap $backupsResult.Cap
    $alwaysOnScore = Apply-Cap -Score $alwaysOnResult.Score -Cap $alwaysOnResult.Cap
    $conectividadScore = Apply-Cap -Score $conectividadResult.Score -Cap $conectividadResult.Cap
    $erroresScore = Apply-Cap -Score $erroresResult.Score -Cap $erroresResult.Cap
    $cpuScore = Apply-Cap -Score $cpuResult.Score -Cap $cpuResult.Cap
    $ioScore = Apply-Cap -Score $ioResult.Score -Cap $ioResult.Cap
    $discosScore = Apply-Cap -Score $discosResult.Score -Cap $discosResult.Cap
    $memoriaScore = Apply-Cap -Score $memoriaResult.Score -Cap $memoriaResult.Cap
    $mantenimientosScore = Apply-Cap -Score $mantenimientosResult.Score -Cap $mantenimientosResult.Cap
    $configTempdbScore = Apply-Cap -Score $configTempdbResult.Score -Cap $configTempdbResult.Cap
    
    # Calcular score total ponderado (sobre 100)
    $totalScore = [decimal](
        ($backupsScore * $PESOS.Backups / 100) +
        ($alwaysOnScore * $PESOS.AlwaysOn / 100) +
        ($conectividadScore * $PESOS.Conectividad / 100) +
        ($erroresScore * $PESOS.ErroresCriticos / 100) +
        ($cpuScore * $PESOS.CPU / 100) +
        ($ioScore * $PESOS.IO / 100) +
        ($discosScore * $PESOS.Discos / 100) +
        ($memoriaScore * $PESOS.Memoria / 100) +
        ($mantenimientosScore * $PESOS.Mantenimientos / 100) +
        ($configTempdbScore * $PESOS.ConfiguracionTempdb / 100)
    )
    
    # Determinar cap global (el más restrictivo)
    $globalCap = 100
    $allCaps = @($backupsResult.Cap, $alwaysOnResult.Cap, $conectividadResult.Cap, $erroresResult.Cap, 
                 $cpuResult.Cap, $ioResult.Cap, $discosResult.Cap, $memoriaResult.Cap, 
                 $mantenimientosResult.Cap, $configTempdbResult.Cap)
    $globalCap = ($allCaps | Measure-Object -Minimum).Minimum
    
    # Calcular contribuciones reales redondeadas a entero (para que la suma coincida exactamente)
    $backupsContribution = [int][Math]::Round($backupsScore * $PESOS.Backups / 100)
    $alwaysOnContribution = [int][Math]::Round($alwaysOnScore * $PESOS.AlwaysOn / 100)
    $conectividadContribution = [int][Math]::Round($conectividadScore * $PESOS.Conectividad / 100)
    $erroresContribution = [int][Math]::Round($erroresScore * $PESOS.ErroresCriticos / 100)
    $cpuContribution = [int][Math]::Round($cpuScore * $PESOS.CPU / 100)
    $ioContribution = [int][Math]::Round($ioScore * $PESOS.IO / 100)
    $discosContribution = [int][Math]::Round($discosScore * $PESOS.Discos / 100)
    $memoriaContribution = [int][Math]::Round($memoriaScore * $PESOS.Memoria / 100)
    $mantenimientosContribution = [int][Math]::Round($mantenimientosScore * $PESOS.Mantenimientos / 100)
    $configTempdbContribution = [int][Math]::Round($configTempdbScore * $PESOS.ConfiguracionTempdb / 100)
    
    # Calcular suma sin cap
    $totalScoreBeforeCap = [int](
        $backupsContribution +
        $alwaysOnContribution +
        $conectividadContribution +
        $erroresContribution +
        $cpuContribution +
        $ioContribution +
        $discosContribution +
        $memoriaContribution +
        $mantenimientosContribution +
        $configTempdbContribution
    )
    
    # Aplicar cap global y ajustar contribuciones proporcionalmente si es necesario
    if ($totalScoreBeforeCap -gt $globalCap) {
        # Calcular factor de ajuste
        $adjustmentFactor = [decimal]$globalCap / [decimal]$totalScoreBeforeCap
        
        # Ajustar cada contribución proporcionalmente
        $backupsContribution = [int][Math]::Round($backupsContribution * $adjustmentFactor)
        $alwaysOnContribution = [int][Math]::Round($alwaysOnContribution * $adjustmentFactor)
        $conectividadContribution = [int][Math]::Round($conectividadContribution * $adjustmentFactor)
        $erroresContribution = [int][Math]::Round($erroresContribution * $adjustmentFactor)
        $cpuContribution = [int][Math]::Round($cpuContribution * $adjustmentFactor)
        $ioContribution = [int][Math]::Round($ioContribution * $adjustmentFactor)
        $discosContribution = [int][Math]::Round($discosContribution * $adjustmentFactor)
        $memoriaContribution = [int][Math]::Round($memoriaContribution * $adjustmentFactor)
        $mantenimientosContribution = [int][Math]::Round($mantenimientosContribution * $adjustmentFactor)
        $configTempdbContribution = [int][Math]::Round($configTempdbContribution * $adjustmentFactor)
        
        # Recalcular totalScore con contribuciones ajustadas
        $totalScore = [int](
            $backupsContribution +
            $alwaysOnContribution +
            $conectividadContribution +
            $erroresContribution +
            $cpuContribution +
            $ioContribution +
            $discosContribution +
            $memoriaContribution +
            $mantenimientosContribution +
            $configTempdbContribution
        )
        
        # Ajuste fino: si la suma no llega exactamente al cap por redondeos, ajustar la contribución mayor
        if ($totalScore -lt $globalCap) {
            $diff = $globalCap - $totalScore
            # Determinar cuál es la contribución más grande y agregarle la diferencia
            $maxValue = ($backupsContribution, $alwaysOnContribution, $conectividadContribution, 
                        $erroresContribution, $cpuContribution, $ioContribution, 
                        $discosContribution, $memoriaContribution, $mantenimientosContribution, 
                        $configTempdbContribution | Measure-Object -Maximum).Maximum
            
            if ($backupsContribution -eq $maxValue) { $backupsContribution += $diff }
            elseif ($alwaysOnContribution -eq $maxValue) { $alwaysOnContribution += $diff }
            elseif ($conectividadContribution -eq $maxValue) { $conectividadContribution += $diff }
            elseif ($erroresContribution -eq $maxValue) { $erroresContribution += $diff }
            elseif ($cpuContribution -eq $maxValue) { $cpuContribution += $diff }
            elseif ($ioContribution -eq $maxValue) { $ioContribution += $diff }
            elseif ($discosContribution -eq $maxValue) { $discosContribution += $diff }
            elseif ($memoriaContribution -eq $maxValue) { $memoriaContribution += $diff }
            elseif ($mantenimientosContribution -eq $maxValue) { $mantenimientosContribution += $diff }
            else { $configTempdbContribution += $diff }
            
            $totalScore = $globalCap
        }
    }
    else {
        $totalScore = $totalScoreBeforeCap
    }
    
    $healthStatus = Get-HealthStatus -Score $totalScore
    $healthStatusDisplay = Get-HealthStatusDisplay -Status $healthStatus
    
    Write-Host "   $healthStatusDisplay $instanceName - Score: $([int]$totalScore)/100" -ForegroundColor Gray
    
    # Crear objeto con todos los scores
    $scoreData = [PSCustomObject]@{
        InstanceName = $instanceName
        Ambiente = $data.Ambiente
        HostingSite = $data.HostingSite
        SqlVersion = $data.SqlVersion
        HealthScore = [int]$totalScore
        HealthStatus = $healthStatus
        BackupsScore = $backupsScore
        AlwaysOnScore = $alwaysOnScore
        ConectividadScore = $conectividadScore
        ErroresCriticosScore = $erroresScore
        CPUScore = $cpuScore
        IOScore = $ioScore
        DiscosScore = $discosScore
        MemoriaScore = $memoriaScore
        MantenimientosScore = $mantenimientosScore
        ConfiguracionTempdbScore = $configTempdbScore
        BackupsContribution = $backupsContribution
        AlwaysOnContribution = $alwaysOnContribution
        ConectividadContribution = $conectividadContribution
        ErroresCriticosContribution = $erroresContribution
        CPUContribution = $cpuContribution
        IOContribution = $ioContribution
        DiscosContribution = $discosContribution
        MemoriaContribution = $memoriaContribution
        MantenimientosContribution = $mantenimientosContribution
        ConfiguracionTempdbContribution = $configTempdbContribution
        GlobalCap = $globalCap
    }
    
    # Guardar en SQL
    if (Save-HealthScore -ScoreData $scoreData) {
        $results += $scoreData
    }
}

Write-Progress -Activity "Calculando Health Score" -Completed

# 3. Resumen final
Write-Host ""
Write-Host "=========================================================" -ForegroundColor Green
Write-Host " RESUMEN FINAL - HEALTH SCORE v3.0" -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
Write-Host "  Total instancias:     $($results.Count)" -ForegroundColor White

$avgScore = ($results | Measure-Object -Property HealthScore -Average).Average
Write-Host "  Score promedio:       $([int]$avgScore)/100" -ForegroundColor White

$healthyCount = ($results | Where-Object { $_.HealthStatus -eq 'Healthy' }).Count
$warningCount = ($results | Where-Object { $_.HealthStatus -eq 'Warning' }).Count
$riskCount = ($results | Where-Object { $_.HealthStatus -eq 'Risk' }).Count
$criticalCount = ($results | Where-Object { $_.HealthStatus -eq 'Critical' }).Count

Write-Host "  [OK] Healthy (>=85):   $healthyCount" -ForegroundColor Green
Write-Host "  [WARN] Warning (70-84): $warningCount" -ForegroundColor Yellow
Write-Host "  [RISK] Risk (50-69):    $riskCount" -ForegroundColor DarkYellow
Write-Host "  [CRIT] Critical (<50):  $criticalCount" -ForegroundColor Red

Write-Host "---------------------------------------------------------" -ForegroundColor Green
Write-Host " Promedios por Categoria:" -ForegroundColor Green
Write-Host "---------------------------------------------------------" -ForegroundColor Green

$avgBackups = ($results | Measure-Object -Property BackupsScore -Average).Average
$avgAlwaysOn = ($results | Measure-Object -Property AlwaysOnScore -Average).Average
$avgConectividad = ($results | Measure-Object -Property ConectividadScore -Average).Average
$avgErrores = ($results | Measure-Object -Property ErroresCriticosScore -Average).Average
$avgCPU = ($results | Measure-Object -Property CPUScore -Average).Average
$avgIO = ($results | Measure-Object -Property IOScore -Average).Average
$avgDiscos = ($results | Measure-Object -Property DiscosScore -Average).Average
$avgMemoria = ($results | Measure-Object -Property MemoriaScore -Average).Average
$avgMantenimientos = ($results | Measure-Object -Property MantenimientosScore -Average).Average
$avgConfig = ($results | Measure-Object -Property ConfiguracionTempdbScore -Average).Average

Write-Host "  Backups:              $([int]$avgBackups)/100 (18pct)" -ForegroundColor White
Write-Host "  AlwaysOn:             $([int]$avgAlwaysOn)/100 (14pct)" -ForegroundColor White
Write-Host "  Conectividad:         $([int]$avgConectividad)/100 (10pct)" -ForegroundColor White
Write-Host "  Errores Criticos:     $([int]$avgErrores)/100 (7pct)" -ForegroundColor White
Write-Host "  CPU:                  $([int]$avgCPU)/100 (10pct)" -ForegroundColor White
Write-Host "  IO:                   $([int]$avgIO)/100 (10pct)" -ForegroundColor White
Write-Host "  Discos:               $([int]$avgDiscos)/100 (8pct)" -ForegroundColor White
Write-Host "  Memoria:              $([int]$avgMemoria)/100 (7pct)" -ForegroundColor White
Write-Host "  Mantenimientos:       $([int]$avgMantenimientos)/100 (6pct)" -ForegroundColor White
Write-Host "  Config/TempDB:        $([int]$avgConfig)/100 (10pct)" -ForegroundColor White

Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Consolidacion completada!" -ForegroundColor Green

#endregion

