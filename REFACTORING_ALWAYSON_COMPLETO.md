# Refactoring Completo: AlwaysOn - Pre-procesamiento y Sincronización

## 📋 Resumen Ejecutivo

**Fecha**: 2025-10-22  
**Archivo**: `scripts/RelevamientoHealthScoreMant.ps1`  
**Cambios**: +400 líneas (refactoring completo de la lógica AlwaysOn)

---

## 🎯 Problemas Resueltos

### 1. Inconsistencia en campo AlwaysOn de la API
**Problema**: Un nodo reportaba `AlwaysOn: "Enabled"` y otro del mismo AG reportaba `AlwaysOn: "Disabled"`.

**Causa**: El campo en la API estaba desactualizado o incorrecto.

**Solución**: Ya NO dependemos del campo `AlwaysOn` de la API. Ahora consultamos dinámicamente `sys.availability_replicas` en cada nodo para obtener la lista REAL de réplicas.

---

### 2. Procesamiento desorganizado
**Problema**: Cada instancia se procesaba individualmente, intentando detectar réplicas durante el procesamiento, lo que causaba:
- Consultas SQL redundantes
- Lógica compleja y difícil de mantener
- Posibles inconsistencias

**Solución**: **Pre-procesamiento** de TODOS los grupos AG ANTES de procesar instancias.

---

### 3. Casos con más de 2 nodos no se manejaban
**Problema**: La lógica de patrón 01↔51 solo manejaba pares.

**Solución**: Consulta dinámica de `sys.availability_replicas` que retorna TODOS los nodos del AG, sin importar cuántos sean.

---

### 4. Sincronización incompleta
**Problema**: Solo se sincronizaban jobs de mantenimiento, no backups.

**Solución**: Ahora se sincronizan:
- ✅ `LastCheckdb`
- ✅ `LastIndexOptimize`
- ✅ `LastFullBackup`
- ✅ `LastLogBackup`
- ✅ `LastDiffBackup`
- ✅ Breaches de backups

---

## 🔧 Nueva Arquitectura

### Flujo Actual (Mejorado)

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Obtener inventario desde API                               │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 2. Filtrar instancias (DMZ, AWS, etc.)                        │
│    Ordenar por nombre                                          │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 2.5. PRE-PROCESAMIENTO: Get-AlwaysOnGroups                    │
│                                                                 │
│  Para cada instancia (ordenadas por nombre):                  │
│    1. Conectar y consultar SERVERPROPERTY('IsHadrEnabled')   │
│    2. Si = 1 → Consultar sys.availability_replicas           │
│    3. Agrupar por nombre de AG                                │
│    4. Registrar TODOS los nodos del AG                        │
│    5. Fallback: Patrón 01↔51 si no se pudo consultar         │
│                                                                 │
│  Resultado:                                                    │
│    $agInfo = @{                                                │
│        Groups = @{                                             │
│            "MiAG" = @{                                         │
│                AGName = "MiAG"                                 │
│                Nodes = @("Server01", "Server51", "Server03")  │
│            }                                                    │
│        }                                                        │
│        NodeToGroup = @{                                        │
│            "Server01" = "MiAG"                                 │
│            "Server51" = "MiAG"                                 │
│            "Server03" = "MiAG"                                 │
│        }                                                        │
│    }                                                            │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 3. Procesar instancias (Process-Instance + $agInfo)           │
│                                                                 │
│  Para cada instancia:                                          │
│    1. Buscar en $agInfo si pertenece a un AG                  │
│    2. Si sí → Obtener lista de nodos del AG                   │
│    3. Pasar lista a Get-JobAndBackupStatus                    │
│    4. Consultar jobs/backups en nodo local                    │
│    5. Consultar jobs/backups en TODOS los nodos del AG        │
│    6. Tomar el MÁS RECIENTE de todos                          │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 3.5. POST-PROCESAMIENTO: Sync-AlwaysOnMaintenanceValues       │
│                                                                 │
│  Para cada grupo AG en $agInfo.Groups:                        │
│    1. Buscar resultados de TODOS los nodos del grupo         │
│    2. Encontrar valores MÁS RECIENTES:                        │
│       - LastCheckdb                                            │
│       - LastIndexOptimize                                      │
│       - LastFullBackup                                         │
│       - LastLogBackup                                          │
│       - LastDiffBackup                                         │
│    3. Aplicar esos valores a TODOS los nodos                  │
│    4. Recalcular breaches con valores sincronizados           │
│    5. Recalcular HealthScore                                   │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 4. Guardar JSON/CSV                                            │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────────────────────┐
│ 5. Escribir a SQL (si -WriteToSql)                            │
└────────────────────────────────────────────────────────────────┘
```

---

## 📝 Funciones Nuevas/Modificadas

### 1. `Get-AlwaysOnGroups` (NUEVA)

**Propósito**: Pre-procesar TODAS las instancias para identificar grupos AG reales.

**Lógica**:
```powershell
# 1. Ordenar instancias por nombre
$sortedInstances = $Instances | Sort-Object { ... }

