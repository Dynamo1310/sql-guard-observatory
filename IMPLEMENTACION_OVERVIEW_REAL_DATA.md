# Implementación: Overview con Datos Reales de HealthScore

## 📋 Objetivo

Actualizar el Overview para:
1. ✅ Usar datos **reales** de `InstanceHealthSnapshot` en lugar de datos mock
2. ✅ Hacer clickeables las tarjetas de **HealthScore**, **Discos** y **Mantenimiento (Jobs)**
3. ✅ Reemplazar la tarjeta "Bases Más Grandes" por "Instancias con Problemas Críticos"
4. ✅ Mostrar backups atrasados por instancia

---

## 🔧 Cambios en el Backend

### 1. Nuevos DTOs (`HealthScoreDto.cs`)

```csharp
public class OverviewDataDto
{
    public HealthScoreSummaryDto HealthSummary { get; set; } = new();
    public int CriticalDisksCount { get; set; }
    public int BackupsOverdueCount { get; set; }
    public int MaintenanceOverdueCount { get; set; }
    public int FailedJobsCount { get; set; }
    public List<CriticalInstanceDto> CriticalInstances { get; set; } = new();
    public List<BackupIssueDto> BackupIssues { get; set; } = new();
}

public class CriticalInstanceDto
{
    public string InstanceName { get; set; } = string.Empty;
    public int HealthScore { get; set; }
    public string HealthStatus { get; set; } = string.Empty;
    public List<string> Issues { get; set; } = new();
}

public class BackupIssueDto
{
    public string InstanceName { get; set; } = string.Empty;
    public List<string> Breaches { get; set; } = new();
    public DateTime? LastFullBackup { get; set; }
    public DateTime? LastLogBackup { get; set; }
}
```

### 2. Nuevo Método en `HealthScoreService.cs`

**`GetOverviewDataAsync()`**

Este método agrega todos los datos necesarios para el Overview:

```csharp
public async Task<OverviewDataDto> GetOverviewDataAsync()
{
    // Obtener todos los snapshots más recientes por instancia
    var latestScores = ...
    
    // Calcular contadores:
    // - Discos críticos (< 15% libre)
    // - Backups atrasados (con breaches)
    // - Mantenimiento atrasado (CHECKDB o IndexOptimize vencido)
    
    // Identificar instancias críticas (HealthScore < 70)
    // con listado de problemas específicos
    
    return new OverviewDataDto { ... };
}
```

**Lógica de Agregación:**

- **Discos Críticos**: `WorstVolumeFreePct < 15%`
- **Backups Atrasados**: Instancias con `Breaches.Count > 0`
- **Mantenimiento Atrasado**: `CheckdbOk == false` OR `IndexOptimizeOk == false`
- **Instancias Críticas**: `HealthScore < 70` con detalle de problemas

### 3. Nuevo Endpoint (`HealthScoreController.cs`)

```csharp
[HttpGet("overview")]
public async Task<ActionResult<OverviewDataDto>> GetOverviewData()
{
    try
    {
        var overviewData = await _healthScoreService.GetOverviewDataAsync();
        return Ok(overviewData);
    }
    catch (Exception ex)
    {
        _logger.LogError(ex, "Error al obtener datos del overview");
        return StatusCode(500, new { message = "Error al obtener datos del overview" });
    }
}
```

**Ruta:** `GET /api/healthscore/overview`

---

## 🎨 Cambios en el Frontend

### 1. Nuevas Interfaces (`api.ts`)

```typescript
export interface OverviewDataDto {
  healthSummary: HealthScoreSummaryDto;
  criticalDisksCount: number;
  backupsOverdueCount: number;
  maintenanceOverdueCount: number;
  failedJobsCount: number;
  criticalInstances: CriticalInstanceDto[];
  backupIssues: BackupIssueDto[];
}

export interface CriticalInstanceDto {
  instanceName: string;
  healthScore: number;
  healthStatus: string;
  issues: string[];
}

export interface BackupIssueDto {
  instanceName: string;
  breaches: string[];
  lastFullBackup: string | null;
  lastLogBackup: string | null;
}
```

### 2. Nuevo Método en `healthScoreApi`

```typescript
async getOverviewData(): Promise<OverviewDataDto> {
  const response = await fetch(`${API_URL}/api/healthscore/overview`, {
    headers: {
      ...getAuthHeader(),
    },
  });
  return handleResponse<OverviewDataDto>(response);
}
```

### 3. Actualización de `Overview.tsx`

**Estado:**
```typescript
const [overviewData, setOverviewData] = useState<OverviewDataDto | null>(null);
const [loading, setLoading] = useState(true);
```

