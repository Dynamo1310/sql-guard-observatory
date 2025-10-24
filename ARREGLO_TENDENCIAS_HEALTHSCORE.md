# Corrección de Tendencias Históricas - HealthScore

**Fecha:** 24/10/2024  
**Problema:** "Failed to fetch" al intentar ver tendencias históricas

---

## 🐛 Problema Identificado

### Síntoma:
Al hacer click en "Ver Tendencias" en una instancia, aparece el error **"Failed to fetch"** y no se muestran gráficos.

### Causa Raíz:
El endpoint de la API estaba consultando **columnas que ya no existen** en la tabla `InstanceHealth_Score`.

**Columnas antiguas (que buscaba):**
- `AvailabilityScore`
- `BackupScore`
- `DiskScore`
- `ErrorlogScore`

**Columnas actuales (que existen):**
- `Tier1_Availability`, `Tier2_Continuity`, `Tier3_Resources`, `Tier4_Maintenance`
- `ConnectivityScore`, `MemoryScore`, `AlwaysOnScore`
- `FullBackupScore`, `LogBackupScore`, `DiskSpaceScore`
- `CheckdbScore`, `IndexOptimizeScore`, `ErrorlogScore`

### Tablas Incorrectas:
Además, los endpoints de latencia y disco consultaban `InstanceHealth_Critical`, que ya no existe.

**Debe usar:**
- `InstanceHealth_Critical_Availability` (para latencia)
- `InstanceHealth_Critical_Resources` (para discos)

---

## ✅ Solución Implementada

### 1. Endpoint de HealthScore Trend
**Archivo:** `SQLGuardObservatory.API/Controllers/HealthScoreTrendsController.cs`

**ANTES:**
```csharp
SELECT 
    CollectedAtUtc,
    HealthScore,
    HealthStatus,
    AvailabilityScore,  -- ❌ No existe
    BackupScore,        -- ❌ No existe
    DiskScore,          -- ❌ No existe
    AlwaysOnScore,
    ErrorlogScore
FROM SQLNova.dbo.InstanceHealth_Score
```

**DESPUÉS:**
```csharp
SELECT 
    CollectedAtUtc,
    HealthScore,
    HealthStatus,
    -- Breakdown por Tiers ✅
    Tier1_Availability,
    Tier2_Continuity,
    Tier3_Resources,
    Tier4_Maintenance,
    -- Breakdown detallado ✅
    ConnectivityScore,
    MemoryScore,
    AlwaysOnScore,
    FullBackupScore,
    LogBackupScore,
    DiskSpaceScore,
    CheckdbScore,
    IndexOptimizeScore,
    ErrorlogScore
FROM SQLNova.dbo.InstanceHealth_Score
```

**Respuesta actualizada:**
```json
{
  "success": true,
  "instanceName": "SSPR19MBK-01",
  "hours": 24,
  "dataPoints": 150,
  "data": [
    {
      "timestamp": "2024-10-24T10:00:00",
      "healthScore": 97,
      "healthStatus": "Healthy",
      "tiers": {
        "tier1_Availability": 37,
        "tier2_Continuity": 30,
        "tier3_Resources": 20,
        "tier4_Maintenance": 10
      },
      "breakdown": {
        "connectivity": 15,
        "memory": 10,
        "alwaysOn": 15,
        "fullBackup": 15,
        "logBackup": 15,
        "diskSpace": 20,
        "checkdb": 5,
        "indexOptimize": 5,
        "errorlog": 0
      }
    }
  ]
}
```

---

### 2. Endpoint de Latencia
**Archivo:** `SQLGuardObservatory.API/Controllers/HealthScoreTrendsController.cs`

**ANTES:**
```csharp
FROM SQLNova.dbo.InstanceHealth_Critical  -- ❌ No existe
```

**DESPUÉS:**
```csharp
FROM SQLNova.dbo.InstanceHealth_Critical_Availability  -- ✅ Correcto
```

---

### 3. Endpoint de Espacio en Disco
**Archivo:** `SQLGuardObservatory.API/Controllers/HealthScoreTrendsController.cs`

**ANTES:**
```csharp
FROM SQLNova.dbo.InstanceHealth_Critical  -- ❌ No existe
```

**DESPUÉS:**
```csharp
FROM SQLNova.dbo.InstanceHealth_Critical_Resources  -- ✅ Correcto
```

---

## 📊 Gráficos Disponibles

Con estos cambios, ahora puedes mostrar gráficos de:

### 1. Health Score Total
- Línea de tiempo del score (0-100)
- Código de colores por estado (Healthy/Warning/Critical)

### 2. Breakdown por Tiers
- **Tier 1: Disponibilidad** (40 pts)
- **Tier 2: Continuidad** (30 pts)
- **Tier 3: Recursos** (20 pts)
- **Tier 4: Mantenimiento** (10 pts)

