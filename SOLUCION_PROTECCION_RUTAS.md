# 🛡️ Solución: Protección de Rutas por Permisos

## 📋 Problema Identificado

**Escenario:**
- Usuario con permisos **solo para "Jobs"**
- Al iniciar sesión, ve la vista "Overview" aunque **NO** tiene permisos
- El sidebar funciona correctamente (solo muestra "Jobs")

**Causa Raíz:**
- La ruta `/` siempre renderizaba `Overview` sin verificar permisos
- No existía validación de permisos antes de renderizar cada vista
- Los usuarios podían acceder a cualquier ruta si conocían la URL

---

## ✅ Solución Implementada

Se implementó un **sistema completo de protección de rutas basado en permisos**:

### 1️⃣ Componente `ProtectedRoute`
**Archivo**: `src/components/routing/ProtectedRoute.tsx`

**Funcionalidad:**
- Verifica si el usuario tiene permisos para acceder a una vista
- Si **NO** tiene permisos → Redirige a `/unauthorized`
- Si **SÍ** tiene permisos → Renderiza la vista normalmente

**Ejemplo de uso:**
```tsx
<Route path="/jobs" element={
  <ProtectedRoute viewName="Jobs">
    <Jobs />
  </ProtectedRoute>
} />
```

### 2️⃣ Componente `DefaultRoute`
**Archivo**: `src/components/routing/DefaultRoute.tsx`

**Funcionalidad:**
- Maneja la ruta raíz `/`
- Determina la primera vista a la que el usuario tiene acceso
- Redirige automáticamente a esa vista

**Orden de prioridad:**
1. Overview
2. Jobs
3. Disks
4. Databases
5. Backups
6. Indexes
7. AdminUsers
8. AdminPermissions

Si el usuario no tiene acceso a ninguna vista → Redirige a `/unauthorized`

### 3️⃣ Actualización de Rutas en `App.tsx`

**Cambios realizados:**
- Ruta `/` → Ahora usa `DefaultRoute` (redirección inteligente)
- Nueva ruta `/overview` → Vista de Overview protegida
- **Todas las rutas** → Protegidas con `ProtectedRoute`

**Estructura:**
```tsx
<Route path="/" element={<DefaultRoute />} />
<Route path="/overview" element={
  <ProtectedRoute viewName="Overview">
    <Overview />
  </ProtectedRoute>
} />
<Route path="/jobs" element={
  <ProtectedRoute viewName="Jobs">
    <Jobs />
  </ProtectedRoute>
} />
// ... todas las demás rutas protegidas
```

### 4️⃣ Actualización del Sidebar

**Cambio en `AppSidebar.tsx`:**
- Enlace de "Overview" cambió de `/` a `/overview`
- Mantiene el filtrado de items según permisos

---

## 🎯 Comportamiento Esperado

### Escenario 1: Usuario con solo "Jobs"

**Al iniciar sesión:**
1. Usuario accede a `/`
2. `DefaultRoute` detecta que solo tiene permiso para "Jobs"
3. ✅ Redirige automáticamente a `/jobs`
4. Usuario ve la vista de Jobs (correcto)

**Si intenta acceder a `/overview` manualmente:**
1. Usuario escribe `http://asprbm-nov-01:8080/overview` en el navegador
2. `ProtectedRoute` verifica permisos
3. ❌ Usuario NO tiene permiso para "Overview"
4. ✅ Redirige a `/unauthorized`
5. Usuario ve página de "Acceso No Autorizado" con botón para volver al inicio

**En el Sidebar:**
- ✅ Solo aparece "Jobs"
- ❌ NO aparece "Overview"

### Escenario 2: Usuario con "Overview" y "Jobs"

**Al iniciar sesión:**
1. Usuario accede a `/`
2. `DefaultRoute` detecta permisos para "Overview" y "Jobs"
3. ✅ Redirige a `/overview` (primera vista con permisos)
4. Usuario ve la vista de Overview

**En el Sidebar:**
- ✅ Aparece "Overview"
- ✅ Aparece "Jobs"

### Escenario 3: SuperAdmin

