# 🔍 Diagnóstico: Problema de Redirección

## Síntoma
El usuario no es redirigido a `/jobs` cuando solo tiene permisos para esa vista.

## Causas Posibles

### 1️⃣ Caché del Navegador (Más Común)
El navegador está mostrando la versión anterior de la aplicación.

### 2️⃣ Tabla RolePermissions No Existe
Si no aplicaste la migración de la base de datos, los permisos no se pueden cargar.

### 3️⃣ Build del Frontend No Se Aplicó
Los archivos en el servidor no se actualizaron correctamente.

### 4️⃣ Error en la Carga de Permisos
El endpoint `/api/permissions/my-permissions` está fallando.

---

## 🔧 Pasos de Diagnóstico

### Paso 1: Verificar la Consola del Navegador

1. Abre la aplicación: `http://asprbm-nov-01:8080`
2. Presiona **F12** para abrir las herramientas de desarrollo
3. Ve a la pestaña **Console**
4. Inicia sesión con el usuario que tiene solo permiso para "Jobs"

**Busca estos mensajes:**

#### ✅ Caso Normal (Funcionando):
```
(No deberían aparecer errores)
```

#### ❌ Posibles Errores:

**Error 1: Permisos no se cargan**
```
GET http://asprbm-nov-01:5000/api/permissions/my-permissions 403 (Forbidden)
Error al cargar permisos
```
**Solución**: Aplicar los arreglos del backend (ver `RESUMEN_ARREGLOS_403.md`)

**Error 2: Tabla RolePermissions no existe**
```
GET http://asprbm-nov-01:5000/api/permissions/my-permissions 500 (Internal Server Error)
Invalid object name 'RolePermissions'
```
**Solución**: Aplicar migración SQL (ver `ARREGLO_RAPIDO.md`)

---

### Paso 2: Verificar Permisos en la Consola

En la consola del navegador, pega este código:

```javascript
// Ver datos del usuario
const user = JSON.parse(localStorage.getItem('user') || '{}');
console.log('Usuario:', user);

// Hacer request de permisos
fetch('http://asprbm-nov-01:5000/api/permissions/my-permissions', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('token')
  }
})
.then(r => r.json())
.then(data => console.log('Permisos del usuario:', data))
.catch(err => console.error('Error obteniendo permisos:', err));
```

**Resultado Esperado:**
```javascript
Usuario: { domainUser: "TEST_READER", displayName: "Usuario de Prueba", roles: ["Reader"] }
Permisos del usuario: { permissions: ["Jobs"] }
```

**Si el array de permisos está vacío:**
```javascript
Permisos del usuario: { permissions: [] }
```
→ **Problema**: El usuario no tiene permisos configurados en la tabla `RolePermissions`

---

### Paso 3: Verificar la Tabla RolePermissions en SQL Server

Ejecuta esta consulta en **SQL Server Management Studio**:

```sql
USE [SQLGuardObservatoryAuth];
GO

-- Verificar que la tabla existe
SELECT COUNT(*) as PermisosTotales FROM RolePermissions;

-- Ver permisos del rol Reader
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE Role = 'Reader'
ORDER BY ViewName;
```

**Resultado Esperado:**

| Role | ViewName | Enabled |
|------|----------|---------|
| Reader | Jobs | 1 |
| Reader | Overview | 0 |
| Reader | Disks | 0 |
| Reader | ... | 0 |

**Si la tabla no existe:**
```
Msg 208, Level 16, State 1, Line 1
Invalid object name 'RolePermissions'.
```
→ **Solución**: Ejecutar `Apply-RolePermissionsMigration.ps1`

---

### Paso 4: Limpiar Caché del Navegador (SIEMPRE HACER ESTO PRIMERO)

#### Opción A: Limpieza Completa
1. Presiona **Ctrl + Shift + Delete**
2. Selecciona:
   - ✅ Cookies y otros datos del sitio
   - ✅ Archivos e imágenes en caché
3. Rango de tiempo: **Desde siempre**
4. Haz clic en **Borrar datos**
5. **Cierra completamente el navegador** (todas las pestañas)
6. Abre el navegador nuevamente
7. Ve a `http://asprbm-nov-01:8080`

#### Opción B: Hard Refresh
1. En la página de la aplicación
2. Presiona **Ctrl + Shift + R** (o **Ctrl + F5**)
3. Esto fuerza la recarga sin caché

#### Opción C: Modo Incógnito (Para Testing)
1. Abre una ventana en modo incógnito (**Ctrl + Shift + N** en Chrome)
2. Ve a `http://asprbm-nov-01:8080`
3. Inicia sesión
4. Si funciona aquí pero no en modo normal → **Es problema de caché**

