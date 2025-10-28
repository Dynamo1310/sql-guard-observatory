# 🔧 Arreglo: Valores en 0 en ConfiguracionTempdb

## 📋 Problema Identificado

El script `RelevamientoHealthScore_ConfiguracionTempdb.ps1` está devolviendo valores en 0 para varias instancias:

```
TempDB Size / Used: 0.0 / 0.0 GB
Max Server Memory: 0.0 GB
% of Physical: 0.0% ⚠️
```

## 🔍 Causas Principales

### 1. **Max Memory = 0 GB** (ESPERADO en algunos casos)
Si el servidor tiene configurado Max Server Memory en el valor por defecto `2147483647` (UNLIMITED), el script **intencionalmente** lo convierte a `0` para marcarlo como "no configurado".

**✅ Esto es correcto por diseño.**

### 2. **TempDB Size/Used = 0 GB** (PROBLEMA)
Posibles causas:
- **SQL Server 2008 o anterior**: La query `sys.dm_db_file_space_usage` solo está disponible en SQL 2012+
- **Falta de permisos**: El usuario no tiene permiso `VIEW SERVER STATE`
- **Errores silenciosos**: Los bloques `catch` estaban ocultando los errores
- **Timeout**: La query tarda más de 15 segundos

### 3. **% of Physical = 0%** (EFECTO CASCADA)
Si `MaxServerMemoryMB = 0` o `TotalPhysicalMemoryMB = 0`, el porcentaje también será 0.

---

## ✅ Soluciones Implementadas

### 1. **Logging Detallado**
Se agregaron `Write-Warning` y `Write-Verbose` en todos los bloques críticos:

```powershell
# Antes (error silencioso)
catch {
    # sys.dm_db_file_space_usage puede no estar disponible
}

# Después (error visible)
catch {
    Write-Warning "⚠️  ${InstanceName}: Error obteniendo espacio de TempDB: $($_.Exception.Message)"
    $result.Details += "SpaceQueryFailed"
}
```

### 2. **Detección de Versión SQL Server**
Se agregó lógica para SQL Server 2008 y anterior:

```powershell
if ($majorVersion -ge 11) {
    # SQL 2012+ → Usar sys.dm_db_file_space_usage
}
else {
    Write-Verbose "${InstanceName}: SQL $majorVersion - sys.dm_db_file_space_usage no disponible"
    $result.Details += "SQL2008-NoSpaceData"
}
```

### 3. **Validación de Resultados**
Se agregaron validaciones para detectar resultados vacíos:

```powershell
if ($spaceUsage) {
    # Procesar datos
}
else {
    Write-Warning "⚠️  ${InstanceName}: Query no retornó datos"
    $result.Details += "NoSpaceData"
}
```

### 4. **Identificación en `ConfigDetails`**
Ahora el campo `ConfigDetails` incluye flags para diagnóstico:
- `NoSpaceData`: Query de espacio no retornó datos
- `SpaceQueryFailed`: Error ejecutando query de espacio
- `MaxMemQueryEmpty`: Query de Max Memory vacía
- `MaxMemQueryFailed`: Error en query de Max Memory
- `SQL2008-NoSpaceData`: SQL 2008 (DMV no disponible)
- `TempDBFilesQueryFailed`: Error en query de archivos

---

## 🛠️ Diagnóstico: Cómo Identificar el Problema

### Paso 1: Ejecutar Script de Diagnóstico
Se creó un script especializado para diagnosticar problemas en instancias específicas:

```powershell
.\Diagnosticar-ConfigTempdb.ps1 -InstanceName "MISERVIDOR\INSTANCIA"
```

**Este script ejecuta 6 tests:**
1. ✅ Conexión básica
2. ✅ Detección de versión SQL Server
3. ✅ Archivos de TempDB (`sys.master_files`)
4. ✅ Espacio usado en TempDB (`sys.dm_db_file_space_usage`)
5. ✅ Max Server Memory (`sys.configurations`)
6. ✅ Memoria física (`sys.dm_os_sys_info`)
7. ✅ Permisos (`VIEW SERVER STATE`)

### Paso 2: Interpretar Resultados

