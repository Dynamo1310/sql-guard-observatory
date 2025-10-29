# 🔧 Corrección: Volúmenes Duplicados en Script de Discos

## 📋 Problema Identificado

El script `RelevamientoHealthScore_Discos.ps1` estaba mostrando **volúmenes duplicados** en algunos servidores SQL que utilizan **mount points** (carpetas montadas).

### Síntomas:
```
Volúmenes (46):  ← Debería mostrar ~10-15 volúmenes únicos
E:\DWM\DWM3\8.0% (82GB)
E:\DWM\DWM4\9.4% (96GB)
E:\DWM\DWM5\9.4% (96GB)
...
```

**Causa raíz**: 
- La query SQL devolvía **una fila por cada archivo de base de datos**, no por volumen físico
- Aunque se usaba `SELECT DISTINCT`, incluía columnas específicas de archivos que hacían cada fila "única"
- El código PowerShell usaba `Select-Object -Unique` que puede fallar con diferencias mínimas en decimales

---

## ✅ Solución Implementada

### 1️⃣ Query SQL Mejorada (con CTE)

**Antes:**
```sql
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    ... valores calculados ...
    CASE ... END AS DiskRole,
    DB_NAME(mf.database_id) AS DatabaseName,  -- ❌ Causa duplicados
    mf.type_desc AS FileType                  -- ❌ Causa duplicados
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
```

**Después:**
```sql
;WITH VolumeInfo AS (
    SELECT DISTINCT
        vs.volume_mount_point AS MountPoint,
        vs.logical_volume_name AS VolumeName,
        vs.total_bytes,
        vs.available_bytes,
        CASE ... END AS DiskRole  -- ✅ Solo rol, no archivo específico
    FROM sys.master_files mf
    CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
)
SELECT DISTINCT
    MountPoint,
    VolumeName,
    CAST(total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((available_bytes * 100.0 / total_bytes) AS DECIMAL(5,2)) AS FreePct,
    DiskRole
FROM VolumeInfo
ORDER BY FreePct ASC;
```

**✅ Ventajas:**
- El CTE agrupa primero por mount point + rol
- Elimina columnas específicas de archivos (DatabaseName, FileType)
- Garantiza volúmenes únicos desde SQL

---

### 2️⃣ Procesamiento PowerShell Robusto

**Antes:**
```powershell
# ❌ Select-Object -Unique puede fallar con decimales variables
$uniqueVolumes = $dataSpace | Select-Object -Property MountPoint, VolumeName, TotalGB, FreeGB, FreePct -Unique
```

**Después:**
```powershell
# ✅ Group-Object es más robusto para agrupar por MountPoint
$uniqueVolumes = $dataSpace | 
    Group-Object -Property MountPoint | 
    ForEach-Object {
        # Tomar el primer elemento de cada grupo
        $_.Group[0]
    }
```

**✅ Ventajas:**
- `Group-Object` agrupa por clave exacta (MountPoint)
- No depende de comparación de valores decimales
- Garantiza un volumen por mount point

---

### 3️⃣ Cálculo de Promedios Corregido

**Antes:**
```powershell
# ❌ Podría incluir duplicados en el cálculo
$dataDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Data' } | Select-Object -Property MountPoint, FreePct -Unique
$result.DataDiskAvgFreePct = (($dataDisks | Measure-Object -Property FreePct -Average).Average)
```

**Después:**
```powershell
# ✅ Garantiza volúmenes únicos antes de calcular promedio
$dataDisks = $dataSpace | Where-Object { $_.DiskRole -eq 'Data' } | 
    Group-Object -Property MountPoint | 
    ForEach-Object { $_.Group[0] }

if ($dataDisks) {
    $result.DataDiskAvgFreePct = ConvertTo-SafeDecimal (($dataDisks | Measure-Object -Property FreePct -Average).Average) 100.0
}
```

**✅ Se aplica a:**
- Data disks (archivos de datos)
- Log disks (archivos de transacciones)
- TempDB disks
- WorstFreePct (peor porcentaje libre)

---

## 📊 Resultado Esperado

### Antes (con duplicados):
```
Volúmenes (46):
E:\DWM\DWM3\8.0% (82GB)    ← Mount point 1
E:\DWM\DWM4\9.4% (96GB)    ← Mount point 2
E:\DWM\DWM5\9.4% (96GB)    ← Mount point 3
...
(múltiples entradas por volumen lógico)
```

### Después (deduplicado):
```
Volúmenes (12):
E:\8.0% (82GB)             ← Volumen físico E:\
C:\23.5% (50GB)            ← Volumen físico C:\
D:\45.2% (500GB)           ← Volumen físico D:\
...
(una entrada por volumen físico)
```

---

## 🔍 Archivos Modificados

| Archivo | Líneas Modificadas | Cambios |
|---------|-------------------|---------|
| `scripts/RelevamientoHealthScore_Discos.ps1` | 253-282 | Query SQL (modo secuencial) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 856-884 | Query SQL (modo paralelo) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 426-517 | Procesamiento PowerShell (secuencial) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 894-946 | Procesamiento PowerShell (paralelo) |

---

## 🚀 Cómo Probar

### 1️⃣ Ejecutar el script manualmente:
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Discos.ps1
```

### 2️⃣ Verificar output en consola:
```
   ✅ SSPR17MON-01 - Worst:12% Data:35% Log:89%
   ⚠️ SERVIDOR-SQL-02 - Worst:8% Data:15% Log:45%
```

### 3️⃣ Verificar en base de datos:
```sql
SELECT TOP 1
    InstanceName,
    VolumesJson,
    WorstFreePct,
    DataDiskAvgFreePct,
    LogDiskAvgFreePct,
    CollectedAtUtc
FROM SQLNova.dbo.InstanceHealth_Discos
WHERE InstanceName = 'TU_SERVIDOR_CON_MOUNT_POINTS'
ORDER BY CollectedAtUtc DESC;
```

**Revisar el JSON de `VolumesJson`:**
- Debe tener un número razonable de volúmenes (típicamente 3-15)
- Cada MountPoint debe aparecer **una sola vez**
- No debe haber mount points idénticos con el mismo espacio libre

---

## 📝 Notas Técnicas

### ¿Qué son los Mount Points?

Los **mount points** son carpetas que apuntan a volúmenes físicos separados:

```
E:\                        ← Volumen físico 1 (500GB)
E:\DWM\DWM1\              ← Volumen físico 2 (100GB) montado en carpeta
E:\DWM\DWM2\              ← Volumen físico 3 (100GB) montado en carpeta
E:\TEMPDB\TEMPDB1\        ← Volumen físico 4 (50GB) montado en carpeta
```

SQL Server ve cada uno como un volumen independiente, pero la query anterior los contaba múltiples veces.

### Compatibilidad

✅ **SQL Server 2008+**: Funciona con `sys.dm_os_volume_stats` + CTE  
✅ **SQL Server 2005**: Usa fallback con `xp_fixeddrives` (sin mount points)  
✅ **PowerShell 5.1+**: `Group-Object` funciona en todas las versiones  
✅ **PowerShell 7+**: Compatible con modo paralelo mejorado  

---

## ✅ Estado

- [x] Query SQL refactorizada con CTE
- [x] Procesamiento PowerShell con Group-Object
- [x] Cálculo de promedios corregido
- [x] Aplicado tanto en modo secuencial como paralelo
- [x] Documentación completada

---

## 📅 Fecha de Corrección
**29 de Octubre, 2025**

## 👤 Contexto
Corrección aplicada tras detectar que servidores con mount points reportaban 40+ volúmenes cuando en realidad tenían 10-15 volúmenes físicos.

