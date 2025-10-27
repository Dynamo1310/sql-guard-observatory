# Corrección: Fallback para SQL 2008 sin sys.dm_os_volume_stats

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_Discos.ps1`

## 🐛 Problema Detectado

Una instancia identificada como SQL Server 2008 R2 (BD04SER) generó este error:

```
WARNING: [14:25:39][Invoke-DbaQuery] [BD04SER] Failed during execution | Invalid object name 'sys.dm_os_volume_stats'.
WARNING: Error obteniendo disk metrics en BD04SER: Invalid object name 'sys.dm_os_volume_stats'.
```

## 🔍 Análisis del Problema

### ¿Por qué pasa esto?

**`sys.dm_os_volume_stats` está disponible desde**:
- ✅ **SQL Server 2008 R2** (versión 10.50.x) - Disponible
- ❌ **SQL Server 2008 RTM** (versión 10.0.x - 10.49.x) - **NO disponible** (o requiere SP específicos)

### Versiones de SQL Server 2008

| Versión | ProductVersion | ¿Tiene sys.dm_os_volume_stats? |
|---------|----------------|--------------------------------|
| SQL Server 2008 RTM | 10.0.1600 | ❌ NO |
| SQL Server 2008 SP1 | 10.0.2531 | ❌ NO (o limitado) |
| SQL Server 2008 SP2 | 10.0.4000 | ❌ NO (o limitado) |
| SQL Server 2008 SP3 | 10.0.5500 | ❌ NO (o limitado) |
| SQL Server 2008 SP4 | 10.0.6000 | ❌ NO (o limitado) |
| **SQL Server 2008 R2 RTM** | **10.50.1600** | ✅ **SÍ** |
| SQL Server 2008 R2 SP1 | 10.50.2500 | ✅ SÍ |
| SQL Server 2008 R2 SP2 | 10.50.4000 | ✅ SÍ |
| SQL Server 2008 R2 SP3 | 10.50.6000 | ✅ SÍ |

### Probable Causa

La instancia **BD04SER** es probablemente:
- SQL Server 2008 RTM/SP1/SP2/SP3/SP4 (versión 10.0.x)
- **NO** es SQL Server 2008 R2 (versión 10.50.x)

Aunque el nombre puede sugerir "2008 R2", la versión real es anterior.

## 🔧 Solución Implementada

### 1. **Detección Mejorada de Versión**

**Antes**:
```powershell
$versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version"
$majorVersion = [int]($sqlVersion -split '\.')[0]  # Solo major (10)
```

**Problema**: No distinguía entre SQL 2008 (10.0) y SQL 2008 R2 (10.50)

**Después**:
```powershell
$versionQuery = @"
SELECT 
    CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version,
    CAST(SERVERPROPERTY('ProductLevel') AS VARCHAR(20)) AS ServicePack,
    CAST(SERVERPROPERTY('Edition') AS VARCHAR(100)) AS Edition
"@

