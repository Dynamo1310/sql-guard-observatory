# 🚀 Guía Rápida de Inicio - SQL Guard Observatory

Esta guía te ayudará a tener la aplicación corriendo en **menos de 10 minutos**.

## ✅ Pre-requisitos

Antes de comenzar, asegúrate de tener instalado:

1. **.NET 8 SDK** - [Descargar](https://dotnet.microsoft.com/download/dotnet/8.0)
2. **Node.js 18+** - [Descargar](https://nodejs.org/)
3. **SQL Server** con acceso a `SSPR17MON-01`

## 🎯 Paso 1: Verificar Requisitos

```powershell
# Verificar .NET 8
dotnet --version
# Debe mostrar: 8.x.x

# Verificar Node.js
node --version
# Debe mostrar: v18.x.x o superior

# Verificar npm
npm --version
```

## 🔨 Paso 2: Configurar el Backend

### 2.1 Navegar al directorio del backend

```powershell
cd SQLGuardObservatory.API
```

### 2.2 Verificar la configuración

Abrir `appsettings.json` y revisar:

```json
{
  "ConnectionStrings": {
    "SQLNova": "Server=SSPR17MON-01;Database=SQLNova;Integrated Security=true;TrustServerCertificate=true;",
    "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;Integrated Security=true;TrustServerCertificate=true;"
  }
}
```

### 2.3 Restaurar paquetes y ejecutar

```powershell
# Restaurar paquetes NuGet
dotnet restore

# Ejecutar el backend
dotnet run
```

✅ El backend estará corriendo en: `http://localhost:5000`

💡 Puedes verificar en: `http://localhost:5000/swagger`

## 🎨 Paso 3: Configurar el Frontend

### 3.1 Abrir una nueva terminal y navegar al directorio raíz

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
```

### 3.2 Instalar dependencias

```powershell
npm install
```

### 3.3 Ejecutar el frontend

```powershell
npm run dev
```

✅ El frontend estará corriendo en: `http://localhost:5173`

## 🎉 Paso 4: Acceder a la Aplicación

1. Abrir navegador en: `http://localhost:5173`
2. Usar las credenciales por defecto:
   - **Usuario**: `TB03260`
   - **Contraseña**: `Admin123!`

⚠️ **IMPORTANTE**: Cambiar la contraseña después del primer login!

## 🔍 Verificación Rápida

### Verificar que el Backend funciona

```powershell
# Probar el endpoint de jobs
curl http://localhost:5000/api/jobs/summary
```

### Verificar que el Frontend funciona

Abrir `http://localhost:5173` en el navegador. Deberías ver la página de login.

## 🐛 Problemas Comunes

### ❌ Error: "Unable to connect to SQL Server"

**Solución**: Verificar que:
1. SQL Server está corriendo
2. Tienes acceso a la instancia `SSPR17MON-01`
3. La base de datos `SQLNova` existe

```sql
-- Probar conexión
sqlcmd -S SSPR17MON-01 -Q "SELECT @@VERSION"
```

### ❌ Error: "Port 5000 is already in use"

**Solución**: Cambiar el puerto en `launchSettings.json` o detener el proceso que usa el puerto:

```powershell
# Ver qué proceso usa el puerto 5000
netstat -ano | findstr :5000

# Matar el proceso (reemplazar PID)
taskkill /PID [PID] /F
```

### ❌ Error: "CORS policy blocked"

**Solución**: Verificar que el frontend esté configurado en el CORS del backend en `Program.cs`:

```csharp
policy.WithOrigins(
    "http://localhost:5173",  // <-- Este debe estar presente
    // ...
)
```

### ❌ Frontend no carga datos

**Solución**: Verificar que el archivo `.env.development` tenga la URL correcta:

```env
VITE_API_URL=http://localhost:5000
```

Si cambias el archivo `.env`, reiniciar el servidor de desarrollo:

```powershell
# Detener con Ctrl+C
# Volver a iniciar
npm run dev
```

## 📚 Siguientes Pasos

### Desarrollo

- Backend: Ver `README.backend.md`
- Frontend: Ver `README.md`
- API Docs: `http://localhost:5000/swagger`

### Despliegue en Producción

- Ver `DEPLOYMENT.md` para instrucciones completas
- Usar scripts automatizados: `deploy-backend.ps1` y `deploy-frontend.ps1`

### Administración de Usuarios

1. Login con TB03260
2. Ir a "Administración de Usuarios"
3. Agregar nuevos usuarios a la lista blanca

## 🎯 Resumen de Comandos

```powershell
# ============ BACKEND ============
cd SQLGuardObservatory.API
dotnet restore
dotnet run
# Acceder: http://localhost:5000/swagger

# ============ FRONTEND ============
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
npm install
npm run dev
# Acceder: http://localhost:5173

# ============ LOGIN ============
# Usuario: TB03260
# Contraseña: Admin123!
```

## 💡 Tips

1. **Mantener ambas terminales abiertas**: Una para backend, otra para frontend
2. **Hot Reload**: Ambos tienen hot reload activado, los cambios se reflejan automáticamente
3. **Logs**: Revisar las consolas para ver logs en tiempo real
4. **DevTools**: F12 en el navegador para ver errores del frontend

## 📞 ¿Necesitas Ayuda?

- **Backend no inicia**: Revisar logs en la consola
- **Frontend no conecta**: Verificar que backend esté corriendo en puerto 5000
- **Error de autenticación**: Verificar credenciales y que la BD de auth se haya creado

---

¡Listo! Ahora deberías tener la aplicación corriendo localmente. Para despliegue en producción, continúa con `DEPLOYMENT.md`.

