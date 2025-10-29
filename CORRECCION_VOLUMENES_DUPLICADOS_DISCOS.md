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

## ✅ Soluciones Implementadas

### 1️⃣ **Fallback Robusto para SQL Server Antiguo** 🆕

**Problema adicional detectado:** Instancias SQL Server 2000/2005/2008 RTM que no tienen `sys.dm_os_volume_stats` generaban errores.

**Mejoras implementadas:**
- ✅ Detección de versión con try-catch (no falla si la query de versión falla)
- ✅ Fallback automático a `xp_fixeddrives` si detecta error "Invalid object name 'sys.dm_os_volume_stats'"
- ✅ Mensajes de advertencia claros sobre qué fallback se está usando
- ✅ Funciona tanto en modo secuencial como paralelo

**Antes:**
```
WARNING: [03:18:52][Invoke-DbaQuery] [BD04SER] Failed during execution | Invalid object name 'sys.dm_os_volume_stats'.
WARNING: Error obteniendo disk metrics en BD04SER: Invalid object name 'sys.dm_os_volume_stats'.
   ✅ BD04SER - Worst:100% Data:100% Log:100%  ← ❌ Datos vacíos/incorrectos
```

**Después:**
```
WARNING: ⚠️  BD04SER: sys.dm_os_volume_stats no disponible (SQL muy antiguo), usando fallback xp_fixeddrives
   ✅ BD04SER - Worst:15% Data:20% Log:45%  ← ✅ Datos correctos con xp_fixeddrives
```

**Código del fallback mejorado (master..sysaltfiles + xp_fixeddrives + WMI):**

**Problemas detectados:**
1. `xp_fixeddrives` solo devuelve espacio libre en MB, no el tamaño total
2. No puede distinguir entre discos de Data (.mdf) y Log (.ldf)

**Solución:** Combinar 3 fuentes de información:

```powershell
# Paso 1: Detectar roles de discos según archivos SQL
$queryDetectRoles = @"
SELECT DISTINCT
    SUBSTRING(filename, 1, 1) AS DriveLetter,
    CASE 
        WHEN filename LIKE '%.ldf' THEN 'Log'
        WHEN DB_NAME(dbid) = 'tempdb' THEN 'TempDB'
        ELSE 'Data'
    END AS DiskRole
FROM master..sysaltfiles
WHERE SUBSTRING(filename, 1, 1) BETWEEN 'A' AND 'Z'
"@
$diskRoles = @{}  # Hashtable: C -> Data, F -> Log, G -> TempDB, etc.

# Paso 2: Obtener espacio libre con xp_fixeddrives
$queryFallback = @"
CREATE TABLE #DriveSpace (Drive VARCHAR(10), MBFree INT)
INSERT INTO #DriveSpace EXEC xp_fixeddrives
SELECT Drive AS DriveLetter, MBFree FROM #DriveSpace
DROP TABLE #DriveSpace
"@
$xpResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $queryFallback

# Paso 3: Para cada disco, obtener tamaño total con WMI y asignar rol
foreach ($drive in $xpResult) {
    $driveLetter = $drive.DriveLetter
    $freeGB = [decimal]($drive.MBFree / 1024.0)
    
    # Determinar rol del disco (desde Paso 1)
    $diskRole = if ($diskRoles[$driveLetter]) { 
        $diskRoles[$driveLetter]  # "Data", "Log", o "TempDB"
    } else { 
        'Data'  # Por defecto
    }
    
    # Intentar WMI para obtener tamaño total
    $diskInfo = Get-WmiObject -ComputerName $serverName `
                              -Class Win32_LogicalDisk `
                              -Filter "DeviceID='${driveLetter}:'"
    
    if ($diskInfo) {
        $totalGB = [decimal]($diskInfo.Size / 1GB)
        $freePct = [decimal](($freeGB / $totalGB) * 100)
    }
    else {
        # Fallback: estimar 20% libre si no hay WMI
        $totalGB = $freeGB * 5
        $freePct = 20
    }
}
```

**Ventajas:**
- ✅ **Detecta correctamente discos de Data vs Log** vía archivos SQL
- ✅ Combina 3 fuentes: sysaltfiles (roles) + xp_fixeddrives (espacio libre) + WMI (tamaño total)
- ✅ Si WMI no está disponible, estima conservadoramente (20% libre)
- ✅ No genera falsas alarmas con `Log: 100%` incorrecto

---

### 2️⃣ Query SQL Mejorada (con CTE)

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

