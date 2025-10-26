<#
.SYNOPSIS
    Health Score v3.0 FINAL - CONSOLIDADOR y Cálculo Final
    
.DESCRIPTION
    Script que:
    1. Lee datos de las 12 tablas especializadas
    2. Calcula HealthScore final (100 puntos)
    3. Aplica pesos según categoría
    4. Aplica caps y penalizaciones
    5. Guarda en InstanceHealth_Score
    
    CATEGORÍAS Y PESOS (100 puntos) - 12 CATEGORÍAS:
    
    TAB 1: AVAILABILITY & DR (40%)
    1. 🗄️  Backups (RPO/RTO)           18%
    2. ♻️  AlwaysOn (AG)               14%
    3. 🔗 Log Chain Integrity          5%
    4. 🗄️  Database States             3%
    
    TAB 2: PERFORMANCE (35%)
    5. ⚙️  CPU                          10%
    6. 🧠 Memoria (PLE + Grants)       8%
    7. 💽 IO (Latencia / IOPS)         10%
    8. 🧱 Espacio en discos            7%
    
    TAB 3: MAINTENANCE & CONFIG (25%)
    9. 🚨 Errores sev≥20               7%
    10. 🧹 Mantenimientos              5%
    11. 🧩 Configuración & tempdb      8%
    12. 📈 Autogrowth & Capacity       5%
    
    SEMÁFORO:
    🟢 Healthy (85-100): Optimal performance
    🟡 Warning (70-84): Requires attention
    🟠 Risk (50-69): Action required
    🔴 Critical (<50): Immediate action
    
.NOTES
    Versión: 3.0 FINAL (12 categorías balanceadas)
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

Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30

# Pesos de las categorías (total = 100%)
$PESOS = @{
    Backups = 18
    AlwaysOn = 14
    LogChain = 5
    DatabaseStates = 3
    CPU = 10
    Memoria = 8
    IO = 10
    Discos = 7
    ErroresCriticos = 7
    Mantenimientos = 5
    ConfiguracionTempdb = 8
    Autogrowth = 5
}

#endregion

#region ===== FUNCIONES HELPER =====

function Get-SafeNumeric {
    <#
    .SYNOPSIS
        Convierte un valor potencialmente NULL/DBNull/vacío a un número válido
    #>
    param(
        [Parameter(Mandatory)]
        $Value,
        [double]$Default = 0
    )
    
    if ($null -eq $Value -or $Value -is [System.DBNull] -or [string]::IsNullOrWhiteSpace($Value.ToString())) {
        return $Default
    }
    
    try {
        return [double]$Value
    }
    catch {
        return $Default
    }
}