**Fetch de Datos:**
```typescript
const fetchOverviewData = async () => {
  try {
    setLoading(true);
    const data = await healthScoreApi.getOverviewData();
    setOverviewData(data);
  } catch (error) {
    console.error('Error al cargar datos del overview:', error);
  } finally {
    setLoading(false);
  }
};
```

---

## 📊 Nuevas Tarjetas KPI

### Tarjeta 1: Health Score (Clickeable → `/healthscore`)
```tsx
<KPICard
  title="Health Score"
  value={healthSummary ? `${healthSummary.avgScore}` : '-'}
  icon={Heart}
  description={`${healthyCount} Healthy, ${warningCount} Warning, ${criticalCount} Critical`}
  variant={avgScore >= 90 ? 'success' : avgScore >= 70 ? 'warning' : 'critical'}
  onClick={() => navigate('/healthscore')}
/>
```

### Tarjeta 2: Mantenimiento Atrasado (Clickeable → `/jobs`)
```tsx
<KPICard
  title="Mantenimiento Atrasado"
  value={maintenanceOverdueCount}
  icon={Wrench}
  description="CHECKDB o IndexOptimize vencido"
  onClick={() => navigate('/jobs')}
/>
```

### Tarjeta 3: Discos Críticos (Clickeable → `/disks`)
```tsx
<KPICard
  title="Discos Críticos"
  value={criticalDisksCount}
  icon={HardDrive}
  description="Menos de 15% libre"
  onClick={() => navigate('/disks')}
/>
```

### Tarjeta 4: Backups Atrasados
```tsx
<KPICard
  title="Backups Atrasados"
  value={backupsOverdueCount}
  icon={Save}
  description="RPO violado"
/>
```

### Tarjeta 5: Instancias Críticas (Nueva)
```tsx
<KPICard
  title="Instancias Críticas"
  value={criticalCount}
  icon={AlertTriangle}
  description="Health Score < 70"
/>
```

---

## 📋 Nuevas Tablas

### Tabla 1: Instancias con Problemas Críticos

**Antes:** "Bases Más Grandes" (mock data)

**Ahora:** "Instancias con Problemas Críticos" (datos reales)

**Columnas:**
- **Instancia**: Nombre de la instancia
- **Score**: HealthScore (badge crítico)
- **Problemas**: Lista de problemas detectados

**Ejemplos de problemas:**
- "Disco crítico (12.3% libre)"
- "2 backup(s) atrasado(s)"
- "CHECKDB atrasado"
- "IndexOptimize atrasado"

### Tabla 2: Backups Atrasados

**Antes:** Por base de datos individual

**Ahora:** Por instancia (agregado)

**Columnas:**
- **Instancia**: Nombre de la instancia
- **Problemas**: Lista de breaches (ej: "Sin FULL backup", "LOG backup antiguo")
- **Último FULL**: Fecha del último FULL backup

---

## 🎯 Lógica de Variantes de Color

### HealthScore
- **Verde (success)**: `>= 90`
- **Amarillo (warning)**: `70-89`
- **Rojo (critical)**: `< 70`

### Discos Críticos
- **Verde**: `0` instancias
- **Amarillo**: `1-2` instancias
- **Rojo**: `>= 3` instancias

### Backups Atrasados
- **Verde**: `0` instancias
- **Amarillo**: `1-2` instancias
- **Rojo**: `>= 3` instancias

### Mantenimiento Atrasado
- **Verde**: `0` instancias
- **Amarillo**: `1-4` instancias
- **Rojo**: `>= 5` instancias

### Instancias Críticas
- **Verde**: `0` instancias
- **Amarillo**: `1-4` instancias
- **Rojo**: `>= 5` instancias

---

## ✅ Resultado Final

### Vista del Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Overview                                │
│         Panel de control - Estado general del sistema          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┬──────────────┬──────────────┬──────────────┬──────────────┐
│ Health Score │ Mantenimiento│ Discos       │ Backups      │ Instancias   │
│ [Clickeable] │ Atrasado     │ Críticos     │ Atrasados    │ Críticas     │
│              │ [Clickeable] │ [Clickeable] │              │              │
│     85       │      12      │      3       │      5       │      8       │
│              │              │              │              │              │
│ 45 Healthy   │ CHECKDB o    │ Menos de 15% │ RPO violado  │ Health < 70  │
│ 30 Warning   │ IndexOptimize│ libre        │              │              │
│ 8 Critical   │ vencido      │              │              │              │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────┘

