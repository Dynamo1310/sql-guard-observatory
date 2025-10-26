# Integración Completa - Wait Statistics & Stolen Memory
## Health Score v3.1 - Consolidador + Backend + Frontend

---

## 🎯 Objetivo

Integrar **10 nuevas métricas de waits y stolen memory** en todo el stack (Consolidador → Backend → Frontend) para mejorar la precisión del Health Score.

---

## ✅ Cambios Completados

### 1. **CONSOLIDADOR** (`RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`)

#### ✅ Función `Get-LatestInstanceData`

**Agregado:**
- CTE `LatestWaits` para traer datos de `InstanceHealth_Waits`
- 13 nuevas columnas en el SELECT:
  - `StolenServerMemoryMB` (Memoria)
  - `BlockedSessionCount`, `MaxBlockTimeSeconds` (Blocking)
  - `CXPacketWaitMs`, `CXConsumerWaitMs`, `SOSSchedulerYieldMs` (CPU)
  - `ResourceSemaphoreWaitMs` (Memoria)
  - `PageIOLatchWaitMs`, `WriteLogWaitMs`, `AsyncIOCompletionMs` (I/O)
  - `ThreadPoolWaitMs`, `TotalWaits`, `TotalWaitMs` (Metadata)
- JOIN con `LatestWaits`

#### ✅ Función `Calculate-CPUScore` (10%)

**Penalizaciones agregadas:**

| Wait Type | Threshold | Acción |
|-----------|-----------|--------|
| CXPACKET + CXCONSUMER > 15% | Crítico | Score → 50, Cap → 100 |
| CXPACKET + CXCONSUMER > 10% | Alto | Score → 70 |
| SOS_SCHEDULER_YIELD > 15% | Crítico | Score → 40, Cap → 70 |
| SOS_SCHEDULER_YIELD > 10% | Alto | Score → 60 |

**Interpretación:**
- CXPACKET alto → Revisar MaxDOP o queries mal optimizadas
- SOS_SCHEDULER_YIELD alto → CPU saturado, optimización urgente

#### ✅ Función `Calculate-MemoriaScore` (8%)

**Penalizaciones agregadas:**

| Métrica | Threshold | Acción |
|---------|-----------|--------|
| RESOURCE_SEMAPHORE > 5% | Crítico | Score → 40, Cap → 60 |
| RESOURCE_SEMAPHORE > 2% | Alto | Score → 60 |
| Stolen Memory > 50% | Crítico | Score → 50, Cap → 70 |
| Stolen Memory > 30% | Alto | Score → 70 |

**Interpretación:**
- RESOURCE_SEMAPHORE alto → Queries necesitan más memoria
- Stolen Memory alto → Plan cache bloat o CLR memory leak

#### ✅ Función `Calculate-IOScore` (10%)

**Penalizaciones agregadas:**

| Wait Type | Threshold | Acción |
|-----------|-----------|--------|
| PAGEIOLATCH > 10% | Crítico | Score → 40, Cap → 60 |
| PAGEIOLATCH > 5% | Alto | Score → 60 |
| WRITELOG > 10% | Crítico | Score → 50, Cap → 70 |
| WRITELOG > 5% | Alto | Score → 70 |
| ASYNC_IO_COMPLETION > 20% | Leve | Score → 80 |

**Interpretación:**
- PAGEIOLATCH alto → Discos lentos, agregar índices
- WRITELOG alto → Mover log a disco más rápido

#### ✅ Función `Calculate-ErroresCriticosScore` (7%)

**Penalizaciones agregadas:**

| Blocking | Threshold | Acción |
|----------|-----------|--------|
| > 10 sesiones o > 30s | Crítico | Score → 40, Cap → 60 |
| 5-10 sesiones o 10-30s | Alto | Score → 60, Cap → 80 |
| 1-5 sesiones o < 10s | Leve | Score → 80 |

**Interpretación:**
- Blocking severo → Deadlocks, bad queries
- Investigar con `sp_WhoIsActive`

---

### 2. **BACKEND** (.NET API)

#### ✅ Modelos C#

