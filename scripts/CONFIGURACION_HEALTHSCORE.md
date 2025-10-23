# ⚙️ Configuración Interna del Script HealthScore

Este documento explica cómo configurar el script `RelevamientoHealthScoreMant.ps1` editando las variables internas al inicio del archivo.

---

## 📝 Configuración Interna (Líneas 15-43)

El script tiene todas las opciones de configuración al inicio del archivo. Simplemente edita estos valores y ejecuta el script sin parámetros:

```powershell
.\RelevamientoHealthScoreMant.ps1
```

---

## 🔧 Sección 1: Configuración General

```powershell
# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InstanceHealthSnapshot"
$TimeoutSec  = 10
```

| Variable | Descripción | Valor Default |
|----------|-------------|---------------|
| `$ApiUrl` | URL de la API de inventario | `http://asprbm-nov-01/InventoryDBA/inventario/` |
| `$SqlServer` | Servidor SQL central | `SSPR17MON-01` |
| `$SqlDatabase` | Base de datos destino | `SQLNova` |
| `$SqlSchema` | Schema de la tabla | `dbo` |
| `$SqlTable` | Nombre de la tabla | `InstanceHealthSnapshot` |
| `$TimeoutSec` | Timeout SQL en segundos | `10` |

---

## 📁 Sección 2: Archivos de Salida

```powershell
# Archivos de salida
$OutJson     = ".\InstanceHealth.json"
$OutCsv      = ".\InstanceHealth.csv"
```

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `$OutJson` | Ruta del archivo JSON | `"C:\Reports\Health_$(Get-Date -Format 'yyyyMMdd').json"` |
| `$OutCsv` | Ruta del archivo CSV | `"C:\Reports\Health_$(Get-Date -Format 'yyyyMMdd').csv"` |

**Tip**: Puedes usar expresiones para archivos con timestamp:
```powershell
$OutJson = ".\Health_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
```

---

## ⚡ Sección 3: Procesamiento Paralelo

```powershell
# Procesamiento paralelo
$UseParallel = $true   # Cambiar a $false para procesamiento secuencial
$Throttle    = 8       # Número de threads paralelos (si UseParallel = $true)
```

| Variable | Descripción | Valores |
|----------|-------------|---------|
| `$UseParallel` | Habilita procesamiento paralelo | `$true` (recomendado) / `$false` |
| `$Throttle` | Número de threads simultáneos | `8` (default), `10-16` (recomendado para muchas instancias) |

**Recomendaciones**:
- **50-100 instancias**: `$Throttle = 8`
- **100-300 instancias**: `$Throttle = 12`
- **300+ instancias**: `$Throttle = 16`

---

## 💾 Sección 4: Escritura a SQL

```powershell
# Escritura a SQL
$WriteToSql  = $false  # Cambiar a $true para guardar en base de datos SQL
```

| Variable | Descripción | Valores |
|----------|-------------|---------|
| `$WriteToSql` | Guarda en tabla SQL | `$true` / `$false` (default) |

**⚠️ IMPORTANTE**: 
- `$false` = Solo genera archivos JSON y CSV (útil para pruebas)
- `$true` = Guarda en `SSPR17MON-01.SQLNova.dbo.InstanceHealthSnapshot` + archivos

---

## 🧪 Sección 5: Modo de Prueba

```powershell
# ========= MODO DE PRUEBA =========
$TestMode = $false  # Cambiar a $true para pruebas rápidas
$TestLimit = 5      # Número máximo de instancias a procesar en modo prueba
```

| Variable | Descripción | Valores |
|----------|-------------|---------|
| `$TestMode` | Activa modo de prueba | `$true` / `$false` (default) |
| `$TestLimit` | Límite de instancias en modo test | `5` (default), `10`, `20`, etc. |

**Cuando `$TestMode = $true`**:
- ✅ Procesa solo `$TestLimit` instancias
- ✅ Salida detallada en consola
- ✅ Banner visual claro
- ✅ NO escribe a SQL por defecto (a menos que `$WriteToSql = $true`)

---

## 🌐 Sección 6: Filtros de Instancias AWS