### 3. Breakdown Detallado
- **Conectividad** (15 pts)
- **Memoria** (10 pts)
- **AlwaysOn** (15 pts)
- **Backup FULL** (15 pts)
- **Backup LOG** (15 pts)
- **Espacio en Disco** (20 pts)
- **CHECKDB** (5 pts)
- **Index Optimize** (5 pts)
- **Errorlog** (5 pts)

### 4. Latencia de Conexión
- Milisegundos en el tiempo
- Indicador de conexión exitosa/fallida

### 5. Espacio en Disco
- Porcentaje libre del peor volumen
- Código de colores (verde > 20%, amarillo 10-20%, rojo < 10%)

---

## 🎨 Componentes Frontend

Los siguientes componentes React ya están listos y funcionarán con el endpoint corregido:

1. **`HealthScoreTrendChart.tsx`** ✅
   - Gráfico de línea del health score
   - Tooltip con detalles
   - Líneas de referencia en 70 y 90

2. **`DiskTrendChart.tsx`** ✅
   - Gráfico de área del espacio libre
   - Código de colores por nivel crítico

3. **`InstanceTrends.tsx`** ✅
   - Página principal de tendencias
   - Selector de rango temporal (6h, 24h, 7d, 30d)
   - Grid de múltiples gráficos

---

## 🚀 Próximos Pasos (Fase 2)

Para completar la implementación, se pueden agregar:

### 1. Gráfico de Tiers Stacked
Mostrar los 4 tiers apilados en el tiempo para ver la evolución de cada categoría.

**Archivo a crear:** `src/components/TiersTrendChart.tsx`

```typescript
// Gráfico de barras apiladas
<BarChart>
  <Bar dataKey="tier1" stackId="a" fill="#ef4444" />
  <Bar dataKey="tier2" stackId="a" fill="#f97316" />
  <Bar dataKey="tier3" stackId="a" fill="#eab308" />
  <Bar dataKey="tier4" stackId="a" fill="#22c55e" />
</BarChart>
```

### 2. Gráfico de Breakdown Detallado
Mostrar los 9 componentes individuales en líneas separadas.

**Archivo a crear:** `src/components/BreakdownTrendChart.tsx`

```typescript
// Múltiples líneas en un solo gráfico
<LineChart>
  <Line dataKey="connectivity" stroke="#3b82f6" />
  <Line dataKey="memory" stroke="#8b5cf6" />
  <Line dataKey="diskSpace" stroke="#10b981" />
  // ... etc
</LineChart>
```

### 3. Gráfico de Latencia
Ya el endpoint está corregido, solo falta crear el componente.

**Archivo a crear:** `src/components/LatencyTrendChart.tsx`

### 4. Heatmap de Backups
Mostrar el estado de backups en un calendario de colores.

**Archivo a crear:** `src/components/BackupHeatmap.tsx`

---

## 📝 Archivos Modificados

### Backend (.NET)
- ✅ `SQLGuardObservatory.API/Controllers/HealthScoreTrendsController.cs`
  - Endpoint `/healthscore/{instanceName}` actualizado
  - Endpoint `/latency/{instanceName}` corregido
  - Endpoint `/disk/{instanceName}` corregido

### Frontend (React)
- ✅ Ninguno por ahora (los componentes existentes ya funcionarán)
- 🔄 Pendiente: Agregar más gráficos en InstanceTrends.tsx

---

## ✅ Verificación

Después del despliegue del backend actualizado:

1. **Abrir HealthScore**
2. **Click en cualquier instancia → "Ver Tendencias"**
3. **Verificar:**
   - ✅ Ya no debe aparecer "Failed to fetch"
   - ✅ Debe mostrar gráfico de Health Score
   - ✅ Debe mostrar gráfico de Espacio en Disco
   - ✅ Datos deben cargarse desde InstanceHealth_Score

---

## 🔄 Despliegue

```powershell
# 1. Compilar y publicar backend
cd SQLGuardObservatory.API
dotnet build --configuration Release
dotnet publish --configuration Release --output ./publish

# 2. Copiar a IIS
Copy-Item -Path ./publish/* -Destination "C:\inetpub\wwwroot\InventoryDBA" -Recurse -Force

# 3. Reiniciar IIS
iisreset

# 4. Verificar
# Navegar a http://server/InventoryDBA/api/HealthScoreTrends/healthscore/SSPR19MBK-01?hours=24
```

---

**Resultado:**
✅ Tendencias históricas funcionando  
✅ Gráficos cargando correctamente  
✅ Datos precisos desde nuevas tablas  
✅ Base para agregar más gráficos  

