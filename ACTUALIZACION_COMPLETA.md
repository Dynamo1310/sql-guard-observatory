# Actualización Completa: Gestión de Usuarios y Jobs con Datos Reales

## 🎯 Cambios Implementados

### 1. **Gestión de Contraseñas**
- ✅ **Crear Usuario**: Campo de contraseña obligatorio
- ✅ **Editar Usuario**: Checkbox para cambiar contraseña opcional
- ✅ **Menú de Usuario**: Dropdown en esquina superior derecha con opciones:
  - Cambiar Contraseña (cualquier usuario)
  - Cerrar Sesión
- ✅ Logo de Supervielle visible en el login

### 2. **Página Jobs con Datos Reales**
- ✅ **Filtros Dinámicos**:
  - Ambiente (valores de la BD)
  - Hosting (valores de la BD)
  - Instancia (nuevo filtro con InstanceName)
- ✅ **KPIs Relevantes**:
  - Jobs Exitosos
  - Jobs Fallidos
  - Jobs Detenidos
  - Duración Promedio (en minutos)
- ✅ **Tabla de Jobs**: Consume `InventarioJobsSnapshot`
- ✅ **Eliminado**: Botón refrescar e indicador "Actualizado"

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
   - Verificar nuevos endpoints:
     - `POST /api/auth/change-password`
     - `GET /api/jobs/filters`
     - `GET /api/jobs` (con parámetros instance)
     - `GET /api/jobs/summary` (con filtros)

2. **Frontend:**
   - Abrir navegador: `http://localhost:8080`
   - Verificar:
     - Logo de Supervielle en el login
     - Menú de usuario en esquina superior derecha

3. **Gestión de Usuarios:**
   - Login con TB03260
   - Ir a "Usuarios"
   - Probar crear usuario con contraseña
   - Probar editar usuario y cambiar contraseña
   - Clic en usuario (esquina superior derecha) → Cambiar Contraseña

4. **Página Jobs:**
   - Ir a "Jobs"
   - Verificar que los filtros muestren valores reales de la BD
   - Verificar nuevo filtro "Instancia"
   - Verificar KPIs: Jobs Exitosos, Fallidos, Detenidos, Duración Promedio
   - Verificar que la tabla muestre datos de `InventarioJobsSnapshot`
   - Confirmar que NO aparezca botón "Refrescar" ni indicador "Actualizado"

---

## 🎮 Uso de las Nuevas Funcionalidades

### Cambiar Contraseña (Usuario Propio)

1. Hacer login con cualquier usuario
2. Clic en el nombre de usuario (esquina superior derecha)
3. Seleccionar **"Cambiar Contraseña"**
4. Ingresar:
   - Contraseña actual
   - Nueva contraseña
   - Confirmar nueva contraseña
5. Clic en **"Cambiar Contraseña"**

### Agregar Usuario con Contraseña

1. Login como administrador (TB03260)
2. Ir a **Usuarios**
3. Clic en **"Agregar Usuario"**
4. Completar:
   - Usuario: TB12345
   - Nombre Completo: Juan Pérez
   - **Contraseña:** Contraseña inicial (obligatorio)
   - Rol: Reader o Admin
5. Clic en **"Crear Usuario"**

### Editar Usuario y Cambiar Contraseña

1. En la lista de usuarios, clic en **Editar** (ícono lápiz)
2. Modificar campos deseados
3. Marcar checkbox **"Cambiar contraseña"**
4. Ingresar nueva contraseña
5. Clic en **"Guardar Cambios"**

### Filtrar Jobs

1. Ir a **Jobs**
2. Usar los dropdowns:
   - **Ambiente**: Seleccionar ambiente específico o "Todos"
   - **Hosting**: Seleccionar hosting específico o "Todos"
   - **Instancia**: Seleccionar instancia específica o "Todas"
3. Los KPIs y la tabla se actualizarán automáticamente

---

## 📊 Nuevos KPIs de Jobs

| KPI | Descripción |
|-----|-------------|
| **Jobs Exitosos** | Cantidad de jobs con estado "Succeeded" |
| **Jobs Fallidos** | Cantidad de jobs con estado "Failed" |
| **Jobs Detenidos** | Cantidad de jobs con estado "Stopped" o "Canceled" |
| **Duración Promedio** | Promedio de duración de todos los jobs (en minutos) |

---

## 🗃️ Columnas de la Tabla de Jobs

| Columna | Descripción |
|---------|-------------|
| **Instancia** | InstanceName de la tabla |
| **Job** | JobName |
| **Ambiente** | Ambiente (Prod, UAT, Dev, etc.) |
| **Hosting** | Hosting (OnPrem, AWS, etc.) |
| **Inicio** | JobStart |
| **Fin** | JobEnd |
| **Duración** | JobDurationSeconds (formateado como "Xm Ys") |
| **Estado** | JobStatus (Succeeded, Failed, Stopped, etc.) |

---

## 📝 Resumen de Endpoints Nuevos/Modificados

### Backend

| Método | Ruta | Descripción | Requiere Auth |
|--------|------|-------------|---------------|
| POST | `/api/auth/change-password` | Cambiar contraseña del usuario autenticado | Sí |
| PUT | `/api/auth/users/{id}` | Actualizar usuario (ahora incluye password opcional) | Sí (Admin) |
| GET | `/api/jobs/filters` | Obtener valores únicos de Ambiente, Hosting, Instancia | Sí |
| GET | `/api/jobs` | Obtener jobs (ahora con filtro de instancia) | Sí |
| GET | `/api/jobs/summary` | Obtener KPIs (ahora con filtros) | Sí |

---

## ⚠️ Notas Importantes

1. **Contraseña al Crear**: Ahora es obligatorio especificar una contraseña al crear un usuario
2. **Cambio de Contraseña**: Los administradores pueden cambiar la contraseña de cualquier usuario al editarlo
3. **Usuarios Propios**: Cualquier usuario puede cambiar su propia contraseña desde el menú de usuario
4. **Filtros Jobs**: Los valores de los dropdowns se cargan dinámicamente desde la base de datos
5. **Performance**: La tabla de jobs está limitada a 1000 registros ordenados por fecha de captura descendente

---

## 🐛 Troubleshooting

### No aparece el menú de usuario
- Limpiar caché del navegador (Ctrl + Shift + R)
- Verificar que el frontend esté actualizado

### Filtros de Jobs no cargan valores
- Verificar que el servicio del backend esté corriendo
- Revisar logs: `C:\Apps\SQLGuardObservatory\Backend\logs\output.log`
- Verificar conectividad con SQL Server

### Error al cambiar contraseña
- Verificar que la contraseña actual sea correcta
- La nueva contraseña debe tener al menos 6 caracteres
- Las contraseñas deben coincidir

### Tabla de Jobs vacía
- Verificar que haya datos en `[SQLNova].[dbo].[InventarioJobsSnapshot]`
- Revisar filtros seleccionados
- Verificar conexión a SQL Server en `appsettings.json`

---

¡Todo listo! 🚀 Ahora puedes compilar y desplegar la aplicación con todas las nuevas funcionalidades.

**Recuerda compilar ambos proyectos (Backend y Frontend) antes de desplegar en el servidor.**

