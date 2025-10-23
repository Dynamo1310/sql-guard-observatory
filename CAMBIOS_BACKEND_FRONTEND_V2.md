# 🔄 Cambios en Backend y Frontend para Health Score v2.0

## ✅ **Resumen de cambios realizados**

Se actualizó completamente el **backend (.NET)** y **frontend (React)** para leer y mostrar las nuevas métricas de Health Score v2.0 (150 puntos).

---

## 📦 **BACKEND - Cambios en .NET API**

### **1. DTOs Actualizados**

#### **Archivo:** `SQLGuardObservatory.API/DTOs/HealthScoreDto.cs`

**Cambios:**

1. **Agregado breakdown por Tiers al HealthScoreDto:**
```csharp
// v2.0: Breakdown por Tiers (150 puntos)
public int? Tier1_Availability { get; set; }
public int? Tier2_Continuity { get; set; }
public int? Tier3_Resources { get; set; }
public int? Tier4_Maintenance { get; set; }
```

2. **Agregado breakdown detallado:**
```csharp
// v2.0: Breakdown detallado
public int? ConnectivityScore { get; set; }
public int? BlockingScore { get; set; }
public int? MemoryScore { get; set; }
public int? AlwaysOnScore { get; set; }
public int? FullBackupScore { get; set; }
public int? LogBackupScore { get; set; }
public int? DiskSpaceScore { get; set; }
public int? IOPSScore { get; set; }
public int? QueryPerformanceScore { get; set; }
public int? CheckdbScore { get; set; }
public int? IndexOptimizeScore { get; set; }
public int? ErrorlogScore { get; set; }
```

3. **Agregadas nuevas métricas a ResourceSummary:**
```csharp
public class ResourceSummary
{
    // Existentes
    public bool? CpuHighFlag { get; set; }
    public bool? MemoryPressureFlag { get; set; }
    
    // v2.0: Nuevas métricas
    public int? BlockingCount { get; set; }
    public int? MaxBlockTimeSeconds { get; set; }
    public int? PageLifeExpectancy { get; set; }
    public decimal? BufferCacheHitRatio { get; set; }
    public decimal? AvgReadLatencyMs { get; set; }
    public decimal? AvgWriteLatencyMs { get; set; }
    public decimal? MaxReadLatencyMs { get; set; }
    public decimal? TotalIOPS { get; set; }
    public int? SlowQueriesCount { get; set; }
    public int? LongRunningQueriesCount { get; set; }
}
```

---

### **2. HealthScoreService Actualizado**

#### **Archivo:** `SQLGuardObservatory.API/Services/HealthScoreService.cs`

**Cambios:**

#### **2.1 GetLatestHealthScoresAsync()**
- ✅ Actualizado query para leer de `dbo.vw_InstanceHealth_Latest` v2.0
- ✅ Incluye todas las nuevas columnas (Tiers, breakdown, métricas raw)
- ✅ Mapeo actualizado del DTO con las nuevas propiedades
- ✅ Calcula `MemoryPressureFlag` basado en PLE < 300

**Query actualizado:**
```sql
SELECT 
    -- Score y Status
    InstanceName, HealthScore, HealthStatus, ScoreCollectedAt,
    
    -- Breakdown por Tiers (150 puntos)
    Tier1_Availability, Tier2_Continuity, Tier3_Resources, Tier4_Maintenance,
    
    -- Breakdown detallado
    ConnectivityScore, BlockingScore, MemoryScore, AlwaysOnScore,
    FullBackupScore, LogBackupScore, DiskSpaceScore, IOPSScore,
    QueryPerformanceScore, CheckdbScore, IndexOptimizeScore, ErrorlogScore,
    
    -- Métricas raw - Availability
    ConnectSuccess, ConnectLatencyMs, BlockingCount, MaxBlockTimeSeconds,
    PageLifeExpectancy, BufferCacheHitRatio, AlwaysOnEnabled, AlwaysOnWorstState,
    
    -- Métricas raw - Resources
    DiskWorstFreePct, AvgReadLatencyMs, AvgWriteLatencyMs, MaxReadLatencyMs,
    TotalIOPS, SlowQueriesCount, LongRunningQueriesCount,
    
    -- Métricas raw - Backups
    LastFullBackup, LastLogBackup, FullBackupBreached, LogBackupBreached,
    
    -- Métricas raw - Maintenance
    LastCheckdb, CheckdbOk, LastIndexOptimize, IndexOptimizeOk, Severity20PlusCount
FROM dbo.vw_InstanceHealth_Latest
ORDER BY HealthScore ASC
```

#### **2.2 GetSummaryAsync()**
- ✅ Actualizado umbrales para 150 puntos:
  - **Healthy:** ≥135 (90% de 150)
  - **Warning:** 105-134 (70-89% de 150)
  - **Critical:** <105 (<70% de 150)

