# 🔧 Corrección: Jobs, Backups y AlwaysOn

## 📋 Problemas Detectados y Solucionados

### 1️⃣ Jobs NO filtran por éxito (run_status)

**❌ Problema**: La consulta de jobs tomaba **CUALQUIER ejecución**, incluso fallidas.

```sql
-- ANTES (❌)
LEFT JOIN msdb.dbo.sysjobhistory jh 
    ON j.job_id = jh.job_id 
    AND jh.step_id = 0
```

**✅ Solución**: Filtrar **SOLO ejecuciones exitosas** (`run_status = 1`).

```sql
-- DESPUÉS (✅)
LEFT JOIN msdb.dbo.sysjobhistory jh 
    ON j.job_id = jh.job_id 
    AND jh.step_id = 0 
    AND jh.run_status = 1  -- SOLO EXITOSOS
```

**Valores de `run_status`**:
- `0` = Failed (fallido)
- `1` = Succeeded (éxito) ✅
- `2` = Retry
- `3` = Canceled
- `4` = In Progress

**Impacto**: Ahora `LastCheckdb` y `LastIndexOptimize` reflejan la **última ejecución exitosa**, no cualquier ejecución.

---

### 2️⃣ Duplicación de datos en BackupJson

**❌ Problema**: `BackupJson` contenía información de **mantenimiento** (CHECKDB, IndexOptimize), no de **backups**.

```json
// ANTES (❌) - BackupJson contenía info de mantenimiento
{
  "BackupJson": {
    "CheckdbOk": true,
    "IndexOptimizeOk": false,
    "LastCheckdb": "2025-10-18T00:00:00",
    "LastIndexOptimize": "2025-10-19T00:00:00",
    "LastFullBackup": null,
    "LastDiffBackup": null,
    "LastLogBackup": null,
    "Breaches": []
  }
}
```

**✅ Solución**: `BackupJson` **SOLO para backups**, `MaintenanceJson` para CHECKDB/IndexOptimize.

```json
// DESPUÉS (✅)
{
  "BackupJson": {
    "LastFullBackup": "2025-10-22T15:30:00",
    "LastDiffBackup": "2025-10-22T11:00:00",
    "LastLogBackup": "2025-10-22T19:15:00",
    "Breaches": []
  },
  "MaintenanceJson": {
    "CheckdbOk": true,
    "IndexOptimizeOk": true,
    "LastCheckdb": "2025-10-18",
    "LastIndexOptimize": "2025-10-19"
  }
}
```

**Cambios**:
- ❌ Eliminado: `CheckdbOk`, `IndexOptimizeOk`, `LastCheckdb`, `LastIndexOptimize` de `BackupJson`
- ✅ Ahora solo en: `MaintenanceJson`

---

### 3️⃣ AlwaysOn: No considera otros nodos del AG

**❌ Problema**: Solo consultaba **la instancia actual**, no los otros nodos del Availability Group.

**Escenario**:
```
AG: [SQL01, SQL02, SQL03]
- SQL01: CHECKDB hace 10 días ❌
- SQL02: CHECKDB hace 3 días ✅
- SQL03: CHECKDB hace 1 día ✅
```

**Antes**: Cada instancia reportaba su propio CHECKDB individualmente.

**✅ Solución**: Buscar el **último CHECKDB exitoso en TODOS los nodos** del AG.

```powershell
# Si es AlwaysOn, verificar otros nodos del AG
$aonQuery = @"
IF SERVERPROPERTY('IsHadrEnabled') = 1
BEGIN
    SELECT DISTINCT ar.replica_server_name AS ReplicaServer
    FROM sys.availability_replicas ar
    WHERE ar.replica_server_name != @@SERVERNAME
END
"@

foreach ($replica in $replicas) {
    # Consultar jobs en cada réplica
    $replicaJobs = Invoke-Sqlcmd -ServerInstance $replicaServer -Query $jobQuery
    
    # Tomar el MÁS RECIENTE entre todos los nodos
    if ($lastRun -gt $result.LastCheckdb) {
        $result.LastCheckdb = $lastRun
        $result.CheckdbOk = ($lastRun -gt (Get-Date).AddDays(-7))
    }
}
```

**Resultado**:
```
AG: [SQL01, SQL02, SQL03]
→ Toma el CHECKDB de SQL03 (más reciente) para las 3 instancias
→ Las 3 reportan: LastCheckdb = 2025-10-21 ✅
```