function Get-SafeInt {
    <#
    .SYNOPSIS
        Convierte un valor potencialmente NULL/DBNull/vacío a un entero válido
    #>
    param(
        [Parameter(Mandatory)]
        $Value,
        [int]$Default = 0
    )
    
    if ($null -eq $Value -or $Value -is [System.DBNull] -or [string]::IsNullOrWhiteSpace($Value.ToString())) {
        return $Default
    }
    
    try {
        return [int]$Value
    }
    catch {
        return $Default
    }
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

# 3. LOG CHAIN INTEGRITY (5%)
function Calculate-LogChainScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # DB crítica con log chain roto >24h => 0 pts y cap 0
    if ($Data.MaxHoursSinceLogBackup -gt 24 -and $Data.BrokenChainCount -gt 0) {
        $score = 0
        $cap = 0
    }
    # 1 DB crítica con log chain roto
    elseif ($Data.BrokenChainCount -eq 1) {
        $score = 50
    }
    # >2 DBs con log chain roto
    elseif ($Data.BrokenChainCount -gt 2) {
        $score = 20
    }
    # 1 DB no crítica con log chain roto
    elseif ($Data.FullDBsWithoutLogBackup -eq 1) {
        $score = 80
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 4. DATABASE STATES (3%)
function Calculate-DatabaseStatesScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    $totalProblematic = $Data.OfflineCount + $Data.SuspectCount + $Data.EmergencyCount
    
    # Alguna DB crítica OFFLINE/SUSPECT/EMERGENCY => 0
    if ($Data.SuspectCount -gt 0 -or $Data.EmergencyCount -gt 0) {
        $score = 0
        $cap = 0
    }
    elseif ($Data.OfflineCount -gt 0) {
        $score = 0
        $cap = 50
    }
    # Suspect pages detectadas => cap 50
    elseif ($Data.SuspectPageCount -gt 0) {
        $score = 40
        $cap = 50
    }
    # Recovery pending
    elseif ($Data.RecoveryPendingCount -gt 0) {
        $score = 40
    }
    # Single user o restoring
    elseif ($Data.SingleUserCount -gt 0 -or $Data.RestoringCount -gt 0) {
        $score = 60
    }
    # >1 DB en estado problemático
    elseif ($totalProblematic -gt 1) {
        $score = 20
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

# 6. MEMORIA (8%)
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

# 7. IO (10%)
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

# 8. DISCOS (7%)
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

# 9. ERRORES CRÍTICOS (7%)
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

# 10. MANTENIMIENTOS (5%)
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
    
    return @{ Score = $score; Cap = $cap }
}

# 11. CONFIGURACIÓN & TEMPDB (8%)
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

# 12. AUTOGROWTH & CAPACITY (5%)
function Calculate-AutogrowthScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Autogrowth events
    if ($Data.AutogrowthEventsLast24h -eq 0) {
        $score = 100
    }
    elseif ($Data.AutogrowthEventsLast24h -le 10) {
        $score = 100
    }
    elseif ($Data.AutogrowthEventsLast24h -le 50) {
        $score = 80
    }
    elseif ($Data.AutogrowthEventsLast24h -le 100) {
        $score = 60
    }
    elseif ($Data.AutogrowthEventsLast24h -le 500) {
        $score = 40
    }
    else {
        $score = 20  # >500 autogrowths
    }
    
    # Files near limit
    if ($Data.WorstPercentOfMax -gt 90) {
        $score = 0
        $cap = 50
    }
    elseif ($Data.FilesNearLimit -gt 0) {
        $score -= 30
        if ($score -lt 0) { $score = 0 }
    }
    
    # Bad growth config
    if ($Data.FilesWithBadGrowth -gt 0) {
        $score -= 20
        if ($score -lt 0) { $score = 0 }
    }
    
    return @{ Score = $score; Cap = $cap }
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

# Función para mostrar estado (solo para consola)
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
        # Query consolidado que trae datos de las 12 tablas
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
LatestLogChain AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_LogChain
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestDatabaseStates AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_DatabaseStates
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
),
LatestAutogrowth AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Autogrowth
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
)
SELECT 
    '$InstanceName' AS InstanceName,
    -- Metadata
    COALESCE(b.Ambiente, ag.Ambiente, mnt.Ambiente, 'N/A') AS Ambiente,
    COALESCE(b.HostingSite, ag.HostingSite, mnt.HostingSite, 'N/A') AS HostingSite,
    COALESCE(b.SqlVersion, ag.SqlVersion, mnt.SqlVersion, 'N/A') AS SqlVersion,
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
    -- Log Chain
    lc.BrokenChainCount,
    lc.FullDBsWithoutLogBackup,
    lc.MaxHoursSinceLogBackup,
    -- Database States
    dbs.OfflineCount,
    dbs.SuspectCount,
    dbs.EmergencyCount,
    dbs.RecoveryPendingCount,
    dbs.SingleUserCount,
    dbs.RestoringCount,
    dbs.SuspectPageCount,
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
    cfg.CPUCount,
    -- Autogrowth
    au.AutogrowthEventsLast24h,
    au.FilesNearLimit,
    au.FilesWithBadGrowth,
    au.WorstPercentOfMax