#### ✅ **Caso 1: Max Memory = UNLIMITED (NORMAL)**
```
TEST 4: Max Server Memory
✅ Query exitosa
   Max Memory: UNLIMITED (valor por defecto, NO configurado)
   ⚠️  Esto se traduce a 0 en el script (por diseño)
```

**Acción:** Ninguna. Esto es esperado si el servidor no tiene Max Memory configurado.

#### ❌ **Caso 2: Error de Permisos**
```
TEST 6: Permisos (VIEW SERVER STATE)
   ❌ VIEW SERVER STATE: NO (PUEDE CAUSAR PROBLEMAS)
```

**Acción:** Ejecutar el script con una cuenta que tenga permisos `VIEW SERVER STATE` o `sysadmin`.

#### ⚠️ **Caso 3: SQL Server 2008 o Anterior**
```
TEST 3: Espacio Usado en TempDB (SQL 2012+)
⏭️  SKIPPED: Requiere SQL Server 2012+ (versión actual: 10)
```

**Acción:** Aceptable. SQL 2008 no tiene la DMV `sys.dm_db_file_space_usage`. Los valores de espacio usado quedarán en 0.

#### ❌ **Caso 4: Timeout o Error de Query**
```
TEST 2: Archivos de TempDB
❌ Error: Timeout expired. The timeout period elapsed...
```

**Acción:** Aumentar el timeout en el script (línea 53):
```powershell
$TimeoutSec = 30  # Aumentar de 15 a 30 segundos
```

---

## 📝 Verificación Post-Arreglo

### 1. **Ejecutar Script con Logging Detallado**
```powershell
.\scripts\RelevamientoHealthScore_ConfiguracionTempdb.ps1 -Verbose
```

Ahora verás mensajes como:
```
⚠️  SERVER01\SQL2019: sys.dm_db_file_space_usage no retornó datos
⚠️  SERVER02\SQL2008: sys.dm_db_file_space_usage no disponible (requiere SQL 2012+)
⚠️  SERVER03\SQL2022: Error obteniendo Max Server Memory: Timeout expired
```

### 2. **Revisar Campo `ConfigDetails` en BD**
```sql
SELECT TOP 20
    InstanceName,
    TempDBFileCount,
    TempDBTotalSizeMB,
    MaxServerMemoryMB,
    TotalPhysicalMemoryMB,
    ConfigDetails  -- <-- Aquí verás los flags de diagnóstico
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE TempDBTotalSizeMB = 0 OR MaxServerMemoryMB = 0
ORDER BY CollectedAtUtc DESC;
```

**Ejemplo de resultados:**
```
InstanceName          | TempDBTotalSizeMB | MaxServerMemoryMB | ConfigDetails
----------------------|-------------------|-------------------|---------------------------
SERVER01\SQL2019      | 0                 | 0                 | Files=4|NoSpaceData|MaxMem=UNLIMITED(NotSet)
SERVER02\SQL2008      | 0                 | 16384             | Files=1|SQL2008-NoSpaceData
SERVER03\SQL2022      | 8192              | 0                 | Files=8|MaxMemQueryFailed
```

---

## 🎯 Casos Específicos y Soluciones

| Síntoma | Causa Probable | Solución |
|---------|---------------|----------|
| **Max Memory = 0, ConfigDetails contiene "UNLIMITED"** | Valor por defecto (no configurado) | ✅ Normal. Considerar configurar Max Memory |
| **TempDB Size = 0, ConfigDetails contiene "SQL2008"** | SQL Server 2008 o anterior | ✅ Esperado. DMV no disponible en esa versión |
| **TempDB Size = 0, ConfigDetails contiene "NoSpaceData"** | Query vacía o sin permisos | ❌ Revisar permisos `VIEW SERVER STATE` |
| **ConfigDetails contiene "SpaceQueryFailed"** | Error ejecutando query | ❌ Revisar logs con `-Verbose`, aumentar timeout |
| **Todos los valores en 0, ConfigDetails contiene "GeneralError"** | Error catastrófico | ❌ Revisar conectividad, versión SQL, credenciales |
| **Physical Memory = 0** | Error en `sys.dm_os_sys_info` | ❌ Versión SQL incompatible o permisos faltantes |

---

## 🚀 Acciones Recomendadas