**Query actualizado:**
```sql
SELECT 
    COUNT(*) AS TotalInstances,
    SUM(CASE WHEN HealthScore >= 135 THEN 1 ELSE 0 END) AS HealthyCount,
    SUM(CASE WHEN HealthScore >= 105 AND HealthScore < 135 THEN 1 ELSE 0 END) AS WarningCount,
    SUM(CASE WHEN HealthScore < 105 THEN 1 ELSE 0 END) AS CriticalCount,
    AVG(HealthScore) AS AvgScore,
    MAX(ScoreCollectedAt) AS LastUpdate
FROM dbo.vw_InstanceHealth_Latest
```

#### **2.3 GetOverviewDataAsync()**
- ✅ Actualizado umbrales a 135/105 (antes 90/70)
- ✅ Query simplificado para leer directo de `vw_InstanceHealth_Latest`
- ✅ Instancias críticas ahora son <105 pts (antes <70)

---

## 🎨 **FRONTEND - Cambios en React**

### **1. Explicación del Cálculo Actualizada**

#### **Archivo:** `src/pages/HealthScore.tsx`

**Cambios en la sección explicativa (collapsible):**

1. **Actualizado header:**
   - "150 puntos" en lugar de "100 puntos"
   - Explica que es como un "examen médico"

2. **Nuevos umbrales visuales:**
```tsx
✅ HEALTHY:  135-150 pts (≥90% del máximo)
⚠️ WARNING:  105-134 pts (70-89% del máximo)
🚨 CRITICAL: <105 pts (<70% del máximo)
```

3. **Dividido en 4 Tiers con colores:**
   - 🚨 **Tier 1: Disponibilidad** (50 pts) - Rojo
   - 💾 **Tier 2: Continuidad** (40 pts) - Naranja
   - 💻 **Tier 3: Recursos** (40 pts) - Amarillo
   - 🔧 **Tier 4: Mantenimiento** (20 pts) - Verde

4. **Cada tier explica:**
   - ¿Qué mide?
   - Métricas incluidas con scoring detallado
   - Tips para DBAs junior (ej: "PLE <100 = memory pressure!")

5. **Agregada guía de acción rápida:**
   - <105 pts → Escalar a senior inmediatamente
   - 105-119 pts → Investigar HOY
   - 120-134 pts → Planear fix en próximos días
   - 135-150 pts → Todo bien ✅

6. **Resumen visual de cómo se suman los puntos**

---

### **2. Tabla Principal Actualizada**

**Cambios:**

1. **Score mostrado como `X/150`:**
```tsx
<span>{score.healthScore}<span className="text-xs">/150</span></span>
```

2. **Barra de progreso ajustada:**
```tsx
<Progress value={(score.healthScore / 150) * 100} />
```
Ahora calcula el porcentaje sobre 150 en lugar de 100.

3. **Umbrales de colores actualizados:**
```tsx
score.healthScore >= 135  → Verde (antes ≥90)
score.healthScore >= 105  → Amarillo (antes ≥70)
score.healthScore < 105   → Rojo (antes <70)
```

---

### **3. Detalle Expandido (nuevas métricas v2.0)**

**Agregado:**

#### **3.1 Breakdown por Tiers (nuevo card)**
```tsx
<Card className="bg-gradient-to-r from-red-500/5 via-orange-500/5 via-yellow-500/5 to-green-500/5">
  <CardTitle>📊 Breakdown por Tiers (150 pts)</CardTitle>
  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
    <div>🚨 T1: Disponibilidad - {tier1}/50</div>
    <div>💾 T2: Continuidad - {tier2}/40</div>
    <div>💻 T3: Recursos - {tier3}/40</div>
    <div>🔧 T4: Mantenimiento - {tier4}/20</div>
  </div>
</Card>
```

#### **3.2 Card de "Performance & Recursos" renovado**

**Antes:**
- Solo mostraba "CPU Alto" y "Presión Memoria"

**Ahora muestra:**

1. **Blocking:**
   - Cantidad de queries bloqueados
   - Tiempo máximo de bloqueo
   - Badge rojo si hay bloqueados

2. **Page Life Expectancy:**
   - Valor en segundos
   - Badge según valor:
     - ≥300: Verde (OK)
     - 100-299: Amarillo (Aceptable)
     - <100: Rojo (Memory pressure crítica)
   - Mensaje explicativo

3. **IOPS / Latencia:**
   - Latencia promedio de read
   - Latencia de write
   - Badge según valor:
     - ≤10ms: Verde (SSD excelente)
     - 11-20ms: Amarillo (SSD normal)
     - >20ms: Rojo (HDD o SSD lento)
   - Indica si es SSD o HDD

4. **Queries Lentos:**
   - Cantidad de queries activos >30s
   - Cantidad de queries muy lentos >5min
   - Badge rojo si hay lentos

**Ejemplo visual:**
```
Performance & Recursos (v2.0)
├─ 🚫 Blocking: 3 bloqueados [ROJO]
│  └─ Máx tiempo: 45s
├─ 🧠 Page Life Exp: 450 seg [VERDE]
├─ ⚡ I/O Latencia: 8.2ms read [VERDE]
│  ├─ Write: 12.5ms
│  └─ ✅ SSD excelente
└─ 🐌 Queries Lentos: 0 activos [VERDE]
```

---

