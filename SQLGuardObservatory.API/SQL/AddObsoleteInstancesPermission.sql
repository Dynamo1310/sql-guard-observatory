-- Script para agregar el permiso de ObsoleteInstances (Instancias Obsoletas)
-- Ejecutar después de desplegar el backend actualizado
-- Fecha: 2024-12-29

-- Verificar si el permiso ya existe para SuperAdmin
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'SuperAdmin' AND ViewName = 'ObsoleteInstances')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('SuperAdmin', 'ObsoleteInstances', 1);
    PRINT 'Permiso ObsoleteInstances agregado para SuperAdmin';
END
ELSE
BEGIN
    PRINT 'Permiso ObsoleteInstances ya existe para SuperAdmin';
END

-- Agregar para Admin también
IF NOT EXISTS (SELECT 1 FROM RolePermissions WHERE Role = 'Admin' AND ViewName = 'ObsoleteInstances')
BEGIN
    INSERT INTO RolePermissions (Role, ViewName, Enabled)
    VALUES ('Admin', 'ObsoleteInstances', 1);
    PRINT 'Permiso ObsoleteInstances agregado para Admin';
END
ELSE
BEGIN
    PRINT 'Permiso ObsoleteInstances ya existe para Admin';
END

-- Verificar los permisos creados
SELECT Role, ViewName, Enabled 
FROM RolePermissions 
WHERE ViewName = 'ObsoleteInstances'
ORDER BY Role;