### Para Instancias con Max Memory = UNLIMITED
```sql
-- Calcular Max Memory recomendado (dejar 20% para OS)
SELECT 
    CAST(physical_memory_kb / 1024 * 0.80 AS INT) AS MaxMemoryRecomendadoMB
FROM sys.dm_os_sys_info;

-- Configurar Max Memory (ejemplo: 12 GB)
EXEC sp_configure 'max server memory (MB)', 12288;
RECONFIGURE;
```

### Para SQL Server 2008 (sin sys.dm_db_file_space_usage)
Crear un query alternativo manual:
```sql
-- Obtener tamaño de archivos de TempDB (SQL 2008 compatible)
SELECT 
    SUM(size * 8 / 1024) AS TotalSizeMB
FROM sys.master_files
WHERE database_id = DB_ID('tempdb');
```

### Para Problemas de Permisos
```sql
-- Otorgar permiso VIEW SERVER STATE a la cuenta del collector
USE master;
GO
GRANT VIEW SERVER STATE TO [DOMINIO\UsuarioCollector];
GO
```

---

## 📊 Impacto en HealthScore v3

El script `RelevamientoHealthScore_ConfiguracionTempdb.ps1` tiene un peso del **8%** en el HealthScore v3 final:

```
Fórmula: 60% TempDB Health Score + 40% Memoria Configurada

TempDB Health Score (0-100 puntos):
- 40% Contención (PAGELATCH waits)
- 30% Latencia de disco (write latency)
- 20% Configuración (archivos, same size, growth)
- 10% Recursos (espacio libre, version store)
```

**Si los valores están en 0:**
- ❌ **Max Memory = 0** → Penalización del 40% en la métrica de memoria
- ❌ **TempDB Size = 0** → No afecta directamente al score (se usa FileCount y latencia)
- ⚠️ **Physical Memory = 0** → No se puede calcular % óptimo de Max Memory

---

## 📁 Archivos Modificados

1. ✅ `scripts/RelevamientoHealthScore_ConfiguracionTempdb.ps1`
   - Agregado logging detallado en todos los bloques try-catch
   - Validación de resultados vacíos
   - Flags de diagnóstico en `ConfigDetails`
   - Mensajes de error informativos

2. ✅ `Diagnosticar-ConfigTempdb.ps1` (NUEVO)
   - Script especializado para diagnosticar problemas
   - 6 tests individuales
   - Output claro y accionable

3. ✅ `ARREGLO_VALORES_CERO_TEMPDB.md` (ESTE ARCHIVO)
   - Documentación completa del problema y soluciones

---

## 🧪 Testing

### Test 1: Instancia Normal (SQL 2019+, Max Memory configurado)
```powershell
.\Diagnosticar-ConfigTempdb.ps1 -InstanceName "SERVER01\SQL2019"
```
**Resultado esperado:** ✅ Todos los tests OK

### Test 2: Instancia con Max Memory UNLIMITED
```powershell
.\Diagnosticar-ConfigTempdb.ps1 -InstanceName "SERVER02\SQL2022"
```
**Resultado esperado:** ⚠️ Test 4 muestra "UNLIMITED (valor por defecto)"

### Test 3: SQL Server 2008
```powershell
.\Diagnosticar-ConfigTempdb.ps1 -InstanceName "LEGACY\SQL2008"
```
**Resultado esperado:** ⏭️ Test 3 SKIPPED (DMV no disponible)

### Test 4: Sin Permisos VIEW SERVER STATE
```powershell
.\Diagnosticar-ConfigTempdb.ps1 -InstanceName "SERVER03\SQL2019"
```
**Resultado esperado:** ❌ Test 6 muestra falta de permisos

---

## 🎓 Notas Finales

1. **Max Memory = 0 NO siempre es un error**. Puede ser el valor por defecto (UNLIMITED).

2. **TempDB Size = 0 en SQL 2008** es esperado y no hay forma de obtener el espacio usado con `sys.dm_db_file_space_usage`.

3. El script ahora **registra todos los errores** en:
   - Consola (con `-Verbose`)
   - Campo `ConfigDetails` en la BD

4. Usa **`Diagnosticar-ConfigTempdb.ps1`** para identificar rápidamente qué query está fallando en instancias problemáticas.

---

**Autor:** SQL Guard Observatory Team  
**Fecha:** 28 de Octubre, 2025  
**Versión:** 3.0.1 (con diagnóstico mejorado)

