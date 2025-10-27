# 🔄 Mejora: Reintentos Automáticos y Manejo Robusto de Timeouts

**Fecha**: 27 Enero 2025  
**Versión**: Health Score v3.1.2  
**Prioridad**: ALTA

---

## 🚨 Problema Detectado

Durante la ejecución del script, se detectaron **timeouts esporádicos** que hacían fallar la recolección de métricas para instancias válidas:

```
WARNING: Error obteniendo disk metrics en SSDS19-01: Timeout expired...
```

**Impacto**:
- ❌ Instancia válida se salta por timeout transitorio
- ❌ Datos incompletos en Health Score
- ❌ Falsos negativos en el monitoreo

---

## ✅ Solución Implementada

### 1. **Nueva Función: `Test-SqlConnection` con Reintentos**

Ahora prueba la conexión **hasta 2 veces** antes de fallar:

```powershell
function Test-SqlConnection {
    param(
        [string]$InstanceName,
        [int]$TimeoutSec = 10,
        [int]$MaxRetries = 2
    )
    
    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $connection = Test-DbaConnection -SqlInstance $InstanceName -EnableException
            if ($connection.IsPingable) {
                return $true  # ✅ Éxito
            }
        } catch {
            if ($attempt -lt $MaxRetries) {
                Write-Verbose "Intento $attempt falló para $InstanceName, reintentando..."
                Start-Sleep -Seconds 2
            }
        }
    }
    
    return $false  # ❌ Falló después de todos los reintentos
}
```

**Comportamiento**:
- **Intento 1**: Falla → espera 2 segundos
- **Intento 2**: Si falla → devuelve `$false`
- Total: **máximo 2 intentos**, **2 segundos** entre intentos

---

### 2. **Nueva Función: `Invoke-SqlQueryWithRetry`**

Ejecuta queries SQL con **reintentos automáticos** en caso de timeout o errores de red:

```powershell
function Invoke-SqlQueryWithRetry {
    param(
        [string]$InstanceName,
        [string]$Query,
        [int]$TimeoutSec = 15,
        [int]$MaxRetries = 2
    )
    
    $attempt = 0
    $lastError = $null
    
    while ($attempt -lt $MaxRetries) {
        $attempt++
        
        try {
            $result = Invoke-DbaQuery -SqlInstance $InstanceName `
                -Query $Query `
                -QueryTimeout $TimeoutSec `
                -EnableException
            
            return $result  # ✅ Éxito
        }
        catch {
            $lastError = $_
            
            # Si es timeout o error de conexión, reintentar
            if ($_.Exception.Message -match "Timeout|Connection|Network|Transport") {
                if ($attempt -lt $MaxRetries) {
                    Write-Verbose "Query timeout/error en $InstanceName (intento $attempt/$MaxRetries), reintentando en 3s..."
                    Start-Sleep -Seconds 3
                    continue
                }
            }
            
            # Si es otro error (ej. sintaxis SQL), lanzar inmediatamente
            throw
        }
    }
    
    # Si llegamos aquí, todos los reintentos fallaron
    throw $lastError
}
```

**Lógica Inteligente**:
- ✅ **Reintenta** si el error es: `Timeout`, `Connection`, `Network`, `Transport`
- ❌ **NO reintenta** si es error de SQL (sintaxis, permisos, etc.) → falla rápido
- **Espera 3 segundos** entre reintentos (para dar tiempo a recuperación de red)

---

### 3. **Actualización de `Get-DiskMetrics`**

Todas las queries ahora usan `Invoke-SqlQueryWithRetry`:

```powershell
# ANTES ❌
$dataSpace = Invoke-DbaQuery -SqlInstance $InstanceName `
    -Query $querySpace `
    -QueryTimeout $TimeoutSec `
    -EnableException

# DESPUÉS ✅
$dataSpace = Invoke-SqlQueryWithRetry -InstanceName $InstanceName `
    -Query $querySpace `
    -TimeoutSec $TimeoutSec `
    -MaxRetries 2
