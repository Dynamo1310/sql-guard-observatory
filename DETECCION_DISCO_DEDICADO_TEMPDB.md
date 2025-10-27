# 🔍 Detección de Disco Dedicado para TempDB

## ✅ ¿Cómo lo Detecta?

El sistema detecta si TempDB está en disco dedicado analizando:

```
DatabaseCount = 1  →  TempDB en disco DEDICADO ✅
DatabaseCount > 1  →  TempDB en disco COMPARTIDO ⚠️
```

### **Fuente de Datos:**

1. **Collector de Discos** (`RelevamientoHealthScore_Discos.ps1`):
   - Query: `SELECT COUNT(DISTINCT mf.database_id) AS DatabaseCount FROM sys.master_files ... GROUP BY volume_mount_point`
   - Resultado guardado en `VolumesJson` → `DatabaseCount`

2. **Collector de TempDB** (`RelevamientoHealthScore_ConfiguracionTempdb.ps1`):
   - Query: Obtiene `TempDBMountPoint` (ej: `E:\`)

3. **Consolidador** (`RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`):
   - JOIN: Relaciona TempDB con Discos por `MountPoint`
   - Lógica: `IsDedicated = (DatabaseCount == 1)`

---

## 📊 Ejemplos de Diagnóstico

### **Caso 1: TempDB en Disco Dedicado (OK)**
```
📀 Tipo: SSD (SATA)
📊 DBs en disco: 1 (DEDICADO) ✅
⏱️ Latencia escritura: 4ms ✅
```
**Diagnóstico:** ✅ OK

---

### **Caso 2: TempDB en Disco Dedicado (con problemas)**
```
📀 Tipo: SSD (SAS)
📊 DBs en disco: 1 (DEDICADO) ✅
⏱️ Latencia escritura: 112ms 🚨

🧠 Diagnóstico: TempDB en disco DEDICADO pero con latencia muy alta

🚨 TempDB en disco DEDICADO SSD pero con 112ms. 
   Revisar: RAID cache, BBU, storage backend, firmware, o problemas de hardware
```

---

### **Caso 3: TempDB en Disco Compartido (con problemas)**
```
📀 Tipo: SSD (iSCSI)
📊 DBs en disco: 8 (COMPARTIDO) ⚠️
   - tempdb
   - DB1
   - DB2
   - DB3
   - DB4
   - DB5
   - DB6
   - DB7
⏱️ Latencia escritura: 98ms 🚨

🧠 Diagnóstico: TempDB en disco COMPARTIDO con 8 DBs

🚨 TempDB compartiendo disco SSD con 8 bases de datos (98ms). 
   Mover TempDB a disco DEDICADO urgentemente
```

---

### **Caso 4: TempDB Compartido (latencia moderada)**
```
📀 Tipo: SSD (SATA)
📊 DBs en disco: 3 (COMPARTIDO) ⚠️
   - tempdb
   - DB_Reports
   - DB_Archive
⏱️ Latencia escritura: 67ms ⚠️

🧠 Diagnóstico: TempDB en disco COMPARTIDO con 3 DBs

⚠️ TempDB compartiendo disco (67ms) con 3 bases de datos. 
   Considerar mover a disco DEDICADO
```

---

### **Caso 5: Disco Dedicado + Presión de Memoria**
```
📀 Tipo: SSD (SATA)
📊 DBs en disco: 1 (DEDICADO) ✅
⏱️ Latencia escritura: 87ms 🚨
💾 Lazy Writes: 150/s 🚨

🧠 Diagnóstico: Presión de memoria generando lazy writes (150/s)

🚨 TempDB en disco DEDICADO con alta escritura por presión de memoria 
   (87ms, 150 lazy writes/s). Revisar PLE y considerar más RAM
```

---

## 🎯 Lógica de Priorización

### **1. Si es disco COMPARTIDO + latencia alta (>50ms):**
→ **Sugerencia:** Mover TempDB a disco DEDICADO

### **2. Si es disco DEDICADO + latencia alta (>50ms):**
→ **Sugerencia:** Revisar problemas de hardware/configuración

### **3. Si es disco DEDICADO + Lazy Writes altos:**
→ **Sugerencia:** Revisar presión de memoria (no es problema de disco)

---

## 🔧 ¿Cómo se Usa en el Código?

### **Consolidador** (`Get-IODiagnosisForTempDB`):

```powershell
# Detectar si TempDB está en disco dedicado
$diagnosis.IsDedicated = ($diagnosis.DatabaseCount -eq 1)

# Diagnosticar causa específica
if (-not $diagnosis.IsDedicated -and $diagnosis.DatabaseCount -gt 5) {
    # TempDB compartido con muchas DBs
    $diagnosis.Suggestion = "Mover TempDB a disco DEDICADO urgentemente"
}
elseif ($diagnosis.IsDedicated) {
    # TempDB dedicado con problemas
    $diagnosis.Suggestion = "Revisar: RAID cache, BBU, storage backend, firmware"
}
```

---

## 📋 Ventajas de Esta Detección

### ✅ **Sugerencias Específicas**
- Si está compartido → "Mover a disco dedicado"
- Si está dedicado → "Revisar hardware/configuración"

### ✅ **Evita Recomendaciones Incorrectas**
- NO sugiere "mover a disco dedicado" si ya está dedicado
- NO sugiere "problema de hardware" si el problema es competencia con otras DBs

### ✅ **Identifica Causa Raíz**
- Disco compartido → Competencia por I/O
- Disco dedicado + latencia alta → Hardware/configuración
- Disco dedicado + Lazy Writes → Presión de memoria

---

## 🧪 Cómo Probarlo

### **1. Query Manual:**
```sql
-- Ver cuántas DBs hay en cada disco
SELECT 
    vs.volume_mount_point AS MountPoint,
    COUNT(DISTINCT mf.database_id) AS DatabaseCount,
    STRING_AGG(DB_NAME(mf.database_id), ', ') AS DatabaseList
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
GROUP BY vs.volume_mount_point
ORDER BY MountPoint;
```

### **2. Ver datos recolectados:**
```sql
-- Ver VolumesJson parseado
SELECT 
    InstanceName,
    CollectedAtUtc,
    VolumesJson
FROM InstanceHealth_Discos
WHERE InstanceName = 'TU_INSTANCIA'
ORDER BY CollectedAtUtc DESC;
```

### **3. Ver diagnóstico generado:**
```sql
-- Ver diagnóstico de TempDB
SELECT 
    InstanceName,
    CollectedAtUtc,
    TempDBIODiagnosis,
    TempDBIOSuggestion,
    TempDBIOSeverity
FROM InstanceHealth_Score
WHERE InstanceName = 'TU_INSTANCIA'
ORDER BY CollectedAtUtc DESC;
```

---

## 📝 Resumen

| Situación | DatabaseCount | IsDedicated | Diagnóstico |
|-----------|---------------|-------------|-------------|
| TempDB sola en E:\ | 1 | ✅ True | Disco dedicado |
| TempDB + 5 DBs en E:\ | 6 | ❌ False | Disco compartido → Sugerir mover |
| TempDB + 2 DBs en E:\ | 3 | ❌ False | Disco compartido → Monitorear |

**🎯 El sistema ahora diferencia claramente entre:**
- ✅ Disco dedicado con problemas de hardware
- ⚠️ Disco compartido con competencia por I/O
- 🚨 Presión de memoria afectando I/O (independiente de si es dedicado)

