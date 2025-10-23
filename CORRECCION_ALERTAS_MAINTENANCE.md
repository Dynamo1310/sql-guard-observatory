# 🔧 Corrección: Lógica de Alertas en Maintenance

## 🐛 **Problema Reportado**

Una instancia con **AMBOS** mantenimientos vencidos (CHECKDB y IndexOptimize) solo mostraba alerta de uno:

```
⚠️ NO CHECKDB! TQRSA-02 - CHECKDB:838 days IndexOpt:838 days Errors:0
```

**Observación:** Aunque se ve que `IndexOpt:838 days` también está vencido, el script solo alertaba `NO CHECKDB!`.

---

## 🔍 **Causa Raíz**

La lógica de alertas usaba `elseif`, lo que significa que **se detenía en la primera condición verdadera**:

```powershell
# ❌ ANTES (INCORRECTO):
$status = "✅"
if (-not $maintenance.CheckdbOk) { 
    $status = "⚠️ NO CHECKDB!" 
}
elseif (-not $maintenance.IndexOptimizeOk) {    # ⬅️ NUNCA se evalúa si CheckdbOk = false
    $status = "⚠️ NO INDEX OPT!" 
}
elseif ($errorlog.Severity20PlusCount -gt 0) { 
    $status = "🚨 ERRORS!" 
}
```

**Flujo:**
1. Si `CheckdbOk = false` → Asigna `"⚠️ NO CHECKDB!"` y **se detiene**
2. Nunca evalúa `IndexOptimizeOk`
3. Resultado: Solo muestra la primera alerta

---

## ✅ **Solución Implementada**

Cambié la lógica para **priorizar** cuando AMBOS están fallidos:

```powershell
# ✅ AHORA (CORRECTO):
$status = "✅"
if (-not $maintenance.CheckdbOk -and -not $maintenance.IndexOptimizeOk) { 
    $status = "🚨 CRITICAL!"        # ⬅️ AMBOS fallidos = más crítico
}
elseif (-not $maintenance.CheckdbOk) { 
    $status = "⚠️ NO CHECKDB!"      # ⬅️ Solo CHECKDB fallido
}
elseif (-not $maintenance.IndexOptimizeOk) { 
    $status = "⚠️ NO INDEX OPT!"    # ⬅️ Solo IndexOptimize fallido
}
elseif ($errorlog.Severity20PlusCount -gt 0) { 
    $status = "🚨 ERRORS!"           # ⬅️ Hay errores críticos en log
}
```

**Flujo mejorado:**
1. **Primero** verifica si AMBOS están mal → `🚨 CRITICAL!`
2. Si no, verifica si solo CHECKDB está mal → `⚠️ NO CHECKDB!`
3. Si no, verifica si solo IndexOptimize está mal → `⚠️ NO INDEX OPT!`
4. Si no, verifica errores → `🚨 ERRORS!`
5. Si todo está bien → `✅`

---

## 📊 **Ejemplos de Salida**

### **Caso 1: AMBOS vencidos (como TQRSA-02)**
```
🚨 CRITICAL! TQRSA-02 - CHECKDB:838 days IndexOpt:838 days Errors:0
```
✅ **Correcto:** Alerta como CRÍTICO porque ambos están vencidos

---

### **Caso 2: Solo CHECKDB vencido**
```
⚠️ NO CHECKDB! SQL01 - CHECKDB:10 days IndexOpt:2 days Errors:0
```
✅ **Correcto:** Alerta solo CHECKDB

---

### **Caso 3: Solo IndexOptimize vencido**
```
⚠️ NO INDEX OPT! SQL02 - CHECKDB:3 days IndexOpt:15 days Errors:0
```
✅ **Correcto:** Alerta solo IndexOptimize

---

### **Caso 4: Ambos OK, pero hay errores críticos**
```
🚨 ERRORS! SQL03 - CHECKDB:2 days IndexOpt:1 days Errors:5
```
✅ **Correcto:** Prioriza errores severity 20+

---

### **Caso 5: Todo OK**
```
✅ SQL04 - CHECKDB:1 days IndexOpt:1 days Errors:0
```
✅ **Correcto:** Sistema saludable

---

## 🎯 **Niveles de Severidad**

