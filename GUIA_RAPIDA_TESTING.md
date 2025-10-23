# Guía Rápida de Testing - HealthScore con AlwaysOn

## ⏱️ Testing Rápido (5 minutos)

### 1. Ejecutar el Script

```powershell
cd C:\Temp\Tobi

# Opción 1: Modo de prueba (5-10 instancias)
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Opción 2: Producción completa
.\RelevamientoHealthScoreMant.ps1 -Verbose -WriteToSql
```

---

### 2. Verificar Output en Consola

Debes ver:

```
[PRE-PROCESO] Identificando grupos AlwaysOn...
      [AG] SSPR19MBKAG
           Nodos: SSPR19MBK-01, SSPR19MBK-51
      [AG] SSPR17DBAG
           Nodos: SSPR17DB-02, SSPR17DB-52
      [OK] 2 grupo(s) AlwaysOn detectado(s)

[3/5] Procesando instancias...

  [1/50] SSPR19MBK-01 - [Healthy] Score: 92
  [2/50] SSPR19MBK-51 - [Healthy] Score: 92  ← MISMO SCORE ✅
  ...

[POST-PROCESO] Sincronizando valores en nodos AlwaysOn...
      [SYNC] SSPR19MBKAG
             Nodos: SSPR19MBK-01, SSPR19MBK-51
             LastCheckdb: 2025-10-20 (OK=True)
             LastIndexOptimize: 2025-10-21 (OK=True)
             LastFullBackup: 2025-10-22 02:00
             LastLogBackup: 2025-10-22 07:30
      [OK] 2 nodo(s) sincronizado(s)
```

**✅ CORRECTO si**:
- Se detectan grupos AG con sus nodos
- Los nodos del mismo AG tienen el mismo HealthScore
- Se muestran valores sincronizados en el post-proceso

**❌ ERROR si**:
- No se detectan grupos AG (cuando debería haber)
- Los nodos del mismo AG tienen scores diferentes
- No aparece el post-proceso de sincronización

---

### 3. Verificar JSON (Rápido)

```powershell
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json

# Comparar 2 nodos del mismo AG
$ag01 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-01" }
$ag51 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-51" }

# Estos DEBEN ser iguales:
Write-Host "LastCheckdb: $($ag01.MaintenanceSummary.LastCheckdb) vs $($ag51.MaintenanceSummary.LastCheckdb)"
Write-Host "LastIndexOptimize: $($ag01.MaintenanceSummary.LastIndexOptimize) vs $($ag51.MaintenanceSummary.LastIndexOptimize)"
Write-Host "LastFullBackup: $($ag01.BackupSummary.LastFullBackup) vs $($ag51.BackupSummary.LastFullBackup)"
Write-Host "LastLogBackup: $($ag01.BackupSummary.LastLogBackup) vs $($ag51.BackupSummary.LastLogBackup)"
Write-Host "HealthScore: $($ag01.HealthScore) vs $($ag51.HealthScore)"
```

**✅ CORRECTO**: Todos los valores iguales  
**❌ ERROR**: Valores diferentes

---

### 4. Verificar en Base de Datos (Producción)

```sql
USE SQLNova;
GO

-- Ver últimos resultados de nodos AG
WITH LatestSnapshot AS (
    SELECT MAX(GeneratedAtUtc) AS MaxDate
    FROM dbo.InstanceHealthSnapshot
)
SELECT 
    hs.InstanceName,
    JSON_VALUE(hs.MaintenanceJson, '$.LastCheckdb') AS LastCheckdb,
    JSON_VALUE(hs.MaintenanceJson, '$.LastIndexOptimize') AS LastIndexOptimize,
    JSON_VALUE(hs.BackupJson, '$.LastFullBackup') AS LastFullBackup,
    JSON_VALUE(hs.BackupJson, '$.LastLogBackup') AS LastLogBackup,
    JSON_VALUE(hs.BackupJson, '$.Breaches') AS Breaches,
    hs.HealthScore,
    hs.HealthStatus
FROM dbo.InstanceHealthSnapshot hs
CROSS JOIN LatestSnapshot ls
WHERE hs.GeneratedAtUtc = ls.MaxDate
  AND hs.InstanceName IN ('SSPR19MBK-01', 'SSPR19MBK-51')  -- ← Cambiar a tus nodos
ORDER BY hs.InstanceName;
```

