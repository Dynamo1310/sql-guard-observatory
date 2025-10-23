# ⚠️ OBSOLETO - Reemplazado por Tiempo de Finalización

> **NOTA:** Este documento describe un enfoque inicial que fue reemplazado por una solución más correcta.  
> **Ver:** `ARREGLO_TIEMPO_FINALIZACION_JOBS.md` para la implementación actual.

---

# Arreglo: Ventana de Tiempo para Jobs Simultáneos en AlwaysOn (OBSOLETO)

## 📋 Problema Reportado

**Usuario:** "En HBI ganó el false en indexOptimize cuando un nodo tenía True"

### Log del Problema

```
IndexOptimize - USER_DATABASES:
  - 10/22/2025 02:00:01, Success=False, Recent=False  ← Seleccionaba este (más reciente por 1 segundo)
  - 10/22/2025 02:00:00, Success=True, Recent=True

Resultado: AllOK=False ❌
```

### Causa Raíz

Cuando un job se ejecuta **en paralelo** en los nodos de un AlwaysOn AG:
- **Nodo 01**: Termina a las 02:00:00 con Status=1 (Success)
- **Nodo 51**: Termina a las 02:00:01 con Status=0 (Failed)

La lógica anterior ordenaba **solo por fecha descendente**, seleccionando 02:00:01 (Failed) aunque sea solo 1 segundo más reciente.

**Pero estos son el MISMO job ejecutándose en paralelo**, no dos ejecuciones diferentes.

---

## 🎯 Solución Implementada

### Concepto: "Ventana de Tiempo"

Si dos o más ejecuciones del mismo job tienen **menos de 10 segundos** de diferencia, se consideran **ejecuciones simultáneas** (el mismo job en diferentes nodos del AG).

En ese caso:
1. ✅ **Agrupar** todas las ejecuciones dentro de la ventana de 10 segundos
2. ✅ **Priorizar por Status**: Succeeded > Failed > Canceled
3. ✅ **Seleccionar** el mejor resultado

### Lógica Implementada

```powershell
# 1. Ordenar jobs por fecha descendente
$sortedJobs = $jobGroup.Group | Sort-Object LastRun -Descending
$mostRecentTime = $sortedJobs[0].LastRun

# 2. Filtrar jobs dentro de la ventana de 10 segundos
$recentJobs = $sortedJobs | Where-Object { 
    $_.LastRun -and ([Math]::Abs(($mostRecentTime - $_.LastRun).TotalSeconds) -le 10)
}

# 3. De esos, priorizar por status
$mostRecentJob = $recentJobs | Sort-Object `
    @{Expression={
        if ($_.LastRunStatus -eq 1) { 0 }      # Succeeded
        elseif ($_.LastRunStatus -eq 0) { 1 }  # Failed
        elseif ($_.LastRunStatus -eq 3) { 2 }  # Canceled
        else { 3 }                              # Sin datos
    }; Descending=$false} | Select-Object -First 1
```

---

## 📊 Ejemplos de Comportamiento

### Caso 1: Ejecuciones Simultáneas (< 10 seg)

**Datos:**
```
Job: IndexOptimize - USER_DATABASES
  Nodo 01: 10/22/2025 02:00:00, Status=1 (Succeeded)
  Nodo 51: 10/22/2025 02:00:01, Status=0 (Failed)

Diferencia: 1 segundo
```

**Antes:** Seleccionaba 02:00:01 (Failed) ❌  
**Ahora:** Selecciona 02:00:00 (Succeeded) ✅

**Log:**
```
⚡ IndexOptimize - USER_DATABASES: 2 ejecuciones simultáneas, seleccionado Status=1
Job IndexOptimize - USER_DATABASES del grupo OK
```

---

### Caso 2: Ejecuciones Separadas (> 10 seg)

**Datos:**
```
Job: IntegrityCheck - SystemDBs
  Ejecución 1: 10/22/2025 02:00:00, Status=1 (Succeeded)
  Ejecución 2: 10/21/2025 23:45:00, Status=1 (Succeeded)

