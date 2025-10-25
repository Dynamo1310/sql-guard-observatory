# 🚀 Health Score v3.0 - Guía de Implementación Completa

## 📊 Resumen Ejecutivo

Esta guía describe la implementación completa del sistema Health Score v3.0, que reemplaza el sistema anterior con un nuevo modelo de **10 categorías** y **100 puntos totales**.

---

## 🎯 Arquitectura del Sistema

### Antes (v2.0):
- 4 tablas principales
- 150 puntos totales
- 4 tiers mezclados

### Ahora (v3.0):
- **10 tablas especializadas** (una por categoría)
- **100 puntos totales**
- **10 categorías independientes**
- **Sistema de pesos flexible**

---

## 📦 Componentes Implementados

### 1️⃣ **Scripts PowerShell de Recolección** (10 scripts)

| # | Script | Tabla | Peso | Frecuencia |
|---|--------|-------|------|------------|
| 1 | `RelevamientoHealthScore_Backups.ps1` | `InstanceHealth_Backups` | 18% | 15 min |
| 2 | `RelevamientoHealthScore_AlwaysOn.ps1` | `InstanceHealth_AlwaysOn` | 14% | 5 min |
| 3 | `RelevamientoHealthScore_Conectividad.ps1` | `InstanceHealth_Conectividad` | 10% | 1-2 min |
| 4 | `RelevamientoHealthScore_ErroresCriticos.ps1` | `InstanceHealth_ErroresCriticos` | 7% | 15 min |
| 5 | `RelevamientoHealthScore_CPU.ps1` | `InstanceHealth_CPU` | 10% | 5 min |
| 6 | `RelevamientoHealthScore_IO.ps1` | `InstanceHealth_IO` | 10% | 5 min |
| 7 | `RelevamientoHealthScore_Discos.ps1` | `InstanceHealth_Discos` | 8% | 10 min |
| 8 | `RelevamientoHealthScore_Memoria.ps1` | `InstanceHealth_Memoria` | 7% | 5 min |
| 9 | `RelevamientoHealthScore_Maintenance.ps1` | `InstanceHealth_Maintenance` | 6% | 60 min |
| 10 | `RelevamientoHealthScore_ConfiguracionTempdb.ps1` | `InstanceHealth_ConfiguracionTempdb` | 10% | 30 min |

### 2️⃣ **Script Consolidador**

- **Script**: `RelevamientoHealthScore_Consolidate_v3.ps1`
- **Función**: Calcula el score final ponderado
- **Tabla**: `InstanceHealth_Score`
- **Frecuencia**: Cada 2 minutos

### 3️⃣ **Scheduler**

- **Script**: `Schedule-HealthScore-v3.ps1`
- **Función**: Crea 11 tareas programadas en Windows Task Scheduler

---

## 🗄️ Base de Datos

### Nuevas Tablas Creadas

```sql
-- 8 nuevas tablas:
InstanceHealth_Conectividad
InstanceHealth_AlwaysOn
InstanceHealth_ErroresCriticos
InstanceHealth_CPU
InstanceHealth_IO
InstanceHealth_Discos
InstanceHealth_Memoria
InstanceHealth_ConfiguracionTempdb

-- Tabla principal actualizada:
InstanceHealth_Score (nueva estructura con 10 categorías)
```

### Tablas Modificadas

```sql
-- Eliminadas columnas obsoletas:
InstanceHealth_Maintenance
  - Severity20PlusCount (movido a InstanceHealth_ErroresCriticos)
  - ErrorlogDetails (movido a InstanceHealth_ErroresCriticos)
```

### Vistas Creadas

```sql
vw_LatestHealthScore              -- Último score por instancia
vw_HealthScoreByAmbiente          -- Resumen agregado por ambiente
vw_HealthScoreDetailComplete       -- Vista completa con todas las categorías
```

---

## 🔌 Backend (API C#)

### Modelos Creados

Todos en el namespace `SQLGuardObservatory.API.Models.HealthScoreV3`:

```csharp
InstanceHealthScore.cs
InstanceHealthConectividad.cs
InstanceHealthAlwaysOn.cs
InstanceHealthErroresCriticos.cs
InstanceHealthCPU.cs
InstanceHealthIO.cs
InstanceHealthDiscos.cs
InstanceHealthMemoria.cs
InstanceHealthConfiguracionTempdb.cs
```

### DbContext Actualizado

```csharp
// SQLNovaDbContext.cs - Agregados 9 DbSets nuevos
public DbSet<InstanceHealthScore> InstanceHealthScores { get; set; }
public DbSet<InstanceHealthConectividad> InstanceHealthConectividad { get; set; }
// ... etc
```

### Nuevo Controller

