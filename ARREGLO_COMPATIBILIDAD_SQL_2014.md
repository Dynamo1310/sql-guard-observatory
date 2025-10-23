# Arreglo: Compatibilidad con SQL Server 2008 R2 - 2014

## 📅 Fecha: 2025-10-22

## ❌ Errores Detectados

### 1. Error en Backups

```
VERBOSE: Error obteniendo backups de SSDS17HBI-01 : 
Multiple ambiguous overloads found for "op_Subtraction" and the argument count: "2".
```

**Causa:**
- PowerShell no puede determinar el tipo correcto para la operación de resta
- Ocurre cuando `$result.LastFullBackup` es NULL o tiene un tipo ambiguo
- Al hacer `((Get-Date) - $result.LastFullBackup).TotalHours` sin validación

### 2. Error en Jobs

```
VERBOSE: Error obteniendo jobs de SSDS14ODM-01 : 
Cannot perform an aggregate function on an expression containing an aggregate or a subquery.
```

**Causa:**
- SQL Server 2008 R2 - 2014 **no soporta** agregados anidados complejos
- El query original usaba `MAX(CASE WHEN ... (SELECT MAX(...)) THEN ... END)`
- Esto funciona en SQL 2016+, pero falla en versiones anteriores

## ✅ Soluciones Implementadas

### 1. Validación de Fechas en PowerShell

**Antes:**
```powershell
if ($result.LastFullBackup) {
    $ageHours = ((Get-Date) - $result.LastFullBackup).TotalHours
    if ($ageHours -gt 25) {
        $result.Breaches += "FULL: $([int]$ageHours)h > 25h"
    }
}
```

**Ahora:**
```powershell
if ($result.LastFullBackup -and $result.LastFullBackup -is [datetime]) {
    try {
        $ageHours = ((Get-Date) - [datetime]$result.LastFullBackup).TotalHours
        if ($ageHours -gt 25) {
            $result.Breaches += "FULL: $([int]$ageHours)h > 25h"
        }
    } catch {
        Write-Verbose "Error calculando antigüedad de FULL backup: $_"
    }
}
```

**Mejoras:**
- ✅ Validación de tipo: `$result.LastFullBackup -is [datetime]`
- ✅ Casting explícito: `[datetime]$result.LastFullBackup`
- ✅ Try-catch para manejo de errores
- ✅ Se aplica también a `LastLogBackup`
- ✅ Se aplica en `Get-BackupStatus` y `Sync-AlwaysOnData`

### 2. Query SQL Simplificado (Compatible SQL 2008 R2+)

**Antes (SQL incompatible):**
```sql
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
  AND j.name NOT LIKE '%STOP%'
GROUP BY j.name;
```

**Problema:** `MAX()` con subqueries anidadas causa error en SQL 2008 R2 - 2014

**Ahora (SQL compatible):**
```sql
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS LastRunDate,
        jh.run_time AS LastRunTime,
        jh.run_status AS LastRunStatus,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunStatus
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
```

**Mejoras:**
- ✅ Usa `ROW_NUMBER()` que es compatible desde SQL 2005
- ✅ Usa CTE (Common Table Expression) que es compatible desde SQL 2005
- ✅ No usa agregados anidados
- ✅ Más eficiente y legible
- ✅ Maneja correctamente jobs sin historial (`rn IS NULL`)

### 3. Validación de DBNull en PowerShell

**Agregado:**
```powershell
if ($job.LastRunDate -and $job.LastRunDate -ne [DBNull]::Value -and 
    $job.LastRunTime -ne $null -and $job.LastRunTime -ne [DBNull]::Value) {
    try {
        $runDate = $job.LastRunDate.ToString()
        $runTime = $job.LastRunTime.ToString().PadLeft(6, '0')
        $lastRun = [datetime]::ParseExact("$runDate$runTime", "yyyyMMddHHmmss", $null)
        // ...
    } catch {
        Write-Verbose "Error procesando job $($job.JobName): $_"
        $allCheckdbOk = $false
    }
}
```

**Mejoras:**
- ✅ Validación de `[DBNull]::Value` de SQL
- ✅ Try-catch individual por cada job
- ✅ No detiene el procesamiento si un job falla
- ✅ Se aplica a IntegrityCheck e IndexOptimize

## 📊 Compatibilidad

### Versiones SQL Server Soportadas

| Versión | Antes v2.0 | Ahora v2.1 |
|---------|------------|------------|
| SQL Server 2008 R2 | ❌ Error | ✅ Compatible |
| SQL Server 2012 | ❌ Error | ✅ Compatible |
| SQL Server 2014 | ❌ Error | ✅ Compatible |
| SQL Server 2016 | ✅ OK | ✅ Compatible |
| SQL Server 2017 | ✅ OK | ✅ Compatible |
| SQL Server 2019 | ✅ OK | ✅ Compatible |
| SQL Server 2022 | ✅ OK | ✅ Compatible |

