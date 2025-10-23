# Corrección: Backups y AlwaysOn

## 📋 Resumen

**Fecha**: 2025-10-22  
**Archivo modificado**: `scripts/RelevamientoHealthScoreMant.ps1`

---

## 🎯 Problemas Detectados

### Problema 1: Backups no se consultaban en nodos AlwaysOn

**Síntoma reportado**:
> "Sigue sin guardarme el estado de los backups"

**Causa**:
- El script consultaba backups solo en el nodo local
- En AlwaysOn, los backups se toman típicamente en **UN SOLO nodo** (usualmente el secundario)
- Si consultas el nodo primario y los backups están en el secundario → aparecen como "sin backups"

**Ejemplo del problema**:
```
SSPR19MBK-01 (Primary):
  LastFullBackup: NULL  ❌
  LastLogBackup: NULL   ❌
  Breaches: ["No hay backups"]

SSPR19MBK-51 (Secondary):
  LastFullBackup: 2025-10-22 02:00:00  ← Los backups están aquí
  LastLogBackup: 2025-10-22 07:30:00   ← Los backups están aquí
  Breaches: []
```

---

### Problema 2: Umbrales incorrectos

**Umbrales anteriores**:
- ❌ FULL backup: < 24 horas
- ❌ LOG backup: < 1 hora

**Umbrales correctos**:
- ✅ FULL backup: < 25 horas
- ✅ LOG backup: < 2 horas

---

## ✅ Soluciones Implementadas

### 1. Consultar backups en todos los nodos del AG

Similar a la lógica de jobs de mantenimiento, ahora el script:
1. Consulta backups en el nodo local
2. Si es AlwaysOn → consulta en todos los nodos del AG
3. Toma el backup **MÁS RECIENTE** entre todos los nodos
4. Genera breaches basándose en ese valor

---

### 2. Actualizar umbrales de SLA

| Tipo | Antes | Ahora | Razón |
|------|-------|-------|-------|
| **FULL** | 24h | **25h** | Margen para ventanas de mantenimiento |
| **LOG** | 1h | **2h** | Margen para job schedules |

---

## 🔧 Implementación Técnica

### Cambio 1: Consultar backups en réplicas del AG

**Ubicación**: Líneas 463-575

```powershell
# Si es AlwaysOn, consultar backups en otros nodos del AG
if ($isAlwaysOnEnabled -and $replicaServers.Count -gt 0) {
    Write-Verbose "Consultando backups en réplicas del AG..."
    
    foreach ($replicaServer in $replicaServers) {
        try {
            $replicaParams = @{
                ServerInstance = $replicaServer
                Query = $backupQuery  # Misma consulta que el nodo local
                QueryTimeout = $TimeoutSec
                ConnectionTimeout = $TimeoutSec
                TrustServerCertificate = $true
                ErrorAction = 'Stop'
            }
            
            $replicaBackups = Invoke-Sqlcmd @replicaParams
            
            foreach ($db in $replicaBackups) {
                # FULL backup
                if ($db.LastFullBackup) {
                    $fullDate = [datetime]$db.LastFullBackup
                    
                    # ✅ Actualizar si es más reciente
                    if ($null -eq $result.LastFullBackup -or $fullDate -gt $result.LastFullBackup) {
                        $result.LastFullBackup = $fullDate
                    }
                }
                
                # LOG backup
                if ($db.LastLogBackup) {
                    $logDate = [datetime]$db.LastLogBackup
                    
                    # ✅ Actualizar si es más reciente
                    if ($null -eq $result.LastLogBackup -or $logDate -gt $result.LastLogBackup) {
                        $result.LastLogBackup = $logDate
                    }
                }
            }
            
        } catch {
            Write-Verbose "No se pudo consultar backups en réplica $replicaServer"
        }
    }
    
    # Recalcular breaches con los valores finales (más recientes)
    $finalBreaches = @()
    
    if ($result.LastFullBackup) {
        $ageHours = ((Get-Date) - $result.LastFullBackup).TotalHours
        if ($ageHours -gt 25) {  # ✅ Nuevo umbral
            $finalBreaches += "Último FULL backup tiene $([int]$ageHours) horas (SLA: 25h)"
        }
    } else {
        $finalBreaches += "No se encontró ningún FULL backup en el AG"
    }
    
    if ($result.LastLogBackup) {
        $ageHours = ((Get-Date) - $result.LastLogBackup).TotalHours
        if ($ageHours -gt 2) {  # ✅ Nuevo umbral
            $finalBreaches += "Último LOG backup tiene $([int]$ageHours) horas (SLA: 2h)"
        }
    } else {
        $finalBreaches += "No se encontró ningún LOG backup en el AG"
    }
    
    $result.BackupBreaches = $finalBreaches
}
```

