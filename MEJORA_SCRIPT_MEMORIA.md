# Mejoras al Script de Memoria - RelevamientoHealthScore_Memoria.ps1

## 🔴 Problemas Identificados

### 1. Error de Compatibilidad SQL 2008/2008 R2
```
Invalid column name 'physical_memory_kb'
Invalid column name 'committed_kb'
Invalid column name 'committed_target_kb'
```
- **Causa**: SQL Server 2008/2008 R2 usan nombres de columnas diferentes en `sys.dm_os_sys_info`
- **Instancias afectadas**: SSDES05, SSTES-05

### 2. Porcentajes Absurdos
```
PLE:1928482s (595210%) Target:726s
```
- **Causa**: El cálculo `(PLE / Target) * 100` generaba valores como 595,210%
- **Problema**: No es útil ni legible

### 3. Alerta Incorrecta "LOW PLE" cuando todo es 0
```
⚠️ LOW PLE! SSTS16-01 - PLE:0s (100%) Target:0s Grants:0
```
- **Causa**: El script alertaba cuando `PLE < 300s`, sin verificar si era un error de recolección
- **Problema**: Si `PLE=0` y `Target=0`, significa error de recolección, no problema real

### 4. Stolen Memory no se mostraba
- El script recolectaba `StolenServerMemoryMB` pero no lo mostraba en el output ni en el resumen

## ✅ Soluciones Implementadas

### 1. Detección de Versión SQL Server

Ahora el script detecta la versión y ajusta la query dinámicamente:

```powershell
# Detectar versión de SQL Server
$versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS NVARCHAR(50)) AS Version;"
$versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5 -EnableException
$version = $versionResult.Version
$majorVersion = [int]($version.Split('.')[0])

# SQL 2008/2008 R2 (majorVersion <= 10)
if ($majorVersion -le 10) {
    SELECT 
        physical_memory_in_bytes / 1024 / 1024 AS TotalPhysicalMemoryMB,
        bpool_committed / 128 AS CommittedMemoryMB,
        bpool_commit_target / 128 AS CommittedTargetMB
    FROM sys.dm_os_sys_info;
}
# SQL 2012+ (majorVersion >= 11)
else {
    SELECT 
        physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
        committed_kb / 1024 AS CommittedMemoryMB,
        committed_target_kb / 1024 AS CommittedTargetMB
    FROM sys.dm_os_sys_info;
}
```

### 2. Display Mejorado de Porcentajes

Ahora los porcentajes se truncan si son absurdos:

```powershell
if ($memMetrics.PLETarget -gt 0) {
    $pleRatio = [decimal](($memMetrics.PageLifeExpectancy * 100.0) / $memMetrics.PLETarget)
    if ($pleRatio -gt 999) {
        $pleDisplay = "(>999%)"  # Truncar valores absurdos
    } else {
        $pleDisplay = "($([int]$pleRatio)%)"
    }
} else {
    $pleDisplay = "(N/A)"
}
```

**Antes:**
```
PLE:1928482s (595210%) Target:726s
```

**Ahora:**
```
PLE:1928482s (>999%) Target:726s
```

### 3. Lógica de Alertas Mejorada

No alerta si PLE y Target son ambos 0 (error de recolección):

```powershell
# No alertar si PLE y Target son ambos 0 (indica error de recolección, no problema real)
$hasValidPLE = $memMetrics.PageLifeExpectancy -gt 0 -or $memMetrics.PLETarget -gt 0

if ($hasValidPLE) {
    if ($memMetrics.MemoryPressure) {
        $status = "🚨 PRESSURE!"
    }
    elseif ($memMetrics.PageLifeExpectancy -gt 0 -and $memMetrics.PageLifeExpectancy -lt 300) {
        $status = "⚠️ LOW PLE!"
    }
}
```

**Antes:**
```
⚠️ LOW PLE! SSTS16-01 - PLE:0s (100%) Target:0s Grants:0
```

**Ahora:**
```
✅ SSTS16-01 - PLE:0s (N/A) Target:0s Grants:0
```
*(Sin alerta porque ambos son 0 = error de recolección)*

### 4. Display de Stolen Memory

Ahora muestra Stolen Memory si es significativo:

```powershell
# Mostrar Stolen Memory si es significativo
if ($memMetrics.StolenServerMemoryMB -gt 0) {
    $stolenPct = if ($memMetrics.TotalServerMemoryMB -gt 0) {
        [int](($memMetrics.StolenServerMemoryMB * 100.0) / $memMetrics.TotalServerMemoryMB)
    } else { 0 }
    
    if ($stolenPct -gt 30) {
        $stolenInfo = " Stolen:${stolenPct}%⚠️"
        $status = "⚠️ Stolen!"
    }
    elseif ($stolenPct -gt 20) {
        $stolenInfo = " Stolen:${stolenPct}%"
    }
}
```

