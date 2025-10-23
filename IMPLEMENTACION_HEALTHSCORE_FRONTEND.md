# Implementación de HealthScore - Frontend & Backend

## 📋 Resumen

Se implementó la visualización completa de HealthScore en la aplicación SQL Guard Observatory, incluyendo:

1. ✅ **Backend (API)**: Controller, Service, DTOs y Modelo
2. ✅ **Frontend**: Página completa con tabla expandible y detalles JSON
3. ✅ **Integración**: Tarjeta KPI en Overview (clickeable)
4. ✅ **Navegación**: Item en sidebar
5. ✅ **Permisos**: Scripts SQL para configuración de permisos

---

## 🏗️ Arquitectura

### Backend (C# / .NET 8)

#### 1. **Controller**: `HealthScoreController.cs`
- **Endpoint GET `/api/healthscore`**: Retorna todas las instancias con su último HealthScore
- **Endpoint GET `/api/healthscore/summary`**: Retorna resumen agregado (Healthy/Warning/Critical)
- Usa autenticación JWT
- Logging de errores

#### 2. **Service**: `HealthScoreService.cs` + `IHealthScoreService.cs`
- Lee de la tabla `InstanceHealthSnapshot` en SQLNova
- Obtiene el **último snapshot por instancia** (agrupado por `InstanceName`)
- Parsea JSON de columnas:
  - `BackupJson` → `BackupSummary`
  - `MaintenanceJson` → `MaintenanceSummary`
  - `DiskJson` → `DiskSummary`
  - `ResourceJson` → `ResourceSummary`
  - `AlwaysOnJson` → `AlwaysOnSummary`
  - `ErrorlogJson` → `ErrorlogSummary`
- Calcula estadísticas de resumen (totales, promedios, conteos)

#### 3. **DTOs**: `HealthScoreDto.cs`
Incluye:
```csharp
public class HealthScoreDto
{
    public string InstanceName { get; set; }
    public string? Ambiente { get; set; }
    public string? HostingSite { get; set; }
    public string? Version { get; set; }
    public bool ConnectSuccess { get; set; }
    public int? ConnectLatencyMs { get; set; }
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } // Healthy, Warning, Critical
    public DateTime GeneratedAtUtc { get; set; }
    
    // Detalles expandidos
    public BackupSummary? BackupSummary { get; set; }
    public MaintenanceSummary? MaintenanceSummary { get; set; }
    public DiskSummary? DiskSummary { get; set; }
    public ResourceSummary? ResourceSummary { get; set; }
    public AlwaysOnSummary? AlwaysOnSummary { get; set; }
    public ErrorlogSummary? ErrorlogSummary { get; set; }
}

public class HealthScoreSummaryDto
{
    public int TotalInstances { get; set; }
    public int HealthyCount { get; set; }
    public int WarningCount { get; set; }
    public int CriticalCount { get; set; }
    public int AvgScore { get; set; }
    public DateTime? LastUpdate { get; set; }
}
```

#### 4. **Modelo**: `InstanceHealthSnapshot.cs`
- Tabla: `[dbo].[InstanceHealthSnapshot]` en `SQLNova`
- Primary Key Compuesta: `(InstanceName, GeneratedAtUtc)`
- Columnas NVARCHAR(MAX) para JSON

#### 5. **Registro en `Program.cs`**
```csharp
builder.Services.AddScoped<IHealthScoreService, HealthScoreService>();
```

#### 6. **Configuración en `SQLNovaDbContext.cs`**
```csharp
public DbSet<InstanceHealthSnapshot> InstanceHealthSnapshots { get; set; }

modelBuilder.Entity<InstanceHealthSnapshot>(entity =>
{
    entity.ToTable("InstanceHealthSnapshot", "dbo");
    entity.HasKey(e => new { e.InstanceName, e.GeneratedAtUtc });
});
```

---

### Frontend (React / TypeScript)

#### 1. **API Service**: `src/services/api.ts`
Nuevas funciones:
```typescript
export const healthScoreApi = {
  async getHealthScores(): Promise<HealthScoreDto[]>
  async getHealthScoreSummary(): Promise<HealthScoreSummaryDto>
}
```

#### 2. **Página HealthScore**: `src/pages/HealthScore.tsx`

**Características:**

- **Tarjetas KPI superiores** con totales:
  - Total Instancias
  - Healthy Count (verde)
  - Warning Count (amarillo)
  - Critical Count (rojo)
  - Score Promedio

