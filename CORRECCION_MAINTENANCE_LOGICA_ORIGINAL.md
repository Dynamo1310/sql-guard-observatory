# Corrección de Lógica en RelevamientoHealthScore_Maintenance.ps1

## 🎯 Problema Detectado

El script `RelevamientoHealthScore_Maintenance.ps1` **NO** estaba usando la lógica correcta del script original `RelevamientoHealthScoreMant.ps1` para determinar la última ejecución de los jobs de mantenimiento.

---

## 🔴 Lógica Incorrecta (Antes)

### Query SQL Incorrecta

```sql
-- ❌ PROBLEMA: Solo usa run_date + run_time (tiempo de INICIO)
SELECT 
    j.name AS JobName,
    js.last_run_date AS LastRunDate,
    js.last_run_time AS LastRunTime,
    js.last_run_outcome AS LastRunStatus,
    -- Sin calcular tiempo de FINALIZACIÓN real
FROM msdb.dbo.sysjobs j
INNER JOIN msdb.dbo.sysjobsteps js ON j.job_id = js.job_id
WHERE js.step_id = 1
```

### Problemas Identificados

1. **Tiempo de Inicio vs Finalización:**
   - Solo consideraba `run_date + run_time` (inicio)
   - **NO** sumaba `run_duration`
   - Si un job empezó a las 23:50 y tardó 20 minutos, el script pensaba que terminó a las 23:50, pero **realmente terminó a las 00:10 del día siguiente**

2. **Sin Lógica de Desempate:**
   - Si había múltiples ejecuciones (ej: reintentos), no priorizaba por status
   - Podía tomar un job "Failed" en lugar de uno "Succeeded" si tenían la misma hora de inicio

3. **No Compatible con Historial Completo:**
   - Solo miraba `sysjobsteps` y `sysjobservers`
   - No analizaba TODO el historial en `sysjobhistory`

---

## ✅ Lógica Correcta (Después)

### Query SQL Correcta

```sql
-- ✅ CORRECTO: Calcula tiempo de FINALIZACIÓN real
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS HistoryRunDate,
        jh.run_time AS HistoryRunTime,
        jh.run_duration AS HistoryRunDuration,
        jh.run_status AS HistoryRunStatus,
        -- Calcular tiempo de finalización: run_date + run_time + run_duration
        -- run_duration está en formato HHMMSS (int): 20107 = 2h 1m 7s
        DATEADD(SECOND, 
            (jh.run_duration / 10000) * 3600 +          -- Horas
            ((jh.run_duration / 100) % 100) * 60 +      -- Minutos
            (jh.run_duration % 100),                    -- Segundos
            CAST(CAST(jh.run_date AS VARCHAR) + ' ' + 
                 STUFF(STUFF(RIGHT('000000' + CAST(jh.run_time AS VARCHAR), 6), 5, 0, ':'), 3, 0, ':') 
                 AS DATETIME)
        ) AS HistoryFinishTime,
        ROW_NUMBER() OVER (
            PARTITION BY j.job_id 
            ORDER BY 
                -- Ordenar por tiempo de finalización DESC
                DATEADD(SECOND, ...) DESC,
                -- En caso de empate, priorizar: Succeeded(1) > Failed(0) > Canceled(3)
                CASE WHEN jh.run_status = 1 THEN 0 
                     WHEN jh.run_status = 0 THEN 1 
                     WHEN jh.run_status = 3 THEN 2 
                     ELSE 3 END ASC
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
    COALESCE(HistoryRunDuration, ServerRunDuration) AS LastRunDuration,
    COALESCE(HistoryRunStatus, ServerRunOutcome) AS LastRunStatus,
    HistoryFinishTime AS LastFinishTime
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
```

### Mejoras Implementadas

1. **✅ Tiempo de Finalización Real:**
   - Calcula: `run_date + run_time + run_duration`
   - Un job que empezó a las 23:50 y tardó 20 min → termina a las 00:10

2. **✅ Desempate Inteligente:**
   - En caso de empate en tiempo de finalización:
     - `Succeeded (1)` tiene prioridad 0 (primero)
     - `Failed (0)` tiene prioridad 1 (segundo)
     - `Canceled (3)` tiene prioridad 2 (tercero)

