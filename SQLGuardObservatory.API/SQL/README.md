# Scripts SQL para SQLGuardObservatory

## CreateRolePermissionsTable.sql

Este script crea la tabla `RolePermissions` necesaria para el sistema de permisos por roles.

### Cómo ejecutar el script en el servidor:

#### Opción 1: Usando SQL Server Management Studio (SSMS)

1. Abre **SQL Server Management Studio** en el servidor `SSPR17MON-01`
2. Conéctate a la instancia de SQL Server
3. Abre el archivo `CreateRolePermissionsTable.sql`
4. Asegúrate de que la base de datos seleccionada sea `SQLGuardObservatoryAuth` (o ejecuta `USE [SQLGuardObservatoryAuth]`)
5. Presiona **F5** o haz clic en **Execute** para ejecutar el script
6. Verifica que aparezca el mensaje: "Tabla RolePermissions creada exitosamente con permisos por defecto."

#### Opción 2: Usando sqlcmd desde PowerShell

```powershell
# Navegar al directorio donde está el script
cd C:\Apps\SQLGuardObservatory\Backend\SQL

# Ejecutar el script usando sqlcmd
sqlcmd -S SSPR17MON-01 -U ScriptExec -P susana.9 -i CreateRolePermissionsTable.sql
```

### Verificación

Para verificar que la tabla se creó correctamente, ejecuta esta consulta en SSMS:

```sql
USE [SQLGuardObservatoryAuth];
GO

-- Verificar que la tabla existe
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME = 'RolePermissions';

-- Ver los permisos creados
SELECT * FROM [dbo].[RolePermissions] ORDER BY Role, ViewName;
```

Deberías ver:
- 8 registros para SuperAdmin (todas las vistas)
- 7 registros para Admin (todas excepto AdminPermissions)
- 6 registros para Reader (solo vistas de observabilidad)

### Después de ejecutar el script

1. Reinicia el servicio de backend:
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API"
   ```

2. Verifica que la aplicación inicie sin errores revisando los logs

3. Intenta acceder a las vistas de "Usuarios" y "Permisos" desde la interfaz web

---

**Nota**: Este script es idempotente - si la tabla ya existe, puedes eliminarla primero con:
```sql
USE [SQLGuardObservatoryAuth];
DROP TABLE IF EXISTS [dbo].[RolePermissions];
GO
```

Y luego ejecutar el script `CreateRolePermissionsTable.sql` nuevamente.

