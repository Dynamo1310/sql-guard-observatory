# 🔧 Actualización: Script de Consolidación v3.0 (100 puntos)

## 📋 **Resumen**

Actualización completa del script `RelevamientoHealthScore_Consolidate.ps1` para eliminar las métricas deshabilitadas (blocking, queries lentas) y ajustar el cálculo de puntajes al sistema de **100 puntos (v3.0)**.

---

## 🎯 **Cambios Principales**

### **1. Funciones de Scoring Fusionadas**

#### **`Calculate-ConnectivityScore` - 15 puntos**
**ANTES (v2.0):**
- Conectividad: 12 pts por conectar + 3 pts bonus latencia
- Blocking: Función separada (10 pts)
- **Total**: 2 funciones, máximo 22 pts

**DESPUÉS (v3.0):**
```powershell
function Calculate-ConnectivityScore {
    param(
        [bool]$ConnectSuccess,
        [int]$ConnectLatencyMs,
        [int]$BlockingCount  # ✅ NUEVO
    )
    
    # 15 puntos máximo - Incluye conectividad + latencia + blocking
    if (-not $ConnectSuccess) { return 0 }
    
    # Base: 10 pts por conectar exitosamente
    $baseScore = 10
    
    # Bonus por latencia (hasta 3 pts)
    $latencyBonus = 0
    if ($ConnectLatencyMs -le 10) { $latencyBonus = 3 }
    elseif ($ConnectLatencyMs -le 50) { $latencyBonus = 2 }
    elseif ($ConnectLatencyMs -le 100) { $latencyBonus = 1 }
    
    # Bonus por ausencia de blocking (hasta 2 pts)
    $blockingBonus = 0
    if ($BlockingCount -eq 0) { $blockingBonus = 2 }
    elseif ($BlockingCount -le 3) { $blockingBonus = 1 }
    
    return $baseScore + $latencyBonus + $blockingBonus
}
```

---

#### **`Calculate-DiskSpaceScore` - 20 puntos**
**ANTES (v2.0):**
- Espacio en disco: 10 pts
- IOPS: Función separada (8 pts)
- Queries: Función separada (7 pts)
- **Total**: 3 funciones, máximo 25 pts

**DESPUÉS (v3.0):**
```powershell
function Calculate-DiskSpaceScore {
    param(
        [int]$DiskWorstFreePct,
        [decimal]$AvgReadLatencyMs,  # ✅ NUEVO
        [decimal]$AvgWriteLatencyMs  # ✅ NUEVO
    )
    
    # 20 puntos máximo - Incluye espacio + IOPS
    
    # Componente 1: Espacio en disco (hasta 12 pts)
    $spaceScore = 0
    if ($DiskWorstFreePct -ge 30) { $spaceScore = 12 }
    elseif ($DiskWorstFreePct -ge 20) { $spaceScore = 9 }
    elseif ($DiskWorstFreePct -ge 10) { $spaceScore = 4 }
    
    # Componente 2: Latencia de I/O (hasta 8 pts)
    $latencyScore = 0
    if ($AvgReadLatencyMs -eq 0 -and $AvgWriteLatencyMs -eq 0) {
        $latencyScore = 8  # Sin datos = OK
    } else {
        $avgLatency = ($AvgReadLatencyMs + $AvgWriteLatencyMs) / 2
        if ($avgLatency -le 10) { $latencyScore = 8 }  # Excelente (SSD)
        elseif ($avgLatency -le 20) { $latencyScore = 6 }  # Bueno
        elseif ($avgLatency -le 50) { $latencyScore = 3 }  # Aceptable (HDD)
    }
    
    return $spaceScore + $latencyScore
}
```

---

### **2. Funciones Eliminadas**

❌ **`Calculate-BlockingScore`** → Fusionada con `ConnectivityScore`
❌ **`Calculate-IOPSScore`** → Fusionada con `DiskSpaceScore`
❌ **`Calculate-QueryPerformanceScore`** → Métrica deshabilitada, eliminada completamente

