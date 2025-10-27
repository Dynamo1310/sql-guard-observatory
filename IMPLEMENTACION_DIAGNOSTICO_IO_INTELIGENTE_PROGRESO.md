# 🧠 Implementación: Diagnóstico Inteligente de I/O - PROGRESO

## 📊 Estado: 80% COMPLETADO (8/10 TODOs) ✅

---

## ✅ COMPLETADO

### ✅ 1. Collector de Discos Actualizado

**Archivo:** `scripts/RelevamientoHealthScore_Discos.ps1`

**Cambios:**
- ✅ Función `Get-DiskMediaType()` para obtener tipo de disco físico (HDD/SSD/NVMe) via PowerShell remoting
- ✅ Métricas de carga de I/O: Page Reads/Writes per sec, Lazy Writes, Checkpoint Pages, Batch Requests
- ✅ Análisis de competencia por disco: cuántas DBs y archivos por volumen
- ✅ Flags de rol: IsTempDBDisk, IsDataDisk, IsLogDisk
- ✅ JSON enriquecido con MediaType, BusType, HealthStatus, OperationalStatus, DatabaseCount, FileCount

### ✅ 2. Collector de TempDB Actualizado

**Archivo:** `scripts/RelevamientoHealthScore_ConfiguracionTempdb.ps1`

**Cambios:**
- ✅ Nueva propiedad `TempDBMountPoint` para relacionar con datos de disco
- ✅ Query modificado para obtener el MountPoint de TempDB
- ✅ Guardado de TempDBMountPoint en la base de datos

### ✅ 3. Migración SQL Creada

**Archivo:** `supabase/migrations/20250127_io_diagnostics.sql`

**Cambios:**
- ✅ Agregadas columnas a `InstanceHealth_Discos`:
  - PageLifeExpectancy, PageReadsPerSec, PageWritesPerSec
  - LazyWritesPerSec, CheckpointPagesPerSec, BatchRequestsPerSec
- ✅ Agregada columna a `InstanceHealth_ConfiguracionTempdb`:
  - TempDBMountPoint
- ✅ Agregadas columnas a `InstanceHealth_Score`:
  - TempDBIODiagnosis, TempDBIOSuggestion, TempDBIOSeverity
- ✅ Índices creados para optimizar JOINs
- ✅ Vista `vw_TempDB_IO_Diagnosis` para diagnóstico rápido

### ✅ 4. Consolidador Actualizado

**Archivo:** `scripts/RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`

**Cambios:**
- ✅ Nueva función `Get-IODiagnosisForTempDB()` con lógica de diagnóstico inteligente
- ✅ Parseo de VolumesJson para obtener tipo de disco de TempDB
- ✅ Diagnóstico por casos:
  - Hardware degradado/fallando
  - HDD con latencia alta
  - SSD con latencia alta (por sobrecarga, presión de memoria, storage compartido)
  - Tipo desconocido (inferencia por latencia)
- ✅ Llamado a diagnóstico en el flujo principal
- ✅ Guardado de diagnóstico en `InstanceHealth_Score`

### ✅ 5. Backend (C#) Actualizado

**Archivos:**
- `SQLGuardObservatory.API/Models/HealthScoreV3/InstanceHealthDiscos.cs`
- `SQLGuardObservatory.API/Models/HealthScoreV3/InstanceHealthConfiguracionTempdb.cs`
- `SQLGuardObservatory.API/Models/HealthScoreV3/InstanceHealthScore.cs`

**Cambios:**
- ✅ `InstanceHealthDiscos`: Agregadas 6 propiedades (PageLifeExpectancy, PageReadsPerSec, etc.)
- ✅ `InstanceHealthConfiguracionTempdb`: Agregada propiedad `TempDBMountPoint`
- ✅ `InstanceHealthScore`: Agregadas 3 propiedades (TempDBIODiagnosis, TempDBIOSuggestion, TempDBIOSeverity)

---

## 🚧 EN PROGRESO

### 🚧 6. Frontend (React/TypeScript)

**Archivo:** `src/pages/HealthScore.tsx`

**Pendiente:**
- Actualizar interfaces TypeScript en `src/services/api.ts`
- Agregar sección de diagnóstico inteligente en la UI de TempDB
- Mostrar tipo de disco, health status, y sugerencias específicas
- Mostrar métricas de carga (PageWritesPerSec, LazyWritesPerSec)

---

## ⏳ PENDIENTE

### ⏳ 7. Testing

**Pendiente:**
- Ejecutar migración SQL en base de datos
- Ejecutar collectors actualizados
- Validar que el diagnóstico sea correcto en 5 instancias de prueba
- Verificar que el frontend muestre correctamente el diagnóstico

---

## 📝 Ejemplos de Diagnóstico Generado

### Ejemplo 1: HDD Lento
```
🧠 Diagnóstico: Disco HDD mecánico (lento por naturaleza)
🐌 TempDB en disco HDD (111ms escritura). Migrar a SSD/NVMe urgentemente

Tipo disco: HDD (SATA)
```

### Ejemplo 2: SSD Sobrecargado
```
🧠 Diagnóstico: Storage compartido con muchas DBs (15 DBs)
🚨 SSD con 98ms (compartido con 15 DBs). 
   Mover TempDB a disco dedicado o reducir competencia
   
Tipo disco: SSD (iSCSI)
```

