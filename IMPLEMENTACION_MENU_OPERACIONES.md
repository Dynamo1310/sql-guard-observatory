# Implementación: Menú Operaciones y Configuración de Servidores Operacionales

## Resumen de Cambios

Se implementó un nuevo menú desplegable "Operaciones" en el sidebar con:
1. Vista de **Reinicio de Servidores** (existente)
2. Nueva vista de **Configuración de Servidores** operacionales

### Permisos de Acceso

La vista de **Configuración de Servidores Operacionales** solo es accesible para:
- Usuarios con rol `SuperAdmin`
- Usuarios con `IsOnCallEscalation = true` en la tabla `AspNetUsers`

## Archivos Creados

### Backend

1. **`SQLGuardObservatory.API/SQL/CreateOperationalServersTables.sql`**
   - Script SQL para crear tablas `OperationalServers` y `OperationalServersAudit`
   - Índices y vista `vw_EnabledOperationalServers`
   - Permisos para `OperationsConfig`

2. **`SQLGuardObservatory.API/Models/OperationalServer.cs`**
   - Modelos `OperationalServer` y `OperationalServerAudit`
   - Constantes para acciones de auditoría

3. **`SQLGuardObservatory.API/DTOs/OperationalServerDto.cs`**
   - DTOs para CRUD de servidores operacionales
   - DTOs para importación desde inventario

4. **`SQLGuardObservatory.API/Controllers/OperationalServersController.cs`**
   - Endpoint GET `/api/operationalservers` - Lista servidores configurados
   - Endpoint GET `/api/operationalservers/inventory` - Lista servidores del inventario
   - Endpoint POST `/api/operationalservers` - Crea servidor manual
   - Endpoint POST `/api/operationalservers/import` - Importa desde inventario
   - Endpoint PUT `/api/operationalservers/{id}` - Actualiza servidor
   - Endpoint POST `/api/operationalservers/{id}/toggle` - Habilita/deshabilita
   - Endpoint DELETE `/api/operationalservers/{id}` - Elimina servidor
   - Endpoint GET `/api/operationalservers/audit` - Historial de cambios
   - Endpoint GET `/api/operationalservers/check-permission` - Verifica permisos

### Frontend

1. **`src/pages/OperationalServersConfig.tsx`**
   - Nueva página de configuración de servidores operacionales
   - Importación desde inventario
   - Agregar servidores manuales
   - Editar/eliminar servidores
   - Historial de auditoría

## Archivos Modificados

### Backend

1. **`SQLGuardObservatory.API/Data/ApplicationDbContext.cs`**
   - Añadido DbSets para `OperationalServers` y `OperationalServerAudits`
   - Configuración de relaciones e índices

2. **`SQLGuardObservatory.API/Services/ServerRestartService.cs`**
   - `GetAvailableServersAsync()` ahora filtra servidores según `OperationalServers`
   - Si hay servidores configurados, solo muestra los habilitados para reinicio
   - Si no hay configuración, muestra todos (comportamiento legacy)

3. **`SQLGuardObservatory.API/DTOs/AuthDto.cs`**
   - Añadido campo `IsOnCallEscalation` a `LoginResponse`

4. **`SQLGuardObservatory.API/Services/AuthService.cs`**
   - Retorna `IsOnCallEscalation` en ambos métodos de login

### Frontend

1. **`src/App.tsx`**
   - Nueva ruta `/operations/servers-config`

2. **`src/components/layout/AppSidebar.tsx`**
   - Menú desplegable "Operaciones" con submenús
   - Usa `isOnCallEscalation` para mostrar Config. Servidores

3. **`src/contexts/AuthContext.tsx`**
   - Añadido `isOnCallEscalation` al contexto

4. **`src/services/api.ts`**
   - Nuevo objeto `operationalServersApi` con todos los métodos
   - `LoginResponse` incluye `isOnCallEscalation`
   - Se guarda `isOnCallEscalation` en localStorage

5. **`src/types/index.ts`**
   - Añadido `isOnCallEscalation` a interfaz `User`

## Pasos de Despliegue

### 1. Ejecutar Script SQL

```sql
-- Ejecutar en SQL Server Management Studio
USE [SQLGuardObservatoryAuth];
GO

-- Ejecutar el script
:r "C:\Apps\SQLGuardObservatory\SQL\CreateOperationalServersTables.sql"
```

O abrir el archivo `SQLGuardObservatory.API/SQL/CreateOperationalServersTables.sql` y ejecutarlo manualmente.

### 2. Recompilar y Desplegar Backend

```powershell
cd SQLGuardObservatory.API
dotnet build
dotnet publish -c Release -o C:\Apps\SQLGuardObservatory\API

# Reiniciar el servicio IIS o el sitio
iisreset
# O reiniciar solo el pool de aplicaciones
```

### 3. Recompilar y Desplegar Frontend

```powershell
cd sql-guard-observatory
npm run build

# Copiar dist a IIS
Copy-Item -Path .\dist\* -Destination C:\inetpub\wwwroot\SQLNova -Recurse -Force
```

## Funcionalidad

### Configuración de Servidores Operacionales

1. **Importar desde Inventario**
   - Obtiene servidores de `http://asprbm-nov-01/InventoryDBA/inventario/`
   - Excluye servidores AWS y DMZ
   - Permite seleccionar múltiples servidores para importar

2. **Agregar Manual**
   - Para servidores que no están en el inventario
   - Configurar nombre, ambiente, operaciones habilitadas

3. **Gestión de Servidores**
   - Habilitar/deshabilitar para cada tipo de operación:
     - Reinicio
     - Failover
     - Parcheo
   - Editar descripción y notas
   - Eliminar de la configuración

4. **Auditoría**
   - Historial de todos los cambios
   - Quién hizo el cambio y cuándo

### Comportamiento del Reinicio de Servidores

- Si hay servidores configurados en `OperationalServers` con `EnabledForRestart = true`:
  - Solo esos servidores aparecen en la lista de reinicio
- Si no hay ningún servidor configurado:
  - Se muestran todos los servidores del inventario (comportamiento actual)

## Esquema de Permisos

| Rol/Condición | Ver Reinicio Servidores | Ver Config. Servidores |
|---------------|------------------------|------------------------|
| SuperAdmin    | ✅ | ✅ |
| Admin         | ✅ (si tiene permiso) | ❌ |
| Reader        | ❌ | ❌ |
| IsOnCallEscalation | ✅ (si tiene permiso) | ✅ |

## Notas Adicionales

- Los usuarios de escalamiento (`IsOnCallEscalation`) pueden acceder a la configuración aunque no sean Admin
- El permiso `OperationsConfig` se verifica tanto en frontend (sidebar) como en backend (controller)
- Se mantiene auditoría de todos los cambios para trazabilidad




