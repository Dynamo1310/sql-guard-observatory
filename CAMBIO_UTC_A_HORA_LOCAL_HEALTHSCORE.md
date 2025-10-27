# Cambio de UTC a Hora Local del Servidor en Scripts de Health Score

**Fecha**: 27 de enero de 2025  
**Alcance**: Todos los scripts de recolección de Health Score v3.0

## 📋 Resumen del Cambio

Se modificaron **14 scripts** de Health Score para guardar las fechas en horario local del servidor (UTC-3) en lugar de UTC.

### Cambio Realizado

**Antes**:
```sql
CollectedAtUtc,
...
VALUES (
    ...
    GETUTCDATE(),
    ...
);
```

**Después**:
```sql
CollectedAtUtc,  -- El nombre de columna se mantiene por compatibilidad
...
VALUES (
    ...
    GETDATE(),    -- Ahora guarda en hora local del servidor
    ...
);
```

## 📝 Scripts Modificados

| # | Script | Tabla Afectada | Estado |
|---|--------|----------------|--------|
| 1 | `RelevamientoHealthScore_AlwaysOn.ps1` | `InstanceHealth_AlwaysOn` | ✅ Modificado |
| 2 | `RelevamientoHealthScore_Autogrowth.ps1` | `InstanceHealth_Autogrowth` | ✅ Modificado |
| 3 | `RelevamientoHealthScore_Backups.ps1` | `InstanceHealth_Backups` | ✅ Modificado |
| 4 | `RelevamientoHealthScore_ConfiguracionTempdb.ps1` | `InstanceHealth_ConfiguracionTempdb` | ✅ Modificado |
| 5 | `RelevamientoHealthScore_CPU.ps1` | `InstanceHealth_CPU` | ✅ Modificado |
| 6 | `RelevamientoHealthScore_DatabaseStates.ps1` | `InstanceHealth_DatabaseStates` | ✅ Modificado |
| 7 | `RelevamientoHealthScore_Discos.ps1` | `InstanceHealth_Discos` | ✅ Modificado |
| 8 | `RelevamientoHealthScore_ErroresCriticos.ps1` | `InstanceHealth_ErroresCriticos` | ✅ Modificado |
| 9 | `RelevamientoHealthScore_IO.ps1` | `InstanceHealth_IO` | ✅ Modificado |
| 10 | `RelevamientoHealthScore_LogChain.ps1` | `InstanceHealth_LogChain` | ✅ Modificado |
| 11 | `RelevamientoHealthScore_Maintenance.ps1` | `InstanceHealth_Maintenance` | ✅ Modificado |
| 12 | `RelevamientoHealthScore_Memoria.ps1` | `InstanceHealth_Memoria` | ✅ Modificado |
| 13 | `RelevamientoHealthScore_Waits.ps1` | `InstanceHealth_Waits` | ✅ Modificado |
| 14 | `RelevamientoHealthScore_Consolidate_v3_FINAL.ps1` | `InstanceHealthScore` | ✅ Modificado |

## 🌍 Zonas Horarias

| Ubicación | Zona Horaria | Offset UTC | Ejemplo |
|-----------|--------------|------------|---------|
| **Servidor SQL** | Argentina (ART) | UTC-3 | 15:00 ART |
| **UTC** | Coordinado Universal | UTC+0 | 18:00 UTC |
| **Diferencia** | -3 horas | | |

### Ejemplo Práctico

**Escenario**: Script ejecutado el 27 de enero de 2025 a las 15:00 hora local de Argentina

**Antes (con GETUTCDATE)**:
```sql
CollectedAtUtc: 2025-01-27 18:00:00.000
```

**Después (con GETDATE)**:
```sql
CollectedAtUtc: 2025-01-27 15:00:00.000
```

## 🎯 Motivación del Cambio

1. **Consistencia con horario de trabajo**: Los DBAs trabajan en horario local (UTC-3)
2. **Facilidad de correlación**: Más fácil correlacionar eventos con horarios de trabajo/mantenimiento
3. **Reportes más intuitivos**: Los gráficos y tendencias se muestran en horario local
4. **Alertas más claras**: "Problema detectado a las 15:00" es más claro que "18:00 UTC"

## 📊 Impacto en Tablas de Base de Datos

### Columnas Afectadas

Todas las tablas de Health Score tienen una columna `CollectedAtUtc` que ahora almacenará **hora local** en lugar de UTC:

