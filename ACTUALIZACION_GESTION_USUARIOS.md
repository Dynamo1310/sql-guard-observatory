# Actualización: Gestión de Usuarios (Lista Blanca)

## 🎯 Cambios Implementados

### **Gestión de Usuarios (AdminUsers)**
- ✅ La sección de Usuarios ahora consume datos reales del backend
- ✅ Permite **agregar** nuevos usuarios a la lista blanca
- ✅ Permite **editar** usuarios existentes (nombre, rol, estado)
- ✅ Permite **eliminar** usuarios (excepto TB03260)
- ✅ Interfaz moderna con diálogos de confirmación
- ✅ Logo de Supervielle visible en la pantalla de login

---

## 📦 Pasos para Desplegar

### Paso 1: Compilar el Backend (en tu PC)

```powershell
# En tu PC
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API

# Compilar
dotnet publish -c Release -o C:\Temp\Backend
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
- Copiar `C:\Temp\Backend` a una USB
- Copiar `C:\Temp\Frontend-Nueva` a una USB
- Llevar USB al servidor

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
xcopy /E /I /Y "RUTA_USB_O_TEMP\Backend\*" "C:\Apps\SQLGuardObservatory\Backend\"

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
     - `GET /api/auth/users` (obtener usuarios)
     - `POST /api/auth/users` (crear usuario)
     - `PUT /api/auth/users/{id}` (actualizar usuario)
     - `DELETE /api/auth/users/{id}` (eliminar usuario)

2. **Frontend:**
   - Abrir navegador: `http://localhost:8080`
   - Verificar que aparezca:
     - Logo de Supervielle en el login
     - Formulario de login normal

3. **Gestión de Usuarios:**
   - Hacer login con TB03260
   - Ir a la sección "Usuarios" en el sidebar
   - Verificar que muestre la lista de usuarios
   - Probar agregar un nuevo usuario
   - Probar editar un usuario
   - Probar eliminar un usuario (excepto TB03260)

---

## 🎮 Uso de la Nueva Funcionalidad

### Agregar Usuario a la Lista Blanca

1. Hacer login como administrador (TB03260)
2. Ir a **Usuarios** en el sidebar
3. Clic en **"Agregar Usuario"**
4. Completar:
   - **Usuario:** TB12345
   - **Nombre Completo:** Juan Pérez
   - **Contraseña:** Contraseña inicial del usuario
   - **Rol:** Reader o Admin
5. Clic en **"Crear Usuario"**

### Editar Usuario

1. En la lista de usuarios, clic en el ícono de lápiz (Editar)
2. Modificar los campos deseados:
   - Nombre completo
   - Rol (Admin o Reader)
   - Estado (Activo/Inactivo)
3. Clic en **"Guardar Cambios"**

### Eliminar Usuario

1. En la lista de usuarios, clic en el ícono de papelera (Eliminar)
2. Confirmar la eliminación en el diálogo
3. **Nota:** El usuario TB03260 no puede ser eliminado

---

## ⚠️ Notas Importantes

1. **Usuario TB03260:** No se puede eliminar (es el administrador principal)
2. **Lista Blanca:** Solo usuarios agregados en la sección "Usuarios" pueden acceder al sistema
3. **Roles:**
   - **Admin:** Puede gestionar usuarios y ver todo el sistema
   - **Reader:** Solo puede ver información, no puede gestionar usuarios

---

## 🐛 Troubleshooting

### "Usuario no autorizado" al hacer login
- Verificar que el usuario esté en la lista blanca
- Verificar que el usuario esté activo (columna Estado = Activo)
- Verificar que la contraseña sea correcta

### No puedo ver la sección de Usuarios
- Verificar que estés logueado con un usuario con rol **Admin**
- Solo los administradores pueden acceder a la gestión de usuarios

### Error al crear usuario
- Verificar que el nombre de usuario no esté duplicado
- Completar todos los campos obligatorios
- Revisar logs del backend: `C:\Apps\SQLGuardObservatory\Backend\logs\output.log`

---

## 📝 Resumen de Endpoints Nuevos

| Método | Ruta | Descripción | Requiere Auth |
|--------|------|-------------|---------------|
| GET | `/api/auth/users` | Obtener lista de usuarios | Sí (Admin) |
| POST | `/api/auth/users` | Crear nuevo usuario | Sí (Admin) |
| PUT | `/api/auth/users/{id}` | Actualizar usuario | Sí (Admin) |
| DELETE | `/api/auth/users/{id}` | Eliminar usuario | Sí (Admin) |

---

## 🎨 Cambios en la UI

### Login
- ✅ Logo de Supervielle visible
- ✅ Formulario simple de usuario/contraseña

### Sección de Usuarios
- ✅ Tabla con lista de usuarios
- ✅ KPIs: Usuarios Activos, Administradores, Lectores
- ✅ Botón "Agregar Usuario"
- ✅ Botones de Editar y Eliminar por usuario
- ✅ Diálogos modales para crear/editar
- ✅ Confirmación antes de eliminar

---

¡Todo listo! 🚀 Ahora puedes compilar y desplegar la aplicación con la nueva funcionalidad de gestión de usuarios.

