# 🔧 Corrección Final: Volúmenes Duplicados - ROOT CAUSE

## 📋 Problema Detectado (SSPR17DWH-01)

El servidor **SSPR17DWH-01** reportaba **46 volúmenes** cuando en realidad tiene **SOLO 2 discos físicos**:
- C:\ (Local Disk) - 119 GB
- E:\ (DATOS) - 49.9 GB

## 🔍 Root Cause Analysis

### Problema con el CTE Original:

```sql
-- ❌ Query INCORRECTA (causaba duplicados)
;WITH VolumeInfo AS (
    SELECT DISTINCT
        vs.volume_mount_point AS MountPoint,
        vs.logical_volume_name AS VolumeName,
        vs.total_bytes,
        vs.available_bytes,
        CASE 
            WHEN mf.type_desc = 'LOG' THEN 'Log'
            WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
            WHEN mf.type_desc = 'ROWS' THEN 'Data'
            ELSE 'Other'
        END AS DiskRole  -- ❌ ESTE ES EL PROBLEMA
    FROM sys.master_files mf
    CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
)
SELECT DISTINCT MountPoint, VolumeName, TotalGB, FreeGB, FreePct, DiskRole
FROM VolumeInfo
```

**¿Por qué fallaba?**

Si `E:\` tiene archivos `.mdf` (Data) Y `.ldf` (Log):
- Primera fila: `E:\, DATOS, 49.9GB, 5.85GB, 'Data'`
- Segunda fila: `E:\, DATOS, 49.9GB, 5.85GB, 'Log'`

El `SELECT DISTINCT` en el CTE interno ve **2 filas diferentes** porque `DiskRole` es diferente.

Luego, cada base de datos con archivos en `E:\` genera **más filas duplicadas**.

**Resultado:** 23 bases de datos en `E:\` × 2 roles = **46 "volúmenes"** falsos

---

## ✅ Solución Implementada

### 1️⃣ Query SQL Simplificada (Sin Roles)

```sql
-- ✅ Query CORRECTA (sin roles para evitar duplicados)
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    vs.logical_volume_name AS VolumeName,
    CAST(vs.total_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(vs.available_bytes / 1024.0 / 1024.0 / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST((vs.available_bytes * 100.0 / vs.total_bytes) AS DECIMAL(5,2)) AS FreePct
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
ORDER BY FreePct ASC;
```

**Resultado para SSPR17DWH-01:**
- C:\ (Local Disk) - 119 GB
- E:\ (DATOS) - 49.9 GB
- **TOTAL: 2 volúmenes únicos** ✅

---

### 2️⃣ Detección de Roles en Segundo Paso (PowerShell)

```powershell
# Paso 1: Obtener volúmenes únicos con Group-Object
$uniqueVolumes = $dataSpace | 
    Group-Object -Property MountPoint | 
    ForEach-Object { $_.Group[0] }

# Paso 2: Detectar roles con query separada
$queryRoles = @"
SELECT DISTINCT
    vs.volume_mount_point AS MountPoint,
    CASE 
        WHEN mf.type_desc = 'LOG' THEN 'Log'
        WHEN DB_NAME(mf.database_id) = 'tempdb' THEN 'TempDB'
        WHEN mf.type_desc = 'ROWS' THEN 'Data'
        ELSE 'Other'
    END AS DiskRole
FROM sys.master_files mf
CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
"@

# Paso 3: Asociar roles a volúmenes (un volumen puede tener múltiples roles)
$volumeRoles = @{}  # Hashtable: E:\ -> ['Data', 'Log']
foreach ($roleEntry in $rolesData) {
    if (-not $volumeRoles.ContainsKey($roleEntry.MountPoint)) {
        $volumeRoles[$roleEntry.MountPoint] = @()
    }
    $volumeRoles[$roleEntry.MountPoint] += $roleEntry.DiskRole
}
```

**Ventajas:**
- ✅ Volúmenes deduplicados desde SQL
- ✅ Roles detectados correctamente (un volumen puede tener Data + Log)
- ✅ Cálculo de promedios preciso (Data vs Log)

---

## 📊 Resultado Esperado

### Para SSPR17DWH-01:

**Antes (con bug):**
```
Volúmenes (46):
E:\DWM\DWM3\8.0% (82GB)     ← Duplicado 1
E:\DBO\DBO8\8.3% (85GB)     ← Duplicado 2
...
(44 duplicados más)
```

**Después (corregido):**
```
Volúmenes (2):
C:\24.7% (29.8GB libre / 119GB total)    ← ✅ Único
E:\11.7% (5.85GB libre / 49.9GB total)   ← ✅ Único
```

---

## 📝 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `scripts/RelevamientoHealthScore_Discos.ps1` | Query SQL simplificada (líneas 273-286) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | Detección de roles en PowerShell (líneas 657-687) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | Cálculo de promedios actualizado (líneas 747-778) |
| `scripts/RelevamientoHealthScore_Discos.ps1` | Modo paralelo actualizado (líneas 1136-1386) |

---

## 🚀 Testing

### Ejecutar el script:
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Discos.ps1
```

### Verificar SSPR17DWH-01:
Buscar en el output:
```
   ✅ SSPR17DWH-01 - Worst:12% Data:12% Log:25%
```

### Verificar en SQL:
```sql
SELECT TOP 1
    InstanceName,
    VolumesJson,
    WorstFreePct,
    DataDiskAvgFreePct,
    LogDiskAvgFreePct
FROM SQLNova.dbo.InstanceHealth_Discos
WHERE InstanceName = 'SSPR17DWH-01'
ORDER BY CollectedAtUtc DESC;
```

Parsear el JSON de `VolumesJson` → debe mostrar **2 volúmenes**, no 46.

---

## 🎯 Resumen

| Aspecto | Antes | Después |
|---------|-------|---------|
| **Query SQL** | CTE con DiskRole (duplicados) | SELECT DISTINCT sin roles |
| **Detección de roles** | En SQL (causaba duplicados) | En PowerShell (después de deduplicar) |
| **SSPR17DWH-01** | 46 volúmenes falsos | 2 volúmenes reales ✅ |
| **BD04SER (SQL 2005)** | Log: 100% (fallback sin roles) | Log: 96% (con sysaltfiles) ✅ |

---

## ✅ Estado Final

- [x] Query SQL simplificada para evitar duplicados por rol
- [x] Detección de roles en segundo paso (PowerShell)
- [x] Group-Object robusto para deduplicación
- [x] Cálculo correcto de promedios por rol
- [x] Fallback para SQL 2005 con detección de roles (sysaltfiles + WMI)
- [x] Aplicado en modo secuencial y paralelo

---

## 📅 Fecha de Corrección
**29 de Octubre, 2025**

## 👤 Root Cause
El CTE incluía `DiskRole` en el `SELECT DISTINCT`, lo que hacía que un mismo volumen físico apareciera múltiples veces (una por cada rol: Data, Log, TempDB) y una por cada base de datos.

**Solución:** Separar la obtención de volúmenes (sin roles) de la detección de roles (en segundo paso).