3. **✅ Historial Completo:**
   - Usa `sysjobhistory` con `step_id = 0` (nivel job completo)
   - Compatible con SQL Server 2008 R2+

4. **✅ Dos Resultsets Separados:**
   - Primer query: IntegrityCheck jobs
   - Segundo query: IndexOptimize jobs

---

## 🔧 Cambios en el Código PowerShell

### 1. Procesamiento de Resultsets

**Antes:**
```powershell
$datasets = Invoke-DbaQuery -SqlInstance $InstanceName -Query $query
$checkdbJobs = $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' }
$indexOptJobs = $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' }
```

**Después:**
```powershell
# Query devuelve array de 2 resultsets
$datasets = Invoke-DbaQuery -SqlInstance $InstanceName -Query $query

# Primer resultset: IntegrityCheck
$checkdbJobs = if ($datasets -is [array] -and $datasets.Count -gt 0) { 
    $datasets[0] 
} else { 
    $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' } 
}

# Segundo resultset: IndexOptimize
$indexOptJobs = if ($datasets -is [array] -and $datasets.Count -gt 1) { 
    $datasets[1] 
} else { 
    $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' } 
}
```

### 2. Fallback de Cálculo de Fechas

**Antes:**
```powershell
# ❌ Solo calculaba tiempo de INICIO
$runDate = $job.LastRunDate.ToString()
$runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
$lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
```

**Después:**
```powershell
# ✅ Calcula tiempo de FINALIZACIÓN (inicio + duración)
$runDate = $job.LastRunDate.ToString()
$runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
$startTime = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)

# Sumar duración si existe (formato HHMMSS)
if ($job.LastRunDuration -and $job.LastRunDuration -ne [DBNull]::Value) {
    $duration = [int]$job.LastRunDuration
    $hours = [Math]::Floor($duration / 10000)
    $minutes = [Math]::Floor(($duration % 10000) / 100)
    $seconds = $duration % 100
    $lastRun = $startTime.AddHours($hours).AddMinutes($minutes).AddSeconds($seconds)
} else {
    $lastRun = $startTime
}
```

---

## 📊 Ejemplo de Impacto

### Escenario: Job de CHECKDB

| Detalle | Valor |
|---------|-------|
| **Fecha inicio** | 2025-10-23 23:50:00 |
| **Duración** | 20 minutos (run_duration = 2000) |
| **Fecha finalización real** | 2025-10-24 00:10:00 |

#### Lógica Incorrecta (Antes)
- **Detectaba:** Job terminó a las `23:50:00`
- **Resultado:** Si se evalúa a las `23:55` del mismo día, el job parece reciente
- **Problema:** ¡El job AÚN ESTÁ CORRIENDO!

#### Lógica Correcta (Después)
- **Detecta:** Job terminó a las `00:10:00` del día siguiente
- **Resultado:** Si se evalúa a las `23:55`, el job NO ha terminado aún
- **Correcto:** Refleja el estado real

---

## ✅ Archivos Actualizados

- **`scripts/RelevamientoHealthScore_Maintenance.ps1`**
  - Función `Get-MaintenanceJobs`:
    - Query SQL actualizada con cálculo de `HistoryFinishTime`
    - Lógica de desempate por status
    - Procesamiento de 2 resultsets
    - Fallback mejorado con cálculo de duración

---

## 🧪 Validación

Para verificar que la corrección funciona:

```powershell
# Ejecutar script de Maintenance
.\scripts\RelevamientoHealthScore_Maintenance.ps1 -Verbose

# Verificar en SQL que los tiempos sean correctos
SELECT TOP 10
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    CollectedAtUtc
FROM dbo.InstanceHealth_Maintenance
ORDER BY CollectedAtUtc DESC;
```

---

## 📚 Referencia

- **Script Original:** `scripts/RelevamientoHealthScoreMant.ps1` (líneas 89-192)
- **Script Corregido:** `scripts/RelevamientoHealthScore_Maintenance.ps1` (líneas 56-273)
- **Función Afectada:** `Get-MaintenanceJobs`

---

**Versión:** 1.0  
**Fecha:** Octubre 2025  
**Autor:** SQL Guard Observatory Team

