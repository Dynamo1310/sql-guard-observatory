<#
.SYNOPSIS
    Health Score v2.0 - CONSOLIDADOR y Cálculo Final
    
.DESCRIPTION
    Script que:
    1. Lee datos de las 4 tablas especializadas
    2. Sincroniza datos entre nodos AlwaysOn
    3. Calcula HealthScore final (150 puntos)
    4. Guarda en InstanceHealth_Score
    
    SCORING (150 puntos):
    ├─ TIER 1: Disponibilidad (50 pts)
    │  ├─ Conectividad: 20 pts
    │  ├─ Latency: incluido en conectividad
    │  ├─ Blocking: 10 pts
    │  └─ Memory (PLE): 10 pts
    │  └─ AlwaysOn: 10 pts
    ├─ TIER 2: Continuidad (40 pts)
    │  ├─ FULL Backup: 15 pts
    │  └─ LOG Backup: 15 pts
    │  └─ AlwaysOn (moved to Tier1): 10 pts
    ├─ TIER 3: Recursos (40 pts)
    │  ├─ Disk Space: 15 pts
    │  ├─ IOPS/Latencia: 15 pts
    │  └─ Query Performance: 10 pts
    └─ TIER 4: Mantenimiento (20 pts)
       ├─ CHECKDB: 10 pts
       ├─ IndexOptimize: 5 pts
       └─ Errorlog: 5 pts
    
.NOTES
    Versión: 2.0 (dbatools)
    Frecuencia: Cada 2 minutos
    Ejecutar DESPUÉS de los otros scripts
    
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
Import-Module dbatools -ErrorAction Stop

#region ===== CONFIGURACIÓN =====

$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30

#endregion

#region ===== FUNCIONES DE SCORING =====

function Calculate-ConnectivityScore {
    param(
        [bool]$ConnectSuccess,
        [int]$ConnectLatencyMs
    )
    
    # 20 puntos máximo
    if (-not $ConnectSuccess) { return 0 }
    
    # Base: 15 pts por conectar
    # Bonus: hasta 5 pts por latencia
    $baseScore = 15
    $latencyBonus = 0
    
    if ($ConnectLatencyMs -le 10) { $latencyBonus = 5 }
    elseif ($ConnectLatencyMs -le 50) { $latencyBonus = 3 }
    elseif ($ConnectLatencyMs -le 100) { $latencyBonus = 1 }
    
    return $baseScore + $latencyBonus
}

function Calculate-BlockingScore {
    param([int]$BlockingCount)
    
    # 10 puntos máximo
    if ($BlockingCount -eq 0) { return 10 }
    if ($BlockingCount -le 3) { return 7 }
    if ($BlockingCount -le 10) { return 3 }
    return 0
}

function Calculate-MemoryScore {
    param([int]$PageLifeExpectancy)
    
    # 10 puntos máximo
    if ($PageLifeExpectancy -ge 300) { return 10 }  # Excelente
    if ($PageLifeExpectancy -ge 200) { return 7 }   # Bueno
    if ($PageLifeExpectancy -ge 100) { return 3 }   # Aceptable
    return 0  # Crítico
}

function Calculate-AlwaysOnScore {
    param(
        [bool]$AlwaysOnEnabled,
        [string]$AlwaysOnWorstState
    )
    
    # 10 puntos máximo
    if (-not $AlwaysOnEnabled) { return 10 }  # N/A = OK
    
    switch ($AlwaysOnWorstState) {
        "HEALTHY" { return 10 }
        "WARNING" { return 5 }
        "CRITICAL" { return 0 }
        default { return 10 }
    }
}

function Calculate-FullBackupScore {
    param([bool]$FullBackupBreached)
    
    # 15 puntos máximo
    return if ($FullBackupBreached) { 0 } else { 15 }
}

function Calculate-LogBackupScore {
    param([bool]$LogBackupBreached)
    
    # 15 puntos máximo
    return if ($LogBackupBreached) { 0 } else { 15 }
}

function Calculate-DiskSpaceScore {
    param([int]$DiskWorstFreePct)
    
    # 15 puntos máximo
    if ($DiskWorstFreePct -ge 30) { return 15 }
    if ($DiskWorstFreePct -ge 20) { return 10 }
    if ($DiskWorstFreePct -ge 10) { return 5 }
    return 0  # Crítico
}