---

### Cambio 2: Actualizar umbrales en validación local

**Línea 419**: FULL backup
```powershell
# ANTES
if ($ageHours -gt 24) {
    $result.BackupBreaches += "FULL de $dbName antiguo ($([int]$ageHours)h)"
}

# AHORA
if ($ageHours -gt 25) {  # ✅ 25 horas
    $result.BackupBreaches += "FULL de $dbName antiguo ($([int]$ageHours)h)"
}
```

**Línea 445**: LOG backup
```powershell
# ANTES
if ($ageHours -gt 1) {
    $result.BackupBreaches += "LOG de $dbName antiguo ($([int]$ageHours)h)"
}

# AHORA
if ($ageHours -gt 2) {  # ✅ 2 horas
    $result.BackupBreaches += "LOG de $dbName antiguo ($([int]$ageHours)h)"
}
```

---

## 📊 Flujo Completo: Backups en AlwaysOn

### Escenario: AG con backups en nodo secundario

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Procesar SSPR19MBK-01 (Primary)                             │
├─────────────────────────────────────────────────────────────────┤
│ a) Consultar msdb.dbo.backupset en nodo local (01)             │
│    → LastFullBackup: NULL                                       │
│    → LastLogBackup: NULL                                        │
│                                                                 │
│ b) Detectar AlwaysOn = "Enabled" (desde API)                   │
│                                                                 │
│ c) Identificar réplicas: SSPR19MBK-51                           │
│                                                                 │
│ d) Consultar msdb.dbo.backupset en SSPR19MBK-51                │
│    → LastFullBackup: 2025-10-22 02:00:00 ✅                     │
│    → LastLogBackup: 2025-10-22 07:30:00 ✅                      │
│                                                                 │
│ e) Comparar y tomar MÁS RECIENTE:                               │
│    result.LastFullBackup = 2025-10-22 02:00:00 (del nodo 51)   │
│    result.LastLogBackup = 2025-10-22 07:30:00 (del nodo 51)    │
│                                                                 │
│ f) Validar SLAs:                                                │
│    FULL: (ahora - 2025-10-22 02:00:00) = 5.5h < 25h ✅ OK       │
│    LOG:  (ahora - 2025-10-22 07:30:00) = 0.1h < 2h ✅ OK        │
│                                                                 │
│ g) Resultado: Breaches = []  (sin problemas)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 2. Procesar SSPR19MBK-51 (Secondary)                           │
├─────────────────────────────────────────────────────────────────┤
│ a) Consultar msdb.dbo.backupset en nodo local (51)             │
│    → LastFullBackup: 2025-10-22 02:00:00                       │
│    → LastLogBackup: 2025-10-22 07:30:00                        │
│                                                                 │
│ b) Detectar AlwaysOn = "Enabled"                               │
│                                                                 │
│ c) Identificar réplicas: SSPR19MBK-01                           │
│                                                                 │
│ d) Consultar msdb.dbo.backupset en SSPR19MBK-01                │
│    → LastFullBackup: NULL                                       │
│    → LastLogBackup: NULL                                        │
│                                                                 │
│ e) Comparar y tomar MÁS RECIENTE:                               │
│    result.LastFullBackup = 2025-10-22 02:00:00 (del nodo 51)   │
│    result.LastLogBackup = 2025-10-22 07:30:00 (del nodo 51)    │
│                                                                 │
│ f) Validar SLAs: mismo resultado que nodo 01 ✅                 │
│                                                                 │
│ g) Resultado: Breaches = []  (sin problemas)                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ 3. Post-proceso: Sync-AlwaysOnMaintenanceValues                │
├─────────────────────────────────────────────────────────────────┤
│ → Backups YA están sincronizados (ambos nodos tienen los       │
│   mismos valores porque se consultaron mutuamente)             │
│                                                                 │
│ → Solo sincroniza LastCheckdb y LastIndexOptimize              │
└─────────────────────────────────────────────────────────────────┘

