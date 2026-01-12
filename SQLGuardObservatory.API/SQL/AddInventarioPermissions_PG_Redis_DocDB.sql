-- ============================================================
-- Script para agregar permisos de Inventario PostgreSQL, Redis y DocumentDB
-- Ejecutar en la base de datos AppSQLNova
-- ============================================================

USE AppSQLNova;
GO

PRINT '========================================='
PRINT 'Agregando permisos de Inventario PostgreSQL, Redis y DocumentDB'
PRINT '========================================='

-- Agregar permisos de PostgreSQL a grupos que ya tienen InventarioSqlServerInstances
INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt, UpdatedAt)
SELECT DISTINCT rp.Role, 'InventarioPostgreSqlInstances', 1, GETUTCDATE(), GETUTCDATE()
FROM RolePermissions rp
WHERE rp.ViewName = 'InventarioSqlServerInstances' 
  AND rp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM RolePermissions rp2 
    WHERE rp2.Role = rp.Role AND rp2.ViewName = 'InventarioPostgreSqlInstances'
  );

PRINT 'Agregados permisos InventarioPostgreSqlInstances'

INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt, UpdatedAt)
SELECT DISTINCT rp.Role, 'InventarioPostgreSqlDatabases', 1, GETUTCDATE(), GETUTCDATE()
FROM RolePermissions rp
WHERE rp.ViewName = 'InventarioSqlServerDatabases' 
  AND rp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM RolePermissions rp2 
    WHERE rp2.Role = rp.Role AND rp2.ViewName = 'InventarioPostgreSqlDatabases'
  );

PRINT 'Agregados permisos InventarioPostgreSqlDatabases'

-- Agregar permisos de Redis a grupos que ya tienen InventarioMenu
INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt, UpdatedAt)
SELECT DISTINCT rp.Role, 'InventarioRedisInstances', 1, GETUTCDATE(), GETUTCDATE()
FROM RolePermissions rp
WHERE rp.ViewName = 'InventarioMenu' 
  AND rp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM RolePermissions rp2 
    WHERE rp2.Role = rp.Role AND rp2.ViewName = 'InventarioRedisInstances'
  );

PRINT 'Agregados permisos InventarioRedisInstances'

-- Agregar permisos de DocumentDB a grupos que ya tienen InventarioMenu
INSERT INTO RolePermissions (Role, ViewName, Enabled, CreatedAt, UpdatedAt)
SELECT DISTINCT rp.Role, 'InventarioDocumentDbInstances', 1, GETUTCDATE(), GETUTCDATE()
FROM RolePermissions rp
WHERE rp.ViewName = 'InventarioMenu' 
  AND rp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM RolePermissions rp2 
    WHERE rp2.Role = rp.Role AND rp2.ViewName = 'InventarioDocumentDbInstances'
  );

PRINT 'Agregados permisos InventarioDocumentDbInstances'

-- Verificar permisos agregados
SELECT 
    Role,
    ViewName,
    Enabled,
    CreatedAt
FROM RolePermissions
WHERE ViewName IN (
    'InventarioPostgreSqlInstances',
    'InventarioPostgreSqlDatabases',
    'InventarioRedisInstances',
    'InventarioDocumentDbInstances'
)
ORDER BY Role, ViewName;

PRINT '========================================='
PRINT 'Script completado exitosamente'
PRINT '========================================='
GO