**✅ `InstanceHealthWaits.cs`**
- Modelo completo con 40+ propiedades
- Propiedades computadas: `PageIOLatchPct`, `CXPacketPct`, `ResourceSemaphorePct`, `WriteLogPct`, `BlockingLevel`
- Métodos de ayuda: `HasBlocking`, `HasSevereBlocking`

**✅ `InstanceHealthMemoria.cs`**
- Agregado `StolenServerMemoryMB`
- Propiedad computada: `StolenMemoryPct`

#### ✅ DbContext (`SQLNovaDbContext.cs`)

**Agregado:**
- `DbSet<InstanceHealthWaits>`
- Configuración de modelo con índice en `InstanceName, CollectedAtUtc`

---

### 3. **FRONTEND** (React TypeScript)

#### ✅ DTOs TypeScript (`src/services/api.ts`)

**✅ `MemoriaDetails`**
- Agregado `stolenServerMemoryMB: number`

**✅ `WaitsDetails` (NUEVO)**
```typescript
export interface WaitsDetails {
  // Blocking
  blockedSessionCount: number;
  maxBlockTimeSeconds: number;
  
  // CPU Waits
  cxPacketWaitMs: number;
  cxConsumerWaitMs: number;
  sosSchedulerYieldMs: number;
  
  // Memory Waits
  resourceSemaphoreWaitMs: number;
  
  // I/O Waits
  pageIOLatchWaitMs: number;
  writeLogWaitMs: number;
  asyncIOCompletionMs: number;
  
  // Totals
  totalWaits: number;
  totalWaitMs: number;
}
```

**✅ `HealthScoreV3DetailDto`**
- Agregado `waitsDetails?: WaitsDetails`

---

## ⏳ PENDIENTES (Frontend UI)

### 4. **Frontend - Actualizar UI** (`src/pages/HealthScore.tsx`)

#### 📋 TODO 4: CPU (10%)
**Ubicación**: Sección expandida de instancia → "⚙️ CPU & Proc"

```tsx
{/* NUEVO: CPU Waits */}
{waitsDetails && waitsDetails.totalWaitMs > 0 && (
  <div className="mt-2 space-y-1">
    <div className="text-xs font-medium text-muted-foreground">
      CPU Waits
    </div>
    
    {/* CXPACKET */}
    {(() => {
      const cxPct = (waitsDetails.cxPacketWaitMs / waitsDetails.totalWaitMs) * 100;
      return cxPct > 0.1 && (
        <div className="flex items-center justify-between text-xs">
          <span>CXPACKET (parallelism)</span>
          <Badge variant={cxPct > 15 ? 'destructive' : cxPct > 10 ? 'default' : 'outline'}>
            {cxPct.toFixed(1)}%
          </Badge>
        </div>
      );
    })()}
    
    {/* SOS_SCHEDULER_YIELD */}
    {(() => {
      const sosPct = (waitsDetails.sosSchedulerYieldMs / waitsDetails.totalWaitMs) * 100;
      return sosPct > 0.1 && (
        <div className="flex items-center justify-between text-xs">
          <span>SOS_YIELD (CPU pressure)</span>
          <Badge variant={sosPct > 15 ? 'destructive' : sosPct > 10 ? 'default' : 'outline'}>
            {sosPct.toFixed(1)}%
          </Badge>
        </div>
      );
    })()}
  </div>
)}
```

#### 📋 TODO 5: Memoria (8%)
**Ubicación**: Sección expandida de instancia → "🧠 Memoria"