---

### Paso 5: Verificar Que el Frontend Se Actualizó

En el servidor (ASPRBM-NOV-01), ejecuta en PowerShell:

```powershell
# Ver fecha de modificación del index.html
Get-Item "C:\inetpub\wwwroot\sql-guard-observatory\index.html" | Select-Object Name, LastWriteTime

# Ver contenido del index.html para buscar las rutas nuevas
Select-String -Path "C:\inetpub\wwwroot\sql-guard-observatory\assets\index-*.js" -Pattern "ProtectedRoute" | Select-Object -First 1
```

**Si `LastWriteTime` es antigua (antes de hoy):**
→ El frontend NO se actualizó. Necesitas hacer el build y copiarlo nuevamente.

---

### Paso 6: Verificar Logs del Backend

```powershell
# Ver logs recientes del backend
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 50
```

**Busca errores relacionados con:**
- `RolePermissions`
- `my-permissions`
- `Invalid object name`

---

## 🎯 Soluciones Rápidas Según el Problema

### ✅ Solución 1: Caché del Navegador
```
1. Ctrl + Shift + Delete → Borrar todo
2. Cerrar navegador completamente
3. Volver a abrir e iniciar sesión
```

### ✅ Solución 2: Frontend No Actualizado

**En tu PC:**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory

# Limpiar y compilar
npm run build
```

**Copiar al servidor:**
```powershell
# Ajusta las rutas según tu configuración
Copy-Item -Path ".\dist\*" -Destination "\\ASPRBM-NOV-01\C$\inetpub\wwwroot\sql-guard-observatory\" -Recurse -Force
```

**En el servidor:**
```powershell
# Reiniciar IIS
iisreset
```

### ✅ Solución 3: Tabla RolePermissions No Existe

**En el servidor:**
```powershell
cd C:\Apps\SQLGuardObservatory\Backend\SQL
.\Apply-RolePermissionsMigration.ps1
Restart-Service -Name "SQLGuardObservatory.API"
```

### ✅ Solución 4: Backend No Actualizado (Error 403)

**En tu PC:**
```powershell
cd C:\Users\tobia\OneDrive\Desktop\sql-guard-observatory
.\DESPLEGAR_CAMBIOS.ps1
```

---

## 🧪 Test Definitivo

Después de aplicar las soluciones, ejecuta este test:

1. **Limpia caché completamente** (Ctrl + Shift + Delete)
2. **Cierra el navegador**
3. **Abre modo incógnito**
4. Ve a `http://asprbm-nov-01:8080`
5. Inicia sesión con usuario que solo tenga "Jobs"
6. **Observa la URL en la barra del navegador:**
   - ✅ Debería cambiar de `/` a `/jobs` automáticamente
   - ✅ La vista de Jobs debería mostrarse

7. **Intenta acceder manualmente a `/overview`:**
   - En la barra del navegador, escribe: `http://asprbm-nov-01:8080/overview`
   - ✅ Debería mostrarte "Acceso No Autorizado"

---

## 📊 Checklist de Verificación

Marca cada item que ya verificaste:

- [ ] Limpié la caché del navegador completamente
- [ ] Cerré y reabrí el navegador
- [ ] Probé en modo incógnito
- [ ] Verifiqué que la tabla `RolePermissions` existe
- [ ] Verifiqué que el usuario tiene permisos en la tabla
- [ ] El endpoint `/api/permissions/my-permissions` devuelve 200 OK
- [ ] El frontend tiene fecha de modificación reciente
- [ ] El backend no tiene errores en los logs
- [ ] Verifiqué en la consola del navegador que los permisos se cargan
- [ ] El array de permisos contiene solo `["Jobs"]`

---

## 🆘 Si Nada Funciona

Comparte esta información para diagnóstico más profundo:

```javascript
// Ejecuta en la consola del navegador (F12)
console.log('=== DIAGNÓSTICO COMPLETO ===');
console.log('Usuario:', JSON.parse(localStorage.getItem('user') || '{}'));
console.log('Token existe:', !!localStorage.getItem('token'));
console.log('URL actual:', window.location.href);

// Request de permisos
fetch('http://asprbm-nov-01:5000/api/permissions/my-permissions', {
  headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
})
.then(r => r.text())
.then(text => {
  try {
    const data = JSON.parse(text);
    console.log('Permisos recibidos:', data);
  } catch(e) {
    console.error('Response no es JSON:', text);
  }
})
.catch(err => console.error('Error en request:', err));
```

Copia y pega todo el output de la consola.

---

**Última actualización**: 20 de octubre de 2025