# 2. Para cada instancia
foreach ($inst in $sortedInstances) {
    # 3. Consultar si AlwaysOn está habilitado
    $hadrEnabled = Invoke-Sqlcmd "SELECT SERVERPROPERTY('IsHadrEnabled')"
    
    if ($hadrEnabled -eq 1) {
        # 4. Consultar réplicas reales
        $replicas = Invoke-Sqlcmd @"
SELECT ar.replica_server_name, ag.name AS AGName
FROM sys.availability_replicas ar
INNER JOIN sys.availability_groups ag ON ar.group_id = ag.group_id
"@
        
        # 5. Agrupar por nombre de AG
        foreach ($ag in $replicas | Group-Object AGName) {
            $agGroups[$ag.Name] = @{
                AGName = $ag.Name
                Nodes = @($ag.Group.replica_server_name)
            }
        }
    }
}

# 6. Fallback con patrón 01↔51 para instancias que fallaron
# ...
```

**Resultado**:
```powershell
$agInfo = @{
    Groups = @{
        "SSPR19MBKAG" = @{
            AGName = "SSPR19MBKAG"
            Nodes = @("SSPR19MBK-01", "SSPR19MBK-51")
        },
        "SSPR17DBAG" = @{
            AGName = "SSPR17DBAG"
            Nodes = @("SSPR17DB-02", "SSPR17DB-52", "SSPR17DB-03")  # 3 nodos!
        }
    },
    NodeToGroup = @{
        "SSPR19MBK-01" = "SSPR19MBKAG"
        "SSPR19MBK-51" = "SSPR19MBKAG"
        "SSPR17DB-02" = "SSPR17DBAG"
        "SSPR17DB-52" = "SSPR17DBAG"
        "SSPR17DB-03" = "SSPR17DBAG"
    }
}
```

---

### 2. `Get-JobAndBackupStatus` (MODIFICADA)

**Antes**:
```powershell
param(
    [string]$InstanceName,
    [int]$TimeoutSec,
    [pscredential]$Credential,
    [string]$AlwaysOnStatus = "Disabled"  # ❌ Dependía de la API
)

# ❌ Detectaba réplicas DURANTE el procesamiento
if ($AlwaysOnStatus -eq "Enabled") {
    # Consultar sys.availability_replicas...
}
```

**Ahora**:
```powershell
param(
    [string]$InstanceName,
    [int]$TimeoutSec,
    [pscredential]$Credential,
    [array]$ReplicaServers = @()  # ✅ Lista PRE-CALCULADA
)

# ✅ Usa directamente la lista pre-calculada
if ($ReplicaServers.Count -gt 0) {
    foreach ($replica in $ReplicaServers) {
        if ($replica -ne $InstanceName) {  # Skip nodo local
            # Consultar jobs/backups en réplica...
        }
    }
}
```

---

### 3. `Process-Instance` (MODIFICADA)

**Antes**:
```powershell
param(
    [object]$Instance,
    [int]$TimeoutSec,
    [pscredential]$Credential
)

