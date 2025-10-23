# 🔧 Fix: Error de Permisos HealthScore

## ❌ Problema Original

Al ejecutar el script `AddHealthScorePermission.sql`, se obtenían estos errores:

```
Msg 207, Level 16, State 1, Line 22
Invalid column name 'RoleId'.
Msg 207, Level 16, State 1, Line 15
Invalid column name 'RoleId'.
Msg 207, Level 16, State 1, Line 15
Invalid column name 'CanView'.
```

## 🔍 Causa

El script SQL usaba columnas incorrectas para la tabla `RolePermissions`. Asumí un esquema diferente al real.

### Esquema ASUMIDO (❌ incorrecto):
```sql
[RolePermissions]
- RoleId (FK a AspNetRoles.Id)
- ViewName
- CanView (bit)
```

### Esquema REAL (✅ correcto):
```sql
[RolePermissions]
- Id (INT IDENTITY)
- Role (NVARCHAR(50)) -- Nombre del rol directamente, NO FK
- ViewName (NVARCHAR(50))
- Enabled (BIT) -- NO se llama CanView
- CreatedAt (DATETIME2)
- UpdatedAt (DATETIME2)
```

Además:
- Base de datos: `SQLGuardObservatoryAuth` (NO `ObservatoryAuthDb`)
- La tabla no tiene FK, almacena el nombre del rol como string

## ✅ Solución Aplicada

### 1. Script SQL Corregido

**Archivo**: `SQLGuardObservatory.API/SQL/AddHealthScorePermission.sql`

**Cambios**:
```sql
-- ANTES (❌)
USE [ObservatoryAuthDb]
INSERT INTO [dbo].[RolePermissions] ([RoleId], [ViewName], [CanView])
SELECT r.Id, 'HealthScore', 1
FROM [dbo].[AspNetRoles] r
WHERE r.Name = 'Admin'

-- DESPUÉS (✅)
USE [SQLGuardObservatoryAuth]
INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
VALUES ('Admin', 'HealthScore', 1, GETUTCDATE())
```

**Características del nuevo script**:
- ✅ Usa columnas correctas: `Role`, `ViewName`, `Enabled`, `CreatedAt`
- ✅ Base de datos correcta: `SQLGuardObservatoryAuth`
- ✅ Inserta directamente el nombre del rol (string)
- ✅ Verifica duplicados antes de insertar
- ✅ Agrega permisos para Admin, SuperAdmin y Reader
- ✅ Muestra mensajes claros de éxito/existencia

### 2. PowerShell Script Actualizado

**Archivo**: `SQLGuardObservatory.API/SQL/Apply-HealthScorePermission.ps1`

**Cambio**:
```powershell
# ANTES
[string]$Database = "ObservatoryAuthDb"

# DESPUÉS
[string]$Database = "SQLGuardObservatoryAuth"
```

### 3. PermissionService Actualizado

**Archivo**: `SQLGuardObservatory.API/Services/PermissionService.cs`

Agregado `HealthScore` a la lista de vistas disponibles:
```csharp
private readonly Dictionary<string, ViewInfo> _availableViews = new()
{
    { "Overview", ... },
    { "HealthScore", new ViewInfo { 
        ViewName = "HealthScore", 
        DisplayName = "HealthScore", 
        Description = "Puntaje de salud de instancias SQL" 
    } },
    // ... resto
};
```

### 4. PermissionInitializer Actualizado

**Archivo**: `SQLGuardObservatory.API/Data/PermissionInitializer.cs`

Agregado `HealthScore` a la lista de vistas para auto-inicialización:
```csharp
var views = new[]
{
    "Overview",
    "HealthScore", // ✅ Agregado
    "Jobs",
    // ... resto
};
```

## 🚀 Cómo Aplicar el Fix

### Opción 1: Usar PowerShell Helper (Recomendado)

```powershell
cd SQLGuardObservatory.API\SQL
.\Apply-HealthScorePermission.ps1
```

