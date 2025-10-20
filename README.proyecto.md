# 🛡️ SQL Guard Observatory

Sistema de monitoreo y observabilidad para infraestructura SQL Server empresarial.

![Stack](https://img.shields.io/badge/.NET-8.0-512BD4?logo=dotnet)
![Stack](https://img.shields.io/badge/React-18-61DAFB?logo=react)
![Stack](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Stack](https://img.shields.io/badge/SQL_Server-2019+-CC2927?logo=microsoft-sql-server)

## 📋 Descripción

SQL Guard Observatory es una aplicación web fullstack para monitorear y administrar múltiples instancias de SQL Server desde un único panel de control centralizado. Proporciona visibilidad en tiempo real sobre:

- 🔄 **SQL Agent Jobs** - Estado, ejecución y rendimiento
- 💾 **Bases de Datos** - Tamaño, crecimiento y estadísticas
- 🗄️ **Backups** - Cumplimiento de RPO/RTO
- 📊 **Espacio en Disco** - Alertas de capacidad
- 🔍 **Índices** - Fragmentación y recomendaciones

## 🏗️ Arquitectura

### Frontend
- **React 18** con TypeScript
- **Vite** para build y desarrollo
- **shadcn/ui** + **Tailwind CSS** para UI
- **React Router** para navegación

### Backend
- **.NET 8** Web API
- **Entity Framework Core 8**
- **Identity Framework** para autenticación
- **JWT Bearer** para autorización
- **Swagger/OpenAPI** para documentación

### Base de Datos
- **SQL Server** (2019+)
- Arquitectura de doble BD:
  - `SQLNova` - Datos de monitoreo (solo lectura)
  - `SQLGuardObservatoryAuth` - Usuarios y autenticación (R/W)

## 🚀 Inicio Rápido

### Pre-requisitos

- .NET 8 SDK - [Descargar](https://dotnet.microsoft.com/download/dotnet/8.0)
- Node.js 18+ - [Descargar](https://nodejs.org/)
- SQL Server con acceso a instancia de monitoreo

### Desarrollo Local

#### 1. Backend

```bash
cd SQLGuardObservatory.API
dotnet restore
dotnet run
```

El backend estará en: http://localhost:5000

#### 2. Frontend

```bash
npm install
npm run dev
```

El frontend estará en: http://localhost:5173

#### 3. Login

- **Usuario**: TB03260
- **Contraseña**: Admin123!

### Despliegue en Producción

#### Opción 1: Script Todo-en-Uno

```powershell
# Como administrador
.\install-all.ps1
```

#### Opción 2: Scripts Individuales

```powershell
# Backend
.\deploy-backend.ps1

# Frontend
.\deploy-frontend.ps1
```

Ver **[DEPLOYMENT.md](DEPLOYMENT.md)** para guía completa de despliegue.

## 📚 Documentación

| Documento | Descripción |
|-----------|-------------|
| [QUICKSTART.md](QUICKSTART.md) | Guía rápida para empezar en 10 minutos |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Guía completa de despliegue en producción |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Detalles técnicos de la arquitectura |
| [README.backend.md](README.backend.md) | Documentación del API Backend |
| [RESUMEN_COMPLETO.md](RESUMEN_COMPLETO.md) | Resumen ejecutivo del proyecto |

## 📂 Estructura del Proyecto

```
sql-guard-observatory/
├── SQLGuardObservatory.API/      # Backend .NET 8
│   ├── Controllers/               # API Controllers
│   ├── Services/                  # Lógica de negocio
│   ├── Data/                      # DbContexts
│   ├── Models/                    # Entidades
│   └── DTOs/                      # Data Transfer Objects
│
├── src/                           # Frontend React
│   ├── pages/                     # Páginas de la app
│   ├── components/                # Componentes reutilizables
│   ├── services/                  # Cliente API
│   └── contexts/                  # Contextos de React
│
├── deploy-backend.ps1             # Script de despliegue backend
├── deploy-frontend.ps1            # Script de despliegue frontend
└── install-all.ps1                # Script de instalación completa
```

## 🔌 API Endpoints

### Autenticación

```
POST   /api/auth/login              # Login de usuario
GET    /api/auth/users              # Listar usuarios (Admin)
POST   /api/auth/users              # Crear usuario (Admin)
PUT    /api/auth/users/{id}         # Actualizar usuario (Admin)
DELETE /api/auth/users/{id}         # Eliminar usuario (Admin)
```

### Jobs

```
GET    /api/jobs                    # Lista de jobs
GET    /api/jobs/summary            # KPIs de jobs
GET    /api/jobs/failed             # Jobs fallidos recientes
```

Ver [Swagger UI](http://localhost:5000/swagger) cuando el backend esté corriendo.

## 🔐 Autenticación y Seguridad

### Lista Blanca de Usuarios

- ✅ **No hay registro público** - Solo admin puede crear usuarios
- ✅ **Usuario admin por defecto**: TB03260 (no eliminable)
- ✅ **Roles**: Admin, Reader
- ✅ **JWT Tokens** con expiración configurable

### Seguridad Implementada

- JWT Bearer Authentication
- Autorización basada en roles
- SQL Injection protection (EF Core)
- CORS configurado
- Validación de entrada

## 🛠️ Tecnologías

### Backend

- .NET 8.0
- ASP.NET Core Web API
- Entity Framework Core 8
- Identity Framework
- JWT Bearer Authentication
- Swashbuckle (Swagger)
- SQL Server

### Frontend

- React 18
- TypeScript 5
- Vite
- React Router DOM
- shadcn/ui
- Tailwind CSS
- Lucide Icons

## 📊 Características

### Panel de Control (Overview)

- KPIs en tiempo real
- Jobs fallidos recientes
- Bases de datos más grandes
- Backups atrasados
- Alertas de espacio en disco

### Gestión de Jobs

- Estado de ejecución de SQL Agent Jobs
- Historial de ejecuciones
- Duración y estadísticas
- Filtros por ambiente y hosting

### Administración de Usuarios

- Gestión de lista blanca
- Asignación de roles
- Activación/desactivación de usuarios
- Auditoría de accesos

## 🔄 Despliegue como Servicios de Windows

La aplicación puede ejecutarse como servicios de Windows que inician automáticamente:

- **SQLGuardObservatoryAPI** - Servicio del backend
- **SQLGuardObservatoryFrontend** - Servicio del frontend

Ver [DEPLOYMENT.md](DEPLOYMENT.md) para instrucciones detalladas.

## 🐛 Troubleshooting

### Backend no inicia

```powershell
# Verificar .NET 8
dotnet --version

# Ver logs
cd SQLGuardObservatory.API
dotnet run
```

### Frontend no conecta

```powershell
# Verificar variable de entorno
cat .env.development

# Debe contener:
# VITE_API_URL=http://localhost:5000
```

### Error de SQL Server

1. Verificar servicio SQL Server corriendo
2. Verificar permisos de acceso
3. Verificar cadena de conexión en `appsettings.json`

## 📝 Configuración

### Backend: appsettings.json

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SERVIDOR;Database=SQLNova;...",
    "ApplicationDb": "Server=SERVIDOR;Database=SQLGuardObservatoryAuth;..."
  },
  "JwtSettings": {
    "SecretKey": "CAMBIAR_POR_CLAVE_SEGURA"
  }
}
```

### Frontend: .env

```env
VITE_API_URL=http://localhost:5000
```

## 🚦 Estado del Proyecto

- ✅ Backend API completo
- ✅ Autenticación y autorización
- ✅ Gestión de usuarios
- ✅ Integración con SQL Server
- ✅ Frontend React completo
- ✅ Scripts de despliegue
- ✅ Documentación completa

## 🤝 Contribuir

Este es un proyecto empresarial interno. Para contribuir:

1. Crear rama feature desde main
2. Realizar cambios
3. Crear Pull Request
4. Code review requerido

## 📄 Licencia

Proyecto propietario - Uso interno únicamente.

## 👥 Equipo

Desarrollado por el equipo de DBA para el monitoreo de infraestructura SQL Server.

## 📞 Soporte

Para soporte técnico, contactar al equipo de DBA.

---

**Version**: 1.0.0  
**Última actualización**: Octubre 2024