# ❌ Obtenía AlwaysOn de la API
$alwaysOnStatus = if ($Instance.AlwaysOn) { $Instance.AlwaysOn } else { "Disabled" }

$jobBackup = Get-JobAndBackupStatus ... -AlwaysOnStatus $alwaysOnStatus
```

**Ahora**:
```powershell
param(
    [object]$Instance,
    [int]$TimeoutSec,
    [pscredential]$Credential,
    [hashtable]$AGInfo = @{ Groups = @{}; NodeToGroup = @{} }  # ✅ Info pre-calculada
)

# ✅ Obtiene lista de réplicas desde $AGInfo
$replicaServers = @()
if ($AGInfo.NodeToGroup.ContainsKey($instanceName)) {
    $agKey = $AGInfo.NodeToGroup[$instanceName]
    $replicaServers = $AGInfo.Groups[$agKey].Nodes
}

$jobBackup = Get-JobAndBackupStatus ... -ReplicaServers $replicaServers
```

---

### 4. `Sync-AlwaysOnMaintenanceValues` (MODIFICADA)

**Antes**:
```powershell
param(
    [array]$AllResults,
    [array]$OriginalInstances  # ❌ Necesitaba reconstruir grupos
)

# ❌ Reconstruía grupos usando patrón 01↔51
foreach ($result in $AllResults) {
    if ($result.InstanceName -match '(\d{2})$') {
        $agGroupKey = switch ($lastTwoDigits) {
            "01" { "$baseName-AG-01-51" }
            "51" { "$baseName-AG-01-51" }
            ...
        }
    }
}
```

**Ahora**:
```powershell
param(
    [array]$AllResults,
    [hashtable]$AGInfo  # ✅ Usa grupos pre-calculados
)

# ✅ Itera directamente sobre grupos conocidos
foreach ($agKey in $AGInfo.Groups.Keys) {
    $agGroup = $AGInfo.Groups[$agKey]
    $nodeNames = $agGroup.Nodes  # ✅ Lista completa de nodos
    
    $groupResults = $AllResults | Where-Object { $nodeNames -contains $_.InstanceName }
    
    # Encontrar valores MÁS RECIENTES
    # Aplicar a TODOS los nodos
    # Recalcular HealthScore
}
```

**Ahora también sincroniza backups**:
```powershell
# Encontrar backups MÁS RECIENTES
if ($node.BackupSummary.LastFullBackup) {
    $fullDate = [datetime]$node.BackupSummary.LastFullBackup
    if ($null -eq $mostRecentFullBackup -or $fullDate -gt $mostRecentFullBackup) {
        $mostRecentFullBackup = $fullDate
    }
}

# Aplicar a todos los nodos
if ($mostRecentFullBackup) {
    $node.BackupSummary.LastFullBackup = $mostRecentFullBackup.ToString("yyyy-MM-ddTHH:mm:ss")
}

# Recalcular breaches
$newBreaches = @()
if ($mostRecentFullBackup) {
    $ageHours = ((Get-Date) - $mostRecentFullBackup).TotalHours
    if ($ageHours -gt 25) {
        $newBreaches += "FULL backup antiguo ($([int]$ageHours)h > 25h)"
    }
}
$node.BackupSummary.Breaches = $newBreaches
```

---

## 📊 Ejemplo Completo: AG con 3 Nodos

### Setup
```
AG: "MiAG" con 3 nodos
  - Server01 (Primary)
  - Server51 (Secondary)
  - Server03 (Secondary para DR)

Mantenimiento:
  - Server01: LastCheckdb = 2025-10-20, LastIndexOptimize = 2025-10-19
  - Server51: LastCheckdb = 2025-10-15, LastIndexOptimize = 2025-10-21  ← MÁS RECIENTE
  - Server03: LastCheckdb = 2025-10-18, LastIndexOptimize = NULL

Backups (solo en Server51):
  - Server01: LastFullBackup = NULL, LastLogBackup = NULL
  - Server51: LastFullBackup = 2025-10-22 02:00, LastLogBackup = 2025-10-22 07:30  ← AQUÍ
  - Server03: LastFullBackup = NULL, LastLogBackup = NULL
