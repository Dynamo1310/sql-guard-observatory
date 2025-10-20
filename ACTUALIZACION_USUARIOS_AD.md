# Actualización: Gestión de Usuarios y Login con Cuenta Supervielle

## 🎯 Cambios Implementados

### 1. **Gestión de Usuarios (AdminUsers)**
- ✅ La sección de Usuarios ahora consume datos reales del backend
- ✅ Permite **agregar** nuevos usuarios a la lista blanca
- ✅ Permite **editar** usuarios existentes (nombre, rol, estado)
- ✅ Permite **eliminar** usuarios (excepto TB03260)
- ✅ Interfaz moderna con diálogos de confirmación

### 2. **Login con Cuenta Supervielle (Windows Authentication)**
- ✅ Botón **"Acceder con Cuenta Supervielle"** en el login
- ✅ Usa automáticamente las credenciales del usuario logueado en Windows
- ✅ No pide usuario ni contraseña - las toma del sistema operativo
- ✅ Verifica que el usuario pertenezca al dominio **GSCORP**
- ✅ Verifica que el usuario esté en la **lista blanca** del sistema
- ✅ Logo de Supervielle visible en la pantalla de login

---

## 🔐 Cómo Funciona el Login con Cuenta Supervielle

1. El usuario hace clic en **"Acceder con Cuenta Supervielle"**
2. El sistema obtiene automáticamente el usuario logueado en Windows (ej: `GSCORP\TB12345`)
3. Verifica que el dominio sea `GSCORP`
4. Busca el usuario (`TB12345`) en la lista blanca
5. Si está autorizado → genera token y permite el acceso
6. Si NO está en la lista blanca → rechaza el acceso

**Importante:** El usuario debe:
- Estar logueado en Windows con una cuenta de dominio GSCORP
- Estar agregado en la lista blanca del sistema (sección Usuarios)

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

### Paso 5: Configurar Windows Authentication en IIS (IMPORTANTE)

Para que el botón "Acceder con Cuenta Supervielle" funcione, **debes habilitar Windows Authentication en IIS**:

#### Opción A: Interfaz Gráfica de IIS

1. Abrir **Internet Information Services (IIS) Manager**
2. Navegar a: **Sites → SQLGuardObservatory** (tu sitio web)
3. En el panel derecho, hacer doble clic en **"Authentication"** (Autenticación)
4. Verás una lista de métodos de autenticación:
   - **Anonymous Authentication:** debe estar **Enabled**
   - **Windows Authentication:** debe estar **Enabled** ✅

5. Si **Windows Authentication** está **Disabled**:
   - Clic derecho en **Windows Authentication**
   - Seleccionar **Enable**

6. **Importante:** Ambas deben estar habilitadas:
   - Anonymous Authentication: Enabled (para el login normal)
   - Windows Authentication: Enabled (para el login con cuenta Supervielle)

#### Opción B: Línea de Comandos

```powershell
# Habilitar Windows Authentication en el sitio
C:\Windows\System32\inetsrv\appcmd.exe set config "SQLGuardObservatory" /section:windowsAuthentication /enabled:true

# Verificar configuración
C:\Windows\System32\inetsrv\appcmd.exe list config "SQLGuardObservatory" /section:windowsAuthentication
```

---

### Paso 6: Verificar el Despliegue

1. **Backend API:**
   - Abrir navegador: `http://localhost:5000/swagger`
   - Verificar que aparezcan los nuevos endpoints:
     - `POST /api/auth/login/windows` (nuevo)
     - `POST /api/auth/login/ad` (nuevo)
     - `GET /api/auth/users` (existente)
     - `POST /api/auth/users` (nuevo)
     - `PUT /api/auth/users/{id}` (nuevo)
     - `DELETE /api/auth/users/{id}` (nuevo)

2. **Frontend:**
   - Abrir navegador: `http://localhost:8080`
   - Verificar que aparezca:
     - Logo de Supervielle
     - Campos de Usuario y Contraseña
     - Botón "Iniciar Sesión"
     - Separador con "O"
     - Botón "Acceder con Cuenta Supervielle"