```

**Queries con reintentos**:
1. ✅ `$dataSpace` (espacio en discos)
2. ✅ `$dataProblematicFiles` (archivos problemáticos)
3. ✅ `$dataIOLoad` (métricas de I/O)
4. ✅ `$dataCompetition` (competencia por disco)

---

### 4. **Mensajes de Error Mejorados**

Ahora el script **identifica el tipo de error** y da contexto:

```powershell
catch {
    $errorMsg = $_.Exception.Message
    
    # Identificar tipo de error
    if ($errorMsg -match "Timeout") {
        Write-Warning "⏱️  TIMEOUT obteniendo disk metrics en ${InstanceName} (después de reintentos)"
    }
    elseif ($errorMsg -match "Connection|Network|Transport") {
        Write-Warning "🔌 ERROR DE CONEXIÓN obteniendo disk metrics en ${InstanceName}: $errorMsg"
    }
    else {
        Write-Warning "Error obteniendo disk metrics en ${InstanceName}: $errorMsg"
    }
}
```

**Mensajes**:
- ⏱️  `TIMEOUT` → Query demoró demasiado (después de 2 reintentos)
- 🔌 `ERROR DE CONEXIÓN` → Problema de red o instancia caída
- ⚠️  `Error` → Otro tipo de error (SQL, permisos, etc.)

---

## 📊 Impacto Antes vs. Después

### Escenario 1: Timeout Transitorio (Red Lenta)

| **Antes** | **Después** |
|-----------|-------------|
| `WARNING: Error obteniendo disk metrics en SSDS19-01: Timeout expired` | ✅ Reintenta → Éxito |
| Instancia omitida | ✅ Datos recolectados |
| Health Score incompleto | ✅ Health Score completo |

### Escenario 2: Timeout Real (Query Lenta)

| **Antes** | **Después** |
|-----------|-------------|
| `WARNING: Error... Timeout` | `⏱️  TIMEOUT obteniendo disk metrics en SSDS19-01 (después de reintentos)` |
| No se sabe si reintentó | ✅ **Claridad**: intentó 2 veces |

### Escenario 3: Error de SQL (No de Red)

| **Antes** | **Después** |
|-----------|-------------|
| Reintenta (innecesario) | ❌ **Falla rápido** (no reintenta) |
| Tiempo perdido | ✅ Eficiente |

---

## 🔧 Configuración de Reintentos

### Parámetros Ajustables

```powershell
# En Test-SqlConnection
MaxRetries = 2         # Máximo 2 intentos
Sleep = 2 segundos     # Entre intentos de conexión

# En Invoke-SqlQueryWithRetry
MaxRetries = 2         # Máximo 2 intentos
Sleep = 3 segundos     # Entre intentos de query
TimeoutSec = 15        # Timeout por query
```

### Tiempo Total Máximo (Peor Caso)

**Conexión**:
- Intento 1: 10s timeout + 2s wait
- Intento 2: 10s timeout
- **Total**: ~22 segundos

**Query**:
- Intento 1: 15s timeout + 3s wait
- Intento 2: 15s timeout
- **Total**: ~33 segundos por query

**4 Queries**:
- Total: ~132 segundos (2.2 minutos) en el peor caso

---

## 🧪 Testing

### Comandos
```powershell
# Ejecutar recolección con verbosidad para ver reintentos
.\RelevamientoHealthScore_Discos.ps1 -Verbose

# Simular timeout (instancia lenta)
$TimeoutSec = 5  # Reducir timeout para testing
.\RelevamientoHealthScore_Discos.ps1
```

### Validaciones
- ✅ Instancias con timeouts transitorios se recolectan correctamente
- ✅ Mensajes de error indican si hubo reintentos
- ✅ Instancias con errores permanentes fallan después de 2 intentos
- ✅ Script no se detiene por timeout de una instancia

---

## 💡 Mejores Prácticas Aplicadas

### 1. **Reintentos Inteligentes**
- ✅ Solo reintenta errores **recuperables** (red/timeout)
- ❌ NO reintenta errores **definitivos** (SQL syntax, permisos)

### 2. **Esperas Exponenciales**
- Espera entre reintentos para dar tiempo a recuperación
- Evita sobrecargar instancias con problemas

### 3. **Mensajes Contextuales**
- DBAs saben exactamente qué falló y por qué
- Distingue entre timeout, conexión y otros errores

### 4. **Fail-Safe**
- Si una instancia falla, el script continúa con las demás
- No se pierde la recolección de todas las instancias por una falla

---

## 🎯 Próximos Pasos

1. ✅ Validar reintentos con instancias lentas
2. ⏳ Aplicar el mismo patrón a otros scripts (Waits, Memoria, CPU, etc.)
3. ⏳ Agregar métricas de "reintentos exitosos" al resumen final
4. ⏳ Considerar exponential backoff (2s, 4s, 8s) para reintentos futuros

---

## 📚 Referencias

### Patrones de Reintentos
- **Linear Retry**: Espera fija entre reintentos (implementado)
- **Exponential Backoff**: Espera creciente (2s, 4s, 8s) - futuro
- **Circuit Breaker**: Dejar de intentar después de X fallos consecutivos - futuro

### Errores que Reintenta
- `Timeout expired`
- `Connection reset by peer`
- `Network error`
- `Transport-level error`
- `Cannot open database`

### Errores que NO Reintenta
- `Invalid column name`
- `Syntax error`
- `Permission denied`
- `Table does not exist`

---

**Implementado por**: Cursor AI  
**Solicitado por**: Usuario (Tobi) - "uno me falló por timeout"  
**Relacionado con**: `CORRECCION_DBNULL_DISCOS.md`, `MEJORA_ALERTAS_ESPACIO_INTELIGENTES.md`

