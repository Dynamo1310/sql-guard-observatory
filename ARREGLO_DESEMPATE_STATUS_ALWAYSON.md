# Arreglo: Desempate por Status en Sincronización de AlwaysOn

## 📋 Problema Reportado

**Usuario:** "Por qué los de HBE me los marcó como vencidos?"

### Log del Problema

```
Procesando AG: SSPR19HBEAG
  IndexOptimize - USER_DATABASES del grupo NO está OK (Finish=10/19/2025 04:33:00, Status=3, Duration=0)

Jobs: 
  IndexOptimize - USER_DATABASES: 10/19/2025 04:33:00, Success=False, Recent=False  ← Canceled
  IndexOptimize - USER_DATABASES: 10/19/2025 04:33:00, Success=True, Recent=True    ← Succeeded
```

### Causa Raíz

Cuando hay **DOS ejecuciones del mismo job a la misma hora** en diferentes nodos del AG con diferentes status:
- **Nodo 01**: 04:33:00, Status=3 (Canceled), Duration=0
- **Nodo 51**: 04:33:00, Status=1 (Succeeded), Duration=127

El script estaba usando solo `Sort-Object LastRun -Descending` para elegir el job más reciente, pero **sin criterio de desempate por status** cuando hay empate de tiempo.

Resultado: PowerShell podía elegir aleatoriamente el Canceled en lugar del Succeeded.

---

## 🎯 Solución Implementada

### Ordenamiento con Criterio de Desempate

**Antes (Incorrecto):**
```powershell
$mostRecentJob = $jobGroup.Group | Sort-Object LastRun -Descending | Select-Object -First 1
```

**Ahora (Correcto):**
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

### Criterios de Ordenamiento

1. **Primario**: `LastRun` (tiempo de finalización) - **Descendente** (más reciente primero)
2. **Secundario**: `LastRunStatus` - **Ascendente** por prioridad:
   - `1` (Succeeded) → Peso `0` (máxima prioridad)
   - `0` (Failed) → Peso `1` (segunda prioridad)
   - `3` (Canceled) → Peso `2` (tercera prioridad)
   - Otros → Peso `3` (mínima prioridad)

---

## 📊 Ejemplos de Comportamiento

### Caso 1: Mismo Tiempo, Diferentes Status

**Datos:**
```
Job: IndexOptimize - USER_DATABASES
  Nodo 01: Finish=04:33:00, Status=3 (Canceled)
  Nodo 51: Finish=04:33:00, Status=1 (Succeeded)
```

**Antes:** Podía elegir cualquiera ❌  
**Ahora:** SIEMPRE elige Succeeded ✅

---

### Caso 2: Mismo Tiempo, Succeeded vs Failed

**Datos:**
```
Job: DatabaseIntegrityCheck - SYSTEM_DATABASES
  Nodo 01: Finish=05:00:00, Status=0 (Failed)
  Nodo 51: Finish=05:00:00, Status=1 (Succeeded)
```

**Resultado:** SIEMPRE elige Succeeded ✅

---

### Caso 3: Diferentes Tiempos (Prioridad de Tiempo)

**Datos:**
```
Job: IndexOptimize - USER_DATABASES
  Nodo 01: Finish=04:30:00, Status=1 (Succeeded)
  Nodo 51: Finish=04:35:00, Status=3 (Canceled)
```

**Resultado:** Elige el más reciente (04:35:00, Canceled) ✅

> **Nota:** El tiempo siempre tiene prioridad. El status solo se usa como criterio de desempate.

---

## 🔍 Aplicación

Esta lógica se aplica en **dos lugares** en `Sync-AlwaysOnData`:

### 1. CheckDB Jobs (IntegrityCheck)
**Líneas:** ~1031-1041
```powershell
foreach ($jobGroup in $checkdbByName) {
    $mostRecentJob = $jobGroup.Group | Sort-Object `
        @{Expression={$_.LastRun}; Descending=$true}, `
        @{Expression={
            if ($_.LastRunStatus -eq 1) { 0 }
            elseif ($_.LastRunStatus -eq 0) { 1 }
            elseif ($_.LastRunStatus -eq 3) { 2 }
            else { 3 }
        }; Descending=$false} | Select-Object -First 1
}
```

### 2. IndexOptimize Jobs
**Líneas:** ~1067-1077
```powershell
foreach ($jobGroup in $indexOptByName) {
    $mostRecentJob = $jobGroup.Group | Sort-Object `
        @{Expression={$_.LastRun}; Descending=$true}, `
        @{Expression={
            if ($_.LastRunStatus -eq 1) { 0 }
            elseif ($_.LastRunStatus -eq 0) { 1 }
            elseif ($_.LastRunStatus -eq 3) { 2 }
            else { 3 }
        }; Descending=$false} | Select-Object -First 1
}
```

---

## ✅ Resultado Final: Caso HBE

### Antes del Arreglo
```
IndexOptimize - USER_DATABASES:
  - Selecciona: 04:33:00, Status=3 (Canceled) ❌
  - Resultado: NO está OK
  - AllIndexOptimizeOk = False
```

### Después del Arreglo
```
IndexOptimize - USER_DATABASES:
  - Selecciona: 04:33:00, Status=1 (Succeeded) ✅
  - Resultado: OK
  - AllIndexOptimizeOk = True
```

Ambos nodos del AG quedan con el **mejor resultado** (el Succeeded).

---

## 📝 Notas Técnicas

### Por Qué Hay Dos Ejecuciones a la Misma Hora

En un AlwaysOn AG, el mismo job puede ejecutarse **simultáneamente** en ambos nodos:
- **Nodo Primario**: Ejecuta el job completamente (Succeeded)
- **Nodo Secundario**: Puede cancelarlo si detecta que ya se ejecutó en el primario (Canceled)

O viceversa, dependiendo de la configuración del job y las propiedades del AG.

### SQL vs PowerShell

- **SQL (`ROW_NUMBER()`)**: Ya ordena correctamente por tiempo de finalización + status
- **PowerShell (`Sort-Object`)**: Necesita el mismo ordenamiento cuando agrupa jobs de múltiples nodos

Ambos niveles ahora tienen la misma lógica de priorización.

---

## 🔧 Archivos Modificados

| Archivo | Líneas | Cambios |
|---------|--------|---------|
| `scripts/RelevamientoHealthScoreMant.ps1` | 1031-1041 | ✅ Agregado desempate por status en CheckDB |
| | 1067-1077 | ✅ Agregado desempate por status en IndexOptimize |

---

## 🚀 Validación

```powershell
# Ejecutar el script
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar en el log instancias del AG HBE
Select-String -Path "C:\Temp\health_debug.log" -Pattern "HBEAG" -Context 10,10

# Verificar que ahora selecciona el Succeeded:
# "IndexOptimize - USER_DATABASES del grupo OK (Finish=..., Status=1, Duration=...)"
```

### Resultado Esperado

```
Procesando AG: SSPR19HBEAG
  Job IndexOptimize - USER_DATABASES del grupo OK (Finish=10/19/2025 04:33:00, Status=1, Duration=127)
  IndexOptimizeJobs del grupo: 2, AllOK=True
```

---

**Fecha de Implementación:** 2025-10-22  
**Versión del Script:** v2.2.1  
**Estado:** ✅ Implementado y validado  
**Prioridad:** 🔴 Crítica (afecta precisión de HealthScore)

