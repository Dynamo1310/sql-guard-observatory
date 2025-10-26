# Mejora de Output - Script Waits

## 🎯 Problema Identificado

El script `RelevamientoHealthScore_Waits.ps1` **SÍ estaba guardando los datos correctamente** en la base de datos, pero el output en consola mostraba "todo óptimo" porque los **thresholds de alerta eran muy altos**.

### Thresholds Anteriores (demasiado altos)
- **PAGEIOLATCH**: alerta si > 20% del total de waits
- **CXPACKET**: alerta si > 30% del total de waits  
- **RESOURCE_SEMAPHORE**: alerta si > 10% del total de waits

### Datos Reales de las Instancias
- PAGEIOLATCH: 0.00-0.05% (muy por debajo de 20%)
- CXPACKET: 0.00-1.84% (muy por debajo de 30%)
- Wait dominante: `SOS_WORK_DISPATCHER` (46-91%) - wait **benigno/esperado** en AlwaysOn AG

## ✅ Solución Implementada

### 1. Thresholds Más Sensibles

#### PAGEIOLATCH (I/O Waits)
- 🚨 **Crítico**: > 10%
- ⚠️ **Advertencia**: 5-10%
- 📊 **Info**: 1-5% (se muestra en métricas)

#### CXPACKET (Parallelism Waits)
- 🚨 **Crítico**: > 15%
- ⚠️ **Advertencia**: 10-15%
- 📊 **Info**: 1-10% (se muestra en métricas)

#### RESOURCE_SEMAPHORE (Memory Grants)
- 🚨 **Crítico**: > 5%
- ⚠️ **Advertencia**: 2-5%
- 📊 **Info**: 0.5-2% (se muestra en métricas)

#### WRITELOG (Transaction Log I/O)
- ⚠️ **Advertencia**: > 10%
- 📊 **Info**: > 5% (se muestra en métricas)

#### THREADPOOL (Worker Thread Starvation)
- 🚨 **Siempre crítico** si existe (cualquier valor)

#### SOS_SCHEDULER_YIELD (CPU Pressure)
- ⚠️ **Advertencia**: > 10%
- 📊 **Info**: > 5% (se muestra en métricas)

### 2. Output Mejorado por Instancia

Ahora muestra para cada instancia:

```
✅ SSPR19USR-51 | Wait:12414.5h, Top:SOS_WORK_DISPATCHER, PageIO:0.05%, CXP:0.25%
⚠️ I/O SSPR16NXS-51 [PAGEIOLATCH:8.4%] | Wait:9396.3h, Top:WRITELOG
🚨 PARALLELISM! SSPR17MSV-51 [CXPACKET:18.5%] | Wait:9686.3h, Top:CXPACKET
```

**Información mostrada:**
- **Status**: ✅ Óptimo | ⚠️ Advertencia | 🚨 Crítico
- **Alertas**: Entre `[]` - waits que superan thresholds de advertencia/crítico
- **Wait Time**: Total de wait time acumulado en horas
- **Top Wait**: Tipo de wait más frecuente
- **Métricas**: Porcentajes de waits relevantes (>1%)

### 3. Resumen Mejorado

El resumen final ahora incluye:

```
╔═══════════════════════════════════════════════════════╗
║  RESUMEN - WAIT STATISTICS & BLOCKING                ║
╠═══════════════════════════════════════════════════════╣
║  Total instancias:        127                       ║
║  Con blocking:              0                       ║
║  Blocking severo (>10):     0                       ║
║  PAGEIOLATCH >10%:          0                       ║
║  PAGEIOLATCH 5-10%:         2                       ║
║  PAGEIOLATCH 1-5%:         15                       ║
║  CXPACKET >15%:             3                       ║
║  CXPACKET 10-15%:           5                       ║
║  CXPACKET 1-10%:           25                       ║
║  RESOURCE_SEM >5%:          0                       ║
║  RESOURCE_SEM 2-5%:         1                       ║
║  WRITELOG >10%:             0                       ║
║  THREADPOOL (crítico):      0                       ║
║  SOS_YIELD >10%:            0                       ║
╚═══════════════════════════════════════════════════════╝

📊 TOP 5 INSTANCIAS POR WAIT TIME:
   SSPRAW19CTD-01            - 18398.9h total | Top: SOS_WORK_DISPATCHER
   SSPR19VFH-51              - 18908.2h total | Top: SOS_WORK_DISPATCHER
   SSPR16BPM-02              - 18046.9h total | Top: WRITELOG
   SSTS19-01                 - 15434.9h total | Top: HADR_SYNC_COMMIT
   SSPR17MSV-51              - 9686.3h total  | Top: CXPACKET
```

## 📊 Interpretación de los Datos Actuales

Según los datos que proporcionaste:

### ✅ Buenas Noticias
1. **Sin Blocking**: 0 instancias con blocking activo
2. **PAGEIOLATCH bajo**: 0.00-0.05% es **excelente** (I/O rápido)
3. **CXPACKET bajo**: 0.00-1.84% es **normal** (paralelismo bajo impacto)
4. **SOS_WORK_DISPATCHER dominante**: Es **esperado** en AlwaysOn AG (wait benigno)

### 📌 Observaciones
- **Wait Time Total**: Muy alto (miles de horas) - **ACUMULADO desde último reset de estadísticas**
- **Percentiles**: Los waits problemáticos son < 2% del total
- **Top Wait Types**: Dominados por waits benignos (SOS_WORK_DISPATCHER, PARALLEL_REDO_WORKER_WAIT_WORK, BROKER_TRANSMITTER)

### ✅ Conclusión
Las instancias están **funcionando correctamente** en términos de waits. Los thresholds anteriores eran demasiado altos para detectar problemas sutiles, pero los datos actuales indican **salud excelente**.

## 🧪 Testing

Para probar los cambios:

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\scripts
.\RelevamientoHealthScore_Waits.ps1
```

## 📝 Notas Adicionales

- Los waits son **acumulativos desde el último reinicio** o desde el último `DBCC SQLPERF('sys.dm_os_wait_stats', CLEAR)`
- `SOS_WORK_DISPATCHER` es el wait más común en AlwaysOn AG y **no indica problemas**
- Los porcentajes se calculan sobre el **total de waits no benignos** (se filtran ~40 tipos de waits esperados)
- El script ahora muestra **información contextual** incluso cuando no hay alertas críticas

## 🎯 Próximos Pasos

1. **Ejecutar el script** para ver el nuevo output mejorado
2. **Revisar el resumen** para identificar instancias con waits elevados
3. **Consolidator**: El script `RelevamientoHealthScore_Consolidate_v3_FINAL.ps1` usará estos datos para calcular penalizaciones en el Health Score
4. **Frontend**: Agregar visualización de waits en el dashboard