**Ruta base**: `/api/healthscore/v3`

#### Endpoints Principales:

```
GET /api/healthscore/v3/scores/latest
    → Obtiene el último score de todas las instancias

GET /api/healthscore/v3/scores/{instanceName}
    → Score de una instancia específica

GET /api/healthscore/v3/scores/{instanceName}/history?hours=24
    → Historial de scores

GET /api/healthscore/v3/scores/summary
    → Resumen agregado por ambiente

GET /api/healthscore/v3/{instanceName}/conectividad
GET /api/healthscore/v3/{instanceName}/alwayson
GET /api/healthscore/v3/{instanceName}/errores
GET /api/healthscore/v3/{instanceName}/cpu
GET /api/healthscore/v3/{instanceName}/io
GET /api/healthscore/v3/{instanceName}/discos
GET /api/healthscore/v3/{instanceName}/memoria
GET /api/healthscore/v3/{instanceName}/configuracion

GET /api/healthscore/v3/{instanceName}/complete
    → Vista completa con todas las categorías
```

---

## 🚦 Sistema de Puntuación

### Semáforo de 4 Colores

| Color | Emoji | Rango | Estado | Acción |
|-------|-------|-------|--------|--------|
| Verde | 🟢 | 85-100 | Óptimo | Sin acción |
| Amarillo | 🟡 | 75-84 | Advertencia leve | Revisar en 24-48h |
| Naranja | 🟠 | 65-74 | Riesgo alto | Analizar y planificar |
| Rojo | 🔴 | <65 | Crítico | Atención inmediata |

### Pesos por Categoría

```
Total: 100 puntos

18% - Backups (RPO/RTO)
14% - AlwaysOn (AG)
10% - Conectividad
10% - CPU
10% - IO (Latencia/IOPS)
8%  - Espacio en Discos
7%  - Errores Críticos (sev≥20)
7%  - Memoria (PLE + Grants)
6%  - Mantenimientos
10% - Configuración & TempDB
```

---

## 📋 Pasos para Implementar

### 1. Base de Datos

```sql
-- Ejecutar la migración SQL:
USE SQLNova;
GO

-- Ejecutar:
.\supabase\migrations\20250125_healthscore_v3_tables.sql
```

**Resultado esperado**:
- ✅ 8 tablas nuevas creadas
- ✅ 2 tablas modificadas
- ✅ 1 tabla de score reconstruida
- ✅ 3 vistas creadas

### 2. Backend (API)

```bash
# En el directorio SQLGuardObservatory.API
dotnet build

# Verificar que compila sin errores
dotnet run
```

**Verificar**:
- ✅ Todos los modelos compilando
- ✅ DbContext sin errores
- ✅ Controller accesible

### 3. Scripts PowerShell

```powershell
# Probar cada script manualmente primero
cd C:\SQL-Guard-Observatory\scripts

# Probar conectividad
.\RelevamientoHealthScore_Conectividad.ps1

# Probar CPU
.\RelevamientoHealthScore_CPU.ps1

# ... probar cada uno

# Finalmente probar el consolidador
.\RelevamientoHealthScore_Consolidate_v3.ps1
```

### 4. Configurar Scheduler

```powershell
# Ejecutar como Administrador:
cd C:\SQL-Guard-Observatory\scripts

.\Schedule-HealthScore-v3.ps1
```

**Esto creará 11 tareas programadas** en Windows Task Scheduler.

### 5. Frontend (React)

#### Actualizar Servicios API:

Crear/actualizar `src/services/healthScoreV3Service.ts`:

```typescript
const API_BASE = '/api/healthscore/v3';

export const healthScoreV3Service = {
  getLatestScores: () => api.get(`${API_BASE}/scores/latest`),
  getScoreByInstance: (instanceName: string) => 
    api.get(`${API_BASE}/scores/${instanceName}`),
  getScoreHistory: (instanceName: string, hours: number = 24) => 
    api.get(`${API_BASE}/scores/${instanceName}/history?hours=${hours}`),
  getSummary: () => api.get(`${API_BASE}/scores/summary`),
  getCompleteView: (instanceName: string) => 
    api.get(`${API_BASE}/${instanceName}/complete`),
  // ... endpoints por categoría
};
```

#### Componentes a Actualizar:

1. **Dashboard Principal**:
   - Mostrar score de 100 puntos
   - Semáforo de 4 colores
   - Gráfico de barras con 10 categorías

2. **Detalle de Instancia**:
   - 10 cards (una por categoría)
   - Gráficos de tendencias para cada métrica

3. **Vista de Resumen**:
   - Tabla con todas las instancias
   - Filtros por estado (🟢🟡🟠🔴)
   - Ordenamiento por score

---

## 🧪 Testing