```tsx
{/* NUEVO: Memory Waits & Stolen Memory */}
{waitsDetails && waitsDetails.totalWaitMs > 0 && (
  <div className="mt-2 space-y-1">
    {/* RESOURCE_SEMAPHORE */}
    {(() => {
      const resSemPct = (waitsDetails.resourceSemaphoreWaitMs / waitsDetails.totalWaitMs) * 100;
      return resSemPct > 0.1 && (
        <div className="flex items-center justify-between text-xs">
          <span>RESOURCE_SEMAPHORE (grants)</span>
          <Badge variant={resSemPct > 5 ? 'destructive' : resSemPct > 2 ? 'default' : 'outline'}>
            {resSemPct.toFixed(1)}%
          </Badge>
        </div>
      );
    })()}
  </div>
)}

{/* Stolen Memory */}
{memoriaDetails && memoriaDetails.stolenServerMemoryMB > 0 && (
  <div className="mt-2 space-y-1">
    <div className="text-xs font-medium text-muted-foreground">
      Stolen Memory
    </div>
    {(() => {
      const stolenPct = memoriaDetails.totalServerMemoryMB > 0
        ? (memoriaDetails.stolenServerMemoryMB / memoriaDetails.totalServerMemoryMB) * 100
        : 0;
      return (
        <div className="flex items-center justify-between text-xs">
          <span>{memoriaDetails.stolenServerMemoryMB}MB ({stolenPct.toFixed(1)}%)</span>
          <Badge variant={stolenPct > 50 ? 'destructive' : stolenPct > 30 ? 'default' : 'outline'}>
            {stolenPct > 50 ? 'Crítico' : stolenPct > 30 ? 'Alto' : 'Normal'}
          </Badge>
        </div>
      );
    })()}
  </div>
)}
```

#### 📋 TODO 6: I/O (10%)
**Ubicación**: Sección expandida de instancia → "💽 I/O"

```tsx
{/* NUEVO: I/O Waits */}
{waitsDetails && waitsDetails.totalWaitMs > 0 && (
  <div className="mt-2 space-y-1">
    <div className="text-xs font-medium text-muted-foreground">
      I/O Waits
    </div>
    
    {/* PAGEIOLATCH */}
    {(() => {
      const pageIOPct = (waitsDetails.pageIOLatchWaitMs / waitsDetails.totalWaitMs) * 100;
      return pageIOPct > 0.1 && (
        <div className="flex items-center justify-between text-xs">
          <span>PAGEIOLATCH (data reads)</span>
          <Badge variant={pageIOPct > 10 ? 'destructive' : pageIOPct > 5 ? 'default' : 'outline'}>
            {pageIOPct.toFixed(1)}%
          </Badge>
        </div>
      );
    })()}
    
    {/* WRITELOG */}
    {(() => {
      const writeLogPct = (waitsDetails.writeLogWaitMs / waitsDetails.totalWaitMs) * 100;
      return writeLogPct > 0.1 && (
        <div className="flex items-center justify-between text-xs">
          <span>WRITELOG (log writes)</span>
          <Badge variant={writeLogPct > 10 ? 'destructive' : writeLogPct > 5 ? 'default' : 'outline'}>
            {writeLogPct.toFixed(1)}%
          </Badge>
        </div>
      );
    })()}
  </div>
)}
```

#### 📋 TODO 7: Errores (7%)
**Ubicación**: Sección expandida de instancia → "🚨 Errores"

```tsx
{/* NUEVO: Blocking */}
{waitsDetails && waitsDetails.blockedSessionCount > 0 && (
  <div className="mt-2 space-y-1">
    <div className="text-xs font-medium text-muted-foreground">
      Blocking
    </div>
    <div className="flex items-center justify-between text-xs">
      <span>{waitsDetails.blockedSessionCount} sesiones bloqueadas</span>
      <Badge variant={
        waitsDetails.blockedSessionCount > 10 || waitsDetails.maxBlockTimeSeconds > 30
          ? 'destructive'
          : waitsDetails.blockedSessionCount > 5 || waitsDetails.maxBlockTimeSeconds > 10
          ? 'default'
          : 'outline'
      }>
        {waitsDetails.maxBlockTimeSeconds}s
      </Badge>
    </div>
    {(waitsDetails.blockedSessionCount > 10 || waitsDetails.maxBlockTimeSeconds > 30) && (
      <p className="text-[9px] text-destructive">
        ⚠️ Blocking severo - Investigar deadlocks
      </p>
    )}
  </div>
)}
```

---

## 📊 Impacto Esperado

### Antes (sin waits):
- Score basado solo en métricas puntuales (CPU%, PLE, latencia)
- No detectaba queries mal optimizadas ni plan cache bloat

### Después (con waits):
- Score integra **performance real** a través de waits
- Detecta paralelismo excesivo, memory pressure, I/O bottlenecks, blocking
- **Más preciso**: refleja experiencia real de usuarios/queries

