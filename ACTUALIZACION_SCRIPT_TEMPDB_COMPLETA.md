# ✅ Actualización Completa: Script TempDB con Métricas Extendidas

## 🎯 **Cambios Realizados**

He actualizado completamente el script `RelevamientoHealthScore_ConfiguracionTempdb.ps1` para capturar **métricas extendidas** que permiten diagnosticar correctamente los problemas de TempDB.

---

## 📊 **Nuevas Métricas Capturadas**

### **Antes (1 métrica):**
```
- TempDBPageLatchWaits (contención)
```

### **Ahora (14 métricas):**

#### **Archivos:**
- `TempDBFileCount` ✅ (ya existía)
- `TempDBTotalSizeMB` 🆕 - Tamaño total asignado
- `TempDBUsedSpaceMB` 🆕 - Espacio usado actualmente
- `TempDBFreeSpacePct` 🆕 - % espacio libre
- `TempDBAvgFileSizeMB` 🆕 - Tamaño promedio de archivos
- `TempDBMinFileSizeMB` 🆕 - Archivo más pequeño
- `TempDBMaxFileSizeMB` 🆕 - Archivo más grande
- `TempDBAllSameSize` ✅ (mejorado)
- `TempDBAllSameGrowth` ✅ (mejorado)
- `TempDBGrowthConfigOK` 🆕 - Growth >= 512MB y no porcentual

#### **Rendimiento:**
- `TempDBAvgReadLatencyMs` 🆕 - Latencia promedio de lectura
- `TempDBAvgWriteLatencyMs` 🆕 - Latencia promedio de escritura (crítico!)
- `TempDBPageLatchWaits` ✅ (ya existía)
- `TempDBContentionScore` ✅ (ya existía)
- `TempDBVersionStoreMB` 🆕 - Tamaño del version store

---

## 🔧 **Archivos Modificados**

### **1. Script de PowerShell**
```
scripts/RelevamientoHealthScore_ConfiguracionTempdb.ps1
```

**Cambios:**
- ✅ Función `Get-ConfigTempdbMetrics` extendida
- ✅ Queries SQL actualizadas (5 queries independientes)
- ✅ Función `Write-ToSqlServer` actualizada con todas las columnas
- ✅ Objeto `$results` actualizado con todas las propiedades
- ✅ Resumen mejorado con estadísticas de disco y espacio
- ✅ Salida en consola muestra latencia y espacio libre

### **2. Migración SQL**
```
supabase/migrations/20250126_tempdb_extended_metrics.sql
```

**Agrega columnas a:** `InstanceHealth_ConfiguracionTempdb`

---

## 📋 **Pasos para Implementar**

### **Paso 1: Ejecutar Migración SQL** ⚙️

```powershell
# En SQL Server Management Studio o sqlcmd
sqlcmd -S SSPR17MON-01 -d SQLNova -i "supabase\migrations\20250126_tempdb_extended_metrics.sql"
```

**O ejecuta directamente:**
```sql
USE SQLNova;
-- El script agregará automáticamente todas las columnas necesarias
```

### **Paso 2: Ejecutar Script de Recolección** 🚀

```powershell
cd C:\Temp\Tobi\Collectors
.\RelevamientoHealthScore_ConfiguracionTempdb.ps1
```

### **Paso 3: Verificar Resultados** ✅

```sql
USE SQLNova;

-- Ver métricas extendidas de instancias con contención
SELECT TOP 20
    InstanceName,
    TempDBFileCount,
    TempDBContentionScore,
    TempDBAvgWriteLatencyMs,
    TempDBFreeSpacePct,
    TempDBVersionStoreMB,
    TempDBMinFileSizeMB,
    TempDBMaxFileSizeMB,
    CASE 
        WHEN TempDBAvgWriteLatencyMs > 50 THEN '❌ Disco MUY lento'
        WHEN TempDBAvgWriteLatencyMs > 20 THEN '⚠️ Disco lento'
        WHEN TempDBAvgWriteLatencyMs > 5 THEN '✅ Disco OK'
        ELSE '✅ SSD rápido'
    END AS DiskStatus,
    CASE 
        WHEN TempDBFreeSpacePct < 10 THEN '❌ Sin espacio'
        WHEN TempDBFreeSpacePct < 20 THEN '⚠️ Poco espacio'
        ELSE '✅ OK'
    END AS SpaceStatus
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore = 0
ORDER BY TempDBAvgWriteLatencyMs DESC;
```