- **Filtros dinámicos**:
  - Por Estado (Healthy/Warning/Critical)
  - Por Ambiente
  - Por Hosting (On-premise/AWS)

- **Tabla principal** con columnas:
  - Botón expandir/colapsar
  - Instancia (ordenable)
  - Ambiente (ordenable)
  - Hosting (ordenable)
  - Score numérico (ordenable, coloreado)
  - Score visual (barra de progreso)
  - Estado (badge con icono)
  - Latencia (ms)

- **Filas expandibles** con detalle completo:
  - **Header**: Versión, Última Actualización, Conectividad
  - **Grids 2x2** con tarjetas:
    - **Backups & Mantenimiento**: CHECKDB, Index Optimize, Breaches
    - **Almacenamiento**: Peor volumen, lista de volúmenes con % libre
    - **Recursos**: CPU Alto, Presión de Memoria
    - **AlwaysOn & Errores**: Estado sync, Issues, Errores críticos (24h)

- **Estilos consistentes** con el resto de la app:
  - `gradient-card`, `shadow-card`
  - Badges coloreados
  - Iconos de Lucide React
  - Progress bars dinámicos
  - Table con ordenamiento

#### 3. **Integración en Overview**: `src/pages/Overview.tsx`

**Nueva tarjeta KPI** (primera posición):
```tsx
<KPICard
  title="Health Score"
  value={healthSummary ? `${healthSummary.avgScore}` : '-'}
  icon={Heart}
  description={
    healthSummary 
      ? `${healthSummary.healthyCount} Healthy, ${healthSummary.warningCount} Warning, ${healthSummary.criticalCount} Critical` 
      : 'Cargando...'
  }
  variant={
    healthSummary 
      ? healthSummary.avgScore >= 90 ? 'success' 
        : healthSummary.avgScore >= 70 ? 'warning' 
        : 'critical'
      : 'default'
  }
  onClick={() => navigate('/healthscore')}
/>
```

- **Clickeable**: Navega a `/healthscore`
- **Colores dinámicos**: Verde (>=90), Amarillo (70-89), Rojo (<70)
- **Descripción detallada**: Muestra conteos

#### 4. **Sidebar**: `src/components/layout/AppSidebar.tsx`
```typescript
const mainItems = [
  { title: 'Overview', url: '/overview', icon: Home, permission: 'Overview' },
  { title: 'HealthScore', url: '/healthscore', icon: Heart, permission: 'HealthScore' },
  // ... resto
];
```

#### 5. **Routing**: `src/App.tsx`
```tsx
<Route path="/healthscore" element={
  <ProtectedRoute viewName="HealthScore">
    <HealthScore />
  </ProtectedRoute>
} />
```

---

## 🔐 Permisos

### Scripts SQL

#### 1. **`AddHealthScorePermission.sql`**
- Inserta permisos para roles `Admin` y `SuperAdmin`
- Verifica que no existan duplicados
- Muestra los permisos creados

#### 2. **`Apply-HealthScorePermission.ps1`**
PowerShell helper para aplicar el script:
```powershell
.\Apply-HealthScorePermission.ps1 -SqlServer "localhost" -Database "ObservatoryAuthDb"
```

---

## 📊 Datos Mostrados

### Tabla Principal
| Campo | Descripción |
|-------|-------------|
| `InstanceName` | Nombre de la instancia SQL |
| `Ambiente` | Dev, Test, Prod, etc. |
| `HostingSite` | Onpremise, AWS |
| `HealthScore` | Puntaje 0-100 |
| `HealthStatus` | Healthy (>=90), Warning (70-89), Critical (<70) |
| `ConnectLatencyMs` | Latencia de conexión |

### Detalles Expandidos (JSON Parseados)

#### BackupSummary
- `CheckdbOk`: ¿CHECKDB dentro de SLA?
- `IndexOptimizeOk`: ¿Index Optimize dentro de SLA?
- `LastCheckdb`: Fecha del último CHECKDB
- `LastIndexOptimize`: Fecha del último IndexOptimize
- `Breaches`: Array de problemas de backup

#### DiskSummary
- `WorstVolumeFreePct`: % libre del peor volumen
- `Volumes[]`:
  - `Drive`: Letra de drive
  - `TotalGB`: Tamaño total
  - `FreeGB`: Espacio libre
  - `FreePct`: % libre