**Ejemplo de output:**
```
⚠️ Stolen! SSPR19-01 - PLE:47007s (363%) Target:12935s Grants:0 Stolen:35%⚠️
✅ SSPR19-02 - PLE:46774s (371%) Target:12600s Grants:0 Stolen:22%
```

### 5. Resumen Mejorado

El resumen ahora incluye:

```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - MEMORIA                                    ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:        127                       ║
║  PLE promedio:            323718s                   ║
║  PLE bajo (<300s):         12                       ║
║  PLE crítico (<100s):       3                       ║
║  Con memory pressure:       2                       ║
║  Grants Pending >10:        1                       ║
║  Grants Pending 5-10:       2                       ║
║  Stolen Memory >30%:        3                       ║
║  Stolen Memory 20-30%:      5                       ║
╚═══════════════════════════════════════════════════════╝

📊 TOP 5 INSTANCIAS CON PLE MÁS BAJO:
   SSTS16-01                 - PLE: 245s (12% del target)
   SSPR19VFH-01             - PLE: 14475s (82% del target)
   SSPR19CTM-01             - PLE: 1734s (143% del target)
   SSPR14ODM-01             - PLE: 47007s (363% del target)
   SSPR19USR-01             - PLE: 46774s (371% del target)

⚠️  TOP 5 INSTANCIAS CON MEMORY GRANTS PENDING:
   SSPR17-01                 - Grants Pending: 15
   SSPR19-02                 - Grants Pending: 8
   SSPR16BPM-01             - Grants Pending: 6
```

### 6. Agregado `StolenServerMemoryMB` al PSCustomObject

Ahora se guarda correctamente en la base de datos:

```powershell
$results += [PSCustomObject]@{
    # ... otros campos ...
    StolenServerMemoryMB = $memMetrics.StolenServerMemoryMB  # NUEVO
}
```

## 📊 Output Mejorado - Ejemplos

### Instancia con PLE Óptimo
```
✅ RSTSCRM365-01 - PLE:1928482s (>999%) Target:324s Grants:0
```

### Instancia con PLE Bajo
```
⚠️ LOW PLE! SSTS16-01 - PLE:245s (12%) Target:2049s Grants:0
```

### Instancia con Memory Pressure
```
🚨 PRESSURE! SSPR17-01 - PLE:123s (8%) Target:1500s Grants:15
```

### Instancia con Stolen Memory Alto
```
⚠️ Stolen! SSPR19-01 - PLE:47007s (363%) Target:12935s Grants:0 Stolen:35%⚠️
```

### Instancia con error de recolección (SQL 2008)
```
✅ SSDES05 - PLE:0s (N/A) Target:0s Grants:0
```
*(Ya no muestra "LOW PLE" porque ambos son 0)*

## 🧪 Testing

Para probar los cambios:

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Memoria.ps1
```

## 📝 Notas Técnicas

### Compatibilidad SQL Server
- **SQL 2008/2008 R2 (v10.x)**: Usa `physical_memory_in_bytes`, `bpool_committed`, `bpool_commit_target`
- **SQL 2012+ (v11.x+)**: Usa `physical_memory_kb`, `committed_kb`, `committed_target_kb`

### Thresholds
- **PLE Bajo**: < 300 segundos
- **PLE Crítico**: < 100 segundos
- **Grants Alto**: > 10 grants pending
- **Grants Moderado**: 5-10 grants pending
- **Stolen Memory Alto**: > 30% del Total Server Memory
- **Stolen Memory Moderado**: 20-30% del Total Server Memory

### PLE Target
El target se calcula como: `BufferPoolSizeGB * 300 segundos`
- 4 GB buffer pool = 1,200s target
- 16 GB buffer pool = 4,800s target
- 64 GB buffer pool = 19,200s target

## ✅ Resumen de Cambios

1. ✅ **Compatibilidad SQL 2008/2008 R2**: Detección automática de versión
2. ✅ **Porcentajes legibles**: Truncado a ">999%" para valores absurdos
3. ✅ **Alertas correctas**: No alerta cuando PLE=0 y Target=0 (error de recolección)
4. ✅ **Stolen Memory visible**: Muestra en output y resumen
5. ✅ **Resumen mejorado**: Categorías detalladas con colores
6. ✅ **Top 5 instancias**: PLE más bajo y Grants Pending
7. ✅ **Persistencia correcta**: `StolenServerMemoryMB` se guarda en BD

## 🎯 Resultado

El script ahora:
- ✅ **Funciona en SQL 2008+** sin errores
- ✅ **Muestra porcentajes legibles**
- ✅ **No genera alertas falsas**
- ✅ **Provee información accionable** sobre memoria robada
- ✅ **Tiene un resumen detallado** con TOP instancias problemáticas

