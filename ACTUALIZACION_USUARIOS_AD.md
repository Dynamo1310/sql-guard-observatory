# Actualización: Gestión de Usuarios y Login con Active Directory

## 🎯 Cambios Implementados

### 1. **Gestión de Usuarios (AdminUsers)**
- ✅ La sección de Usuarios ahora consume datos reales del backend
- ✅ Permite **agregar** nuevos usuarios a la lista blanca
- ✅ Permite **editar** usuarios existentes (nombre, rol, estado)
- ✅ Permite **eliminar** usuarios (excepto TB03260)
- ✅ Interfaz moderna con diálogos de confirmación

### 2. **Login con Active Directory**
- ✅ Nuevo botón "Cuenta Supervielle" en el login
- ✅ Autenticación contra Active Directory (dominio GSCORP)
- ✅ Verificación de lista blanca: **solo usuarios autorizados** pueden acceder
- ✅ El usuario debe estar en la base de datos Y tener credenciales válidas de AD

---

## 📦 Pasos para Desplegar

### Paso 1: Compilar el Backend (en tu PC)

```powershell
# En tu PC
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API

# Compilar
dotnet publish -c Release -o C:\Temp\Backend-Nueva
```

### Paso 2: Compilar el Frontend (en tu PC)

```powershell
# En tu PC
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Compilar
npm run build

# Copiar a una carpeta temporal
xcopy /E /I /Y dist\* C:\Temp\Frontend-Nueva\
```

### Paso 3: Copiar al Servidor

**Opción A: USB / Red compartida**
- Copiar `C:\Temp\Backend-Nueva` a una USB
- Copiar `C:\Temp\Frontend-Nueva` a una USB
- Llevar USB al servidor

**Opción B: Carpeta compartida de red**
```powershell
# Compartir carpetas temporales desde tu PC y acceder desde el servidor
```

---

### Paso 4: Desplegar en el Servidor

**En el servidor (PowerShell como Administrador):**

```powershell
# 1. Detener el servicio del backend
nssm stop SQLGuardObservatoryAPI

# 2. Esperar unos segundos
Start-Sleep -Seconds 3

# 3. Hacer backup del backend actual (opcional pero recomendado)
Rename-Item -Path "C:\Apps\SQLGuardObservatory\Backend" -NewName "Backend-Backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# 4. Copiar nuevo backend
xcopy /E /I /Y "RUTA_USB_O_TEMP\Backend-Nueva\*" "C:\Apps\SQLGuardObservatory\Backend\"

# 5. Iniciar el servicio
nssm start SQLGuardObservatoryAPI

# 6. Verificar que el servicio esté corriendo
nssm status SQLGuardObservatoryAPI

# 7. Hacer backup del frontend actual (opcional)
Rename-Item -Path "C:\inetpub\SQLGuardObservatory" -NewName "SQLGuardObservatory-Backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

# 8. Copiar nuevo frontend
xcopy /E /I /Y "RUTA_USB_O_TEMP\Frontend-Nueva\*" "C:\inetpub\SQLGuardObservatory\"
```

---

### Paso 5: Verificar el Despliegue

1. **Backend API:**
   - Abrir navegador: `http://localhost:5000/swagger`
   - Verificar que aparezcan los nuevos endpoints:
     - `POST /api/auth/login/ad` (nuevo)
     - `GET /api/auth/users` (existente)
     - `POST /api/auth/users` (nuevo)
     - `PUT /api/auth/users/{id}` (nuevo)
     - `DELETE /api/auth/users/{id}` (nuevo)

2. **Frontend:**
   - Abrir navegador: `http://localhost:8080`
   - Verificar que aparezcan dos botones en el login:
     - "Acceso Directo"
     - "Cuenta Supervielle"
   - Probar ambos métodos de login

3. **Gestión de Usuarios:**
   - Ir a la sección "Usuarios" en el sidebar
   - Verificar que muestre la lista de usuarios
   - Probar agregar un nuevo usuario
   - Probar editar un usuario
   - Probar eliminar un usuario (excepto TB03260)

---

## 🔧 Configuración de Active Directory

El backend ya está configurado para el dominio GSCORP. Si necesitas ajustar la configuración, edita el archivo:

**`C:\Apps\SQLGuardObservatory\Backend\appsettings.json`**

```json
{
  "ActiveDirectory": {
    "Domain": "GSCORP",
    "DomainController": "gscorp.ad",
    "LdapPath": "LDAP://gscorp.ad"
  }
}
```

**Nota:** Si cambias este archivo, debes reiniciar el servicio:
```powershell
nssm restart SQLGuardObservatoryAPI
```

---

## 🎮 Uso de la Nueva Funcionalidad

### Agregar Usuario a la Lista Blanca

1. Hacer login como administrador (TB03260)
2. Ir a **Usuarios** en el sidebar
3. Clic en **"Agregar Usuario"**
4. Completar:
   - **Usuario:** TB12345 (sin GSCORP\)
   - **Nombre Completo:** Juan Pérez
   - **Contraseña:** (contraseña inicial, si no usa AD)
   - **Rol:** Reader o Admin
5. Clic en **"Crear Usuario"**

### Login con Active Directory

1. En la pantalla de login, clic en **"Cuenta Supervielle"**
2. Ingresar:
   - **Usuario:** TB12345 (sin GSCORP\)
   - **Contraseña:** Tu contraseña de dominio
3. Clic en **"Acceder con Cuenta Supervielle"**

**Importante:** 
- El usuario **debe estar** en la lista blanca
- Las credenciales **deben ser válidas** en Active Directory
- Si alguna de las dos falla, el login será rechazado

---

## ⚠️ Notas Importantes

1. **Usuario TB03260:** No se puede eliminar (es el administrador principal)
2. **Lista Blanca:** Solo usuarios agregados en la sección "Usuarios" pueden acceder
3. **AD + Lista Blanca:** Para login con AD, el usuario debe:
   - Tener credenciales válidas en GSCORP
   - Estar en la lista blanca del sistema
4. **Roles:**
   - **Admin:** Puede gestionar usuarios y ver todo
   - **Reader:** Solo puede ver información, no puede gestionar usuarios

---

## 🐛 Troubleshooting

### "Usuario no autorizado" al usar AD
- Verificar que el usuario esté en la lista blanca
- Verificar que el usuario esté activo (columna Estado = Activo)
- Verificar que las credenciales de AD sean correctas

### Error al conectar con Active Directory
- Verificar conectividad de red con el dominio
- Revisar logs del backend: `C:\Apps\SQLGuardObservatory\Backend\logs\output.log`
- Verificar configuración en `appsettings.json`

### No puedo ver los nuevos endpoints en Swagger
- Verificar que el servicio esté corriendo: `nssm status SQLGuardObservatoryAPI`
- Limpiar caché del navegador (Ctrl + Shift + R)
- Revisar logs del servicio

---

## 📝 Resumen de Endpoints Nuevos

| Método | Ruta | Descripción | Requiere Auth |
|--------|------|-------------|---------------|
| POST | `/api/auth/login/ad` | Login con Active Directory | No |
| GET | `/api/auth/users` | Obtener lista de usuarios | Sí (Admin) |
| POST | `/api/auth/users` | Crear nuevo usuario | Sí (Admin) |
| PUT | `/api/auth/users/{id}` | Actualizar usuario | Sí (Admin) |
| DELETE | `/api/auth/users/{id}` | Eliminar usuario | Sí (Admin) |

---

¡Todo listo! 🚀 Si tienes algún problema durante el despliegue, revisa los logs o consulta este documento.

