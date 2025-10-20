# Guía de Despliegue - SQL Guard Observatory

## 📋 Tabla de Contenidos

1. [Requisitos Previos](#requisitos-previos)
2. [Configuración del Backend](#configuración-del-backend)
3. [Configuración del Frontend](#configuración-del-frontend)
4. [Despliegue como Servicios de Windows](#despliegue-como-servicios-de-windows)
5. [Configuración de Seguridad](#configuración-de-seguridad)
6. [Verificación del Despliegue](#verificación-del-despliegue)

## 🔧 Requisitos Previos

### Software Necesario

- **Windows Server** (2019 o superior)
- **.NET 8 SDK y Runtime** - [Descargar aquí](https://dotnet.microsoft.com/download/dotnet/8.0)
- **Node.js 18+** - [Descargar aquí](https://nodejs.org/)
- **SQL Server** con acceso a la instancia `SSPR17MON-01`
- **NSSM (Non-Sucking Service Manager)** - [Descargar aquí](https://nssm.cc/download)

### Permisos Requeridos

- Acceso de lectura a la base de datos `SQLNova`
- Permisos para crear servicios de Windows
- Permisos para crear base de datos `SQLGuardObservatoryAuth` (para Identity)

## 🔨 Configuración del Backend

### 1. Compilar el Backend

```powershell
# Navegar al directorio del backend
cd SQLGuardObservatory.API

# Publicar el proyecto en modo Release
dotnet publish -c Release -o C:\Apps\SQLGuardObservatory\Backend
```

### 2. Configurar la Cadena de Conexión

Editar el archivo `C:\Apps\SQLGuardObservatory\Backend\appsettings.json`:

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SSPR17MON-01;Database=SQLNova;Integrated Security=true;TrustServerCertificate=true;",
    "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;Integrated Security=true;TrustServerCertificate=true;"
  },
  "JwtSettings": {
    "SecretKey": "CAMBIAR_ESTA_CLAVE_POR_UNA_MUY_SEGURA_DE_AL_MENOS_32_CARACTERES",
    "Issuer": "SQLGuardObservatory",
    "Audience": "SQLGuardObservatoryUsers",
    "ExpirationMinutes": 480
  }
}
```

### 3. Crear la Base de Datos de Autenticación

El backend creará automáticamente la base de datos `SQLGuardObservatoryAuth` en el primer arranque, pero puedes crearla manualmente:

```sql
-- Conectar a SQL Server
USE master;
GO

-- Crear la base de datos
CREATE DATABASE SQLGuardObservatoryAuth;
GO
```

### 4. Verificar el Usuario Admin por Defecto

Al iniciar por primera vez, el sistema creará automáticamente el usuario `TB03260` con:
- **Usuario**: TB03260
- **Contraseña**: Admin123! (⚠️ **CAMBIAR INMEDIATAMENTE**)
- **Rol**: Admin

## 🎨 Configuración del Frontend

### 1. Compilar el Frontend

```powershell
# Navegar al directorio del frontend
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Instalar dependencias
npm install

# Compilar para producción
npm run build

# Copiar los archivos compilados
xcopy /E /I dist C:\Apps\SQLGuardObservatory\Frontend
```

### 2. Configurar la URL del Backend

Crear un archivo `.env.production` en el frontend antes de compilar:

```env
VITE_API_URL=http://localhost:5000
```

O bien, puedes configurar un servidor web (IIS o similar) para servir el frontend.

### 3. Servir el Frontend con Node.js

Instalar un servidor HTTP simple:

```powershell
npm install -g http-server
```

## 🚀 Despliegue como Servicios de Windows

### Opción 1: Usar NSSM (Recomendado)

#### Instalar el Backend como Servicio

1. Descargar e instalar NSSM desde https://nssm.cc/download
2. Ejecutar como administrador:

```powershell
# Instalar el servicio del backend
nssm install SQLGuardObservatoryAPI "C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.exe"

# Configurar el directorio de trabajo
nssm set SQLGuardObservatoryAPI AppDirectory "C:\Apps\SQLGuardObservatory\Backend"

# Configurar el usuario del servicio (importante para acceso a SQL Server)
nssm set SQLGuardObservatoryAPI ObjectName ".\ServiceAccount" "Password123"
# O usar LocalSystem si tienes permisos configurados:
nssm set SQLGuardObservatoryAPI ObjectName "LocalSystem"

# Configurar para iniciar automáticamente
nssm set SQLGuardObservatoryAPI Start SERVICE_AUTO_START

# Iniciar el servicio
nssm start SQLGuardObservatoryAPI
```

#### Instalar el Frontend como Servicio

```powershell
# Instalar el servicio del frontend
nssm install SQLGuardObservatoryFrontend "C:\Program Files\nodejs\node.exe"

# Configurar los parámetros (http-server)
nssm set SQLGuardObservatoryFrontend AppParameters "C:\Program Files\nodejs\node_modules\http-server\bin\http-server C:\Apps\SQLGuardObservatory\Frontend -p 3000"

# Configurar el directorio de trabajo
nssm set SQLGuardObservatoryFrontend AppDirectory "C:\Apps\SQLGuardObservatory\Frontend"

# Configurar para iniciar automáticamente
nssm set SQLGuardObservatoryFrontend Start SERVICE_AUTO_START

# Iniciar el servicio
nssm start SQLGuardObservatoryFrontend
```

### Opción 2: Usar Scripts PowerShell con NSSM

He creado scripts automatizados para facilitar el despliegue. Ver archivos:
- `deploy-backend.ps1`
- `deploy-frontend.ps1`

### Opción 3: Usar IIS para el Frontend (Alternativa)

Si prefieres usar IIS para el frontend:

1. Instalar IIS con soporte para aplicaciones estáticas
2. Crear un nuevo sitio web apuntando a `C:\Apps\SQLGuardObservatory\Frontend`
3. Configurar el puerto (ej: 3000)
4. Agregar un archivo `web.config` para reescritura de URLs (SPA)

```xml
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="React Routes" stopProcessing="true">
          <match url=".*" />
          <conditions logicalGrouping="MatchAll">
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
            <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
          </conditions>
          <action type="Rewrite" url="/" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

## 🛡️ Configuración de Seguridad

### 1. HTTPS (Producción)

Para producción, se recomienda configurar HTTPS:

#### Backend con Certificado

```powershell
# Generar certificado de desarrollo (solo para pruebas)
dotnet dev-certs https --trust

# Para producción, usar un certificado válido
```

Modificar `Program.cs` o `appsettings.json` para configurar HTTPS:

```json
{
  "Kestrel": {
    "Endpoints": {
      "Https": {
        "Url": "https://localhost:5001",
        "Certificate": {
          "Path": "C:\\Certificates\\certificate.pfx",
          "Password": "password"
        }
      }
    }
  }
}
```

#### Frontend - Actualizar URL del API

En `.env.production`:

```env
VITE_API_URL=https://localhost:5001
```

### 2. Firewall

Abrir los puertos necesarios:

```powershell
# Abrir puerto del backend (5000)
New-NetFirewallRule -DisplayName "SQL Guard API" -Direction Inbound -LocalPort 5000 -Protocol TCP -Action Allow

# Abrir puerto del frontend (3000)
New-NetFirewallRule -DisplayName "SQL Guard Frontend" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### 3. Seguridad de SQL Server

Asegurar que la cuenta del servicio tenga los permisos mínimos necesarios:

```sql
-- Crear usuario del servicio
USE [SQLNova];
GO

CREATE USER [DOMAIN\ServiceAccount] FOR LOGIN [DOMAIN\ServiceAccount];
GO

-- Permisos de solo lectura
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\ServiceAccount];
GO

-- Para la base de datos de autenticación
USE [SQLGuardObservatoryAuth];
GO

CREATE USER [DOMAIN\ServiceAccount] FOR LOGIN [DOMAIN\ServiceAccount];
GO

-- Permisos de lectura/escritura para Identity
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\ServiceAccount];
ALTER ROLE db_datawriter ADD MEMBER [DOMAIN\ServiceAccount];
GO
```

## ✅ Verificación del Despliegue

### 1. Verificar los Servicios

```powershell
# Ver estado de los servicios
Get-Service SQLGuardObservatoryAPI
Get-Service SQLGuardObservatoryFrontend

# Ver logs del backend (si usas NSSM)
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\app.log" -Tail 50
```

### 2. Probar el Backend

```powershell
# Probar el endpoint de health (si lo añades)
Invoke-WebRequest -Uri "http://localhost:5000/api/jobs/summary"

# Probar login
$body = @{
    username = "TB03260"
    password = "Admin123!"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:5000/api/auth/login" -Method POST -Body $body -ContentType "application/json"
```

### 3. Acceder a la Aplicación

Abrir un navegador y navegar a:
- Frontend: `http://localhost:3000`
- Backend Swagger (desarrollo): `http://localhost:5000/swagger`

## 🔄 Actualización de la Aplicación

### Actualizar el Backend

```powershell
# Detener el servicio
nssm stop SQLGuardObservatoryAPI

# Compilar y copiar nuevos archivos
cd SQLGuardObservatory.API
dotnet publish -c Release -o C:\Apps\SQLGuardObservatory\Backend

# Reiniciar el servicio
nssm start SQLGuardObservatoryAPI
```

### Actualizar el Frontend

```powershell
# Detener el servicio
nssm stop SQLGuardObservatoryFrontend

# Compilar y copiar nuevos archivos
npm run build
xcopy /E /I /Y dist C:\Apps\SQLGuardObservatory\Frontend

# Reiniciar el servicio
nssm start SQLGuardObservatoryFrontend
```

## 📝 Administración de Usuarios

### Primer Login

1. Acceder con el usuario admin por defecto:
   - **Usuario**: TB03260
   - **Contraseña**: Admin123!

2. **¡IMPORTANTE!** Cambiar la contraseña inmediatamente después del primer login.

### Agregar Nuevos Usuarios

1. Ir a la sección "Administración de Usuarios" (solo admin)
2. Hacer clic en "Agregar Usuario"
3. Completar los datos:
   - **Usuario de Dominio**: ej. TB12345
   - **Nombre**: Nombre completo del usuario
   - **Contraseña**: Contraseña inicial
   - **Rol**: Admin o Reader

### Gestión de la Lista Blanca

Solo los usuarios creados en la sección de administración pueden acceder a la aplicación. Esto garantiza que solo personal autorizado tenga acceso al sistema.

## 🔍 Troubleshooting

### El servicio no inicia

```powershell
# Ver logs detallados
nssm start SQLGuardObservatoryAPI
Get-EventLog -LogName Application -Source SQLGuardObservatoryAPI -Newest 10

# Verificar que .NET 8 está instalado
dotnet --list-runtimes
```

### Error de conexión a SQL Server

- Verificar que el servicio de SQL Server está corriendo
- Verificar la cadena de conexión
- Verificar permisos del usuario/cuenta del servicio
- Verificar que `TrustServerCertificate=true` está en la cadena de conexión

### Frontend no carga datos

- Verificar que el backend está corriendo
- Verificar la URL del API en el frontend
- Verificar CORS en el backend
- Ver la consola del navegador para errores

## 📞 Soporte

Para problemas o preguntas, contactar al equipo de desarrollo.

---

**Versión**: 1.0  
**Fecha**: Octubre 2024  
**Autor**: SQL Guard Observatory Team