### Ejemplo Real:
**Instancia con CPU 70% pero CXPACKET 12%:**
- **Antes**: CPU Score = 100/100 → Contribución = 10/10
- **Después**: CPU Score = 70/100 → Contribución = 7/10
- **Reducción**: -3 puntos en el Health Score total por mal MaxDOP

---

## 🧪 Testing

### 1. Consolidador:
```powershell
cd scripts
.\RelevamientoHealthScore_Consolidate_v3_FINAL.ps1
```

### 2. Verificar Datos:
```sql
-- Ver scores con impacto de waits
SELECT 
    InstanceName,
    HealthScore,
    CPUScore,
    MemoriaScore,
    IOScore,
    ErroresCriticosScore
FROM dbo.InstanceHealth_Score
WHERE CollectedAtUtc > DATEADD(MINUTE, -10, GETUTCDATE())
ORDER BY HealthScore ASC;
```

### 3. Backend:
```bash
dotnet build
dotnet run
```

### 4. Frontend:
```bash
npm run dev
```
- Navegar a `/health-score`
- Expandir una instancia
- Verificar que se muestren las nuevas métricas de waits

---

## 📝 Archivos Modificados

### Consolidador (1):
- ✅ `scripts/RelevamientoHealthScore_Consolidate_v3_FINAL.ps1`

### Backend (2):
- ✅ `SQLGuardObservatory.API/Models/HealthScoreV3/InstanceHealthWaits.cs`
- ✅ `SQLGuardObservatory.API/Models/HealthScoreV3/InstanceHealthMemoria.cs`
- ✅ `SQLGuardObservatory.API/Data/SQLNovaDbContext.cs`

### Frontend (1):
- ✅ `src/services/api.ts` (DTOs TypeScript)
- ⏳ `src/pages/HealthScore.tsx` (UI - Pendiente)

---

## ✅ Checklist Final

- [x] **Consolidador**: Fetch datos de `InstanceHealth_Waits`
- [x] **Consolidador**: Penalizaciones en `Calculate-CPUScore`
- [x] **Consolidador**: Penalizaciones en `Calculate-MemoriaScore`
- [x] **Consolidador**: Penalizaciones en `Calculate-IOScore`
- [x] **Consolidador**: Penalizaciones en `Calculate-ErroresCriticosScore`
- [x] **Backend**: Modelo `InstanceHealthWaits.cs`
- [x] **Backend**: Modelo `InstanceHealthMemoria.cs` con `StolenMemory`
- [x] **Backend**: `DbContext` con `InstanceHealthWaits`
- [x] **Frontend**: DTO `MemoriaDetails` con `stolenServerMemoryMB`
- [x] **Frontend**: DTO `WaitsDetails` (nuevo)
- [ ] **Frontend**: UI para CPU waits (CXPACKET, SOS_YIELD)
- [ ] **Frontend**: UI para RESOURCE_SEMAPHORE y Stolen Memory
- [ ] **Frontend**: UI para PAGEIOLATCH, WRITELOG
- [ ] **Frontend**: UI para Blocking

---

## 🎯 Próximos Pasos

1. **Implementar UI en `src/pages/HealthScore.tsx`** (4 TODOs pendientes)
2. **Testing completo**: Verificar que el score cambie correctamente con waits altos
3. **Documentación**: Actualizar README con nuevas métricas
4. **Deployment**: Desplegar cambios a producción

---

## 📚 Documentos Relacionados

- `INTEGRACION_WAITS_CONSOLIDADOR.md` - Detalle de cambios en consolidador
- `MEJORA_OUTPUT_WAITS.md` - Mejoras en script de recolección de waits
- `MEJORA_SCRIPT_MEMORIA.md` - Mejoras en script de memoria con stolen memory
- `CORRECCIONES_SCRIPTS_FINALES.md` - Correcciones en scripts de recolección
- `VALIDACION_SCRIPTS_FINAL.md` - Validación de scripts funcionando correctamente

---

**Estado**: Consolidador + Backend ✅ | Frontend UI ⏳

**Siguiente**: Implementar UI de waits en `HealthScore.tsx` 🚀

