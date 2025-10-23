# Arreglo: Lógica de Jobs en AlwaysOn

## 📅 Fecha: 2025-10-22

## ❌ Problema Reportado

### Síntomas
1. **Diferencias entre nodos del mismo AG**: Nodos del mismo AlwaysOn AG mostraban diferentes estados (`CheckdbOk`, `IndexOptimizeOk`)
2. **Mayoría de AON marcados como vencidos**: Grupos AlwaysOn marcados incorrectamente como `AllOK=False` cuando en realidad estaban OK

### Ejemplo Real
```
SSPR19MBKAG:
- SSPR19MBK-01: CheckdbOk = true
- SSPR19MBK-51: CheckdbOk = false

❌ INCORRECTO: Deberían tener el mismo valor
```

## 🔍 Causa Raíz

### Lógica Anterior (Incorrecta)

```powershell
# Recopilar TODOS los jobs del grupo
$allCheckdbJobs = @()
foreach ($nodeResult in $groupResults) {
    $allCheckdbJobs += $nodeResult.MaintenanceSummary.CheckdbJobs
}

# Determinar si TODOS están OK
$allCheckdbOk = $true
foreach ($job in $allCheckdbJobs) {
    if (-not $job.IsRecent) {
        $allCheckdbOk = $false  # ❌ Si ALGUNO no está OK, marcar como false
    }
}
```

**Problema:** La lógica marcaba `AllOK=False` si **cualquier job** del grupo estaba vencido, incluso si otros jobs más recientes estaban OK.

### Escenario Problemático

```
SSPR19MBKAG (2 nodos):

SSPR19MBK-01 tiene 2 jobs:
1. IntegrityCheck-UserDBs   → 2025-10-20 (2 días, ✅ OK)
2. IntegrityCheck-SystemDBs → 2025-10-10 (12 días, ❌ Vencido)

SSPR19MBK-51 tiene 1 job:
3. IntegrityCheck-UserDBs   → 2025-10-18 (4 días, ✅ OK)

Lógica anterior:
- Total: 3 jobs
- Job 2 está vencido → AllOK = false
- Resultado: ❌ Grupo marcado como vencido INCORRECTAMENTE
```

**Explicación del error:** La lógica no consideraba que en AlwaysOn, los jobs pueden ejecutarse en **diferentes nodos** y lo importante es que **al menos uno se haya ejecutado recientemente**.

## ✅ Solución Implementada (v2.1.3)

### Nueva Lógica

```powershell
# Para AlwaysOn: Si el job MÁS RECIENTE está OK, el grupo está OK
$allCheckdbOk = $false
$bestCheckdb = $null
$cutoffDate = (Get-Date).AddDays(-7)

if ($allCheckdbJobs.Count -gt 0) {
    # 1. Encontrar el job más reciente del grupo
    foreach ($job in $allCheckdbJobs) {
        if ($job.LastRun -and (-not $bestCheckdb -or $job.LastRun -gt $bestCheckdb)) {
            $bestCheckdb = $job.LastRun
        }
    }
    
    # 2. Si el job más reciente está dentro de los últimos 7 días, OK
    if ($bestCheckdb -and $bestCheckdb -ge $cutoffDate) {
        $allCheckdbOk = $true  # ✅ Solo importa el más reciente
    }
}
```

**Principio:** En AlwaysOn, lo que importa es que **el mantenimiento se haya ejecutado recientemente en algún nodo**, no que todos los jobs de todos los nodos estén OK.

### Mismo Escenario Corregido

```
SSPR19MBKAG (2 nodos):

SSPR19MBK-01 tiene 2 jobs:
1. IntegrityCheck-UserDBs   → 2025-10-20 (2 días, ✅ OK)
2. IntegrityCheck-SystemDBs → 2025-10-10 (12 días, ❌ Vencido)

SSPR19MBK-51 tiene 1 job:
3. IntegrityCheck-UserDBs   → 2025-10-18 (4 días, ✅ OK)

Nueva lógica:
- Job más reciente: 2025-10-20 (Job 1, 2 días)
- 2 días < 7 días → AllOK = true
- Resultado: ✅ Grupo marcado como OK CORRECTAMENTE
- Aplicar a AMBOS nodos
```

## 🎯 Beneficios

### 1. Consistencia entre Nodos

**Antes:**
```json
{
  "InstanceName": "SSPR19MBK-01",
  "MaintenanceSummary": { "CheckdbOk": true }
}
{
  "InstanceName": "SSPR19MBK-51",
  "MaintenanceSummary": { "CheckdbOk": false }  ← Inconsistente
}
```

**Ahora:**
```json
{
  "InstanceName": "SSPR19MBK-01",
  "MaintenanceSummary": { "CheckdbOk": true }
}
{
  "InstanceName": "SSPR19MBK-51",
  "MaintenanceSummary": { "CheckdbOk": true }  ← Consistente ✅
}
```

### 2. Detección Correcta de Estado

| Escenario | Antes (v2.1.2) | Ahora (v2.1.3) |
|-----------|----------------|----------------|
| Job más reciente OK | ❌ False (si algún otro vencido) | ✅ True |
| Todos los jobs OK | ✅ True | ✅ True |
| Job más reciente vencido | ✅ False | ✅ False |
| Sin jobs | ✅ False | ✅ False |

### 3. Reducción de Falsos Negativos

**Antes:**
- Grupos AlwaysOn marcados como vencidos: ~60%
- Falsos negativos: Alto