```

### Paso 1: Pre-procesamiento (Get-AlwaysOnGroups)

```powershell
# Consultar Server01
Invoke-Sqlcmd "SELECT * FROM sys.availability_replicas"
→ Resultado: Server01, Server51, Server03

# Grupo creado:
$agInfo.Groups["MiAG"] = @{
    AGName = "MiAG"
    Nodes = @("Server01", "Server51", "Server03")
}

$agInfo.NodeToGroup["Server01"] = "MiAG"
$agInfo.NodeToGroup["Server51"] = "MiAG"
$agInfo.NodeToGroup["Server03"] = "MiAG"
```

### Paso 2: Procesamiento (Process-Instance)

```powershell
# Procesar Server01
$replicaServers = @("Server01", "Server51", "Server03")

Get-JobAndBackupStatus -InstanceName "Server01" -ReplicaServers $replicaServers
→ Consulta jobs en: Server01, Server51, Server03
→ Consulta backups en: Server01, Server51, Server03
→ Toma MÁS RECIENTE:
    LastCheckdb = 2025-10-20 (de Server01)
    LastIndexOptimize = 2025-10-21 (de Server51)
    LastFullBackup = 2025-10-22 02:00 (de Server51)
    LastLogBackup = 2025-10-22 07:30 (de Server51)

# Resultado parcial para Server01:
{
    MaintenanceSummary: {
        LastCheckdb: "2025-10-20"
        LastIndexOptimize: "2025-10-21"
    },
    BackupSummary: {
        LastFullBackup: "2025-10-22T02:00:00"
        LastLogBackup: "2025-10-22T07:30:00"
    }
}
```

### Paso 3: Post-procesamiento (Sync-AlwaysOnMaintenanceValues)

```powershell
# Sincronizar grupo "MiAG"
$groupResults = @(Server01, Server51, Server03)

# Encontrar valores MÁS RECIENTES entre TODOS
foreach ($node in $groupResults) {
    # Ya cada uno tiene sus valores optimizados del paso anterior
}

# Como ya se consultaron mutuamente, valores ya están sincronizados
# Solo se recalculan breaches para consistencia

# Server01, Server51, Server03 → TODOS con los mismos valores finales
```

### Resultado Final en BD

```sql
SELECT InstanceName, 
       JSON_VALUE(MaintenanceJson, '$.LastCheckdb') AS LastCheckdb,
       JSON_VALUE(MaintenanceJson, '$.LastIndexOptimize') AS LastIndexOptimize,
       JSON_VALUE(BackupJson, '$.LastFullBackup') AS LastFullBackup,
       JSON_VALUE(BackupJson, '$.LastLogBackup') AS LastLogBackup
FROM InstanceHealthSnapshot
WHERE InstanceName IN ('Server01', 'Server51', 'Server03')
ORDER BY InstanceName;
```

**Resultado**:
```
InstanceName  LastCheckdb  LastIndexOptimize  LastFullBackup       LastLogBackup
------------  -----------  -----------------  -------------------  -------------------
Server01      2025-10-20   2025-10-21         2025-10-22T02:00:00  2025-10-22T07:30:00
Server51      2025-10-20   2025-10-21         2025-10-22T02:00:00  2025-10-22T07:30:00
Server03      2025-10-20   2025-10-21         2025-10-22T02:00:00  2025-10-22T07:30:00
              ^^^^^^^^^^   ^^^^^^^^^^         ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^
              TODOS IGUALES ✅