### Ejemplo 3: Presión de Memoria
```
🧠 Diagnóstico: Presión de memoria generando lazy writes (150/s)
🚨 Alta escritura por presión de memoria (87ms, 150 lazy writes/s). 
   Revisar PLE y considerar más RAM
   
Tipo disco: SSD (SATA)
Lazy Writes: 150/s ⚠️
```

### Ejemplo 4: Hardware Degradado
```
🧠 Diagnóstico: Hardware degradado o fallando
🚨 El disco físico reporta problemas de hardware. 
   Revisar SMART, RAID, o reemplazar disco urgentemente
   
Tipo disco: SSD (SAS)
Estado: Warning ⚠️
```

---

## 🔧 Arquitectura Final

```
┌─────────────────────────────────────────────────────────┐
│  Collector de Discos (cada 10 min)                     │
│  ─────────────────────────────────────────────────────  │
│  • Tipo de disco (HDD/SSD/NVMe)                         │
│  • Health Status (Healthy/Warning/Unhealthy)            │
│  • Métricas de carga (Page Writes, Lazy Writes)        │
│  • Análisis de competencia (DBs por disco)             │
│  • Flags: IsTempDBDisk, IsDataDisk, IsLogDisk          │
└─────────────────────────────────────────────────────────┘
                        ↓ Guarda en
┌─────────────────────────────────────────────────────────┐
│  InstanceHealth_Discos                                  │
│  ─────────────────────────────────────────────────────  │
│  • VolumesJson (enriquecido)                            │
│  • PageLifeExpectancy, PageWritesPerSec                 │
│  • LazyWritesPerSec, CheckpointPagesPerSec              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Collector de TempDB (cada 30 min)                     │
│  ─────────────────────────────────────────────────────  │
│  • TempDBAvgWriteLatencyMs                              │
│  • TempDBMountPoint ← NUEVO                             │
│  • TempDBContentionScore                                │
└─────────────────────────────────────────────────────────┘
                        ↓ Guarda en
┌─────────────────────────────────────────────────────────┐
│  InstanceHealth_ConfiguracionTempdb                    │
│  ─────────────────────────────────────────────────────  │
│  • TempDBMountPoint                                     │
│  • Latencias, contención, configuración                 │
└─────────────────────────────────────────────────────────┘

                        ↓ Consolidador hace JOIN
┌─────────────────────────────────────────────────────────┐
│  Consolidador (cada 2-5 min)                            │
│  ─────────────────────────────────────────────────────  │
│  • JOIN TempDB + Discos ON MountPoint                   │
│  • Parsea VolumesJson → Tipo de disco                   │
│  • Función Get-IODiagnosisForTempDB()                   │
│    - Analiza tipo de disco                              │
│    - Analiza latencias                                  │
│    - Analiza carga (Lazy Writes)                        │
│    - Analiza competencia (cuántas DBs)                  │
│    - Genera diagnóstico específico                      │
└─────────────────────────────────────────────────────────┘
                        ↓ Guarda en
┌─────────────────────────────────────────────────────────┐
│  InstanceHealth_Score                                   │
│  ─────────────────────────────────────────────────────  │
│  • TempDBIODiagnosis (texto del problema)               │
│  • TempDBIOSuggestion (acción recomendada)              │
│  • TempDBIOSeverity (OK/LOW/MEDIUM/HIGH/CRITICAL)       │
└─────────────────────────────────────────────────────────┘
                        ↓ API expone
┌─────────────────────────────────────────────────────────┐
│  Frontend (React)                                       │
│  ─────────────────────────────────────────────────────  │
│  • Muestra diagnóstico inteligente en UI de TempDB      │
│  • Sección "🧠 Diagnóstico" con problema y sugerencia   │
│  • Tipo de disco con color (HDD naranja, SSD verde)     │
│  • Health Status con alertas (Warning/Unhealthy)        │
│  • Métricas de carga (Lazy Writes con badge)            │
└─────────────────────────────────────────────────────────┘
```

---

## 📋 Próximos Pasos

1. ✅ **Actualizar Frontend** (EN PROGRESO)
   - Modificar `src/services/api.ts` (interfaces TypeScript)
   - Modificar `src/pages/HealthScore.tsx` (UI de diagnóstico)

2. ⏳ **Testing**
   - Ejecutar migración SQL
   - Ejecutar collectors
   - Validar diagnóstico en instancias reales

3. ✅ **Documentación** (COMPLETADO)
   - Este documento resume todo el progreso

---

## ⚠️ Consideraciones Importantes

### PowerShell Remoting
- **Requiere:** WinRM habilitado en los servidores
- **Fallback:** Si falla, el tipo de disco queda como "Unknown"
- **Inferencia:** El consolidador puede inferir por latencia (<5ms = SSD, >15ms = HDD)

### Performance
- **Collector de Discos:** Puede ser ~1-2 segundos más lento por llamada a `Get-DiskMediaType()`
- **Cache:** Considerar cachear tipo de disco (no cambia frecuentemente)

### Compatibilidad
- **SQL Server:** Funciona en SQL 2008+ (con fallback para columnas inexistentes)
- **PowerShell:** Requiere PowerShell 5.1+

---

**🎯 Progreso: 80% COMPLETADO**

✅ Collectors actualizados  
✅ Migración SQL creada  
✅ Consolidador con diagnóstico inteligente  
✅ Backend (C#) actualizado  
🚧 Frontend en progreso  
⏳ Testing pendiente  

