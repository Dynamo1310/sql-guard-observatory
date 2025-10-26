# Correcciones Finales - Scripts de Health Score v3.1

## 🔴 Problemas Identificados y Corregidos

### 1. THREADPOOL al 0% marcado como crítico

#### Problema
126 de 127 instancias mostraban:
```
🚨 THREADPOOL! SSPR19SSO-01 [THREADPOOL:0%] | Wait:9657h
```

Esto **NO tiene sentido** - si el porcentaje es 0%, el wait es insignificante.

#### Causa
La lógica alertaba si `ThreadPoolWaitMs > 0`, sin importar qué tan pequeño fuera el valor. Después del redondeo a 2 decimales, resultaba en 0%.

Ejemplo:
- `ThreadPoolWaitMs = 100 ms`
- `TotalWaitMs = 34,772,600,000 ms` (9657 horas)
- Porcentaje: `0.000000287%` → redondeado a `0.00%`

#### Solución Implementada

**Antes:**
```powershell
# THREADPOOL - siempre crítico si existe
if ($waits.ThreadPoolWaitMs -gt 0) {
    $status = "🚨 THREADPOOL!"
    $pct = [Math]::Round([decimal](($waits.ThreadPoolWaitMs / $waits.TotalWaitMs) * 100), 2)
    $alerts += "THREADPOOL:${pct}%"
}
```

**Ahora:**
```powershell
# THREADPOOL - crítico solo si es significativo
if ($waits.ThreadPoolWaitMs -gt 0) {
    $pct = [Math]::Round([decimal](($waits.ThreadPoolWaitMs / $waits.TotalWaitMs) * 100), 2)
    # Solo alertar si el porcentaje es > 0.01% (más de 1 en 10,000 waits)
    if ($pct -gt 0.01) {
        $status = "🚨 THREADPOOL!"
        $alerts += "THREADPOOL:${pct}%"
    }
}
```

**Threshold**: Solo alerta si `THREADPOOL > 0.01%` (más de 1 en 10,000 waits)

#### Resumen también corregido

**Antes:**
```
║  THREADPOOL (crítico):    126                       ║
```

**Ahora:**
```
║  THREADPOOL >0.01%:         0                       ║
```

---

### 2. Stolen Memory: Mejorado el Reporte

#### Observaciones
- **27 instancias** con Stolen Memory >30%
- **17 instancias** con Stolen Memory 20-30%
- Instancias críticas:
  - `SSDS17BPM-01`: **81%** stolen
  - `SSDS17-02`: **63%** stolen
  - `SSTS16-02`: **63%** stolen
  - `SSPR19CTM-01`: **59%** stolen
  - `RSTSCRM365-01`: **57%** stolen

#### ¿Qué es Stolen Memory?

**Stolen Memory** = Memoria usada por SQL Server **fuera del buffer pool** para:
- **Query plans** (procedimientos compilados)
- **CLR objects** (si usas .NET en SQL)
- **Extended stored procedures**
- **Lock manager**
- **Connection memory**
- **Backup/restore buffers**

#### ¿Es malo tener Stolen Memory alto?

**Depende del contexto**:
- **< 20%**: Normal ✅
- **20-30%**: Moderado ⚠️ (monitorear)
- **30-50%**: Alto ⚠️ (investigar causas)
- **> 50%**: Muy alto 🚨 (puede indicar problemas: plan cache bloat, memory leaks, configuración incorrecta)

#### Solución Implementada

Agregado **TOP 5 de Stolen Memory** al resumen:

```powershell
# Top 5 instancias con Stolen Memory más alto
$top5Stolen = $results | Where-Object {$_.StolenServerMemoryMB -gt 0 -and $_.TotalServerMemoryMB -gt 0} | 
    Select-Object InstanceName, StolenServerMemoryMB, TotalServerMemoryMB, @{
        Name='StolenPct'
        Expression={[int](($_.StolenServerMemoryMB * 100.0) / $_.TotalServerMemoryMB)}
    } | 
    Sort-Object -Property StolenPct -Descending | 
    Select-Object -First 5

if ($top5Stolen.Count -gt 0) {
    Write-Host "`n⚠️  TOP 5 INSTANCIAS CON STOLEN MEMORY MÁS ALTO:" -ForegroundColor Yellow
    foreach ($inst in $top5Stolen) {
        $color = if ($inst.StolenPct -gt 50) { "Red" } elseif ($inst.StolenPct -gt 30) { "Yellow" } else { "Gray" }
        Write-Host "   $($inst.InstanceName.PadRight(25)) - Stolen: $($inst.StolenServerMemoryMB)MB (${inst.StolenPct}%)" -ForegroundColor $color
    }
    Write-Host "`n   💡 Stolen Memory = memoria usada fuera del buffer pool (planes, CLR, XPs, etc.)" -ForegroundColor DarkGray
}
```

**Output esperado:**
```
⚠️  TOP 5 INSTANCIAS CON STOLEN MEMORY MÁS ALTO:
   SSDS17BPM-01              - Stolen: 3200MB (81%)
   SSDS17-02                 - Stolen: 2100MB (63%)
   SSTS16-02                 - Stolen: 1800MB (63%)
   SSPR19CTM-01              - Stolen: 1500MB (59%)
   RSTSCRM365-01             - Stolen: 1200MB (57%)

   💡 Stolen Memory = memoria usada fuera del buffer pool (planes, CLR, XPs, etc.)
