# Resumen: Health Score v2.1 - Detección Múltiples Jobs

## 🎯 ¿Qué se cambió?

### Problema Resuelto

**Antes (v2.0):**
- Solo detectaba el job de mantenimiento más reciente
- Si una instancia tenía 3 jobs de IntegrityCheck y solo 1 estaba OK, reportaba `CheckdbOk = true` ❌

**Ahora (v2.1):**
- Detecta **TODOS** los jobs de mantenimiento
- Evalúa si **TODOS** están OK
- Si **alguno** está vencido, reporta `CheckdbOk = false` ✅
- **Excluye automáticamente** jobs que contengan `%STOP%` en el nombre

## 📝 Cambios Específicos

### 1. Detección de Múltiples Jobs

```powershell
# Ahora obtiene TODOS los jobs:
- DatabaseIntegrityCheck - UserDatabases
- DatabaseIntegrityCheck - SystemDatabases  
- DatabaseIntegrityCheck - LargeDBs
- DatabaseIntegrityCheck - STOP - Old  ← EXCLUIDO automáticamente

# Y evalúa:
CheckdbOk = true  ← Solo si TODOS están OK (últimos 7 días)
CheckdbOk = false ← Si ALGUNO está vencido
```

### 2. Exclusión Automática de Jobs STOP

Cualquier job que contenga `STOP` en su nombre es **ignorado automáticamente**.

### 3. Información Detallada en JSON

```json
{
  "MaintenanceSummary": {
    "CheckdbOk": false,
    "LastCheckdb": "2025-10-20T03:00:00",
    "CheckdbJobs": [
      {
        "JobName": "IntegrityCheck - UserDBs",
        "LastRun": "2025-10-20T03:00:00",
        "IsSuccess": true,
        "IsRecent": true
      },
      {
        "JobName": "IntegrityCheck - SystemDBs",
        "LastRun": "2025-10-10T03:00:00",
        "IsSuccess": true,
        "IsRecent": false  ← Este es el vencido
      }
    ]
  }
}
```

### 4. AlwaysOn Mejorado

Para grupos AlwaysOn:
- Recopila **todos los jobs de todos los nodos**
- Evalúa si **todos los jobs de todo el grupo** están OK
- Sincroniza el resultado en **todos los nodos del grupo**

**Ejemplo:**
```
AG con 2 nodos:
- Nodo 01: 2 jobs (1 OK, 1 vencido)
- Nodo 51: 1 job (OK)

Total: 3 jobs, 1 vencido
Resultado: CheckdbOk = false (en AMBOS nodos)
```

## 🚀 Cómo Probar

### Opción 1: Prueba Rápida (Recomendado)

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# 1. Asegurar que está en modo de prueba
# Editar RelevamientoHealthScoreMant.ps1 (líneas 10-16):
$TestMode = $true
$WriteToSql = $false

# 2. Ejecutar con Verbose para ver detalles
.\RelevamientoHealthScoreMant.ps1 -Verbose

# 3. Ver resultados
Get-Content .\InstanceHealth_*.json | ConvertFrom-Json | 
    Select InstanceName, 
           @{N='CheckdbOk';E={$_.MaintenanceSummary.CheckdbOk}},
           @{N='TotalCheckdbJobs';E={$_.MaintenanceSummary.CheckdbJobs.Count}},
           @{N='IndexOptOk';E={$_.MaintenanceSummary.IndexOptimizeOk}},
           @{N='TotalIndexOptJobs';E={$_.MaintenanceSummary.IndexOptimizeJobs.Count}}
```

### Opción 2: Instancias Específicas

```powershell
# Probar instancias que sabes que tienen múltiples jobs
.\scripts\Test-HealthScoreV2.ps1 -InstanceNames "SSPR17SQL-01","SSPR19MBK-01","SSPR19MBK-51" -Verbose
```

## ✅ Qué Verificar

### 1. Instancias con Múltiples Jobs

```powershell
# Ver detalles de jobs
$results = Get-Content .\InstanceHealth_*.json | ConvertFrom-Json
$results | Where-Object { $_.InstanceName -eq "TU_INSTANCIA" } | 
    Select -ExpandProperty MaintenanceSummary | 
    Select -ExpandProperty CheckdbJobs | 
    Format-Table JobName, LastRun, IsRecent -AutoSize
```

**Verificar:**
- ✅ Aparecen TODOS los jobs (no solo uno)
- ✅ Los jobs con STOP NO aparecen
- ✅ Si algún job tiene `IsRecent = false`, entonces `CheckdbOk = false`

### 2. AlwaysOn (Sincronización)

```powershell
# Ver nodos de un AG
$results | Where-Object { $_.InstanceName -match "SSPR19MBK" } | 
    Select InstanceName,
           @{N='CheckdbOk';E={$_.MaintenanceSummary.CheckdbOk}},
           @{N='TotalJobs';E={$_.MaintenanceSummary.CheckdbJobs.Count}}
