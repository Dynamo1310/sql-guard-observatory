# 🔧 Corrección: Detección de Nodos par en AlwaysOn

## 📋 Problema Detectado

### Caso Real: SSPR19MBK-01 y SSPR19MBK-51

**Escenario**:
```
AG: SSPR19MBKAG
├─ SSPR19MBK-01 (Primary)   → Jobs ejecutados hace 2 días ✅
└─ SSPR19MBK-51 (Secondary) → Jobs NO ejecutados en 10 días ❌
```

**Comportamiento ANTES**:
- `SSPR19MBK-01`: `CheckdbOk = true` ✅ (correcto)
- `SSPR19MBK-51`: `CheckdbOk = false` ❌ (incorrecto)

**Comportamiento ESPERADO**:
- `SSPR19MBK-01`: `CheckdbOk = true` ✅
- `SSPR19MBK-51`: `CheckdbOk = true` ✅ (toma el del nodo 01)

**Razón**: En un AG, si **cualquier nodo** ejecutó CHECKDB/IndexOptimize, **TODOS** los nodos deberían considerarse OK (las bases están sincronizadas).

---

## 🎯 Solución Implementada

### Estrategia Dual

#### Método 1: Consultar `sys.availability_replicas` (Ideal)

```sql
IF SERVERPROPERTY('IsHadrEnabled') = 1
BEGIN
    SELECT DISTINCT ar.replica_server_name AS ReplicaServer
    FROM sys.availability_replicas ar
    WHERE ar.replica_server_name != @@SERVERNAME
END
```

**Ventaja**: Obtiene automáticamente todos los nodos del AG.
**Desventaja**: Requiere permisos VIEW SERVER STATE.

#### Método 2: Patrón Hardcoded `01↔51` y `02↔52` (Fallback)

```powershell
$pairMap = @{
    '01' = '51'
    '51' = '01'
    '02' = '52'
    '52' = '02'
}
```

**Ventaja**: Funciona sin permisos especiales, usa naming convention conocido.
**Desventaja**: Solo funciona con este patrón específico.

---

## 🔍 Lógica de Ejecución

### Flujo Completo

```
1. Consultar jobs en el nodo actual (ej: SSPR19MBK-51)
   └─> LastCheckdb = hace 10 días ❌

2. Detectar si es AlwaysOn:
   
   2a. Intentar Método 1 (sys.availability_replicas)
       └─> ¿Tiene permisos? 
           ├─ SÍ: Obtiene lista de réplicas → ['SSPR19MBK-01']
           └─ NO: Lanza excepción, continúa a Método 2

   2b. Fallback Método 2 (Patrón de naming)
       └─> Detecta: InstanceName = 'SSPR19MBK-51'
       └─> Extrae: '51'
       └─> Busca par: '51' → '01'
       └─> Genera: 'SSPR19MBK-01'
       └─> Lista de réplicas = ['SSPR19MBK-01']

3. Consultar jobs en cada réplica:
   └─> Conectar a SSPR19MBK-01
   └─> Consultar jobs con IntegrityCheck/IndexOptimize
   └─> Obtiene: LastCheckdb = hace 2 días ✅
   └─> Comparar: ¿2 días es más reciente que 10 días?
       └─ SÍ: Actualizar LastCheckdb = hace 2 días
       └─ Actualizar CheckdbOk = true ✅

4. Resultado Final:
   SSPR19MBK-51: LastCheckdb = hace 2 días ✅
   SSPR19MBK-51: CheckdbOk = true ✅
```

---

## 💡 Cómo Funciona el Patrón

### Regex de Detección

```powershell
if ($InstanceName -match '(\d{2})$') {
    $lastTwoDigits = $Matches[1]  # Captura últimos 2 dígitos
    $baseName = $InstanceName -replace '\d{2}$', ''  # Remueve últimos 2 dígitos
}
```

### Ejemplos

| Instancia Actual | Últimos Dígitos | Base Name | Par Buscado | Nodo Par Generado |
|------------------|-----------------|-----------|-------------|-------------------|
| `SSPR19MBK-01` | `01` | `SSPR19MBK-` | `51` | `SSPR19MBK-51` |
| `SSPR19MBK-51` | `51` | `SSPR19MBK-` | `01` | `SSPR19MBK-01` |
| `SSPR17DB-02` | `02` | `SSPR17DB-` | `52` | `SSPR17DB-52` |
| `SSPR17DB-52` | `52` | `SSPR17DB-` | `02` | `SSPR17DB-02` |
| `SQLPROD-01` | `01` | `SQLPROD-` | `51` | `SQLPROD-51` |

