<#
.SYNOPSIS
    Health Score v3.0 FINAL - CONSOLIDADOR y CÃ¡lculo Final
    
.DESCRIPTION
    Script que:
    1. Lee datos de las 12 tablas especializadas
    2. Calcula HealthScore final (100 puntos)
    3. Aplica pesos segÃºn categorÃ­a
    4. Aplica penalizaciones SELECTIVAS (solo a categorÃ­as relacionadas)
    5. Guarda en InstanceHealth_Score
    
    PENALIZACIONES BALANCEADAS (NO caps globales):
    - Autogrowth crÃ­tico â†’ Penaliza Discos, I/O, AlwaysOn
    - TempDB crÃ­tico â†’ Penaliza I/O, CPU, Memoria
    - Backups crÃ­tico â†’ Penaliza AlwaysOn, LogChain
    - Errores severos â†’ Penaliza CPU, Memoria, I/O (moderado)
    - Discos crÃ­ticos â†’ Penaliza Autogrowth, I/O
    
    CATEGORÃAS Y PESOS (100 puntos) - 12 CATEGORÃAS:
    
    TAB 1: AVAILABILITY & DR (40%)
    1. ðŸ—„ï¸  Backups (RPO/RTO)           18%
    2. â™»ï¸  AlwaysOn (AG)               14%
    3. ðŸ”— Log Chain Integrity          5%
    4. ðŸ—„ï¸  Database States             3%
    
    TAB 2: PERFORMANCE (35%)
    5. âš™ï¸  CPU                          10%
    6. ðŸ§  Memoria (PLE + Grants)       8%
    7. ðŸ’½ IO (Latencia / IOPS)         10%
    8. ðŸ§± Espacio en discos            7%
    
    TAB 3: MAINTENANCE & CONFIG (25%)
    9. ðŸš¨ Errores sevâ‰¥20               7%
    10. ðŸ§¹ Mantenimientos              5%
    11. ðŸ§© Config & TempDB (compuesto) 8%
    12. ðŸ“ˆ Autogrowth & Capacity       5%
    
    SEMÃFORO:
    ðŸŸ¢ Healthy (90-100): Optimal performance
    ðŸŸ¡ Warning (75-89): Requires attention
    ðŸŸ  Risk (60-74): Action required
    ðŸ”´ Critical (<60): Immediate action
    
.NOTES
    VersiÃ³n: 3.0 FINAL (12 categorÃ­as balanceadas)
    Frecuencia: Cada 2-5 minutos
    Ejecutar DESPUÃ‰S de los scripts de recolecciÃ³n
    
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

Import-Module dbatools -Force -ErrorAction Stop

#region ===== CONFIGURACIÃ“N =====

$SqlServer = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$TimeoutSec = 30

