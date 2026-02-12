-- =============================================================================
-- Script: MapServerInstanceId_Example.sql
-- Descripción: Ejemplos de cómo mapear ServerInstanceId desde ServerName
--              para insertar bases eliminadas en GestionBasesSinUso
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- OPCIÓN 1: Buscar en SqlServerDatabasesCache (misma base)
-- Si la base aún existe en el cache, obtener ServerInstanceId desde ahí
-- =============================================

-- Ver todas las instancias disponibles con sus IDs
SELECT 
    DISTINCT 
    c.ServerInstanceId,
    c.ServerName,
    c.ServerAmbiente,
    COUNT(*) AS CantidadBases
FROM SqlServerDatabasesCache c
GROUP BY c.ServerInstanceId, c.ServerName, c.ServerAmbiente
ORDER BY c.ServerName;

-- Buscar ServerInstanceId para un servidor específico
SELECT 
    DISTINCT 
    c.ServerInstanceId,
    c.ServerName,
    c.ServerAmbiente
FROM SqlServerDatabasesCache c
WHERE c.ServerName = N'SRVPROD01'  -- Reemplazar con tu ServerName
ORDER BY c.ServerInstanceId;

-- Obtener también el DatabaseId si la base aún existe
SELECT 
    c.ServerInstanceId,
    c.DatabaseId,
    c.ServerName,
    c.DbName,
    c.ServerAmbiente
FROM SqlServerDatabasesCache c
WHERE c.ServerName = N'SRVPROD01'
  AND c.DbName = N'MiBaseDeDatos';  -- Reemplazar con tu DbName

-- =============================================
-- OPCIÓN 2: Buscar en SqlServerInstancesCache (base AppSQLNova)
-- Si necesitás la versión del motor u otros datos de la instancia
-- =============================================

-- Nota: Esto requiere acceso a la base AppSQLNova
-- Si tenés linked server o acceso directo:

USE [AppSQLNova];
GO

-- Ver todas las instancias con sus IDs
SELECT 
    Id AS ServerInstanceId,
    ServerName,
    NombreInstancia,
    MajorVersion,
    Ambiente
FROM SqlServerInstancesCache
ORDER BY ServerName;

-- Buscar por ServerName
SELECT 
    Id AS ServerInstanceId,
    ServerName,
    NombreInstancia,
    MajorVersion,
    Ambiente
FROM SqlServerInstancesCache
WHERE ServerName = N'SRVPROD01';  -- Reemplazar con tu ServerName

-- =============================================
-- OPCIÓN 3: Query completa para INSERT con mapeo automático
-- Busca en SqlServerDatabasesCache y si no existe, usa -1
-- =============================================

USE [SQLGuardObservatoryAuth];
GO

-- Ejemplo de INSERT con mapeo automático desde cache
INSERT INTO [dbo].[GestionBasesSinUso] (
    [ServerInstanceId], [ServerName], [ServerAmbiente],
    [DatabaseId], [DbName],
    [Status], [DataMB], [RecoveryModel], [CompatibilityLevel],
    [CompatibilidadMotor],
    [Offline], [FechaBajaMigracion],
    [MotivoBasesSinActividad], [MotivoObsolescencia],
    [MotivoEficiencia], [MotivoCambioVersionAmbBajos],
    [DbaAsignado], [Comentarios],
    [FechaCreacion], [FechaModificacion]
)
SELECT
    ISNULL(c.ServerInstanceId, -1),           -- Mapeo desde cache, -1 si no existe
    N'SRVPROD01',                             -- ServerName
    ISNULL(c.ServerAmbiente, N'Producción'), -- ServerAmbiente desde cache si existe
    ISNULL(c.DatabaseId, -1),                 -- DatabaseId desde cache, -1 si no existe
    N'MiBaseDeDatos',                         -- DbName
    ISNULL(c.[Status], N'OFFLINE'),          -- Status desde cache
    ISNULL(c.DataMB, 0),                      -- DataMB desde cache
    ISNULL(c.RecoveryModel, N'SIMPLE'),       -- RecoveryModel desde cache
    ISNULL(c.CompatibilityLevel, N'SQL Server 2017'), -- CompatibilityLevel desde cache
    -- CompatibilidadMotor: intentar derivar desde instancia, sino manual
    CASE 
        WHEN inst.MajorVersion IS NOT NULL AND PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
        ELSE N'2019'  -- Valor por defecto si no se puede derivar
    END AS CompatibilidadMotor,
    1,                                        -- Offline = SI
    '2025-01-15',                             -- FechaBajaMigracion
    1, 0, 0, 0,                               -- Motivos
    N'Juan Perez',                            -- DbaAsignado
    N'Base migrada - carga histórica',       -- Comentarios
    GETDATE(), GETDATE()