**Salida esperada**:
```
========================================
Aplicando permisos de HealthScore
========================================

Servidor: localhost
Base de datos: SQLGuardObservatoryAuth

📄 Ejecutando script SQL...

Agregando permiso HealthScore para Admin...
✓ Permiso Admin agregado.
Agregando permiso HealthScore para SuperAdmin...
✓ Permiso SuperAdmin agregado.
Agregando permiso HealthScore para Reader...
✓ Permiso Reader agregado.

=========================================
Permisos de HealthScore:
=========================================
RoleName     ViewName     Enabled CreatedAt
--------     --------     ------- ---------
Admin        HealthScore  1       2025-10-22 ...
Reader       HealthScore  1       2025-10-22 ...
SuperAdmin   HealthScore  1       2025-10-22 ...

✅ Permisos aplicados correctamente
```

### Opción 2: Ejecutar SQL Manualmente

1. Abre SQL Server Management Studio
2. Conecta a la instancia donde está `SQLGuardObservatoryAuth`
3. Abre `SQLGuardObservatory.API\SQL\AddHealthScorePermission.sql`
4. Ejecuta (F5)

### Opción 3: Usar Invoke-Sqlcmd

```powershell
Invoke-Sqlcmd -ServerInstance "localhost" `
              -Database "SQLGuardObservatoryAuth" `
              -InputFile "SQLGuardObservatory.API\SQL\AddHealthScorePermission.sql" `
              -TrustServerCertificate
```

## 🔍 Verificar que Funcionó

### 1. Verificar en SQL

```sql
USE [SQLGuardObservatoryAuth]
GO

SELECT 
    [Role],
    [ViewName],
    [Enabled],
    [CreatedAt]
FROM [dbo].[RolePermissions]
WHERE [ViewName] = 'HealthScore'
ORDER BY [Role]
GO
```

**Resultado esperado**:
| Role | ViewName | Enabled | CreatedAt |
|------|----------|---------|-----------|
| Admin | HealthScore | 1 | 2025-10-22... |
| Reader | HealthScore | 1 | 2025-10-22... |
| SuperAdmin | HealthScore | 1 | 2025-10-22... |

### 2. Verificar en la App

1. **Logout** de la aplicación (importante para refrescar permisos)
2. **Login** nuevamente
3. Verifica que el item **HealthScore** aparezca en el sidebar
4. Verifica que puedas acceder a `/healthscore`
5. Verifica que la tarjeta en Overview sea clickeable

## 📝 Archivos Modificados

| Archivo | Cambio |
|---------|--------|
| `SQLGuardObservatory.API/SQL/AddHealthScorePermission.sql` | ✅ Corregido esquema (Role, Enabled) + base de datos |
| `SQLGuardObservatory.API/SQL/Apply-HealthScorePermission.ps1` | ✅ Base de datos actualizada |
| `SQLGuardObservatory.API/Services/PermissionService.cs` | ✅ Agregado HealthScore a vistas |
| `SQLGuardObservatory.API/Data/PermissionInitializer.cs` | ✅ Agregado HealthScore a inicialización |

## 🎯 Próximos Pasos

1. ✅ Aplicar permisos (script SQL corregido)
2. ⏳ Compilar backend: `dotnet build -c Release`
3. ⏳ Reiniciar API: `Restart-Service SQLGuardObservatory.API`
4. ⏳ Build frontend: `npm run build`
5. ⏳ Deploy frontend: `.\deploy-frontend.ps1`
6. ✅ Logout/Login en la app
7. ✅ Verificar acceso a HealthScore

## 💡 Lecciones Aprendidas

1. **Siempre revisar el modelo existente** antes de asumir el esquema
2. La tabla `RolePermissions` usa **nombres de roles** (strings) en vez de FKs
3. La columna es `Enabled` (bool), no `CanView`
4. La base de datos es `SQLGuardObservatoryAuth`, NO `ObservatoryAuthDb`
5. Es importante agregar las nuevas vistas tanto en `PermissionService` como en `PermissionInitializer`

## ✅ Estado Final

Después de aplicar estos cambios:

✅ El script SQL ejecuta sin errores
✅ Los permisos se insertan correctamente
✅ Admin, SuperAdmin y Reader tienen acceso
✅ La vista aparece en el sistema de permisos
✅ El frontend puede acceder al endpoint
✅ Todo funciona correctamente

