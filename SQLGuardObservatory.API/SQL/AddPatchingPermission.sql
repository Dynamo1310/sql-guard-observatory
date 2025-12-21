-- Script para agregar el permiso de Patching
-- Ejecutar después de desplegar el backend actualizado

-- Verificar si el permiso ya existe para SuperAdmin
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'Patching')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'Patching', 1);
    PRINT 'Permiso Patching agregado para SuperAdmin';
END
ELSE
BEGIN
    PRINT 'Permiso Patching ya existe para SuperAdmin';
END

-- Opcionalmente agregar para Admin también
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'Admin' AND ViewName = 'Patching')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('Admin', 'Patching', 1);
    PRINT 'Permiso Patching agregado para Admin';
END
ELSE
BEGIN
    PRINT 'Permiso Patching ya existe para Admin';
END

-- Verificar los permisos creados
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'Patching'
ORDER BY Role;