FROM LatestBackups b
LEFT JOIN LatestAlwaysOn ag ON 1=1
LEFT JOIN LatestLogChain lc ON 1=1
LEFT JOIN LatestDatabaseStates dbs ON 1=1
LEFT JOIN LatestErrores e ON 1=1
LEFT JOIN LatestCPU cpu ON 1=1
LEFT JOIN LatestIO io ON 1=1
LEFT JOIN LatestDiscos d ON 1=1
LEFT JOIN LatestMemoria mem ON 1=1
LEFT JOIN LatestMaintenance mnt ON 1=1
LEFT JOIN LatestConfig cfg ON 1=1
LEFT JOIN LatestAutogrowth au ON 1=1;
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
    SELECT InstanceName FROM dbo.InstanceHealth_AlwaysOn
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_LogChain
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
    LogChainScore,
    DatabaseStatesScore,
    CPUScore,
    MemoriaScore,
    IOScore,
    DiscosScore,
    ErroresCriticosScore,
    MantenimientosScore,
    ConfiguracionTempdbScore,
    AutogrowthScore,
    -- Contribuciones Ponderadas (0-peso máximo)
    BackupsContribution,
    AlwaysOnContribution,
    LogChainContribution,
    DatabaseStatesContribution,
    CPUContribution,
    MemoriaContribution,
    IOContribution,
    DiscosContribution,
    ErroresCriticosContribution,
    MantenimientosContribution,
    ConfiguracionTempdbContribution,
    AutogrowthContribution,
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
    $($ScoreData.LogChainScore),
    $($ScoreData.DatabaseStatesScore),
    $($ScoreData.CPUScore),
    $($ScoreData.MemoriaScore),
    $($ScoreData.IOScore),
    $($ScoreData.DiscosScore),
    $($ScoreData.ErroresCriticosScore),
    $($ScoreData.MantenimientosScore),
    $($ScoreData.ConfiguracionTempdbScore),
    $($ScoreData.AutogrowthScore),
    -- Contribuciones Ponderadas (ya redondeadas a entero en el cálculo)
    $($ScoreData.BackupsContribution),
    $($ScoreData.AlwaysOnContribution),
    $($ScoreData.LogChainContribution),
    $($ScoreData.DatabaseStatesContribution),
    $($ScoreData.CPUContribution),
    $($ScoreData.MemoriaContribution),
    $($ScoreData.IOContribution),
    $($ScoreData.DiscosContribution),
    $($ScoreData.ErroresCriticosContribution),
    $($ScoreData.MantenimientosContribution),
    $($ScoreData.ConfiguracionTempdbContribution),
    $($ScoreData.AutogrowthContribution),
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
Write-Host " Health Score v3.0 FINAL - CONSOLIDATOR (12 categorias)" -ForegroundColor Cyan
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
    $logChainResult = Calculate-LogChainScore -Data $data
    $databaseStatesResult = Calculate-DatabaseStatesScore -Data $data
    $cpuResult = Calculate-CPUScore -Data $data
    $memoriaResult = Calculate-MemoriaScore -Data $data
    $ioResult = Calculate-IOScore -Data $data
    $discosResult = Calculate-DiscosScore -Data $data
    $erroresResult = Calculate-ErroresCriticosScore -Data $data
    $mantenimientosResult = Calculate-MantenimientosScore -Data $data
    $configTempdbResult = Calculate-ConfiguracionTempdbScore -Data $data
    $autogrowthResult = Calculate-AutogrowthScore -Data $data
    
    # Aplicar caps individuales
    $backupsScore = Apply-Cap -Score $backupsResult.Score -Cap $backupsResult.Cap
    $alwaysOnScore = Apply-Cap -Score $alwaysOnResult.Score -Cap $alwaysOnResult.Cap
    $logChainScore = Apply-Cap -Score $logChainResult.Score -Cap $logChainResult.Cap
    $databaseStatesScore = Apply-Cap -Score $databaseStatesResult.Score -Cap $databaseStatesResult.Cap
    $cpuScore = Apply-Cap -Score $cpuResult.Score -Cap $cpuResult.Cap
    $memoriaScore = Apply-Cap -Score $memoriaResult.Score -Cap $memoriaResult.Cap
    $ioScore = Apply-Cap -Score $ioResult.Score -Cap $ioResult.Cap
    $discosScore = Apply-Cap -Score $discosResult.Score -Cap $discosResult.Cap
    $erroresScore = Apply-Cap -Score $erroresResult.Score -Cap $erroresResult.Cap
    $mantenimientosScore = Apply-Cap -Score $mantenimientosResult.Score -Cap $mantenimientosResult.Cap
    $configTempdbScore = Apply-Cap -Score $configTempdbResult.Score -Cap $configTempdbResult.Cap
    $autogrowthScore = Apply-Cap -Score $autogrowthResult.Score -Cap $autogrowthResult.Cap
    
    # Determinar cap global (el más restrictivo)
    $globalCap = 100
    $allCaps = @($backupsResult.Cap, $alwaysOnResult.Cap, $logChainResult.Cap, $databaseStatesResult.Cap,
                 $cpuResult.Cap, $memoriaResult.Cap, $ioResult.Cap, $discosResult.Cap, 
                 $erroresResult.Cap, $mantenimientosResult.Cap, $configTempdbResult.Cap, $autogrowthResult.Cap)
    $globalCap = ($allCaps | Measure-Object -Minimum).Minimum
    
    # Calcular contribuciones reales redondeadas a entero
    $backupsContribution = [int][Math]::Round($backupsScore * $PESOS.Backups / 100)
    $alwaysOnContribution = [int][Math]::Round($alwaysOnScore * $PESOS.AlwaysOn / 100)
    $logChainContribution = [int][Math]::Round($logChainScore * $PESOS.LogChain / 100)
    $databaseStatesContribution = [int][Math]::Round($databaseStatesScore * $PESOS.DatabaseStates / 100)
    $cpuContribution = [int][Math]::Round($cpuScore * $PESOS.CPU / 100)
    $memoriaContribution = [int][Math]::Round($memoriaScore * $PESOS.Memoria / 100)
    $ioContribution = [int][Math]::Round($ioScore * $PESOS.IO / 100)
    $discosContribution = [int][Math]::Round($discosScore * $PESOS.Discos / 100)
    $erroresContribution = [int][Math]::Round($erroresScore * $PESOS.ErroresCriticos / 100)
    $mantenimientosContribution = [int][Math]::Round($mantenimientosScore * $PESOS.Mantenimientos / 100)
    $configTempdbContribution = [int][Math]::Round($configTempdbScore * $PESOS.ConfiguracionTempdb / 100)
    $autogrowthContribution = [int][Math]::Round($autogrowthScore * $PESOS.Autogrowth / 100)
    
    # Calcular suma sin cap
    $totalScoreBeforeCap = [int](
        $backupsContribution +
        $alwaysOnContribution +
        $logChainContribution +
        $databaseStatesContribution +
        $cpuContribution +
        $memoriaContribution +
        $ioContribution +
        $discosContribution +
        $erroresContribution +
        $mantenimientosContribution +
        $configTempdbContribution +
        $autogrowthContribution
    )
    
    # Aplicar cap global y ajustar contribuciones proporcionalmente si es necesario
    if ($totalScoreBeforeCap -gt $globalCap) {
        # Calcular factor de ajuste
        $adjustmentFactor = [decimal]$globalCap / [decimal]$totalScoreBeforeCap
        
        # Ajustar cada contribución proporcionalmente
        $backupsContribution = [int][Math]::Round($backupsContribution * $adjustmentFactor)
        $alwaysOnContribution = [int][Math]::Round($alwaysOnContribution * $adjustmentFactor)
        $logChainContribution = [int][Math]::Round($logChainContribution * $adjustmentFactor)
        $databaseStatesContribution = [int][Math]::Round($databaseStatesContribution * $adjustmentFactor)
        $cpuContribution = [int][Math]::Round($cpuContribution * $adjustmentFactor)
        $memoriaContribution = [int][Math]::Round($memoriaContribution * $adjustmentFactor)
        $ioContribution = [int][Math]::Round($ioContribution * $adjustmentFactor)
        $discosContribution = [int][Math]::Round($discosContribution * $adjustmentFactor)
        $erroresContribution = [int][Math]::Round($erroresContribution * $adjustmentFactor)
        $mantenimientosContribution = [int][Math]::Round($mantenimientosContribution * $adjustmentFactor)
        $configTempdbContribution = [int][Math]::Round($configTempdbContribution * $adjustmentFactor)
        $autogrowthContribution = [int][Math]::Round($autogrowthContribution * $adjustmentFactor)
        
        # Recalcular totalScore con contribuciones ajustadas
        $totalScore = [int](
            $backupsContribution +
            $alwaysOnContribution +
            $logChainContribution +
            $databaseStatesContribution +
            $cpuContribution +
            $memoriaContribution +
            $ioContribution +
            $discosContribution +
            $erroresContribution +
            $mantenimientosContribution +
            $configTempdbContribution +
            $autogrowthContribution
        )
        
        # Ajuste fino: si la suma no llega exactamente al cap por redondeos, ajustar la contribución mayor
        if ($totalScore -lt $globalCap) {
            $diff = $globalCap - $totalScore
            # Determinar cuál es la contribución más grande y agregarle la diferencia
            $maxValue = ($backupsContribution, $alwaysOnContribution, $logChainContribution, $databaseStatesContribution,
                        $cpuContribution, $memoriaContribution, $ioContribution, $discosContribution, 
                        $erroresContribution, $mantenimientosContribution, $configTempdbContribution, 
                        $autogrowthContribution | Measure-Object -Maximum).Maximum
            
            if ($backupsContribution -eq $maxValue) { $backupsContribution += $diff }
            elseif ($alwaysOnContribution -eq $maxValue) { $alwaysOnContribution += $diff }
            elseif ($logChainContribution -eq $maxValue) { $logChainContribution += $diff }
            elseif ($databaseStatesContribution -eq $maxValue) { $databaseStatesContribution += $diff }
            elseif ($cpuContribution -eq $maxValue) { $cpuContribution += $diff }
            elseif ($memoriaContribution -eq $maxValue) { $memoriaContribution += $diff }
            elseif ($ioContribution -eq $maxValue) { $ioContribution += $diff }
            elseif ($discosContribution -eq $maxValue) { $discosContribution += $diff }
            elseif ($erroresContribution -eq $maxValue) { $erroresContribution += $diff }
            elseif ($mantenimientosContribution -eq $maxValue) { $mantenimientosContribution += $diff }
            elseif ($configTempdbContribution -eq $maxValue) { $configTempdbContribution += $diff }
            else { $autogrowthContribution += $diff }
            
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
        LogChainScore = $logChainScore
        DatabaseStatesScore = $databaseStatesScore
        CPUScore = $cpuScore
        MemoriaScore = $memoriaScore
        IOScore = $ioScore
        DiscosScore = $discosScore
        ErroresCriticosScore = $erroresScore
        MantenimientosScore = $mantenimientosScore
        ConfiguracionTempdbScore = $configTempdbScore
        AutogrowthScore = $autogrowthScore
        BackupsContribution = $backupsContribution
        AlwaysOnContribution = $alwaysOnContribution
        LogChainContribution = $logChainContribution
        DatabaseStatesContribution = $databaseStatesContribution
        CPUContribution = $cpuContribution
        MemoriaContribution = $memoriaContribution
        IOContribution = $ioContribution
        DiscosContribution = $discosContribution
        ErroresCriticosContribution = $erroresContribution
        MantenimientosContribution = $mantenimientosContribution
        ConfiguracionTempdbContribution = $configTempdbContribution
        AutogrowthContribution = $autogrowthContribution
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
Write-Host " RESUMEN FINAL - HEALTH SCORE v3.0 (12 CATEGORIAS)" -ForegroundColor Green
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

Write-Host " TAB 1: AVAILABILITY & DR (40pct)" -ForegroundColor Cyan
$avgBackups = ($results | Measure-Object -Property BackupsScore -Average).Average
$avgAlwaysOn = ($results | Measure-Object -Property AlwaysOnScore -Average).Average
$avgLogChain = ($results | Measure-Object -Property LogChainScore -Average).Average
$avgDatabaseStates = ($results | Measure-Object -Property DatabaseStatesScore -Average).Average
Write-Host "  Backups:              $([int]$avgBackups)/100 (18pct)" -ForegroundColor White
Write-Host "  AlwaysOn:             $([int]$avgAlwaysOn)/100 (14pct)" -ForegroundColor White
Write-Host "  Log Chain:            $([int]$avgLogChain)/100 (5pct)" -ForegroundColor White
Write-Host "  Database States:      $([int]$avgDatabaseStates)/100 (3pct)" -ForegroundColor White

Write-Host " TAB 2: PERFORMANCE (35pct)" -ForegroundColor Cyan
$avgCPU = ($results | Measure-Object -Property CPUScore -Average).Average
$avgMemoria = ($results | Measure-Object -Property MemoriaScore -Average).Average
$avgIO = ($results | Measure-Object -Property IOScore -Average).Average
$avgDiscos = ($results | Measure-Object -Property DiscosScore -Average).Average
Write-Host "  CPU:                  $([int]$avgCPU)/100 (10pct)" -ForegroundColor White
Write-Host "  Memoria:              $([int]$avgMemoria)/100 (8pct)" -ForegroundColor White
Write-Host "  IO:                   $([int]$avgIO)/100 (10pct)" -ForegroundColor White
Write-Host "  Discos:               $([int]$avgDiscos)/100 (7pct)" -ForegroundColor White

Write-Host " TAB 3: MAINTENANCE & CONFIG (25pct)" -ForegroundColor Cyan
$avgErrores = ($results | Measure-Object -Property ErroresCriticosScore -Average).Average
$avgMantenimientos = ($results | Measure-Object -Property MantenimientosScore -Average).Average
$avgConfig = ($results | Measure-Object -Property ConfiguracionTempdbScore -Average).Average
$avgAutogrowth = ($results | Measure-Object -Property AutogrowthScore -Average).Average
Write-Host "  Errores Criticos:     $([int]$avgErrores)/100 (7pct)" -ForegroundColor White
Write-Host "  Mantenimientos:       $([int]$avgMantenimientos)/100 (5pct)" -ForegroundColor White
Write-Host "  Config/TempDB:        $([int]$avgConfig)/100 (8pct)" -ForegroundColor White
Write-Host "  Autogrowth:           $([int]$avgAutogrowth)/100 (5pct)" -ForegroundColor White

Write-Host "=========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Consolidacion completada!" -ForegroundColor Green

#endregion

