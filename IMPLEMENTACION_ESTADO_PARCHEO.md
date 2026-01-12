# Implementación: Estado de Parcheo SQL Server

## Descripción

Sistema de monitoreo de parcheo para servidores SQL Server con:
- Dashboard estilo Power BI compatible con modo claro/oscuro
- Configuración de compliance personalizable por versión SQL Server
- Cache en base de datos para carga rápida
- Menú "Parcheos" con submenús en el sidebar

## Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                 │
│  ┌─────────────────┐    ┌──────────────────────┐                │
│  │ PatchStatus.tsx │    │ PatchComplianceConfig │                │
│  │   (Dashboard)   │    │    (Configuración)    │                │
│  └────────┬────────┘    └──────────┬───────────┘                │
│           └──────────┬─────────────┘                            │
│                      ▼                                           │
│              ┌─────────────┐                                    │
│              │   api.ts    │                                    │
│              └──────┬──────┘                                    │
└─────────────────────┼───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                  │
│  ┌────────────────────┐    ┌─────────────────┐                  │
│  │PatchingController  │───▶│ PatchingService │                  │
│  └────────────────────┘    └────────┬────────┘                  │
│                                     │                            │
│                     ┌───────────────┼───────────────┐           │
│                     ▼               ▼               ▼           │
│              ┌──────────┐   ┌──────────────┐  ┌─────────┐       │
│              │ SQL DB   │   │ Inventory    │  │  SQL    │       │
│              │ Cache    │   │    API       │  │ Servers │       │
│              └──────────┘   └──────────────┘  └─────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

## Estados de Parcheo

| Estado | Descripción | Color |
|--------|-------------|-------|
| **Updated** | Tiene la última CU disponible | Verde |
| **Compliant** | Cumple el requisito de compliance del banco | Azul |
| **NonCompliant** | No cumple el requisito de compliance | Naranja |
| **Critical** | 3+ CUs atrasado del requisito | Rojo |
| **Outdated** | Desactualizado (sin config de compliance) | Amarillo |
| **Error** | Error de conexión | Gris |

## Menú del Sidebar

```
📂 Parcheos
├── 📊 Dashboard (Estado de parcheo de todos los servidores)
└── ⚙️ Configuración Compliance (Solo SuperAdmin)
```

## Archivos del Backend

| Archivo | Descripción |
|---------|-------------|
| `Models/PatchingModels.cs` | Modelos EF: PatchComplianceConfig, ServerPatchStatusCache |
| `DTOs/PatchingDto.cs` | DTOs para la API |
| `Services/PatchingService.cs` | Lógica de negocio con cache y compliance |
| `Controllers/PatchingController.cs` | Endpoints de la API |
| `Data/ApplicationDbContext.cs` | DbSets agregados |
| `Data/PermissionInitializer.cs` | Permisos Patching y PatchingConfig |
| `Data/dbatools-buildref-index.json` | Índice de builds SQL Server |
| `SQL/CreatePatchingTables.sql` | Script para crear tablas |

## Archivos del Frontend

| Archivo | Descripción |
|---------|-------------|
| `pages/PatchStatus.tsx` | Dashboard con gráficos y tabla |
| `pages/PatchComplianceConfig.tsx` | Configuración de compliance |
| `services/api.ts` | Funciones de la API de parcheo |
| `components/layout/AppSidebar.tsx` | Menú Parcheos con submenús |
| `App.tsx` | Rutas /patching y /patching/config |

## Endpoints de la API

### Estado de Parcheo
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/patching/status` | Lista de servidores (desde cache) |
| GET | `/api/patching/status?forceRefresh=true` | Forzar actualización |
| GET | `/api/patching/status/{instanceName}` | Estado de un servidor |
| POST | `/api/patching/refresh` | Refrescar cache manualmente |
| GET | `/api/patching/summary` | Resumen estadístico |

### Configuración de Compliance
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/patching/compliance` | Lista de configuraciones |
| GET | `/api/patching/compliance/{sqlVersion}` | Config de una versión |
| POST | `/api/patching/compliance` | Guardar configuración |
| DELETE | `/api/patching/compliance/{id}` | Eliminar configuración |