**Al iniciar sesión:**
1. Usuario accede a `/`
2. `DefaultRoute` detecta permisos para todas las vistas
3. ✅ Redirige a `/overview`
4. Usuario ve la vista de Overview

**En el Sidebar:**
- ✅ Aparecen todas las vistas (8 items)

---

## 📁 Archivos Creados/Modificados

| Archivo | Tipo | Descripción |
|---------|------|-------------|
| `src/components/routing/ProtectedRoute.tsx` | **NUEVO** | Componente de protección de rutas |
| `src/components/routing/DefaultRoute.tsx` | **NUEVO** | Redirección inteligente a primera vista permitida |
| `src/App.tsx` | MODIFICADO | Rutas actualizadas con protección |
| `src/components/layout/AppSidebar.tsx` | MODIFICADO | URL de Overview cambiada a `/overview` |
| `src/pages/Unauthorized.tsx` | MODIFICADO | Mejorado con botón "Volver al Inicio" |

---

## 🚀 Cómo Desplegar

### Compilar Frontend

```powershell
# Desde el directorio raíz del proyecto
npm run build
```

### Copiar al Servidor

Copiar la carpeta `dist` generada a `C:\inetpub\wwwroot\sql-guard-observatory\` en el servidor.

**En el servidor (ASPRBM-NOV-01):**

```powershell
# Detener IIS (opcional, para evitar conflictos)
iisreset /stop

# Copiar archivos
# (Ajusta la ruta de origen según donde hayas copiado los archivos)
Copy-Item -Path "C:\Temp\sql-guard-observatory\dist\*" -Destination "C:\inetpub\wwwroot\sql-guard-observatory\" -Recurse -Force

# Iniciar IIS
iisreset /start
```

---

## ✅ Verificación

### 1. Crear un Usuario de Prueba

En la aplicación web, como SuperAdmin:

1. Ve a **Usuarios** → **Agregar Usuario**
2. Crea un usuario de prueba:
   - **Usuario**: `TEST_READER`
   - **Nombre**: `Usuario de Prueba`
   - **Rol**: `Reader`
   - **Contraseña**: `Test123!`

### 2. Configurar Permisos Solo para "Jobs"

1. Ve a **Permisos**
2. Busca el rol **Reader**
3. **Deshabilita** todas las vistas excepto **Jobs**:
   - ❌ Overview
   - ✅ Jobs
   - ❌ Disks
   - ❌ Databases
   - ❌ Backups
   - ❌ Indexes
4. Guarda los cambios

### 3. Probar con el Usuario de Prueba

1. **Cerrar sesión** como SuperAdmin
2. **Iniciar sesión** con `TEST_READER` / `Test123!`
3. **Verificar que**:
   - ✅ Redirige automáticamente a `/jobs` (NO a `/overview`)
   - ✅ El sidebar solo muestra "Jobs"
   - ✅ La vista de Jobs se muestra correctamente

### 4. Intentar Acceder Manualmente a Overview

1. En el navegador, escribe: `http://asprbm-nov-01:8080/overview`
2. **Verificar que**:
   - ✅ Se redirige a la página de "Acceso No Autorizado"
   - ✅ Aparece el mensaje: "No tienes permisos para acceder a esta vista"
   - ✅ Hay un botón "Volver al Inicio"
3. Haz clic en **"Volver al Inicio"**
4. **Verificar que**:
   - ✅ Redirige a `/jobs` (la única vista permitida)

### 5. Verificar Sidebar Dinámico

1. Como SuperAdmin, ve a **Permisos**
2. Habilita también **"Disks"** para el rol Reader
3. Guarda los cambios
4. Cierra sesión y vuelve a iniciar con `TEST_READER`
5. **Verificar que**:
   - ✅ El sidebar ahora muestra **"Jobs"** y **"Disks"**
   - ✅ Puede navegar entre ambas vistas
   - ✅ NO puede acceder a otras vistas

---

## 🔒 Seguridad

### Protección en Múltiples Capas