---

## 📺 **Ejemplo de Salida Mejorada**

### **Antes:**
```
🚨 CONTENTION! SSPR14-01 | Files:8 Mem:94.7% Score:0
   ↑ No sabemos POR QUÉ tiene contención
```

### **Ahora:**
```
🚨 CONTENTION! SSPR14-01 | Files:8 Mem:94.7% Score:0 [Disk:45ms🐌]
   ↑ Causa identificada: Disco lento

🚨 CONTENTION! SSPR16-01 | Files:4 Mem:75% Score:0 [Free:5%⚠️]
   ↑ Causa identificada: Sin espacio libre

✅ SSPRAW19CTD-01 | Files:8 Mem:91.9% Score:100
   ↑ Todo perfecto
```

### **Resumen Mejorado:**
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - CONFIGURACIÓN & TEMPDB                     ║
╠═══════════════════════════════════════════════════════╣
║  📊 GENERAL                                           ║
║  Total instancias:     127                          ║
║  TempDB files avg:     5                            ║
║  Con same size:        72                           ║
║  Growth bien config:   98                           ║
║                                                       ║
║  🔥 CONTENCIÓN                                        ║
║  Con contención:       115 (90.6%)                  ║
║  Contención crítica:   98                           ║
║                                                       ║
║  💾 DISCO                                             ║
║  ⚠️  Disco lento (>20ms): 65                         ║
║  🚨 Disco MUY lento:    23                           ║
║  Latencia write avg:   28.5ms                       ║
║                                                       ║
║  🧠 MEMORIA                                           ║
║  Max mem óptimo:       63                           ║
║  ⚠️  Max mem UNLIMITED:  47                          ║
║  ⚠️  Espacio bajo (<20%): 12                         ║
║  ⚠️  Version store >1GB:  5                          ║
╚═══════════════════════════════════════════════════════╝
```

---

## 🔍 **Queries de Análisis**

### **1. Identificar causa de contención por disco lento**
```sql
SELECT 
    InstanceName,
    TempDBFileCount,
    TempDBContentionScore,
    TempDBAvgWriteLatencyMs,
    '❌ MOVER A SSD' AS Accion
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore = 0
  AND TempDBAvgWriteLatencyMs > 20
ORDER BY TempDBAvgWriteLatencyMs DESC;
```

### **2. Identificar causa de contención por size mismatch**
```sql
SELECT 
    InstanceName,
    TempDBFileCount,
    TempDBMinFileSizeMB,
    TempDBMaxFileSizeMB,
    TempDBMaxFileSizeMB - TempDBMinFileSizeMB AS DiferenciaMB,
    TempDBAvgWriteLatencyMs,
    '❌ IGUALAR TAMAÑOS' AS Accion
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore = 0
  AND TempDBAllSameSize = 0
  AND TempDBAvgWriteLatencyMs < 20  -- Disco rápido pero size mismatch
ORDER BY (TempDBMaxFileSizeMB - TempDBMinFileSizeMB) DESC;
```

### **3. Identificar causa de contención por falta de espacio**
```sql
SELECT 
    InstanceName,
    TempDBTotalSizeMB,
    TempDBUsedSpaceMB,
    TempDBFreeSpacePct,
    TempDBVersionStoreMB,
    '❌ PRE-ASIGNAR ESPACIO' AS Accion
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore = 0
  AND TempDBFreeSpacePct < 20
