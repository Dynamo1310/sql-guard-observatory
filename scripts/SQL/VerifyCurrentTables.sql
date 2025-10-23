-- Script para verificar qué tablas de Health Score existen actualmente

USE SQLNova;
GO

PRINT '=============================================';
PRINT 'VERIFICANDO TABLAS ACTUALES:';
PRINT '=============================================';
PRINT '';

-- Verificar tablas existentes
PRINT '1. Tablas de HealthScore existentes:';
PRINT '';

SELECT 
    name AS TableName,
    create_date AS Created,
    modify_date AS LastModified
FROM sys.tables
WHERE name LIKE '%InstanceHealth%'
ORDER BY name;

PRINT '';
PRINT '2. Columnas en cada tabla:';
PRINT '';

-- InstanceHealth_Score
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    PRINT '--- InstanceHealth_Score ---';
    SELECT name, type_name(system_type_id) AS DataType
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score')
    ORDER BY column_id;
    PRINT '';
END
ELSE
    PRINT '❌ InstanceHealth_Score NO existe';

-- InstanceHealth_Critical
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical')
BEGIN
    PRINT '--- InstanceHealth_Critical ---';
    SELECT name, type_name(system_type_id) AS DataType
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical')
    ORDER BY column_id;
    PRINT '';
END
ELSE
    PRINT '❌ InstanceHealth_Critical NO existe';

-- InstanceHealth_Backups
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Backups')
BEGIN
    PRINT '--- InstanceHealth_Backups ---';
    SELECT name, type_name(system_type_id) AS DataType
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups')
    ORDER BY column_id;
    PRINT '';
END
ELSE
    PRINT '❌ InstanceHealth_Backups NO existe';

-- InstanceHealth_Maintenance
IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Maintenance')
BEGIN
    PRINT '--- InstanceHealth_Maintenance ---';
    SELECT name, type_name(system_type_id) AS DataType
    FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance')
    ORDER BY column_id;
    PRINT '';
END
ELSE
    PRINT '❌ InstanceHealth_Maintenance NO existe';

PRINT '';
PRINT '=============================================';
PRINT 'RECOMENDACIÓN:';
PRINT '=============================================';
PRINT '';
PRINT 'Si NO existen las tablas Critical/Backups:';
PRINT '  → Ejecutar: CreateHealthScoreTables_v2.sql (crea TODO desde cero)';
PRINT '';
PRINT 'Si YA existen todas las tablas:';
PRINT '  → Ejecutar: UpdateHealthScoreTables_v2.sql (solo agrega columnas nuevas)';
PRINT '';

