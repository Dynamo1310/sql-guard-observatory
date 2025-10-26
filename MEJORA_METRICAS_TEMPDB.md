# Mejora: Métricas Extendidas para TempDB

## 🎯 **Problema Identificado**

El usuario tiene razón: **una sola métrica (PAGELATCH waits) NO es suficiente** para diagnosticar problemas de TempDB.

### **Ejemplo real:**
```
🚨 CONTENTION! SSPR14-01 | Files:8 Mem:94.7% Score:0
🚨 CONTENTION! SSPR17DWH-01 | Files:10 Mem:87.5% Score:0
```

**Pregunta:** ¿Por qué tienen contención si tienen 8-10 archivos?

**Respuesta:** Necesitamos más métricas para saberlo:
- ¿Los archivos son del mismo tamaño?
- ¿Están en disco lento (HDD)?
- ¿Tienen growth mal configurado?
- ¿Están sin espacio libre?

---

## ✅ **Solución: Métricas Extendidas**

### **Nuevas métricas capturadas:**

| Métrica | Propósito | Valor Óptimo |
|---------|-----------|--------------|
| **TempDBAvgReadLatencyMs** | Velocidad de disco (lectura) | < 5ms (SSD) |
| **TempDBAvgWriteLatencyMs** | Velocidad de disco (escritura) | < 5ms (SSD) |
| **TempDBTotalSizeMB** | Tamaño total asignado | N/A |
| **TempDBUsedSpaceMB** | Espacio usado actualmente | N/A |
| **TempDBFreeSpacePct** | % espacio libre | > 20% |
| **TempDBVersionStoreMB** | Row versioning | < 1GB |
| **TempDBMinFileSizeMB** | Archivo más pequeño | Igual para todos |
| **TempDBMaxFileSizeMB** | Archivo más grande | Igual para todos |
| **TempDBAvgFileSizeMB** | Tamaño promedio | N/A |
| **TempDBGrowthConfigOK** | Growth >= 512MB, no % | TRUE |

---

## 📊 **Nueva Interpretación con Métricas Extendidas**

### **Caso 1: Disco Lento**
```
Instance: SSPR14-01
Files: 8 ✅
AllSameSize: TRUE ✅
Score: 0 ❌

Nuevas métricas:
AvgWriteLatencyMs: 45ms ← ❌ DISCO LENTO (HDD)
```

**Diagnóstico:** El problema NO es la configuración de archivos, sino el **disco lento**.  
**Solución:** Mover TempDB a SSD.

---

### **Caso 2: Size Mismatch Real**
```
Instance: SSPR16SOA-01
Files: 8 ⚠️
AllSameSize: FALSE ❌
Score: 0 ❌

Nuevas métricas:
MinFileSizeMB: 512 MB
MaxFileSizeMB: 8192 MB  ← ❌ DESIGUALES
AvgWriteLatencyMs: 3ms ✅ (SSD)
```

**Diagnóstico:** Archivos de diferente tamaño concentran la carga.  
**Solución:** Igualar tamaños de archivos (requiere reinicio).

---

### **Caso 3: Growth Mal Configurado**
```
Instance: SSPR17-01
Files: 4 ⚠️
AllSameSize: TRUE ✅
Score: 0 ❌

Nuevas métricas:
GrowthConfigOK: FALSE ❌ (Growth de 64MB, muy pequeño)
FreeSpacePct: 5% ← ❌ SIN ESPACIO
AvgWriteLatencyMs: 4ms ✅
```

**Diagnóstico:** TempDB crece constantemente en incrementos pequeños → fragmentación.  
**Solución:** Aumentar growth a 512MB y pre-asignar espacio.

---

### **Caso 4: Version Store Grande**
```
Instance: SSPR17DWH-01
Files: 10 ✅
AllSameSize: TRUE ✅
Score: 0 ❌

Nuevas métricas:
VersionStoreMB: 4096 MB ← ❌ 4 GB!
FreeSpacePct: 15% ⚠️
AvgWriteLatencyMs: 3ms ✅
```

**Diagnóstico:** Transacciones largas llenando version store.  
**Solución:** Revisar queries con SNAPSHOT isolation o READ_COMMITTED_SNAPSHOT.

---

## 🔧 **Implementación**

### **Paso 1: Migrar la base de datos**

```sql
-- Ejecutar en SQLNova
sqlcmd -S SSPR17MON-01 -d SQLNova -i supabase/migrations/20250126_tempdb_extended_metrics.sql
```

Esto agrega las nuevas columnas:
- TempDBAvgReadLatencyMs
- TempDBAvgWriteLatencyMs
- TempDBTotalSizeMB
- TempDBUsedSpaceMB
- TempDBFreeSpacePct
- TempDBVersionStoreMB
- TempDBAvgFileSizeMB
- TempDBMinFileSizeMB
- TempDBMaxFileSizeMB
- TempDBGrowthConfigOK

### **Paso 2: Actualizar el script de PowerShell**

El script ya fue modificado para capturar las nuevas métricas.

