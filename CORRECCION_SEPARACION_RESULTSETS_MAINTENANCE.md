# Corrección: Separación de Resultsets en RelevamientoHealthScore_Maintenance.ps1

## 🐛 **Problema Encontrado**

El script `RelevamientoHealthScore_Maintenance.ps1` estaba guardando datos incorrectos (fechas antiguas, status incorrectos) para los jobs de mantenimiento en AlwaysOn Availability Groups.

### **Causa Raíz:**

El script ejecuta una query SQL que devuelve DOS conjuntos de resultados:
1. Todos los jobs de `IntegrityCheck`
2. Todos los jobs de `IndexOptimize`

La lógica original intentaba separar estos resultsets usando índices de array:

```powershell
# ❌ INCORRECTO
$checkdbJobs = if ($datasets -is [array] -and $datasets.Count -gt 0) { 
    $datasets[0]  # Toma SOLO el primer elemento
} else { 
    $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' } 
}

$indexOptJobs = if ($datasets -is [array] -and $datasets.Count -gt 1) { 
    $datasets[1]  # Toma SOLO el segundo elemento
} else { 
    $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' } 
}
```

### **Por qué fallaba:**

`Invoke-DbaQuery` con una query que contiene múltiples `SELECT` **NO** devuelve dos arrays separados (`$datasets[0]` y `$datasets[1]`).

En su lugar, devuelve **UN SOLO ARRAY** con TODOS los jobs mezclados:

```
$datasets = @(
    [Job: IntegrityCheck - SYSTEM_DATABASES],
    [Job: IntegrityCheck - USER_DATABASES],
    [Job: IndexOptimize - USER_DATABASES]
)
```

Entonces:
- `$datasets[0]` tomaba **SOLO** el primer job (IntegrityCheck - SYSTEM_DATABASES)
- `$datasets[1]` tomaba **SOLO** el segundo job (IntegrityCheck - USER_DATABASES)
- **NO** procesaba el job de IndexOptimize

Esto causaba que:
1. Se perdieran jobs en el procesamiento
2. La sincronización AlwaysOn trabajara con datos incompletos
3. Se guardaran fechas/status incorrectos en la BD

---

## ✅ **Solución Implementada**

Cambiar a **SIEMPRE** filtrar por el nombre del job usando `Where-Object`, en lugar de asumir que los resultsets están separados por índice:

```powershell
# ✅ CORRECTO
$checkdbJobs = $datasets | Where-Object { $_.JobName -like '*IntegrityCheck*' }
$indexOptJobs = $datasets | Where-Object { $_.JobName -like '*IndexOptimize*' }
```

Esto garantiza que:
- Se capturen **TODOS** los jobs de cada tipo
- No se pierdan datos
- La sincronización AlwaysOn tenga toda la información necesaria

---

## 📋 **Archivos Modificados**

- `scripts/RelevamientoHealthScore_Maintenance.ps1` (líneas 176, 240)

---

## 🧪 **Cómo Probar**

### 1. Ejecutar el script corregido:
```powershell
.\scripts\RelevamientoHealthScore_Maintenance.ps1
```

### 2. Verificar con el diagnóstico:
```powershell
.\Diagnosticar-AG-CRM365.ps1
```

### 3. Resultado esperado:

Para el AG `SSPR17CRM365AG`:

**ANTES** (incorrecto):
```
InstanceName    LastIndexOptimize      IndexOptimizeOk
SSPR17CRM365-01 10/18/2025 10:30:01    False  ❌
SSPR17CRM365-51 10/18/2025 10:30:01    False  ❌
```

**DESPUÉS** (correcto):
```
InstanceName    LastIndexOptimize      IndexOptimizeOk
SSPR17CRM365-01 10/19/2025 01:59:36    True   ✅
SSPR17CRM365-51 10/19/2025 01:59:36    True   ✅
```

---

## 📝 **Notas Técnicas**

- Este problema afectaba tanto a `IntegrityCheck` como a `IndexOptimize`
- La sincronización AlwaysOn funcionaba correctamente, pero recibía datos incompletos
- El script de diagnóstico `Diagnosticar-Sync-Detallado.ps1` permitió identificar que la lógica de sincronización era correcta, y que el problema estaba en la recopilación de datos

---

**Fecha:** 23/10/2025  
**Versión:** Health Score v3.0