### Instancias NO detectadas (sin patrón)

| Instancia | Razón |
|-----------|-------|
| `SSPR19MBK` | No termina en 2 dígitos |
| `SQLTEST-03` | Termina en `03` (no está en el mapa) |
| `PROD-1` | Termina en 1 dígito, no 2 |

---

## 🔐 Manejo de Errores

### Escenario 1: No tiene permisos VIEW SERVER STATE

```
1. Método 1 falla con excepción
   └─> Captura error silenciosamente
   └─> Log: "No se pudo consultar sys.availability_replicas"

2. Continúa a Método 2 (patrón)
   └─> Detecta patrón 01/51
   └─> Intenta conectarse al nodo par
   └─> ✅ Funciona
```

### Escenario 2: No puede conectarse al nodo par

```
1. Método 1 o 2 identifica nodo par
2. Intenta conectarse al nodo par
3. Falla la conexión (firewall, nodo caído, etc.)
   └─> Captura error silenciosamente
   └─> Log: "No se pudo conectar a réplica SSPR19MBK-01: [error]"
   └─> NO sobrescribe valores existentes
   └─> Continúa con los datos del nodo actual
```

**Importante**: Si falla la conexión al nodo par, **NO sobrescribe** `LastCheckdb` con `null`. Mantiene el valor que ya tenía.

### Escenario 3: Instancia sin AG ni patrón

```
1. Consulta sys.availability_replicas
   └─> Retorna vacío (no es AlwaysOn)
2. Intenta Método 2 (patrón)
   └─> No coincide con 01/51/02/52
   └─> $replicaServers.Count = 0
3. Omite la lógica de réplicas
   └─> Solo usa datos del nodo actual
```

---

## 📊 Casos de Uso

### Caso 1: AG con Patrón Estándar

**Setup**:
```
SSPR19MBK-01 (Primary):   CHECKDB hace 1 día  ✅
SSPR19MBK-51 (Secondary): CHECKDB hace 20 días ❌
```

**Ejecución en ambos nodos**:
```powershell
# Al procesar SSPR19MBK-01:
1. Jobs locales: LastCheckdb = hace 1 día
2. Busca nodo par: SSPR19MBK-51
3. Conecta a 51: LastCheckdb = hace 20 días
4. Compara: 1 día > 20 días? NO
5. Mantiene: LastCheckdb = hace 1 día ✅

# Al procesar SSPR19MBK-51:
1. Jobs locales: LastCheckdb = hace 20 días
2. Busca nodo par: SSPR19MBK-01
3. Conecta a 01: LastCheckdb = hace 1 día
4. Compara: 1 día > 20 días? SÍ
5. Actualiza: LastCheckdb = hace 1 día ✅
```

**Resultado**: Ambos nodos reportan `LastCheckdb = hace 1 día` ✅

---

### Caso 2: AG con 3 Nodos (Limitación)

**Setup**:
```
SSPR19MBK-01 (Primary):     CHECKDB hace 1 día  ✅
SSPR19MBK-51 (Secondary):   CHECKDB hace 20 días ❌
SSPR19MBK-DR (DR Replica):  CHECKDB hace 30 días ❌
```

**Comportamiento**:
- `01` y `51` se sincronizan entre sí (patrón detectado)
- `DR` NO se sincroniza (no sigue el patrón 01/51/02/52)

**Resultado**:
- `SSPR19MBK-01`: ✅ OK (1 día)
- `SSPR19MBK-51`: ✅ OK (1 día, tomado del 01)
- `SSPR19MBK-DR`: ❌ Vencido (30 días, sin par detectado)

**Solución**: Si `sys.availability_replicas` funciona, detectará los 3 nodos.

---

### Caso 3: Instancia Standalone con Naming Coincidente

**Setup**:
```
SQLTEST-01: Instancia standalone (NO es AlwaysOn)
```

**Comportamiento**:
1. Consulta `sys.availability_replicas` → Vacío (no es AlwaysOn)
2. Intenta Método 2 (patrón)
3. Detecta patrón `01` → busca `SQLTEST-51`
4. Intenta conectarse a `SQLTEST-51`
   ├─ Existe y responde: Toma sus jobs ✅
   └─ NO existe: Error capturado, continúa con datos locales ✅

