# Corrección: Fallback Robusto SQL 2005/2008 para CPU Metrics

**Fecha**: 27 de enero de 2025  
**Archivo**: `scripts/RelevamientoHealthScore_CPU.ps1`

## 🐛 Problema Detectado

El script de recolección de métricas de CPU estaba fallando en instancias con SQL Server 2005/2008 con los siguientes errores:

```
WARNING: Error obteniendo CPU metrics en SSMCS-02: Incorrect syntax near '('.
Must declare the scalar variable "@ts_now".
Incorrect syntax near the keyword 'AS'.
```

### Instancias Afectadas
- SSMCS-02
- SSCC03
- Y potencialmente otras instancias con SQL Server 2005/2008

### Síntomas
- Warnings en la ejecución del script
- Valores en 0 para métricas de CPU: `Avg:0% P95:0% Runnable:0`
- No se recolectaban métricas válidas para scoring

## 🔧 Solución Implementada

### 1. Detección Automática de Versión

Se agregó detección de versión de SQL Server al inicio de la función `Get-CPUMetrics`:

```powershell
$versionQuery = "SELECT CAST(SERVERPROPERTY('ProductVersion') AS VARCHAR(50)) AS Version;"
$versionResult = Invoke-DbaQuery -SqlInstance $InstanceName -Query $versionQuery -QueryTimeout 5
$version = [int]($versionResult.Version.Split('.')[0])
```

### 2. Query Simplificada para SQL 2005/2008 (versión ≤ 10.x)

Para versiones antiguas, se usa una query compatible sin:
- CTEs (Common Table Expressions)
- Variables complejas `@ts_now`
- Ring buffers con XML parsing
- Subconsultas complejas

**Query para SQL 2005/2008**:
```sql
-- Runnable tasks (tareas esperando CPU)
SELECT 
    ISNULL(COUNT(*), 0) AS RunnableTasksCount
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE status = 'VISIBLE ONLINE'
  AND runnable_tasks_count > 0;

-- Work queued (I/O pendiente)
SELECT 
    ISNULL(SUM(pending_disk_io_count), 0) AS PendingDiskIO
FROM sys.dm_os_schedulers WITH (NOLOCK)
WHERE scheduler_id < 255;

-- CPU Snapshot actual de Performance Counter
SELECT 
    CAST(ISNULL(cntr_value, 0) AS INT) AS CPUValue
FROM sys.dm_os_performance_counters WITH (NOLOCK)
WHERE counter_name LIKE 'CPU usage %'
  AND instance_name = 'default';
```

### 3. Query Completa para SQL 2012+ (versión ≥ 11.x)

Para versiones modernas, se mantiene la query completa con historial de CPU:

```sql
DECLARE @ts_now bigint;
SELECT @ts_now = cpu_ticks / (cpu_ticks / ms_ticks) FROM sys.dm_os_sys_info;

WITH CPUHistory AS (
    SELECT 
        record.value('(./Record/@id)[1]', 'int') AS record_id,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/SystemIdle)[1]', 'int') AS SystemIdle,
        record.value('(./Record/SchedulerMonitorEvent/SystemHealth/ProcessUtilization)[1]', 'int') AS SQLProcessUtilization,
        [timestamp]
    FROM (
        SELECT [timestamp], CONVERT(xml, record) AS [record]
        FROM sys.dm_os_ring_buffers
        WHERE ring_buffer_type = N'RING_BUFFER_SCHEDULER_MONITOR'
          AND record LIKE N'%<SystemHealth>%'
    ) AS x
)
SELECT TOP(10)
    DATEADD(ms, -1 * (@ts_now - [timestamp]), GETDATE()) AS EventTime,
    SQLProcessUtilization AS SQLServerCPU,
    SystemIdle,
    100 - SystemIdle - SQLProcessUtilization AS OtherProcessCPU
FROM CPUHistory
ORDER BY record_id DESC;

-- + Runnable tasks y Pending I/O
```

### 4. Procesamiento Diferenciado de Resultados

Se agregó lógica condicional para procesar los resultados según la versión:

**Para SQL 2005/2008**:
```powershell
if ($version -le 10) {
    # SQL 2005/2008: Procesar resultsets simplificados
    # ResultSet 1: Runnable tasks
    # ResultSet 2: Pending I/O
    # ResultSet 3: CPU Value (snapshot actual)
    
    # Usar el valor actual como promedio y p95 (no hay histórico)
    $result.SQLProcessUtilization = $cpuValue
    $result.AvgCPUPercentLast10Min = $cpuValue
    $result.P95CPUPercent = $cpuValue
    $result.SystemIdleProcess = 0  # No disponible
    $result.OtherProcessUtilization = 0
}
```

