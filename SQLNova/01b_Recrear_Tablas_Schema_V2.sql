-- =============================================
-- Sistema Health Score V2 - RECREAR TABLAS
-- USAR SOLO SI YA EXISTEN TABLAS CON ESQUEMA INCORRECTO
-- =============================================
USE SQLNova;
GO

PRINT 'ADVERTENCIA: Este script eliminará las tablas existentes y sus datos';
PRINT 'Presiona Ctrl+C para cancelar o espera 5 segundos...';
WAITFOR DELAY '00:00:05';
GO

-- =============================================
-- Eliminar vistas que dependen de las tablas
-- =============================================
PRINT 'Eliminando vistas existentes...';

IF OBJECT_ID('dbo.vw_HealthFinal_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthFinal_V2;
IF OBJECT_ID('dbo.vw_HealthRaw_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthRaw_V2;
IF OBJECT_ID('dbo.vw_CategoryScores_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_CategoryScores_V2;
IF OBJECT_ID('dbo.vw_HealthTendencias_24h_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthTendencias_24h_V2;
IF OBJECT_ID('dbo.vw_HealthTendencias_7d_V2', 'V') IS NOT NULL DROP VIEW dbo.vw_HealthTendencias_7d_V2;

IF OBJECT_ID('dbo.vw_Score_ConfigRecursos', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_ConfigRecursos;
IF OBJECT_ID('dbo.vw_Score_Mantenimiento', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Mantenimiento;
IF OBJECT_ID('dbo.vw_Score_Memoria', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Memoria;
IF OBJECT_ID('dbo.vw_Score_Discos', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Discos;
IF OBJECT_ID('dbo.vw_Score_IO', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_IO;
IF OBJECT_ID('dbo.vw_Score_CPU', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_CPU;
IF OBJECT_ID('dbo.vw_Score_ErroresSev', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_ErroresSev;
IF OBJECT_ID('dbo.vw_Score_Conectividad', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Conectividad;
IF OBJECT_ID('dbo.vw_Score_AG', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_AG;
IF OBJECT_ID('dbo.vw_Score_Backups', 'V') IS NOT NULL DROP VIEW dbo.vw_Score_Backups;

PRINT 'Vistas eliminadas.';
GO

-- =============================================
-- Eliminar tablas en orden
-- =============================================
PRINT 'Eliminando tablas existentes...';

IF OBJECT_ID('dbo.HealthScoreAlertas', 'U') IS NOT NULL DROP TABLE dbo.HealthScoreAlertas;
IF OBJECT_ID('dbo.InventarioConfigRecursosSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioConfigRecursosSnapshot;
IF OBJECT_ID('dbo.InventarioMantenimientoSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioMantenimientoSnapshot;
IF OBJECT_ID('dbo.InventarioMemoriaSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioMemoriaSnapshot;
IF OBJECT_ID('dbo.InventarioDiscosSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioDiscosSnapshot;
IF OBJECT_ID('dbo.InventarioIOSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioIOSnapshot;
IF OBJECT_ID('dbo.InventarioCPUSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioCPUSnapshot;
IF OBJECT_ID('dbo.InventarioErroresSevSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioErroresSevSnapshot;
IF OBJECT_ID('dbo.InventarioConectividadSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioConectividadSnapshot;
IF OBJECT_ID('dbo.InventarioAGSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioAGSnapshot;
IF OBJECT_ID('dbo.InventarioBackupSnapshot', 'U') IS NOT NULL DROP TABLE dbo.InventarioBackupSnapshot;
IF OBJECT_ID('dbo.CollectorLog', 'U') IS NOT NULL DROP TABLE dbo.CollectorLog;

PRINT 'Tablas eliminadas.';
GO

-- =============================================
-- Ahora ejecuta el script 01 normal para recrearlas
-- =============================================
PRINT '';
PRINT 'Ahora ejecuta: sqlcmd -S <Servidor> -d SQLNova -i 01_Schema_HealthScore_V2.sql';
PRINT '';
GO