**Beneficio**: Si CUALQUIER nodo del AG ejecutó CHECKDB/IndexOptimize recientemente, **TODOS** los nodos se consideran OK (porque las bases están sincronizadas).

---

### 4️⃣ Backups en NULL

**❌ Problema**: `LastFullBackup`, `LastDiffBackup`, `LastLogBackup` estaban en NULL.

**Causas posibles**:
1. La instancia **no tiene bases de usuario** (solo system DBs)
2. Las bases de usuario están **OFFLINE** o en otro estado
3. **Nunca se ejecutaron backups**

**La consulta ya era correcta**, pero ahora está mejor documentada:

```sql
SELECT 
    d.name AS DatabaseName,
    d.recovery_model_desc AS RecoveryModel,
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS LastFullBackup,
    MAX(CASE WHEN b.type = 'I' THEN b.backup_finish_date END) AS LastDiffBackup,
    MAX(CASE WHEN b.type = 'L' THEN b.backup_finish_date END) AS LastLogBackup
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON d.name = b.database_name
WHERE d.database_id > 4  -- Excluir bases de sistema
  AND d.state = 0         -- Solo ONLINE
GROUP BY d.name, d.recovery_model_desc
```

**Si sigue en NULL**:
1. Verificar que hay bases de usuario
2. Verificar que están ONLINE
3. Verificar que hay entradas en `msdb.dbo.backupset`

**Comando de verificación**:
```sql
-- Ver bases de usuario
SELECT name, state_desc, recovery_model_desc 
FROM sys.databases 
WHERE database_id > 4 AND state = 0

-- Ver backups registrados
SELECT TOP 10 database_name, type, backup_finish_date 
FROM msdb.dbo.backupset 
ORDER BY backup_finish_date DESC
```

---

## 📊 Estructura de Datos Final

### BackupJson (SOLO backups)
```json
{
  "LastFullBackup": "2025-10-22T15:30:00",
  "LastDiffBackup": "2025-10-22T11:00:00",
  "LastLogBackup": "2025-10-22T19:15:00",
  "Breaches": [
    "FULL de DatabaseX antiguo (48h)",
    "LOG de DatabaseY nunca ejecutado"
  ]
}
```

### MaintenanceJson (CHECKDB + IndexOptimize)
```json
{
  "CheckdbOk": true,
  "IndexOptimizeOk": true,
  "LastCheckdb": "2025-10-18",
  "LastIndexOptimize": "2025-10-19"
}
```

**Separación clara**:
- **BackupJson**: Información de backups (FULL/DIFF/LOG)
- **MaintenanceJson**: Información de mantenimiento (CHECKDB/IndexOptimize)

---

## 🎯 Cómo Determina Éxito

### Jobs (CHECKDB / IndexOptimize)

**Consulta**:
```sql
SELECT j.name AS JobName, MAX(jh.run_date) AS LastRunDate
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh 
    ON j.job_id = jh.job_id 
    AND jh.step_id = 0        -- Job completo (no steps individuales)
    AND jh.run_status = 1     -- SOLO EXITOSOS ✅
WHERE j.enabled = 1
GROUP BY j.name
```

**Criterios**:
- ✅ `step_id = 0`: Resultado final del job (no steps intermedios)
- ✅ `run_status = 1`: Solo exitosos (NO fallidos, cancelados, etc.)
- ✅ `j.enabled = 1`: Solo jobs habilitados

**Luego evalúa**:
```powershell
$result.CheckdbOk = ($lastRun -gt (Get-Date).AddDays(-7))
$result.IndexOptimizeOk = ($lastRun -gt (Get-Date).AddDays(-7))
```

### Backups

**Consulta**:
```sql
SELECT 
    d.name,
    MAX(CASE WHEN b.type = 'D' THEN b.backup_finish_date END) AS LastFullBackup
FROM sys.databases d
LEFT JOIN msdb.dbo.backupset b ON d.name = b.database_name
WHERE d.database_id > 4 AND d.state = 0
GROUP BY d.name
```

**Criterios de Breach**:
```powershell
# FULL backup
if ($ageHours -gt 24) {
    $result.BackupBreaches += "FULL de $dbName antiguo ($([int]$ageHours)h)"
}

# LOG backup (solo FULL/BULK_LOGGED)
if ($ageHours -gt 1) {
    $result.BackupBreaches += "LOG de $dbName antiguo ($([int]$ageHours)h)"
}
```

---

## 🚀 Despliegue

### Backend
```powershell
cd SQLGuardObservatory.API
dotnet build -c Release
Restart-Service SQLGuardObservatory.API
```