**✅ CORRECTO**: Todas las columnas (menos InstanceName) iguales  
**❌ ERROR**: Valores diferentes

---

## 🔍 Testing Detallado (15 minutos)

### Test 1: AG con 2 Nodos (Típico)

```powershell
# Verificar que ambos nodos del AG reportan lo mismo
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json

$agNodes = @("SSPR19MBK-01", "SSPR19MBK-51")  # ← Cambiar a tus nodos

$results = $json | Where-Object { $agNodes -contains $_.InstanceName }

# Tabla comparativa
$results | Select-Object InstanceName, 
    @{N='LastCheckdb';E={$_.MaintenanceSummary.LastCheckdb}},
    @{N='LastIndexOptimize';E={$_.MaintenanceSummary.LastIndexOptimize}},
    @{N='LastFullBackup';E={$_.BackupSummary.LastFullBackup}},
    @{N='LastLogBackup';E={$_.BackupSummary.LastLogBackup}},
    @{N='Breaches';E={$_.BackupSummary.Breaches.Count}},
    HealthScore,
    HealthStatus | Format-Table -AutoSize
```

**Resultado esperado**:
```
InstanceName    LastCheckdb  LastIndexOptimize  LastFullBackup       LastLogBackup        Breaches  HealthScore  HealthStatus
------------    -----------  -----------------  ----------------     ----------------     --------  -----------  ------------
SSPR19MBK-01    2025-10-20   2025-10-21         2025-10-22T02:00:00  2025-10-22T07:30:00  0         92           Healthy
SSPR19MBK-51    2025-10-20   2025-10-21         2025-10-22T02:00:00  2025-10-22T07:30:00  0         92           Healthy
                ^^^^^^^^^^   ^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^           ^^           ^^^^^^^
                IGUALES ✅    IGUALES ✅          IGUALES ✅            IGUALES ✅                     IGUAL ✅      IGUAL ✅
```

---

### Test 2: AG con 3+ Nodos

```powershell
# Si tienes un AG con más de 2 nodos (ej: DR en 3er sitio)
$agNodes = @("SSPR17DB-02", "SSPR17DB-52", "SSPR17DB-03")

$results = $json | Where-Object { $agNodes -contains $_.InstanceName }

# TODOS deben tener los mismos valores
$results | Select-Object InstanceName, 
    @{N='LastCheckdb';E={$_.MaintenanceSummary.LastCheckdb}},
    @{N='LastFullBackup';E={$_.BackupSummary.LastFullBackup}},
    HealthScore | Format-Table -AutoSize
```

---

### Test 3: Standalone NO se Afectan

```powershell
# Verificar que instancias standalone mantienen sus propios valores
$standalone = $json | Where-Object { 
    $_.InstanceName -like "SQLTEST-*" -or 
    $_.InstanceName -notmatch '\d{2}$'
}

# Cada una debe tener valores independientes (no sincronizados con otros)
$standalone | Select-Object InstanceName, 
    @{N='LastCheckdb';E={$_.MaintenanceSummary.LastCheckdb}},
    HealthScore | Format-Table -AutoSize

# ✅ CORRECTO: Valores diferentes (cada uno según su estado real)
# ❌ ERROR: Todos con mismos valores (no debería pasar)
```

---

### Test 4: Breaches Correctos

```powershell
# Ver instancias con breaches
$withBreaches = $json | Where-Object { $_.BackupSummary.Breaches.Count -gt 0 }

$withBreaches | Select-Object InstanceName,
    @{N='Breaches';E={$_.BackupSummary.Breaches -join '; '}},
    HealthScore,
    HealthStatus | Format-Table -AutoSize -Wrap
```