```

**Verificar:**
- ✅ Ambos nodos tienen el mismo `CheckdbOk`
- ✅ Ambos nodos tienen el mismo `TotalJobs` (suma de todos los nodos)
- ✅ Si ves el array `CheckdbJobs`, debe incluir jobs de ambos nodos

### 3. Exclusión de Jobs STOP

```sql
-- En SQL, verificar que hay jobs con STOP
SELECT name 
FROM msdb.dbo.sysjobs 
WHERE name LIKE '%IntegrityCheck%STOP%';
```

```powershell
# En el JSON, verificar que NO aparecen
$results[0].MaintenanceSummary.CheckdbJobs | Where-Object { $_.JobName -like '*STOP*' }
# Debe devolver vacío
```

## 📊 Output Esperado

### Con `-Verbose`

```
[STEP 3/5] Procesando instancias...
Procesando: SSPR17SQL-01
  IntegrityCheck: 3 job(s), AllOK=false
  IndexOptimize: 2 job(s), AllOK=true
...

[POST-PROCESO] Sincronizando datos entre nodos AlwaysOn...
  Procesando AG: SSPR19MBKAG
    Nodos: SSPR19MBK-01, SSPR19MBK-51
    CheckdbJobs del grupo: 4, AllOK=false
    IndexOptimizeJobs del grupo: 3, AllOK=true
    [SYNC] SSPR19MBK-01
    [SYNC] SSPR19MBK-51
```

### JSON Generado

```json
{
  "InstanceName": "SSPR17SQL-01",
  "MaintenanceSummary": {
    "LastCheckdb": "2025-10-20T03:00:00",
    "CheckdbOk": false,
    "CheckdbJobs": [
      {
        "JobName": "IntegrityCheck - UserDBs",
        "LastRun": "2025-10-20T03:00:00",
        "IsSuccess": true,
        "IsRecent": true
      },
      {
        "JobName": "IntegrityCheck - SystemDBs",
        "LastRun": "2025-10-10T03:00:00",
        "IsSuccess": true,
        "IsRecent": false
      },
      {
        "JobName": "IntegrityCheck - LargeDBs",
        "LastRun": "2025-10-19T03:00:00",
        "IsSuccess": true,
        "IsRecent": true
      }
    ]
  }
}
```

## 🐛 Si Algo No Funciona

### Jobs no aparecen

**Causa:** El nombre del job no contiene `IntegrityCheck` o `IndexOptimize`

**Solución:** Los jobs deben contener estas palabras (case insensitive):
- `%IntegrityCheck%` → DatabaseIntegrityCheck, IntegrityCheck, CheckIntegrity, etc.
- `%IndexOptimize%` → IndexOptimize, OptimizeIndex, etc.

### CheckdbOk = false pero todos los jobs están OK

**Causa:** Algún job no se ejecutó exitosamente o tiene más de 7 días

**Solución:** Revisar el array `CheckdbJobs` en el JSON para ver cuál tiene `IsRecent = false`

### Jobs STOP aparecen en el JSON

**Causa:** Error en el filtro

**Solución:** Verificar que el job realmente contiene `STOP` en el nombre. El filtro es `NOT LIKE '%STOP%'` (case insensitive).

## 📋 Checklist de Validación

```
[ ] Script se ejecuta sin errores
[ ] Se detectan múltiples jobs (no solo 1)
[ ] Jobs con STOP son excluidos
[ ] CheckdbOk = false si algún job está vencido
[ ] CheckdbOk = true si TODOS los jobs están OK
[ ] AlwaysOn sincroniza correctamente entre nodos
[ ] JSON incluye array CheckdbJobs con detalles
[ ] JSON incluye array IndexOptimizeJobs con detalles
```

## 📞 ¿Listo para Producción?

Una vez validado:

1. **Cambiar configuración:**
   ```powershell
   $TestMode = $false   # Todas las instancias
   $WriteToSql = $true  # Guardar en SQL
   ```

2. **Ejecutar:**
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

3. **Verificar en SQL:**
   ```sql
   SELECT TOP 10
       InstanceName,
       JSON_VALUE(MaintenanceJson, '$.CheckdbOk') AS CheckdbOk,
       MaintenanceJson
   FROM SQLNova.dbo.InstanceHealthSnapshot
   ORDER BY GeneratedAtUtc DESC;
   ```

## 🔗 Documentación Relacionada

- `MEJORA_DETECCION_MULTIPLES_JOBS.md` → Detalles técnicos completos
- `README_HEALTHSCORE_V2.md` → Documentación general
- `REFACTORING_HEALTHSCORE_V2.md` → Historia de cambios v1→v2
- `INSTRUCCIONES_HEALTHSCORE_V2.md` → Guía de uso

---

**Versión:** 2.1  
**Fecha:** 2025-10-22  
**Cambio Principal:** Detección de múltiples jobs + exclusión de STOP  
**Impacto:** Mejora en precisión de detección de mantenimiento  
**Testing:** Listo para probar ✅