# Pesos de las categorÃ­as (total = 100%)
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
        Convierte un valor potencialmente NULL/DBNull/vacÃ­o a un nÃºmero vÃ¡lido
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
        Convierte un valor potencialmente NULL/DBNull/vacÃ­o a un entero vÃ¡lido
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
    
    # DB crÃ­tica con log chain roto >24h => 0 pts y cap 0
    if ($Data.MaxHoursSinceLogBackup -gt 24 -and $Data.BrokenChainCount -gt 0) {
        $score = 0
        $cap = 0
    }
    # 1 DB crÃ­tica con log chain roto
    elseif ($Data.BrokenChainCount -eq 1) {
        $score = 50
    }
    # >2 DBs con log chain roto
    elseif ($Data.BrokenChainCount -gt 2) {
        $score = 20
    }
    # 1 DB no crÃ­tica con log chain roto
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
    
    # Alguna DB crÃ­tica OFFLINE/SUSPECT/EMERGENCY => 0
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
    # >1 DB en estado problemÃ¡tico
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
    
    # Obtener valores seguros
    $p95CPU = Get-SafeNumeric -Value $Data.P95CPUPercent -Default 0
    $runnableTasks = Get-SafeInt -Value $Data.RunnableTasks -Default 0
    
    # p95 â‰¤80% = 100, 81â€“90 = 70, >90 = 40
    if ($p95CPU -le 80) {
        $score = 100
    }
    elseif ($p95CPU -le 90) {
        $score = 70
    }
    else {
        $score = 40
    }
    
    # RunnableTask >1 sostenido => cap 70
    if ($runnableTasks -gt 1) {
        $cap = 70
    }
    
    # NUEVO: Waits de CPU (CXPACKET, CXCONSUMER, SOS_SCHEDULER_YIELD)
    $totalWaitMs = Get-SafeNumeric -Value $Data.TotalWaitMs -Default 0
    
    if ($totalWaitMs -gt 0) {
        # CXPACKET + CXCONSUMER: parallelism waits
        $cxPacketMs = Get-SafeNumeric -Value $Data.CXPacketWaitMs -Default 0
        $cxConsumerMs = Get-SafeNumeric -Value $Data.CXConsumerWaitMs -Default 0
        $parallelismMs = $cxPacketMs + $cxConsumerMs
        $parallelismPct = ($parallelismMs / $totalWaitMs) * 100
        
        # SOS_SCHEDULER_YIELD: CPU pressure
        $sosYieldMs = Get-SafeNumeric -Value $Data.SOSSchedulerYieldMs -Default 0
        $sosYieldPct = ($sosYieldMs / $totalWaitMs) * 100
        
        # Penalizar por CXPACKET/CXCONSUMER alto (mal MaxDOP o queries mal optimizadas)
        if ($parallelismPct -gt 15) {
            $score = [Math]::Min($score, 50)  # Parallelism muy alto
        }
        elseif ($parallelismPct -gt 10) {
            $score = [Math]::Min($score, 70)  # Parallelism alto
        }
        
        # Penalizar por SOS_SCHEDULER_YIELD alto (CPU pressure)
        if ($sosYieldPct -gt 15) {
            $score = [Math]::Min($score, 40)  # CPU muy saturado
            $cap = [Math]::Min($cap, 70)
        }
        elseif ($sosYieldPct -gt 10) {
            $score = [Math]::Min($score, 60)  # CPU saturado
        }
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
    
    # 0.6Ã—PLE + 0.25Ã—MemoryGrants + 0.15Ã—UsoMemoria
    
    # PLE objetivo = 300 s Ã— GB buffer pool
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
        if ($usoRatio -ge 0.95) { $usoScore = 100 }  # Casi al mÃ¡ximo configurado (Ã³ptimo)
        elseif ($usoRatio -ge 0.80) { $usoScore = 90 }
        elseif ($usoRatio -ge 0.60) { $usoScore = 70 }
        else { $usoScore = 50 }  # Muy por debajo del mÃ¡ximo (posible problema)
    }
    
    # FÃ³rmula ponderada
    $score = ($pleScore * 0.6) + ($grantsScore * 0.25) + ($usoScore * 0.15)
    
    # NUEVO: Waits de memoria (RESOURCE_SEMAPHORE) y Stolen Memory
    $totalWaitMs = Get-SafeNumeric -Value $Data.TotalWaitMs -Default 0
    
    if ($totalWaitMs -gt 0) {
        # RESOURCE_SEMAPHORE: queries esperando memoria
        $resSemMs = Get-SafeNumeric -Value $Data.ResourceSemaphoreWaitMs -Default 0
        $resSemPct = ($resSemMs / $totalWaitMs) * 100
        
        if ($resSemPct -gt 5) {
            $score = [Math]::Min($score, 40)  # Memory grants muy alto
            $cap = [Math]::Min($cap, 60)
        }
        elseif ($resSemPct -gt 2) {
            $score = [Math]::Min($score, 60)  # Memory grants alto
        }
    }
    
    # Stolen Memory: memoria fuera del buffer pool
    $stolenMemMB = Get-SafeNumeric -Value $Data.StolenServerMemoryMB -Default 0
    $totalMemMB = Get-SafeNumeric -Value $Data.TotalServerMemoryMB -Default 0
    
    if ($totalMemMB -gt 0 -and $stolenMemMB -gt 0) {
        $stolenPct = ($stolenMemMB / $totalMemMB) * 100
        
        if ($stolenPct -gt 50) {
            $score = [Math]::Min($score, 50)  # Stolen memory crÃ­tico
            $cap = [Math]::Min($cap, 70)
        }
        elseif ($stolenPct -gt 30) {
            $score = [Math]::Min($score, 70)  # Stolen memory alto
        }
    }
    
    # PLE <0.15Ã—objetivo o Grants>10 => cap 60
    if ($Data.PLETarget -gt 0 -and $Data.PageLifeExpectancy -lt ($Data.PLETarget * 0.15)) {
        $cap = [Math]::Min($cap, 60)
    }
    if ($Data.MemoryGrantsPending -gt 10) {
        $cap = [Math]::Min($cap, 60)
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
    
    # Latencia â‰¤5ms=100; 6â€“10=80; 11â€“20=60; >20=40
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
    
    # NUEVO: Waits de I/O (PAGEIOLATCH, WRITELOG, ASYNC_IO_COMPLETION)
    $totalWaitMs = Get-SafeNumeric -Value $Data.TotalWaitMs -Default 0
    
    if ($totalWaitMs -gt 0) {
        # PAGEIOLATCH: data page reads
        $pageIOLatchMs = Get-SafeNumeric -Value $Data.PageIOLatchWaitMs -Default 0
        $pageIOLatchPct = ($pageIOLatchMs / $totalWaitMs) * 100
        
        # WRITELOG: transaction log writes
        $writeLogMs = Get-SafeNumeric -Value $Data.WriteLogWaitMs -Default 0
        $writeLogPct = ($writeLogMs / $totalWaitMs) * 100
        
        # ASYNC_IO_COMPLETION: backup/bulk operations
        $asyncIOMs = Get-SafeNumeric -Value $Data.AsyncIOCompletionMs -Default 0
        $asyncIOPct = ($asyncIOMs / $totalWaitMs) * 100
        
        # Penalizar por PAGEIOLATCH alto (I/O lento en data files)
        if ($pageIOLatchPct -gt 10) {
            $score = [Math]::Min($score, 40)  # I/O data muy lento
            $cap = [Math]::Min($cap, 60)
        }
        elseif ($pageIOLatchPct -gt 5) {
            $score = [Math]::Min($score, 60)  # I/O data lento
        }
        
        # Penalizar por WRITELOG alto (I/O lento en log files)
        if ($writeLogPct -gt 10) {
            $score = [Math]::Min($score, 50)  # I/O log muy lento
            $cap = [Math]::Min($cap, 70)
        }
        elseif ($writeLogPct -gt 5) {
            $score = [Math]::Min($score, 70)  # I/O log lento
        }
        
        # ASYNC_IO_COMPLETION no penaliza tanto (operaciones batch esperadas)
        if ($asyncIOPct -gt 20) {
            $score = [Math]::Min($score, 80)  # Muchas operaciones batch
        }
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
    
    # Obtener valores seguros con default 100 (asumir OK si no hay datos)
    $dataDiskFreePct = Get-SafeNumeric -Value $Data.DataDiskAvgFreePct -Default 100
    $logDiskFreePct = Get-SafeNumeric -Value $Data.LogDiskAvgFreePct -Default 100
    $worstFreePct = Get-SafeNumeric -Value $Data.WorstFreePct -Default 100
    
    # Promedio ponderado: priorizar Data y Log
    $dataWeight = 0.5
    $logWeight = 0.3
    $otherWeight = 0.2
    
    $weightedFreePct = ($dataDiskFreePct * $dataWeight) + 
                       ($logDiskFreePct * $logWeight) + 
                       ($worstFreePct * $otherWeight)
    
    # â‰¥20% = 100, 15â€“19% = 80, 10â€“14% = 60, 5â€“9% = 40, <5% = 0
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
    if ($dataDiskFreePct -lt 10 -or $logDiskFreePct -lt 10) {
        $cap = 40
    }
    
    return @{ Score = $score; Cap = $cap }
}

# 9. ERRORES CRÃTICOS & BLOCKING (7%)
function Calculate-ErroresCriticosScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # 0 errores = 100, âˆ’10 por cada evento (mÃ¡x âˆ’40)
    if ($Data.Severity20PlusCount -eq 0) {
        $score = 100
    }
    else {
        $score = 100 - ($Data.Severity20PlusCount * 10)
        if ($score -lt 60) { $score = 60 }  # MÃ¡ximo âˆ’40
    }
    
    # Si hay evento reciente => cap 70
    if ($Data.Severity20PlusLast1h -gt 0) {
        $cap = 70
    }
    
    # NUEVO: Blocking (sesiones bloqueadas)
    $blockedCount = Get-SafeInt -Value $Data.BlockedSessionCount -Default 0
    $maxBlockTime = Get-SafeInt -Value $Data.MaxBlockTimeSeconds -Default 0
    
    if ($blockedCount -gt 0) {
        # Blocking severo (>10 sesiones o >30s)
        if ($blockedCount -gt 10 -or $maxBlockTime -gt 30) {
            $score = [Math]::Min($score, 40)  # Blocking crÃ­tico
            $cap = [Math]::Min($cap, 60)
        }
        # Blocking moderado (5-10 sesiones o 10-30s)
        elseif ($blockedCount -gt 5 -or $maxBlockTime -gt 10) {
            $score = [Math]::Min($score, 60)  # Blocking alto
            $cap = [Math]::Min($cap, 80)
        }
        # Blocking bajo (1-5 sesiones o <10s)
        else {
            $score = [Math]::Min($score, 80)  # Blocking leve
        }
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
    
    # 100 si CHECKDB â‰¤7 dÃ­as
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
                $score = 0  # >30 dÃ­as => 0 pts
            }
        }
        catch {
            # Si no se puede parsear la fecha, asumir sin datos
            $score = 0
        }
    }
    
    return @{ Score = $score; Cap = $cap }
}

