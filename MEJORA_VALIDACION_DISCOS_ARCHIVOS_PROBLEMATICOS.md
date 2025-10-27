# Mejora: Validación y Manejo de Errores en Archivos Problemáticos (Discos)

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_Discos.ps1`

## ❓ Pregunta del Usuario

> El script de discos me dio ese resumen donde no tengo instancias con archivos problemáticos ni archivos con menos de 30 MB libres, **¿me puedo confiar de esos datos?**

## 🚨 Respuesta: NO completamente (antes de esta mejora)

**ANTES de esta mejora**:  No podías confiar al 100%, porque el script podía fallar silenciosamente al obtener archivos problemáticos.

**DESPUÉS de esta mejora**: Ahora el script te avisará si falló la query, permitiéndote saber si los datos son confiables o no.

## 🐛 Problemas Detectados

### 1. **Query de Archivos Problemáticos Podía Fallar Silenciosamente**

La query usaba `FILEPROPERTY(mf.name, 'SpaceUsed')` que puede fallar si:
- Bases de datos están OFFLINE
- Bases de datos en modo READ ONLY
- Bases de datos en proceso de RESTORING/RECOVERING
- Problemas de permisos
- Instancia es SQL Server 2005 (no soportado)

**Antes**:
```sql
SELECT ...
    CAST((mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 AS DECIMAL(10,2)) AS FreeSpaceInFileMB
FROM sys.master_files mf
WHERE DB_NAME(mf.database_id) NOT IN ('master', 'model', 'msdb', 'tempdb')
  AND mf.growth != 0
  AND (mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 < 30
```

**Problema**: Si una base está offline, `FILEPROPERTY` falla y toda la query puede fallar.

### 2. **Si la Query Fallaba, Asumía 0 Archivos Problemáticos**

```powershell
# Antes
$dataProblematicFiles = Invoke-SqlQueryWithRetry -InstanceName $InstanceName ...

if ($dataProblematicFiles) {
    # Procesar archivos
}
$problematicFileCount = if ($problematicFilesInVolume) { ... } else { 0 }
```

**Problema**: Si `$dataProblematicFiles` era `$null` (query falló), simplemente asumía que no había archivos problemáticos, **sin avisar del error**.

### 3. **Se Ejecutaba en SQL 2005 (No Soportado)**

La query decía "compatible SQL 2008+" pero se ejecutaba en todas las versiones, incluyendo SQL 2005.

## 🔧 Mejoras Implementadas

### 1. **Query Mejorada: Ignora Bases Offline/ReadOnly**

**Después**:
```sql
SELECT ...
    CAST((mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 AS DECIMAL(10,2)) AS FreeSpaceInFileMB
FROM sys.master_files mf
INNER JOIN sys.databases d ON mf.database_id = d.database_id
WHERE d.name NOT IN ('master', 'model', 'msdb', 'tempdb')
  AND d.state = 0  -- ONLINE (evita errores con bases offline)
  AND d.is_read_only = 0  -- No read-only
  AND mf.growth != 0
  AND (mf.size - FILEPROPERTY(mf.name, 'SpaceUsed')) * 8.0 / 1024 < 30
```

**Mejora**: Solo evalúa bases **ONLINE** y **no read-only**, evitando errores con `FILEPROPERTY`.

### 2. **Validación de Versión SQL**

```powershell
# Solo ejecutar en SQL 2008+ (versión 10.x o superior)
if ($majorVersion -ge 10) {
    try {
        $dataProblematicFiles = Invoke-SqlQueryWithRetry ...
    } catch {
        $problematicFilesQueryFailed = $true
        Write-Warning "⚠️  No se pudo obtener archivos problemáticos en ${InstanceName}: ..."
    }
} else {
    # SQL 2005: No soportado
    Write-Verbose "ℹ️  Archivos problemáticos no disponible en SQL 2005 para ${InstanceName}"
}
```

**Mejora**: 
- SQL 2005: No intenta ejecutar la query (no soportado)
- SQL 2008+: Ejecuta con manejo de errores explícito

### 3. **Warnings Visibles en Consola**

**Antes**:
```
✅ SSPR17-01 - Worst:15% Data:40% Log:30% Files:0
```

**Después (si hay error)**:
```
WARNING: ⚠️  No se pudo obtener archivos problemáticos en SSPR17-01: Execution Timeout Expired
✅ SSPR17-01 - Worst:15% Data:40% Log:30% Files:?
```

### 4. **Resumen Mejorado con Advertencias**

**Antes**:
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DISCOS                                     ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                            ║
║  ...                                                  ║
║  Instancias con archivos problemáticos: 0             ║
║  Total archivos con <30MB libres: 0                   ║
╚═══════════════════════════════════════════════════════╝
```

**Después (si hay errores)**:
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DISCOS                                     ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                            ║
║  ...                                                  ║
║  Instancias con archivos problemáticos: 3             ║
║  Total archivos con <30MB libres: 15                  ║
║                                                       ║
║  ⚠️  Instancias con error en query de archivos: 5    ║  ← NUEVO
║      (Datos de archivos problemáticos incompletos)    ║  ← NUEVO
╚═══════════════════════════════════════════════════════╝
```

**Interpretación**:
- Si no aparece el warning de "error en query": Datos 100% confiables
- Si aparece warning: Datos incompletos, puede haber más archivos problemáticos

## 📊 Cómo Interpretar los Resultados Ahora

### Escenario 1: Sin Advertencias
```
║  Instancias con archivos problemáticos: 0
║  Total archivos con <30MB libres: 0
```
✅ **Datos confiables**: No hay instancias con errores, los datos son correctos

### Escenario 2: Con Advertencias
```
║  Instancias con archivos problemáticos: 0
║  Total archivos con <30MB libres: 0
║
║  ⚠️  Instancias con error en query de archivos: 5
```
⚠️ **Datos NO completamente confiables**: 5 instancias tuvieron errores, puede haber archivos problemáticos que no se detectaron

### Escenario 3: Con Datos y Advertencias
```
║  Instancias con archivos problemáticos: 3
║  Total archivos con <30MB libres: 15
║
║  ⚠️  Instancias con error en query de archivos: 2
```
⚠️ **Datos parcialmente confiables**: Hay 15 archivos problemáticos detectados, pero puede haber más en las 2 instancias con error

## 🔍 Causas Comunes de Errores en la Query

### 1. Bases de Datos Offline
```sql
-- Identificar bases offline
SELECT name, state_desc
FROM sys.databases
WHERE state_desc <> 'ONLINE';
```

**Solución**: La query mejorada ignora automáticamente bases offline

### 2. Bases de Datos Read-Only
```sql
-- Identificar bases read-only
SELECT name, is_read_only
FROM sys.databases
WHERE is_read_only = 1;
```

**Solución**: La query mejorada ignora automáticamente bases read-only

### 3. Timeouts en Instancias Lentas
```
WARNING: ⚠️  No se pudo obtener archivos problemáticos en SSISC-01: Execution Timeout Expired
```

**Solución**: Aumentar timeout en el script:
```powershell
$TimeoutSec = 30  # Aumentar a 45 o 60 si es necesario
```

### 4. SQL Server 2005
```
ℹ️  Archivos problemáticos no disponible en SQL 2005 para OLD-SERVER
```

**Solución**: No hay solución, SQL 2005 no soporta esta funcionalidad de manera confiable

## 🧪 Testing

### 1. Ejecutar Script y Revisar Warnings

```powershell
.\RelevamientoHealthScore_Discos.ps1
```

**Verificar**:
- ¿Aparecen warnings durante la ejecución?
- ¿Aparece mensaje de "error en query de archivos" en el resumen?

### 2. Validar en Base de Datos

```sql
-- Ver últimas recolecciones de discos
SELECT TOP 10
    InstanceName,
    WorstFreePct,
    DataDiskAvgFreePct,
    CollectedAtUtc
FROM dbo.InstanceHealth_Discos
ORDER BY CollectedAtUtc DESC;
```

### 3. Verificar Bases Offline en Instancias Específicas

Si una instancia tiene warning de archivos problemáticos:

```sql
-- En la instancia problemática
SELECT name, state_desc, is_read_only
FROM sys.databases
WHERE state_desc <> 'ONLINE' OR is_read_only = 1;
```

### 4. Verificar Archivos Manualmente

Para verificar si realmente hay archivos problemáticos:

```sql
-- Ejecutar en la instancia directamente
USE [TU_BASE_DE_DATOS];
GO

SELECT 
    name AS FileName,
    type_desc AS FileType,
    CAST(size * 8.0 / 1024 AS DECIMAL(10,2)) AS FileSizeMB,
    CAST((size - FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024 AS DECIMAL(10,2)) AS FreeSpaceInFileMB,
    CAST(growth * 8.0 / 1024 AS DECIMAL(10,2)) AS GrowthMB,
    is_percent_growth
FROM sys.database_files
WHERE growth != 0
  AND (size - FILEPROPERTY(name, 'SpaceUsed')) * 8.0 / 1024 < 30;
```

## 📝 Recomendaciones

### 1. Si Ves 0 Archivos Problemáticos SIN Warnings
✅ **Puedes confiar**: Los datos son correctos

### 2. Si Ves 0 Archivos Problemáticos CON Warnings
⚠️ **No confíes al 100%**: Investiga las instancias con error

**Acciones**:
1. Identificar qué instancias tuvieron error (buscar en el output del script)
2. Conectar manualmente a esas instancias
3. Ejecutar la query de archivos problemáticos directamente
4. Verificar si hay bases offline/read-only

### 3. Si Ves Archivos Problemáticos CON Warnings
⚠️ **Datos parciales**: Hay archivos problemáticos, pero puede haber más

**Acciones**:
1. Priorizar los archivos ya detectados
2. Investigar instancias con error por separado
3. Considerar aumentar timeout si muchas instancias fallan

### 4. Para Eliminar Warnings Persistentes

#### Opción A: Poner Bases Online
```sql
ALTER DATABASE [MiBaseDeDatos] SET ONLINE;
```

#### Opción B: Excluir Instancias Problemáticas
```powershell
# En el script, agregar filtro
$instances = $instances | Where-Object { 
    $_.NombreInstancia -notin @('INSTANCIA1', 'INSTANCIA2')
}
```

#### Opción C: Aumentar Timeout
```powershell
$TimeoutSec = 45  # O 60
```

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_Discos.ps1` (modificado)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (tabla `InstanceHealth_Discos`)
- `HEALTH_SCORE_V3_100_PUNTOS.md` (scoring de discos)

## 📊 Ejemplo Real

### Antes (Sin Mejoras)
```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DISCOS                                     ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                            ║
║  Instancias con archivos problemáticos: 0             ║
║  Total archivos con <30MB libres: 0                   ║
╚═══════════════════════════════════════════════════════╝

Interpretación: "Todo está bien" ✅
Realidad: Puede que 5 instancias hayan fallado y tengan archivos problemáticos ⚠️
```

### Después (Con Mejoras)
```
WARNING: ⚠️  No se pudo obtener archivos problemáticos en SERVER1: Timeout
WARNING: ⚠️  No se pudo obtener archivos problemáticos en SERVER2: Timeout

╔═══════════════════════════════════════════════════════╗
║  RESUMEN - DISCOS                                     ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                            ║
║  Instancias con archivos problemáticos: 0             ║
║  Total archivos con <30MB libres: 0                   ║
║                                                       ║
║  ⚠️  Instancias con error en query de archivos: 2    ║
║      (Datos de archivos problemáticos incompletos)    ║
╚═══════════════════════════════════════════════════════╝

Interpretación: "No hay archivos problemáticos detectados, pero 2 instancias fallaron" ⚠️
Acción: Investigar SERVER1 y SERVER2 manualmente
```

---

**Mejora implementada el**: 27 de enero de 2025  
**Beneficio**: Transparencia y confiabilidad en los datos de archivos problemáticos