### Checklist de Verificación

#### Base de Datos:
- [ ] Todas las tablas creadas
- [ ] Vistas funcionando correctamente
- [ ] Índices creados

#### Scripts PowerShell:
- [ ] Cada script ejecuta sin errores
- [ ] Datos guardándose en tablas correctas
- [ ] Consolidador calculando scores correctamente

#### Backend:
- [ ] API compilando sin errores
- [ ] Endpoints respondiendo correctamente
- [ ] Autenticación funcionando

#### Frontend:
- [ ] Dashboard mostrando datos nuevos
- [ ] Gráficos actualizados
- [ ] Filtros y búsquedas funcionando

---

## 📊 Ejemplo de Datos

### Score de Ejemplo:

```json
{
  "instanceName": "SQL-PROD-01",
  "healthScore": 87,
  "healthStatus": "🟢 Óptimo",
  "backupsScore": 100,      // 18% = 18 pts
  "alwaysOnScore": 100,     // 14% = 14 pts
  "conectividadScore": 100, // 10% = 10 pts
  "erroresCriticosScore": 70, // 7% = 4.9 pts
  "cpuScore": 80,           // 10% = 8 pts
  "ioScore": 90,            // 10% = 9 pts
  "discosScore": 75,        // 8% = 6 pts
  "memoriaScore": 85,       // 7% = 5.95 pts
  "mantenimientosScore": 100, // 6% = 6 pts
  "configuracionTempdbScore": 80, // 10% = 8 pts
  "globalCap": 100
}
```

---

## 🔧 Mantenimiento

### Monitoreo de Scheduled Tasks

```powershell
# Ver todas las tareas de Health Score v3:
Get-ScheduledTask | Where-Object {$_.TaskName -like 'HealthScore_v3*'}

# Verificar última ejecución:
Get-ScheduledTask -TaskName "HealthScore_v3_Conectividad" | 
  Get-ScheduledTaskInfo

# Ejecutar manualmente:
Start-ScheduledTask -TaskName "HealthScore_v3_Consolidate"
```

### Logs

Los logs se guardan en:
```
C:\SQL-Guard-Observatory\logs\
  HealthScore_v3_Conectividad_20250125.log
  HealthScore_v3_CPU_20250125.log
  ... etc
```

---

## 🆘 Troubleshooting

### Problema: Scripts no guardan datos

**Verificar**:
1. Tablas existen en SQL Server
2. Credenciales de conexión correctas
3. dbatools instalado

```powershell
# Verificar dbatools:
Get-Module -ListAvailable -Name dbatools

# Probar conexión:
Test-DbaConnection -SqlInstance "SSPR17MON-01"
```

### Problema: API no devuelve datos

**Verificar**:
1. Connection string correcta en `appsettings.json`
2. Tablas tienen datos
3. Permisos de lectura en SQL

```sql
-- Verificar datos:
SELECT COUNT(*) FROM InstanceHealth_Score;
SELECT TOP 10 * FROM vw_LatestHealthScore;
```

### Problema: Frontend no muestra datos

**Verificar**:
1. API ejecutándose
2. CORS configurado correctamente
3. Autenticación JWT válida
4. Endpoints correctos en servicio

---

## 📚 Referencias

- **Scripts PowerShell**: `.\scripts\RelevamientoHealthScore_*.ps1`
- **Migración SQL**: `.\supabase\migrations\20250125_healthscore_v3_tables.sql`
- **Backend Models**: `.\SQLGuardObservatory.API\Models\HealthScoreV3\`
- **Controller**: `.\SQLGuardObservatory.API\Controllers\HealthScoreV3Controller.cs`

---

## ✅ Checklist Final de Implementación

- [ ] **SQL**: Ejecutar migración y verificar tablas
- [ ] **Backend**: Compilar y verificar endpoints
- [ ] **PowerShell**: Probar scripts manualmente
- [ ] **Scheduler**: Configurar tareas programadas
- [ ] **Frontend**: Actualizar componentes y servicios
- [ ] **Testing**: Ejecutar suite de pruebas completa
- [ ] **Monitoreo**: Configurar alertas y logs
- [ ] **Documentación**: Actualizar wikis y guías

---

## 🎉 Conclusión

El sistema Health Score v3.0 proporciona una arquitectura modular y escalable para monitoreo de instancias SQL Server con:

✅ **10 categorías independientes**
✅ **100 puntos claramente definidos**
✅ **Semáforo de 4 colores intuitivo**
✅ **Sistema de pesos flexible**
✅ **Caps y penalizaciones por categoría**
✅ **Arquitectura desacoplada y mantenible**

---

**Versión**: 3.0
**Fecha**: Enero 2025
**Autor**: SQL Guard Observatory Team

