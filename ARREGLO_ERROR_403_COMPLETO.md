# 🔧 Arreglo Completo - Errores 403 (Forbidden)

## 📋 Problemas Identificados

Se encontraron **2 errores 403** relacionados con la autorización:

### Error 1: Sección "Usuarios"
```
GET http://asprbm-nov-01:5000/api/auth/users 403 (Forbidden)
```

**Causa**: La política `AdminOnly` solo permitía el rol "Admin", pero el usuario `TB03260` tiene rol "SuperAdmin".

### Error 2: Permisos del Usuario (my-permissions)
```
GET http://asprbm-nov-01:5000/api/permissions/my-permissions 403 (Forbidden)
```

**Causa**: El controlador `PermissionsController` tenía `[Authorize(Roles = "SuperAdmin")]` a nivel de clase, bloqueando el acceso al endpoint `my-permissions` para usuarios no SuperAdmin. Este endpoint debe estar disponible para **todos los usuarios autenticados** porque cada usuario necesita obtener sus propios permisos.

---

## ✅ Soluciones Aplicadas

### Solución 1: Política AdminOnly
**Archivo**: `SQLGuardObservatory.API/Program.cs` (línea 66)

```csharp
// ANTES
options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));

// DESPUÉS
options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin", "SuperAdmin"));
```

### Solución 2: PermissionsController
**Archivo**: `SQLGuardObservatory.API/Controllers/PermissionsController.cs`

**Cambios realizados:**

1. **Línea 10**: Cambiar de `[Authorize(Roles = "SuperAdmin")]` a `[Authorize]`
   - Ahora requiere autenticación para todos los endpoints, sin restricción de rol por defecto

2. **Endpoints administrativos** (líneas 26, 45, 68, 91): Agregar `[Authorize(Roles = "SuperAdmin")]` individualmente
   - `GetAllPermissions()` - Solo SuperAdmin
   - `GetRolePermissions(string role)` - Solo SuperAdmin
   - `UpdateRolePermissions(...)` - Solo SuperAdmin
   - `GetAvailableViewsAndRoles()` - Solo SuperAdmin

3. **Endpoint my-permissions** (línea 111): Hereda `[Authorize]` del controlador
   - Disponible para **todos los usuarios autenticados** (SuperAdmin, Admin, Reader)

---

## 🚀 Cómo Aplicar los Arreglos

### **Opción Más Rápida (Recomendada):**

Abre PowerShell como **Administrador** en el directorio del proyecto:

```powershell
# Compilar y desplegar automáticamente
.\DESPLEGAR_CAMBIOS.ps1
```

### **Opción Tradicional:**

```powershell
# Despliegue completo del backend
.\deploy-backend.ps1
```

### **Opción Manual (si los scripts fallan):**

#### 1. Compilar en tu PC

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Compilar el proyecto
dotnet publish SQLGuardObservatory.API -c Release -o .\Temp\Backend
```

#### 2. Copiar al Servidor

**En el servidor (ASPRBM-NOV-01)**, abre PowerShell como Administrador:

```powershell
# Detener el servicio
Stop-Service -Name "SQLGuardObservatory.API"

# Copiar archivos desde tu ubicación temporal
Copy-Item -Path "C:\Ruta\Donde\Copiaste\*" -Destination "C:\Apps\SQLGuardObservatory\Backend" -Recurse -Force

# Iniciar el servicio
Start-Service -Name "SQLGuardObservatory.API"
```

---

## 🔍 Verificación Completa

Después de desplegar, realiza estas pruebas:

### 1. Verificar el Servicio

```powershell
# Ver estado del servicio
Get-Service -Name "SQLGuardObservatory.API"

# Ver logs recientes
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 50
```

### 2. Probar con Usuario SuperAdmin (TB03260)

1. Ve a: `http://asprbm-nov-01:8080`
2. Inicia sesión con `TB03260`
3. **Test 1**: Haz clic en "Usuarios" en el sidebar
   - ✅ Debería cargar la lista de usuarios sin error 403
4. **Test 2**: Haz clic en "Permisos" en el sidebar
   - ✅ Debería cargar la configuración de permisos sin error 403
5. **Test 3**: Observa la consola del navegador (F12)
   - ✅ No deberían aparecer errores 403 en `my-permissions`

### 3. Probar con Usuario Admin o Reader

1. Inicia sesión con un usuario que tenga rol "Admin" o "Reader"
2. **Test 1**: El sidebar debería mostrar solo las vistas permitidas para ese rol
3. **Test 2**: Observa la consola del navegador (F12)
   - ✅ `GET /api/permissions/my-permissions` debería devolver **200 OK**
   - ✅ No deberían aparecer errores 403 en este endpoint

### 4. Verificar en las Herramientas de Desarrollo

Abre las herramientas de desarrollo (F12) → Pestaña "Network" → Filtra por "permissions":

**Respuestas esperadas:**