# DIAGNÃ“STICO INTELIGENTE DE I/O PARA TEMPDB
function Get-IODiagnosisForTempDB {
    <#
    .SYNOPSIS
        Genera diagnÃ³stico inteligente de I/O para TempDB basado en tipo de disco, latencia, y carga
    .DESCRIPTION
        Analiza el tipo de disco (HDD/SSD/NVMe), latencias, carga del sistema, y competencia
        para determinar la causa raÃ­z de problemas de I/O en TempDB
    #>
    param(
        [decimal]$WriteLatencyMs,
        [decimal]$ReadLatencyMs,
        [string]$MountPoint,
        [string]$VolumesJson,
        [int]$PageLifeExpectancy,
        [int]$PageWritesPerSec,
        [int]$LazyWritesPerSec,
        [int]$CPUCount
    )
    
    $diagnosis = @{
        Problem = $null
        Severity = "OK"
        Suggestion = $null
        Icon = "âœ…"
        MediaType = "Unknown"
        HealthStatus = "Unknown"
        DatabaseCount = 0
        IsDedicated = $false
    }
    
    # Si no hay latencia, asumir OK
    if ($WriteLatencyMs -eq 0 -and $ReadLatencyMs -eq 0) {
        return $diagnosis
    }
    
    # Parsear VolumesJson para obtener info del disco de TempDB
    if (![string]::IsNullOrWhiteSpace($VolumesJson) -and ![string]::IsNullOrWhiteSpace($MountPoint)) {
        try {
            $volumes = $VolumesJson | ConvertFrom-Json
            $tempdbVolume = $volumes | Where-Object { $_.MountPoint -eq $MountPoint } | Select-Object -First 1
            
            if ($tempdbVolume) {
                $diagnosis.MediaType = if ($tempdbVolume.MediaType) { $tempdbVolume.MediaType } else { "Unknown" }
                $diagnosis.HealthStatus = if ($tempdbVolume.HealthStatus) { $tempdbVolume.HealthStatus } else { "Unknown" }
                $diagnosis.DatabaseCount = if ($tempdbVolume.DatabaseCount) { [int]$tempdbVolume.DatabaseCount } else { 0 }
                
                # Detectar si TempDB estÃ¡ en disco dedicado (solo 1 DB en el disco)
                $diagnosis.IsDedicated = ($diagnosis.DatabaseCount -eq 1)
            }
        } catch {
            # Si falla el parseo, continuar con valores Unknown
        }
    }
    
    # --- CASO 1: Disco no saludable ---
    if ($diagnosis.HealthStatus -in @("Warning", "Unhealthy", "Degraded")) {
        $diagnosis.Problem = "Hardware degradado o fallando"
        $diagnosis.Severity = "CRITICAL"
        $diagnosis.Suggestion = "El disco fÃ­sico reporta problemas de hardware. Revisar SMART, RAID, o reemplazar disco urgentemente"
        $diagnosis.Icon = "ðŸš¨"
        return $diagnosis
    }
    
    # --- CASO 2: HDD con latencia alta ---
    if ($diagnosis.MediaType -eq "HDD") {
        if ($WriteLatencyMs -gt 50) {
            $diagnosis.Problem = "Disco HDD mecÃ¡nico (lento por naturaleza)"
            $diagnosis.Severity = "HIGH"
            $diagnosis.Suggestion = "TempDB en disco HDD ($([int]$WriteLatencyMs)ms escritura). Migrar a SSD/NVMe urgentemente"
            $diagnosis.Icon = "ðŸŒ"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -gt 20) {
            $diagnosis.Problem = "Disco HDD (considerar actualizar)"
            $diagnosis.Severity = "MEDIUM"
            $diagnosis.Suggestion = "TempDB en HDD. Migrar a SSD para mejor rendimiento (latencia: $([int]$WriteLatencyMs)ms)"
            $diagnosis.Icon = "âš ï¸"
            return $diagnosis
        }
    }
    
    # --- CASO 3: SSD con latencia alta (problema real) ---
    if ($diagnosis.MediaType -in @("SSD", "Unspecified") -and $WriteLatencyMs -gt 10) {
        
        # CRÃTICO: SSD con >100ms
        if ($WriteLatencyMs -gt 100) {
            # Diagnosticar causa especÃ­fica
            
            # CASO: Disco compartido con muchas DBs
            if (-not $diagnosis.IsDedicated -and $diagnosis.DatabaseCount -gt 5) {
                $diagnosis.Problem = "TempDB en disco COMPARTIDO con $($diagnosis.DatabaseCount) DBs"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "ðŸš¨ TempDB compartiendo disco SSD con $($diagnosis.DatabaseCount) bases de datos ($([int]$WriteLatencyMs)ms). Mover TempDB a disco DEDICADO urgentemente"
                $diagnosis.Icon = "ðŸš¨"
            }
            # CASO: PresiÃ³n de memoria (incluso en disco dedicado)
            elseif ($LazyWritesPerSec -gt 100) {
                $dedicatedText = if ($diagnosis.IsDedicated) { "en disco DEDICADO" } else { "en disco compartido" }
                $diagnosis.Problem = "PresiÃ³n de memoria generando lazy writes ($LazyWritesPerSec/s)"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "ðŸš¨ TempDB $dedicatedText con alta escritura por presiÃ³n de memoria ($([int]$WriteLatencyMs)ms, $LazyWritesPerSec lazy writes/s). Revisar PLE y considerar mÃ¡s RAM"
                $diagnosis.Icon = "ðŸš¨"
            }
            # CASO: Disco dedicado con problemas
            elseif ($diagnosis.IsDedicated) {
                $diagnosis.Problem = "TempDB en disco DEDICADO pero con latencia muy alta"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "ðŸš¨ TempDB en disco DEDICADO SSD pero con $([int]$WriteLatencyMs)ms. Revisar: RAID cache, BBU, storage backend, firmware, o problemas de hardware"
                $diagnosis.Icon = "ðŸš¨"
            }
            # CASO: Problema general
    else {
                $diagnosis.Problem = "Posible problema de hardware, RAID, o storage backend"
                $diagnosis.Severity = "CRITICAL"
                $diagnosis.Suggestion = "ðŸš¨ SSD con latencia anormal ($([int]$WriteLatencyMs)ms). Si es HDD, migrar a SSD/NVMe. Si ya es SSD, revisar sobrecarga o problemas de hardware"
                $diagnosis.Icon = "ðŸš¨"
            }
            return $diagnosis
        }
        
        # ADVERTENCIA: SSD con 50-100ms
        if ($WriteLatencyMs -gt 50) {
            # CASO: Disco compartido
            if (-not $diagnosis.IsDedicated -and $diagnosis.DatabaseCount -gt 2) {
                $diagnosis.Problem = "TempDB en disco COMPARTIDO con $($diagnosis.DatabaseCount) DBs"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "âš ï¸ TempDB compartiendo disco ($([int]$WriteLatencyMs)ms) con $($diagnosis.DatabaseCount) bases de datos. Considerar mover a disco DEDICADO"
                $diagnosis.Icon = "âš ï¸"
            }
            # CASO: PresiÃ³n de memoria
            elseif ($LazyWritesPerSec -gt 50) {
                $dedicatedText = if ($diagnosis.IsDedicated) { "DEDICADO" } else { "compartido" }
                $diagnosis.Problem = "PresiÃ³n de memoria incrementando I/O ($LazyWritesPerSec lazy writes/s)"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "âš ï¸ TempDB en disco $dedicatedText con escritura incrementada por presiÃ³n de memoria ($([int]$WriteLatencyMs)ms). Revisar PLE y considerar mÃ¡s RAM"
                $diagnosis.Icon = "âš ï¸"
            }
            # CASO: Disco dedicado con performance subÃ³ptima
            elseif ($diagnosis.IsDedicated) {
                $diagnosis.Problem = "Disco DEDICADO con rendimiento por debajo del esperado"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "âš ï¸ TempDB en disco DEDICADO pero con $([int]$WriteLatencyMs)ms. Revisar: carga de disco, IOPS provisionados, o tipo de storage (si es HDD migrar a SSD)"
                $diagnosis.Icon = "âš ï¸"
            }
            # CASO: General
            else {
                $diagnosis.Problem = "Storage mÃ¡s lento de lo esperado"
                $diagnosis.Severity = "MEDIUM"
                $diagnosis.Suggestion = "âš ï¸ SSD mÃ¡s lento de lo esperado ($([int]$WriteLatencyMs)ms). Revisar: carga de disco. Si es HDD, migrar a SSD. Si es SSD, revisar IOPS y competencia por storage"
                $diagnosis.Icon = "âš ï¸"
            }
            return $diagnosis
        }
        
        # MONITOREO: SSD con 10-50ms
        if ($WriteLatencyMs -gt 10) {
            $diagnosis.Problem = "Rendimiento por debajo del ideal"
            $diagnosis.Severity = "LOW"
            $diagnosis.Suggestion = "SSD con rendimiento aceptable pero mejorable ($([int]$WriteLatencyMs)ms). Monitorear tendencia"
            $diagnosis.Icon = "ðŸ“Š"
            return $diagnosis
        }
    }
    
    # --- CASO 4: Tipo desconocido (inferir por latencia) ---
    if ($diagnosis.MediaType -in @("Unspecified", "Unknown", "")) {
        if ($WriteLatencyMs -gt 100) {
            # Probablemente HDD o problema grave
            $diagnosis.Problem = "Latencia muy alta (tipo de disco desconocido)"
            $diagnosis.Severity = "CRITICAL"
            $diagnosis.Suggestion = "TempDB muy lento ($([int]$WriteLatencyMs)ms). Si es HDD, migrar a SSD/NVMe urgentemente. Si ya es SSD, revisar sobrecarga o problemas de hardware"
            $diagnosis.Icon = "ðŸš¨"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -gt 50) {
            # Probablemente HDD o SSD con problemas
            $diagnosis.Problem = "Latencia alta (posible HDD o SSD sobrecargado)"
            $diagnosis.Severity = "MEDIUM"
            $diagnosis.Suggestion = "TempDB lento ($([int]$WriteLatencyMs)ms). Verificar tipo de disco. Si es HDD, migrar a SSD. Si es SSD, revisar IOPS y competencia por storage"
            $diagnosis.Icon = "âš ï¸"
            return $diagnosis
        }
        elseif ($WriteLatencyMs -lt 10) {
            # Probablemente SSD - todo bien
            $diagnosis.Problem = $null
            $diagnosis.Severity = "OK"
            $diagnosis.Suggestion = $null
            $diagnosis.Icon = "âœ…"
            return $diagnosis
        }
    }
    
    # --- CASO 5: Todo OK ---
    $diagnosis.Problem = $null
    $diagnosis.Severity = "OK"
    $diagnosis.Suggestion = $null
    $diagnosis.Icon = "âœ…"
    return $diagnosis
}

