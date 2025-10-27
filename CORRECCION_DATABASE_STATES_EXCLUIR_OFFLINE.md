# Corrección: Excluir Databases OFFLINE del Monitoreo de Estados

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_DatabaseStates.ps1`

## 📋 Requerimiento

Las bases de datos OFFLINE NO deben capturarse en el script de Database States, ya que pueden estar offline por mantenimiento intencional, migraciones, o configuraciones deliberadas que no representan un problema de salud.

## 🔧 Cambios Implementados

### 1. Query SQL Modificada

**Antes**:
```sql
SELECT 
    d.name AS DatabaseName,
    d.state_desc AS State,
    ...
    CASE 
        WHEN d.state_desc IN ('OFFLINE', 'SUSPECT', 'EMERGENCY', 'RECOVERY_PENDING') THEN 1
        ...
    END AS IsProblematic
FROM sys.databases d
WHERE d.database_id > 4
ORDER BY IsProblematic DESC, State;
```

**Después**:
```sql
-- Database States (excluye OFFLINE - puede ser intencional por mantenimiento)
SELECT 
    d.name AS DatabaseName,
    d.state_desc AS State,
    ...
    CASE 
        WHEN d.state_desc IN ('SUSPECT', 'EMERGENCY', 'RECOVERY_PENDING') THEN 1
        ...
    END AS IsProblematic
FROM sys.databases d
WHERE d.database_id > 4
  AND d.state_desc <> 'OFFLINE'  -- Excluir bases offline (mantenimiento intencional)
ORDER BY IsProblematic DESC, State;
```

### 2. Lógica de Procesamiento Actualizada

```powershell
# OFFLINE se excluye - no se captura (puede ser mantenimiento intencional)
$offlineCount = 0  # Siempre será 0
$suspectCount = ($dbStates | Where-Object { $_.State -eq 'SUSPECT' }).Count
$emergencyCount = ($dbStates | Where-Object { $_.State -eq 'EMERGENCY' }).Count
$recoveryPendingCount = ($dbStates | Where-Object { $_.State -eq 'RECOVERY_PENDING' }).Count
...
```

### 3. Cálculo de Bases Problemáticas

**Antes**:
```powershell
$totalProblematic = $dbStatus.OfflineCount + $dbStatus.SuspectCount + $dbStatus.EmergencyCount + $dbStatus.RecoveryPendingCount
```

**Después**:
```powershell
$totalProblematic = $dbStatus.SuspectCount + $dbStatus.EmergencyCount + $dbStatus.RecoveryPendingCount
```

### 4. Mensajes de Salida Actualizados

**Antes**:
```
   ✅ SSPR17MON-01 - Offline:2 Suspect:0 Emergency:0 SuspectPages:0
```

**Después**:
```
   ✅ SSPR17MON-01 - Suspect:0 Emergency:0 RecovPending:0 SuspectPages:0
```

### 5. Resumen Final Actualizado

**Antes**:
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DATABASE STATES                            ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     150                            ║
║  DBs Offline:          12                             ║
║  DBs Suspect:          0                              ║
║  DBs Emergency:        0                              ║
║  Suspect Pages:        0                              ║
╚═══════════════════════════════════════════════════════╝
```

**Después**:
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DATABASE STATES                            ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     150                            ║
║  DBs Suspect:          0                              ║
║  DBs Emergency:        0                              ║
║  DBs Recovery Pending: 0                              ║
║  Suspect Pages:        0                              ║
║                                                       ║
║  ℹ️  OFFLINE DBs se excluyen (mantenimiento OK)      ║
╚═══════════════════════════════════════════════════════╝
```

### 6. Documentación Actualizada

**Antes**:
```
Métricas clave:
- Databases Offline/Suspect/Emergency
- Recovery Pending
...

Scoring (0-100):
- 100 pts: Todas las DBs ONLINE, 0 suspect pages
- 80 pts: 1 DB no crítica offline por mantenimiento planeado
- 0 pts: Alguna DB crítica OFFLINE/SUSPECT/EMERGENCY
```

**Después**:
```
Métricas clave:
- Databases Suspect/Emergency (CRÍTICOS)
- Recovery Pending
...

NOTA: Databases OFFLINE se excluyen (pueden estar offline por mantenimiento intencional)