Diferencia: 2 horas, 15 minutos
```

**Comportamiento:** Selecciona la más reciente (10/22/2025 02:00:00) sin considerar la anterior.

---

### Caso 3: Empate Exacto de Tiempo

**Datos:**
```
Job: IndexOptimize - UserDBs
  Nodo 01: 10/22/2025 01:00:00, Status=3 (Canceled)
  Nodo 51: 10/22/2025 01:00:00, Status=1 (Succeeded)

Diferencia: 0 segundos (mismo segundo)
```

**Resultado:** Selecciona Status=1 (Succeeded) ✅

---

## 🔍 Ventana de Tiempo: ¿Por qué 10 segundos?

| Escenario | Diferencia Típica | Cubierto por Ventana de 10s |
|-----------|-------------------|----------------------------|
| Jobs en AG ejecutados simultáneamente | 0-5 segundos | ✅ Sí |
| Variación de reloj entre servidores | 0-2 segundos | ✅ Sí |
| Jobs ejecutados en secuencia rápida | 5-10 segundos | ✅ Sí |
| Jobs ejecutados en horarios diferentes | > 1 minuto | ❌ No (correcto) |

La ventana de **10 segundos** es suficiente para:
- ✅ Capturar ejecuciones verdaderamente simultáneas
- ✅ Tolerar pequeñas variaciones de reloj entre servidores
- ❌ Evitar agrupar ejecuciones realmente diferentes

---

## 📝 Aplicación

Esta lógica se aplica a:

### 1. CheckDB Jobs (IntegrityCheck)
- **Archivo:** `RelevamientoHealthScoreMant.ps1`
- **Líneas:** ~1012-1054
- **Función:** `Sync-AlwaysOnData` → Evaluación de `$checkdbByName`

### 2. IndexOptimize Jobs
- **Archivo:** `RelevamientoHealthScoreMant.ps1`
- **Líneas:** ~1060-1108
- **Función:** `Sync-AlwaysOnData` → Evaluación de `$indexOptByName`

---

## ✅ Resultado Final

### Antes del Arreglo
```json
{
  "InstanceName": "SSPR17HBI-01",
  "MaintenanceSummary": {
    "IndexOptimizeOk": false,  // ❌ Tomó el Failed (02:00:01)
    "LastIndexOptimize": "2025-10-22T02:00:01"
  }
}
```

### Después del Arreglo
```json
{
  "InstanceName": "SSPR17HBI-01",
  "MaintenanceSummary": {
    "IndexOptimizeOk": true,   // ✅ Toma el Succeeded (02:00:00)
    "LastIndexOptimize": "2025-10-22T02:00:00"
  }
}
```

Ambos nodos del AG quedan sincronizados con el **mejor resultado**.

---

## 🔧 Logging Mejorado

Ahora el log muestra:

```
VERBOSE: Procesando AG: SSPR17HBIAG
VERBOSE:   ⚡ IndexOptimize - USER_DATABASES: 2 ejecuciones simultáneas, seleccionado Status=1
VERBOSE:   Job IndexOptimize - USER_DATABASES del grupo OK (más reciente: 10/22/2025 02:00:00, Status=1)
VERBOSE:   IndexOptimizeJobs del grupo: 2, AllOK=True
```

El emoji ⚡ indica que se aplicó la lógica de ventana de tiempo.

---

## 🚀 Próximos Pasos

```powershell
# Ejecutar el script con verbose
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar casos con ventana de tiempo
Select-String -Path "C:\Temp\health_debug.log" -Pattern "ejecuciones simultáneas"
```

---

**Fecha de Implementación:** 2025-10-22  
**Versión del Script:** v2.1.7  
**Estado:** ✅ Implementado y validado  
**Archivos Modificados:** `scripts/RelevamientoHealthScoreMant.ps1`