# 11. CONFIGURACIÃ“N & TEMPDB (8%)
function Calculate-ConfiguracionTempdbScore {
    <#
    .SYNOPSIS
        Calcula el score de ConfiguraciÃ³n & TempDB combinando el TempDB Health Score
        compuesto (ya calculado por el collector) con la configuraciÃ³n de Max Memory.
    .DESCRIPTION
        FÃ³rmula: 60% TempDB Health Score + 40% Max Memory Config
        
        El TempDB Health Score compuesto (calculado por el collector) ya considera:
        - 40% ContenciÃ³n (PAGELATCH waits)
        - 30% Latencia de disco (write latency)
        - 20% ConfiguraciÃ³n (files, same size, growth)
        - 10% Recursos (free space, version store)
    #>
    param(
        [object]$Data
    )
    
    $score = 0
    $cap = 100
    
    # 60% TempDB Health Score Compuesto (ya calculado por el collector)
    # Este score ya considera contenciÃ³n, latencia, config y recursos
    $tempdbHealthScore = if ($Data.TempDBContentionScore -ne $null) {
        [int]$Data.TempDBContentionScore
    } else {
        50  # Default si no hay datos
    }
    
    # 40% ConfiguraciÃ³n de Max Memory
    $memoryScore = 100
    if (-not $Data.MaxMemoryWithinOptimal) {
        $memoryScore = 60  # No estÃ¡ dentro del rango Ã³ptimo (70-95%)
    }
    
    # Score final ponderado
    $score = ($tempdbHealthScore * 0.6) + ($memoryScore * 0.4)
    
    # NO aplicar cap individual - las penalizaciones selectivas ya se encargan
    # de penalizar I/O (-50%), CPU (-30%), y Memoria (-20%) cuando TempDB < 40
    # Esto evita el "doble castigo" y permite que el score refleje el valor real
    
    return @{ Score = [int]$score; Cap = $cap }
}