### Frontend
```powershell
npm run build
.\deploy-frontend.ps1
```

### Re-ejecutar Script
```powershell
cd scripts
.\RelevamientoHealthScoreMant.ps1
```

---

## ✅ Verificación

### 1. Ver datos en SQL
```sql
SELECT TOP 1 
    InstanceName,
    BackupJson,
    MaintenanceJson
FROM dbo.InstanceHealthSnapshot
ORDER BY GeneratedAtUtc DESC
```

**Esperado**:
```json
BackupJson: {"LastFullBackup":"2025-10-22T15:30:00","LastDiffBackup":null,"LastLogBackup":"2025-10-22T19:15:00","Breaches":[]}
MaintenanceJson: {"CheckdbOk":true,"IndexOptimizeOk":true,"LastCheckdb":"2025-10-18","LastIndexOptimize":"2025-10-19"}
```

### 2. Verificar AlwaysOn

Si tienes un AG con 3 nodos:
```sql
-- En cada nodo, verificar que reportan el MISMO LastCheckdb
SELECT InstanceName, JSON_VALUE(MaintenanceJson, '$.LastCheckdb') AS LastCheckdb
FROM dbo.InstanceHealthSnapshot
WHERE InstanceName IN ('SQL01', 'SQL02', 'SQL03')
  AND GeneratedAtUtc > DATEADD(MINUTE, -10, GETUTCDATE())
```

**Esperado**: Los 3 nodos deben mostrar la **misma fecha** (la más reciente entre todos).

### 3. Verificar éxito de jobs

```sql
-- Ver historial de jobs
SELECT TOP 10
    j.name,
    jh.run_date,
    jh.run_status,
    CASE jh.run_status
        WHEN 0 THEN 'Failed'
        WHEN 1 THEN 'Succeeded'
        WHEN 2 THEN 'Retry'
        WHEN 3 THEN 'Canceled'
    END AS StatusText
FROM msdb.dbo.sysjobs j
JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id
WHERE j.name LIKE '%DatabaseIntegrityCheck%'
  AND jh.step_id = 0
ORDER BY jh.run_date DESC
```

---

## 📝 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `scripts/RelevamientoHealthScoreMant.ps1` | ✅ Filtro `run_status = 1`<br>✅ Consulta réplicas AG<br>✅ BackupJson sin duplicados |
| `SQLGuardObservatory.API/DTOs/HealthScoreDto.cs` | ✅ BackupSummary solo backups |
| `src/services/api.ts` | ✅ Interface actualizado |

---

## 💡 Beneficios

✅ **Jobs**: Solo cuenta ejecuciones exitosas (no fallidas)
✅ **Separación clara**: BackupJson = backups, MaintenanceJson = mantenimiento
✅ **AlwaysOn**: Considera TODOS los nodos del AG (no solo el actual)
✅ **Transparencia**: Ahora es claro qué significa "último exitoso"

---

## 🔍 Troubleshooting

### Problema: Backups siguen en NULL

**Causa 1**: No hay bases de usuario
```sql
SELECT COUNT(*) FROM sys.databases WHERE database_id > 4 AND state = 0
-- Si devuelve 0, no hay bases de usuario ONLINE
```

**Causa 2**: Nunca se ejecutaron backups
```sql
SELECT COUNT(*) FROM msdb.dbo.backupset
-- Si devuelve 0, nunca se registraron backups
```

**Causa 3**: Backups ejecutados fuera de SQL (por ejemplo, storage snapshots)
→ Estos NO aparecen en `msdb.dbo.backupset`

### Problema: Jobs en NULL a pesar de ejecutarse

**Causa**: Jobs deshabilitados (`j.enabled = 0`)
```sql
SELECT name, enabled FROM msdb.dbo.sysjobs 
WHERE name LIKE '%DatabaseIntegrityCheck%'
```

**Solución**: Habilitar el job
```sql
EXEC msdb.dbo.sp_update_job @job_name = 'DatabaseIntegrityCheck', @enabled = 1
```

---

## 🎯 Próximos Pasos

1. ✅ Re-ejecutar script PowerShell
2. ✅ Verificar que LastFullBackup/LastDiffBackup/LastLogBackup tienen valores
3. ✅ Verificar que CheckdbOk/IndexOptimizeOk ya NO están en BackupJson
4. ✅ Para AG, verificar que todos los nodos reportan el mismo LastCheckdb
5. ✅ Logout/Login en la app para ver cambios