---

### **3. Ajuste de Puntajes a 100 puntos**

#### **`Calculate-AlwaysOnScore`**
```powershell
# ANTES: 6 puntos máximo
# DESPUÉS: 15 puntos máximo
if (-not $AlwaysOnEnabled) { return 15 }  # N/A = OK

switch ($AlwaysOnWorstState) {
    "HEALTHY" { return 15 }
    "WARNING" { return 7 }
    "CRITICAL" { return 0 }
    default { return 15 }
}
```

#### **`Calculate-FullBackupScore`**
```powershell
# ANTES: 12 puntos máximo
# DESPUÉS: 15 puntos máximo
if ($FullBackupBreached) { return 0 } else { return 15 }
```

#### **`Calculate-LogBackupScore`**
```powershell
# ANTES: 12 puntos máximo
# DESPUÉS: 15 puntos máximo
if ($LogBackupBreached) { return 0 } else { return 15 }
```

---

### **4. Cálculo de Tiers Actualizado**

**ANTES (v2.0 - 150 puntos):**
```powershell
# Tier 1: 35 pts (Conectividad=15, Blocking=10, Memoria=10)
$tier1 = $connectivityScore + $blockingScore + $memoryScore

# Tier 2: 30 pts (FullBackup=12, LogBackup=12, AlwaysOn=6)
$tier2 = $fullBackupScore + $logBackupScore + $alwaysOnScore

# Tier 3: 25 pts (Disk=10, IOPS=8, Queries=7)
$tier3 = $diskScore + $iopsScore + $queryScore

# Tier 4: 10 pts (CHECKDB=4, Index=3, Errorlog=3)
$tier4 = $checkdbScore + $indexOptScore + $errorlogScore

# TOTAL: 100 pts (¡pero sumaba 150!)
```

**DESPUÉS (v3.0 - 100 puntos):**
```powershell
# Tier 1: Disponibilidad (40 pts) - Conectividad=15, Memoria=10, AlwaysOn=15
$tier1 = $connectivityScore + $memoryScore + $alwaysOnScore  # 40 pts max

# Tier 2: Continuidad (30 pts) - FullBackup=15, LogBackup=15
$tier2 = $fullBackupScore + $logBackupScore  # 30 pts max

# Tier 3: Recursos (20 pts) - Discos=20 (incluye espacio + IOPS)
$tier3 = $diskScore  # 20 pts max

# Tier 4: Mantenimiento (10 pts) - CHECKDB=4, Index=3, Errorlog=3
$tier4 = $checkdbScore + $indexOptScore + $errorlogScore  # 10 pts max

# TOTAL: 100 pts ✅
```

---

### **5. Objeto de Datos Simplificado**

**ANTES:**
```powershell
$scoreData = [PSCustomObject]@{
    # ... metadata ...
    ConnectivityScore = $connectivityScore
    BlockingScore = $blockingScore           # ❌ ELIMINADO
    MemoryScore = $memoryScore
    AlwaysOnScore = $alwaysOnScore
    FullBackupScore = $fullBackupScore
    LogBackupScore = $logBackupScore
    DiskSpaceScore = $diskScore
    IOPSScore = $iopsScore                    # ❌ ELIMINADO
    QueryPerformanceScore = $queryScore       # ❌ ELIMINADO
    CheckdbScore = $checkdbScore
    IndexOptimizeScore = $indexOptScore
    ErrorlogScore = $errorlogScore
}
```

**DESPUÉS:**
```powershell
$scoreData = [PSCustomObject]@{
    # ... metadata ...
    ConnectivityScore = $connectivityScore    # Incluye blocking
    MemoryScore = $memoryScore
    AlwaysOnScore = $alwaysOnScore
    FullBackupScore = $fullBackupScore
    LogBackupScore = $logBackupScore
    DiskSpaceScore = $diskScore               # Incluye IOPS
    CheckdbScore = $checkdbScore
    IndexOptimizeScore = $indexOptScore
    ErrorlogScore = $errorlogScore
}
```