**Para SQL 2012+**:
```powershell
else {
    # SQL 2012+: Procesar resultsets completos con histórico
    # ResultSet 1: CPU Utilization (últimos 10 minutos)
    # Calcular promedio, P95, últimos valores
    # ResultSet 2: Runnable tasks
    # ResultSet 3: Pending I/O
}
```

## 📊 Diferencias entre Versiones

| Característica | SQL 2005/2008 | SQL 2012+ |
|---|---|---|
| **Método de obtención** | Performance Counters (snapshot) | Ring buffers (histórico 10 min) |
| **AvgCPUPercent** | Valor actual | Promedio real de 10 minutos |
| **P95CPUPercent** | Valor actual | Percentil 95 real |
| **SystemIdle** | No disponible (0) | Disponible |
| **OtherProcessCPU** | No disponible (0) | Disponible |
| **RunnableTasks** | ✅ Disponible | ✅ Disponible |
| **PendingDiskIO** | ✅ Disponible | ✅ Disponible |

## ✅ Resultado Esperado

### Antes (con error):
```
WARNING: Error obteniendo CPU metrics en SSMCS-02: Incorrect syntax near '('.
   ✅ SSMCS-02 - Avg:0% P95:0% Runnable:0
```

### Después (corregido):
```
   ✅ SSMCS-02 - Avg:15% P95:15% Runnable:0
```

**Nota**: En SQL 2005/2008, los valores Avg y P95 serán iguales (snapshot actual), no históricos.

## 🎯 Impacto en Scoring

- **SQL 2005/2008**: Se usa el valor de CPU actual para scoring (menos preciso pero funcional)
- **SQL 2012+**: Se usa el percentil 95 de los últimos 10 minutos (más preciso)
- **Ambos**: Las métricas críticas (Runnable tasks, Pending I/O) funcionan correctamente

### Criterios de Scoring (sin cambios)
- P95 ≤ 80% → Score 100
- P95 81-90% → Score 70
- P95 > 90% → Score 40
- RunnableTask > 1 sostenido → Cap en 70

## 🔄 Compatibilidad

| SQL Server | Versión Major | Estado |
|---|---|---|
| SQL 2005 | 9.x | ✅ Compatible (fallback) |
| SQL 2008 | 10.0 | ✅ Compatible (fallback) |
| SQL 2008 R2 | 10.5 | ✅ Compatible (fallback) |
| SQL 2012 | 11.x | ✅ Compatible (query completa) |
| SQL 2014+ | 12.x+ | ✅ Compatible (query completa) |

## 🧪 Testing Recomendado

1. **SQL 2005/2008**:
```powershell
.\RelevamientoHealthScore_CPU.ps1
# Verificar que SSMCS-02 y SSCC03 ya no den warnings
# Verificar que los valores de CPU sean > 0
```

2. **SQL 2012+**:
```powershell
.\RelevamientoHealthScore_CPU.ps1
# Verificar que funcione con query completa
# Verificar que Avg y P95 sean diferentes (histórico)
```

3. **Verificar en SQLNova**:
```sql
SELECT 
    InstanceName,
    SqlVersion,
    AvgCPUPercentLast10Min,
    P95CPUPercent,
    RunnableTasks,
    CollectedAtUtc
FROM dbo.InstanceHealth_CPU
WHERE CollectedAtUtc >= DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY CollectedAtUtc DESC;
```

## 📝 Notas Importantes

1. **Limitación SQL 2005/2008**: No hay histórico de CPU disponible, se usa snapshot actual
2. **Performance Counters**: En SQL 2005/2008 se usa `sys.dm_os_performance_counters`
3. **Ring Buffers**: Solo disponibles para análisis histórico en SQL 2012+
4. **Timeout**: Se mantiene en 15 segundos para evitar bloqueos
5. **Frecuencia**: Se mantiene en 5 minutos según Health Score v3.0

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_CPU.ps1` (modificado)
- `CORRECCION_FALLBACK_ROBUSTO_SQL2008.md` (otros scripts con fallback similar)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (tabla `InstanceHealth_CPU`)

---

**Próximos pasos**: Ejecutar script en producción y verificar que las instancias SQL 2005/2008 ya no generen warnings y reporten métricas válidas.

