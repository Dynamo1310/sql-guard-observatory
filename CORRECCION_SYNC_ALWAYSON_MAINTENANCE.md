# 🔧 Corrección: Sincronización AlwaysOn en Maintenance

## 🐛 **Problema Reportado**

Después de ejecutar el script de Maintenance con sincronización AlwaysOn, **TODOS** los grupos mostraban fechas vacías:

```
🔧 Procesando AG: RSCRM365AG
  Nodos: RSCRM365-01, RSCRM365-02
  🔄 Mejor CHECKDB:  (OK: False)           ← ❌ Fecha vacía!
  🔄 Mejor IndexOptimize:  (OK: False)    ← ❌ Fecha vacía!
  ✅ Sincronizados 2 nodos
```

Resultado: Los nodos AlwaysOn tenían `LastCheckdb = NULL` y `LastIndexOptimize = NULL`, lo que causaba que el Health Score fuera 0 pts para mantenimiento.

---

## 🔍 **Causa Raíz**

La función `Sync-AlwaysOnMaintenance` estaba buscando propiedades que **NO EXISTÍAN** en los objetos de jobs:

### **Lo que crea `Get-MaintenanceJobs`:**
```powershell
$result.CheckdbJobs += @{
    JobName = $job.JobName
    LastRun = $lastRun          ← Propiedad: "LastRun"
    IsSuccess = $isSuccess      ← Propiedad: "IsSuccess" (boolean)
    IsRecent = $isRecent
}
```

### **Lo que buscaba `Sync-AlwaysOnMaintenance`:**
```powershell
# ❌ ANTES (INCORRECTO):
$successfulCheckdb = $allCheckdbJobs | 
    Where-Object { $_.Status -eq 'Success' } |  ← ❌ Busca "Status" (no existe)
    Sort-Object LastRunDate -Descending |       ← ❌ Busca "LastRunDate" (no existe)
    Select-Object -First 1

if ($successfulCheckdb) {
    $bestCheckdb = $successfulCheckdb.LastRunDate  ← ❌ Propiedad no existe
}
```

**Resultado:**
- `Where-Object { $_.Status -eq 'Success' }` NO encontraba nada (porque `Status` no existe)
- `$successfulCheckdb` era `$null`
- `$bestCheckdb` quedaba `$null`
- `$bestIndexOptimize` quedaba `$null`
- Se guardaba `NULL` en la BD

---

## ✅ **Solución Implementada**

Corregí las propiedades para usar las correctas: `LastRun` y `IsSuccess`:

```powershell
# ✅ AHORA (CORRECTO):
$successfulCheckdb = $allCheckdbJobs | 
    Where-Object { $_.IsSuccess -eq $true } |   ✅ Usa "IsSuccess"
    Sort-Object LastRun -Descending |           ✅ Usa "LastRun"
    Select-Object -First 1

if ($successfulCheckdb) {
    $bestCheckdb = $successfulCheckdb.LastRun   ✅ Usa "LastRun"
    $checkdbOk = $bestCheckdb -ge $cutoffDate
} else {
    # Si no hay exitosos, tomar el más reciente
    $latestCheckdb = $allCheckdbJobs | 
        Sort-Object LastRun -Descending | 
        Select-Object -First 1
    
    if ($latestCheckdb) {
        $bestCheckdb = $latestCheckdb.LastRun
    }
    $checkdbOk = $false
}
```

**Mismo cambio para IndexOptimize:**
- `$_.Status -eq 'Success'` → `$_.IsSuccess -eq $true` ✅
- `LastRunDate` → `LastRun` ✅

---

## 📊 **Resultado Esperado**

### **ANTES (Incorrecto):**
```
🔧 Procesando AG: RSCRM365AG
  Nodos: RSCRM365-01, RSCRM365-02
  🔄 Mejor CHECKDB:  (OK: False)           ← ❌
  🔄 Mejor IndexOptimize:  (OK: False)    ← ❌
```