┌─────────────────────────────────────┬─────────────────────────────────────┐
│ Instancias con Problemas Críticos  │ Backups Atrasados                   │
│                                     │                                     │
│ Instancia          Score  Problemas│ Instancia        Problemas  Último  │
│ SSPR17DEV-01       45     Disco... │ SSPR19PROD-02    Sin FULL   N/A     │
│ SSPR19TEST-51      52     2 back...│ SSPR17DEV-51     LOG antiguo 20:30  │
│ ...                                 │ ...                                 │
└─────────────────────────────────────┴─────────────────────────────────────┘
```

---

## 🚀 Navegación

### Tarjetas Clickeables

| Tarjeta | Ruta | Descripción |
|---------|------|-------------|
| **Health Score** | `/healthscore` | Detalle de todas las instancias con su HealthScore |
| **Mantenimiento Atrasado** | `/jobs` | Vista de Jobs con filtros para ver mantenimiento |
| **Discos Críticos** | `/disks` | Vista de Discos con filtro de críticos |

---

## 📝 Notas Técnicas

### Datos Reales vs Mock

**Antes:**
- 100% datos mock (`mockData.ts`)
- No reflejaba el estado real del sistema

**Ahora:**
- 100% datos reales de `InstanceHealthSnapshot`
- Se actualiza con cada ejecución del script PowerShell
- Refleja el estado actual de todas las instancias

### Performance

- **Query única**: `/api/healthscore/overview` trae todos los datos agregados
- **Cálculo en backend**: Toda la lógica de agregación se hace en C#
- **Frontend ligero**: Solo renderiza los datos recibidos

### Escalabilidad

- **Top 10**: Solo muestra las 10 instancias más críticas
- **Top 10 Backups**: Solo los 10 con más problemas
- Para ver todo el detalle, usar las vistas específicas

---

## 🔧 Archivos Modificados

### Backend
| Archivo | Cambios |
|---------|---------|
| `DTOs/HealthScoreDto.cs` | ✅ Agregado `OverviewDataDto`, `CriticalInstanceDto`, `BackupIssueDto` |
| `Services/IHealthScoreService.cs` | ✅ Agregado `GetOverviewDataAsync()` |
| `Services/HealthScoreService.cs` | ✅ Implementado `GetOverviewDataAsync()` con lógica de agregación |
| `Controllers/HealthScoreController.cs` | ✅ Agregado endpoint `GET /api/healthscore/overview` |

### Frontend
| Archivo | Cambios |
|---------|---------|
| `services/api.ts` | ✅ Agregado `OverviewDataDto`, `CriticalInstanceDto`, `BackupIssueDto` |
| | ✅ Agregado `getOverviewData()` en `healthScoreApi` |
| `pages/Overview.tsx` | ✅ Reemplazado mock data por datos reales |
| | ✅ Agregado `onClick` a tarjetas (Health, Discos, Mantenimiento) |
| | ✅ Reemplazado "Bases Más Grandes" por "Instancias Críticas" |
| | ✅ Actualizado tabla de backups por instancia |

---

## ✅ Testing

### Validar en el Frontend

1. **Acceder a Overview**: `http://servidor:3000/`
2. **Verificar tarjetas**:
   - Números coinciden con datos reales
   - Colores reflejan severidad
   - Click en Health → redirige a `/healthscore`
   - Click en Discos → redirige a `/disks`
   - Click en Mantenimiento → redirige a `/jobs`
3. **Verificar tablas**:
   - "Instancias con Problemas Críticos" muestra datos reales
   - "Backups Atrasados" muestra instancias con breaches

### Validar en el Backend

```bash
# Test del endpoint
curl -X GET "http://servidor:5000/api/healthscore/overview" \
  -H "Authorization: Bearer YOUR_TOKEN" | jq
```

**Respuesta esperada:**
```json
{
  "healthSummary": {
    "totalInstances": 83,
    "healthyCount": 45,
    "warningCount": 30,
    "criticalCount": 8,
    "avgScore": 85,
    "lastUpdate": "2025-10-22T10:30:00Z"
  },
  "criticalDisksCount": 3,
  "backupsOverdueCount": 5,
  "maintenanceOverdueCount": 12,
  "failedJobsCount": 0,
  "criticalInstances": [
    {
      "instanceName": "SSPR17DEV-01",
      "healthScore": 45,
      "healthStatus": "Critical",
      "issues": [
        "Disco crítico (12.3% libre)",
        "2 backup(s) atrasado(s)",
        "CHECKDB atrasado"
      ]
    }
  ],
  "backupIssues": [
    {
      "instanceName": "SSPR19PROD-02",
      "breaches": ["Sin FULL backup", "LOG backup antiguo"],
      "lastFullBackup": null,
      "lastLogBackup": "2025-10-22T08:00:00Z"
    }
  ]
}
```

---

**Fecha de Implementación:** 2025-10-22  
**Estado:** ✅ Implementado y validado  
**Compatibilidad:** .NET 8.0, React 18, TypeScript 5

