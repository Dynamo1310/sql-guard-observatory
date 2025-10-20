# SQL Guard Observatory - Backend API

## 🚀 Inicio Rápido

### Requisitos

- .NET 8 SDK
- SQL Server con acceso a `SSPR17MON-01`
- Base de datos `SQLNova` con la tabla `InventarioJobsSnapshot`

### Desarrollo Local

```bash
cd SQLGuardObservatory.API
dotnet restore
dotnet run
```

La API estará disponible en: `http://localhost:5000`
Swagger UI: `http://localhost:5000/swagger`

## 📁 Estructura del Proyecto

```
SQLGuardObservatory.API/
├── Controllers/          # Controladores de la API
│   ├── AuthController.cs    # Autenticación y gestión de usuarios
│   └── JobsController.cs    # Endpoints de jobs
├── Data/                # Contextos de base de datos
│   ├── ApplicationDbContext.cs  # Identity y usuarios
│   ├── SQLNovaDbContext.cs      # Datos de monitoreo
│   └── DbInitializer.cs         # Inicialización de BD
├── DTOs/                # Data Transfer Objects
│   ├── AuthDto.cs
│   └── JobDto.cs
├── Models/              # Modelos de datos
│   ├── ApplicationUser.cs
│   └── InventarioJobsSnapshot.cs
├── Services/            # Lógica de negocio
│   ├── AuthService.cs
│   └── JobsService.cs
├── Program.cs           # Configuración principal
└── appsettings.json     # Configuración

## 🔌 Endpoints Disponibles

### Autenticación

#### POST `/api/auth/login`
Login de usuario

**Request:**
```json
{
  "username": "TB03260",
  "password": "Admin123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "domainUser": "TB03260",
  "displayName": "Administrador Principal",
  "allowed": true,
  "roles": ["Admin"]
}
```

### Gestión de Usuarios (Solo Admin)

#### GET `/api/auth/users`
Lista todos los usuarios

#### GET `/api/auth/users/{userId}`
Obtiene un usuario por ID

#### POST `/api/auth/users`
Crea un nuevo usuario

**Request:**
```json
{
  "domainUser": "TB12345",
  "displayName": "Juan Pérez",
  "password": "Password123!",
  "role": "Reader"
}
```

#### PUT `/api/auth/users/{userId}`
Actualiza un usuario

#### DELETE `/api/auth/users/{userId}`
Elimina un usuario (no permite eliminar al admin principal)

### Jobs

#### GET `/api/jobs`
Lista de jobs con filtros opcionales

**Query Parameters:**
- `ambiente` (opcional): Prod, UAT, Dev
- `hosting` (opcional): OnPrem, AWS

#### GET `/api/jobs/summary`
Resumen de KPIs de jobs

**Response:**
```json
{
  "okPct": 97.5,
  "fails24h": 3,
  "avgDurationSec": 245.6,
  "p95Sec": 480,
  "lastCapture": "2024-10-20T10:30:00Z"
}
```

#### GET `/api/jobs/failed`
Lista de jobs fallidos recientes

**Query Parameters:**
- `limit` (opcional, default: 5): Número de resultados

## 🔐 Autenticación

La API usa JWT Bearer tokens. Incluir el token en el header:

```
Authorization: Bearer {token}
```

### Políticas de Autorización

- **WhitelistOnly**: Usuario autenticado (cualquier rol)
- **AdminOnly**: Solo usuarios con rol Admin

## ⚙️ Configuración

### appsettings.json

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SSPR17MON-01;Database=SQLNova;Integrated Security=true;TrustServerCertificate=true;",
    "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;Integrated Security=true;TrustServerCertificate=true;"
  },
  "JwtSettings": {
    "SecretKey": "CLAVE_SECRETA_AQUI",
    "Issuer": "SQLGuardObservatory",
    "Audience": "SQLGuardObservatoryUsers",
    "ExpirationMinutes": 480
  },
  "DefaultAdminUser": "TB03260"
}
```

## 🗄️ Base de Datos

### SQLNova (Solo Lectura)

Tabla principal: `InventarioJobsSnapshot`

```sql
SELECT TOP (1000) 
    [Id],
    [InstanceName],
    [Ambiente],
    [Hosting],
    [JobName],
    [JobStart],
    [JobEnd],
    [JobDurationSeconds],
    [JobStatus],
    [CaptureDate],
    [InsertedAtUtc]
FROM [SQLNova].[dbo].[InventarioJobsSnapshot]
```

### SQLGuardObservatoryAuth (Lectura/Escritura)

Base de datos de Identity creada automáticamente con las tablas:
- AspNetUsers
- AspNetRoles
- AspNetUserRoles
- etc.

## 🛡️ Seguridad

### Lista Blanca

Solo los usuarios creados explícitamente en el sistema pueden acceder. No hay registro público.

### Usuario Admin por Defecto

- **Usuario**: TB03260
- **Contraseña inicial**: Admin123!
- **Rol**: Admin
- **Protección**: No puede ser eliminado

⚠️ **IMPORTANTE**: Cambiar la contraseña del admin después de la primera instalación.

### Configuración JWT

Para producción, generar una clave segura:

```powershell
# Generar clave aleatoria de 32 bytes
$key = [System.Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
Write-Host $key
```

## 🚀 Despliegue

Ver `DEPLOYMENT.md` para instrucciones completas de despliegue como servicio de Windows.

### Compilar para Producción

```bash
dotnet publish -c Release -o ./publish
```

### Ejecutar como Servicio

```powershell
.\deploy-backend.ps1
```

## 📝 Logs

Los logs se guardan en:
- Desarrollo: Consola
- Producción (como servicio): `C:\Apps\SQLGuardObservatory\Backend\logs\`

## 🧪 Testing

```bash
# Restaurar dependencias
dotnet restore

# Ejecutar tests (cuando se añadan)
dotnet test
```

## 📦 Paquetes NuGet Utilizados

- Microsoft.AspNetCore.Identity.EntityFrameworkCore 8.0.10
- Microsoft.EntityFrameworkCore.SqlServer 8.0.10
- Microsoft.AspNetCore.Authentication.JwtBearer 8.0.10
- Microsoft.Extensions.Hosting.WindowsServices 8.0.1
- Swashbuckle.AspNetCore 6.5.0

## 🐛 Troubleshooting

### Error de conexión a SQL Server

Verificar:
1. Servicio SQL Server corriendo
2. Cadena de conexión correcta
3. Permisos del usuario
4. `TrustServerCertificate=true` en la cadena

### Token JWT inválido

Verificar:
1. SecretKey correcta en ambos lados
2. Token no expirado
3. Issuer y Audience correctos

### Servicio no inicia

Ver logs en: `C:\Apps\SQLGuardObservatory\Backend\logs\error.log`

```powershell
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 50
```