RESULTADO FINAL EN BASE DE DATOS:
┌─────────────────┬───────────────────────┬───────────────────────┬──────────┐
│ InstanceName    │ LastFullBackup        │ LastLogBackup         │ Breaches │
├─────────────────┼───────────────────────┼───────────────────────┼──────────┤
│ SSPR19MBK-01    │ 2025-10-22 02:00:00   │ 2025-10-22 07:30:00   │ []       │
│ SSPR19MBK-51    │ 2025-10-22 02:00:00   │ 2025-10-22 07:30:00   │ []       │
└─────────────────┴───────────────────────┴───────────────────────┴──────────┘
                     ↑↑↑ IGUALES ✅           ↑↑↑ IGUALES ✅
```

---

## 🎯 Casos de Uso

### Caso 1: Backups en nodo secundario (típico)

**Setup**:
```
SSPR19MBK-01 (Primary): No hay backups locales
SSPR19MBK-51 (Secondary): Backups configurados aquí
  - LastFullBackup: 2025-10-22 02:00:00
  - LastLogBackup: 2025-10-22 07:30:00
```

**Resultado**:
```
Ambos nodos reportan:
  LastFullBackup: 2025-10-22 02:00:00 ✅
  LastLogBackup: 2025-10-22 07:30:00 ✅
  Breaches: []
```

---

### Caso 2: Backups distribuidos

**Setup**:
```
SSPR17DB-02: 
  - LastFullBackup: 2025-10-22 01:00:00
  - LastLogBackup: 2025-10-22 06:00:00

SSPR17DB-52:
  - LastFullBackup: 2025-10-22 02:00:00  ← Más reciente
  - LastLogBackup: 2025-10-22 07:00:00  ← Más reciente
```

**Resultado**:
```
Ambos nodos reportan:
  LastFullBackup: 2025-10-22 02:00:00 ✅ (del nodo 52)
  LastLogBackup: 2025-10-22 07:00:00 ✅ (del nodo 52)
```

---

### Caso 3: Backup FULL antiguo (breach)

**Setup**:
```
AG: Último FULL backup hace 26 horas
```

**Resultado**:
```
Ambos nodos reportan:
  LastFullBackup: 2025-10-21 05:00:00
  Breaches: ["Último FULL backup tiene 26 horas (SLA: 25h)"] ❌
  HealthScore: Reducido por breach
```

---

### Caso 4: Standalone (sin AlwaysOn)

**Setup**:
```
SQLTEST-01 (Standalone, AlwaysOn = "Disabled"):
  - LastFullBackup: 2025-10-22 00:00:00
  - LastLogBackup: 2025-10-22 07:00:00
```

**Resultado**:
```
Solo consulta nodo local (no busca réplicas):
  LastFullBackup: 2025-10-22 00:00:00 ✅
  LastLogBackup: 2025-10-22 07:00:00 ✅
  Breaches: []
```

---

## 📈 Tabla de SLAs

### Umbrales de Backups

| Tipo | SLA | Validación | Breach si |
|------|-----|------------|-----------|
| **FULL** | < 25 horas | `$ageHours -gt 25` | > 25 horas |
| **DIFF** | N/A | *(no se valida)* | - |
| **LOG** | < 2 horas | `$ageHours -gt 2` | > 2 horas |

### Ejemplos

| LastFullBackup | Edad | ¿Breach? |
|----------------|------|----------|
| Hace 20 horas | 20h | ✅ OK |
| Hace 24 horas | 24h | ✅ OK |
| Hace 25 horas | 25h | ✅ OK (en el límite) |
| Hace 26 horas | 26h | ❌ Breach |
| Hace 48 horas | 48h | ❌ Breach |

| LastLogBackup | Edad | ¿Breach? |
|---------------|------|----------|
| Hace 30 min | 0.5h | ✅ OK |
| Hace 1 hora | 1h | ✅ OK |
| Hace 2 horas | 2h | ✅ OK (en el límite) |
| Hace 3 horas | 3h | ❌ Breach |
| Hace 12 horas | 12h | ❌ Breach |

---

## 🧪 Testing

### Verificar en el Output del Script

```powershell
cd C:\Temp\Tobi
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar líneas como:
# Consultando backups en réplicas del AG...
#   Backup FULL más reciente en SSPR19MBK-51 : 10/22/2025 2:00:00 AM
#   Backup LOG más reciente en SSPR19MBK-51 : 10/22/2025 7:30:00 AM
```

### Verificar en JSON de salida

```powershell
$json = Get-Content .\InstanceHealth.json | ConvertFrom-Json

