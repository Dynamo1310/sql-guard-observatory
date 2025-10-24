# Health Score V2 - Sistema Completo

## 📋 Tabla de Contenidos

1. [Descripción General](#descripción-general)
2. [Arquitectura del Sistema](#arquitectura-del-sistema)
3. [Instalación y Configuración](#instalación-y-configuración)
4. [Collectors PowerShell](#collectors-powershell)
5. [Vistas y Cálculos SQL](#vistas-y-cálculos-sql)
6. [API .NET 8](#api-net-8)
7. [Frontend Next.js](#frontend-nextjs)
8. [Mantenimiento y Troubleshooting](#mantenimiento-y-troubleshooting)

---

## Descripción General

**Health Score V2** es un sistema integral de monitoreo y scoring de salud para instancias SQL Server basado en 10 categorías ponderadas, con aplicación de "caps" (hard-stops) para condiciones críticas.

### Características Principales

- ✅ **10 categorías de evaluación**: Backups, AlwaysOn, Conectividad, Errores Sev≥20, CPU, IO, Discos, Memoria, Mantenimiento, Config & Tempdb
- ✅ **Puntaje 0-100** por categoría y global con ponderación configurable
- ✅ **Caps globales**: Hard-stops automáticos cuando se detectan condiciones críticas
- ✅ **Collectors automatizados**: Scripts PowerShell que leen inventario desde API REST
- ✅ **Dashboard en tiempo real**: Frontend Next.js con semáforo, tendencias 24h/7d y alertas
- ✅ **Histórico y alertas**: Sistema de alertas automáticas con histeresis (5 min)

### Categorías y Pesos

| Categoría | Peso | Descripción |
|-----------|------|-------------|
| **Backups** | 18% | Edad de FULL/LOG, cadena de backups |
| **AlwaysOn** | 14% | Sincronización AG, colas send/redo |
| **Conectividad** | 10% | Reachability, Auth, RTT |
| **Errores Sev≥20** | 7% | Errores críticos con decaimiento temporal |
| **CPU** | 10% | Percentil 95, runnable tasks |
| **IO** | 10% | Latencias data/log, IOPS |
| **Discos** | 8% | % libre por rol (Data/Log prioritario) |
| **Memoria** | 7% | PLE objetivo, grants pending, uso |
| **Mantenimiento** | 6% | CHECKDB, Index Optimize, Stats |
| **Config & Tempdb** | 10% | Archivos tempdb, growth, max memory |

### Caps Globales (Hard-Stops)

| Condición | Cap Aplicado | Descripción |
|-----------|--------------|-------------|
| Cadena de LOG rota | 60 | ChainOK=0 |
| AG DB SUSPENDED >2min | 60 | DB no sincronizada |
| Errores sev≥20 última hora | 70 | Errores críticos recientes |
| PLE < 15% objetivo | 60 | Presión memoria crítica |
| PLE < 30% objetivo | 70 | Presión memoria alta |
| Latencia LOG >20ms (p95) | 70 | Escrituras lentas en LOG |
| PAGELATCH tempdb | 65 | Contención en tempdb |

---

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                  API de Inventario                           │
│          http://asprbm-nov-01/InventoryDBA/inventario/      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ GET (lista de instancias)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│             Collectors PowerShell (10 scripts)               │
│  Get-Backups, Get-AG, Get-Conectividad, Get-ErroresSev,    │
│  Get-CPU, Get-IO, Get-Discos, Get-Memoria,                 │
│  Get-Mantenimiento, Get-ConfigTempdb                        │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ INSERT INTO (snapshots)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│              Base de Datos Central (SQLNova)                 │
│  • 10 tablas InventarioXXXSnapshot                          │
│  • CollectorLog                                              │
│  • 10 vistas vw_Score_XXX (cálculo 0-100)                  │
│  • vw_CategoryScores_V2 (consolidado)                       │
│  • vw_HealthFinal_V2 (con caps)                            │
│  • vw_HealthTendencias_24h_V2 / 7d_V2                      │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ SELECT (via EF Core)
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                API .NET 8 (Minimal API)                      │
│  Endpoints:                                                  │
│  • GET /api/v2/healthscore                                  │
│  • GET /api/v2/healthscore/{instance}                       │
│  • GET /api/v2/healthscore/{instance}/categories           │
│  • GET /api/v2/healthscore/{instance}/trends/24h|7d        │
│  • GET /api/v2/healthscore/summary                         │
│  • GET /api/v2/healthscore/alerts                          │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ fetch() / REST
                   ▼
┌─────────────────────────────────────────────────────────────┐
│            Frontend Next.js (Dashboard)                      │
│  • Vista Home: tabla con semáforo y HealthFinal            │
│  • Vista Detalle: cards por categoría + sparklines 24h/7d  │
│  • Filtros: ambiente, hosting                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Instalación y Configuración

### Prerrequisitos

- **SQL Server** (2014+) para SQLNova (base de datos central)
- **PowerShell 5.1+** (o 7+ para ejecución paralela)
- **.NET 8 SDK** para la API
- **Node.js 18+** para el frontend Next.js
- **Cuenta de servicio** con permisos de lectura en todas las instancias SQL monitoreadas

### Paso 1: Configurar Base de Datos Central (SQLNova)

1. Crear la base de datos `SQLNova` si no existe:

```sql
CREATE DATABASE SQLNova;
GO
```

2. Ejecutar los scripts SQL en orden:

```powershell
# Desde el directorio raíz del proyecto
cd SQLNova

# 1. Crear tablas de snapshots
sqlcmd -S <TuServidorCentral> -d SQLNova -i 01_Schema_HealthScore_V2.sql

# 2. Crear vistas de scores por categoría
sqlcmd -S <TuServidorCentral> -d SQLNova -i 02_Views_HealthScore_V2.sql

# 3. Crear vista final con caps
sqlcmd -S <TuServidorCentral> -d SQLNova -i 03_Views_HealthFinal_V2.sql

# 4. Configurar seguridad y permisos
sqlcmd -S <TuServidorCentral> -d SQLNova -i 04_Security_V2.sql

# 5. (Opcional) Insertar datos de prueba
sqlcmd -S <TuServidorCentral> -d SQLNova -i 05_Seed_Data_V2.sql
```

3. Configurar usuarios y permisos:

```sql
-- Editar 04_Security_V2.sql y descomentar las secciones 3 y 4
-- Reemplazar DOMAIN\svc_healthscore_collector con tu cuenta de servicio

-- Ejemplo:
USE SQLNova;
GO

CREATE USER [DOMAIN\svc_healthscore_collector] FOR LOGIN [DOMAIN\svc_healthscore_collector];
ALTER ROLE HealthScore_Collector_Role ADD MEMBER [DOMAIN\svc_healthscore_collector];

CREATE USER [DOMAIN\svc_healthscore_api] FOR LOGIN [DOMAIN\svc_healthscore_api];
ALTER ROLE HealthScore_API_Role ADD MEMBER [DOMAIN\svc_healthscore_api];
GO
```

### Paso 2: Configurar Collectors PowerShell

1. Copiar los scripts de collectors a un directorio central:

```powershell
# Crear directorio de collectors
New-Item -ItemType Directory -Path "C:\HealthScore\Collectors" -Force

# Copiar todos los collectors
Copy-Item -Path ".\Collectors\*.ps1" -Destination "C:\HealthScore\Collectors\" -Force
Copy-Item -Path ".\Collectors\*.xml" -Destination "C:\HealthScore\Collectors\" -Force
```

2. Editar `Run-All.ps1` para ajustar parámetros:

```powershell
# Abrir el archivo y modificar valores por defecto si es necesario
notepad C:\HealthScore\Collectors\Run-All.ps1

# Parámetros importantes:
# - $ApiUrl: URL de la API de inventario
# - $SqlServer: Servidor central SQLNova
# - $SqlDatabase: Base de datos SQLNova
# - $TimeoutSec: Timeout para queries
```

3. Probar ejecución manual:

```powershell
cd C:\HealthScore\Collectors

# Modo Debug con todos los collectors
.\Run-All.ps1 -Mode All -Debug

# Solo collectors frecuentes (CPU, IO, Memoria, etc.)
.\Run-All.ps1 -Mode Frequent -Debug

# PowerShell 7 con ejecución paralela
pwsh -File .\Run-All.ps1 -Mode All -Parallel -Debug
```

### Paso 3: Programar Collectors con Task Scheduler

Crear 3 tareas programadas para ejecutar los collectors:

#### Tarea 1: Collectors Frecuentes (cada 5 minutos)

```powershell
# Editar TaskScheduler-HealthScore-V2.xml
# Cambiar:
#   - UserId: SID de la cuenta de servicio
#   - Arguments: Ruta al script Run-All.ps1
#   - WorkingDirectory: C:\HealthScore\Collectors

# Crear la tarea
schtasks /Create /XML "C:\HealthScore\Collectors\TaskScheduler-HealthScore-V2.xml" /TN "HealthScore\V2-Collectors-Frequent"
```

#### Tarea 2: Collectors Periódicos (cada 10 minutos)

```powershell
# Copiar el XML y modificar:
# - Interval: PT10M
# - Arguments: -Mode Periodic

schtasks /Create /XML "C:\HealthScore\Collectors\TaskScheduler-HealthScore-V2-Periodic.xml" /TN "HealthScore\V2-Collectors-Periodic"
```

#### Tarea 3: Collectors Diarios (cada 24h a las 2 AM)

```powershell
# Copiar el XML y modificar:
# - Trigger: Diario a las 02:00
# - Arguments: -Mode Daily

schtasks /Create /XML "C:\HealthScore\Collectors\TaskScheduler-HealthScore-V2-Daily.xml" /TN "HealthScore\V2-Collectors-Daily"
```

**Verificar tareas creadas:**

```powershell
Get-ScheduledTask -TaskName "*HealthScore*"

# Ejecutar manualmente para probar
Start-ScheduledTask -TaskName "HealthScore\V2-Collectors-Frequent"
```

### Paso 4: Configurar API .NET 8

1. Editar `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=<TuServidorCentral>;Database=SQLNova;Integrated Security=true;TrustServerCertificate=true;",
    "ApplicationDb": "Server=<TuServidorAuth>;Database=ApplicationDb;Integrated Security=true;TrustServerCertificate=true;"
  },
  "JwtSettings": {
    "SecretKey": "<TuClaveSecreta>",
    "Issuer": "SQLGuardObservatory",
    "Audience": "SQLGuardObservatory",
    "ExpirationMinutes": 60
  }
}
```

2. Compilar y publicar la API:

```powershell
cd SQLGuardObservatory.API

# Restaurar dependencias
dotnet restore

# Compilar
dotnet build -c Release

# Publicar
dotnet publish -c Release -o C:\inetpub\SQLGuardAPI
```

3. Configurar como servicio de Windows o IIS:

**Opción A: Servicio de Windows**

```powershell
# Instalar como servicio
sc create "SQLGuardObservatory.API" binPath="C:\inetpub\SQLGuardAPI\SQLGuardObservatory.API.exe" start=auto

# Iniciar servicio
sc start "SQLGuardObservatory.API"
```

**Opción B: IIS**

1. Abrir IIS Manager
2. Crear nuevo Application Pool (.NET CLR: No Managed Code)
3. Crear nuevo sitio web apuntando a `C:\inetpub\SQLGuardAPI`
4. Configurar binding: `http://*:5000`

### Paso 5: Configurar Frontend Next.js

1. Configurar URL de la API:

```bash
# Crear archivo .env.local
cd <directorio-frontend>

echo "VITE_API_URL=http://asprbm-nov-01:5000" > .env.local
```

2. Instalar dependencias y compilar:

```bash
npm install

# Desarrollo
npm run dev

# Producción
npm run build
npm run preview
```

3. Desplegar en servidor web:

```bash
# Copiar dist/ a IIS o servidor web
xcopy /E /I dist C:\inetpub\SQLGuardFrontend

# Configurar IIS:
# - Crear nuevo sitio
# - Binding: http://*:8080
# - Habilitar reescritura URL (para SPA)
```

---

## Collectors PowerShell

### Descripción de Collectors

| Collector | Frecuencia | Descripción |
|-----------|------------|-------------|
| `Get-Backups-ToSQL.ps1` | 24h | Edad de backups FULL/DIFF/LOG por base de datos |
| `Get-AG-ToSQL.ps1` | 10min | Estado de sincronización de AlwaysOn AG |
| `Get-Conectividad-ToSQL.ps1` | 5min | Reachability, Auth, RTT, logins fallidos |
| `Get-ErroresSev-ToSQL.ps1` | 5min | Errores severidad ≥20 del log |
| `Get-CPU-ToSQL.ps1` | 5min | CPU p95, runnable tasks |
| `Get-IO-ToSQL.ps1` | 5min | Latencias read/write, IOPS por archivo |
| `Get-Discos-ToSQL.ps1` | 10min | Espacio libre % por disco/rol |
| `Get-Memoria-ToSQL.ps1` | 5min | PLE, grants pending, committed/target |
| `Get-Mantenimiento-ToSQL.ps1` | 24h | CHECKDB, Index Optimize, Stats (Ola Hallengren o msdb) |
| `Get-ConfigTempdb-ToSQL.ps1` | 24h | Archivos tempdb, growth, max memory |

### Ejecución Manual

```powershell
# Ejecutar un collector específico
cd C:\HealthScore\Collectors

.\Get-Backups-ToSQL.ps1 -Debug

# Cambiar servidor central
.\Get-CPU-ToSQL.ps1 -SqlServer "MiServidorCentral" -SqlDatabase "MiBaseDatos" -Debug

# Cambiar timeout
.\Get-IO-ToSQL.ps1 -TimeoutSec 60 -Debug
```

### Troubleshooting Collectors

**Ver logs de collectors:**

```sql
-- Últimos 50 logs
SELECT TOP 50 *
FROM dbo.CollectorLog
ORDER BY LoggedAt DESC;

-- Errores recientes
SELECT *
FROM dbo.CollectorLog
WHERE Level = 'Error'
  AND LoggedAt >= DATEADD(HOUR, -24, GETDATE())
ORDER BY LoggedAt DESC;

-- Errores por collector
SELECT CollectorName, COUNT(*) AS Errores
FROM dbo.CollectorLog
WHERE Level = 'Error'
  AND LoggedAt >= DATEADD(DAY, -7, GETDATE())
GROUP BY CollectorName
ORDER BY Errores DESC;
```

**Problemas comunes:**

| Problema | Causa | Solución |
|----------|-------|----------|
| Timeout en queries | Instancia lenta o query pesada | Aumentar `-TimeoutSec` |
| Access denied | Falta de permisos | Verificar cuenta de servicio en `sp_helplogins` |
| API no responde | URL incorrecta o servicio caído | Verificar `http://asprbm-nov-01/InventoryDBA/inventario/` |
| Datos no se insertan | Permisos en SQLNova | Verificar rol `HealthScore_Collector_Role` |

---

## Vistas y Cálculos SQL

### Vistas Principales

#### 1. `vw_CategoryScores_V2`

Consolida los scores de las 10 categorías por instancia.

```sql
SELECT * FROM dbo.vw_CategoryScores_V2
WHERE Instance = 'MiInstancia';
```

**Columnas:**
- `Instance`
- `Score_Backups` (0-100)
- `Notes_Backups` (descripción)
- ... (10 categorías)

#### 2. `vw_HealthRaw_V2`

Calcula el Health Score sin aplicar caps (promedio ponderado).

```sql
SELECT Instance, HealthRaw
FROM dbo.vw_HealthRaw_V2
ORDER BY HealthRaw DESC;
```

**Fórmula:**

```
HealthRaw = 
  0.18 × Score_Backups +
  0.14 × Score_AG +
  0.10 × Score_Conectividad +
  0.07 × Score_ErroresSev +
  0.10 × Score_CPU +
  0.10 × Score_IO +
  0.08 × Score_Discos +
  0.07 × Score_Memoria +
  0.06 × Score_Mantenimiento +
  0.10 × Score_ConfigRecursos
```

#### 3. `vw_HealthFinal_V2`

Aplica caps globales y determina el Health Score final.

```sql
SELECT 
    Instance,
    HealthRaw,
    CapApplied,
    HealthFinal,
    ColorSemaforo,
    Top3Penalizaciones
FROM dbo.vw_HealthFinal_V2
WHERE ColorSemaforo IN ('Naranja', 'Rojo')
ORDER BY HealthFinal;
```

**Semáforo:**
- 🟢 **Verde** (≥85): Saludable
- 🟡 **Amarillo** (75-84): Advertencia
- 🟠 **Naranja** (65-74): Crítico
- 🔴 **Rojo** (<65): Emergencia

### Consultas Útiles

**Instancias con Health Score bajo:**

```sql
SELECT TOP 10
    Instance,
    HealthFinal,
    ColorSemaforo,
    Top3Penalizaciones
FROM dbo.vw_HealthFinal_V2
WHERE HealthFinal < 75
ORDER BY HealthFinal;
```

**Detalle de una categoría:**

```sql
-- Ver todas las categorías de una instancia
SELECT *
FROM dbo.vw_CategoryScores_V2
WHERE Instance = 'SQL-PROD-01\INST1';

-- Ver solo CPU
SELECT Instance, Score_CPU, Notes_CPU
FROM dbo.vw_CategoryScores_V2
WHERE Score_CPU < 70;
```

**Tendencias históricas:**

```sql
-- Últimas 24 horas
SELECT HourBucket, HealthScore
FROM dbo.vw_HealthTendencias_24h_V2
WHERE Instance = 'MiInstancia'
ORDER BY HourBucket;

-- Últimos 7 días
SELECT DayBucket, HealthScore
FROM dbo.vw_HealthTendencias_7d_V2
WHERE Instance = 'MiInstancia'
ORDER BY DayBucket;
```

---

## API .NET 8

### Endpoints Disponibles

#### GET `/api/v2/healthscore`

Lista el Health Score de todas las instancias.

**Respuesta:**
```json
[
  {
    "instance": "SQL-PROD-01\\INST1",
    "healthRaw": 87,
    "capApplied": null,
    "healthFinal": 87,
    "top3Penalizaciones": "Backups (72), Discos (78)",
    "colorSemaforo": "Verde",
    "calculadoAt": "2025-10-24T18:30:00",
    "statusText": "Saludable",
    "statusColor": "#10b981"
  }
]
```

#### GET `/api/v2/healthscore/{instance}`

Detalle completo de una instancia (categorías + tendencias).

**Respuesta:**
```json
{
  "instance": "SQL-PROD-01\\INST1",
  "healthFinal": 87,
  "healthRaw": 87,
  "capApplied": null,
  "colorSemaforo": "Verde",
  "calculadoAt": "2025-10-24T18:30:00",
  "categories": [
    {
      "name": "Backups",
      "displayName": "Backups (RPO/RTO)",
      "score": 72,
      "notes": "FULL: 720min, LOG: 10min",
      "weight": 0.18,
      "icon": "💾",
      "statusColor": "#f59e0b"
    }
  ],
  "trends24h": [
    {"timestamp": "2025-10-24T17:00:00", "healthScore": 85},
    {"timestamp": "2025-10-24T18:00:00", "healthScore": 87}
  ],
  "trends7d": []
}
```

#### GET `/api/v2/healthscore/{instance}/categories`

Solo las categorías de una instancia.

#### GET `/api/v2/healthscore/{instance}/trends/24h`

Tendencias horarias últimas 24h.

#### GET `/api/v2/healthscore/{instance}/trends/7d`

Tendencias diarias últimos 7 días.

#### GET `/api/v2/healthscore/summary`

Resumen general para el dashboard.

**Respuesta:**
```json
{
  "totalInstances": 15,
  "healthyInstances": 10,
  "warningInstances": 3,
  "criticalInstances": 1,
  "emergencyInstances": 1,
  "averageHealth": 82.5,
  "instances": [],
  "recentAlerts": []
}
```

#### GET `/api/v2/healthscore/alerts?top=10`

Alertas recientes (transiciones de estado).

#### GET `/api/v2/healthscore/collectors/logs?instance=X&level=Error&top=50`

Logs de collectors (troubleshooting).

### Autenticación

Todos los endpoints requieren token JWT en el header:

```http
Authorization: Bearer <tu-token-jwt>
```

**Obtener token:**

```bash
curl -X POST http://asprbm-nov-01:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "tu-usuario", "password": "tu-password"}'
```

---

## Frontend Next.js

El frontend ya está configurado y consume los endpoints V2 a través de `healthScoreV2Api` en `src/services/api.ts`.

### Ejemplo de Uso en React

```typescript
import { healthScoreV2Api } from '@/services/api';

// En un componente
const MyComponent = () => {
  const [healthScores, setHealthScores] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await healthScoreV2Api.getAllHealthScores();
        setHealthScores(data);
      } catch (error) {
        console.error('Error al obtener health scores:', error);
      }
    };
    fetchData();
  }, []);

  return (
    <div>
      {healthScores.map(score => (
        <div key={score.instance}>
          <h3>{score.instance}</h3>
          <p>Health: {score.healthFinal}</p>
          <span style={{ color: score.statusColor }}>
            {score.statusText}
          </span>
        </div>
      ))}
    </div>
  );
};
```

### Rutas Recomendadas

| Ruta | Descripción |
|------|-------------|
| `/healthscore-v2` | Dashboard principal con tabla de instancias |
| `/healthscore-v2/:instance` | Detalle de instancia con categorías |
| `/healthscore-v2/alerts` | Vista de alertas recientes |
| `/healthscore-v2/logs` | Logs de collectors |

---

## Mantenimiento y Troubleshooting

### Limpiar Snapshots Antiguos

Los snapshots se acumulan con el tiempo. Crear un job SQL para limpiarlos:

```sql
-- Retener solo últimos 7 días
DELETE FROM dbo.InventarioBackupSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioAGSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioConectividadSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioErroresSevSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioCPUSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioIOSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioDiscosSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioMemoriaSnapshot WHERE SnapshotAt < DATEADD(DAY, -7, GETDATE());
DELETE FROM dbo.InventarioMantenimientoSnapshot WHERE SnapshotAt < DATEADD(DAY, -30, GETDATE());
DELETE FROM dbo.InventarioConfigRecursosSnapshot WHERE SnapshotAt < DATEADD(DAY, -30, GETDATE());

-- Logs de collectors: retener 30 días
DELETE FROM dbo.CollectorLog WHERE LoggedAt < DATEADD(DAY, -30, GETDATE());

-- Alertas: retener 90 días
DELETE FROM dbo.HealthScoreAlertas WHERE DetectadoAt < DATEADD(DAY, -90, GETDATE());
```

### Monitoreo de Collectors

**Ver última ejecución por collector:**

```sql
SELECT 
    CollectorName,
    MAX(LoggedAt) AS UltimaEjecucion,
    DATEDIFF(MINUTE, MAX(LoggedAt), GETDATE()) AS MinutosDesde
FROM dbo.CollectorLog
WHERE Level = 'Info'
GROUP BY CollectorName
ORDER BY UltimaEjecucion DESC;
```

**Alertar si un collector no ha corrido:**

```sql
-- Si algún collector frecuente no ha corrido en >15 min
SELECT CollectorName, MAX(LoggedAt) AS UltimaEjecucion
FROM dbo.CollectorLog
WHERE CollectorName IN ('Get-CPU-ToSQL', 'Get-IO-ToSQL', 'Get-Memoria-ToSQL')
GROUP BY CollectorName
HAVING DATEDIFF(MINUTE, MAX(LoggedAt), GETDATE()) > 15;
```

### Recargar Vistas (si se modifican)

Si modificas las vistas SQL, refrésca las en el orden correcto:

```powershell
sqlcmd -S <Servidor> -d SQLNova -i 02_Views_HealthScore_V2.sql
sqlcmd -S <Servidor> -d SQLNova -i 03_Views_HealthFinal_V2.sql
```

### Verificar Salud del Sistema

```sql
-- Dashboard de salud del sistema
SELECT 
    'Instancias monitoreadas' AS Metrica,
    COUNT(DISTINCT Instance) AS Valor
FROM dbo.vw_HealthFinal_V2

UNION ALL

SELECT 
    'Snapshots últimas 24h',
    COUNT(*)
FROM dbo.InventarioCPUSnapshot
WHERE SnapshotAt >= DATEADD(HOUR, -24, GETDATE())

UNION ALL

SELECT 
    'Errores collectors última hora',
    COUNT(*)
FROM dbo.CollectorLog
WHERE Level = 'Error'
  AND LoggedAt >= DATEADD(HOUR, -1, GETDATE());
```

---

## Contacto y Soporte

Para reportar problemas o sugerencias:

- 📧 Email: dba-team@tuempresa.com
- 📝 Documentación adicional: [Wiki interno]
- 🐛 Tickets: [Sistema de tickets]

---

**Health Score V2** - Generado el 24 de octubre de 2025