#### ResourceSummary
- `CpuHighFlag`: CPU > 90%
- `MemoryPressureFlag`: Presión de memoria detectada
- `RawCounters`: Contadores raw

#### AlwaysOnSummary
- `Enabled`: ¿AlwaysOn habilitado?
- `WorstState`: Peor estado de sincronización
- `Issues[]`: Lista de problemas detectados

#### ErrorlogSummary
- `Severity20PlusCount24h`: Errores críticos en últimas 24h
- `Skipped`: Si se omitió la lectura del errorlog

---

## 🚀 Despliegue

### Backend

1. **Compilar**:
   ```powershell
   cd SQLGuardObservatory.API
   dotnet build -c Release
   ```

2. **Aplicar permisos**:
   ```powershell
   cd SQLGuardObservatory.API\SQL
   .\Apply-HealthScorePermission.ps1
   ```

3. **Reiniciar servicio**:
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API"
   ```

### Frontend

1. **Build**:
   ```powershell
   npm run build
   ```

2. **Deploy**:
   ```powershell
   .\deploy-frontend.ps1
   ```

---

## 🧪 Testing

### Verificar Backend
```bash
# Summary
curl -H "Authorization: Bearer <TOKEN>" http://localhost:5000/api/healthscore/summary

# Full data
curl -H "Authorization: Bearer <TOKEN>" http://localhost:5000/api/healthscore
```

### Verificar Frontend
1. Login en la aplicación
2. Click en tarjeta "Health Score" en Overview
3. Verificar navegación a `/healthscore`
4. Probar filtros y ordenamiento
5. Expandir filas para ver detalles JSON

---

## 📁 Archivos Creados/Modificados

### Backend
- ✅ `SQLGuardObservatory.API/Controllers/HealthScoreController.cs` (nuevo)
- ✅ `SQLGuardObservatory.API/Services/IHealthScoreService.cs` (nuevo)
- ✅ `SQLGuardObservatory.API/Services/HealthScoreService.cs` (nuevo)
- ✅ `SQLGuardObservatory.API/DTOs/HealthScoreDto.cs` (nuevo)
- ✅ `SQLGuardObservatory.API/Models/InstanceHealthSnapshot.cs` (nuevo)
- ✅ `SQLGuardObservatory.API/Data/SQLNovaDbContext.cs` (modificado)
- ✅ `SQLGuardObservatory.API/Program.cs` (modificado)
- ✅ `SQLGuardObservatory.API/SQL/AddHealthScorePermission.sql` (nuevo)
- ✅ `SQLGuardObservatory.API/SQL/Apply-HealthScorePermission.ps1` (nuevo)

### Frontend
- ✅ `src/pages/HealthScore.tsx` (nuevo)
- ✅ `src/services/api.ts` (modificado)
- ✅ `src/pages/Overview.tsx` (modificado)
- ✅ `src/components/layout/AppSidebar.tsx` (modificado)
- ✅ `src/App.tsx` (modificado)

### Documentación
- ✅ `IMPLEMENTACION_HEALTHSCORE_FRONTEND.md` (este archivo)

---

## 🎯 Funcionalidad Completa

✅ **Vista desde Overview**: Tarjeta clickeable con resumen
✅ **Página dedicada**: Tabla completa con todas las instancias
✅ **Filtros avanzados**: Estado, Ambiente, Hosting
✅ **Detalles expandibles**: JSON parseados en formato legible
✅ **Ordenamiento**: Por cualquier columna
✅ **Estadísticas**: Contadores en tiempo real
✅ **Permisos**: Integrado con sistema de roles
✅ **Estilos consistentes**: Mismo look & feel de la app
✅ **Navegación**: Accesible desde sidebar
✅ **Backend completo**: API RESTful con EF Core

---

## 📝 Notas

- La tabla `InstanceHealthSnapshot` debe ser poblada por el script PowerShell `RelevamientoHealthScoreMant.ps1`
- Los JSON se parsean automáticamente en el backend
- La UI muestra el **último snapshot** de cada instancia
- Los colores de score siguen la convención:
  - **Verde**: >= 90 (Healthy)
  - **Amarillo**: 70-89 (Warning)
  - **Rojo**: < 70 (Critical)

---

## 🔗 Referencias

- PowerShell HealthScore: `scripts/RelevamientoHealthScoreMant.ps1`
- Documentación HealthScore: `IMPLEMENTACION_HEALTHSCORE.md`
- Schema SQL: Ver `CREATE TABLE` en script PowerShell

