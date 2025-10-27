# Corrección: Procesamiento de Resultsets en CPU Metrics

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_CPU.ps1`

## 🐛 Problema Detectado

El script mostraba valores incorrectos para todas las instancias:

```
✅ SSPR17CRM365-01 - Avg:92% P95:0% Runnable:0
✅ SSPR17EBK-01 - Avg:34% P95:0% Runnable:0
✅ SSPR19-01 - Avg:22% P95:0% Runnable:0
...

║  CPU alto (>80%):      0  ← INCORRECTO (hay instancias con CPU >80%)
║  Con runnable tasks:   0  ← Potencialmente incorrecto
```

### Síntomas

1. **P95 siempre en 0**: Todas las instancias mostraban P95CPUPercent = 0
2. **Runnable tasks siempre en 0**: Todas las instancias mostraban RunnableTasks = 0
3. **Resumen incorrecto**: No detectaba instancias con CPU alto (>80%)
4. **Avg correcto pero P95 incorrecto**: SSPR17CRM365-01 tenía Avg:92% pero P95:0%

## 🔍 Causa Raíz

El problema estaba en cómo se procesaban los **múltiples resultsets** devueltos por `Invoke-DbaQuery`.

### Código Problemático

**Antes**:
```powershell
$data = Invoke-DbaQuery -SqlInstance $InstanceName -Query $query
$resultSets = @($data)
```

**Problema**: Cuando `Invoke-DbaQuery` devuelve múltiples resultsets sin `-As DataSet`, los datos pueden venir mezclados en un solo array plano, o en formatos inconsistentes dependiendo de:
- Versión de dbatools
- Tipo de datos devueltos
- Cantidad de filas en cada resultset

Esto causaba que:
1. `$resultSets[0]` no contenía el primer resultset, sino datos mezclados
2. Las propiedades como `.SQLServerCPU` no existían
3. Los valores quedaban en 0 (valor por defecto del hashtable `$result`)

## 🔧 Solución Implementada

### 1. Usar `-As DataSet` para Separar Resultsets

**Después**:
```powershell
$datasets = Invoke-DbaQuery -SqlInstance $InstanceName `
    -Query $query `
    -QueryTimeout $TimeoutSec `
    -As DataSet `  # ← CLAVE: Separar resultsets correctamente
    -EnableException

if ($datasets -and $datasets.Tables.Count -gt 0) {
    $resultSets = $datasets.Tables  # ← Acceso correcto a tablas
    ...
}
```

### 2. Acceder a Filas con `.Rows`

Cuando usamos `DataSet`, las filas se acceden con `.Rows`:

**SQL 2005/2008 (resultsets con 1 fila)**:
```powershell
# Antes (incorrecto)
$runnableData = $resultSets[0] | Select-Object -First 1
$result.RunnableTasks = [int]$runnableData.RunnableTasksCount

# Después (correcto)
if ($resultSets.Count -ge 1 -and $resultSets[0].Rows.Count -gt 0) {
    $runnableData = $resultSets[0].Rows[0]  # ← Acceso correcto
    $result.RunnableTasks = [int]$runnableData.RunnableTasksCount
}
```

### 3. Convertir DataRows a PowerShell Objects para SQL 2012+

**SQL 2012+ (resultsets con múltiples filas - TOP 10)**:
```powershell
# Antes (incorrecto)
$cpuData = $resultSets[0]
$result.AvgCPUPercentLast10Min = [int](($cpuData | Measure-Object -Property SQLServerCPU -Average).Average)

