# Solución: Error "Invalid object name 'RolePermissions'"

## 📋 Problema

Al intentar acceder a las vistas de "Usuarios" o "Permisos" en el sidebar, aparece el siguiente error en los logs:

```
Microsoft.Data.SqlClient.SqlException (0x80131904): Invalid object name 'RolePermissions'.
```

### Causa

La tabla `RolePermissions` no existe en la base de datos `SQLGuardObservatoryAuth`. Esta tabla es necesaria para el sistema de permisos basados en roles que se agregó recientemente.

## 🔧 Solución

Existen **3 opciones** para crear la tabla. Elige la que te resulte más conveniente:

---

## Opción 1: Script Automatizado PowerShell (Recomendado)

Esta es la opción más rápida y automática.

### Pasos:

1. **Detener el servicio del backend**:
   ```powershell
   Stop-Service -Name "SQLGuardObservatory.API"
   ```

2. **Navegar al directorio SQL del backend**:
   ```powershell
   cd C:\Apps\SQLGuardObservatory\Backend\SQL
   ```

3. **Ejecutar el script de migración**:
   ```powershell
   .\Apply-RolePermissionsMigration.ps1
   ```

4. **Reiniciar el servicio del backend**:
   ```powershell
   Start-Service -Name "SQLGuardObservatory.API"
   ```

5. **Verificar que todo funciona**:
   - Abre un navegador y ve a: `http://localhost:8080`
   - Inicia sesión con tu usuario
   - Intenta acceder a las vistas de "Usuarios" y "Permisos" en el sidebar

---

## Opción 2: SQL Server Management Studio (SSMS)

Si prefieres usar una interfaz gráfica:

### Pasos:

1. **Abrir SQL Server Management Studio (SSMS)**

2. **Conectarte al servidor** `SSPR17MON-01`

3. **Abrir el archivo SQL**:
   - Menú: `File` → `Open` → `File...`
   - Navegar a: `C:\Apps\SQLGuardObservatory\Backend\SQL\CreateRolePermissionsTable.sql`

4. **Verificar la base de datos**:
   - Asegúrate de que en la parte superior esté seleccionada la base de datos `SQLGuardObservatoryAuth`
   - O simplemente ejecuta el script, ya que contiene `USE [SQLGuardObservatoryAuth]`

5. **Ejecutar el script**:
   - Presiona **F5** o haz clic en el botón **Execute**

6. **Verificar el resultado**:
   - Deberías ver el mensaje: `Tabla RolePermissions creada exitosamente con permisos por defecto.`

7. **Reiniciar el servicio del backend**:
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API"
   ```

---

## Opción 3: Comando sqlcmd desde PowerShell

Si no tienes SSMS instalado pero tienes las herramientas de línea de comandos de SQL Server:

### Pasos:

```powershell
# 1. Navegar al directorio SQL
cd C:\Apps\SQLGuardObservatory\Backend\SQL

# 2. Ejecutar el script SQL
sqlcmd -S SSPR17MON-01 -d SQLGuardObservatoryAuth -U ScriptExec -P susana.9 -i CreateRolePermissionsTable.sql

# 3. Reiniciar el servicio
Restart-Service -Name "SQLGuardObservatory.API"
```

---

## ✅ Verificación

Después de aplicar la solución, verifica que todo esté funcionando correctamente:

### 1. Verificar la tabla en SQL Server

Ejecuta esta consulta en SSMS:

```sql
USE [SQLGuardObservatoryAuth];
GO

-- Ver los permisos creados
SELECT Role, ViewName, Enabled 
FROM [dbo].[RolePermissions] 
ORDER BY Role, ViewName;
```

**Resultado esperado:**

| Role       | ViewName         | Enabled |
|------------|------------------|---------|
| SuperAdmin | Overview         | 1       |
| SuperAdmin | Jobs             | 1       |
| SuperAdmin | Disks            | 1       |
| SuperAdmin | Databases        | 1       |
| SuperAdmin | Backups          | 1       |
| SuperAdmin | Indexes          | 1       |
| SuperAdmin | AdminUsers       | 1       |
| SuperAdmin | AdminPermissions | 1       |
| Admin      | Overview         | 1       |
| Admin      | Jobs             | 1       |
| Admin      | Disks            | 1       |
| Admin      | Databases        | 1       |
| Admin      | Backups          | 1       |
| Admin      | Indexes          | 1       |
| Admin      | AdminUsers       | 1       |
| Reader     | Overview         | 1       |
| Reader     | Jobs             | 1       |
| Reader     | Disks            | 1       |
| Reader     | Databases        | 1       |
| Reader     | Backups          | 1       |
| Reader     | Indexes          | 1       |

### 2. Verificar los logs del backend

```powershell
# Ver los últimos logs
Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 50
```

**No deberías ver más errores** relacionados con `RolePermissions`.

### 3. Probar la interfaz web

1. Abre un navegador
2. Ve a: `http://localhost:8080` (o `http://asprbm-nov-01:8080` si accedes remotamente)
3. Inicia sesión con tu usuario SuperAdmin (`TB03260`)
4. En el sidebar, haz clic en:
   - **Usuarios** (bajo "Administración")
   - **Permisos** (bajo "Administración")

**Ambas vistas deberían cargar sin errores.**

---

## 🔄 Para Futuros Despliegues

Si necesitas desplegar el backend en otro servidor o reinstalarlo:

1. **Usa el script de despliegue actualizado**:
   ```powershell
   .\deploy-backend.ps1
   ```

2. **Sigue las instrucciones** que aparecen al final del script, especialmente el paso 1 que te recuerda aplicar la migración.

3. Los scripts SQL ya estarán copiados en `C:\Apps\SQLGuardObservatory\Backend\SQL\`

---

## 📞 Soporte

Si después de aplicar la solución sigues teniendo problemas:

1. **Revisar los logs del backend**:
   ```powershell
   Get-Content "C:\Apps\SQLGuardObservatory\Backend\logs\error.log" -Tail 100
   ```

2. **Verificar que la tabla existe**:
   ```sql
   USE [SQLGuardObservatoryAuth];
   SELECT TABLE_NAME 
   FROM INFORMATION_SCHEMA.TABLES 
   WHERE TABLE_NAME = 'RolePermissions';
   ```

3. **Verificar el estado del servicio**:
   ```powershell
   Get-Service -Name "SQLGuardObservatory.API"
   ```

4. **Reiniciar el servicio**:
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API" -Force
   ```

---

## 📝 Notas Técnicas

- **Base de datos**: `SQLGuardObservatoryAuth` en `SSPR17MON-01`
- **Tabla nueva**: `RolePermissions`
- **Estructura**:
  - `Id`: INT (Primary Key, Identity)
  - `Role`: NVARCHAR(50) (SuperAdmin, Admin, Reader)
  - `ViewName`: NVARCHAR(50) (Overview, Jobs, Disks, etc.)
  - `Enabled`: BIT (1 = habilitado, 0 = deshabilitado)
  - `CreatedAt`: DATETIME2(7)
  - `UpdatedAt`: DATETIME2(7) (nullable)
- **Índice único**: `(Role, ViewName)` para evitar duplicados
- **Permisos iniciales**: 21 registros (8 para SuperAdmin, 7 para Admin, 6 para Reader)

---

**Última actualización**: 20 de octubre de 2025

