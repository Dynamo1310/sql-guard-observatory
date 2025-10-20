# 🏗️ Arquitectura - SQL Guard Observatory

## 📋 Visión General

SQL Guard Observatory es una aplicación web de monitoreo para SQL Server compuesta por:

- **Frontend**: React + TypeScript + Vite
- **Backend**: .NET 8 Web API + Entity Framework Core
- **Base de Datos**: SQL Server
  - `SQLNova`: Base de datos de solo lectura con datos de monitoreo
  - `SQLGuardObservatoryAuth`: Base de datos de Identity para autenticación

## 🔄 Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────┐
│                         NAVEGADOR WEB                            │
│                    http://localhost:3000                         │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │         FRONTEND (React + TypeScript + Vite)            │    │
│  │  - React Router para navegación                         │    │
│  │  - shadcn/ui para componentes                           │    │
│  │  - Tailwind CSS para estilos                            │    │
│  │  - Axios/Fetch para llamadas API                        │    │
│  └─────────────┬──────────────────────────────────────────┘    │
└────────────────┼───────────────────────────────────────────────┘
                 │
                 │ HTTP REST API
                 │ (JSON)
                 │
┌────────────────▼───────────────────────────────────────────────┐
│              BACKEND (.NET 8 Web API)                           │
│                http://localhost:5000                            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    API Controllers                        │ │
│  │  ┌──────────────┐  ┌──────────────┐                      │ │
│  │  │    Auth      │  │    Jobs      │                      │ │
│  │  │ Controller   │  │  Controller  │                      │ │
│  │  └──────┬───────┘  └──────┬───────┘                      │ │
│  └─────────┼──────────────────┼──────────────────────────────┘ │
│            │                  │                                 │
│  ┌─────────▼──────────────────▼──────────────────────────────┐ │
│  │                       Services                             │ │
│  │  ┌──────────────┐  ┌──────────────┐                      │ │
│  │  │    Auth      │  │    Jobs      │                      │ │
│  │  │   Service    │  │   Service    │                      │ │
│  │  └──────┬───────┘  └──────┬───────┘                      │ │
│  └─────────┼──────────────────┼──────────────────────────────┘ │
│            │                  │                                 │
│  ┌─────────▼──────────────────▼──────────────────────────────┐ │
│  │             Entity Framework Core DbContext                │ │
│  │  ┌───────────────────┐  ┌────────────────────┐            │ │
│  │  │  Application      │  │   SQLNova          │            │ │
│  │  │  DbContext        │  │   DbContext        │            │ │
│  │  │  (Identity)       │  │   (Monitoring)     │            │ │
│  │  └─────────┬─────────┘  └─────────┬──────────┘            │ │
│  └────────────┼────────────────────────┼───────────────────────┘ │
└───────────────┼────────────────────────┼─────────────────────────┘
                │                        │
                │ ADO.NET                │ ADO.NET
                │                        │
┌───────────────▼───────┐  ┌─────────────▼────────────┐
│   SQL Server          │  │   SQL Server             │
│   SSPR17MON-01        │  │   SSPR17MON-01           │
│                       │  │                          │
│  SQLGuardObservatory  │  │   SQLNova                │
│  Auth                 │  │   (Solo Lectura)         │
│  (R/W)                │  │                          │
│                       │  │  ┌────────────────────┐  │
│  - AspNetUsers        │  │  │ InventarioJobs    │  │
│  - AspNetRoles        │  │  │ Snapshot          │  │
│  - AspNetUserRoles    │  │  └────────────────────┘  │
│  - etc.               │  │                          │
└───────────────────────┘  └──────────────────────────┘
```

## 🔐 Flujo de Autenticación

```
1. Usuario ingresa credenciales
   │
   ▼
2. Frontend POST /api/auth/login
   │
   ▼
3. Backend valida con Identity (ApplicationDbContext)
   │
   ├─ Usuario no existe ──────► 401 Unauthorized
   │
   ├─ Usuario inactivo ───────► 401 Unauthorized
   │
   ├─ Contraseña incorrecta ──► 401 Unauthorized
   │
   └─ Todo OK
      │
      ▼
4. Backend genera JWT Token
   │
   ▼
5. Backend retorna token + info usuario
   │
   ▼
6. Frontend guarda token en localStorage
   │
   ▼
7. Frontend incluye token en headers:
   Authorization: Bearer {token}
   │
   ▼
8. Backend valida token en cada request
   │
   ├─ Token inválido/expirado ──► 401 Unauthorized
   │
   └─ Token válido
      │
      ▼
9. Backend verifica autorización (Policy)
   │
   ├─ "WhitelistOnly" ──► Usuario autenticado
   │
   └─ "AdminOnly" ────► Usuario con rol Admin
      │
      ▼
10. Procesa request y retorna datos
```

## 📊 Flujo de Datos - Jobs

```
1. Usuario navega a página de Jobs o Overview
   │
   ▼
2. Frontend llama a API:
   - GET /api/jobs/summary  (KPIs)
   - GET /api/jobs          (Lista de jobs)
   - GET /api/jobs/failed   (Jobs fallidos)
   │
   ▼