| Capa | Descripción | Estado |
|------|-------------|--------|
| **Backend** | API endpoints protegidos por roles | ✅ Implementado |
| **Frontend - Routing** | Rutas protegidas por permisos | ✅ **NUEVO** |
| **Frontend - UI** | Sidebar filtra según permisos | ✅ Implementado |
| **Base de Datos** | Tabla RolePermissions con permisos | ✅ Implementado |

### Flujo de Seguridad Completo

```
1. Usuario inicia sesión
   ↓
2. Backend verifica credenciales y genera JWT
   ↓
3. Frontend obtiene permisos del usuario (/api/permissions/my-permissions)
   ↓
4. AuthContext guarda permisos en estado
   ↓
5. DefaultRoute redirige a primera vista permitida
   ↓
6. ProtectedRoute verifica permiso antes de renderizar cada vista
   ↓
7. Sidebar muestra solo items permitidos
   ↓
8. Usuario solo puede navegar a vistas permitidas
```

---

## 🆘 Troubleshooting

### Problema: Usuario sigue viendo Overview sin permisos

**Solución:**
1. Limpiar caché del navegador (`Ctrl + Shift + Delete`)
2. Cerrar sesión y volver a iniciar
3. Verificar que se desplegó el frontend actualizado:
   ```powershell
   # Ver fecha de modificación del index.html
   Get-Item "C:\inetpub\wwwroot\sql-guard-observatory\index.html" | Select-Object LastWriteTime
   ```

### Problema: "Redireccionamiento infinito" o página en blanco

**Causa**: Probablemente el usuario no tiene permisos para ninguna vista.

**Solución:**
1. Verificar en la base de datos que el usuario tenga al menos un permiso habilitado:
   ```sql
   SELECT u.UserName, r.Name as Role, rp.ViewName, rp.Enabled
   FROM AspNetUsers u
   JOIN AspNetUserRoles ur ON u.Id = ur.UserId
   JOIN AspNetRoles r ON ur.RoleId = r.Id
   LEFT JOIN RolePermissions rp ON rp.Role = r.Name AND rp.Enabled = 1
   WHERE u.UserName = 'TEST_READER';
   ```

2. Si no tiene permisos, asignarlos desde la interfaz de SuperAdmin

### Problema: Error 404 al acceder a `/overview`

**Causa**: El frontend no se desplegó correctamente.

**Solución:**
1. Verificar que existe el archivo `index.html` en el servidor
2. Verificar configuración de URL Rewrite en IIS (ver `DEPLOYMENT.md`)

---

## 📊 Matriz de Acceso Actualizada

| Vista | SuperAdmin | Admin | Reader (default) |
|-------|------------|-------|------------------|
| Overview | ✅ | ✅ | ✅ |
| Jobs | ✅ | ✅ | ✅ |
| Disks | ✅ | ✅ | ✅ |
| Databases | ✅ | ✅ | ✅ |
| Backups | ✅ | ✅ | ✅ |
| Indexes | ✅ | ✅ | ✅ |
| AdminUsers | ✅ | ✅ | ❌ |
| AdminPermissions | ✅ | ❌ | ❌ |

**Nota**: Los permisos de Reader son **configurables** por SuperAdmin desde la interfaz de Permisos.

---

## 📝 Notas Técnicas

### Orden de Evaluación

1. **AuthGate**: Verifica si el usuario está autenticado
2. **DefaultRoute** (`/`): Redirige a primera vista permitida
3. **ProtectedRoute**: Verifica permisos específicos de cada vista
4. **hasPermission()**: Función del AuthContext que:
   - SuperAdmin → Siempre retorna `true`
   - Otros roles → Verifica en array `permissions`

### Caché de Permisos

Los permisos se cargan una sola vez al iniciar sesión y se guardan en el `AuthContext`. Si cambias permisos de un usuario:

1. **El usuario debe cerrar sesión y volver a iniciar** para que se recarguen los permisos
2. O implementar un mecanismo de recarga de permisos (feature futuro)

---

**Última actualización**: 20 de octubre de 2025

**Archivos nuevos**: 
- `ProtectedRoute.tsx`
- `DefaultRoute.tsx`

**Archivos modificados**:
- `App.tsx`
- `AppSidebar.tsx`
- `Unauthorized.tsx`