# Ver backups de nodos AG
$json | Where-Object { $_.InstanceName -like "SSPR19MBK-*" } | 
    Select-Object InstanceName, 
                  @{N='LastFull';E={$_.BackupSummary.LastFullBackup}},
                  @{N='LastLog';E={$_.BackupSummary.LastLogBackup}},
                  @{N='Breaches';E={$_.BackupSummary.Breaches.Count}}
```

**Resultado esperado**:
```
InstanceName    LastFull             LastLog              Breaches
------------    --------             -------              --------
SSPR19MBK-01    2025-10-22T02:00:00  2025-10-22T07:30:00  0
SSPR19MBK-51    2025-10-22T02:00:00  2025-10-22T07:30:00  0
                ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^
                IGUALES ✅            IGUALES ✅
```

### Verificar en Base de Datos

```sql
USE SQLNova;
GO

SELECT 
    InstanceName,
    JSON_VALUE(BackupJson, '$.LastFullBackup') AS LastFullBackup,
    JSON_VALUE(BackupJson, '$.LastLogBackup') AS LastLogBackup,
    JSON_QUERY(BackupJson, '$.Breaches') AS Breaches,
    HealthScore,
    GeneratedAtUtc
FROM dbo.InstanceHealthSnapshot
WHERE InstanceName IN ('SSPR19MBK-01', 'SSPR19MBK-51')
  AND GeneratedAtUtc = (SELECT MAX(GeneratedAtUtc) FROM dbo.InstanceHealthSnapshot)
ORDER BY InstanceName;
```

---

## 📝 Cambios Realizados

| Línea(s) | Cambio | Descripción |
|----------|--------|-------------|
| **419** | `> 24` → `> 25` | Umbral FULL backup (local) |
| **445** | `> 1` → `> 2` | Umbral LOG backup (local) |
| **463-575** | **NUEVO** | Consulta de backups en réplicas AG |
| **502** | `> 24` → `> 25` | Umbral FULL backup (réplicas) |
| **534** | `> 1` → `> 2` | Umbral LOG backup (réplicas) |
| **556** | `> 24` → `> 25` | Umbral FULL backup (validación final) |
| **566** | `> 1` → `> 2` | Umbral LOG backup (validación final) |

**Total**: ~115 líneas agregadas, 4 líneas modificadas

---

## ✅ Resumen

**Problema del usuario**:
> "Sigue sin guardarme el estado de los backups... Para el caso de los AlwaysOn, tené en cuenta que los backup se toman en un solo nodo, así que deberíamos hacer algo parecido a lo de los jobs para guardar el dato del que tenga el backup más reciente"

**Solución implementada**:
1. ✅ Consultar backups en TODOS los nodos del AG (igual que con jobs)
2. ✅ Tomar el backup MÁS RECIENTE entre todos los nodos
3. ✅ Ambos nodos del AG reportan los mismos valores
4. ✅ Umbrales corregidos: FULL < 25h, LOG < 2h

**Resultado**:
- ✅ Backups se detectan correctamente en AlwaysOn
- ✅ Nodos del mismo AG reportan valores idénticos
- ✅ SLAs ajustados a los requerimientos reales
- ✅ Standalone no se afectan (solo consultan local)

---

**Documentos relacionados**:
- `SINCRONIZACION_AG_POST_PROCESO.md` - Sincronización de mantenimiento
- `OPTIMIZACION_ALWAYSON_API.md` - Uso del campo AlwaysOn de la API
- `IMPLEMENTACION_HEALTHSCORE.md` - Documentación general

---

**Última actualización**: 2025-10-22

