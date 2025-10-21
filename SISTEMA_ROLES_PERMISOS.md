# Sistema de Roles y Permisos

## 🎯 Nueva Estructura de Roles

El sistema ahora cuenta con **3 roles** jerárquicos:

### 1. **SuperAdmin** (Owner - TB03260)
- ✅ Acceso total al sistema
- ✅ Gestión de usuarios
- ✅ **Configuración de permisos por rol**
- ✅ Puede ver y hacer todo

### 2. **Admin**
- ✅ Gestión de usuarios
- ✅ Todas las vistas de observabilidad por defecto
- ❌ NO puede configurar permisos

### 3. **Reader**
- ✅ Solo lectura de las vistas permitidas
- ❌ NO puede gestionar usuarios
- ❌ NO puede configurar permisos

---

## 📋 Vistas Disponibles

| Vista | Ruta | Permiso | Descripción |
|-------|------|---------|-------------|
| Overview | `/` | `Overview` | Vista general del sistema |
| Jobs | `/jobs` | `Jobs` | Gestión de SQL Agent Jobs |
| Discos | `/disks` | `Disks` | Monitoreo de discos |
| Bases de Datos | `/databases` | `Databases` | Información de bases de datos |
| Backups | `/backups` | `Backups` | Estado de backups |
| Índices | `/indexes` | `Indexes` | Fragmentación de índices |
| **Usuarios** | `/admin/users` | `AdminUsers` | Administración de usuarios |
| **Permisos** | `/admin/permissions` | `AdminPermissions` | Configuración de permisos |

---

## 🔧 Configuración Inicial (Por Defecto)

### SuperAdmin (TB03260)
- ✅ **TODAS las vistas** (Overview, Jobs, Disks, Databases, Backups, Indexes, AdminUsers, AdminPermissions)

### Admin
- ✅ Overview, Jobs, Disks, Databases, Backups, Indexes, AdminUsers
- ❌ AdminPermissions

### Reader
- ✅ Overview, Jobs, Disks, Databases, Backups, Indexes
- ❌ AdminUsers, AdminPermissions

---

## 🚀 Cómo Usar la Gestión de Permisos

### Acceder a la Configuración

1. Hacer login como **SuperAdmin** (TB03260)
2. Ir a **Administración** → **Permisos** en el sidebar
3. Verás una tarjeta por cada rol con todas las vistas disponibles

### Modificar Permisos

1. En la página de Permisos, cada vista tiene un switch (toggle)
2. **Activa** (verde) = El rol tiene acceso
3. **Desactivado** (gris) = El rol NO tiene acceso
4. Los cambios se marcan en amarillo hasta que los guardes
5. Clic en **"Guardar Cambios"** para aplicar

### Ejemplo: Restringir Jobs a Readers

1. Ir a la tarjeta de **Reader**
2. Desactivar el switch de **Jobs**
3. Clic en **"Guardar Cambios"**
4. Los usuarios con rol Reader ya no verán Jobs en el sidebar

---

## 📊 KPIs de Permisos

La página muestra:
- **Roles Configurados**: Cantidad de roles (siempre 3)
- **Vistas Disponibles**: Total de vistas en el sistema (8)
- **Cambios Pendientes**: Cantidad de cambios sin guardar

---

## 🎨 Indicadores Visuales

### Badges de Roles

- **SuperAdmin**: Morado (`border-purple-500`)
- **Admin**: Azul primario (`border-primary`)
- **Reader**: Gris estándar

### Estado de Permisos

- **Switch Verde**: Vista habilitada para el rol
- **Switch Gris**: Vista deshabilitada para el rol
- **Fila Amarilla**: Permiso modificado (sin guardar)

---

## 🛡️ Seguridad

### En el Backend

1. **Autorización por Endpoint**:
   ```csharp
   [Authorize(Roles = "SuperAdmin")]  // Solo SuperAdmin
   [Authorize(Policy = "AdminOnly")]  // Admin y SuperAdmin
   ```

2. **Validación de Permisos**:
   - Los permisos se cargan al autenticar
   - Se validan contra la base de datos
   - Se almacenan en el token JWT

### En el Frontend