### **Paso 3: Ejecutar recolección**

```powershell
cd C:\Temp\Tobi\Collectors
.\RelevamientoHealthScore_ConfiguracionTempdb.ps1
```

### **Paso 4: Analizar resultados mejorados**

```sql
USE SQLNova;

-- Ver instancias con disco lento
SELECT 
    InstanceName,
    TempDBFileCount,
    TempDBContentionScore,
    TempDBAvgWriteLatencyMs,
    CASE 
        WHEN TempDBAvgWriteLatencyMs > 50 THEN '❌ MUY LENTO'
        WHEN TempDBAvgWriteLatencyMs > 20 THEN '⚠️ LENTO'
        WHEN TempDBAvgWriteLatencyMs > 5 THEN '✅ OK'
        ELSE '✅ SSD RÁPIDO'
    END AS DiskStatus
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBContentionScore = 0
ORDER BY TempDBAvgWriteLatencyMs DESC;

-- Ver instancias con size mismatch real
SELECT 
    InstanceName,
    TempDBFileCount,
    TempDBMinFileSizeMB,
    TempDBMaxFileSizeMB,
    TempDBMaxFileSizeMB - TempDBMinFileSizeMB AS SizeDifferenceM,
    TempDBContentionScore
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBAllSameSize = 0
  AND TempDBContentionScore = 0
ORDER BY (TempDBMaxFileSizeMB - TempDBMinFileSizeMB) DESC;

-- Ver instancias con poco espacio libre
SELECT 
    InstanceName,
    TempDBTotalSizeMB,
    TempDBUsedSpaceMB,
    TempDBFreeSpacePct,
    TempDBVersionStoreMB
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBFreeSpacePct < 20
ORDER BY TempDBFreeSpacePct ASC;

-- Ver instancias con version store grande
SELECT 
    InstanceName,
    TempDBVersionStoreMB,
    TempDBFreeSpacePct,
    TempDBContentionScore
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(MINUTE, -30, GETUTCDATE())
  AND TempDBVersionStoreMB > 1024  -- > 1 GB
ORDER BY TempDBVersionStoreMB DESC;
```

---

## 📈 **Dashboard Mejorado (Propuesta)**

Con las nuevas métricas, podrías crear un dashboard más completo:

```
╔═══════════════════════════════════════════════════════════╗
║  DIAGNÓSTICO TEMPDB - Instancia SSPR14-01               ║
╠═══════════════════════════════════════════════════════════╣
║  📁 ARCHIVOS                                             ║
║     Files: 8                         ✅ OK               ║
║     AllSameSize: TRUE                ✅ OK               ║
║     Avg Size: 4096 MB                                    ║
║     Range: 4096 - 4096 MB            ✅ OK               ║
║     Growth: 512 MB (fixed)           ✅ OK               ║
║                                                           ║
║  💾 ESPACIO                                              ║
║     Total: 32 GB                                         ║
║     Used: 28 GB                                          ║
║     Free: 12.5%                      ⚠️ BAJO            ║
║     Version Store: 256 MB            ✅ OK               ║
║                                                           ║
║  ⚡ RENDIMIENTO                                          ║
║     Read Latency: 2.3 ms             ✅ SSD             ║
║     Write Latency: 45.7 ms           ❌ LENTO!          ║
║     PAGELATCH waits: 15,234 ms       ❌ CRÍTICO         ║
║     Contention Score: 0              ❌ CRÍTICO         ║
║                                                           ║
║  🎯 DIAGNÓSTICO                                          ║
║     Problema principal: DISCO LENTO                      ║
║     Acción: Mover TempDB a SSD                           ║
║     Prioridad: 🚨 ALTA                                   ║
╚═══════════════════════════════════════════════════════════╝
```

---

## 🎓 **Conclusión**

**Respuesta a tu pregunta:** SÍ, definitivamente necesitas más métricas.

**Antes (solo PAGELATCH):**
```
🚨 CONTENTION! SSPR14-01 | Files:8 Mem:94.7% Score:0
↑ ¿Por qué? 🤷‍♂️
```

**Después (métricas extendidas):**
```
🚨 CONTENTION! SSPR14-01 | Files:8 Mem:94.7% Score:0
   - Files OK ✅
   - Sizes OK ✅
   - Write Latency: 45ms ❌ DISCO LENTO
   - Free Space: 5% ⚠️ SIN ESPACIO
   ↑ Causa identificada: Mover a SSD + pre-asignar espacio
```

---

## ✅ **Checklist de Implementación**

- [ ] Ejecutar migración SQL: `20250126_tempdb_extended_metrics.sql`
- [ ] Script PowerShell actualizado automáticamente
- [ ] Ejecutar recolección de métricas
- [ ] Validar que las nuevas columnas tienen datos
- [ ] Crear queries de análisis
- [ ] Actualizar el frontend para mostrar nuevas métricas (opcional)
- [ ] Documentar hallazgos

---

**¿Quieres que ejecute la migración SQL y actualicemos el script completo ahora?** 🚀

