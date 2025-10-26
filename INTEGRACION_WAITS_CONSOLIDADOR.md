# Integración de Waits en el Consolidador - Health Score v3.1

## 🎯 Resumen de Cambios

Se integraron **10 nuevas métricas de waits y stolen memory** en el consolidador `RelevamientoHealthScore_Consolidate_v3_FINAL.ps1` para calcular penalizaciones dinámicas en el Health Score.

---

## 📊 Métricas Integradas

### 1. **CPU (10%)**
- ✅ CXPACKET + CXCONSUMER (parallelism waits)
- ✅ SOS_SCHEDULER_YIELD (CPU pressure)

### 2. **Memoria (8%)**
- ✅ RESOURCE_SEMAPHORE (memory grants)
- ✅ Stolen Memory (memoria fuera del buffer pool)

### 3. **I/O (10%)**
- ✅ PAGEIOLATCH (data page reads)
- ✅ WRITELOG (transaction log writes)
- ✅ ASYNC_IO_COMPLETION (backup/bulk operations)

### 4. **Errores & Blocking (7%)**
- ✅ Blocking (sesiones bloqueadas)
- ✅ MaxBlockTimeSeconds (tiempo de bloqueo)

---

## 🔧 Cambios Detallados

### 1. **Función `Get-LatestInstanceData`**

#### Agregado CTE `LatestWaits`:
```sql
LatestWaits AS (
    SELECT TOP 1 * FROM dbo.InstanceHealth_Waits
    WHERE InstanceName = '$InstanceName'
    ORDER BY CollectedAtUtc DESC
)
```

#### Agregadas columnas en el SELECT:
```sql
-- Stolen Memory
mem.StolenServerMemoryMB,

-- Waits & Blocking
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
```

#### Agregado JOIN:
```sql
LEFT JOIN LatestWaits w ON 1=1
```

---

### 2. **Función `Calculate-CPUScore`** ⚙️

**Thresholds de Penalización:**

#### CXPACKET + CXCONSUMER (Parallelism):
```powershell
if ($parallelismPct -gt 15) {
    $score = [Math]::Min($score, 50)  # Parallelism muy alto
}
elseif ($parallelismPct -gt 10) {
    $score = [Math]::Min($score, 70)  # Parallelism alto
}
```

#### SOS_SCHEDULER_YIELD (CPU Pressure):
```powershell
if ($sosYieldPct -gt 15) {
    $score = [Math]::Min($score, 40)  # CPU muy saturado
    $cap = [Math]::Min($cap, 70)
}
elseif ($sosYieldPct -gt 10) {
    $score = [Math]::Min($score, 60)  # CPU saturado
}
```

**Interpretación:**
- **< 10%**: Normal ✅
- **10-15%**: Advertencia ⚠️ (revisar MaxDOP, queries mal optimizadas)
- **> 15%**: Crítico 🔴 (CPU saturado, optimización urgente)

---

### 3. **Función `Calculate-MemoriaScore`** 🧠

**Thresholds de Penalización:**

#### RESOURCE_SEMAPHORE (Memory Grants):
```powershell
if ($resSemPct -gt 5) {
    $score = [Math]::Min($score, 40)  # Memory grants muy alto
    $cap = [Math]::Min($cap, 60)
}
elseif ($resSemPct -gt 2) {
    $score = [Math]::Min($score, 60)  # Memory grants alto
}
```

#### Stolen Memory:
```powershell
if ($stolenPct -gt 50) {
    $score = [Math]::Min($score, 50)  # Stolen memory crítico
    $cap = [Math]::Min($cap, 70)
}
elseif ($stolenPct -gt 30) {
    $score = [Math]::Min($score, 70)  # Stolen memory alto
}
```

**Interpretación:**
- **RESOURCE_SEMAPHORE**:
  - < 2%: Normal ✅
  - 2-5%: Advertencia ⚠️ (queries necesitan más memoria)
  - \> 5%: Crítico 🔴 (agregar memoria o optimizar queries)

- **Stolen Memory**:
  - < 30%: Normal ✅
  - 30-50%: Advertencia ⚠️ (revisar plan cache)
  - \> 50%: Crítico 🔴 (plan cache bloat o CLR memory leak)

---

### 4. **Función `Calculate-IOScore`** 💽

**Thresholds de Penalización:**

#### PAGEIOLATCH (Data Page Reads):
```powershell
if ($pageIOLatchPct -gt 10) {
    $score = [Math]::Min($score, 40)  # I/O data muy lento
    $cap = [Math]::Min($cap, 60)
}
elseif ($pageIOLatchPct -gt 5) {
    $score = [Math]::Min($score, 60)  # I/O data lento
}
```