3. JobsController recibe request
   │
   ▼
4. Valida autenticación (JWT Token)
   │
   ▼
5. JobsService procesa la lógica
   │
   ▼
6. Consulta SQLNovaDbContext
   │
   ▼
7. Entity Framework ejecuta query en SQL Server:
   SELECT * FROM [SQLNova].[dbo].[InventarioJobsSnapshot]
   │
   ▼
8. Transforma datos a DTOs
   │
   ▼
9. Retorna JSON al Frontend
   │
   ▼
10. Frontend renderiza en componentes React
```

## 🗄️ Modelo de Datos

### Base de Datos: SQLNova (Solo Lectura)

#### Tabla: InventarioJobsSnapshot

```sql
CREATE TABLE [dbo].[InventarioJobsSnapshot] (
    [Id] INT IDENTITY(1,1) PRIMARY KEY,
    [InstanceName] NVARCHAR(255),
    [Ambiente] NVARCHAR(50),        -- Prod, UAT, Dev
    [Hosting] NVARCHAR(50),         -- OnPrem, AWS
    [JobName] NVARCHAR(255),
    [JobStart] DATETIME,
    [JobEnd] DATETIME,
    [JobDurationSeconds] INT,
    [JobStatus] NVARCHAR(50),       -- Succeeded, Failed, Running
    [CaptureDate] DATETIME,
    [InsertedAtUtc] DATETIME
)
```

**Uso**: Contiene snapshots de las ejecuciones de SQL Agent Jobs de todos los servidores monitoreados.

### Base de Datos: SQLGuardObservatoryAuth (R/W)

Creada automáticamente por Identity, contiene:

- **AspNetUsers**: Usuarios autorizados (lista blanca)
- **AspNetRoles**: Roles (Admin, Reader)
- **AspNetUserRoles**: Asignación de roles a usuarios

#### ApplicationUser (Extensión de IdentityUser)

```csharp
public class ApplicationUser : IdentityUser
{
    public string? DomainUser { get; set; }     // ej: TB03260
    public string? DisplayName { get; set; }    // ej: Juan Pérez
    public bool IsActive { get; set; }          // true/false
    public DateTime CreatedAt { get; set; }     // Fecha de creación
}
```

## 🔒 Seguridad

### Capas de Seguridad

1. **Autenticación (Authentication)**
   - JWT Bearer Tokens
   - Tokens firmados con clave secreta (HMAC-SHA256)
   - Expiración configurable (default: 8 horas)

2. **Autorización (Authorization)**
   - **WhitelistOnly**: Solo usuarios creados explícitamente
   - **AdminOnly**: Solo usuarios con rol Admin

3. **Lista Blanca**
   - No hay registro público
   - Solo admin puede crear usuarios
   - Usuario TB03260 es admin permanente (no eliminable)

4. **SQL Injection Protection**
   - Entity Framework Core con queries parametrizadas
   - Sin SQL dinámico

5. **CORS**
   - Solo orígenes permitidos pueden acceder
   - Configurado explícitamente en backend

### Roles y Permisos

| Endpoint | WhitelistOnly | AdminOnly |
|----------|---------------|-----------|
| POST /api/auth/login | ❌ Público | ❌ |
| GET /api/jobs | ✅ | ❌ |
| GET /api/jobs/summary | ✅ | ❌ |
| GET /api/jobs/failed | ✅ | ❌ |
| GET /api/auth/users | ✅ | ✅ |
| POST /api/auth/users | ✅ | ✅ |
| PUT /api/auth/users/{id} | ✅ | ✅ |
| DELETE /api/auth/users/{id} | ✅ | ✅ |

## 🚀 Despliegue en Producción

### Opción 1: Servicios de Windows (Recomendado)

```
┌────────────────────────────────────────────┐
│         Windows Server 2019+               │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │   Servicio: SQLGuardObservatoryAPI    │ │
│  │   Tipo: Windows Service (NSSM)       │ │
│  │   Puerto: 5000                        │ │
│  │   Inicio: Automático                  │ │
│  │   Usuario: LocalSystem o ServiceAcct  │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │  Servicio: SQLGuardObservatoryFrontend│ │
│  │  Tipo: Windows Service (NSSM)        │ │
│  │  Puerto: 3000                         │ │
│  │  Inicio: Automático                   │ │
│  │  Comando: http-server                 │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  Firewall:                                │
│  - Puerto 5000 (API) ✅                   │
│  - Puerto 3000 (Frontend) ✅              │
└────────────────────────────────────────────┘
```

**Scripts automatizados:**
- `deploy-backend.ps1`
- `deploy-frontend.ps1`

### Opción 2: IIS + Servicio Windows

```
┌────────────────────────────────────────────┐
│         Windows Server 2019+               │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │   Servicio: SQLGuardObservatoryAPI    │ │
│  │   Tipo: Windows Service               │ │
│  │   Puerto: 5000                        │ │
│  └──────────────────────────────────────┘ │
│                                            │
│  ┌──────────────────────────────────────┐ │
│  │   IIS Sitio Web                       │ │
│  │   Ruta: dist/ (compilado)             │ │
│  │   Puerto: 80 o 443 (HTTPS)            │ │
│  └──────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

