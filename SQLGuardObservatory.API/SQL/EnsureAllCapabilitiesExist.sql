-- ============================================================================
-- Script: EnsureAllCapabilitiesExist.sql
-- Descripción: Asegura que todas las capacidades del sistema estén configuradas
--              para el rol SuperAdmin
-- Fecha: 2025-12-26
-- ============================================================================

SET NOCOUNT ON;

PRINT '=== Verificando capacidades del sistema ===';

-- Obtener el ID del rol SuperAdmin
DECLARE @SuperAdminRoleId INT;
SELECT @SuperAdminRoleId = Id FROM AdminRoles WHERE Name = 'SuperAdmin' AND IsActive = 1;

IF @SuperAdminRoleId IS NULL
BEGIN
    PRINT 'ERROR: No se encontró el rol SuperAdmin';
    RETURN;
END

PRINT 'SuperAdmin Role ID: ' + CAST(@SuperAdminRoleId AS VARCHAR(10));

-- Lista completa de capacidades del sistema
DECLARE @Capabilities TABLE (
    CapabilityKey NVARCHAR(100),
    Category NVARCHAR(50)
);

INSERT INTO @Capabilities (CapabilityKey, Category) VALUES
-- Usuarios
('Users.View', 'Usuarios'),
('Users.Create', 'Usuarios'),
('Users.Edit', 'Usuarios'),
('Users.Delete', 'Usuarios'),
('Users.ImportFromAD', 'Usuarios'),
('Users.AssignRoles', 'Usuarios'),
-- Grupos de Seguridad
('Groups.View', 'Grupos'),
('Groups.Create', 'Grupos'),
('Groups.Edit', 'Grupos'),
('Groups.Delete', 'Grupos'),
('Groups.ManageMembers', 'Grupos'),
('Groups.ManagePermissions', 'Grupos'),
('Groups.SyncWithAD', 'Grupos'),
-- Roles
('Roles.View', 'Roles'),
('Roles.Create', 'Roles'),
('Roles.Edit', 'Roles'),
('Roles.Delete', 'Roles'),
('Roles.AssignCapabilities', 'Roles'),
-- Parcheos
('Patching.ConfigureCompliance', 'Parcheos'),
-- Sistema
('System.ConfigureSMTP', 'Sistema'),
('System.ConfigureCollectors', 'Sistema'),
('System.ConfigureAlerts', 'Sistema'),
('System.ManageCredentials', 'Sistema'),
('System.ViewAudit', 'Sistema'),
('System.ManageMenuBadges', 'Sistema'),
('System.ManageLogs', 'Sistema'),
('System.ViewAnalytics', 'Sistema');

-- Insertar capacidades faltantes para SuperAdmin
INSERT INTO AdminRoleCapabilities (RoleId, CapabilityKey, IsEnabled)
SELECT @SuperAdminRoleId, c.CapabilityKey, 1
FROM @Capabilities c
WHERE NOT EXISTS (
    SELECT 1 FROM AdminRoleCapabilities arc 
    WHERE arc.RoleId = @SuperAdminRoleId AND arc.CapabilityKey = c.CapabilityKey
);

PRINT 'Capacidades agregadas para SuperAdmin: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- También agregar capacidades para el rol Admin (con restricciones)
DECLARE @AdminRoleId INT;
SELECT @AdminRoleId = Id FROM AdminRoles WHERE Name = 'Admin' AND IsActive = 1;

IF @AdminRoleId IS NOT NULL
BEGIN
    -- Admin puede ver usuarios, grupos, roles
    INSERT INTO AdminRoleCapabilities (RoleId, CapabilityKey, IsEnabled)
    SELECT @AdminRoleId, c.CapabilityKey, 1
    FROM @Capabilities c
    WHERE c.CapabilityKey IN (
        'Users.View', 'Users.Create', 'Users.Edit',
        'Groups.View', 'Groups.Edit', 'Groups.ManageMembers',
        'Roles.View'
    )
    AND NOT EXISTS (
        SELECT 1 FROM AdminRoleCapabilities arc 
        WHERE arc.RoleId = @AdminRoleId AND arc.CapabilityKey = c.CapabilityKey
    );
    
    PRINT 'Capacidades agregadas para Admin: ' + CAST(@@ROWCOUNT AS VARCHAR(10));
END

-- Verificar estado final
PRINT '';
PRINT '=== Estado final de capacidades por rol ===';

SELECT 
    ar.Name AS RoleName,
    arc.CapabilityKey,
    arc.IsEnabled
FROM AdminRoleCapabilities arc
INNER JOIN AdminRoles ar ON arc.RoleId = ar.Id
WHERE ar.IsActive = 1
ORDER BY ar.Priority DESC, arc.CapabilityKey;

PRINT '';
PRINT '=== Script completado ===';