```sql
-- Tablas afectadas (todas tienen esta columna)
InstanceHealth_AlwaysOn.CollectedAtUtc
InstanceHealth_Autogrowth.CollectedAtUtc
InstanceHealth_Backups.CollectedAtUtc
InstanceHealth_ConfiguracionTempdb.CollectedAtUtc
InstanceHealth_CPU.CollectedAtUtc
InstanceHealth_DatabaseStates.CollectedAtUtc
InstanceHealth_Discos.CollectedAtUtc
InstanceHealth_ErroresCriticos.CollectedAtUtc
InstanceHealth_IO.CollectedAtUtc
InstanceHealth_LogChain.CollectedAtUtc
InstanceHealth_Maintenance.CollectedAtUtc
InstanceHealth_Memoria.CollectedAtUtc
InstanceHealth_Waits.CollectedAtUtc
InstanceHealthScore.CollectedAtUtc
```

### ⚠️ Nota Importante sobre el Nombre de Columna

El nombre `CollectedAtUtc` se **mantiene** por compatibilidad con el código existente, pero **el contenido ahora es hora local (UTC-3)**.

**Opción 1 (actual)**: Mantener el nombre `CollectedAtUtc` pero con hora local
- ✅ No requiere cambios en el schema
- ✅ No requiere cambios en el código de la API
- ❌ El nombre es engañoso

**Opción 2 (futura)**: Renombrar columnas a `CollectedAt`
- ✅ Nombre más preciso
- ❌ Requiere migración de schema
- ❌ Requiere actualizar código de la API

**Decisión**: Mantener nombre actual por simplicidad.

## 🔍 Verificación de Cambios

### 1. Verificar que no queden GETUTCDATE en los scripts

```powershell
# Buscar ocurrencias de GETUTCDATE en scripts de Health Score
Get-ChildItem -Path ".\scripts\RelevamientoHealthScore_*.ps1" | 
    Select-String -Pattern "GETUTCDATE" | 
    Select-Object Filename, LineNumber, Line
```

**Resultado esperado**: No debe haber coincidencias

### 2. Verificar inserciones en base de datos

```sql
-- Verificar que las fechas se guardan en hora local
SELECT TOP 10
    InstanceName,
    CollectedAtUtc,  -- Nombre de columna
    GETDATE() AS ServerLocalTime,  -- Hora local actual
    DATEDIFF(MINUTE, CollectedAtUtc, GETDATE()) AS MinutosDesdeRecoleccion
FROM dbo.InstanceHealth_CPU
ORDER BY CollectedAtUtc DESC;
```

**Resultado esperado**: 
- `CollectedAtUtc` debe estar cerca de `ServerLocalTime` (diferencia de pocos minutos)
- NO debe haber diferencia de 3 horas

### 3. Verificar todas las tablas

```sql
-- Script para verificar la última inserción en todas las tablas
SELECT 'AlwaysOn' AS Tabla, MAX(CollectedAtUtc) AS UltimaRecoleccion FROM dbo.InstanceHealth_AlwaysOn
UNION ALL
SELECT 'Autogrowth', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Autogrowth
UNION ALL
SELECT 'Backups', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Backups
UNION ALL
SELECT 'ConfiguracionTempdb', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_ConfiguracionTempdb
UNION ALL
SELECT 'CPU', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_CPU
UNION ALL
SELECT 'DatabaseStates', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_DatabaseStates
UNION ALL
SELECT 'Discos', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Discos
UNION ALL
SELECT 'ErroresCriticos', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_ErroresCriticos
UNION ALL
SELECT 'IO', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_IO
UNION ALL
SELECT 'LogChain', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_LogChain
UNION ALL
SELECT 'Maintenance', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 'Memoria', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Memoria
UNION ALL
SELECT 'Waits', MAX(CollectedAtUtc) FROM dbo.InstanceHealth_Waits
UNION ALL
SELECT 'HealthScore', MAX(CollectedAtUtc) FROM dbo.InstanceHealthScore
ORDER BY UltimaRecoleccion DESC;
```

## 📈 Impacto en Gráficos y Reportes

### Frontend

Si el frontend ya está configurado para mostrar fechas en hora local, **no requiere cambios**.

Si el frontend estaba convirtiendo de UTC a local, **debe actualizarse** para tratar las fechas como locales:

**Antes**:
```typescript
// Convertir UTC a local
const localDate = new Date(data.collectedAtUtc + 'Z'); // 'Z' indica UTC
```

**Después**:
```typescript
// Ya es hora local, no convertir
const localDate = new Date(data.collectedAtUtc);
```

### Queries de Tendencias

Las queries que usan `DATEADD` para filtrar por rangos de tiempo **no requieren cambios**:

```sql
-- Esta query funciona igual antes y después
SELECT *
FROM dbo.InstanceHealth_CPU
WHERE CollectedAtUtc >= DATEADD(HOUR, -24, GETDATE())
ORDER BY CollectedAtUtc DESC;
```

## 🔄 Datos Históricos

### ¿Qué pasa con los datos antiguos?

Los datos **históricos** guardados con `GETUTCDATE()` permanecen sin cambios:
- Datos anteriores al 27/01/2025: en UTC
- Datos posteriores al 27/01/2025: en hora local (UTC-3)