## 📦 Estructura de Directorios en Producción

```
C:\Apps\SQLGuardObservatory\
│
├── Backend\
│   ├── SQLGuardObservatory.API.exe
│   ├── appsettings.json
│   ├── appsettings.Production.json
│   ├── *.dll
│   └── logs\
│       ├── output.log
│       └── error.log
│
└── Frontend\
    ├── index.html
    ├── assets\
    │   ├── index-[hash].js
    │   └── index-[hash].css
    └── logs\
        ├── output.log
        └── error.log
```

## 🔄 Ciclo de Vida de la Aplicación

### Startup (Backend)

1. Cargar configuración (`appsettings.json`)
2. Configurar servicios (DI Container)
3. Configurar DbContexts
4. Configurar Identity
5. Configurar JWT Authentication
6. Configurar CORS
7. Inicializar base de datos (crear si no existe)
8. Crear usuario admin por defecto (TB03260)
9. Iniciar Kestrel web server
10. Escuchar en puerto 5000

### Startup (Frontend)

1. Cargar `index.html`
2. Cargar archivos JS/CSS compilados
3. Inicializar React
4. Inicializar React Router
5. Verificar token en localStorage
6. Renderizar componente inicial

### Request Lifecycle

```
Request → Middleware → Authentication → Authorization → Controller → Service → DbContext → Database
                                                                                              │
Response ← JSON Serialization ← DTO Mapping ←─────────────────────────────────────────────┘
```

## 🧪 Testing

### Backend

```powershell
# Unit tests
dotnet test

# Integration tests
dotnet test --filter Category=Integration
```

### Frontend

```powershell
# Unit tests
npm run test

# E2E tests
npm run test:e2e
```

## 📊 Monitoreo y Logs

### Backend Logs

```
C:\Apps\SQLGuardObservatory\Backend\logs\
├── output.log    # Stdout
└── error.log     # Stderr
```

### Frontend Logs

```
C:\Apps\SQLGuardObservatory\Frontend\logs\
├── output.log    # Stdout (http-server)
└── error.log     # Stderr
```

### Eventos de Windows

Los servicios registran eventos en el Event Viewer:
- **Aplicación → SQLGuardObservatoryAPI**
- **Aplicación → SQLGuardObservatoryFrontend**

## 🔧 Configuración de Producción

### Backend: appsettings.Production.json

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SSPR17MON-01;Database=SQLNova;Integrated Security=true;TrustServerCertificate=true;",
    "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;Integrated Security=true;TrustServerCertificate=true;"
  },
  "JwtSettings": {
    "SecretKey": "[GENERAR_CLAVE_SEGURA_32_CARACTERES]",
    "Issuer": "SQLGuardObservatory",
    "Audience": "SQLGuardObservatoryUsers",
    "ExpirationMinutes": 480
  },
  "Logging": {
    "LogLevel": {
      "Default": "Warning",
      "Microsoft.AspNetCore": "Warning"
    }
  }
}
```

### Frontend: .env.production

```env
VITE_API_URL=http://[servidor]:5000
```

## 🔐 Consideraciones de Seguridad para Producción

1. **HTTPS obligatorio**
   - Configurar certificados SSL/TLS
   - Redirigir HTTP → HTTPS

2. **Secrets Management**
   - No hardcodear credenciales
   - Usar Azure Key Vault, AWS Secrets Manager, o similar
   - O usar Windows Credential Manager

3. **SQL Server**
   - Usar cuenta de servicio con mínimos permisos
   - Solo lectura en SQLNova
   - R/W en SQLGuardObservatoryAuth

4. **Firewall**
   - Restringir acceso a IPs corporativas
   - Bloquear acceso externo

5. **Rate Limiting**
   - Implementar para prevenir ataques de fuerza bruta
   - Especialmente en endpoint de login

6. **Audit Logging**
   - Registrar todos los logins
   - Registrar cambios en usuarios

## 📈 Performance

### Backend

- **Entity Framework Core**: Queries compiladas y cacheadas
- **Connection Pooling**: Habilitado por defecto
- **Async/Await**: Todas las operaciones I/O son asíncronas

### Frontend

- **Code Splitting**: Vite hace bundle splitting automático
- **Lazy Loading**: Componentes cargados bajo demanda
- **Caching**: localStorage para tokens

### Base de Datos

```sql
-- Índices recomendados en InventarioJobsSnapshot
CREATE INDEX IX_JobStart ON InventarioJobsSnapshot(JobStart DESC);
CREATE INDEX IX_JobStatus ON InventarioJobsSnapshot(JobStatus);
CREATE INDEX IX_Ambiente_Hosting ON InventarioJobsSnapshot(Ambiente, Hosting);
```

## 🔄 Actualización de Versiones

Ver `DEPLOYMENT.md` sección "Actualización de la Aplicación" para procedimientos detallados.

---

**Versión**: 1.0  
**Última actualización**: Octubre 2024