1. **Filtrado del Sidebar**:
   - El sidebar solo muestra vistas con permiso
   - Se usa `hasPermission(viewName)` para verificar

2. **Protección de Rutas**:
   - Aunque las rutas existen, el sidebar las oculta
   - El backend rechazará peticiones no autorizadas

---

## 📦 Compilación y Despliegue

### Paso 1: Compilar Backend

```powershell
# En tu PC
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory\SQLGuardObservatory.API
dotnet publish -c Release -o C:\Temp\Backend
```

### Paso 2: Compilar Frontend

```powershell
# En tu PC
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
npm run build
xcopy /E /I /Y dist\* C:\Temp\Frontend-Nueva\
```

### Paso 3: Desplegar en Servidor

```powershell
# En el servidor (PowerShell como Administrador)

# Detener servicio
nssm stop SQLGuardObservatoryAPI

# Copiar backend
xcopy /E /I /Y "RUTA_USB\Backend\*" "C:\Apps\SQLGuardObservatory\Backend\"

# Copiar frontend
xcopy /E /I /Y "RUTA_USB\Frontend-Nueva\*" "C:\inetpub\SQLGuardObservatory\"

# Iniciar servicio
nssm start SQLGuardObservatoryAPI
```

---

## 🗄️ Base de Datos

### Nueva Tabla: `RolePermissions`

```sql
CREATE TABLE RolePermissions (
    Id INT PRIMARY KEY IDENTITY,
    Role NVARCHAR(50) NOT NULL,
    ViewName NVARCHAR(50) NOT NULL,
    Enabled BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 NULL,
    CONSTRAINT UQ_RolePermissions_Role_ViewName UNIQUE (Role, ViewName)
);
```

### Inicialización Automática

Al iniciar la aplicación por primera vez:
1. Se crean los 3 roles (SuperAdmin, Admin, Reader)
2. Se asigna TB03260 como SuperAdmin
3. Se crean los permisos por defecto para cada rol

---

## ⚠️ Notas Importantes

1. **TB03260 siempre será SuperAdmin**:
   - Al iniciar la app, si TB03260 tiene otro rol, se cambia a SuperAdmin
   - Esto asegura que siempre haya un owner

2. **No se puede eliminar TB03260**:
   - Protección en backend y frontend
   - Es el usuario principal del sistema

3. **SuperAdmin ve todo**:
   - Incluso si se desactiva un permiso en la BD
   - El código verifica primero si es SuperAdmin

4. **Los cambios son inmediatos**:
   - Al guardar permisos, afectan a todos los usuarios con ese rol
   - Los usuarios deben recargar la página o hacer logout/login

---

## 🎯 Casos de Uso

### Caso 1: Nuevo Usuario Solo para Ver Jobs

1. Crear usuario con rol **Reader**
2. Ir a **Permisos**
3. En la tarjeta de **Reader**, desactivar todas las vistas excepto **Jobs**
4. Guardar cambios
5. El usuario solo verá Jobs en su sidebar

### Caso 2: Admin Sin Acceso a Backups

1. Ir a **Permisos**
2. En la tarjeta de **Admin**, desactivar **Backups**
3. Guardar cambios
4. Los Admin ya no verán Backups

### Caso 3: Promover Reader a Admin

1. Ir a **Usuarios**
2. Editar el usuario
3. Cambiar rol a **Admin**
4. Guardar
5. El usuario ahora tiene permisos de Admin (según configuración de ese rol)

---

## 📝 Endpoints Nuevos

| Método | Ruta | Descripción | Requiere |
|--------|------|-------------|----------|
| GET | `/api/permissions` | Obtener todos los permisos | SuperAdmin |
| GET | `/api/permissions/{role}` | Obtener permisos de un rol | SuperAdmin |
| PUT | `/api/permissions/{role}` | Actualizar permisos de un rol | SuperAdmin |
| GET | `/api/permissions/available` | Obtener vistas y roles disponibles | SuperAdmin |
| GET | `/api/permissions/my-permissions` | Obtener permisos del usuario actual | Auth |

---

¡Sistema de permisos implementado! 🎉 Ahora tienes control granular sobre qué puede ver cada rol.