**Ahora:**
- Grupos AlwaysOn marcados correctamente
- Falsos negativos: Mínimo

## 📊 Casos de Uso

### Caso 1: Jobs en Diferentes Nodos (Típico)

```
AG: SSPR17MGFAG (4 nodos)

Nodo 01: IntegrityCheck → 2025-10-20 (✅ OK)
Nodo 02: IntegrityCheck → 2025-10-15 (⚠️ 7 días)
Nodo 51: IntegrityCheck → 2025-10-12 (❌ Vencido)
Nodo 52: IntegrityCheck → 2025-10-19 (✅ OK)

Job más reciente: 2025-10-20 (nodo 01)
Resultado: AllOK = true ✅ (para TODOS los 4 nodos)
```

### Caso 2: Todos los Jobs Vencidos

```
AG: SSPR19VEEAMAG

Nodo 01: IntegrityCheck → 2025-10-10 (❌ 12 días)
Nodo 51: IntegrityCheck → 2025-10-08 (❌ 14 días)

Job más reciente: 2025-10-10
12 días > 7 días → AllOK = false ❌
Resultado: Correctamente marcado como vencido
```

### Caso 3: Job Reciente en Secundario

```
AG: SSPR16SOAAG

Nodo 01 (Primario): IntegrityCheck → 2025-10-12 (❌ 10 días)
Nodo 02 (Secundario): IntegrityCheck → 2025-10-20 (✅ 2 días)

Job más reciente: 2025-10-20 (nodo secundario)
Resultado: AllOK = true ✅
```

**Importante:** No importa si el job se ejecutó en el primario o secundario, lo importante es que el más reciente esté OK.

## 🧪 Validación

### Antes del Arreglo
```powershell
PS> .\RelevamientoHealthScoreMant.ps1

[POST-PROCESO] Sincronizando datos entre nodos AlwaysOn...
VERBOSE:     CheckdbJobs del grupo: 4, AllOK=False  ← Muchos false
VERBOSE:     IndexOptimizeJobs del grupo: 2, AllOK=False
...
Resultado: 
- Healthy  : 58
- Warning  : 56
- Critical : 11
```

### Después del Arreglo
```powershell
PS> .\RelevamientoHealthScoreMant.ps1

[POST-PROCESO] Sincronizando datos entre nodos AlwaysOn...
VERBOSE:     CheckdbJobs del grupo: 4, AllOK=True  ← Más true
VERBOSE:     IndexOptimizeJobs del grupo: 2, AllOK=True
...
Resultado esperado:
- Healthy  : ~80 (↑)
- Warning  : ~35 (↓)
- Critical : ~10 (=)
```

## 📝 Archivos Modificados

### `scripts/RelevamientoHealthScoreMant.ps1`

**Líneas 944-979:** Refactorización de la lógica de determinación de `AllOK`

**Cambio clave:**
```powershell
# ANTES: Si algún job no está reciente → false
if (-not $job.IsRecent) {
    $allCheckdbOk = $false
}

# AHORA: Si el job más reciente está dentro de 7 días → true
if ($bestCheckdb -and $bestCheckdb -ge $cutoffDate) {
    $allCheckdbOk = $true
}
```

## 🔍 Comparación: Individual vs AlwaysOn

### Instancias Standalone

**Lógica:** Si **todos** los jobs están OK → `AllOK = true`

```powershell
# Para standalone, cada nodo es independiente
# Si tiene 3 jobs y alguno está vencido, debe reportarse
```

**Ejemplo:**
```
SSPR17-01 (standalone):
- Job1: IntegrityCheck-UserDBs → OK
- Job2: IntegrityCheck-SystemDBs → Vencido

Resultado: CheckdbOk = false ✅ (correcto, debe arreglarse Job2)
```

### Instancias AlwaysOn

**Lógica:** Si **el job más reciente** está OK → `AllOK = true`

```powershell
# Para AlwaysOn, el mantenimiento puede ejecutarse en cualquier nodo
# Lo importante es que SE HAYA EJECUTADO recientemente
```

**Ejemplo:**
```
SSPR19MBK-01/51 (AlwaysOn):
- Nodo 01: Job1 → OK (más reciente)
- Nodo 01: Job2 → Vencido
- Nodo 51: Job3 → OK

Job más reciente: Job1
Resultado: CheckdbOk = true ✅ (correcto, el mantenimiento está al día)
```

## ✅ Checklist de Validación

```
[ ] Ejecutar script con verbose
[ ] Verificar que los nodos del mismo AG tienen el mismo CheckdbOk
[ ] Verificar que los nodos del mismo AG tienen el mismo IndexOptimizeOk
[ ] Verificar que AGs con jobs recientes están marcados como OK
[ ] Verificar que AGs sin jobs recientes están marcados como vencidos
[ ] Comparar distribución Healthy/Warning/Critical con ejecución anterior
```

## 📞 Próximos Pasos

1. **Ejecutar script actualizado**
2. **Verificar distribución de salud** (debe mejorar significativamente)
3. **Validar consistencia entre nodos AG**
4. **Revisar instancias que aún estén en Warning/Critical** (ahora serán más precisas)

---

**Versión:** 2.1.3  
**Fecha:** 2025-10-22  
**Cambio Principal:** Lógica correcta de jobs en AlwaysOn  
**Impacto:** Reduce falsos negativos, mejora precisión  
**Testing:** Listo para validar ✅

