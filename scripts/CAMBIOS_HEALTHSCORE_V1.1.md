# 📝 Cambios Realizados - HealthScore v1.1

## Resumen

Se ha actualizado el script `RelevamientoHealthScoreMant.ps1` para incluir configuración interna (sin necesidad de parámetros) y soporte completo para filtrado de instancias AWS, además de resolver el error de certificado SSL.

---

## ✅ Cambios Principales

### 1. 🔧 Configuración Interna (Estilo "Jobs Script")

El script ahora tiene **todas las configuraciones al inicio** del archivo (líneas 15-43). Ya NO necesitas pasar parámetros por línea de comandos.

**Antes**:
```powershell
# Tenías que pasar parámetros cada vez
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 10 -WriteToSql -TestLimit 5
```

**Ahora**:
```powershell
# Solo editas el archivo una vez y ejecutas:
.\RelevamientoHealthScoreMant.ps1
```

**Variables de Configuración Disponibles**:

```powershell
# ========= CONFIGURACIÓN =========
$ApiUrl      = "http://asprbm-nov-01/InventoryDBA/inventario/"
$SqlServer   = "SSPR17MON-01"
$SqlDatabase = "SQLNova"
$SqlSchema   = "dbo"
$SqlTable    = "InstanceHealthSnapshot"
$TimeoutSec  = 10

# Archivos de salida
$OutJson     = ".\InstanceHealth.json"
$OutCsv      = ".\InstanceHealth.csv"

# Procesamiento paralelo
$UseParallel = $true   # Cambiar a $false para procesamiento secuencial
$Throttle    = 8       # Número de threads paralelos

# Escritura a SQL
$WriteToSql  = $false  # ⚠️ Cambiar a $true para guardar en SQL

# ========= MODO DE PRUEBA =========
$TestMode = $false  # Cambiar a $true para pruebas rápidas
$TestLimit = 5      # Número de instancias en modo prueba

# ========= FILTROS DE INSTANCIAS =========
$IncludeAWS = $true   # Cambiar a $false para excluir AWS
$OnlyAWS = $false     # Cambiar a $true para procesar SOLO AWS

# Credenciales SQL (null = Windows Authentication)
$SqlCredential = $null
```

---

### 2. 🌐 Filtros de Instancias AWS

Nuevo parámetro `$IncludeAWS` y `$OnlyAWS` para controlar qué instancias procesar:

| Configuración | `$IncludeAWS` | `$OnlyAWS` | Resultado |
|---------------|---------------|------------|-----------|
| **Todo** | `$true` | `$false` | On-Premise + AWS |
| **Solo On-Premise** | `$false` | `$false` | Solo On-Premise |
| **Solo AWS** | (cualquiera) | `$true` | Solo AWS |

**Salida del Script**:
```
[2/5] Filtrando instancias...
      [OK] 87 instancias a procesar
           AWS: 12 | On-Premise: 75
```

O si filtras:
```
[2/5] Filtrando instancias...
      [FILTRO] Solo instancias On-Premise (AWS excluido)
      [OK] 75 instancias a procesar
           AWS: 0 | On-Premise: 75
```

---

### 3. 🔒 Solución al Error de Certificado SSL

**Error Original**:
```
WARNING: Error escribiendo a SQL: A connection was successfully established with the server, 
but then an error occurred during the login process. (provider: SSL Provider, error: 0 - 
The certificate chain was issued by an authority that is not trusted.)
```

**Solución Aplicada**:

Se agregó `TrustServerCertificate = $true` a **TODAS** las conexiones SQL:

- ✅ `Test-SqlAvailability` (prueba de conectividad)
- ✅ `Get-ErrorlogSummary` (lectura de errorlog)
- ✅ `Get-JobAndBackupStatus` (jobs y backups)
- ✅ `Get-StorageAndResourceStatus` (discos y recursos)
- ✅ `Get-AlwaysOnStatus` (AlwaysOn)
- ✅ `Create-HealthTableIfNotExists` (creación de tabla)
- ✅ Inserción de datos finales en SQL

**Ahora funciona sin errores de SSL** ✅

---

### 4. 📊 Mejoras en la Salida

#### Modo de Prueba Mejorado