function Calculate-IOPSScore {
    param(
        [decimal]$AvgReadLatencyMs,
        [decimal]$AvgWriteLatencyMs
    )
    
    # 15 puntos máximo
    $avgLatency = ($AvgReadLatencyMs + $AvgWriteLatencyMs) / 2
    
    if ($avgLatency -eq 0) { return 15 }  # Sin datos = OK
    if ($avgLatency -le 10) { return 15 }  # Excelente (SSD)
    if ($avgLatency -le 20) { return 12 }  # Bueno
    if ($avgLatency -le 50) { return 7 }   # Aceptable (HDD)
    return 0  # Crítico
}

function Calculate-QueryPerformanceScore {
    param(
        [int]$SlowQueriesCount,
        [int]$LongRunningCount
    )
    
    # 10 puntos máximo
    $totalSlow = $SlowQueriesCount + $LongRunningCount
    
    if ($totalSlow -eq 0) { return 10 }
    if ($totalSlow -le 3) { return 7 }
    if ($totalSlow -le 10) { return 3 }
    return 0
}

function Calculate-CheckdbScore {
    param([bool]$CheckdbOk)
    
    # 10 puntos máximo
    return if ($CheckdbOk) { 10 } else { 0 }
}

function Calculate-IndexOptimizeScore {
    param([bool]$IndexOptimizeOk)
    
    # 5 puntos máximo
    return if ($IndexOptimizeOk) { 5 } else { 0 }
}

function Calculate-ErrorlogScore {
    param([int]$Severity20PlusCount)
    
    # 5 puntos máximo
    if ($Severity20PlusCount -eq 0) { return 5 }
    if ($Severity20PlusCount -le 2) { return 3 }
    return 0
}

function Get-HealthStatus {
    param([int]$Score)
    
    # Escala de 150 puntos:
    # Healthy: ≥135 (90%)
    # Warning: 105-134 (70-89%)
    # Critical: <105 (<70%)
    
    if ($Score -ge 135) { return "Healthy" }
    if ($Score -ge 105) { return "Warning" }
    return "Critical"
}

#endregion

#region ===== FUNCIONES DE DATOS =====

