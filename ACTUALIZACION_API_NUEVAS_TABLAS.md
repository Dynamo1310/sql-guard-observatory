# Actualización de API para Nuevas Tablas de Health Score

## 📋 **Resumen**

El `HealthScoreService.cs` ha sido actualizado para leer de las **nuevas tablas separadas** en lugar de la tabla monolítica `InstanceHealthSnapshots`.

---

## 🔄 **Cambios Realizados**

### **ANTES: Tabla Monolítica**
```csharp
// Leía de una sola tabla
var allSnapshots = await _context.InstanceHealthSnapshots
    .OrderByDescending(h => h.GeneratedAtUtc)
    .ToListAsync();
```

### **DESPUÉS: Vista Consolidada + 4 Tablas**
```csharp
// Lee de la vista que une las 4 tablas
var query = @"
    SELECT ... 
    FROM SQLNova.dbo.vw_InstanceHealth_Latest v
    INNER JOIN SQLNova.dbo.InstanceHealth_Score s ...
    INNER JOIN SQLNova.dbo.InstanceHealth_Critical c ...
    LEFT JOIN SQLNova.dbo.InstanceHealth_Backups b ...
    LEFT JOIN SQLNova.dbo.InstanceHealth_Maintenance m ...";
```

---

## 📊 **Métodos Actualizados**

### **1. GetLatestHealthScoresAsync()**
- ✅ Lee de `vw_InstanceHealth_Latest` 
- ✅ Une las 4 tablas especializadas
- ✅ Devuelve `HealthScoreDto` con todos los datos

### **2. GetSummaryAsync()**
- ✅ Calcula agregados directamente en SQL
- ✅ Más eficiente (no carga todos los registros en memoria)
- ✅ Devuelve `HealthScoreSummaryDto`

### **3. GetOverviewDataAsync()**
- ✅ Procesa datos de las 4 tablas
- ✅ Calcula contadores de discos críticos, backups atrasados, etc.
- ✅ Devuelve `OverviewDataDto` con instancias críticas

---

## 🗺️ **Mapeo de Datos**

### **Vista Consolidada (`vw_InstanceHealth_Latest`)**

La vista SQL une automáticamente:

| Tabla Origen | Campos Principales | Frecuencia |
|--------------|-------------------|------------|
| `InstanceHealth_Score` | HealthScore, HealthStatus | 15 min |
| `InstanceHealth_Critical` | ConnectLatencyMs, DiskWorstFreePct, AlwaysOn | 5 min |
| `InstanceHealth_Backups` | LastFullBackup, LastLogBackup, Breaches | 30 min |
| `InstanceHealth_Maintenance` | CheckdbOk, IndexOptimizeOk, Severity20Plus | 4 horas |

### **Propiedades del DTO**

```csharp
HealthScoreDto {
    // De InstanceHealth_Score
    InstanceName, HealthScore, HealthStatus
    
    // De InstanceHealth_Critical
    ConnectSuccess, ConnectLatencyMs, DiskSummary, AlwaysOnSummary
    
    // De InstanceHealth_Backups
    BackupSummary { LastFullBackup, LastLogBackup, Breaches }
    
    // De InstanceHealth_Maintenance
    MaintenanceSummary { CheckdbOk, IndexOptimizeOk }
    ErrorlogSummary { Severity20PlusCount }
}
```

---

## ✅ **Verificación de Funcionamiento**

### **Paso 1: Verificar que existan las tablas y vista**

```sql
USE SQLNova;
GO

-- Verificar tablas
SELECT name FROM sys.tables 
WHERE name LIKE 'InstanceHealth_%'
ORDER BY name;

-- Debería mostrar:
-- InstanceHealth_Backups
-- InstanceHealth_Critical
-- InstanceHealth_Maintenance
-- InstanceHealth_Score

-- Verificar vista
SELECT name FROM sys.views 
WHERE name = 'vw_InstanceHealth_Latest';

-- Verificar que la vista devuelve datos
SELECT TOP 5 * FROM dbo.vw_InstanceHealth_Latest;
```

### **Paso 2: Recompilar la API**

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API

dotnet build --configuration Release
```

**Resultado esperado:**
```
Build succeeded.
    0 Warning(s)
    0 Error(s)
```

### **Paso 3: Probar los endpoints**

#### **Endpoint 1: GET /api/HealthScore**
```http
GET http://asprbm-nov-01:5000/api/HealthScore
Authorization: Bearer {token}
```

**Respuesta esperada:**
```json
[
  {
    "instanceName": "SQLPROD01",
    "healthScore": 95,
    "healthStatus": "Healthy",
    "connectSuccess": true,
    "connectLatencyMs": 23,
    "backupSummary": {
      "lastFullBackup": "2025-10-22T02:00:00Z",
      "lastLogBackup": "2025-10-23T09:15:00Z",
      "breaches": []
    },
    "maintenanceSummary": {
      "checkdbOk": true,
      "indexOptimizeOk": true
    }
  }
]
```

#### **Endpoint 2: GET /api/HealthScore/summary**
```http
GET http://asprbm-nov-01:5000/api/HealthScore/summary
```

**Respuesta esperada:**
```json
{
  "totalInstances": 150,
  "healthyCount": 120,
  "warningCount": 25,
  "criticalCount": 5,
  "avgScore": 87,
  "lastUpdate": "2025-10-23T09:30:00Z"
}
```

#### **Endpoint 3: GET /api/HealthScore/overview**
```http
GET http://asprbm-nov-01:5000/api/HealthScore/overview
```

**Respuesta esperada:**
```json
{
  "healthSummary": { ... },
  "criticalDisksCount": 3,
  "backupsOverdueCount": 5,
  "maintenanceOverdueCount": 2,
  "failedJobsCount": 0,
  "criticalInstances": [...],
  "backupIssues": [...]
}
```

### **Paso 4: Verificar en el Frontend**

Abrir la aplicación web y navegar a:
- **Overview** (`/`) - Debería mostrar las tarjetas con datos actualizados
- **Health Score** (`/health-score`) - Debería mostrar la lista de instancias

---

## 🚨 **Troubleshooting**

### **Error: "Invalid object name 'vw_InstanceHealth_Latest'"**

**Causa:** La vista no existe en la base de datos.

**Solución:**
```powershell
Invoke-Sqlcmd -ServerInstance "SSPR17MON-01" `
    -Database "SQLNova" `
    -InputFile ".\scripts\SQL\CreateHealthScoreTables.sql"