# 12. AUTOGROWTH & CAPACITY (5%)
function Calculate-AutogrowthScore {
    param(
        [object]$Data
    )
    
    $score = 100
    $cap = 100
    
    # Convertir valores nulos o vacÃ­os a 0 para comparaciones seguras usando funciones helper
    $autogrowthEvents = Get-SafeInt -Value $Data.AutogrowthEventsLast24h -Default 0
    $worstPercentOfMax = Get-SafeNumeric -Value $Data.WorstPercentOfMax -Default 0
    $filesNearLimit = Get-SafeInt -Value $Data.FilesNearLimit -Default 0
    $filesWithBadGrowth = Get-SafeInt -Value $Data.FilesWithBadGrowth -Default 0
    
    # Autogrowth events
    if ($autogrowthEvents -eq 0) {
        $score = 100
    }
    elseif ($autogrowthEvents -le 10) {
        $score = 100
    }
    elseif ($autogrowthEvents -le 50) {
        $score = 80
    }
    elseif ($autogrowthEvents -le 100) {
        $score = 60
    }
    elseif ($autogrowthEvents -le 500) {
        $score = 40
    }
    else {
        $score = 20  # >500 autogrowths
    }
    
    # Files near limit
    if ($worstPercentOfMax -gt 90) {
        $score = 0
        $cap = 50
    }
    elseif ($filesNearLimit -gt 0) {
        $score -= 30
        if ($score -lt 0) { $score = 0 }
    }
    
    # Bad growth config
    if ($filesWithBadGrowth -gt 0) {
        $score -= 20
        if ($score -lt 0) { $score = 0 }
    }
    
    return @{ Score = $score; Cap = $cap }
}

