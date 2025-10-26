# 🔧 FIX: Error en Script de Memoria - Stolen Memory

## ❌ **ERROR REPORTADO:**

```
Error guardando en SQL: Incorrect syntax near ')'.
```

---

## 🔍 **DIAGNÓSTICO:**

**Causa 1:** La columna `StolenServerMemoryMB` **NO EXISTE** en la tabla `InstanceHealth_Memoria`.

**Causa 2:** El script estaba insertando un valor `$null` para `StolenServerMemoryMB`, generando SQL inválido:
```sql
INSERT INTO ... VALUES (..., )  -- ❌ Paréntesis vacío
```

---

## ✅ **SOLUCIÓN APLICADA:**

### **1. Script corregido** (línea 261):

**ANTES:**
```powershell
$($row.StolenServerMemoryMB)
```

**AHORA:**
```powershell
$(if ($row.StolenServerMemoryMB) {$row.StolenServerMemoryMB} else {0})
```

---

### **2. Ejecutar migración SQL** (CRÍTICO):

Necesitas ejecutar la migración para agregar la columna a la tabla:

```powershell
sqlcmd -S SSPR17MON-01 -d SQLNova -i "supabase\migrations\20250126_add_stolen_memory.sql"
```

**Qué hace:**
- Agrega columna `StolenServerMemoryMB INT DEFAULT 0` a `InstanceHealth_Memoria`
- Verifica que la columna no exista antes de agregarla

---

## 🚀 **PASOS PARA RESOLVER:**

### **1. Ejecutar migración SQL:**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

sqlcmd -S SSPR17MON-01 -d SQLNova -i "supabase\migrations\20250126_add_stolen_memory.sql"
```

**Salida esperada:**
```
🔧 Health Score v3.1 - Stolen Server Memory
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Agregando columna StolenServerMemoryMB a InstanceHealth_Memoria...
   ✅ Columna StolenServerMemoryMB agregada

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Migración completada exitosamente!
```

---

### **2. Volver a ejecutar el collector de Memoria:**
```powershell
cd C:\Temp\Tobi\Collectors
.\RelevamientoHealthScore_Memoria.ps1
```

**Ahora debería ejecutarse sin errores:** ✅

```
3️⃣  Guardando en SQL Server...
✅ Guardados 127 registros en SQL Server

╔═══════════════════════════════════════════════════════╗
║  RESUMEN - MEMORIA                                    ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                          ║
║  PLE promedio:         XXXs                         ║
║  Con memory pressure:  X                            ║
║  PLE bajo (<300s):     XX                           ║
╚═══════════════════════════════════════════════════════╝
```

---

### **3. Verificar datos:**
```sql
SELECT TOP 10 
    InstanceName,
    StolenServerMemoryMB,
    BufferPoolSizeMB,
    CAST(StolenServerMemoryMB * 100.0 / NULLIF(BufferPoolSizeMB, 0) AS DECIMAL(5,2)) AS [Stolen %],
    PageLifeExpectancy,
    CollectedAtUtc
FROM InstanceHealth_Memoria
ORDER BY CollectedAtUtc DESC;
```

**Esperado:**
```
InstanceName     | StolenServerMemoryMB | BufferPoolSizeMB | Stolen % | PLE
-----------------|----------------------|------------------|----------|-----
SSPR17DWH-01     | 1024                 | 16384            | 6.25     | 4500
SSPR14ODM-01     | 2048                 | 8192             | 25.00    | 450
```

---

## 📊 **RESUMEN:**

### **Problema:**
1. ❌ Columna `StolenServerMemoryMB` no existía en la tabla
2. ❌ Script insertaba `$null`, generando SQL inválido

### **Solución:**
1. ✅ Script corregido para manejar valores `$null` (usa 0 por defecto)
2. ✅ Ejecutar migración SQL para agregar la columna
3. ✅ Re-ejecutar el collector

---

## ⚠️ **NOTA IMPORTANTE:**

El resumen que viste muestra:
```
PLE promedio:         0s
Con memory pressure:  0
PLE bajo (<300s):     127
```

**Esto NO es normal**. Si todas las instancias tienen PLE = 0, significa que:
- ❌ Las queries NO se están ejecutando correctamente
- ❌ O hay un problema con el procesamiento de resultados

Después de arreglar el error de SQL, deberías ver valores reales de PLE.

---

**Versión:** 3.1.0 (Stolen Memory Fix)  
**Fecha:** Octubre 2024

