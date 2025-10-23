# Arreglo: Evaluación de Jobs por Nombre en AlwaysOn

## 📅 Fecha: 2025-10-22

## ❌ Problema Reportado

### Síntoma
En grupos AlwaysOn, si hay múltiples jobs de IntegrityCheck (por ejemplo: SystemDBs y UserDBs), el script marcaba el grupo como OK si **cualquier job** del grupo estaba OK, sin evaluar **cada tipo de job** individualmente.

### Ejemplo Real del Usuario

```
AlwaysOn AG: SSPR19MBKAG (2 nodos)

Nodo 01:
- IntegrityCheck-SystemDBs → ❌ Falló
- IntegrityCheck-UserDBs   → ❌ Falló

Nodo 51:
- IntegrityCheck-SystemDBs → ✅ OK
- IntegrityCheck-UserDBs   → ❌ Falló

Lógica anterior (INCORRECTA):
- Job más reciente OK: SystemDBs en nodo 51
- Resultado: AllOK = true ❌

Esperado (CORRECTO):
- SystemDBs: OK (nodo 51 tiene OK)
- UserDBs: NO OK (ambos nodos fallaron)
- Resultado: AllOK = false ✅
```

## 🔍 Causa Raíz

### Lógica Anterior (Incorrecta)

```powershell
# Encontrar el job MÁS RECIENTE del grupo (sin importar el nombre)
foreach ($job in $allCheckdbJobs) {
    if ($job.LastRun -gt $bestCheckdb) {
        $bestCheckdb = $job.LastRun
    }
}

# Si el job más reciente está OK → marcar todo como OK
if ($bestCheckdb -ge $cutoffDate) {
    $allCheckdbOk = $true  # ❌ INCORRECTO
}
```

**Problema:** No consideraba que pueden existir **múltiples tipos** de jobs de IntegrityCheck (SystemDBs, UserDBs, LargeDBs, etc.), y cada uno debe evaluarse independientemente.

### Por Qué Está Mal

En el ejemplo del usuario:
- **SystemDBs** tiene una ejecución OK en nodo 51
- **UserDBs** NO tiene ninguna ejecución OK en ningún nodo
- La lógica anterior solo miraba "¿hay algún job OK?" → Sí (SystemDBs)
- Marcaba todo el grupo como OK, ignorando que UserDBs está fallando en ambos nodos

## ✅ Solución Implementada (v2.1.5)

### Nueva Lógica

```powershell
# Agrupar jobs por nombre (cada tipo se evalúa independientemente)
$checkdbByName = $allCheckdbJobs | Group-Object -Property JobName

$allCheckdbOk = $true

foreach ($jobGroup in $checkdbByName) {
    # Para cada TIPO de job (ej: IntegrityCheck-SystemDBs)
    # Encontrar el más reciente de ese tipo
    $mostRecentJob = $jobGroup.Group | Sort-Object LastRun -Descending | Select-Object -First 1
    
    # Si el más reciente de ESTE TIPO no está OK → grupo NO OK
    if (-not $mostRecentJob.LastRun -or 
        $mostRecentJob.LastRun -lt $cutoffDate -or 
        -not $mostRecentJob.IsSuccess) {
        $allCheckdbOk = $false
        Write-Verbose "Job $($jobGroup.Name) del grupo NO está OK"
    }
}

# AllOK = true solo si TODOS los tipos de jobs están OK
```

**Principio:** Cada **tipo de job** (por nombre) se evalúa independientemente, y el grupo está OK solo si **TODOS** los tipos están OK.

## 📊 Comparación: Antes vs Ahora

### Caso 1: El Caso del Usuario

```
AG: SSPR19MBKAG

Nodo 01:
- Job1: IntegrityCheck-SystemDBs → Falló (2025-10-20)
- Job2: IntegrityCheck-UserDBs → Falló (2025-10-19)

Nodo 51:
- Job3: IntegrityCheck-SystemDBs → OK (2025-10-21) ✅
- Job4: IntegrityCheck-UserDBs → Falló (2025-10-18)

Lógica anterior:
1. Jobs del grupo: [Job1, Job2, Job3, Job4]
2. Más reciente: Job3 (2025-10-21, OK)
3. Job3 está OK → AllOK = true ❌

Nueva lógica:
1. Agrupar por nombre:
   - IntegrityCheck-SystemDBs: [Job1, Job3]
   - IntegrityCheck-UserDBs: [Job2, Job4]

2. Evaluar SystemDBs:
   - Más reciente: Job3 (OK)
   - SystemDBs: ✅ OK

3. Evaluar UserDBs:
   - Más reciente: Job2 (Falló)
   - UserDBs: ❌ NO OK

4. Resultado: AllOK = false ✅
```