FROM (SELECT 1 AS dummy) x
LEFT JOIN SqlServerDatabasesCache c 
    ON c.ServerName = N'SRVPROD01' 
    AND c.DbName = N'MiBaseDeDatos'
LEFT JOIN [AppSQLNova].[dbo].[SqlServerInstancesCache] inst
    ON c.ServerInstanceId = inst.Id
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[GestionBasesSinUso] g
    WHERE g.ServerName = N'SRVPROD01' 
      AND g.DbName = N'MiBaseDeDatos'
);

-- =============================================
-- OPCIÓN 4: Script para mapear múltiples bases desde una lista
-- =============================================

-- Crear tabla temporal con las bases a insertar
CREATE TABLE #BasesAInsertar (
    ServerName NVARCHAR(255),
    DbName NVARCHAR(255),
    FechaBajaMigracion DATE,
    DbaAsignado NVARCHAR(255),
    Comentarios NVARCHAR(MAX)
);

-- Insertar datos de ejemplo
INSERT INTO #BasesAInsertar VALUES
    (N'SRVPROD01', N'Base1', '2025-01-15', N'Juan Perez', N'Migración 1'),
    (N'SRVPROD02', N'Base2', '2025-01-20', N'Maria Garcia', N'Migración 2'),
    (N'SRVPROD01', N'Base3', '2025-01-25', N'Juan Perez', N'Migración 3');

-- Insertar en GestionBasesSinUso con mapeo automático
INSERT INTO [dbo].[GestionBasesSinUso] (
    [ServerInstanceId], [ServerName], [ServerAmbiente],
    [DatabaseId], [DbName],
    [Status], [DataMB], [RecoveryModel], [CompatibilityLevel],
    [CompatibilidadMotor],
    [Offline], [FechaBajaMigracion],
    [MotivoBasesSinActividad], [MotivoObsolescencia],
    [MotivoEficiencia], [MotivoCambioVersionAmbBajos],
    [DbaAsignado], [Comentarios],
    [FechaCreacion], [FechaModificacion]
)
SELECT
    ISNULL(c.ServerInstanceId, -1),
    src.ServerName,
    ISNULL(c.ServerAmbiente, N'Producción'),
    ISNULL(c.DatabaseId, -1),
    src.DbName,
    ISNULL(c.[Status], N'OFFLINE'),
    ISNULL(c.DataMB, 0),
    ISNULL(c.RecoveryModel, N'SIMPLE'),
    ISNULL(c.CompatibilityLevel, N'SQL Server 2017'),
    CASE 
        WHEN inst.MajorVersion IS NOT NULL AND PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
            THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
        ELSE N'2019'
    END,
    1,  -- Offline
    src.FechaBajaMigracion,
    1, 0, 0, 0,  -- Motivos
    src.DbaAsignado,
    src.Comentarios,
    GETDATE(), GETDATE()
FROM #BasesAInsertar src
LEFT JOIN SqlServerDatabasesCache c 
    ON c.ServerName = src.ServerName 
    AND c.DbName = src.DbName
LEFT JOIN [AppSQLNova].[dbo].[SqlServerInstancesCache] inst
    ON c.ServerInstanceId = inst.Id
WHERE NOT EXISTS (
    SELECT 1 FROM [dbo].[GestionBasesSinUso] g
    WHERE g.ServerName = src.ServerName 
      AND g.DbName = src.DbName
);

-- Limpiar tabla temporal
DROP TABLE #BasesAInsertar;

PRINT '=== Script completado ===';
GO

