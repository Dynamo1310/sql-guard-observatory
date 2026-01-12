-- =====================================================================
-- Script: AddInventarioPermissions.sql
-- Descripción: Agrega los permisos de Inventario SQL Server a los grupos
--              que ya tienen permisos de infraestructura/bases de datos
-- Fecha: 2025-12-28
-- =====================================================================

USE AppSQLNova;
GO

SET NOCOUNT ON;

PRINT '=========================================='
PRINT 'Agregando permisos de Inventario SQL Server'
PRINT '=========================================='

-- =====================================================================
-- 1. INVENTARIO MENU
-- Si el grupo tiene algún permiso de infraestructura (Disks, Databases, Backups),
-- se le agrega el menú de Inventario
-- =====================================================================
PRINT ''
PRINT '1. Procesando InventarioMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'InventarioMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('Disks', 'Databases', 'Backups', 'InfraestructuraMenu')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'InventarioMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 2. INVENTARIO SQL SERVER - INSTANCIAS
-- Si el grupo tiene InventarioMenu, darle acceso a Instancias SQL Server
-- =====================================================================
PRINT ''
PRINT '2. Procesando InventarioSqlServerInstances...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'InventarioSqlServerInstances', 1
FROM GroupPermissions gp
WHERE gp.ViewName = 'InventarioMenu'
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'InventarioSqlServerInstances'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 3. INVENTARIO SQL SERVER - BASES DE DATOS
-- Si el grupo tiene InventarioMenu, darle acceso a Bases de Datos SQL Server
-- =====================================================================
PRINT ''
PRINT '3. Procesando InventarioSqlServerDatabases...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'InventarioSqlServerDatabases', 1
FROM GroupPermissions gp
WHERE gp.ViewName = 'InventarioMenu'
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'InventarioSqlServerDatabases'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 4. VERIFICACIÓN: Mostrar grupos con los nuevos permisos de Inventario
-- =====================================================================
PRINT ''
PRINT '=========================================='
PRINT 'Resumen de permisos de Inventario por grupo:'
PRINT '=========================================='

SELECT 
    sg.Name AS Grupo,
    STRING_AGG(gp.ViewName, ', ') WITHIN GROUP (ORDER BY gp.ViewName) AS PermisosInventario
FROM GroupPermissions gp
INNER JOIN SecurityGroups sg ON gp.GroupId = sg.Id
WHERE gp.ViewName IN (
    'InventarioMenu', 
    'InventarioSqlServerInstances', 
    'InventarioSqlServerDatabases'
)
AND gp.Enabled = 1
GROUP BY sg.Name
ORDER BY sg.Name;

PRINT ''
PRINT '=========================================='
PRINT 'Script completado exitosamente'
PRINT '=========================================='
GO