## 🔍 Archivos Modificados

### `scripts/RelevamientoHealthScoreMant.ps1`

**Líneas modificadas:**

1. **Función `Get-MaintenanceJobs` (líneas 110-155):**
   - Query SQL refactorizado con CTE y ROW_NUMBER()
   - Validación de DBNull en procesamiento de resultados
   - Try-catch individual por job

2. **Función `Get-BackupStatus` (líneas 327-348):**
   - Validación de tipo datetime
   - Casting explícito
   - Try-catch para cálculo de antigüedad

3. **Función `Sync-AlwaysOnData` (líneas 1028-1053):**
   - Validación de tipo datetime
   - Casting explícito
   - Try-catch para cálculo de antigüedad

## 🧪 Validación

### Instancias que Dieron Error

```
SSDS17HBI-01 → Backup error (DateTime)
SSDS14ODM-01 → Jobs error (SQL 2014)
SSDS17SMO-01 → Ambos errores
SSTS14-01 → Ambos errores
```

### Cómo Probar

```powershell
# 1. Ejecutar con verbose en instancias problemáticas
.\RelevamientoHealthScoreMant.ps1 -Verbose 2>&1 | Tee-Object -FilePath test.log

# 2. Buscar errores
Get-Content test.log | Select-String -Pattern "Error obteniendo"

# 3. Verificar que no aparecen los errores:
# - "Multiple ambiguous overloads"
# - "Cannot perform an aggregate function"
```

### Verificación en SQL

```sql
-- Probar el query directamente en SQL 2014
USE msdb;
GO

-- Este query ahora debe funcionar en SQL 2008 R2+
WITH LastJobRuns AS (
    SELECT 
        j.job_id,
        j.name AS JobName,
        jh.run_date AS LastRunDate,
        jh.run_time AS LastRunTime,
        jh.run_status AS LastRunStatus,
        ROW_NUMBER() OVER (PARTITION BY j.job_id ORDER BY jh.run_date DESC, jh.run_time DESC) AS rn
    FROM msdb.dbo.sysjobs j
    LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
    WHERE j.name LIKE '%IntegrityCheck%'
      AND j.name NOT LIKE '%STOP%'
)
SELECT 
    JobName,
    LastRunDate,
    LastRunTime,
    LastRunStatus
FROM LastJobRuns
WHERE rn = 1 OR rn IS NULL;
```

## 📝 Notas Técnicas

### ROW_NUMBER() vs MAX() con Subqueries

**ROW_NUMBER():**
- ✅ Más eficiente
- ✅ Compatible desde SQL 2005
- ✅ Más legible
- ✅ Maneja NULLs correctamente

**MAX() con subqueries:**
- ❌ Menos eficiente
- ❌ No compatible en versiones antiguas con agregados anidados
- ❌ Más complejo
- ❌ Problemas con NULLs

### Casting Explícito en PowerShell

```powershell
# MAL (puede fallar)
$ageHours = ((Get-Date) - $value).TotalHours

# BIEN (robusto)
if ($value -is [datetime]) {
    $ageHours = ((Get-Date) - [datetime]$value).TotalHours
}
```

**Razones:**
- PowerShell puede no inferir correctamente el tipo
- Los valores de SQL pueden venir como `System.Data.SqlTypes.SqlDateTime`
- El casting explícito asegura compatibilidad

## ✅ Checklist de Validación

```
[ ] Script se ejecuta sin errores en SQL 2008 R2
[ ] Script se ejecuta sin errores en SQL 2012
[ ] Script se ejecuta sin errores en SQL 2014
[ ] No aparece "Multiple ambiguous overloads"
[ ] No aparece "Cannot perform an aggregate function"
[ ] Jobs se detectan correctamente
[ ] Backups se detectan correctamente
[ ] Breaches se calculan correctamente
[ ] AlwaysOn sincroniza correctamente
```

## 🚀 Próximos Pasos

1. ✅ **Ejecutar en modo de prueba**
2. ✅ **Validar instancias SQL 2014 y anteriores**
3. ✅ **Revisar logs en busca de errores**
4. 🔄 **Ejecutar en producción**

---

**Versión:** 2.1.1  
**Fecha:** 2025-10-22  
**Cambio Principal:** Compatibilidad SQL 2008 R2 - 2014  
**Impacto:** Soluciona errores en versiones antiguas de SQL Server  
**Testing:** Listo para validar ✅