```powershell
# ========= FILTROS DE INSTANCIAS =========
$IncludeAWS = $true   # Cambiar a $false para excluir instancias AWS
$OnlyAWS = $false     # Cambiar a $true para procesar SOLO instancias AWS
```

| Variable | Descripción | Valores | Efecto |
|----------|-------------|---------|--------|
| `$IncludeAWS` | Incluir instancias AWS | `$true` (default) | Procesa On-Premise + AWS |
| | | `$false` | Solo On-Premise (excluye AWS) |
| `$OnlyAWS` | Procesar solo AWS | `$true` | Solo instancias AWS |
| | | `$false` (default) | Según `$IncludeAWS` |

**Ejemplos de Configuración**:

### 1️⃣ Todas las Instancias (Default)
```powershell
$IncludeAWS = $true
$OnlyAWS = $false
# Resultado: On-Premise + AWS
```

### 2️⃣ Solo On-Premise (Sin AWS)
```powershell
$IncludeAWS = $false
$OnlyAWS = $false
# Resultado: Solo On-Premise
```

### 3️⃣ Solo AWS
```powershell
$IncludeAWS = $true  # Valor no importa cuando OnlyAWS = true
$OnlyAWS = $true
# Resultado: Solo AWS
```

**Nota**: El script siempre excluye instancias con "DMZ" en el nombre, independientemente de estos filtros.

---

## 📋 Ejemplos de Configuraciones Comunes

### Ejemplo 1: Modo de Prueba Rápida
```powershell
$TestMode = $true         # Activar modo prueba
$TestLimit = 5            # Solo 5 instancias
$UseParallel = $false     # Secuencial (más claro para debug)
$WriteToSql = $false      # Solo archivos locales
$IncludeAWS = $true       # Incluir todo
$OnlyAWS = $false
```

**Ejecutar**: 
```powershell
.\RelevamientoHealthScoreMant.ps1
```

---

### Ejemplo 2: Producción Completa con SQL
```powershell
$TestMode = $false        # Todas las instancias
$UseParallel = $true      # Paralelo (más rápido)
$Throttle = 10            # 10 threads
$WriteToSql = $true       # Guardar en SQL
$IncludeAWS = $true       # Incluir AWS
$OnlyAWS = $false
```

**Ejecutar**: 
```powershell
.\RelevamientoHealthScoreMant.ps1
```

---

### Ejemplo 3: Solo Instancias AWS en Modo Test
```powershell
$TestMode = $true
$TestLimit = 10           # Más instancias para AWS
$UseParallel = $true
$Throttle = 5
$WriteToSql = $false
$IncludeAWS = $true
$OnlyAWS = $true         # Solo AWS
```

**Ejecutar**: 
```powershell
.\RelevamientoHealthScoreMant.ps1
```

---

### Ejemplo 4: Solo On-Premise para Task Scheduler
```powershell
$TestMode = $false
$UseParallel = $true
$Throttle = 12
$WriteToSql = $true
$IncludeAWS = $false     # Excluir AWS
$OnlyAWS = $false

# Archivos con timestamp
$OutJson = "C:\Reports\HealthScore\Health_OnPrem_$(Get-Date -Format 'yyyyMMdd').json"
$OutCsv = "C:\Reports\HealthScore\Health_OnPrem_$(Get-Date -Format 'yyyyMMdd').csv"
```

**Ejecutar en Task Scheduler**: 
```powershell
pwsh.exe -File "C:\Scripts\RelevamientoHealthScoreMant.ps1"
```

---

## 🔄 Cómo Cambiar la Configuración

### Opción 1: Editar el Archivo Directamente

1. Abrir el archivo en tu editor favorito:
   ```powershell
   code .\RelevamientoHealthScoreMant.ps1
   # o
   notepad .\RelevamientoHealthScoreMant.ps1
   ```

2. Ir a las líneas 15-43 (sección de configuración)

3. Cambiar los valores deseados:
   ```powershell
   $TestMode = $true        # <- Cambiar aquí
   $WriteToSql = $true      # <- Y aquí
   $IncludeAWS = $false     # <- Y aquí
   ```