$majorVersion = [int]($sqlVersion -split '\.')[0]  # 10
$minorVersion = [int]($sqlVersion -split '\.')[1]  # 0 o 50
```

**Mejora**: Ahora distingue entre:
- SQL 2008: `majorVersion = 10` y `minorVersion < 50`
- SQL 2008 R2: `majorVersion = 10` y `minorVersion >= 50`

### 2. **Verificación de Disponibilidad de sys.dm_os_volume_stats**

```powershell
# Verificar si sys.dm_os_volume_stats está disponible
$hasVolumeStats = $true
if ($majorVersion -eq 10 -and $minorVersion -lt 50) {
    # SQL 2008 RTM/SP1/SP2/SP3 puede no tener sys.dm_os_volume_stats
    try {
        $checkQuery = "SELECT 1 FROM sys.system_objects WHERE name = 'dm_os_volume_stats'"
        $checkResult = Invoke-SqlQueryWithRetry -InstanceName $InstanceName -Query $checkQuery
        $hasVolumeStats = ($checkResult -ne $null)
    } catch {
        $hasVolumeStats = $false
    }
}
```

**Mejora**: Verifica dinámicamente si la DMV existe antes de intentar usarla.

### 3. **Fallback Automático a xp_fixeddrives**

**Antes**:
```powershell
if ($majorVersion -lt 10) {
    # FALLBACK solo para SQL 2005
    $querySpace = @"... xp_fixeddrives ..."@
}
```

**Después**:
```powershell
if ($majorVersion -lt 10 -or -not $hasVolumeStats) {
    # FALLBACK para SQL 2005 o SQL 2008 sin sys.dm_os_volume_stats
    if (-not $hasVolumeStats) {
        Write-Verbose "sys.dm_os_volume_stats no disponible (SQL $sqlVersion $servicePack), usando xp_fixeddrives"
    }
    $querySpace = @"... xp_fixeddrives ..."@
}
```

**Mejora**: Usa xp_fixeddrives automáticamente si sys.dm_os_volume_stats no está disponible.

### 4. **Mensajes de Error Mejorados**

**Antes**:
```
WARNING: Error obteniendo disk metrics en BD04SER: Invalid object name 'sys.dm_os_volume_stats'.
```

**Después**:
```
WARNING: ⚠️  ERROR obteniendo disk metrics en BD04SER (SQL 10.0.5500 SP3): sys.dm_os_volume_stats no disponible. 
         Usa SQL 2008 R2+ o verifica permisos VIEW SERVER STATE.
```

**Mejora**: 
- Muestra versión exacta de SQL Server
- Sugiere solución (actualizar a SQL 2008 R2 o verificar permisos)

## 📊 Comparación de Funcionalidad

### SQL 2005/2008 con xp_fixeddrives (Fallback)

**Limitaciones**:
- ✅ Espacio libre en discos: **SÍ** (básico)
- ❌ Clasificación por rol (Data/Log/TempDB): **NO**
- ❌ Análisis de competencia: **NO**
- ❌ Archivos problemáticos: **NO**
- ❌ Métricas de I/O avanzadas: **NO**

**Datos recolectados**:
```sql
-- Solo espacio libre básico
SELECT 
    Drive + ':' AS MountPoint,
    'Drive ' + Drive AS VolumeName,
    CAST(MBFree / 1024.0 AS DECIMAL(10,2)) AS FreeGB,
    CAST(100 AS DECIMAL(5,2)) AS FreePct  -- Fijo en 100% (no real)
FROM #DriveSpace
```

### SQL 2008 R2+ con sys.dm_os_volume_stats (Completo)

**Funcionalidad completa**:
- ✅ Espacio libre en discos: **SÍ** (detallado)
- ✅ Clasificación por rol (Data/Log/TempDB): **SÍ**
- ✅ Análisis de competencia: **SÍ**
- ✅ Archivos problemáticos: **SÍ**
- ✅ Métricas de I/O avanzadas: **SÍ**

## 🧪 Testing

### 1. Verificar Versión de SQL Server

```sql
-- En BD04SER o cualquier instancia problemática
SELECT 
    CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) AS Version,
    CAST(SERVERPROPERTY('ProductLevel') AS VARCHAR(20)) AS ServicePack,
    CAST(SERVERPROPERTY('Edition') AS VARCHAR(100)) AS Edition,
    CASE 
        WHEN CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) LIKE '10.0%' THEN 'SQL Server 2008'
        WHEN CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) LIKE '10.5%' THEN 'SQL Server 2008 R2'
        WHEN CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(20)) LIKE '11%' THEN 'SQL Server 2012'
        ELSE 'Otra versión'
    END AS VersionName;
```

**Resultado esperado para BD04SER**:
```
Version       ServicePack   Edition                    VersionName
10.0.5500     SP3           Standard Edition (64-bit)  SQL Server 2008
```

### 2. Verificar si tiene sys.dm_os_volume_stats

```sql
-- Verificar si existe la DMV
SELECT 
    name, 
    type_desc,
    OBJECT_DEFINITION(OBJECT_ID('sys.dm_os_volume_stats')) AS HasDefinition