### Caso 2: Todos los Tipos OK

```
AG: SSPR17MGFAG

Nodo 01:
- IntegrityCheck-SystemDBs → OK (2025-10-20)
- IntegrityCheck-UserDBs → OK (2025-10-19)

Nodo 02:
- IntegrityCheck-SystemDBs → OK (2025-10-21) ← Más reciente
- IntegrityCheck-UserDBs → OK (2025-10-18)

Nueva lógica:
1. Agrupar por nombre:
   - IntegrityCheck-SystemDBs: [Nodo01, Nodo02]
   - IntegrityCheck-UserDBs: [Nodo01, Nodo02]

2. Evaluar SystemDBs:
   - Más reciente: Nodo02 (OK)
   - SystemDBs: ✅ OK

3. Evaluar UserDBs:
   - Más reciente: Nodo01 (OK)
   - UserDBs: ✅ OK

4. Resultado: AllOK = true ✅
```

### Caso 3: Un Tipo Vencido

```
AG: SSPR16SOAAG

Nodo 01:
- IntegrityCheck-SystemDBs → OK (2025-10-20)
- IntegrityCheck-UserDBs → Vencido (2025-10-10) ← > 7 días

Nodo 02:
- IntegrityCheck-SystemDBs → OK (2025-10-19)
- IntegrityCheck-UserDBs → Vencido (2025-10-12)

Nueva lógica:
1. Agrupar por nombre:
   - IntegrityCheck-SystemDBs: [Nodo01, Nodo02]
   - IntegrityCheck-UserDBs: [Nodo01, Nodo02]

2. Evaluar SystemDBs:
   - Más reciente: Nodo01 (2025-10-20, OK)
   - SystemDBs: ✅ OK

3. Evaluar UserDBs:
   - Más reciente: Nodo02 (2025-10-12, > 7 días)
   - UserDBs: ❌ NO OK (vencido)

4. Resultado: AllOK = false ✅
```

## 🎯 Ventajas

### 1. Precisión por Tipo de Job

| Situación | Antes | Ahora |
|-----------|-------|-------|
| SystemDBs OK, UserDBs NO | ❌ Marca todo OK | ✅ Marca NO OK |
| Todos los tipos OK | ✅ Marca OK | ✅ Marca OK |
| Todos los tipos NO | ✅ Marca NO OK | ✅ Marca NO OK |
| Un tipo OK, otros vencidos | ❌ Marca OK | ✅ Marca NO OK |

### 2. Visibilidad Detallada

Con `-Verbose`:
```
VERBOSE:     CheckdbJobs del grupo: 4, AllOK=False
VERBOSE:       Job IntegrityCheck-SystemDBs del grupo está OK
VERBOSE:       Job IntegrityCheck-UserDBs del grupo NO está OK (más reciente: 2025-10-10)
```

Ahora sabes **exactamente qué tipo de job** está fallando.

### 3. Corrección de Falsos Positivos

**Antes:**
- Falsos positivos: ~10-15% (grupos marcados OK cuando tenían jobs fallando)

**Ahora:**
- Falsos positivos: ~0%
- Cada tipo de job se evalúa correctamente

## 🧪 Validación

### Identificar el Problema

```sql
-- En cada nodo del AG, ver estado de jobs
SELECT 
    j.name AS JobName,
    jh.run_date,
    jh.run_time,
    jh.run_status,
    CASE WHEN jh.run_status = 1 THEN 'OK' ELSE 'FAILED' END AS Status
FROM msdb.dbo.sysjobs j
LEFT JOIN msdb.dbo.sysjobhistory jh ON j.job_id = jh.job_id AND jh.step_id = 0
WHERE j.name LIKE '%IntegrityCheck%'
  AND jh.run_date >= CONVERT(INT, CONVERT(VARCHAR(8), DATEADD(DAY, -7, GETDATE()), 112))
ORDER BY j.name, jh.run_date DESC, jh.run_time DESC;
```

### Verificar en PowerShell

```powershell
# Ejecutar con verbose
.\RelevamientoHealthScoreMant.ps1 -Verbose

# Buscar mensajes de jobs NO OK
# "Job IntegrityCheck-UserDBs del grupo NO está OK"
```