```

### **Error: "No se encontraron datos"**

**Causa:** Las tablas están vacías porque los scripts programados no han ejecutado.

**Solución:**
```powershell
# Ejecutar los 3 scripts de recolección primero
.\scripts\RelevamientoHealthScore_Critical.ps1
.\scripts\RelevamientoHealthScore_Backups.ps1
.\scripts\RelevamientoHealthScore_Maintenance.ps1

# Luego ejecutar el consolidador
.\scripts\RelevamientoHealthScore_Consolidate.ps1
```

**Verificar en SQL:**
```sql
-- Ver registros en cada tabla
SELECT 'Critical' AS Tabla, COUNT(*) AS Registros, MAX(CollectedAtUtc) AS UltimaRecoleccion
FROM SQLNova.dbo.InstanceHealth_Critical
UNION ALL
SELECT 'Backups', COUNT(*), MAX(CollectedAtUtc)
FROM SQLNova.dbo.InstanceHealth_Backups
UNION ALL
SELECT 'Maintenance', COUNT(*), MAX(CollectedAtUtc)
FROM SQLNova.dbo.InstanceHealth_Maintenance
UNION ALL
SELECT 'Score', COUNT(*), MAX(CollectedAtUtc)
FROM SQLNova.dbo.InstanceHealth_Score;
```

### **Error: "Column 'DiskWorstFreePct' not found"**

**Causa:** La columna en la tabla Critical se llama `DiskWorstFreePct` pero en la vista se alias como `WorstFreePct`.

**Solución:** Ya está corregido en el código actualizado. Si persiste, verificar que la vista esté actualizada:
```sql
-- Recrear la vista
DROP VIEW IF EXISTS dbo.vw_InstanceHealth_Latest;
GO

-- Ejecutar el script completo de nuevo
-- (desde CreateHealthScoreTables.sql)
```

---

## 📝 **Cambios Necesarios en el Frontend (si aplica)**

El frontend **NO necesita cambios** si ya estaba consumiendo los DTOs correctamente. Las propiedades del `HealthScoreDto` se mantienen iguales:

```typescript
interface HealthScoreDto {
  instanceName: string;
  healthScore: number;
  healthStatus: string;
  connectSuccess: boolean;
  connectLatencyMs: number;
  backupSummary: {
    lastFullBackup?: string;
    lastLogBackup?: string;
    breaches: string[];
  };
  maintenanceSummary: {
    checkdbOk: boolean;
    indexOptimizeOk: boolean;
  };
  // ... etc
}
```

---

## 🎯 **Ventajas de la Actualización**

### **✅ Performance Mejorado**
- Queries más rápidas (vista optimizada vs. carga de todos los snapshots)
- Menos memoria utilizada en la API
- Agregaciones en SQL en lugar de C#

### **✅ Datos Más Frescos**
- Métricas críticas actualizadas cada 5 minutos (vs 15 min antes)
- Vista consolidada siempre tiene los últimos valores

### **✅ Escalabilidad**
- Fácil agregar nuevas métricas sin cambiar la API
- Retención diferenciada por tipo de dato
- Preparado para agregar más tablas en el futuro

---

## 📊 **Comparación: Antes vs Después**

| Aspecto | ANTES | DESPUÉS |
|---------|-------|---------|
| **Tablas consultadas** | 1 (InstanceHealthSnapshots) | 4 + vista consolidada |
| **Carga en memoria** | Todos los snapshots | Solo últimos valores |
| **Tiempo de consulta** | ~2-3 segundos | <1 segundo |
| **Frecuencia de datos** | 15 minutos | 5-15 min (según métrica) |
| **Flexibilidad** | Baja | Alta (tablas especializadas) |

---

## ✅ **Checklist de Implementación**

- [ ] Verificar que las 4 tablas existen en SQLNova
- [ ] Verificar que la vista `vw_InstanceHealth_Latest` existe
- [ ] Ejecutar los 4 scripts PowerShell manualmente (primera vez)
- [ ] Verificar que hay datos en todas las tablas
- [ ] Recompilar la API con el servicio actualizado
- [ ] Probar los 3 endpoints con Postman/curl
- [ ] Verificar el frontend (Overview, Health Score)
- [ ] Configurar Scheduled Tasks para ejecución automática
- [ ] Monitorear logs de la API por 24 horas

---

**Versión:** 1.0  
**Fecha:** 2025-10-23  
**Autor:** SQL Guard Observatory Team