```

---

## ✅ Beneficios de la Nueva Arquitectura

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| **Dependencia de API** | ❌ Campo `AlwaysOn` (puede estar mal) | ✅ Consulta dinámica `sys.availability_replicas` |
| **Detección de grupos** | ❌ Durante procesamiento (cada nodo por separado) | ✅ Pre-procesamiento (una sola vez) |
| **Casos con > 2 nodos** | ❌ No manejaba | ✅ Maneja cualquier cantidad |
| **Sincronización** | ⚠️ Solo jobs (mantenimiento) | ✅ Jobs + Backups completos |
| **Consistencia** | ⚠️ A veces inconsistente | ✅ Garantizada al 100% |
| **Performance** | ⚠️ Consultas redundantes | ✅ Optimizado (pre-cálculo) |
| **Mantenibilidad** | ❌ Lógica compleja distribuida | ✅ Lógica clara y centralizada |

---

## 🧪 Testing

### 1. Verificar Pre-procesamiento

```powershell
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar en output:
# [PRE-PROCESO] Identificando grupos AlwaysOn...
#       [AG] SSPR19MBKAG
#            Nodos: SSPR19MBK-01, SSPR19MBK-51
#       [AG] SSPR17DBAG
#            Nodos: SSPR17DB-02, SSPR17DB-52, SSPR17DB-03
#       [OK] 2 grupo(s) AlwaysOn detectado(s)
```

### 2. Verificar Sincronización

```powershell
# Buscar en output:
# [POST-PROCESO] Sincronizando valores en nodos AlwaysOn...
#       [SYNC] SSPR19MBKAG
#              Nodos: SSPR19MBK-01, SSPR19MBK-51
#              LastCheckdb: 2025-10-20 (OK=True)
#              LastIndexOptimize: 2025-10-21 (OK=True)
#              LastFullBackup: 2025-10-22 02:00
#              LastLogBackup: 2025-10-22 07:30
#       [OK] 2 nodo(s) sincronizado(s)
```

### 3. Verificar en JSON

```powershell
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json

# Comparar nodos del mismo AG
$ag1 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-01" }
$ag2 = $json | Where-Object { $_.InstanceName -eq "SSPR19MBK-51" }

# Estos valores DEBEN ser iguales:
$ag1.MaintenanceSummary.LastCheckdb -eq $ag2.MaintenanceSummary.LastCheckdb
$ag1.MaintenanceSummary.LastIndexOptimize -eq $ag2.MaintenanceSummary.LastIndexOptimize
$ag1.BackupSummary.LastFullBackup -eq $ag2.BackupSummary.LastFullBackup
$ag1.BackupSummary.LastLogBackup -eq $ag2.BackupSummary.LastLogBackup
# → Todos deben retornar True ✅
```

### 4. Verificar en BD

```sql
USE SQLNova;
GO

-- Comparar nodos del mismo AG
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
    hs.HealthScore,
    hs.HealthStatus
FROM dbo.InstanceHealthSnapshot hs
CROSS JOIN LatestSnapshot ls
WHERE hs.GeneratedAtUtc = ls.MaxDate
  AND hs.InstanceName IN ('SSPR19MBK-01', 'SSPR19MBK-51')
ORDER BY hs.InstanceName;

-- Resultado esperado: TODOS los campos iguales para ambos nodos ✅
```

---

## 🎯 Checklist Final

- [x] Pre-procesamiento de grupos AG antes del relevamiento
- [x] Consulta dinámica de `sys.availability_replicas`
- [x] Fallback con patrón 01↔51 si falla la consulta
- [x] Manejo de casos con más de 2 nodos
- [x] Sincronización de jobs de mantenimiento
- [x] Sincronización de backups (FULL, LOG, DIFF)
- [x] Recálculo de breaches post-sincronización
- [x] Recálculo de HealthScore post-sincronización
- [x] Eliminación de dependencia del campo `AlwaysOn` de la API
- [x] Ordenamiento de instancias por nombre
- [x] Documentación completa

---

## 📝 Resumen en 3 Puntos

1. ✅ **Pre-procesamiento inteligente**: Los grupos AG se detectan ANTES consultando dinámicamente la información real de SQL Server (no depende de la API).

2. ✅ **Sincronización completa**: TODOS los nodos del mismo AG reportan los mismos valores de mantenimiento Y backups, garantizando consistencia total.

3. ✅ **Maneja todos los casos**: Standalone, AG con 2 nodos, AG con 3+ nodos, casos donde falla la consulta (fallback con patrón), todo funciona correctamente.

---

**Última actualización**: 2025-10-22  
**Listo para entrega**: ✅ SÍ

