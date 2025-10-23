# Mejora: Detección de Múltiples Jobs de Mantenimiento

## 📅 Fecha: 2025-10-22

## 🎯 Objetivo

Mejorar la detección de jobs de mantenimiento para soportar instancias que tienen **múltiples jobs** de IntegrityCheck o IndexOptimize, evaluando si **TODOS** están OK o si **alguno** está vencido.

## ❌ Problema Anterior (v2.0)

### Limitación

```powershell
# Script anterior solo buscaba el ÚLTIMO job
SELECT TOP 1
    jh.run_date,
    jh.run_time
FROM msdb.dbo.sysjobs j
WHERE j.name LIKE '%IntegrityCheck%'
ORDER BY jh.run_date DESC, jh.run_time DESC;
```

**Problema:**
- Si había 3 jobs de IntegrityCheck y solo el más reciente estaba OK, reportaba `CheckdbOk = true`
- **No detectaba** que los otros 2 jobs estaban vencidos

### Ejemplo Real

```
Instancia: SSPR17SQL-01

Jobs:
1. "DatabaseIntegrityCheck - UserDatabases" → Última ejecución: 2025-10-20 ✅
2. "DatabaseIntegrityCheck - SystemDatabases" → Última ejecución: 2025-10-10 ❌ (vencido)
3. "DatabaseIntegrityCheck - LargeDBs" → Última ejecución: 2025-10-15 ❌ (vencido)

Script v2.0: CheckdbOk = true  ← INCORRECTO
Debería ser: CheckdbOk = false ← CORRECTO (2 de 3 vencidos)
```

## ✅ Solución (v2.1)

### Nueva Lógica

1. **Obtener TODOS los jobs** que coincidan con el patrón
2. **Excluir jobs con `%STOP%`** en el nombre
3. **Evaluar cada job** individualmente
4. **CheckdbOk/IndexOptimizeOk = TRUE** solo si **TODOS** están OK

### Query SQL Actualizado

```sql
-- TODOS los IntegrityCheck (excluir STOP)
SELECT 
    j.name AS JobName,
    MAX(jh.run_date) AS LastRunDate,
    MAX(CASE WHEN jh.run_date = (SELECT MAX(jh2.run_date) 
                                   FROM msdb.dbo.sysjobhistory jh2 
                                   WHERE jh2.job_id = j.job_id 
                                   AND jh2.step_id = 0)
         THEN jh.run_time END) AS LastRunTime,
    MAX(CASE WHEN jh.run_date = (SELECT MAX(jh2.run_date) 
                                   FROM msdb.dbo.sysjobhistory jh2 
                                   WHERE jh2.job_id = j.job_id 
                                   AND jh2.step_id = 0)
         THEN jh.run_status END) AS LastRunStatus
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
WHERE j.name LIKE '%IntegrityCheck%'
  AND j.name NOT LIKE '%STOP%'  ← NUEVO: Excluir jobs STOP
GROUP BY j.name;
```

**Características:**
- ✅ Devuelve **TODOS** los jobs que coinciden
- ✅ Excluye jobs con `STOP` en el nombre
- ✅ Para cada job, devuelve su **última ejecución** y **último estado**

### Evaluación de Jobs

```powershell
# Para cada job encontrado:
foreach ($job in $checkdbJobs) {
    $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
    $isSuccess = ($job.LastRunStatus -eq 1)  # run_status = 1 = Éxito
    $isRecent = ($job.LastRunDate -ge $cutoffDateInt -and $isSuccess)  # Últimos 7 días Y exitoso
    
    # Si alguno NO está OK, marcar como no OK
    if (-not $isRecent) {
        $allCheckdbOk = $false
    }
}

# Resultado final
$result.CheckdbOk = $allCheckdbOk  # TRUE solo si TODOS están OK
```

**Lógica:**
- `$allCheckdbOk` inicia en `true`
- Si **algún job** no está OK (no ejecutado exitosamente en últimos 7 días), se marca como `false`
- El resultado final es `true` **solo si TODOS** los jobs están OK

### Estructura de Salida