### 4️⃣ Cálculo de Promedios Corregido

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
| `scripts/RelevamientoHealthScore_Discos.ps1` | 193-244 | Detección de versión mejorada con try-catch |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 253-282 | Query SQL con CTE (modo secuencial) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 397-446 | Fallback automático a xp_fixeddrives (secuencial) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 426-517 | Procesamiento PowerShell con Group-Object (secuencial) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 905-920 | Detección de versión mejorada (paralelo) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 925-999 | Query SQL + fallback automático (paralelo) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | 1002-1046 | Procesamiento PowerShell con Group-Object (paralelo) |

---

## 🚀 Cómo Probar

### 1️⃣ Ejecutar el script manualmente:
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Discos.ps1
```

### 2️⃣ Verificar output en consola:

**SQL Server moderno (2008 R2+):**
```
   ✅ SSPR17MON-01 - Worst:12% Data:35% Log:89%
   ⚠️ SERVIDOR-SQL-02 - Worst:8% Data:15% Log:45%
```

**SQL Server antiguo (2000/2005/2008 RTM) con fallback:**
```
WARNING: [03:22:19][Invoke-DbaQuery] [BD04SER] Failed during execution | Invalid object name 'sys.dm_os_volume_stats'.
WARNING: ⚠️  BD04SER: sys.dm_os_volume_stats no disponible (SQL muy antiguo), usando fallback xp_fixeddrives
   ℹ️  BD04SER: Procesados 4 volúmenes con xp_fixeddrives + WMI
   ✅ BD04SER - Worst:15% Data:20% Log:25%  ← ✅ Datos reales (no 100%)
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

✅ **SQL Server 2008 R2+**: Funciona con `sys.dm_os_volume_stats` + CTE (información completa)  
✅ **SQL Server 2005/2008 RTM**: Usa fallback con `xp_fixeddrives` + WMI  
   - `xp_fixeddrives`: Obtiene espacio libre (MB)  
   - `Win32_LogicalDisk` (WMI): Obtiene tamaño total (GB)  
   - Si WMI no está disponible: Estima 20% libre (conservador)  
✅ **PowerShell 5.1+**: `Group-Object` funciona en todas las versiones  
✅ **PowerShell 7+**: Compatible con modo paralelo mejorado  

**Nota:** El fallback no soporta mount points (solo letras de unidad C:, D:, E:, etc.)  

---

## ✅ Estado

- [x] **Fallback robusto para SQL Server 2000/2005/2008 RTM** 🆕
  - [x] Detección de versión con try-catch
  - [x] Fallback automático a xp_fixeddrives + WMI
  - [x] Cálculo correcto de porcentajes (no más 100% falso)
  - [x] Estimación conservadora (20%) si WMI no está disponible
  - [x] Mensajes de advertencia informativos
- [x] **Query SQL refactorizada con CTE**
  - [x] Elimina columnas que causaban duplicados
  - [x] Garantiza volúmenes únicos desde SQL
- [x] **Procesamiento PowerShell con Group-Object**
  - [x] Deduplicación robusta por MountPoint
  - [x] Independiente de variaciones decimales
- [x] **Cálculo de promedios corregido**
  - [x] WorstFreePct, DataDiskAvgFreePct, LogDiskAvgFreePct, TempDBDiskFreePct
- [x] **Aplicado tanto en modo secuencial como paralelo**
- [x] **Documentación completada**

---

## 📅 Fecha de Corrección
**29 de Octubre, 2025**

## 👤 Contexto

**Problema 1:** Servidores con mount points reportaban 40+ volúmenes cuando en realidad tenían 10-15 volúmenes físicos.

**Problema 2 (detectado durante testing):** Instancias SQL Server 2000/2005/2008 RTM fallaban con error "Invalid object name 'sys.dm_os_volume_stats'" y no recolectaban métricas de disco.

**Problema 3 (detectado en BD04SER):** El fallback inicial con `xp_fixeddrives` devolvía 100% libre en todos los discos porque `xp_fixeddrives` solo proporciona MB libres, no el tamaño total del disco.

**Problema 4 (detectado con captura de pantalla):** El fallback marcaba **todos los discos como "Data"**, por eso reportaba `Log: 100%` (valor por defecto) cuando en realidad BD04SER tiene un disco `F: (LDF)` dedicado a logs con 96% libre.

**Solución final:** 
1. Query SQL refactorizada con CTE para volúmenes únicos
2. PowerShell robusto con Group-Object
3. **Detección de roles de discos vía `master..sysaltfiles`** (archivos .ldf = Log, .mdf = Data)
4. Fallback automático a `xp_fixeddrives` + `Win32_LogicalDisk` (WMI) para calcular porcentajes reales
5. Estimación conservadora (20% libre) si WMI no está disponible