Cuando `$TestMode = $true`, verás:

```
╔════════════════════════════════════════╗
║                                        ║
║     🧪 MODO DE PRUEBA ACTIVADO 🧪     ║
║                                        ║
╚════════════════════════════════════════╝

  → Límite de instancias: 5
  → Escritura a SQL: DESHABILITADA
  → Salida detallada: HABILITADA
  → Archivos JSON/CSV: HABILITADOS

...procesamiento...

╔════════════════════════════════════════╗
║                                        ║
║    🧪 MODO DE PRUEBA COMPLETADO 🧪    ║
║                                        ║
╚════════════════════════════════════════╝

Próximos pasos:
  1. Revisar archivos generados
  2. Ver resultados en consola
  3. Para ejecutar sobre TODAS: (instrucciones)

Detalle de instancias procesadas:
  ✅ SSPR17-01 - Score: 95 - Healthy
  ⚠️  SSDS16-03 - Score: 78 - Warning
  ❌ SSAWS-01 - Score: 55 - Critical
```

#### Información de Filtrado AWS

```
[2/5] Filtrando instancias...
      [OK] 87 instancias a procesar
           AWS: 12 | On-Premise: 75
```

---

## 📁 Archivos Nuevos/Modificados

### Modificados

1. **`scripts/RelevamientoHealthScoreMant.ps1`** ⭐
   - Configuración interna agregada (líneas 15-43)
   - Filtros AWS implementados
   - TrustServerCertificate agregado a todas las conexiones SQL
   - Variable `$UseParallel` en lugar de parámetro `-Parallel`

### Nuevos

2. **`scripts/CONFIGURACION_HEALTHSCORE.md`** 🆕
   - Guía completa de configuración interna
   - Ejemplos de configuraciones comunes
   - Troubleshooting

3. **`scripts/CAMBIOS_HEALTHSCORE_V1.1.md`** 🆕
   - Este archivo (resumen de cambios)

---

## 🚀 Cómo Usar (Guía Rápida)

### Para Pruebas

1. Abrir `scripts/RelevamientoHealthScoreMant.ps1`
2. Cambiar línea 35:
   ```powershell
   $TestMode = $true
   ```
3. Ejecutar:
   ```powershell
   cd scripts
   .\RelevamientoHealthScoreMant.ps1
   ```

### Para Producción

1. Abrir `scripts/RelevamientoHealthScoreMant.ps1`
2. Cambiar líneas 32 y 35:
   ```powershell
   $WriteToSql = $true   # Línea 32
   $TestMode = $false    # Línea 35
   ```
3. Ejecutar:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

### Solo On-Premise (Sin AWS)

1. Abrir `scripts/RelevamientoHealthScoreMant.ps1`
2. Cambiar línea 39:
   ```powershell
   $IncludeAWS = $false
   ```
3. Ejecutar:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

### Solo AWS

1. Abrir `scripts/RelevamientoHealthScoreMant.ps1`
2. Cambiar línea 40:
   ```powershell
   $OnlyAWS = $true
   ```
3. Ejecutar:
   ```powershell
   .\RelevamientoHealthScoreMant.ps1
   ```

---

## 🔄 Comparación: Antes vs Ahora

### Antes (v1.0)

```powershell
# Modo de prueba
.\RelevamientoHealthScoreMant.ps1 -TestMode

# Producción completa con SQL
.\RelevamientoHealthScoreMant.ps1 -Parallel -Throttle 10 -WriteToSql

# Solo AWS
.\RelevamientoHealthScoreMant.ps1 -Parallel -WriteToSql -TestLimit 20
# (No había forma de filtrar solo AWS)

# Error SSL ❌
WARNING: Error escribiendo a SQL: SSL Provider error...
```

### Ahora (v1.1)

```powershell
# Modo de prueba
# Editar: $TestMode = $true
.\RelevamientoHealthScoreMant.ps1

# Producción completa con SQL
# Editar: $WriteToSql = $true, $TestMode = $false
.\RelevamientoHealthScoreMant.ps1

# Solo AWS
# Editar: $OnlyAWS = $true, $WriteToSql = $true
.\RelevamientoHealthScoreMant.ps1

# Error SSL resuelto ✅
[OK] 87 registros insertados
```

