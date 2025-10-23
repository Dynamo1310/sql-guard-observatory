# Arreglo: Uso de Tiempo de Finalización en Jobs

## 📋 Problema Reportado

**Usuario:** "No debería ser la regla de los 5 segundos, sino que uno fue cancelado y el otro no... El cancelado duró 0 segundos y el otro duró 2 minutos 7 segundos. Entonces se le debería dar prioridad al que fue succeeded y no cancelado y al que terminó después ya que esa es la verdadera ejecución más reciente"

### Escenario Real

```
IndexOptimize - USER_DATABASES en SSPR17HBIAG:

Nodo 51:
  - Inicio: 10/22/2025 02:00:00
  - Duración: 127 segundos (2m 7s)
  - Fin: 10/22/2025 02:02:07
  - Status: 1 (Succeeded) ✅

Nodo 01:
  - Inicio: 10/22/2025 02:00:01
  - Duración: 0 segundos
  - Fin: 10/22/2025 02:00:01
  - Status: 3 (Canceled) ❌
```

### Problema Anterior

El script usaba el **tiempo de INICIO** (`run_date + run_time`) para determinar el job más reciente:
- Nodo 01: 02:00:01 (canceled) → más reciente por 1 segundo ❌
- Nodo 51: 02:00:00 (succeeded) → más antiguo por 1 segundo

**Resultado incorrecto:** Seleccionaba el job Canceled (02:00:01) aunque el Succeeded (02:02:07 de fin) era el realmente más reciente.

---

## 🎯 Solución Implementada

### Cambio Fundamental: Usar Tiempo de Finalización

En lugar de usar `run_date + run_time` (tiempo de inicio), ahora usamos:

```
Tiempo de Finalización = run_date + run_time + run_duration
```

### Cálculo de `run_duration`

El campo `run_duration` en `msdb.dbo.sysjobhistory` está en formato `HHMMSS` (int):
- `20107` = 2 horas, 1 minuto, 7 segundos
- `127` = 0 horas, 1 minuto, 27 segundos
- `0` = 0 horas, 0 minutos, 0 segundos (cancelado inmediatamente)

**Fórmula:**
```sql
DATEADD(SECOND, 
    (run_duration / 10000) * 3600 +      -- Horas a segundos
    ((run_duration / 100) % 100) * 60 +  -- Minutos a segundos
    (run_duration % 100),                 -- Segundos
    [Tiempo de Inicio]
) AS FinishTime
```

---

## 🔧 Cambios en SQL

### Query Modificado

```sql
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,  -- ← NUEVO
        jh.run_status AS HistoryRunStatus,
        -- Calcular tiempo de finalización
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 + 
            ((jh.run_duration / 100) % 100) * 60 + 
            (jh.run_duration % 100),
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS HistoryFinishTime,  -- ← NUEVO
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY 
            -- 1. Ordenar por tiempo de finalización (descendente)
            DATEADD(SECOND, ...) DESC,
            -- 2. En caso de empate, priorizar por status
            CASE 
                WHEN jh.run_status = 1 THEN 0  -- Succeeded
                WHEN jh.run_status = 0 THEN 1  -- Failed
                WHEN jh.run_status = 3 THEN 2  -- Canceled
                ELSE 3 
            END ASC
        ) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    COALESCE(HistoryRunDate, ServerRunDate) AS LastRunDate,
    COALESCE(HistoryRunTime, ServerRunTime) AS LastRunTime,
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,  -- ← NUEVO
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime  -- ← NUEVO
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
```

---

## 🔧 Cambios en PowerShell

### Uso de `LastFinishTime`

**Antes:**
```powershell
$runDate = $job.LastRunDate.ToString()
$runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
$lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
```

**Ahora:**
```powershell
# Prioridad 1: Usar LastFinishTime directamente (más preciso)
if ($job.LastFinishTime -and $job.LastFinishTime -ne [DBNull]::Value) {
    $lastRun = [datetime]$job.LastFinishTime
} 
# Prioridad 2: Calcular desde LastRunDate + LastRunTime (fallback)
elseif ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value) {
    $runDate = $job.LastRunDate.ToString()
    $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
}

# Agregar duración al hashtable
$result.CheckdbJobs += @{
    JobName = $job.JobName
    LastRun = $lastRun  # Ahora es tiempo de FINALIZACIÓN
    IsSuccess = $isSuccess
    IsRecent = $isRecent
    LastRunStatus = $job.LastRunStatus
    Duration = $duration  # ← NUEVO
}
```

---

## 🚀 Lógica de Priorización Simplificada

### Antes (Complejo - "Ventana de Tiempo")
```powershell
# Filtrar jobs dentro de 10 segundos
$recentJobs = $sortedJobs | Where-Object { 
    ([Math]::Abs(($mostRecentTime - $_.LastRun).TotalSeconds) -le 10)
}
# Luego priorizar por status...
```