---

### **6. INSERT SQL Actualizado**

**Columnas ELIMINADAS del INSERT:**
- `BlockingScore`
- `IOPSScore`
- `QueryPerformanceScore`

**SQL Final (v3.0):**
```sql
INSERT INTO dbo.InstanceHealth_Score (
    InstanceName,
    Ambiente,
    HostingSite,
    SqlVersion,
    CollectedAtUtc,
    HealthScore,
    HealthStatus,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    ConnectivityScore,
    MemoryScore,
    AlwaysOnScore,
    FullBackupScore,
    LogBackupScore,
    DiskSpaceScore,
    CheckdbScore,
    IndexOptimizeScore,
    ErrorlogScore
) VALUES (...);
```

---

## 📊 **Sistema de Puntuación v3.0 Completo**

| **Tier**                | **Puntos** | **Componentes**                          |
|-------------------------|------------|------------------------------------------|
| **Tier 1: Disponibilidad** | **40**   | Conectividad (15) + Memoria (10) + AlwaysOn (15) |
| **Tier 2: Continuidad**    | **30**   | Full Backup (15) + Log Backup (15)        |
| **Tier 3: Recursos**       | **20**   | Discos (20, incluye espacio + IOPS)      |
| **Tier 4: Mantenimiento**  | **10**   | CHECKDB (4) + Index Optimize (3) + Errorlog (3) |
| **TOTAL**                  | **100**  |                                          |

---

## ✅ **Validación de Cambios**

### **Bloques Fusionados Correctamente:**
✅ **ConnectivityScore** ahora incluye:
- Conectividad base (10 pts)
- Latencia (hasta 3 pts)
- Blocking (hasta 2 pts)
- **Total: 15 pts máximo**

✅ **DiskSpaceScore** ahora incluye:
- Espacio en disco (hasta 12 pts)
- Latencia de I/O (hasta 8 pts)
- **Total: 20 pts máximo**

### **Métricas Deshabilitadas:**
✅ `BlockingCount` → Siempre devuelve 0, pero se usa en cálculo de ConnectivityScore
✅ `SlowQueriesCount` → Siempre devuelve 0, **ya no se usa en ningún cálculo**
✅ `LongRunningQueriesCount` → Siempre devuelve 0, **ya no se usa en ningún cálculo**

### **Suma de Tiers:**
```
Tier 1: 40 pts
Tier 2: 30 pts
Tier 3: 20 pts
Tier 4: 10 pts
─────────────
TOTAL: 100 pts ✅
```

---

## 📝 **Pasos para Implementar**

### **1. Ejecutar el Script Actualizado**
```powershell
.\scripts\RelevamientoHealthScore_Consolidate.ps1
```

### **2. Verificar Scores en SQL**
```sql
SELECT TOP 10
    InstanceName,
    HealthScore,
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    ConnectivityScore,
    DiskSpaceScore,
    CollectedAtUtc
FROM dbo.InstanceHealth_Score
ORDER BY CollectedAtUtc DESC;
```

### **3. Validar Suma de Tiers**
```sql
SELECT 
    InstanceName,
    HealthScore,
    Tier1_Availability + Tier2_Continuity + Tier3_Resources + Tier4_Maintenance AS CalculatedTotal,
    CASE 
        WHEN HealthScore = (Tier1_Availability + Tier2_Continuity + Tier3_Resources + Tier4_Maintenance)
        THEN '✅ OK'
        ELSE '❌ ERROR'
    END AS Validation
FROM dbo.InstanceHealth_Score
WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
ORDER BY CollectedAtUtc DESC;
```

---

## 🚀 **¡Listo!**

El script de consolidación ahora:
- ✅ Fusiona blocking en ConnectivityScore
- ✅ Fusiona IOPS en DiskSpaceScore
- ✅ Elimina QueryPerformanceScore completamente
- ✅ Usa el sistema de 100 puntos correctamente
- ✅ Inserta solo las columnas v3.0 que existen en la BD

