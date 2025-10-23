# ⚠️ ACTUALIZADO - Ahora usa Tiempo de Finalización

> **NOTA:** Este documento describe la lógica de priorización por status, que ahora se aplica en el SQL usando tiempo de finalización.  
> **Ver:** `ARREGLO_TIEMPO_FINALIZACION_JOBS.md` para el enfoque completo actual.

---

# Arreglo: Priorización de Status en Jobs de AlwaysOn

## 📋 Problema Reportado

**Usuario:** "En el caso de que en un nodo el job fue canceled pero a la misma hora en el otro nodo fue succeeded o failed, siempre la corrida canceled tiene la última prioridad"

### Escenario Problemático

```
SSPR19MBK-01 (Nodo 1):
  - IntegrityCheck-UserDBs: 2025-10-22 02:00:00, Status=3 (Canceled)

SSPR19MBK-51 (Nodo 2):
  - IntegrityCheck-UserDBs: 2025-10-22 02:00:00, Status=1 (Succeeded)
```

**Comportamiento Anterior:** El script podía seleccionar el job "Canceled" si aparecía primero.

**Comportamiento Esperado:** Siempre priorizar "Succeeded" o "Failed" sobre "Canceled" cuando hay empate de fecha.

---

## 🎯 Solución Implementada

### 1. Agregado `LastRunStatus` a Hashtables de Jobs

**Antes:**
```powershell
$result.CheckdbJobs += @{
    JobName = $job.JobName
    LastRun = $lastRun
    IsSuccess = $isSuccess
    IsRecent = $isRecent
}
```

**Después:**
```powershell
$result.CheckdbJobs += @{
    JobName = $job.JobName
    LastRun = $lastRun
    IsSuccess = $isSuccess
    IsRecent = $isRecent
    LastRunStatus = $job.LastRunStatus  # ← NUEVO
}
```

Esto se aplicó a:
- ✅ CheckdbJobs (con datos)
- ✅ CheckdbJobs (sin datos: `LastRunStatus = 999`)
- ✅ IndexOptimizeJobs (con datos de history)
- ✅ IndexOptimizeJobs (con datos de sysjobservers)
- ✅ IndexOptimizeJobs (sin datos: `LastRunStatus = 999`)

---

### 2. Lógica de Priorización en `Sync-AlwaysOnData`

**Antes (solo por fecha):**
```powershell
$mostRecentJob = $jobGroup.Group | Sort-Object LastRun -Descending | Select-Object -First 1
```

**Después (fecha + prioridad de status):**
```powershell
$mostRecentJob = $jobGroup.Group | Sort-Object `
    @{Expression={$_.LastRun}; Descending=$true}, `
    @{Expression={
        if ($_.LastRunStatus -eq 1) { 0 }      # Succeeded - máxima prioridad
        elseif ($_.LastRunStatus -eq 0) { 1 }  # Failed - segunda prioridad
        elseif ($_.LastRunStatus -eq 3) { 2 }  # Canceled - tercera prioridad
        else { 3 }                              # Otros/SinDatos - menor prioridad
    }; Descending=$false} | Select-Object -First 1
```

---

## 📊 Tabla de Prioridades

| Status Code | Descripción | Prioridad | Peso de Ordenamiento |
|-------------|-------------|-----------|----------------------|
| **1** | Succeeded | **Alta** ⭐⭐⭐ | 0 (se selecciona primero) |
| **0** | Failed | **Media** ⭐⭐ | 1 |
| **3** | Canceled | **Baja** ⭐ | 2 |
| **999** | Sin datos | **Mínima** | 3 |

---

## 🔍 Comportamiento con Ejemplos

### Caso 1: Empate en Fecha, Diferentes Status

**Datos:**
```
Job: IntegrityCheck-UserDBs
  Nodo 01: 2025-10-22 02:00:00, Status=3 (Canceled)
  Nodo 51: 2025-10-22 02:00:00, Status=1 (Succeeded)
```

**Resultado:** Se selecciona el job de **Nodo 51** (Succeeded) ✅

---

### Caso 2: Empate en Fecha, Succeeded vs Failed

**Datos:**
```
Job: IntegrityCheck-SystemDBs
  Nodo 01: 2025-10-22 03:00:00, Status=0 (Failed)
  Nodo 51: 2025-10-22 03:00:00, Status=1 (Succeeded)
```

**Resultado:** Se selecciona el job de **Nodo 51** (Succeeded) ✅

---

### Caso 3: Fechas Diferentes (Prioridad de Fecha)

**Datos:**
```
Job: IndexOptimize-UserDBs
  Nodo 01: 2025-10-21 02:00:00, Status=1 (Succeeded)
  Nodo 51: 2025-10-22 02:00:00, Status=3 (Canceled)
```

**Resultado:** Se selecciona el job de **Nodo 51** (más reciente, aunque sea Canceled) ✅

> **Nota:** La fecha siempre tiene prioridad sobre el status. La priorización por status solo aplica cuando hay **empate de fecha**.

---

## 🚀 Aplicación

La lógica de priorización se aplica en:

1. **`Sync-AlwaysOnData` → CheckDB Jobs:**
   - Líneas ~1015-1022
   - Al evaluar `$checkdbByName` por nombre de job

2. **`Sync-AlwaysOnData` → IndexOptimize Jobs:**
   - Líneas ~1049-1056
   - Al evaluar `$indexOptByName` por nombre de job

3. **Para TODAS las instancias AlwaysOn:**
   - Se aplica automáticamente durante la sincronización post-procesamiento
   - Garantiza consistencia entre todos los nodos de un AG

---

## ✅ Resultado Final

### Antes del Arreglo
```json
{
  "InstanceName": "SSPR19MBK-51",
  "MaintenanceSummary": {
    "CheckdbOk": false,  // ❌ Tomó el Canceled del nodo 01
    "LastCheckdb": "2025-10-22T02:00:00"
  }
}
```

### Después del Arreglo
```json
{
  "InstanceName": "SSPR19MBK-51",
  "MaintenanceSummary": {
    "CheckdbOk": true,   // ✅ Toma el Succeeded del nodo 51
    "LastCheckdb": "2025-10-22T02:00:00"
  }
}
```

---

## 📝 Notas Técnicas

### Status Codes de SQL Server

| Code | Descripción |
|------|-------------|
| 0 | Failed |
| 1 | Succeeded |
| 2 | Retry |
| 3 | Canceled |
| 4 | In Progress |

### Indicador de "Sin Datos"

- **Status 999:** Asignado internamente por el script cuando:
  - `LastRunDate` o `LastRunTime` son `NULL`/`DBNull`
  - No hay historial en `sysjobhistory` ni en `sysjobservers`
  - Job nunca se ejecutó

---

## 🔧 Archivos Modificados

| Archivo | Cambios |
|---------|---------|
| `scripts/RelevamientoHealthScoreMant.ps1` | ✅ Líneas 195-201, 219-225 (CheckDB) |
| | ✅ Líneas 250-256, 285-291, 311-317 (IndexOptimize) |
| | ✅ Líneas 1015-1022 (Sync CheckDB) |
| | ✅ Líneas 1049-1056 (Sync IndexOptimize) |

---

## ✅ Validación

```powershell
# Ejecutar con verbose para ver la priorización en acción
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Verificar logs como:
# "Job IntegrityCheck-UserDBs del grupo está OK (más reciente: 2025-10-22 02:00:00, Status=1)"
```

---

**Fecha de Implementación:** 2025-10-22  
**Versión del Script:** v2.1.6  
**Estado:** ✅ Implementado y validado

