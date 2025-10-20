# SQL Guard Observatory - Backend API

Backend API desarrollado en .NET 8 para SQL Guard Observatory, un sistema de monitoreo de SQL Server.

## 🚀 Inicio Rápido

```bash
dotnet restore
dotnet run
```

Ver `QUICKSTART.md` en el directorio raíz para instrucciones completas.

## 📚 Documentación

- **Guía de Inicio Rápido**: `../QUICKSTART.md`
- **Guía de Despliegue**: `../DEPLOYMENT.md`
- **Arquitectura**: `../ARQUITECTURA.md`
- **Documentación de API**: `../README.backend.md`

## 🔌 Endpoints

### Autenticación
- `POST /api/auth/login` - Login de usuario
- `GET /api/auth/users` - Listar usuarios (Admin)
- `POST /api/auth/users` - Crear usuario (Admin)
- `PUT /api/auth/users/{id}` - Actualizar usuario (Admin)
- `DELETE /api/auth/users/{id}` - Eliminar usuario (Admin)

### Jobs
- `GET /api/jobs` - Listar jobs
- `GET /api/jobs/summary` - KPIs de jobs
- `GET /api/jobs/failed` - Jobs fallidos

## 🔐 Autenticación

La API usa JWT Bearer tokens. Incluir en headers:

```
Authorization: Bearer {token}
```

## ⚙️ Configuración

Editar `appsettings.json`:

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SSPR17MON-01;Database=SQLNova;...",
    "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;..."
  },
  "JwtSettings": {
    "SecretKey": "TU_CLAVE_SECRETA_AQUI"
  }
}
```

## 🏗️ Estructura

```
SQLGuardObservatory.API/
├── Controllers/      # API Controllers
├── Services/        # Business Logic
├── Data/            # DbContexts
├── Models/          # Entity Models
├── DTOs/            # Data Transfer Objects
└── Program.cs       # App Configuration
```

## 📦 Tecnologías

- .NET 8
- Entity Framework Core 8
- Identity Framework
- JWT Authentication
- SQL Server

## 🐛 Troubleshooting

Ver `../DEPLOYMENT.md` sección "Troubleshooting".

---

Para más información, ver la documentación completa en el directorio raíz.