**Impacto**: Si existe `SQLTEST-51` como standalone también, se sincronizarán entre sí (aunque no sea un AG). Esto es **aceptable** si comparten las mismas bases de datos.

---

## ⚙️ Configuración

### Si Quieres Agregar Más Patrones

```powershell
$pairMap = @{
    '01' = '51'
    '51' = '01'
    '02' = '52'
    '52' = '02'
    '03' = '53'  # ✅ Agregar nuevos patrones aquí
    '53' = '03'
}
```

### Si Quieres Deshabilitar el Fallback

```powershell
# Comentar esta sección completa:
# if ($replicaServers.Count -eq 0) {
#     # Método 2: Usar patrón...
# }
```

Así solo usará `sys.availability_replicas` (Método 1).

---

## 🧪 Testing

### Verificar Detección de Nodos Par

```powershell
# Test manual del patrón
$testCases = @(
    'SSPR19MBK-01',
    'SSPR19MBK-51',
    'SSPR17DB-02',
    'SSPR17DB-52',
    'STANDALONE-99'
)

foreach ($instance in $testCases) {
    if ($instance -match '(\d{2})$') {
        $lastTwoDigits = $Matches[1]
        $baseName = $instance -replace '\d{2}$', ''
        
        $pairMap = @{
            '01' = '51'; '51' = '01'
            '02' = '52'; '52' = '02'
        }
        
        if ($pairMap.ContainsKey($lastTwoDigits)) {
            $pair = $baseName + $pairMap[$lastTwoDigits]
            Write-Host "$instance → Nodo par: $pair" -ForegroundColor Green
        } else {
            Write-Host "$instance → Sin par (dígitos: $lastTwoDigits)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "$instance → No termina en 2 dígitos" -ForegroundColor Red
    }
}
```

**Salida esperada**:
```
SSPR19MBK-01 → Nodo par: SSPR19MBK-51
SSPR19MBK-51 → Nodo par: SSPR19MBK-01
SSPR17DB-02 → Nodo par: SSPR17DB-52
SSPR17DB-52 → Nodo par: SSPR17DB-02
STANDALONE-99 → Sin par (dígitos: 99)
```

### Verificar en SQL

Después de ejecutar el script, verifica:

```sql
-- Ver si ambos nodos del AG reportan el mismo LastCheckdb
SELECT 
    InstanceName,
    JSON_VALUE(MaintenanceJson, '$.LastCheckdb') AS LastCheckdb,
    JSON_VALUE(MaintenanceJson, '$.CheckdbOk') AS CheckdbOk
FROM dbo.InstanceHealthSnapshot
WHERE InstanceName IN ('SSPR19MBK-01', 'SSPR19MBK-51')
  AND GeneratedAtUtc > DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY InstanceName
```

**Resultado esperado**:
```
InstanceName      LastCheckdb  CheckdbOk
--------------    -----------  ---------
SSPR19MBK-01      2025-10-20   true
SSPR19MBK-51      2025-10-20   true    ✅ MISMO valor que 01
```

---

## 📝 Archivos Modificados

| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `scripts/RelevamientoHealthScoreMant.ps1` | 293-375 | Lógica dual (sys.availability_replicas + patrón) |

---

## ✅ Resumen

**Problema**: Nodos secundarios de AG reportaban jobs vencidos aunque el primario los tuviera OK.

**Causa**: Lógica de AlwaysOn fallaba al consultar réplicas (permisos/conectividad).

**Solución**:
1. ✅ **Método 1 (Ideal)**: Consulta `sys.availability_replicas` automáticamente
2. ✅ **Método 2 (Fallback)**: Detecta patrón `01↔51` y `02↔52` por naming convention
3. ✅ **Manejo de errores robusto**: No sobrescribe valores si falla la conexión

**Resultado**: 
- Ambos nodos de un AG (`01` y `51`) reportan el **mismo** `LastCheckdb` (el más reciente de ambos)
- Funciona incluso sin permisos VIEW SERVER STATE
- Resiliente a fallos de conectividad

**Beneficio**: Refleja correctamente que en un AG, si **cualquier nodo** ejecutó mantenimiento, **TODOS** los nodos están mantenidos (porque las bases están sincronizadas).

---

## 🚀 Despliegue

```powershell
cd scripts
.\RelevamientoHealthScoreMant.ps1
```

Verifica que los nodos par (`01` y `51`) ahora reportan los mismos valores de `LastCheckdb` y `LastIndexOptimize`.