Ahora hay **3 niveles de alertas** bien diferenciados:

| Emoji | Estado | Condición | Severidad |
|-------|--------|-----------|-----------|
| 🚨 | **CRITICAL!** | Ambos mantenimientos vencidos | **Alta** |
| 🚨 | **ERRORS!** | Errores severity 20+ en errorlog | **Alta** |
| ⚠️ | **NO CHECKDB!** | Solo CHECKDB vencido (>7 días) | Media |
| ⚠️ | **NO INDEX OPT!** | Solo IndexOptimize vencido (>7 días) | Media |
| ✅ | *(OK)* | Todo funcionando correctamente | Baja |

---

## 🧪 **Verificación**

### **Ejecutar el script:**
```powershell
.\scripts\RelevamientoHealthScore_Maintenance.ps1
```

### **Buscar instancias CRITICAL:**
```
🚨 CRITICAL! TQRSA-02 - CHECKDB:838 days IndexOpt:838 days Errors:0
```

### **Verificar en SQL:**
```sql
SELECT 
    InstanceName,
    LastCheckdb,
    CheckdbOk,
    LastIndexOptimize,
    IndexOptimizeOk,
    DATEDIFF(DAY, LastCheckdb, GETDATE()) AS CheckdbAgeDays,
    DATEDIFF(DAY, LastIndexOptimize, GETDATE()) AS IndexOptAgeDays
FROM dbo.InstanceHealth_Maintenance
WHERE CheckdbOk = 0 AND IndexOptimizeOk = 0
ORDER BY CheckdbAgeDays DESC;
```

**Esperado:** Instancias con ambos jobs vencidos (>7 días).

---

## 🚀 **Impacto en el Health Score**

Esta corrección **NO afecta** el cálculo del Health Score (ya estaba correcto), solo mejora la **VISUALIZACIÓN** durante la ejecución del script.

### **Health Score sigue siendo:**
- `CheckdbOk = false` → CheckdbScore = 0 pts
- `IndexOptimizeOk = false` → IndexOptimizeScore = 0 pts
- **Ambos fallidos** → Tier4_Maintenance = 0/10 pts

Lo que cambió es que **ahora es más visible** en la consola cuando AMBOS están fallidos.

---

## ✅ **Cambio Aplicado**

- [x] Lógica de alertas corregida
- [x] Priorización de "CRITICAL" cuando ambos fallan
- [x] Documentación actualizada

---

## 📌 **Nota Importante: TQRSA-02**

La instancia **TQRSA-02** tiene mantenimientos sin ejecutar durante **838 días (2.3 años)**. Esto es crítico y requiere atención inmediata:

1. ✅ **Verificar si los jobs existen:**
   ```sql
   USE msdb;
   SELECT name, enabled, date_created 
   FROM dbo.sysjobs 
   WHERE name LIKE '%CHECKDB%' OR name LIKE '%Index%Optimize%';
   ```

2. ✅ **Si no existen, crearlos** (Ola Hallengren's scripts recomendados)

3. ✅ **Si existen pero están deshabilitados, habilitarlos:**
   ```sql
   EXEC msdb.dbo.sp_update_job 
       @job_name = 'DatabaseIntegrityCheck - SYSTEM_DATABASES', 
       @enabled = 1;
   ```

4. ✅ **Si están habilitados pero fallando, revisar historial:**
   ```sql
   SELECT TOP 10 
       j.name AS JobName,
       h.run_date,
       h.run_time,
       CASE h.run_status 
           WHEN 0 THEN 'Failed'
           WHEN 1 THEN 'Succeeded'
           WHEN 3 THEN 'Canceled'
       END AS Status,
       h.message
   FROM msdb.dbo.sysjobs j
   JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id
   WHERE j.name LIKE '%CHECKDB%'
   ORDER BY h.run_date DESC, h.run_time DESC;
   ```

---

## 🎉 **Resultado**

Ahora el script muestra alertas **más precisas y útiles**:

- 🚨 **CRITICAL!** cuando ambos mantenimientos fallan (prioridad alta)
- ⚠️ **NO CHECKDB!** o **NO INDEX OPT!** cuando solo uno falla
- ✅ **OK** cuando todo funciona

¡La visualización ahora refleja correctamente la severidad! 🎯