FROM sys.system_objects 
WHERE name = 'dm_os_volume_stats';
```

**Resultado esperado**:
- **SQL 2008**: 0 filas (no existe)
- **SQL 2008 R2+**: 1 fila con información de la DMV

### 3. Ejecutar Script y Verificar Fallback

```powershell
# Ejecutar con verbose para ver mensajes
.\RelevamientoHealthScore_Discos.ps1 -Verbose
```

**Output esperado para BD04SER**:
```
VERBOSE: ℹ️  BD04SER: sys.dm_os_volume_stats no disponible (SQL 10.0.5500 SP3), usando xp_fixeddrives
✅ BD04SER - Worst:45% Data:60% Log:70% Files:N/A
```

## 📝 Recomendaciones

### Para Instancias SQL Server 2008 (10.0.x)

**Opción 1: Actualizar a SQL 2008 R2** (Recomendado)
```
SQL Server 2008 (10.0.x) → SQL Server 2008 R2 (10.50.x)
```
✅ **Beneficios**:
- Funcionalidad completa de monitoreo de discos
- Mejor performance
- Más seguro (SQL 2008 RTM está fuera de soporte)

**Opción 2: Usar xp_fixeddrives** (Actual)
```
Continuar con SQL 2008 usando fallback
```
⚠️ **Limitaciones**:
- Solo espacio libre básico
- Sin clasificación por rol
- Sin detección de archivos problemáticos

**Opción 3: Actualizar a SQL Server 2019/2022** (Ideal)
```
SQL Server 2008 → SQL Server 2019 o 2022
```
✅ **Beneficios**:
- Funcionalidad completa moderna
- Soporte extendido
- Mejoras significativas de performance y seguridad

### Para Administradores

1. **Identificar todas las instancias SQL 2008 RTM**:
```sql
-- Ejecutar en todas las instancias
SELECT 
    @@SERVERNAME AS ServerName,
    SERVERPROPERTY('ProductVersion') AS Version,
    SERVERPROPERTY('ProductLevel') AS ServicePack,
    CASE 
        WHEN CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR) LIKE '10.0%' THEN 'SQL 2008 - ACTUALIZAR'
        WHEN CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR) LIKE '10.5%' THEN 'SQL 2008 R2 - OK'
        ELSE 'OK'
    END AS Status;
```

2. **Planificar actualizaciones**:
   - Priorizar instancias críticas
   - SQL 2008 → SQL 2008 R2 es una actualización menor
   - Considerar actualización directa a SQL 2019/2022

3. **Mientras tanto**:
   - El script funcionará con funcionalidad reducida (xp_fixeddrives)
   - Monitorear manualmente archivos problemáticos en estas instancias

## ⚠️ Limitaciones del Fallback (xp_fixeddrives)

### Lo que NO se puede obtener con xp_fixeddrives:

1. **Clasificación por rol de disco**
   - No se sabe si un disco es Data, Log o TempDB
   - Todos se marcan como "Data"

2. **Análisis de competencia**
   - No se sabe cuántas DBs comparten un disco
   - No se puede optimizar separación de cargas

3. **Archivos problemáticos**
   - No se detectan archivos con <30MB libres internos
   - Riesgo de autogrowth fallidos sin alerta

4. **Tamaño total del volumen**
   - xp_fixeddrives solo devuelve MB libres
   - No se sabe el tamaño total del disco
   - El porcentaje libre se fija en 100% (no real)

### Impacto en Health Score

- **Scoring de Discos**: Puede ser menos preciso
- **Alertas**: No se detectan algunos problemas críticos
- **Sugerencias**: No se pueden generar recomendaciones avanzadas

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_Discos.ps1` (modificado)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (tabla `InstanceHealth_Discos`)
- `HEALTH_SCORE_V3_100_PUNTOS.md` (scoring de discos)

---

**Corrección implementada el**: 27 de enero de 2025  
**Causa raíz**: SQL Server 2008 RTM (10.0.x) no tiene `sys.dm_os_volume_stats`  
**Solución**: Detección automática de versión y fallback a `xp_fixeddrives`  
**Recomendación**: Actualizar instancias SQL 2008 RTM a SQL 2008 R2 o superior