### Opción 1: Convivencia de Datos

**No hacer nada** y aceptar que:
- Datos antiguos están en UTC
- Datos nuevos están en hora local
- Para análisis históricos largos, puede haber inconsistencia visual de 3 horas

### Opción 2: Migración de Datos Históricos (Opcional)

Si se desea homogeneizar los datos históricos:

```sql
-- ⚠️ EJECUTAR CON PRECAUCIÓN - Modifica datos históricos
-- Convertir datos antiguos de UTC a hora local (restar 3 horas)

-- Ejemplo para una tabla:
UPDATE dbo.InstanceHealth_CPU
SET CollectedAtUtc = DATEADD(HOUR, -3, CollectedAtUtc)
WHERE CollectedAtUtc < '2025-01-27 00:00:00'  -- Solo datos anteriores al cambio
  AND CollectedAtUtc > DATEADD(HOUR, 3, CollectedAtUtc);  -- Validar que está en UTC

-- IMPORTANTE: Hacer backup antes de ejecutar
-- IMPORTANTE: Ejecutar para todas las tablas de Health Score
```

**Recomendación**: **NO migrar** datos históricos para evitar riesgos. La inconsistencia de 3 horas en datos antiguos es aceptable.

## 🧪 Testing

### 1. Test de Inserción

```powershell
# Ejecutar un script de recolección
.\scripts\RelevamientoHealthScore_CPU.ps1

# Verificar en SQL
# La fecha debe ser cercana a la hora actual del servidor
```

```sql
SELECT TOP 1
    InstanceName,
    CollectedAtUtc,
    GETDATE() AS HoraServidorActual,
    DATEDIFF(SECOND, CollectedAtUtc, GETDATE()) AS SegundosDeRetraso
FROM dbo.InstanceHealth_CPU
ORDER BY CollectedAtUtc DESC;
```

**Resultado esperado**: `SegundosDeRetraso` debe ser < 60 segundos (tiempo de ejecución del script)

### 2. Test de Consolidate

```powershell
# Ejecutar script de consolidación
.\scripts\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1

# Verificar en SQL
```

```sql
SELECT TOP 1
    InstanceName,
    CollectedAtUtc,
    HealthScore,
    HealthStatus
FROM dbo.InstanceHealthScore
ORDER BY CollectedAtUtc DESC;
```

### 3. Test de Tendencias (Frontend)

1. Abrir el dashboard de Health Score
2. Ver gráficos de tendencias
3. Verificar que las fechas en el eje X sean coherentes con la hora local
4. Verificar que al hacer hover sobre un punto, la fecha sea correcta

## 📝 Consideraciones Futuras

### 1. Documentación

Actualizar documentación que mencione "UTC" en:
- README de scripts
- Documentación de API
- Guías de usuario
- Comentarios en código

### 2. Renombrar Columnas (Opcional - Futuro)

Si se decide renombrar las columnas para mayor claridad:

```sql
-- Renombrar columnas (requiere migración completa)
EXEC sp_rename 'dbo.InstanceHealth_CPU.CollectedAtUtc', 'CollectedAt', 'COLUMN';
-- ... repetir para todas las tablas
```

### 3. Horario de Verano (DST)

Argentina **no usa horario de verano** desde 2009, por lo que no hay complicaciones con cambios estacionales.

### 4. Servidores en Otras Zonas Horarias

Si se agregan servidores en otras zonas horarias:
- Cada servidor guardará datos en **su hora local**
- Considerar agregar columna `TimeZone` o `UtcOffset` para diferenciar

## ✅ Checklist de Implementación

- [x] Modificar 14 scripts de recolección (GETUTCDATE → GETDATE)
- [x] Verificar que no queden ocurrencias de GETUTCDATE
- [x] Documentar cambios en este archivo
- [ ] Ejecutar scripts en producción
- [ ] Verificar inserciones en base de datos
- [ ] Validar gráficos en frontend
- [ ] Actualizar documentación de usuario (si es necesario)
- [ ] Comunicar cambio al equipo

## 🔗 Archivos Relacionados

- `scripts/RelevamientoHealthScore_*.ps1` (14 scripts modificados)
- `supabase/migrations/20250125_healthscore_v3_tables.sql` (schema de tablas)
- `src/pages/HealthScore.tsx` (frontend que consume los datos)

## 📞 Soporte

Si se detectan problemas con las fechas después del cambio:

1. Verificar que `GETDATE()` en SQL Server devuelve la hora local esperada
2. Verificar timezone del servidor SQL: `SELECT SYSDATETIMEOFFSET()`
3. Verificar configuración de Windows: `tzutil /g`
4. Revisar logs de ejecución de scripts

---

**Cambio implementado el**: 27 de enero de 2025  
**Implementado por**: SQL Guard Observatory Team  
**Versión**: Health Score v3.0

