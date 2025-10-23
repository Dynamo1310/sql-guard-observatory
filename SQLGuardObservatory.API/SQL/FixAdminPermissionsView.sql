-- ================================================================
-- Script para corregir permisos de la vista AdminPermissions
-- Solo SuperAdmin debe tener acceso a AdminPermissions
-- ================================================================

USE SQLGuardObservatory;
GO

-- 1. Verificar permisos actuales
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'AdminPermissions'
ORDER BY Role;
GO

-- 2. Eliminar permisos incorrectos de Admin y Reader para AdminPermissions
DELETE FROM RolePermissions 
WHERE ViewName = 'AdminPermissions' 
  AND Role IN ('Admin', 'Reader');
GO

-- 3. Asegurar que SuperAdmin tiene acceso
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'AdminPermissions')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'AdminPermissions', 1);
END
ELSE
BEGIN
    UPDATE RolePermissions 
    SET Enabled = 1 
    WHERE Role = 'SuperAdmin' AND ViewName = 'AdminPermissions';
END
GO

-- 4. Verificar resultado final
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'AdminPermissions'
ORDER BY Role;
GO

PRINT 'Permisos de AdminPermissions corregidos correctamente.';
PRINT 'Solo SuperAdmin tiene acceso ahora.';
GO