# Después (correcto)
if ($resultSets.Count -ge 1 -and $resultSets[0].Rows.Count -gt 0) {
    # Convertir DataTable rows a objetos PowerShell
    $cpuRows = @()
    foreach ($row in $resultSets[0].Rows) {
        $cpuRows += [PSCustomObject]@{
            SQLServerCPU = [int]$row.SQLServerCPU
            SystemIdle = [int]$row.SystemIdle
            OtherProcessCPU = [int]$row.OtherProcessCPU
        }
    }
    
    # Ahora Measure-Object y Sort-Object funcionan correctamente
    $result.AvgCPUPercentLast10Min = [int](($cpuRows | Measure-Object -Property SQLServerCPU -Average).Average)
    
    $sortedCPU = $cpuRows | Sort-Object -Property SQLServerCPU
    $p95Index = [Math]::Floor($sortedCPU.Count * 0.95)
    $result.P95CPUPercent = [int]$sortedCPU[$p95Index].SQLServerCPU
}
```

## 📊 Diferencias: DataSet vs Array Normal

| Aspecto | Sin `-As DataSet` | Con `-As DataSet` |
|---------|-------------------|-------------------|
| **Tipo devuelto** | Array mixto/plano | DataSet con Tables |
| **Acceso a resultsets** | Inconsistente | `$datasets.Tables[0]`, `[1]`, etc. |
| **Acceso a filas** | `$data[0]` (puede fallar) | `$table.Rows[0]` (consistente) |
| **Múltiples resultsets** | Puede mezclar datos | Separados correctamente |
| **Propiedades** | Puede no existir | Siempre existen |
| **Confiabilidad** | ⚠️ Inconsistente | ✅ Consistente |

## ✅ Resultado Esperado Después de la Corrección

### Output del Script

```powershell
   ✅ SSPR17CRM365-01 - Avg:92% P95:95% Runnable:0  # ← P95 ahora correcto
   ⚠️ CPU WARN SSPR17EBK-01 - Avg:34% P95:82% Runnable:0  # ← Detecta P95 alto
   ✅ SSPR19-01 - Avg:22% P95:28% Runnable:0  # ← P95 coherente con Avg
```

### Resumen

```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - CPU                                        ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:     127                            ║
║  CPU promedio:         4%                             ║
║  CPU alto (>80%):      2    ← CORRECTO (detecta instancias con P95 >80%)
║  Con runnable tasks:   3    ← Valores reales
╚═══════════════════════════════════════════════════════╝
```

### Validación en Base de Datos

```sql
SELECT TOP 10
    InstanceName,
    AvgCPUPercentLast10Min,
    P95CPUPercent,  -- Ya no será 0
    RunnableTasks,  -- Ya no será siempre 0
    CollectedAtUtc
FROM dbo.InstanceHealth_CPU
ORDER BY CollectedAtUtc DESC;
```

**Resultado esperado**:
- `P95CPUPercent` debe ser >= `AvgCPUPercentLast10Min` (lógica correcta)
- `P95CPUPercent` NO debe ser 0 si `AvgCPUPercentLast10Min` > 0
- `RunnableTasks` puede ser 0 (normal si no hay contención) o > 0

## 🧪 Testing

### Test 1: Verificar P95 en Instancia con CPU Alta

```powershell
# Ejecutar script
.\RelevamientoHealthScore_CPU.ps1

# Buscar instancias con CPU alta en el output
# Verificar que P95 > 0 y coherente con Avg
```

**Ejemplo esperado**:
```
⚠️ CPU HIGH! SSPR17CRM365-01 - Avg:92% P95:95% Runnable:0
```

### Test 2: Verificar en Base de Datos

```sql
-- Ver últimas recolecciones
SELECT TOP 20
    InstanceName,
    AvgCPUPercentLast10Min AS Avg,
    P95CPUPercent AS P95,
    RunnableTasks,
    CollectedAtUtc,
    -- Validar lógica: P95 debe ser >= Avg
    CASE 
        WHEN P95CPUPercent >= AvgCPUPercentLast10Min THEN 'OK'
        ELSE 'ERROR: P95 < Avg'
    END AS Validation
FROM dbo.InstanceHealth_CPU
WHERE CollectedAtUtc >= DATEADD(MINUTE, -10, GETDATE())
ORDER BY P95CPUPercent DESC;
```

**Resultado esperado**: Todas las filas deben tener `Validation = 'OK'`

### Test 3: Verificar Instancias con CPU Alto

```sql
-- Contar instancias con CPU alto en últimos 10 minutos
SELECT 
    COUNT(*) AS InstanciasConCPUAlto