---

## 📊 Ejemplos de Configuraciones Comunes

### 1. Desarrollo/Testing
```powershell
$TestMode = $true
$TestLimit = 5
$UseParallel = $false
$WriteToSql = $false
$IncludeAWS = $true
$OnlyAWS = $false
```

### 2. Producción Diaria (Task Scheduler)
```powershell
$TestMode = $false
$UseParallel = $true
$Throttle = 10
$WriteToSql = $true
$IncludeAWS = $true
$OnlyAWS = $false
```

### 3. Monitoreo Solo AWS
```powershell
$TestMode = $false
$UseParallel = $true
$Throttle = 8
$WriteToSql = $true
$IncludeAWS = $true  # No importa cuando OnlyAWS = true
$OnlyAWS = $true
```

### 4. Auditoría Solo On-Premise
```powershell
$TestMode = $false
$UseParallel = $true
$Throttle = 12
$WriteToSql = $true
$IncludeAWS = $false  # Excluye AWS
$OnlyAWS = $false
```

---

## ⚠️ Cambios que Requieren Atención

### 1. `$WriteToSql` = `$false` por Default

**Importante**: El script **NO guarda en SQL por defecto** para evitar inserciones accidentales durante pruebas.

Para guardar en SQL, debes cambiar explícitamente:
```powershell
$WriteToSql = $true  # Línea 32
```

### 2. Parámetros de Línea de Comando Ya No Son Necesarios

Si sigues usando parámetros, el script los ignorará y usará la configuración interna:

```powershell
# Esto YA NO funciona como antes
.\RelevamientoHealthScoreMant.ps1 -WriteToSql -Parallel

# El script usará los valores de las variables internas:
# $WriteToSql (línea 32)
# $UseParallel (línea 28)
```

**Solución**: Edita las variables internas en lugar de pasar parámetros.

---

## 🐛 Problemas Resueltos

| Problema | Estado | Solución |
|----------|--------|----------|
| Error SSL al escribir a SQL | ✅ Resuelto | TrustServerCertificate agregado |
| No hay filtro para AWS | ✅ Resuelto | Parámetros $IncludeAWS y $OnlyAWS |
| Parámetros complicados | ✅ Resuelto | Configuración interna |
| Difícil hacer pruebas | ✅ Resuelto | $TestMode con banner visual |

---

## 📖 Documentación Actualizada

Todos estos documentos están actualizados con los nuevos cambios:

1. **CONFIGURACION_HEALTHSCORE.md** 🆕 - Guía de configuración interna
2. **README_HEALTHSCORE.md** - Documentación técnica completa
3. **QUICKSTART_HEALTHSCORE.md** - Guía rápida de 5 minutos
4. **IMPLEMENTACION_HEALTHSCORE.md** - Arquitectura del sistema

---

## 🎯 Próximos Pasos Sugeridos

1. **Primera Ejecución**: Probar en modo test
   ```powershell
   # Editar: $TestMode = $true
   .\RelevamientoHealthScoreMant.ps1
   ```

2. **Validar Resultados**: Revisar archivos generados
   ```powershell
   Import-Csv .\InstanceHealth.csv | Format-Table
   ```

3. **Producción**: Si todo OK, cambiar a producción
   ```powershell
   # Editar: $TestMode = $false, $WriteToSql = $true
   .\RelevamientoHealthScoreMant.ps1
   ```

4. **Verificar SQL**: Consultar tabla
   ```sql
   SELECT TOP 10 * 
   FROM dbo.InstanceHealthSnapshot 
   ORDER BY GeneratedAtUtc DESC;
   ```

5. **Automatizar**: Configurar Task Scheduler para ejecución diaria

---

## 📞 Soporte

Si tienes preguntas o problemas:

1. Revisar **CONFIGURACION_HEALTHSCORE.md** (configuración)
2. Revisar **QUICKSTART_HEALTHSCORE.md** (inicio rápido)
3. Revisar sección Troubleshooting en **README_HEALTHSCORE.md**

---

**Versión**: 1.1  
**Fecha**: Octubre 2024  
**Cambios por**: Usuario/Tobias  
**Equipo**: SQL Guard Observatory