Scoring (0-100):
- 100 pts: Todas las DBs en estado OK, 0 suspect pages
- 0 pts: Alguna DB crítica SUSPECT/EMERGENCY
```

## 📊 Estados Capturados vs Excluidos

| Estado | ¿Se Captura? | Razón |
|--------|--------------|-------|
| **OFFLINE** | ❌ NO | Mantenimiento intencional, migraciones, configuración deliberada |
| **SUSPECT** | ✅ SÍ | Estado crítico - corrupción o error grave |
| **EMERGENCY** | ✅ SÍ | Estado crítico - base en modo emergencia |
| **RECOVERY_PENDING** | ✅ SÍ | Problema de recuperación que necesita atención |
| **RESTORING** | ✅ SÍ | Proceso de restore en curso (puede ser normal) |
| **SINGLE_USER** | ✅ SÍ | Acceso restringido (puede indicar mantenimiento) |
| **ONLINE** | ✅ SÍ | Estado normal (se captura pero no es problemático) |

## 🎯 Impacto en Scoring

### Antes
- OfflineCount afectaba el scoring
- Una DB offline reducía el score (80 pts)
- Múltiples DBs offline podían dar score muy bajo

### Después
- OfflineCount siempre es 0 (no se captura)
- El scoring se centra en estados realmente críticos:
  - **SUSPECT/EMERGENCY**: 0 puntos (crítico)
  - **RECOVERY_PENDING**: 40 puntos
  - **SINGLE_USER/RESTORING**: 60 puntos
  - **Todas OK**: 100 puntos

## ✅ Beneficios

1. **Reduce falsos positivos**: Bases offline por mantenimiento planeado no bajan el score
2. **Enfoque en problemas reales**: Solo se alertan estados verdaderamente críticos
3. **Mejor precisión**: El Health Score refleja la salud real, no configuraciones intencionales
4. **Menos ruido**: DBA teams no reciben alertas innecesarias por bases offline conocidas

## 📝 Casos de Uso Reales

### Escenario 1: Migración de Base de Datos
```
Situación: 3 bases en OFFLINE mientras se migran a otro servidor
Antes: Score bajo por "databases offline"
Después: No afecta el score - es mantenimiento planeado
```

### Escenario 2: Bases de Desarrollo Pausadas
```
Situación: Ambiente de desarrollo con 5 bases en OFFLINE para ahorrar recursos
Antes: Alertas constantes de "databases offline"
Después: No se generan alertas - es configuración intencional
```

### Escenario 3: Database Suspect Real
```
Situación: 1 base en SUSPECT por corrupción
Antes: Se captura (junto con las offline)
Después: Se captura (score 0) - requiere atención inmediata
```

## 🔍 Validación

### Query para verificar databases excluidas
```sql
-- Ver databases OFFLINE que ya NO se capturan
SELECT 
    name,
    state_desc,
    create_date,
    compatibility_level
FROM sys.databases
WHERE state_desc = 'OFFLINE'
  AND database_id > 4
ORDER BY name;
```

### Query para verificar lo que SÍ se captura
```sql
-- Ver databases que SÍ se capturan (problemáticas)
SELECT 
    name,
    state_desc,
    user_access_desc,
    CASE 
        WHEN state_desc IN ('SUSPECT', 'EMERGENCY', 'RECOVERY_PENDING') THEN 'CRÍTICO'
        WHEN user_access_desc = 'SINGLE_USER' THEN 'ADVERTENCIA'
        WHEN state_desc = 'RESTORING' THEN 'EN PROCESO'
        ELSE 'OK'
    END AS Severidad
FROM sys.databases
WHERE database_id > 4
  AND state_desc <> 'OFFLINE'
ORDER BY 
    CASE 
        WHEN state_desc IN ('SUSPECT', 'EMERGENCY') THEN 1
        WHEN state_desc = 'RECOVERY_PENDING' THEN 2
        WHEN user_access_desc = 'SINGLE_USER' THEN 3
        ELSE 4
    END;
```

## 🧪 Testing

### 1. Verificar que NO captura OFFLINE
```powershell
# Ejecutar script
.\RelevamientoHealthScore_DatabaseStates.ps1

# El resumen debe mostrar:
║  ℹ️  OFFLINE DBs se excluyen (mantenimiento OK)      ║
```

### 2. Verificar tabla en SQLNova
```sql
SELECT 
    InstanceName,
    OfflineCount,  -- Debe ser 0 para todas
    SuspectCount,
    EmergencyCount,
    RecoveryPendingCount,
    CollectedAtUtc
FROM dbo.InstanceHealth_DatabaseStates
WHERE CollectedAtUtc >= DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY CollectedAtUtc DESC;
```

### 3. Verificar con instancia que tiene DBs OFFLINE
```sql
-- En una instancia con DBs offline, verificar que no aparezcan
USE SQLNova;
GO

SELECT 
    ids.InstanceName,
    ids.OfflineCount,  -- Debe ser 0
    ids.DatabaseStateDetails,  -- No debe contener DBs offline
    ids.CollectedAtUtc
FROM dbo.InstanceHealth_DatabaseStates ids
WHERE ids.InstanceName = 'TU_INSTANCIA_CON_OFFLINE'
  AND ids.CollectedAtUtc >= DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY ids.CollectedAtUtc DESC;
```

## 📊 Impacto en Tablas

### Tabla: InstanceHealth_DatabaseStates

**Campo afectado**:
- `OfflineCount`: Siempre será 0 después de este cambio
- `DatabaseStateDetails`: Ya no incluirá bases en estado OFFLINE

**Campos sin cambios**:
- `SuspectCount`
- `EmergencyCount`
- `RecoveryPendingCount`
- `SingleUserCount`
- `RestoringCount`
- `SuspectPageCount`

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_DatabaseStates.ps1` (modificado)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (tabla `InstanceHealth_DatabaseStates`)
- `HEALTH_SCORE_V3_100_PUNTOS.md` (scoring de Database States)

## 📌 Notas Importantes

1. **Campo OfflineCount se mantiene**: Aunque siempre es 0, el campo se mantiene en la tabla por compatibilidad
2. **Histórico no se modifica**: Los datos históricos con OfflineCount > 0 se mantienen
3. **Scoring ajustado**: El scoring debe actualizarse para no considerar OfflineCount
4. **Documentación coherente**: Actualizar toda la documentación que mencione "databases offline"

---

**Próximos pasos**: 
1. Ejecutar script en producción
2. Verificar que OfflineCount siempre es 0
3. Actualizar lógica de scoring en el cálculo del Health Score
4. Actualizar documentación de usuario si es necesario