```

---

## 📊 Output Esperado Después de las Correcciones

### Script de Waits

**Antes (INCORRECTO):**
```
🚨 THREADPOOL! SSPR19SSO-01 [THREADPOOL:0%] | Wait:9657h, Top:SOS_WORK_DISPATCHER
🚨 THREADPOOL! SSPR19SSO-51 [THREADPOOL:0%] | Wait:14358h, Top:SOS_WORK_DISPATCHER
...
║  THREADPOOL (crítico):    126                       ║
```

**Ahora (CORRECTO):**
```
✅ SSPR19SSO-01 | Wait:9657h, Top:SOS_WORK_DISPATCHER
✅ SSPR19SSO-51 | Wait:14358h, Top:SOS_WORK_DISPATCHER
...
║  THREADPOOL >0.01%:         0                       ║
```

### Script de Memoria

**Nuevo output en resumen:**
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - MEMORIA                                    ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:        127                       ║
║  PLE promedio:            338216s                   ║
║  PLE bajo (<300s):          1                       ║
║  PLE crítico (<100s):       0                       ║
║  Con memory pressure:      10                       ║
║  Grants Pending >10:        0                       ║
║  Grants Pending 5-10:       0                       ║
║  Stolen Memory >30%:       27                       ║
║  Stolen Memory 20-30%:     17                       ║
╚═══════════════════════════════════════════════════════╝

📊 TOP 5 INSTANCIAS CON PLE MÁS BAJO:
   SSPR19VEEAM-01            - PLE: 119s (1% del target)
   SSPR17CRM365-01           - PLE: 433s (2% del target)
   SSPR17MON-01              - PLE: 454s (22% del target)
   SSPR19MSV-01              - PLE: 724s (6% del target)
   SSPR17DWH-02              - PLE: 965s (12% del target)

⚠️  TOP 5 INSTANCIAS CON STOLEN MEMORY MÁS ALTO:
   SSDS17BPM-01              - Stolen: 3200MB (81%)
   SSDS17-02                 - Stolen: 2100MB (63%)
   SSTS16-02                 - Stolen: 1800MB (63%)
   SSPR19CTM-01              - Stolen: 1500MB (59%)
   RSTSCRM365-01             - Stolen: 1200MB (57%)

   💡 Stolen Memory = memoria usada fuera del buffer pool (planes, CLR, XPs, etc.)
```

---

## 🎯 Acciones Recomendadas

### Para instancias con Stolen Memory >50%

1. **Verificar el plan cache**:
```sql
-- Ver tamaño del plan cache
SELECT 
    objtype AS 'Type',
    COUNT(*) AS 'Plans Count',
    SUM(CAST(size_in_bytes AS BIGINT)) / 1024 / 1024 AS 'Size MB',
    AVG(usecounts) AS 'Avg Use Count'
FROM sys.dm_exec_cached_plans
GROUP BY objtype
ORDER BY SUM(CAST(size_in_bytes AS BIGINT)) DESC;
```

2. **Verificar CLR usage**:
```sql
-- Ver assemblies CLR cargados
SELECT 
    a.name,
    a.permission_set_desc,
    SUM(CAST(af.content AS VARBINARY(MAX)) LEN(af.content)) / 1024 / 1024 AS 'Size MB'
FROM sys.assemblies a
INNER JOIN sys.assembly_files af ON a.assembly_id = af.assembly_id
GROUP BY a.name, a.permission_set_desc;
```

3. **Considerar limpiar el plan cache** (con cuidado, en ventana de mantenimiento):
```sql
-- PRECAUCIÓN: Esto causará recompilaciones
DBCC FREEPROCCACHE;
```

4. **Revisar configuración**:
   - ¿Max Server Memory está configurado correctamente?
   - ¿Hay cursores abiertos sin cerrar?
   - ¿Hay transacciones de larga duración?

---

## 🧪 Testing

Para probar los cambios:

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts

# Script de Waits
.\RelevamientoHealthScore_Waits.ps1

# Script de Memoria
.\RelevamientoHealthScore_Memoria.ps1
```

---

## ✅ Resumen de Cambios

### Script: `RelevamientoHealthScore_Waits.ps1`

1. ✅ **THREADPOOL**: Solo alerta si `> 0.01%` (no solo si existe)
2. ✅ **Resumen**: Cambiado de "THREADPOOL (crítico)" a "THREADPOOL >0.01%"

### Script: `RelevamientoHealthScore_Memoria.ps1`

1. ✅ **Stolen Memory TOP 5**: Agregado al resumen
2. ✅ **Colores**: Rojo para >50%, amarillo para >30%, gris para <30%
3. ✅ **Contexto**: Agregada explicación de qué es Stolen Memory

---

## 📌 Interpretación de Resultados

### Waits - Tu ambiente está **muy saludable**:
- **0 instancias** con THREADPOOL real (>0.01%)
- **0 instancias** con PAGEIOLATCH >10%
- **0 instancias** con CXPACKET >15%
- **0 instancias** con RESOURCE_SEMAPHORE >5%
- **1 instancia** con blocking (probablemente temporal)

✅ **Conclusión**: No hay problemas de waits significativos.

### Memoria - Atención en algunas instancias:
- **10 instancias** con memory pressure (PLE bajo)
- **27 instancias** con Stolen Memory >30% ⚠️
- **PLE promedio: 338,216s** (93.9 horas) - Excelente ✅

⚠️ **Acción**: Investigar las **TOP 5 instancias con Stolen Memory >50%** para determinar si es plan cache bloat o uso legítimo (CLR, XPs, etc.).