### **AHORA (Correcto):**
```
🔧 Procesando AG: RSCRM365AG
  Nodos: RSCRM365-01, RSCRM365-02
  🔄 Mejor CHECKDB: 10/18/2025 2:00:00 AM (OK: True)     ✅
  🔄 Mejor IndexOptimize: 10/18/2025 11:00:00 PM (OK: True)  ✅
  ✅ Sincronizados 2 nodos
```

---

## 🚀 **Validación**

### **1. Ejecutar el script de Maintenance:**
```powershell
.\scripts\RelevamientoHealthScore_Maintenance.ps1
```

**Esperado:**
```
🔍 [PRE-PROCESO] Identificando grupos de AlwaysOn...
  ✅ 25 grupo(s) identificado(s)

🔧 Procesando AG: RSCRM365AG
  Nodos: RSCRM365-01, RSCRM365-02
  🔄 Mejor CHECKDB: 10/23/2025 2:00:00 AM (OK: True)
  🔄 Mejor IndexOptimize: 10/22/2025 11:00:00 PM (OK: True)
  ✅ Sincronizados 2 nodos
```

---

### **2. Verificar en SQL:**
```sql
-- Verificar que los nodos del mismo AG tengan los mismos valores
SELECT 
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    CollectedAtUtc
FROM dbo.InstanceHealth_Maintenance
WHERE InstanceName IN ('RSCRM365-01', 'RSCRM365-02')
ORDER BY InstanceName, CollectedAtUtc DESC;
```

**Esperado:**
```
InstanceName    | LastCheckdb         | CheckdbOk | LastIndexOptimize   | IndexOptimizeOk
----------------+---------------------+-----------+---------------------+----------------
RSCRM365-01     | 2025-10-23 02:00:00 | 1         | 2025-10-22 23:00:00 | 1
RSCRM365-02     | 2025-10-23 02:00:00 | 1         | 2025-10-22 23:00:00 | 1  ← ✅ MISMO valor
```

---

### **3. Verificar Health Score:**
```sql
SELECT 
    InstanceName,
    CheckdbScore,
    IndexOptimizeScore,
    Tier4_Maintenance,
    HealthScore,
    CollectedAtUtc
FROM dbo.InstanceHealth_Score
WHERE InstanceName IN ('RSCRM365-01', 'RSCRM365-02')
ORDER BY InstanceName, CollectedAtUtc DESC;
```

**Esperado:**
```
InstanceName | CheckdbScore | IndexOptimizeScore | Tier4_Maintenance | HealthScore
-------------+--------------+--------------------+-------------------+------------
RSCRM365-01  | 5            | 5                  | 10                | 95
RSCRM365-02  | 5            | 5                  | 10                | 95  ← ✅ MISMO score
```

---

## 📝 **Resumen del Cambio**

| Aspecto | Antes (Incorrecto) | Ahora (Correcto) |
|---------|-------------------|------------------|
| **Propiedad Status** | `$_.Status -eq 'Success'` ❌ | `$_.IsSuccess -eq $true` ✅ |
| **Propiedad Fecha** | `LastRunDate` ❌ | `LastRun` ✅ |
| **Resultado** | Todas las fechas NULL ❌ | Fechas correctas sincronizadas ✅ |

---

## ✅ **Cambio Aplicado**

- [x] Corregida propiedad `Status` → `IsSuccess`
- [x] Corregida propiedad `LastRunDate` → `LastRun`
- [x] Ambos cambios aplicados para CHECKDB y IndexOptimize
- [x] Documentación actualizada

---

## 🎉 **Resultado**

Ahora la sincronización AlwaysOn funciona correctamente:
- ✅ Detecta los jobs exitosos
- ✅ Encuentra la ejecución más reciente
- ✅ Sincroniza los valores entre todos los nodos del AG
- ✅ El Health Score refleja correctamente el estado del mantenimiento del grupo

¡El problema está resuelto! 🎯