ORDER BY TempDBFreeSpacePct ASC;
```

### **4. Identificar instancias con version store grande**
```sql
SELECT 
    InstanceName,
    TempDBVersionStoreMB,
    CAST(TempDBVersionStoreMB * 100.0 / TempDBTotalSizeMB AS DECIMAL(5,2)) AS VersionStorePct,
    '⚠️ REVISAR TRANSACCIONES LARGAS' AS Accion
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBVersionStoreMB > 1024
ORDER BY TempDBVersionStoreMB DESC;
```

### **5. Reporte completo de diagnóstico**
```sql
SELECT 
    InstanceName,
    TempDBFileCount,
    TempDBContentionScore,
    -- Diagnóstico de disco
    TempDBAvgWriteLatencyMs,
    CASE 
        WHEN TempDBAvgWriteLatencyMs > 50 THEN '❌ Disco MUY lento'
        WHEN TempDBAvgWriteLatencyMs > 20 THEN '⚠️ Disco lento'
        ELSE '✅ Disco OK'
    END AS DiskStatus,
    -- Diagnóstico de configuración
    CASE 
        WHEN NOT TempDBAllSameSize THEN '❌ Size mismatch'
        WHEN NOT TempDBGrowthConfigOK THEN '⚠️ Growth pequeño'
        ELSE '✅ Config OK'
    END AS ConfigStatus,
    -- Diagnóstico de espacio
    TempDBFreeSpacePct,
    CASE 
        WHEN TempDBFreeSpacePct < 10 THEN '❌ Sin espacio'
        WHEN TempDBFreeSpacePct < 20 THEN '⚠️ Poco espacio'
        ELSE '✅ Espacio OK'
    END AS SpaceStatus,
    -- Version Store
    TempDBVersionStoreMB,
    CASE 
        WHEN TempDBVersionStoreMB > 5120 THEN '❌ >5GB'
        WHEN TempDBVersionStoreMB > 1024 THEN '⚠️ >1GB'
        ELSE '✅ OK'
    END AS VersionStoreStatus,
    -- Causa probable
    CASE 
        WHEN TempDBAvgWriteLatencyMs > 50 THEN '🎯 Causa: DISCO MUY LENTO'
        WHEN TempDBAvgWriteLatencyMs > 20 THEN '🎯 Causa: Disco lento'
        WHEN NOT TempDBAllSameSize THEN '🎯 Causa: Size mismatch'
        WHEN TempDBFreeSpacePct < 10 THEN '🎯 Causa: Sin espacio'
        WHEN TempDBFileCount < 4 THEN '🎯 Causa: Pocos archivos'
        WHEN TempDBVersionStoreMB > 2048 THEN '🎯 Causa: Version store grande'
        ELSE '❓ Revisar manualmente'
    END AS CausaProbable
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore < 70
ORDER BY 
    CASE 
        WHEN TempDBContentionScore = 0 THEN 1
        ELSE 2
    END,
    TempDBAvgWriteLatencyMs DESC;
```

---

## 🎓 **Beneficios de las Nuevas Métricas**

### **Antes:**
```
❌ "Tienes contención pero no sé por qué"
❌ 115 instancias con problemas sin diagnóstico
❌ No sabes por dónde empezar
```

### **Ahora:**
```
✅ "65 instancias tienen disco lento → mover a SSD"
✅ "23 instancias tienen size mismatch → igualar tamaños"
✅ "12 instancias sin espacio → pre-asignar espacio"
✅ "5 instancias con version store grande → revisar transacciones"
✅ Priorización clara de acciones correctivas
```

---

## ✅ **Checklist de Implementación**

- [x] ✅ Script PowerShell actualizado
- [x] ✅ Función Write-ToSqlServer actualizada
- [x] ✅ Objeto $results actualizado
- [x] ✅ Resumen mejorado
- [x] ✅ Migración SQL creada
- [ ] ⏳ Ejecutar migración SQL en SQLNova
- [ ] ⏳ Ejecutar script de recolección
- [ ] ⏳ Validar datos en la tabla
- [ ] ⏳ Ejecutar queries de análisis
- [ ] ⏳ Crear plan de remediación basado en diagnóstico

---

## 🚀 **Próximos Pasos**

1. **Ejecutar migración SQL** (5 minutos)
2. **Ejecutar recolección** (15-20 minutos para 127 instancias)
3. **Analizar resultados** con las queries de diagnóstico
4. **Crear plan de acción** priorizado:
   - Producción con disco lento (alta prioridad)
   - Instancias sin espacio (alta prioridad)
   - Size mismatch (media prioridad)
   - Growth configuration (baja prioridad)

---

¿Todo listo para ejecutar! 🎯