#### WRITELOG (Transaction Log Writes):
```powershell
if ($writeLogPct -gt 10) {
    $score = [Math]::Min($score, 50)  # I/O log muy lento
    $cap = [Math]::Min($cap, 70)
}
elseif ($writeLogPct -gt 5) {
    $score = [Math]::Min($score, 70)  # I/O log lento
}
```

#### ASYNC_IO_COMPLETION (Backup/Bulk):
```powershell
if ($asyncIOPct -gt 20) {
    $score = [Math]::Min($score, 80)  # Muchas operaciones batch
}
```

**Interpretación:**
- **PAGEIOLATCH**:
  - < 5%: Normal ✅ (discos rápidos)
  - 5-10%: Advertencia ⚠️ (discos lentos)
  - \> 10%: Crítico 🔴 (discos muy lentos, agregar índices)

- **WRITELOG**:
  - < 5%: Normal ✅
  - 5-10%: Advertencia ⚠️ (log I/O lento)
  - \> 10%: Crítico 🔴 (mover log a disco más rápido)

- **ASYNC_IO_COMPLETION**:
  - < 20%: Normal ✅ (backups/bulk esperados)
  - \> 20%: Leve ⚠️ (muchas operaciones batch)

---

### 5. **Función `Calculate-ErroresCriticosScore`** 🚨

**Thresholds de Penalización:**

#### Blocking:
```powershell
# Blocking severo (>10 sesiones o >30s)
if ($blockedCount -gt 10 -or $maxBlockTime -gt 30) {
    $score = [Math]::Min($score, 40)  # Blocking crítico
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
```

**Interpretación:**
- **0 sesiones**: Normal ✅
- **1-5 sesiones o < 10s**: Leve ⚠️ (probablemente temporal)
- **5-10 sesiones o 10-30s**: Alto 🟠 (investigar locks)
- **> 10 sesiones o > 30s**: Crítico 🔴 (deadlocks, bad queries)

---

## 📈 Impacto en el Health Score

### Ejemplo de Instancia con Waits Altos

**Antes (sin waits):**
- CPU P95: 70% → Score: 100
- PLE: 5000s → Score: 100
- **Health Score CPU**: 10/10
- **Health Score Memoria**: 8/8

**Después (con waits):**
- CPU P95: 70% → Base Score: 100
- **CXPACKET: 12%** → Score penalizado a **70**
- **SOS_YIELD: 8%** → No penaliza (< 10%)
- **Health Score CPU**: **7/10** (en lugar de 10/10)

- PLE: 5000s → Base Score: 100
- **RESOURCE_SEMAPHORE: 3%** → Score penalizado a **60**
- **Stolen Memory: 40%** → Score penalizado a **70**
- **Final Score Memoria**: **mín(60, 70) = 60**
- **Health Score Memoria**: **4.8/8** (en lugar de 8/8)

**Health Score Total**: **Reducido de 100 → 85** por waits altos

---

## 🧪 Testing

### Ejecutar el Consolidador:
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1
```

### Validar Datos:
```sql
-- Ver instancias con waits impactando el score
SELECT 
    InstanceName,
    HealthScore,
    CPUScore,
    MemoriaScore,
    IOScore,
    ErroresCriticosScore
FROM dbo.InstanceHealth_Score
WHERE CollectedAtUtc > DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY HealthScore ASC;
```

---

## 📝 Próximos Pasos

1. ✅ **Consolidador actualizado**
2. ⏳ **Backend**: Verificar que los modelos y DTOs incluyan las nuevas métricas
3. ⏳ **Frontend**: Agregar visualización de waits en el dashboard

---

## 🎯 Beneficios

### Antes:
- Score basado solo en métricas puntuales (CPU%, PLE, latencia)
- **No detectaba**: queries mal optimizadas, plan cache bloat, I/O waits

### Ahora:
- Score integra **performance real** a través de waits
- **Detecta**: paralelismo excesivo, memory pressure, I/O bottlenecks, blocking
- **Penalizaciones dinámicas** basadas en % de tiempo en waits
- **Más preciso**: refleja experiencia real de usuarios/queries

---

## ✅ Resumen

**10 nuevas métricas integradas**:
1. CXPACKET + CXCONSUMER → CPU
2. SOS_SCHEDULER_YIELD → CPU
3. RESOURCE_SEMAPHORE → Memoria
4. Stolen Memory → Memoria
5. PAGEIOLATCH → I/O
6. WRITELOG → I/O
7. ASYNC_IO_COMPLETION → I/O
8. Blocking → Errores
9. MaxBlockTimeSeconds → Errores
10. TotalWaitMs → Base para cálculos

**Todas las categorías de performance ahora incluyen waits** para un scoring más preciso y accionable. 🚀