```json
{
  "MaintenanceSummary": {
    "LastCheckdb": "2025-10-20T03:00:00",
    "LastIndexOptimize": "2025-10-19T02:00:00",
    "CheckdbOk": false,  ← FALSE porque no todos están OK
    "IndexOptimizeOk": true,
    "CheckdbJobs": [
      {
        "JobName": "DatabaseIntegrityCheck - UserDatabases",
        "LastRun": "2025-10-20T03:00:00",
        "IsSuccess": true,
        "IsRecent": true  ← OK
      },
      {
        "JobName": "DatabaseIntegrityCheck - SystemDatabases",
        "LastRun": "2025-10-10T03:00:00",
        "IsSuccess": true,
        "IsRecent": false  ← VENCIDO (> 7 días)
      },
      {
        "JobName": "DatabaseIntegrityCheck - LargeDBs",
        "LastRun": "2025-10-15T03:00:00",
        "IsSuccess": true,
        "IsRecent": false  ← VENCIDO (> 7 días)
      }
    ],
    "IndexOptimizeJobs": [...]
  }
}
```

## 🔄 Sincronización AlwaysOn

### Problema en v2.0

Para AlwaysOn, solo sincronizaba `LastCheckdb` y `LastIndexOptimize`, pero no evaluaba si **todos los jobs de todos los nodos** estaban OK.

### Solución en v2.1

```powershell
# 1. Recopilar TODOS los jobs de TODOS los nodos del grupo
$allCheckdbJobs = @()
foreach ($nodeResult in $groupResults) {
    $allCheckdbJobs += $nodeResult.MaintenanceSummary.CheckdbJobs
}

# 2. Evaluar si TODOS los jobs están OK
$allCheckdbOk = $true
foreach ($job in $allCheckdbJobs) {
    if (-not $job.IsRecent) {
        $allCheckdbOk = $false  # Si alguno NO está OK, marcar como false
    }
}

# 3. Aplicar a TODOS los nodos
foreach ($node in $groupResults) {
    $node.MaintenanceSummary.CheckdbOk = $allCheckdbOk
    $node.MaintenanceSummary.CheckdbJobs = $allCheckdbJobs  # Lista completa
}
```

**Ejemplo:**

```
AG: SSPR19MBKAG
Nodos: SSPR19MBK-01, SSPR19MBK-51

SSPR19MBK-01 tiene:
- Job1: IntegrityCheck-UserDBs → OK (2025-10-20)
- Job2: IntegrityCheck-SystemDBs → Vencido (2025-10-10)

SSPR19MBK-51 tiene:
- Job3: IntegrityCheck-UserDBs → OK (2025-10-19)

Total del grupo: 3 jobs, 1 vencido
Resultado: CheckdbOk = false (para AMBOS nodos)
```

## 📊 Casos de Uso

### Caso 1: Instancia con Múltiples Jobs

```
Instancia: SSPR17SQL-01

Jobs IntegrityCheck:
1. "IntegrityCheck - User DBs" → 2025-10-20 ✅
2. "IntegrityCheck - System DBs" → 2025-10-18 ✅
3. "IntegrityCheck - Large DBs" → 2025-10-19 ✅

Resultado: CheckdbOk = true ✅
```

### Caso 2: Instancia con Job Vencido

```
Instancia: SSPR17SQL-02

Jobs IntegrityCheck:
1. "IntegrityCheck - User DBs" → 2025-10-20 ✅
2. "IntegrityCheck - System DBs" → 2025-10-10 ❌ (> 7 días)

Resultado: CheckdbOk = false ❌
```

### Caso 3: Exclusión de Jobs STOP

```
Instancia: SSPR17SQL-03

Jobs IntegrityCheck:
1. "IntegrityCheck - User DBs" → 2025-10-20 ✅
2. "IntegrityCheck - STOP - Old" → 2024-01-01 (EXCLUIDO)

Resultado: CheckdbOk = true ✅
(Job STOP es ignorado)
```

### Caso 4: AlwaysOn con Múltiples Jobs

```
AG: SSPR19MBKAG

SSPR19MBK-01:
- Job1: IntegrityCheck-Set1 → 2025-10-20 ✅
- Job2: IntegrityCheck-Set2 → 2025-10-19 ✅

SSPR19MBK-51:
- Job3: IntegrityCheck-Set1 → 2025-10-18 ✅
- Job4: IntegrityCheck-Set2 → 2025-10-15 ❌ (> 7 días)

Total: 4 jobs, 1 vencido
Resultado: CheckdbOk = false (para AMBOS nodos) ❌
```