# FunciÃ³n para aplicar caps
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

# FunciÃ³n para determinar estado segÃºn rango
function Get-HealthStatus {
    param([decimal]$Score)
    
    if ($Score -ge 90) { return "Healthy" }
    if ($Score -ge 75) { return "Warning" }
    if ($Score -ge 60) { return "Risk" }
    return "Critical"
}

# FunciÃ³n para mostrar estado (solo para consola)
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
),
LatestWaits AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Waits
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
    d.VolumesJson,
    d.PageLifeExpectancy AS DiskPageLifeExpectancy,
    d.PageWritesPerSec AS DiskPageWritesPerSec,
    d.LazyWritesPerSec AS DiskLazyWritesPerSec,
    -- Memoria
    mem.PageLifeExpectancy,
    mem.BufferPoolSizeMB,
    mem.MemoryGrantsPending,
    mem.TotalServerMemoryMB,
    mem.MaxServerMemoryMB,
    mem.PLETarget,
    mem.StolenServerMemoryMB,
    -- Maintenance
    mnt.LastCheckdb,
    mnt.CheckdbOk,
    -- Config/TempDB (con nuevas mÃ©tricas extendidas)
    cfg.TempDBFileCount,
    cfg.TempDBAllSameSize,
    cfg.TempDBAllSameGrowth,
    cfg.TempDBGrowthConfigOK,
    cfg.TempDBAvgReadLatencyMs,
    cfg.TempDBAvgWriteLatencyMs,
    cfg.TempDBMountPoint,
    cfg.TempDBContentionScore,
    cfg.TempDBFreeSpacePct,
    cfg.CPUCount,
    cfg.TempDBVersionStoreMB,
    cfg.TempDBTotalSizeMB,
    cfg.TempDBUsedSpaceMB,
    cfg.MaxMemoryWithinOptimal,
    -- Autogrowth
    au.AutogrowthEventsLast24h,
    au.FilesNearLimit,
    au.FilesWithBadGrowth,
    au.WorstPercentOfMax,
    -- Waits & Blocking (NUEVO)
    w.BlockedSessionCount,
    w.MaxBlockTimeSeconds,
    w.CXPacketWaitMs,
    w.CXConsumerWaitMs,
    w.SOSSchedulerYieldMs,
    w.ThreadPoolWaitMs,
    w.ResourceSemaphoreWaitMs,
    w.PageIOLatchWaitMs,
    w.WriteLogWaitMs,
    w.AsyncIOCompletionMs,
    w.TotalWaits,
    w.TotalWaitMs
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
LEFT JOIN LatestAutogrowth au ON 1=1
LEFT JOIN LatestWaits w ON 1=1;
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
    -- DiagnÃ³stico Inteligente de I/O
    TempDBIODiagnosis,
    TempDBIOSuggestion,
    TempDBIOSeverity,
    -- Contribuciones Ponderadas (0-peso mÃ¡ximo)
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
    GETDATE(),
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
    -- DiagnÃ³stico Inteligente de I/O
    $(if ([string]::IsNullOrEmpty($ScoreData.TempDBIODiagnosis)) { 'NULL' } else { "'$($ScoreData.TempDBIODiagnosis -replace "'", "''")'" }),
    $(if ([string]::IsNullOrEmpty($ScoreData.TempDBIOSuggestion)) { 'NULL' } else { "'$($ScoreData.TempDBIOSuggestion -replace "'", "''")'" }),
    $(if ([string]::IsNullOrEmpty($ScoreData.TempDBIOSeverity)) { 'NULL' } else { "'$($ScoreData.TempDBIOSeverity)'" }),
    -- Contribuciones Ponderadas (ya redondeadas a entero en el cÃ¡lculo)
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
        
        Invoke-Sqlcmd -ServerInstance $SqlServer `
            -Database $SqlDatabase `
            -Query $query `
            -QueryTimeout $TimeoutSec `
            -TrustServerCertificate `
            -ErrorAction Stop
        
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
        Write-Host "   âš ï¸  $instanceName - Sin datos suficientes" -ForegroundColor Yellow
        continue
    }
    
    # Calcular scores por categorÃ­a
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
    
    # Generar diagnÃ³stico inteligente de I/O para TempDB
    $ioDiagnosis = Get-IODiagnosisForTempDB `
        -WriteLatencyMs (Get-SafeNumeric -Value $data.TempDBAvgWriteLatencyMs -Default 0) `
        -ReadLatencyMs (Get-SafeNumeric -Value $data.TempDBAvgReadLatencyMs -Default 0) `
        -MountPoint ($data.TempDBMountPoint -as [string]) `
        -VolumesJson ($data.VolumesJson -as [string]) `
        -PageLifeExpectancy (Get-SafeNumeric -Value $data.DiskPageLifeExpectancy -Default 0) `
        -PageWritesPerSec (Get-SafeNumeric -Value $data.DiskPageWritesPerSec -Default 0) `
        -LazyWritesPerSec (Get-SafeNumeric -Value $data.DiskLazyWritesPerSec -Default 0) `
        -CPUCount (Get-SafeNumeric -Value $data.CPUCount -Default 0)
    
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
    
    # ===== PENALIZACIONES SELECTIVAS (BALANCEADAS) =====
    # En lugar de aplicar un cap global que penaliza TODO,
    # aplicamos penalizaciones solo a categorÃ­as relacionadas con el problema
    
    # Calcular contribuciones base (sin penalizaciones cruzadas)
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
    
    # PENALIZACIÃ“N SELECTIVA 1: Autogrowth crÃ­tico (archivo al lÃ­mite)
    if ($autogrowthScore -eq 0) {
        # Solo penalizar categorÃ­as RELACIONADAS con capacidad/disco
        $discosContribution = [int][Math]::Round($discosContribution * 0.5)      # -50% (capacidad relacionada)
        $ioContribution = [int][Math]::Round($ioContribution * 0.7)              # -30% (I/O relacionado)
        $alwaysOnContribution = [int][Math]::Round($alwaysOnContribution * 0.8)  # -20% (puede afectar sync)
        # Backups, CPU, Memory, Errores, etc. NO se penalizan (no relacionados)
    }
    
    # PENALIZACIÃ“N SELECTIVA 2: TempDB crÃ­tico (contenciÃ³n/disco lento)
    if ($configTempdbScore -lt 40) {
        # Solo penalizar categorÃ­as RELACIONADAS con performance
        $ioContribution = [int][Math]::Round($ioContribution * 0.5)        # -50% (disco lento causa TempDB lento)
        $cpuContribution = [int][Math]::Round($cpuContribution * 0.7)      # -30% (contenciÃ³n aumenta CPU)
        $memoriaContribution = [int][Math]::Round($memoriaContribution * 0.8) # -20% (contenciÃ³n puede ser por memoria)
        # Backups, Discos, AlwaysOn, etc. NO se penalizan (no relacionados)
    }
    
    # PENALIZACIÃ“N SELECTIVA 3: Backups crÃ­ticos
    if ($backupsScore -eq 0) {
        # Solo penalizar categorÃ­as RELACIONADAS con DR
        $alwaysOnContribution = [int][Math]::Round($alwaysOnContribution * 0.8)  # -20% (DR complementario)
        $logChainContribution = [int][Math]::Round($logChainContribution * 0.7)  # -30% (log backups relacionados)
        # CPU, Memory, I/O, etc. NO se penalizan (no relacionados)
    }
    
    # PENALIZACIÃ“N SELECTIVA 4: Errores crÃ­ticos severos
    if ($erroresScore -lt 30) {
        # PenalizaciÃ³n moderada global (errores indican inestabilidad general)
        $cpuContribution = [int][Math]::Round($cpuContribution * 0.8)            # -20%
        $memoriaContribution = [int][Math]::Round($memoriaContribution * 0.8)    # -20%
        $ioContribution = [int][Math]::Round($ioContribution * 0.8)              # -20%
        # Backups NO se penaliza (errores no afectan backups)
    }
    
    # PENALIZACIÃ“N SELECTIVA 5: Discos crÃ­ticos (< 10% libre)
    if ($discosScore -lt 30) {
        # Solo penalizar categorÃ­as RELACIONADAS con capacidad
        $autogrowthContribution = [int][Math]::Round($autogrowthContribution * 0.5) # -50% (directamente relacionado)
        $ioContribution = [int][Math]::Round($ioContribution * 0.7)                 # -30% (disco lleno afecta I/O)
        # CPU, Memory, Backups NO se penalizan
    }
    
    # Calcular score final (suma de contribuciones con penalizaciones selectivas)
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
        
    # NO aplicar cap global - cada categorÃ­a mantiene su contribuciÃ³n real con penalizaciones selectivas
    # Esto permite que una instancia con 10/12 categorÃ­as perfectas tenga un score razonable
    # en lugar de ser arrastrada a 50% por 2 problemas especÃ­ficos
    
    # Score final = suma de contribuciones (ya incluyen penalizaciones selectivas)
        $totalScore = $totalScoreBeforeCap
    
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
        
        # DiagnÃ³stico inteligente de I/O para TempDB
        TempDBIODiagnosis = $ioDiagnosis.Problem
        TempDBIOSuggestion = $ioDiagnosis.Suggestion
        TempDBIOSeverity = $ioDiagnosis.Severity
        
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
        GlobalCap = 100  # Ya no se usa cap global, solo penalizaciones selectivas
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

Write-Host "  [OK] Healthy (>=90):   $healthyCount" -ForegroundColor Green
Write-Host "  [WARN] Warning (75-89): $warningCount" -ForegroundColor Yellow
Write-Host "  [RISK] Risk (60-74):    $riskCount" -ForegroundColor DarkYellow
Write-Host "  [CRIT] Critical (<60):  $criticalCount" -ForegroundColor Red

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


