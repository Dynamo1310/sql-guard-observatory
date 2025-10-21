# ⚡ Arreglo Rápido - Error de Tabla RolePermissions

## 🎯 Problema
Al acceder a "Usuarios" o "Permisos" aparece error: `Invalid object name 'RolePermissions'`

## ✅ Solución Rápida (3 pasos)

### **Servidor de Producción (ASPRBM-NOV-01)**

Abre PowerShell como **Administrador** y ejecuta:

```powershell
# 1. Detener el servicio
Stop-Service -Name "SQLGuardObservatory.API"

# 2. Aplicar la migración SQL
cd C:\Apps\SQLGuardObservatory\Backend\SQL
.\Apply-RolePermissionsMigration.ps1

# 3. Iniciar el servicio
Start-Service -Name "SQLGuardObservatory.API"
```

### **Tu PC de Desarrollo (Para preparar los archivos)**

Si aún no has copiado los archivos SQL al servidor, ejecuta en tu PC:

```powershell
# En el directorio del proyecto: sql-guard-observatory
.\deploy-backend.ps1
```

Esto compilará y copiará todo al servidor, incluyendo los scripts SQL.

---

## 🔍 Verificar que Funciona

1. Abre un navegador
2. Ve a: `http://asprbm-nov-01:8080`
3. Inicia sesión con `TB03260`
4. Haz clic en "Usuarios" y "Permisos" en el sidebar
5. **Ambas vistas deberían cargar sin errores** ✅

---

## 📋 Alternativa Manual (si el script falla)

Si el script PowerShell no funciona:

1. **Abrir SQL Server Management Studio (SSMS)**
2. Conectar a `SSPR17MON-01`
3. Abrir el archivo: `C:\Apps\SQLGuardObservatory\Backend\SQL\CreateRolePermissionsTable.sql`
4. Presionar **F5** para ejecutar
5. Reiniciar el servicio:
   ```powershell
   Restart-Service -Name "SQLGuardObservatory.API"
   ```

---

## ❓ ¿Qué Hace el Script?

Crea la tabla `RolePermissions` en la base de datos `SQLGuardObservatoryAuth` con permisos por defecto para los 3 roles:

- **SuperAdmin** (TB03260): Acceso total (8 vistas)
- **Admin**: Acceso a todo excepto configuración de permisos (7 vistas)  
- **Reader**: Solo vistas de observabilidad (6 vistas)

---

**Tiempo estimado**: 2-3 minutos ⏱️

Para más detalles, ver: `SOLUCION_TABLA_ROLEPERMISSIONS.md`