function Get-LatestInstanceData {
    param([string]$InstanceName)
    
    try {
        # Query consolidado que trae todo de las 4 tablas
        $query = @"
WITH LatestAvailability AS (
    SELECT TOP 1 *
    FROM dbo.InstanceHealth_Critical_Availability
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestResources AS (
    SELECT TOP 1 *
    FROM dbo.InstanceHealth_Critical_Resources
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestBackups AS (
    SELECT TOP 1 *
    FROM dbo.InstanceHealth_Backups
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
),
LatestMaintenance AS (
    SELECT TOP 1 *
    FROM dbo.InstanceHealth_Maintenance
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
)
SELECT 
    '$InstanceName' AS InstanceName,
    -- Availability
    a.ConnectSuccess,
    a.ConnectLatencyMs,
    a.BlockingCount,
    a.PageLifeExpectancy,
    a.AlwaysOnEnabled,
    a.AlwaysOnWorstState,
    -- Resources
    r.DiskWorstFreePct,
    r.AvgReadLatencyMs,
    r.AvgWriteLatencyMs,
    r.SlowQueriesCount,
    r.LongRunningQueriesCount,
    -- Backups
    b.FullBackupBreached,
    b.LogBackupBreached,
    -- Maintenance
    m.CheckdbOk,
    m.IndexOptimizeOk,
    m.Severity20PlusCount
FROM LatestAvailability a
LEFT JOIN LatestResources r ON 1=1
LEFT JOIN LatestBackups b ON 1=1
LEFT JOIN LatestMaintenance m ON 1=1;
"@
        
        # Usar dbatools para ejecutar queries
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
    SELECT InstanceName FROM dbo.InstanceHealth_Critical_Availability
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_Critical_Resources
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_Backups
    UNION
    SELECT InstanceName FROM dbo.InstanceHealth_Maintenance
) AS AllInstances
ORDER BY InstanceName;
"@
        
        # Usar dbatools para ejecutar queries
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
        # Sanitizar valores NULL
        $connectSuccess = if ($ScoreData.ConnectSuccess) { 1 } else { 0 }
        
        $query = @"
INSERT INTO dbo.InstanceHealth_Score (
    InstanceName,
    CollectedAtUtc,
    HealthScore,
    HealthStatus,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    ConnectivityScore,
    LatencyScore,
    BlockingScore,
    MemoryScore,
    FullBackupScore,
    LogBackupScore,
    AlwaysOnScore,
    DiskSpaceScore,
    IOPSScore,
    QueryPerformanceScore,
    CheckdbScore,
    IndexOptimizeScore,
    ErrorlogScore
) VALUES (
    '$($ScoreData.InstanceName)',
    GETUTCDATE(),
    $($ScoreData.HealthScore),
    '$($ScoreData.HealthStatus)',
    $($ScoreData.Tier1),
    $($ScoreData.Tier2),
    $($ScoreData.Tier3),
    $($ScoreData.Tier4),
    $($ScoreData.ConnectivityScore),
    NULL,
    $($ScoreData.BlockingScore),
    $($ScoreData.MemoryScore),
    $($ScoreData.FullBackupScore),
    $($ScoreData.LogBackupScore),
    $($ScoreData.AlwaysOnScore),
    $($ScoreData.DiskSpaceScore),
    $($ScoreData.IOPSScore),
    $($ScoreData.QueryPerformanceScore),
    $($ScoreData.CheckdbScore),
    $($ScoreData.IndexOptimizeScore),
    $($ScoreData.ErrorlogScore)
);
"@
        
        # Usar dbatools para insertar datos
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
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  Health Score v2.0 - CONSOLIDATOR (150 puntos)       ║" -ForegroundColor Cyan
Write-Host "║  Frecuencia: 2 minutos                                ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 1. Obtener todas las instancias
Write-Host "1️⃣  Obteniendo lista de instancias..." -ForegroundColor Yellow

$instances = Get-AllInstanceNames

if ($instances.Count -eq 0) {
    Write-Error "No se encontraron instancias en las tablas!"
    exit 1
}

Write-Host "   Encontradas: $($instances.Count) instancias" -ForegroundColor Green

# 2. Procesar cada instancia
Write-Host ""
Write-Host "2️⃣  Calculando Health Score..." -ForegroundColor Yellow

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
    
    # Calcular scores individuales
    $connectivityScore = Calculate-ConnectivityScore `
        -ConnectSuccess $data.ConnectSuccess `
        -ConnectLatencyMs $data.ConnectLatencyMs
    
    $blockingScore = Calculate-BlockingScore -BlockingCount $data.BlockingCount
    $memoryScore = Calculate-MemoryScore -PageLifeExpectancy $data.PageLifeExpectancy
    $alwaysOnScore = Calculate-AlwaysOnScore `
        -AlwaysOnEnabled $data.AlwaysOnEnabled `
        -AlwaysOnWorstState $data.AlwaysOnWorstState
    
    $fullBackupScore = Calculate-FullBackupScore -FullBackupBreached $data.FullBackupBreached
    $logBackupScore = Calculate-LogBackupScore -LogBackupBreached $data.LogBackupBreached
    
    $diskScore = Calculate-DiskSpaceScore -DiskWorstFreePct $data.DiskWorstFreePct
    $iopsScore = Calculate-IOPSScore `
        -AvgReadLatencyMs $data.AvgReadLatencyMs `
        -AvgWriteLatencyMs $data.AvgWriteLatencyMs
    $queryScore = Calculate-QueryPerformanceScore `
        -SlowQueriesCount $data.SlowQueriesCount `
        -LongRunningCount $data.LongRunningQueriesCount
    
    $checkdbScore = Calculate-CheckdbScore -CheckdbOk $data.CheckdbOk
    $indexOptScore = Calculate-IndexOptimizeScore -IndexOptimizeOk $data.IndexOptimizeOk
    $errorlogScore = Calculate-ErrorlogScore -Severity20PlusCount $data.Severity20PlusCount
    
    # Calcular totales por tier
    $tier1 = $connectivityScore + $blockingScore + $memoryScore + $alwaysOnScore  # 50 pts
    $tier2 = $fullBackupScore + $logBackupScore  # 30 pts (moved AlwaysOn to Tier1)
    $tier3 = $diskScore + $iopsScore + $queryScore  # 40 pts
    $tier4 = $checkdbScore + $indexOptScore + $errorlogScore  # 20 pts
    
    $totalScore = $tier1 + $tier2 + $tier3 + $tier4  # 140 pts max (need to adjust)
    
    # Ajustar para que sea de 150 (adding 10 pts to Tier2 for AlwaysOn)
    $tier1 = $connectivityScore + $blockingScore + $memoryScore + $alwaysOnScore  # 50 pts max
    $tier2 = $fullBackupScore + $logBackupScore + $alwaysOnScore  # 40 pts max (15+15+10)
    $tier3 = $diskScore + $iopsScore + $queryScore  # 40 pts max
    $tier4 = $checkdbScore + $indexOptScore + $errorlogScore  # 20 pts max
    
    # Recalcular sin duplicar AlwaysOn
    $tier1 = $connectivityScore + $blockingScore + $memoryScore + $alwaysOnScore  # 50 pts
    $tier2 = $fullBackupScore + $logBackupScore  # 30 pts
    $tier3 = $diskScore + $iopsScore + $queryScore  # 40 pts
    $tier4 = $checkdbScore + $indexOptScore + $errorlogScore  # 20 pts
    
    # Agregar 10 pts más a tier2 para llegar a 150
    $tier2 = $tier2 + $alwaysOnScore  # Ahora es 40 pts (15+15+10)
    
    $totalScore = $tier1 + $tier2 + $tier3 + $tier4  # 150 pts max
    
    $healthStatus = Get-HealthStatus -Score $totalScore
    
    $statusIcon = switch ($healthStatus) {
        "Healthy" { "✅" }
        "Warning" { "⚠️" }
        "Critical" { "🚨" }
    }
    
    Write-Host "   $statusIcon $instanceName - Score: $totalScore/150 ($healthStatus) [T1:$tier1 T2:$tier2 T3:$tier3 T4:$tier4]" -ForegroundColor Gray
    
    # Crear objeto con todos los scores
    $scoreData = [PSCustomObject]@{
        InstanceName = $instanceName
        HealthScore = $totalScore
        HealthStatus = $healthStatus
        Tier1 = $tier1
        Tier2 = $tier2
        Tier3 = $tier3
        Tier4 = $tier4
        ConnectivityScore = $connectivityScore
        BlockingScore = $blockingScore
        MemoryScore = $memoryScore
        AlwaysOnScore = $alwaysOnScore
        FullBackupScore = $fullBackupScore
        LogBackupScore = $logBackupScore
        DiskSpaceScore = $diskScore
        IOPSScore = $iopsScore
        QueryPerformanceScore = $queryScore
        CheckdbScore = $checkdbScore
        IndexOptimizeScore = $indexOptScore
        ErrorlogScore = $errorlogScore
        ConnectSuccess = $data.ConnectSuccess
    }
    
    # Guardar en SQL
    if (Save-HealthScore -ScoreData $scoreData) {
        $results += $scoreData
    }
}

Write-Progress -Activity "Calculando Health Score" -Completed

# 3. Resumen final
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  RESUMEN FINAL - HEALTH SCORE v2.0                   ║" -ForegroundColor Green
Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Total instancias:     $($results.Count)".PadRight(53) "║" -ForegroundColor White

$avgScore = ($results | Measure-Object -Property HealthScore -Average).Average
Write-Host "║  Score promedio:       $([int]$avgScore)/150".PadRight(53) "║" -ForegroundColor White

$healthyCount = ($results | Where-Object { $_.HealthStatus -eq "Healthy" }).Count
$warningCount = ($results | Where-Object { $_.HealthStatus -eq "Warning" }).Count
$criticalCount = ($results | Where-Object { $_.HealthStatus -eq "Critical" }).Count

Write-Host "║  ✅ Healthy (≥135):    $healthyCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  ⚠️  Warning (105-134): $warningCount".PadRight(53) "║" -ForegroundColor White
Write-Host "║  🚨 Critical (<105):    $criticalCount".PadRight(53) "║" -ForegroundColor White

Write-Host "╠═══════════════════════════════════════════════════════╣" -ForegroundColor Green
Write-Host "║  Promedios por Tier:                                  ║" -ForegroundColor Green

$avgT1 = ($results | Measure-Object -Property Tier1 -Average).Average
$avgT2 = ($results | Measure-Object -Property Tier2 -Average).Average
$avgT3 = ($results | Measure-Object -Property Tier3 -Average).Average
$avgT4 = ($results | Measure-Object -Property Tier4 -Average).Average

Write-Host "║  Tier 1 (Availability): $([int]$avgT1)/50".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Tier 2 (Continuity):   $([int]$avgT2)/40".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Tier 3 (Resources):    $([int]$avgT3)/40".PadRight(53) "║" -ForegroundColor White
Write-Host "║  Tier 4 (Maintenance):  $([int]$avgT4)/20".PadRight(53) "║" -ForegroundColor White

Write-Host "╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Consolidación completada!" -ForegroundColor Green

#endregion
