-- =====================================================================
-- Script: AddNewMenuPermissions.sql
-- Descripción: Agrega los nuevos permisos de menús contenedores a todos
--              los grupos existentes que tienen permisos relacionados
-- Fecha: 2025-01-26
-- =====================================================================

USE AppSQLNova;
GO

SET NOCOUNT ON;

PRINT '=========================================='
PRINT 'Agregando nuevos permisos de menús contenedores'
PRINT '=========================================='

-- =====================================================================
-- 1. OBSERVABILIDAD > MONITOREO
-- Si el grupo tiene HealthScore o AdminCollectors, darle MonitoreoMenu
-- =====================================================================
PRINT ''
PRINT '1. Procesando MonitoreoMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'MonitoreoMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('HealthScore', 'AdminCollectors')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'MonitoreoMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 2. OBSERVABILIDAD > INFRAESTRUCTURA
-- Si el grupo tiene Disks, Databases o Backups, darle InfraestructuraMenu
-- =====================================================================
PRINT ''
PRINT '2. Procesando InfraestructuraMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'InfraestructuraMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('Disks', 'Databases', 'Backups')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'InfraestructuraMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 3. OBSERVABILIDAD > RENDIMIENTO
-- Si el grupo tiene Jobs o Indexes, darle RendimientoMenu
-- =====================================================================
PRINT ''
PRINT '3. Procesando RendimientoMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'RendimientoMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('Jobs', 'Indexes')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'RendimientoMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 4. ADMINISTRACIÓN > CONTROL DE ACCESO
-- Si el grupo tiene AdminUsers, AdminGroups o AdminRoles, darle ControlAccesoMenu
-- =====================================================================
PRINT ''
PRINT '4. Procesando ControlAccesoMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'ControlAccesoMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('AdminUsers', 'AdminGroups', 'AdminRoles')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'ControlAccesoMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 5. ADMINISTRACIÓN > CONFIGURACIÓN
-- Si el grupo tiene ConfigSMTP o AdminMenuBadges, darle ConfiguracionMenu
-- =====================================================================
PRINT ''
PRINT '5. Procesando ConfiguracionMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'ConfiguracionMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('ConfigSMTP', 'AdminMenuBadges')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'ConfiguracionMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 6. ADMINISTRACIÓN > MONITOREO SISTEMA
-- Si el grupo tiene AdminLogs, darle MonitoreoSistemaMenu
-- =====================================================================
PRINT ''
PRINT '6. Procesando MonitoreoSistemaMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'MonitoreoSistemaMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('AdminLogs')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'MonitoreoSistemaMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 7. ADMINISTRACIÓN > ALERTAS
-- Si el grupo tiene AlertaServidoresCaidos o AlertaResumenOverview, darle AlertsMenu
-- =====================================================================
PRINT ''
PRINT '7. Procesando AlertsMenu...'

INSERT INTO GroupPermissions (GroupId, ViewName, Enabled)
SELECT DISTINCT gp.GroupId, 'AlertsMenu', 1
FROM GroupPermissions gp
WHERE gp.ViewName IN ('AlertaServidoresCaidos', 'AlertaResumenOverview')
  AND gp.Enabled = 1
  AND NOT EXISTS (
    SELECT 1 FROM GroupPermissions gp2 
    WHERE gp2.GroupId = gp.GroupId AND gp2.ViewName = 'AlertsMenu'
  );

PRINT '   - Registros insertados: ' + CAST(@@ROWCOUNT AS VARCHAR(10));

-- =====================================================================
-- 8. VERIFICACIÓN: Mostrar grupos con los nuevos permisos
-- =====================================================================
PRINT ''
PRINT '=========================================='
PRINT 'Resumen de permisos agregados por grupo:'
PRINT '=========================================='

SELECT 
    sg.Name AS Grupo,
    STRING_AGG(gp.ViewName, ', ') WITHIN GROUP (ORDER BY gp.ViewName) AS NuevosPermisos
FROM GroupPermissions gp
INNER JOIN SecurityGroups sg ON gp.GroupId = sg.Id
WHERE gp.ViewName IN (
    'MonitoreoMenu', 
    'InfraestructuraMenu', 
    'RendimientoMenu', 
    'ControlAccesoMenu', 
    'ConfiguracionMenu', 
    'MonitoreoSistemaMenu',
    'AlertsMenu'
)
AND gp.Enabled = 1
GROUP BY sg.Name
ORDER BY sg.Name;

PRINT ''
PRINT '=========================================='
PRINT 'Script completado exitosamente'
PRINT '=========================================='
GO

