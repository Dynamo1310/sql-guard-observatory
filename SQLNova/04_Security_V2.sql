-- =============================================
-- Sistema Health Score V2 - Seguridad y Permisos
-- Base de datos: SQLNova
-- =============================================
USE SQLNova;
GO

-- =============================================
-- 1. Crear rol para Collectors (escritura)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'HealthScore_Collector_Role' AND type = 'R')
BEGIN
    CREATE ROLE HealthScore_Collector_Role;
    PRINT 'Rol HealthScore_Collector_Role creado';
END
GO

-- Permisos de INSERT en tablas de snapshots
GRANT INSERT ON dbo.InventarioBackupSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioAGSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioConectividadSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioErroresSevSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioCPUSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioIOSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioDiscosSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioMemoriaSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioMantenimientoSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.InventarioConfigRecursosSnapshot TO HealthScore_Collector_Role;
GRANT INSERT ON dbo.CollectorLog TO HealthScore_Collector_Role;

-- SELECT mínimo para validación
GRANT SELECT ON dbo.CollectorLog TO HealthScore_Collector_Role;

PRINT 'Permisos de escritura asignados a HealthScore_Collector_Role';
GO

-- =============================================
-- 2. Crear rol para API (solo lectura)
-- =============================================
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'HealthScore_API_Role' AND type = 'R')
BEGIN
    CREATE ROLE HealthScore_API_Role;
    PRINT 'Rol HealthScore_API_Role creado';
END
GO

-- Permisos de SELECT en vistas
GRANT SELECT ON dbo.vw_Score_Backups TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_AG TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_Conectividad TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_ErroresSev TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_CPU TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_IO TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_Discos TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_Memoria TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_Mantenimiento TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_Score_ConfigRecursos TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_CategoryScores_V2 TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_HealthRaw_V2 TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_HealthFinal_V2 TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_HealthTendencias_24h_V2 TO HealthScore_API_Role;
GRANT SELECT ON dbo.vw_HealthTendencias_7d_V2 TO HealthScore_API_Role;

-- SELECT en tablas de snapshots para históricos
GRANT SELECT ON dbo.InventarioBackupSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioAGSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioConectividadSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioErroresSevSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioCPUSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioIOSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioDiscosSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioMemoriaSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioMantenimientoSnapshot TO HealthScore_API_Role;
GRANT SELECT ON dbo.InventarioConfigRecursosSnapshot TO HealthScore_API_Role;

-- SELECT en alertas
GRANT SELECT ON dbo.HealthScoreAlertas TO HealthScore_API_Role;

PRINT 'Permisos de lectura asignados a HealthScore_API_Role';
GO

-- =============================================
-- 3. Crear login/usuario para Collectors (Windows Auth)
-- NOTA: Ajustar el dominio/cuenta según tu entorno
-- =============================================
/*
-- Ejemplo para cuenta de servicio Windows
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'DOMAIN\svc_healthscore_collector')
BEGIN
    CREATE LOGIN [DOMAIN\svc_healthscore_collector] FROM WINDOWS;
    PRINT 'Login svc_healthscore_collector creado';
END
GO

USE SQLNova;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'svc_healthscore_collector')
BEGIN
    CREATE USER svc_healthscore_collector FOR LOGIN [DOMAIN\svc_healthscore_collector];
    ALTER ROLE HealthScore_Collector_Role ADD MEMBER svc_healthscore_collector;
    PRINT 'Usuario svc_healthscore_collector agregado al rol Collector';
END
GO
*/

-- =============================================
-- 4. Crear login/usuario para API (SQL Auth o Windows Auth)
-- NOTA: Ajustar según tu entorno
-- =============================================
/*
-- Ejemplo SQL Auth (cambiar password)
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'healthscore_api_user')
BEGIN
    CREATE LOGIN healthscore_api_user WITH PASSWORD = 'C0mpl3x!Pa$$w0rd', CHECK_POLICY = ON;
    PRINT 'Login healthscore_api_user creado';
END
GO

USE SQLNova;
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'healthscore_api_user')
BEGIN
    CREATE USER healthscore_api_user FOR LOGIN healthscore_api_user;
    ALTER ROLE HealthScore_API_Role ADD MEMBER healthscore_api_user;
    PRINT 'Usuario healthscore_api_user agregado al rol API';
END
GO
*/

-- =============================================
-- 5. Permisos de ejecución para procedimientos
-- =============================================
GRANT EXECUTE ON dbo.usp_RegistrarAlerta_V2 TO HealthScore_API_Role;
GO

PRINT '';
PRINT '==============================================';
PRINT 'Configuración de seguridad completada';
PRINT '==============================================';
PRINT '';
PRINT 'ACCIÓN REQUERIDA:';
PRINT '1. Descomentar y ajustar las secciones 3 y 4 con las cuentas de tu dominio';
PRINT '2. Ejecutar: ALTER ROLE HealthScore_Collector_Role ADD MEMBER [TuUsuarioCollector]';
PRINT '3. Ejecutar: ALTER ROLE HealthScore_API_Role ADD MEMBER [TuUsuarioAPI]';
PRINT '';
GO

