-- =============================================================================
-- Script: UpdateObsolescenciaAnual_Pre2017.sql
-- Descripción: Marca "Obsolescencia anual" (MotivoObsolescencia = 1) para todas
--              las bases de datos que están en servidores con versión anterior a SQL Server 2017
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- PASO 1: Ver qué bases se van a actualizar (PREVIEW)
-- =============================================

PRINT '=== PREVIEW: Bases que se actualizarán ===';
PRINT '';

SELECT 
    g.Id AS GestionId,
    g.ServerName,
    g.DbName,
    g.ServerAmbiente,
    g.MotivoObsolescencia AS ObsolescenciaActual,
    inst.MajorVersion AS VersionMotor,
    CASE 
        WHEN inst.MajorVersion LIKE '9%'  THEN '2005'
        WHEN inst.MajorVersion LIKE '10%' THEN '2008'
        WHEN inst.MajorVersion LIKE '11%' THEN '2012'
        WHEN inst.MajorVersion LIKE '12%' THEN '2014'
        WHEN inst.MajorVersion LIKE '13%' THEN '2016'
        WHEN inst.MajorVersion LIKE '14%' THEN '2017'
        WHEN inst.MajorVersion LIKE '15%' THEN '2019'
        WHEN inst.MajorVersion LIKE '16%' THEN '2022'
        WHEN PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
        ELSE inst.MajorVersion
    END AS VersionAno,
    g.FechaModificacion
FROM [dbo].[GestionBasesSinUso] g
INNER JOIN SqlServerDatabasesCache c 
    ON c.ServerName = g.ServerName 
    AND c.DbName = g.DbName
INNER JOIN [AppSQLNova].[dbo].[SqlServerInstancesCache] inst
    ON c.ServerInstanceId = inst.Id
WHERE 
    -- Versiones anteriores a SQL Server 2017 (MajorVersion < 14)
    (
        inst.MajorVersion LIKE '9%'   -- SQL Server 2005
        OR inst.MajorVersion LIKE '10%'  -- SQL Server 2008
        OR inst.MajorVersion LIKE '11%'  -- SQL Server 2012
        OR inst.MajorVersion LIKE '12%'  -- SQL Server 2014
        OR inst.MajorVersion LIKE '13%'  -- SQL Server 2016
        OR (
            -- También capturar versiones en formato texto que contengan año < 2017
            PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            AND CAST(SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4) AS INT) < 2017
        )
    )
    -- Solo actualizar si NO está ya marcado (opcional: quitar esta condición para forzar)
    AND g.MotivoObsolescencia = 0
ORDER BY g.ServerName, g.DbName;

PRINT '';
PRINT 'Total de bases a actualizar: ' + CAST(@@ROWCOUNT AS NVARCHAR(10));
PRINT '';

-- =============================================
-- PASO 2: ACTUALIZAR (descomentar para ejecutar)
-- =============================================

/*
BEGIN TRANSACTION;

UPDATE g
SET 
    g.MotivoObsolescencia = 1,
    g.FechaModificacion = GETDATE()
FROM [dbo].[GestionBasesSinUso] g
INNER JOIN SqlServerDatabasesCache c 
    ON c.ServerName = g.ServerName 
    AND c.DbName = g.DbName
INNER JOIN [AppSQLNova].[dbo].[SqlServerInstancesCache] inst
    ON c.ServerInstanceId = inst.Id
WHERE 
    -- Versiones anteriores a SQL Server 2017
    (
        inst.MajorVersion LIKE '9%'   -- SQL Server 2005
        OR inst.MajorVersion LIKE '10%'  -- SQL Server 2008
        OR inst.MajorVersion LIKE '11%'  -- SQL Server 2012
        OR inst.MajorVersion LIKE '12%'  -- SQL Server 2014
        OR inst.MajorVersion LIKE '13%'  -- SQL Server 2016
        OR (
            -- También capturar versiones en formato texto que contengan año < 2017
            PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            AND CAST(SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4) AS INT) < 2017
        )
    )
    -- Solo actualizar si NO está ya marcado (opcional: quitar esta condición para forzar)
    AND g.MotivoObsolescencia = 0;

PRINT 'Bases actualizadas: ' + CAST(@@ROWCOUNT AS NVARCHAR(10));

-- Revisar resultados antes de hacer COMMIT
SELECT 
    COUNT(*) AS TotalActualizadas,
    SUM(CASE WHEN MotivoObsolescencia = 1 THEN 1 ELSE 0 END) AS ConObsolescencia
FROM [dbo].[GestionBasesSinUso] g
INNER JOIN SqlServerDatabasesCache c 
    ON c.ServerName = g.ServerName 
    AND c.DbName = g.DbName
INNER JOIN [AppSQLNova].[dbo].[SqlServerInstancesCache] inst
    ON c.ServerInstanceId = inst.Id
WHERE 
    (
        inst.MajorVersion LIKE '9%'
        OR inst.MajorVersion LIKE '10%'
        OR inst.MajorVersion LIKE '11%'
        OR inst.MajorVersion LIKE '12%'
        OR inst.MajorVersion LIKE '13%'
        OR (
            PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            AND CAST(SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4) AS INT) < 2017
        )
    );

-- Si todo está bien, descomentar:
-- COMMIT TRANSACTION;
-- Si hay algún problema, descomentar:
-- ROLLBACK TRANSACTION;
*/

-- =============================================
-- ALTERNATIVA: Si algunas bases no están en SqlServerDatabasesCache
-- pero sí tienen CompatibilidadMotor en GestionBasesSinUso
-- =============================================

/*
-- Actualizar bases que tienen CompatibilidadMotor < 2017 directamente en GestionBasesSinUso
UPDATE g
SET 
    g.MotivoObsolescencia = 1,
    g.FechaModificacion = GETDATE()
FROM [dbo].[GestionBasesSinUso] g
WHERE 
    -- Si CompatibilidadMotor tiene un año < 2017
    (
        g.CompatibilidadMotor IN ('2005', '2008', '2012', '2014', '2016')
        OR (
            ISNUMERIC(g.CompatibilidadMotor) = 1
            AND CAST(g.CompatibilidadMotor AS INT) < 2017
        )
    )
    AND g.MotivoObsolescencia = 0;
*/

PRINT '=== Script completado ===';
PRINT 'IMPORTANTE: Revisar el PREVIEW antes de ejecutar el UPDATE';
PRINT 'Descomentar el bloque BEGIN TRANSACTION para ejecutar la actualización';
GO