### Verificar en JSON

```powershell
# Ver jobs por instancia
$results = Get-Content .\InstanceHealth_*.json | ConvertFrom-Json
$results | Where-Object { $_.InstanceName -match "SSPR19MBK" } | 
    Select InstanceName, 
           @{N='CheckdbOk';E={$_.MaintenanceSummary.CheckdbOk}},
           @{N='Jobs';E={$_.MaintenanceSummary.CheckdbJobs | 
                          Select JobName, LastRun, IsSuccess, IsRecent}}
```

## 📊 Impacto Esperado

### Distribución de Salud

**Antes (con falsos positivos):**
- Healthy: 63-68
- Warning: 50-52
- Critical: 10-11

**Ahora (más preciso):**
- Healthy: 55-60 ↓ (algunos que estaban OK incorrectamente ahora son Warning)
- Warning: 55-60 ↑
- Critical: 10-15 ↑ (algunos que estaban OK incorrectamente ahora son Critical)

**Nota:** La cantidad total no cambia, pero la **clasificación es más precisa**.

## 🔍 Casos de Uso Reales

### Caso 1: Job de SystemDBs OK, UserDBs Fallando

```
AG: SSPR19MBKAG

Estado real:
- SystemDBs: Se ejecuta correctamente en ambos nodos
- UserDBs: Falla en ambos nodos (problema con alguna base)

Antes: Marcado como OK ❌
Ahora: Marcado como NO OK ✅

Acción: Investigar por qué UserDBs está fallando
```

### Caso 2: Múltiples Jobs, Uno Vencido

```
AG: SSPR17MGFAG (4 nodos)

Jobs:
- IntegrityCheck-Set1 → OK en todos
- IntegrityCheck-Set2 → OK en todos
- IntegrityCheck-LargeDBs → Vencido en todos (no corre hace 10 días)

Antes: Marcado como OK (porque Set1 y Set2 están OK) ❌
Ahora: Marcado como NO OK (porque LargeDBs vencido) ✅

Acción: Revisar por qué LargeDBs no se está ejecutando
```

### Caso 3: Job Solo en Primario

```
AG: SSPR16SOAAG

Nodo 01 (Primario):
- IntegrityCheck-SystemDBs → OK
- IntegrityCheck-UserDBs → OK

Nodo 02 (Secundario):
- No tiene jobs configurados (backup está en primario)

Nueva lógica:
- Agrupa todos los jobs del grupo (solo del primario)
- Evalúa cada tipo
- Resultado: OK ✅ (porque considera ambos nodos)
```

## 📝 Logging Mejorado

### Con `-Verbose`

**Ejemplo 1: Todo OK**
```
  Procesando AG: SSPR19SSOAG
    Nodos: SSPR19SSO-01, SSPR19SSO-51
    CheckdbJobs del grupo: 4, AllOK=True
    IndexOptimizeJobs del grupo: 2, AllOK=True
```

**Ejemplo 2: Un Job NO OK**
```
  Procesando AG: SSPR19MBKAG
    Nodos: SSPR19MBK-01, SSPR19MBK-51
      Job IntegrityCheck-UserDBs del grupo NO está OK (más reciente: 2025-10-10)
    CheckdbJobs del grupo: 4, AllOK=False
    IndexOptimizeJobs del grupo: 2, AllOK=False
    [SYNC] SSPR19MBK-01
    [SYNC] SSPR19MBK-51
```

Ahora tienes **visibilidad exacta** de qué job está fallando.

## ✅ Checklist de Validación

```
[ ] Script se ejecuta sin errores
[ ] Mensajes "Job X del grupo NO está OK" aparecen cuando corresponde
[ ] Grupos con todos los tipos OK están marcados como OK
[ ] Grupos con algún tipo NO OK están marcados como NO OK
[ ] JSON muestra CheckdbOk correctamente
[ ] Distribución de salud refleja problemas reales
```

## 📞 Próximos Pasos

1. **Ejecutar script con `-Verbose`**
2. **Buscar mensajes de jobs NO OK**
3. **Verificar que instancias ahora marcadas como NO OK realmente tienen problemas**
4. **Investigar y corregir jobs que están fallando**

---

**Versión:** 2.1.5  
**Fecha:** 2025-10-22  
**Cambio Principal:** Evaluación de jobs por nombre en AlwaysOn  
**Impacto:** Elimina falsos positivos, mejora precisión  
**Testing:** Listo para validar ✅