3. **Probar Login con Cuenta Supervielle:**
   - Clic en "Acceder con Cuenta Supervielle"
   - Debería entrar automáticamente (si tu usuario está en la lista blanca)
   - Si no está en la lista blanca, debería mostrar error

4. **Gestión de Usuarios:**
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
   - **Contraseña:** (contraseña inicial, si no usa Windows Authentication)
   - **Rol:** Reader o Admin
5. Clic en **"Crear Usuario"**

### Login Normal (con Usuario y Contraseña)

1. Ingresar usuario y contraseña en el formulario
2. Clic en **"Iniciar Sesión"**

### Login con Cuenta Supervielle (Windows Authentication)

1. Asegurarte de estar logueado en Windows con tu cuenta de dominio GSCORP
2. En la pantalla de login, clic en **"Acceder con Cuenta Supervielle"**
3. El sistema obtiene automáticamente tu usuario de Windows
4. Si estás en la lista blanca → acceso permitido
5. Si NO estás en la lista blanca → acceso denegado

**No necesitas ingresar usuario ni contraseña** - el sistema los toma automáticamente de Windows.

---

## ⚠️ Notas Importantes

1. **Usuario TB03260:** No se puede eliminar (es el administrador principal)
2. **Lista Blanca:** Solo usuarios agregados en la sección "Usuarios" pueden acceder
3. **Windows Authentication:** 
   - Debe estar habilitada en IIS (ver Paso 5)
   - El usuario debe estar logueado en Windows con cuenta GSCORP
   - El usuario debe estar en la lista blanca
4. **Roles:**
   - **Admin:** Puede gestionar usuarios y ver todo
   - **Reader:** Solo puede ver información, no puede gestionar usuarios

---

## 🐛 Troubleshooting

### "Usuario no autorizado" al usar Cuenta Supervielle
- Verificar que el usuario esté en la lista blanca
- Verificar que el usuario esté activo (columna Estado = Activo)
- Verificar que estés logueado en Windows con cuenta GSCORP

### "No se pudo obtener la identidad de Windows"
- Verificar que Windows Authentication esté habilitada en IIS (ver Paso 5)
- Verificar que el usuario esté logueado en Windows con cuenta de dominio
- Revisar logs del backend: `C:\Apps\SQLGuardObservatory\Backend\logs\output.log`

### El botón "Acceder con Cuenta Supervielle" no funciona
- Verificar que el servicio del backend esté corriendo
- Verificar Windows Authentication en IIS (Paso 5)
- Abrir herramientas de desarrollador (F12) y revisar la consola
- Verificar conectividad con el backend: `http://localhost:5000/swagger`

### Error al conectar con Active Directory
- Verificar conectividad de red con el dominio
- Revisar logs del backend: `C:\Apps\SQLGuardObservatory\Backend\logs\output.log`
- Verificar configuración en `appsettings.json`

---

## 📝 Resumen de Endpoints Nuevos

| Método | Ruta | Descripción | Requiere Auth |
|--------|------|-------------|---------------|
| POST | `/api/auth/login/windows` | Login con Windows (automático) | No |
| POST | `/api/auth/login/ad` | Login con AD (manual) | No |
| GET | `/api/auth/users` | Obtener lista de usuarios | Sí (Admin) |
| POST | `/api/auth/users` | Crear nuevo usuario | Sí (Admin) |
| PUT | `/api/auth/users/{id}` | Actualizar usuario | Sí (Admin) |
| DELETE | `/api/auth/users/{id}` | Eliminar usuario | Sí (Admin) |

---

## 🎨 Cambios en la UI

- ✅ Logo de Supervielle visible en el login
- ✅ Un solo formulario (sin pestañas)
- ✅ Campos de usuario/contraseña para login normal
- ✅ Botón "Iniciar Sesión" para login normal
- ✅ Separador visual con "O"
- ✅ Botón "Acceder con Cuenta Supervielle" con ícono de edificio

---

¡Todo listo! 🚀 Si tienes algún problema durante el despliegue, revisa los logs o consulta este documento.

**Recuerda:** El paso más importante es habilitar Windows Authentication en IIS (Paso 5) para que el botón "Acceder con Cuenta Supervielle" funcione correctamente.