4. Guardar el archivo

5. Ejecutar sin parámetros:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

---

### Opción 2: Crear Múltiples Versiones del Script

Si necesitas ejecutar diferentes configuraciones frecuentemente, puedes crear copias:

```powershell
# En la carpeta scripts/
Copy-Item RelevamientoHealthScoreMant.ps1 Health_Test.ps1
Copy-Item RelevamientoHealthScoreMant.ps1 Health_Production.ps1
Copy-Item RelevamientoHealthScoreMant.ps1 Health_AWS_Only.ps1
Copy-Item RelevamientoHealthScoreMant.ps1 Health_OnPremise_Only.ps1
```

Luego edita cada uno con la configuración deseada:

- **Health_Test.ps1**: `$TestMode = $true`, `$WriteToSql = $false`
- **Health_Production.ps1**: `$TestMode = $false`, `$WriteToSql = $true`
- **Health_AWS_Only.ps1**: `$OnlyAWS = $true`, `$WriteToSql = $true`
- **Health_OnPremise_Only.ps1**: `$IncludeAWS = $false`, `$WriteToSql = $true`

---

## 🚀 Quick Start

### Primera Vez (Prueba)

1. Abrir `RelevamientoHealthScoreMant.ps1`
2. Cambiar una sola línea:
   ```powershell
   $TestMode = $true  # Línea 35
   ```
3. Guardar y ejecutar:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

### Para Producción

1. Abrir `RelevamientoHealthScoreMant.ps1`
2. Cambiar dos líneas:
   ```powershell
   $TestMode = $false   # Línea 35
   $WriteToSql = $true  # Línea 32
   ```
3. Opcional - Habilitar paralelo:
   ```powershell
   $UseParallel = $true  # Línea 28 (ya está por default)
   $Throttle = 10        # Línea 29 (cambiar de 8 a 10)
   ```
4. Guardar y ejecutar:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

---

## 🔍 Verificar Configuración Actual

Para ver qué configuración tiene actualmente el script sin ejecutarlo:

```powershell
# Ver las primeras 50 líneas del script (donde está la configuración)
Get-Content .\RelevamientoHealthScoreMant.ps1 | Select-Object -First 50 | Select-String -Pattern '^\$'
```

O abrir y buscar la sección `========= CONFIGURACIÓN =========`

---

## 🐛 Solución de Problemas

### El script sigue pidiendo parámetros

**Problema**: Ejecutas el script pero no lee la configuración interna.

**Solución**: Verifica que estés ejecutando el script sin parámetros:
```powershell
# ✅ CORRECTO
.\RelevamientoHealthScoreMant.ps1

# ❌ INCORRECTO (esto ignora la configuración interna)
.\RelevamientoHealthScoreMant.ps1 -TestMode
```

### No guarda en SQL aunque $WriteToSql = $true

**Problema**: El error de certificado SSL.

**Solución**: Ya está arreglado en la última versión. El script ahora usa `TrustServerCertificate = $true` en todas las conexiones SQL.

Si aún tienes problemas, verifica:
1. Conectividad al servidor: `Test-NetConnection SSPR17MON-01 -Port 1433`
2. Permisos en la base de datos SQLNova
3. Revisa el mensaje de error completo

### El filtro de AWS no funciona

**Problema**: Siguen apareciendo instancias AWS cuando `$IncludeAWS = $false`.

**Solución**: Verifica que el campo `hostingSite` en la API tenga el valor correcto. Debe ser exactamente "AWS" (case insensitive).

---

## 📞 Ayuda Adicional

Para documentación completa:
- **README_HEALTHSCORE.md**: Documentación técnica detallada
- **QUICKSTART_HEALTHSCORE.md**: Guía rápida de 5 minutos
- **IMPLEMENTACION_HEALTHSCORE.md**: Arquitectura y casos de uso

Para ayuda del script:
```powershell
Get-Help .\RelevamientoHealthScoreMant.ps1 -Full
```

---

**Versión**: 1.1  
**Última actualización**: Octubre 2024  
**Equipo**: SQL Guard Observatory