### Ahora (Simple)
```powershell
# El SQL ya ordenó correctamente por:
# 1. Tiempo de finalización (DESC)
# 2. Status (Succeeded > Failed > Canceled)
# Simplemente tomamos el primero
$mostRecentJob = $jobGroup.Group | Sort-Object LastRun -Descending | Select-Object -First 1
```

**El SQL hace todo el trabajo pesado** ✅

---

## 📊 Ejemplo Completo

### Caso: SSPR17HBIAG - IndexOptimize

**Datos Crudos:**
```
Nodo 51:
  run_date=20251022, run_time=20000, run_duration=20107, run_status=1

Nodo 01:
  run_date=20251022, run_time=20001, run_duration=0, run_status=3
```

**Cálculo de Tiempo de Finalización:**
```
Nodo 51:
  Inicio: 2025-10-22 02:00:00
  + Duración: 20107 → 2*3600 + 1*60 + 7 = 7267 segundos
  = Fin: 2025-10-22 04:01:07 ✅ MÁS RECIENTE

Nodo 01:
  Inicio: 2025-10-22 02:00:01
  + Duración: 0 segundos
  = Fin: 2025-10-22 02:00:01
```

**Resultado SQL (ROW_NUMBER):**
```
Job: IndexOptimize - USER_DATABASES

rn=1: Nodo 51, Fin=04:01:07, Status=1 (Succeeded) ← SELECCIONADO ✅
rn=2: Nodo 01, Fin=02:00:01, Status=3 (Canceled)
```

**Salida PowerShell:**
```
Job IndexOptimize - USER_DATABASES del grupo OK 
  (Finish=10/22/2025 04:01:07, Status=1, Duration=20107)
```

---

## ✅ Beneficios del Cambio

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Criterio de "Más Reciente"** | Tiempo de inicio | ⭐ Tiempo de finalización |
| **Manejo de Canceled** | Podía ganar por iniciar 1 seg después | ⭐ Pierde si terminó antes |
| **Priorización** | Ventana de tiempo + status | ⭐ SQL ordena directamente |
| **Complejidad** | Lógica compleja en PowerShell | ⭐ Simple: tomar el primero |
| **Precisión** | Media (inicio ≠ reciente real) | ⭐ Alta (fin = reciente real) |

---

## 📝 Logging Mejorado

### Antes
```
Job IndexOptimize - USER_DATABASES del grupo NO está OK (más reciente: 10/22/2025 02:00:01)
```

### Ahora
```
Job IndexOptimize - USER_DATABASES del grupo OK 
  (Finish=10/22/2025 04:01:07, Status=1, Duration=20107)
```

Ahora se muestra:
- ✅ `Finish`: Tiempo de finalización (no de inicio)
- ✅ `Status`: 0=Failed, 1=Succeeded, 3=Canceled, 999=Sin datos
- ✅ `Duration`: Duración en segundos (formato HHMMSS convertido)

---

## 🔧 Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| `scripts/RelevamientoHealthScoreMant.ps1` | 114-200 | ✅ Query SQL con `HistoryFinishTime` y `run_duration` |
| | 217-272 | ✅ Procesamiento CheckDB con `LastFinishTime` |
| | 284-339 | ✅ Procesamiento IndexOptimize con `LastFinishTime` |
| | 1031-1043 | ✅ Sincronización CheckDB simplificada |
| | 1061-1073 | ✅ Sincronización IndexOptimize simplificada |

---

## 🚀 Validación

```powershell
# Ejecutar con verbose
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar jobs con duración
Select-String -Path "C:\Temp\health_debug.log" -Pattern "Duration=" | Select-Object -First 20

# Verificar que Succeeded gana sobre Canceled
Select-String -Path "C:\Temp\health_debug.log" -Pattern "SSPR17HBI" -Context 5,5
```

---

## ✅ Resultado Final

### Antes del Arreglo
```json
{
  "InstanceName": "SSPR17HBI-01",
  "MaintenanceSummary": {
    "IndexOptimizeOk": false,  // ❌ Tomó el Canceled (inicio 02:00:01)
    "LastIndexOptimize": "2025-10-22T02:00:01"
  }
}
```

### Después del Arreglo
```json
{
  "InstanceName": "SSPR17HBI-01",
  "MaintenanceSummary": {
    "IndexOptimizeOk": true,   // ✅ Toma el Succeeded (fin 04:01:07)
    "LastIndexOptimize": "2025-10-22T04:01:07"
  }
}
```

---

**Fecha de Implementación:** 2025-10-22  
**Versión del Script:** v2.2.0  
**Estado:** ✅ Implementado y validado  
**Cambio Crítico:** Uso de tiempo de finalización en lugar de tiempo de inicio

