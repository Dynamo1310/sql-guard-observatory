# 🔧 Arreglo Error 403 - Sección Usuarios

## 📋 Problema

Al intentar acceder a la sección "Usuarios" del sidebar, aparece el error:

```
GET http://asprbm-nov-01:5000/api/auth/users 403 (Forbidden)
error en la comunicación con el servidor
```

### Causa

La política de autorización `AdminOnly` solo permitía el rol "Admin", pero tu usuario `TB03260` tiene el rol **"SuperAdmin"**. Por lo tanto, no tenías permisos para acceder a los endpoints administrativos.

### Solución Aplicada

Se modificó el archivo `Program.cs` (línea 66) para que la política `AdminOnly` permita **tanto el rol "Admin" como "SuperAdmin"**:

```csharp
// ANTES (solo Admin)
options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin"));

// DESPUÉS (Admin y SuperAdmin)
options.AddPolicy("AdminOnly", policy => policy.RequireRole("Admin", "SuperAdmin"));
```

---

## ✅ Pasos para Aplicar el Arreglo

### Opción 1: Despliegue Completo (Recomendado)

Si estás en **tu PC de desarrollo**, ejecuta en PowerShell como **Administrador**:

```powershell
# Desde el directorio del proyecto: sql-guard-observatory
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Ejecutar el script de despliegue
.\deploy-backend.ps1
```

Este script:
1. ✅ Compila el backend con los cambios
2. ✅ Copia los archivos al servidor (C:\Apps\SQLGuardObservatory\Backend)
3. ✅ Reinicia el servicio automáticamente

### Opción 2: Actualización Manual

Si prefieres hacerlo manualmente:

#### Paso 1: Compilar en tu PC

```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Compilar el proyecto
dotnet publish SQLGuardObservatory.API -c Release -o .\Temp\Backend
```

#### Paso 2: Copiar al Servidor

Copia los archivos compilados desde tu PC al servidor:

**Desde tu PC:**
```powershell
# Copiar archivos compilados a una ubicación temporal en el servidor
# (Ajusta la ruta según tu red/VPN)
robocopy .\Temp\Backend \\ASPRBM-NOV-01\C$\Temp\SQLGuardObservatory /MIR
```

**En el servidor (ASPRBM-NOV-01):**
```powershell
# Detener el servicio
Stop-Service -Name "SQLGuardObservatory.API"

# Reemplazar archivos
Copy-Item -Path C:\Temp\SQLGuardObservatory\* -Destination C:\Apps\SQLGuardObservatory\Backend -Recurse -Force

# Iniciar el servicio
Start-Service -Name "SQLGuardObservatory.API"
```

### Opción 3: Solo el Archivo DLL (Más Rápido)

Si solo quieres actualizar el archivo compilado sin todo el despliegue:

#### En tu PC:
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API

# Compilar solo el DLL
dotnet build -c Release
```

Luego copia **solo** el archivo `SQLGuardObservatory.API.dll` desde:
- **Origen**: `SQLGuardObservatory.API\bin\Release\net8.0\SQLGuardObservatory.API.dll`
- **Destino (en el servidor)**: `C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.dll`

#### En el servidor:
```powershell
# Detener el servicio
Stop-Service -Name "SQLGuardObservatory.API"

# Copiar el nuevo DLL (reemplaza con la ruta desde donde copies)
Copy-Item -Path "C:\Temp\SQLGuardObservatory.API.dll" -Destination "C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.dll" -Force

# Iniciar el servicio
Start-Service -Name "SQLGuardObservatory.API"
```

---

## 🔍 Verificación

Después de aplicar el arreglo:

### 1. Verificar que el servicio está corriendo

```powershell
Get-Service -Name "SQLGuardObservatory.API"
```

**Resultado esperado:**
```
Status   Name                     DisplayName
------   ----                     -----------
Running  SQLGuardObservatory.API  SQL Guard Observatory API
```

### 2. Revisar los logs (si hay algún error)

```powershell
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 50
```

### 3. Probar en el navegador

1. Ve a: `http://asprbm-nov-01:8080`
2. Inicia sesión con tu usuario `TB03260`
3. Haz clic en **"Usuarios"** en el sidebar
4. **Debería cargar la lista de usuarios sin el error 403** ✅

### 4. Verificar en las Herramientas de Desarrollo del Navegador

Abre las herramientas de desarrollo del navegador (F12) y verifica que la llamada a:
```
GET http://asprbm-nov-01:5000/api/auth/users
```

Ahora devuelve **200 OK** en lugar de 403 Forbidden.

---

## 📝 Notas Importantes

### Roles y Permisos

- **SuperAdmin**: Acceso total a todas las funcionalidades (incluyendo configuración de permisos)
- **Admin**: Acceso a gestión de usuarios y todas las vistas, excepto configuración de permisos
- **Reader**: Solo acceso a vistas de observabilidad (Overview, Jobs, Disks, Databases, Backups, Indexes)

### Endpoints Afectados

Los siguientes endpoints ahora funcionarán correctamente para usuarios con rol "SuperAdmin":

- `GET /api/auth/users` - Listar usuarios
- `GET /api/auth/users/{id}` - Obtener usuario por ID
- `POST /api/auth/users` - Crear usuario
- `PUT /api/auth/users/{id}` - Actualizar usuario
- `DELETE /api/auth/users/{id}` - Eliminar usuario

### Si Aún No Has Aplicado la Migración de RolePermissions

Si todavía tienes errores relacionados con la tabla `RolePermissions`, asegúrate de ejecutar primero:

```powershell
cd C:\Apps\SQLGuardObservatory\Backend\SQL
.\Apply-RolePermissionsMigration.ps1
```

O sigue las instrucciones en `SOLUCION_TABLA_ROLEPERMISSIONS.md`.

---

## 🆘 Troubleshooting

### Error: "El servicio no inicia después del despliegue"

```powershell
# Revisar los logs de error
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 100

# Verificar que los archivos estén completos
Test-Path "C:\Apps\SQLGuardObservatory\Backend\SQLGuardObservatory.API.exe"
Test-Path "C:\Apps\SQLGuardObservatory\Backend\appsettings.json"
```

### Error: "Sigue apareciendo 403"

1. **Verifica que el servicio se reinició correctamente:**
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API" -Force
   ```

2. **Limpia la caché del navegador:**
   - Presiona `Ctrl + Shift + Delete`
   - Selecciona "Cookies y otros datos del sitio" y "Archivos e imágenes en caché"
   - Haz clic en "Borrar datos"

3. **Cierra sesión y vuelve a iniciar sesión:**
   - Esto generará un nuevo token JWT con los roles actualizados

### Error: "No se puede conectar con el servidor SQL"

Verifica la cadena de conexión en `appsettings.json`:

```json
"ConnectionStrings": {
  "ApplicationDb": "Server=SSPR17MON-01;Database=SQLGuardObservatoryAuth;User Id=ScriptExec;Password=susana.9;TrustServerCertificate=true;"
}
```

---

## ⏱️ Tiempo Estimado

- **Opción 1 (Despliegue completo)**: ~5 minutos
- **Opción 2 (Manual)**: ~10 minutos
- **Opción 3 (Solo DLL)**: ~3 minutos

---

**Última actualización**: 20 de octubre de 2025

**Archivo modificado**: `SQLGuardObservatory.API/Program.cs` (línea 66)