| Endpoint | Usuario | Código Esperado |
|----------|---------|-----------------|
| `GET /api/permissions/my-permissions` | Todos | **200 OK** ✅ |
| `GET /api/permissions` | SuperAdmin | **200 OK** ✅ |
| `GET /api/permissions` | Admin/Reader | **403 Forbidden** ✅ (correcto) |
| `GET /api/auth/users` | SuperAdmin | **200 OK** ✅ |
| `GET /api/auth/users` | Admin | **200 OK** ✅ |
| `GET /api/auth/users` | Reader | **403 Forbidden** ✅ (correcto) |

---

## 📊 Matriz de Permisos por Endpoint

### Endpoints de Autenticación (`/api/auth/*`)

| Endpoint | SuperAdmin | Admin | Reader |
|----------|------------|-------|--------|
| `POST /api/auth/login` | ✅ | ✅ | ✅ |
| `GET /api/auth/users` | ✅ | ✅ | ❌ |
| `POST /api/auth/users` | ✅ | ✅ | ❌ |
| `PUT /api/auth/users/{id}` | ✅ | ✅ | ❌ |
| `DELETE /api/auth/users/{id}` | ✅ | ✅ | ❌ |
| `POST /api/auth/change-password` | ✅ | ✅ | ✅ |

### Endpoints de Permisos (`/api/permissions/*`)

| Endpoint | SuperAdmin | Admin | Reader |
|----------|------------|-------|--------|
| `GET /api/permissions/my-permissions` | ✅ | ✅ | ✅ |
| `GET /api/permissions` | ✅ | ❌ | ❌ |
| `GET /api/permissions/{role}` | ✅ | ❌ | ❌ |
| `PUT /api/permissions/{role}` | ✅ | ❌ | ❌ |
| `GET /api/permissions/available` | ✅ | ❌ | ❌ |

### Endpoints de Jobs (`/api/jobs/*`)

| Endpoint | SuperAdmin | Admin | Reader |
|----------|------------|-------|--------|
| `GET /api/jobs` | ✅ | ✅ | ✅ |
| `GET /api/jobs/summary` | ✅ | ✅ | ✅ |
| `GET /api/jobs/filters` | ✅ | ✅ | ✅ |

---

## 🆘 Troubleshooting

### Problema: Sigue apareciendo error 403

**Solución 1 - Reiniciar servicio con fuerza:**
```powershell
Restart-Service -Name "SQLGuardObservatory.API" -Force
```

**Solución 2 - Limpiar caché del navegador:**
1. Presiona `Ctrl + Shift + Delete`
2. Selecciona "Cookies y otros datos del sitio" y "Archivos e imágenes en caché"
3. Haz clic en "Borrar datos"

**Solución 3 - Cerrar sesión y volver a iniciar:**
1. Haz clic en el botón de usuario (esquina superior derecha)
2. Selecciona "Cerrar Sesión"
3. Vuelve a iniciar sesión
4. Esto generará un nuevo token JWT con la configuración actualizada

**Solución 4 - Verificar que los archivos se actualizaron:**
```powershell
# Ver fecha de modificación del archivo DLL
Get-Item "C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.dll" | Select-Object Name, LastWriteTime

# Debería mostrar la fecha/hora de cuando desplegaste
```

### Problema: El servicio no inicia

```powershell
# Ver logs de error
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 100

# Verificar archivos críticos
Test-Path "C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.exe"
Test-Path "C:\Apps\SQLGuardObservatory\Backend\appsettings.json"
```

### Problema: Usuario no SuperAdmin no ve ninguna vista

Esto indica que **falta aplicar la migración de RolePermissions**. Ejecuta:

```powershell
cd C:\Apps\SQLGuardObservatory\Backend\SQL
.\Apply-RolePermissionsMigration.ps1
```

O sigue las instrucciones en `ARREGLO_RAPIDO.md`.

---

## 📝 Archivos Modificados

| Archivo | Líneas Modificadas | Descripción |
|---------|-------------------|-------------|
| `SQLGuardObservatory.API/Program.cs` | 66 | Política AdminOnly ahora incluye SuperAdmin |
| `SQLGuardObservatory.API/Controllers/PermissionsController.cs` | 10, 26, 45, 68, 91, 111 | Autorización granular por endpoint |

---

## ⏱️ Tiempo Estimado

- **Compilación**: ~2 minutos
- **Despliegue**: ~3 minutos
- **Verificación**: ~2 minutos
- **Total**: ~7 minutos

---

## ✅ Checklist de Validación

Después de aplicar los arreglos, marca cada item:

- [ ] El servicio está corriendo (`Get-Service SQLGuardObservatory.API`)
- [ ] No hay errores en los logs recientes
- [ ] Usuario SuperAdmin puede acceder a "Usuarios" (200 OK)
- [ ] Usuario SuperAdmin puede acceder a "Permisos" (200 OK)
- [ ] Todos los usuarios pueden obtener `my-permissions` (200 OK)
- [ ] Usuario Admin/Reader ve solo las vistas permitidas en el sidebar
- [ ] No aparecen errores 403 inesperados en la consola del navegador
- [ ] La tabla RolePermissions existe en la base de datos

---

**Última actualización**: 20 de octubre de 2025

**Archivos modificados**: 
- `Program.cs`
- `PermissionsController.cs`