## 🎯 Ventajas

| Aspecto | v2.0 | v2.1 |
|---------|------|------|
| **Detección de jobs** | Solo el más reciente | TODOS los jobs |
| **Evaluación** | Un solo job | Todos deben estar OK |
| **Exclusión STOP** | No | Sí |
| **Visibilidad** | Solo fecha del último | Lista completa de jobs |
| **AlwaysOn** | Solo sincroniza fecha | Evalúa todos los jobs de todos los nodos |
| **Precisión** | Falsos positivos | Alta precisión |

## 🧪 Cómo Validar

### 1. Verificar Jobs Múltiples

```powershell
# Ejecutar script
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Ver JSON generado
$results = Get-Content .\InstanceHealth_*.json | ConvertFrom-Json
$results | Where-Object { $_.InstanceName -eq "SSPR17SQL-01" } | 
    Select -ExpandProperty MaintenanceSummary | 
    Select -ExpandProperty CheckdbJobs | 
    Format-Table JobName, LastRun, IsRecent
```

### 2. Verificar Exclusión STOP

```sql
-- En SQL Server, verificar que hay jobs con STOP
SELECT name 
FROM msdb.dbo.sysjobs 
WHERE name LIKE '%IntegrityCheck%STOP%';

-- Verificar que NO aparecen en el JSON
```

### 3. Verificar AlwaysOn

```powershell
# Para un AG específico
$results | Where-Object { 
    $_.InstanceName -match "SSPR19MBK" 
} | Select InstanceName, 
    @{N='CheckdbOk';E={$_.MaintenanceSummary.CheckdbOk}},
    @{N='TotalJobs';E={$_.MaintenanceSummary.CheckdbJobs.Count}}

# Verificar que:
# 1. Ambos nodos tienen el mismo CheckdbOk
# 2. Ambos nodos tienen el mismo TotalJobs (suma de todos los nodos)
```

## 📝 Cambios Realizados

### `Get-MaintenanceJobs` (líneas 89-262)

- ✅ Query SQL actualizado para obtener TODOS los jobs
- ✅ Filtro `AND j.name NOT LIKE '%STOP%'`
- ✅ Evaluación individual de cada job
- ✅ Arrays `CheckdbJobs` e `IndexOptimizeJobs` con detalles
- ✅ Flags `CheckdbOk` e `IndexOptimizeOk` basados en TODOS los jobs

### `Sync-AlwaysOnData` (líneas 862-1032)

- ✅ Recopilación de jobs de todos los nodos del grupo
- ✅ Evaluación de TODOS los jobs del grupo
- ✅ Sincronización de flags y arrays completos
- ✅ Logging detallado con `-Verbose`

## 🔍 Troubleshooting

### Jobs no detectados

**Síntoma:** `CheckdbJobs = []` a pesar de tener jobs

**Solución:**
1. Verificar que los jobs contengan `IntegrityCheck` o `IndexOptimize` en el nombre
2. Verificar que NO contengan `STOP`
3. Ejecutar con `-Verbose` para ver el conteo de jobs

### CheckdbOk = false cuando debería ser true

**Síntoma:** Un job está OK pero `CheckdbOk = false`

**Solución:**
1. Revisar el array `CheckdbJobs` en el JSON
2. Verificar que TODOS los jobs tengan `IsRecent = true`
3. Si alguno tiene `IsRecent = false`, ese es el que está vencido

### AlwaysOn muestra valores diferentes entre nodos

**Síntoma:** Un nodo tiene `CheckdbOk = true` y el otro `false`

**Solución:**
1. Verificar que el post-procesamiento se ejecutó
2. Buscar línea `[SYNC] InstanceName` en el output
3. Ejecutar con `-Verbose` para ver los jobs del grupo

## 📞 Próximos Pasos

1. ✅ **Probar en modo test** (5 instancias)
2. ✅ **Verificar instancias con múltiples jobs**
3. ✅ **Verificar exclusión de jobs STOP**
4. ✅ **Validar sincronización AlwaysOn**
5. 🔄 **Ejecutar en producción**
6. 🔄 **Monitorear durante 24-48h**

---

**Versión:** 2.1  
**Fecha:** 2025-10-22  
**Estado:** ✅ Implementado  
**Testing:** Pendiente