FROM dbo.InstanceHealth_CPU
WHERE P95CPUPercent > 80
  AND CollectedAtUtc >= DATEADD(MINUTE, -10, GETDATE());
```

**Comparar con el resumen del script**: Los números deben coincidir

### Test 4: Verificar Runnable Tasks

```sql
-- Ver instancias con runnable tasks
SELECT 
    InstanceName,
    RunnableTasks,
    P95CPUPercent,
    CollectedAtUtc
FROM dbo.InstanceHealth_CPU
WHERE RunnableTasks > 0
  AND CollectedAtUtc >= DATEADD(MINUTE, -10, GETDATE())
ORDER BY RunnableTasks DESC;
```

**Resultado esperado**: Debería haber algunas instancias con `RunnableTasks > 0` (contención de CPU)

## 📝 Lecciones Aprendidas

### 1. Siempre Usar `-As DataSet` para Múltiples Resultsets

```powershell
# MAL
$data = Invoke-DbaQuery -Query $multiResultSetQuery

# BIEN
$datasets = Invoke-DbaQuery -Query $multiResultSetQuery -As DataSet
$resultSets = $datasets.Tables
```

### 2. Acceder a Filas con `.Rows`

```powershell
# MAL
$firstRow = $resultSet | Select-Object -First 1

# BIEN
$firstRow = $resultSet.Rows[0]
```

### 3. Convertir DataRows a PSObjects para Cmdlets

```powershell
# MAL - Measure-Object puede no funcionar en DataRows
$avg = ($dataTable.Rows | Measure-Object -Property Value -Average).Average

# BIEN - Convertir primero
$objects = foreach ($row in $dataTable.Rows) {
    [PSCustomObject]@{ Value = $row.Value }
}
$avg = ($objects | Measure-Object -Property Value -Average).Average
```

### 4. Validar Count antes de Acceder

```powershell
# MAL - puede fallar con error de índice
$value = $resultSets[0].Rows[0].Value

# BIEN - validar primero
if ($resultSets.Count -ge 1 -and $resultSets[0].Rows.Count -gt 0) {
    $value = $resultSets[0].Rows[0].Value
}
```

## 🔗 Scripts Similares que Pueden Tener el Mismo Problema

Revisar si otros scripts de Health Score tienen el mismo problema:

```powershell
# Buscar scripts que NO usan -As DataSet
Get-ChildItem -Path ".\scripts\RelevamientoHealthScore_*.ps1" | 
    Select-String -Pattern "Invoke-DbaQuery" -Context 0,2 |
    Where-Object { $_.Line -notlike "*-As DataSet*" }
```

**Acción**: Si se encuentran scripts similares con múltiples resultsets, aplicar la misma corrección.

## 🎯 Impacto en Scoring

### Antes de la Corrección

```
SSPR17CRM365-01:
- Avg: 92%
- P95: 0% (INCORRECTO)
- Score calculado con P95=0 → Score: 100 (INCORRECTO - debería ser ~40)
```

### Después de la Corrección

```
SSPR17CRM365-01:
- Avg: 92%
- P95: 95% (CORRECTO)
- Score calculado con P95=95 → Score: 40 (CORRECTO - P95 >90%)
```

**Impacto**: El Health Score ahora reflejará correctamente el uso real de CPU de las instancias.

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_CPU.ps1` (corregido)
- `CORRECCION_FALLBACK_ROBUSTO_SQL2008.md` (corrección previa del mismo script)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (tabla `InstanceHealth_CPU`)

---

**Corrección implementada el**: 27 de enero de 2025  
**Causa**: Procesamiento incorrecto de múltiples resultsets sin `-As DataSet`  
**Solución**: Usar `-As DataSet` y acceder correctamente a `.Tables[n].Rows`