**Verificar**:
- ✅ Breaches describen problemas reales (ej: "FULL backup antiguo (28h > 25h)")
- ✅ HealthScore reducido según los breaches
- ✅ HealthStatus refleja correctamente (Critical si score < 70)

---

## 🚨 Problemas Comunes y Soluciones

### Problema 1: No se detectan grupos AG

**Síntoma**:
```
[PRE-PROCESO] Identificando grupos AlwaysOn...
      [INFO] No se detectaron grupos AlwaysOn
```

**Causas posibles**:
1. Las instancias no tienen AlwaysOn habilitado realmente
2. Problemas de conectividad
3. Permisos insuficientes para consultar `sys.availability_replicas`

**Solución**:
```powershell
# Verificar manualmente en una instancia AG
sqlcmd -S SSPR19MBK-01 -Q "SELECT SERVERPROPERTY('IsHadrEnabled')"
# → Debería retornar 1

sqlcmd -S SSPR19MBK-01 -Q "SELECT replica_server_name FROM sys.availability_replicas"
# → Debería listar los nodos

# Si fallan, revisar:
# - Conectividad de red
# - Permisos del usuario que ejecuta el script
# - Estado real del AlwaysOn
```

---

### Problema 2: Valores diferentes en nodos del mismo AG

**Síntoma**:
```
SSPR19MBK-01: HealthScore = 92
SSPR19MBK-51: HealthScore = 75  ← DIFERENTE ❌
```

**Causas posibles**:
1. El post-proceso de sincronización no se ejecutó
2. Error durante la sincronización
3. Los nodos tienen diferentes discos/recursos (correcto)

**Verificar**:
```powershell
# Buscar en el output del script:
# [POST-PROCESO] Sincronizando valores en nodos AlwaysOn...

# Si NO aparece, verificar:
# - ¿Se ejecutó con -Mock? (el post-proceso se omite en modo mock)
# - ¿Hubo errores antes del post-proceso?

# Si SÍ aparece pero sigue diferente:
# - Verificar si la diferencia es solo en Disks/Resources (CORRECTO)
# - Verificar que Maintenance y Backups SÍ sean iguales
```

---

### Problema 3: Backups NULL en todos los nodos

**Síntoma**:
```json
{
  "BackupSummary": {
    "LastFullBackup": null,
    "LastLogBackup": null
  }
}
```

**Causas posibles**:
1. No hay backups registrados en `msdb.dbo.backupset`
2. Problema de conectividad con réplicas
3. Error en la consulta de backups

**Verificar**:
```sql
-- Verificar manualmente en cada nodo del AG
SELECT TOP 10
    database_name,
    type,
    backup_finish_date
FROM msdb.dbo.backupset
WHERE database_name NOT IN ('master', 'model', 'msdb', 'tempdb')
ORDER BY backup_finish_date DESC;

-- Si retorna resultados → El script debería detectarlos
-- Si está vacío → No hay backups registrados (problema real)
```

---

## ✅ Checklist de Validación Final

Antes de entregar, verificar:

- [ ] El script se ejecuta sin errores
- [ ] Se detectan todos los grupos AG esperados
- [ ] Nodos del mismo AG reportan valores idénticos de:
  - [ ] `LastCheckdb`
  - [ ] `LastIndexOptimize`
  - [ ] `LastFullBackup`
  - [ ] `LastLogBackup`
  - [ ] `HealthScore` (similar, puede variar por discos)
- [ ] Standalone mantienen valores independientes
- [ ] Breaches son correctos y descriptivos
- [ ] Los datos se guardan correctamente en SQL (si `-WriteToSql`)
- [ ] El JSON de salida es válido y completo

---

## 📞 Si Algo Falla

1. **Ejecutar con `-Verbose`** para ver detalles
2. **Revisar logs** del script (output en consola)
3. **Verificar manualmente** con las consultas SQL provistas
4. **Comparar** con la documentación en `REFACTORING_ALWAYSON_COMPLETO.md`

---

**Última actualización**: 2025-10-22  
**Tiempo estimado de testing**: 5-15 minutos  
**Listo para producción**: ✅ SÍ