### Referencias
| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/patching/builds/{sqlVersion}` | CUs disponibles para versión |
| GET | `/api/patching/versions` | Versiones SQL soportadas |

## Tablas de Base de Datos

### PatchComplianceConfig
```sql
CREATE TABLE PatchComplianceConfig (
    Id INT IDENTITY PRIMARY KEY,
    SqlVersion NVARCHAR(20) NOT NULL UNIQUE,  -- "2016", "2019", "2022"
    RequiredBuild NVARCHAR(50) NOT NULL,       -- "15.0.4375.4"
    RequiredCU NVARCHAR(20),                   -- "CU28"
    RequiredKB NVARCHAR(20),                   -- "KB5039747"
    Description NVARCHAR(500),
    IsActive BIT DEFAULT 1,
    UpdatedAt DATETIME2 DEFAULT GETDATE(),
    UpdatedBy NVARCHAR(100)
);
```

### ServerPatchStatusCache
```sql
CREATE TABLE ServerPatchStatusCache (
    Id INT IDENTITY PRIMARY KEY,
    ServerName NVARCHAR(100) NOT NULL,
    InstanceName NVARCHAR(100) NOT NULL UNIQUE,
    Ambiente NVARCHAR(50),
    MajorVersion NVARCHAR(20),
    CurrentBuild NVARCHAR(50),
    CurrentCU NVARCHAR(20),
    RequiredBuild NVARCHAR(50),
    RequiredCU NVARCHAR(20),
    LatestBuild NVARCHAR(50),
    LatestCU NVARCHAR(20),
    PendingCUsForCompliance INT DEFAULT 0,
    PendingCUsForLatest INT DEFAULT 0,
    PatchStatus NVARCHAR(20) DEFAULT 'Unknown',
    ConnectionSuccess BIT DEFAULT 0,
    ErrorMessage NVARCHAR(500),
    LastChecked DATETIME2 DEFAULT GETDATE()
);
```

## Despliegue

### 1. Backend

```powershell
# Compilar
cd SQLGuardObservatory.API
dotnet build -c Release

# Copiar al servidor
Copy-Item -Path "bin\Release\net8.0\*" -Destination "\\asprbm-nov-01\c$\Apps\SQLGuardObservatory\API" -Recurse -Force

# Copiar archivo de builds
Copy-Item -Path "Data\dbatools-buildref-index.json" -Destination "\\asprbm-nov-01\c$\Apps\SQLGuardObservatory\Data" -Force

# Reiniciar servicio
Restart-Service "SQLGuardObservatory" -Force
```

### 2. Base de Datos

```powershell
# Ejecutar script SQL
sqlcmd -S asprbm-nov-01 -d AppSQLNova -i "SQL\CreatePatchingTables.sql"
```

### 3. Frontend

```powershell
# Compilar
npm run build

# Copiar al servidor
Copy-Item -Path "dist\*" -Destination "\\asprbm-nov-01\c$\inetpub\wwwroot\SQLNova" -Recurse -Force
```

## Características del Dashboard

### KPIs
- Total de servidores
- % Compliance (Updated + Compliant)
- Actualizados (última CU)
- Compliance (cumple requisito)
- No Compliance
- Críticos (3+ CUs atrasados)
- CUs pendientes totales

### Gráficos
- **Dona**: Distribución por estado
- **Barras horizontales**: Compliance por versión SQL
- **Barras verticales**: CUs pendientes por ambiente

### Filtros
- Búsqueda por nombre
- Ambiente
- Estado
- Versión SQL

### Exportación
- CSV con todos los datos filtrados

## Permisos

| Permiso | Roles | Descripción |
|---------|-------|-------------|
| Patching | SuperAdmin, Admin | Ver dashboard de parcheo |
| PatchingConfig | SuperAdmin | Configurar compliance |

## Cache

- El cache se almacena en la tabla `ServerPatchStatusCache`
- Expira después de 30 minutos
- Se puede forzar refresh desde el dashboard
- La conexión a cada servidor tiene timeout de 10 segundos
- Se procesan máximo 10 servidores en paralelo

## Modo Claro/Oscuro

El dashboard usa variables CSS de Tailwind para compatibilidad con temas:
- `hsl(var(--card))` para fondos
- `hsl(var(--foreground))` para texto
- `hsl(var(--muted-foreground))` para texto secundario
- Colores semánticos: `text-emerald-600 dark:text-emerald-400`