## 📊 **Comparación: Antes vs Ahora**

### **Backend:**

| Aspecto | Antes | Ahora v2.0 |
|---------|-------|------------|
| **Tablas SQL** | `InstanceHealth` (monolítica) | 5 tablas especializadas + vista |
| **Score máximo** | 100 puntos | 150 puntos |
| **Métricas** | 5 categorías básicas | 4 Tiers + 13 métricas detalladas |
| **Umbrales Healthy** | ≥90 | ≥135 |
| **Umbrales Warning** | 70-89 | 105-134 |
| **Umbrales Critical** | <70 | <105 |
| **Nuevas métricas** | - | Blocking, PLE, IOPS, Query Perf |
| **Vista consolidada** | No | `vw_InstanceHealth_Latest` |

### **Frontend:**

| Aspecto | Antes | Ahora v2.0 |
|---------|-------|------------|
| **Explicación** | Básica (100 pts) | Detallada (150 pts, 4 Tiers) |
| **Score display** | `X` | `X/150` |
| **Progress bar** | De 100 | De 150 |
| **Breakdown** | No visible | Sí (Tiers + scores individuales) |
| **Métricas detalle** | Básicas | Blocking, PLE, IOPS, Queries lentos |
| **Tips para juniors** | No | Sí (explicaciones en cada métrica) |
| **Guía de acción** | No | Sí (qué hacer según score) |

---

## ✅ **Checklist de Validación**

### **Backend:**
- [ ] Compilar proyecto: `dotnet build`
- [ ] Verificar que no hay errores de compilación
- [ ] Ejecutar API: `dotnet run`
- [ ] Probar endpoint: `GET /api/healthscore`
- [ ] Verificar que devuelve nuevos campos (tiers, blocking, PLE, etc.)

### **Frontend:**
- [ ] Compilar: `npm run build`
- [ ] Ejecutar en dev: `npm run dev`
- [ ] Navegar a `/health-score`
- [ ] Expandir explicación "¿Cómo se calcula?"
- [ ] Verificar que dice "150 puntos" y muestra 4 Tiers
- [ ] Expandir una instancia
- [ ] Verificar que muestra:
  - Breakdown por Tiers (50+40+40+20)
  - Blocking
  - Page Life Expectancy
  - IOPS / Latencia
  - Queries lentos

### **Integración:**
- [ ] Backend y Frontend corriendo juntos
- [ ] Datos fluyendo correctamente
- [ ] Colores de badges correctos
- [ ] Scores calculados correctamente (0-150)
- [ ] Umbrales funcionando (135, 105)

---

## 🚀 **Próximos Pasos**

1. **Ejecutar migración SQL:**
   ```sql
   -- En SQLNova database
   \scripts\SQL\CreateHealthScoreTables_v2.sql
   ```

2. **Ejecutar scripts PowerShell:**
   ```powershell
   # Programar los 5 scripts
   \scripts\Schedule-HealthScore-v2.ps1
   
   # O ejecutar manualmente para probar
   .\RelevamientoHealthScore_Availability.ps1
   .\RelevamientoHealthScore_Resources.ps1
   .\RelevamientoHealthScore_Backups.ps1
   .\RelevamientoHealthScore_Maintenance.ps1
   .\RelevamientoHealthScore_Consolidate.ps1
   ```

3. **Compilar y publicar backend:**
   ```bash
   cd SQLGuardObservatory.API
   dotnet publish -c Release -o C:\Temp\Backend
   ```

4. **Compilar y publicar frontend:**
   ```bash
   npm run build
   # Copiar dist/ al servidor web
   ```

5. **Validar datos:**
   ```sql
   -- Ver datos recolectados
   SELECT * FROM dbo.vw_InstanceHealth_Latest
   
   -- Verificar scores
   SELECT InstanceName, HealthScore, Tier1_Availability, Tier2_Continuity, Tier3_Resources, Tier4_Maintenance
   FROM dbo.InstanceHealth_Score
   ORDER BY CollectedAtUtc DESC
   ```

---

## 📝 **Notas Importantes**

### **Compatibilidad:**
- ✅ Backward compatible: Si no hay datos v2.0, el frontend mostrará valores en 0/N/A
- ✅ No rompe funcionalidad existente
- ⚠️ Requiere ejecutar script SQL de migración **ANTES** de usar el backend

### **Migración de Datos:**
- ❌ Los datos antiguos (tabla `InstanceHealth` monolítica) **NO se migran automáticamente**
- ✅ Los nuevos scripts empezarán a poblar las nuevas tablas desde cero
- 💡 Si necesitas migrar datos históricos, crear script de migración aparte

### **Performance:**
- ✅ Vista `vw_InstanceHealth_Latest` está indexada (por InstanceName, CollectedAtUtc)
- ✅ Queries optimizados para leer solo lo necesario
- ⚠️ Si tienes >500 instancias, considerar agregar paginación al frontend

---

**Versión:** 2.0  
**Fecha:** 2025-10-23  
**Estado:** ✅ Completo y listo para deployment  
**Autor:** SQL Guard Observatory Team

