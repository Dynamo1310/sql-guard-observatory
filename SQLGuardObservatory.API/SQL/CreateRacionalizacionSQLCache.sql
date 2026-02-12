-- =============================================================================
-- Script: CreateRacionalizacionSQLCache.sql
-- Descripción: Tabla de cache pre-calculada para la vista "Racionalización SQL".
--              Evita JOINs costosos en tiempo real. Se refresca con el SP
--              sp_RefreshRacionalizacionSQLCache después de cada escritura 
--              o periódicamente.
-- Base de Datos: SQLGuardObservatoryAuth
-- =============================================================================

USE [SQLGuardObservatoryAuth];
GO

-- =============================================
-- 1. Crear tabla de cache
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'RacionalizacionSQLCache' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
    CREATE TABLE [dbo].[RacionalizacionSQLCache] (
        -- Claves
        [Id]                        BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [GestionId]                 BIGINT NULL,
        [CacheId]                   INT NULL,

        -- Campos de inventario
        [ServerInstanceId]          INT NOT NULL DEFAULT(0),
        [ServerName]                NVARCHAR(255) NOT NULL,
        [ServerAmbiente]            NVARCHAR(100) NULL,
        [DatabaseId]                INT NOT NULL DEFAULT(0),
        [DbName]                    NVARCHAR(255) NOT NULL,
        [Status]                    NVARCHAR(50) NULL,
        [StateDesc]                 NVARCHAR(50) NULL,
        [DataFiles]                 INT NULL,
        [DataMB]                    INT NULL,
        [UserAccess]                NVARCHAR(50) NULL,
        [RecoveryModel]             NVARCHAR(50) NULL,
        [CompatibilityLevel]        NVARCHAR(100) NULL,
        [CreationDate]              DATETIME2 NULL,
        [Collation]                 NVARCHAR(100) NULL,
        [Fulltext]                  BIT NULL,
        [AutoClose]                 BIT NULL,
        [ReadOnly]                  BIT NULL,
        [AutoShrink]                BIT NULL,
        [AutoCreateStatistics]      BIT NULL,
        [AutoUpdateStatistics]      BIT NULL,
        [SourceTimestamp]           DATETIME2 NULL,
        [CachedAt]                  DATETIME2 NULL,

        -- Campos de gestión (pre-calculados)
        [CompatibilidadMotor]       NVARCHAR(100) NULL,
        [FechaUltimaActividad]      DATETIME2 NULL,
        [Offline]                   BIT NOT NULL DEFAULT(0),
        [FechaBajaMigracion]        DATETIME2 NULL,
        [MotivoBasesSinActividad]   BIT NOT NULL DEFAULT(0),
        [MotivoObsolescencia]       BIT NOT NULL DEFAULT(0),
        [MotivoEficiencia]          BIT NOT NULL DEFAULT(0),
        [MotivoCambioVersionAmbBajos] BIT NOT NULL DEFAULT(0),
        [FechaUltimoBkp]            DATETIME2 NULL,
        [UbicacionUltimoBkp]        NVARCHAR(500) NULL,
        [DbaAsignado]               NVARCHAR(255) NULL,
        [Owner]                     NVARCHAR(255) NULL,
        [Celula]                    NVARCHAR(255) NULL,
        [Comentarios]               NVARCHAR(MAX) NULL,
        [FechaCreacion]             DATETIME2 NULL,
        [FechaModificacion]         DATETIME2 NULL,

        -- Campos derivados (pre-calculados)
        [EnInventarioActual]        BIT NOT NULL DEFAULT(0),
        [EngineVersion]             NVARCHAR(100) NULL,
        [EngineCompatLevel]         NVARCHAR(20) NULL,

        -- Metadatos del cache
        [CacheRefreshedAt]          DATETIME2 NOT NULL DEFAULT(GETDATE())
    );

    PRINT 'Tabla [dbo].[RacionalizacionSQLCache] creada.';
END
ELSE
BEGIN
    PRINT 'La tabla [dbo].[RacionalizacionSQLCache] ya existe.';
END
GO

-- Índices para filtros frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RacSQLCache_ServerName' AND object_id = OBJECT_ID('dbo.RacionalizacionSQLCache'))
    CREATE INDEX [IX_RacSQLCache_ServerName] ON [dbo].[RacionalizacionSQLCache]([ServerName]);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RacSQLCache_ServerAmbiente' AND object_id = OBJECT_ID('dbo.RacionalizacionSQLCache'))
    CREATE INDEX [IX_RacSQLCache_ServerAmbiente] ON [dbo].[RacionalizacionSQLCache]([ServerAmbiente]);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RacSQLCache_Celula' AND object_id = OBJECT_ID('dbo.RacionalizacionSQLCache'))
    CREATE INDEX [IX_RacSQLCache_Celula] ON [dbo].[RacionalizacionSQLCache]([Celula]);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RacSQLCache_DbaAsignado' AND object_id = OBJECT_ID('dbo.RacionalizacionSQLCache'))
    CREATE INDEX [IX_RacSQLCache_DbaAsignado] ON [dbo].[RacionalizacionSQLCache]([DbaAsignado]);
GO
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_RacSQLCache_ServerDB' AND object_id = OBJECT_ID('dbo.RacionalizacionSQLCache'))
    CREATE UNIQUE INDEX [IX_RacSQLCache_ServerDB] ON [dbo].[RacionalizacionSQLCache]([ServerName], [DbName]);
GO

-- =============================================
-- 2. Stored Procedure para refrescar el cache
-- =============================================
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'sp_RefreshRacionalizacionSQLCache')
    DROP PROCEDURE [dbo].[sp_RefreshRacionalizacionSQLCache];
GO

CREATE PROCEDURE [dbo].[sp_RefreshRacionalizacionSQLCache]
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        BEGIN TRANSACTION;

        -- Truncar tabla de cache
        TRUNCATE TABLE [dbo].[RacionalizacionSQLCache];

        -- Insertar datos pre-calculados
        INSERT INTO [dbo].[RacionalizacionSQLCache] (
            GestionId, CacheId,
            ServerInstanceId, ServerName, ServerAmbiente, DatabaseId, DbName,
            [Status], StateDesc, DataFiles, DataMB, UserAccess, RecoveryModel,
            CompatibilityLevel, CreationDate, [Collation], [Fulltext],
            AutoClose, [ReadOnly], AutoShrink, AutoCreateStatistics, AutoUpdateStatistics,
            SourceTimestamp, CachedAt,
            CompatibilidadMotor, FechaUltimaActividad, Offline, FechaBajaMigracion,
            MotivoBasesSinActividad, MotivoObsolescencia, MotivoEficiencia, MotivoCambioVersionAmbBajos,
            FechaUltimoBkp, UbicacionUltimoBkp, DbaAsignado, [Owner], Celula, Comentarios,
            FechaCreacion, FechaModificacion,
            EnInventarioActual, EngineVersion, EngineCompatLevel,
            CacheRefreshedAt
        )
        -- Parte 1: Bases presentes en inventario (cache), con gestión si existe
        SELECT
            g.Id AS GestionId,
            c.Id AS CacheId,
            COALESCE(c.ServerInstanceId, g.ServerInstanceId) AS ServerInstanceId,
            COALESCE(c.ServerName, g.ServerName) AS ServerName,
            COALESCE(c.ServerAmbiente, g.ServerAmbiente) AS ServerAmbiente,
            COALESCE(c.DatabaseId, g.DatabaseId) AS DatabaseId,
            COALESCE(c.DbName, g.DbName) AS DbName,
            COALESCE(c.[Status], g.[Status]) AS [Status],
            COALESCE(c.StateDesc, g.StateDesc) AS StateDesc,
            COALESCE(c.DataFiles, g.DataFiles) AS DataFiles,
            COALESCE(c.DataMB, g.DataMB) AS DataMB,
            COALESCE(c.UserAccess, g.UserAccess) AS UserAccess,
            COALESCE(c.RecoveryModel, g.RecoveryModel) AS RecoveryModel,
            COALESCE(c.CompatibilityLevel, g.CompatibilityLevel) AS CompatibilityLevel,
            COALESCE(c.CreationDate, g.CreationDate) AS CreationDate,
            COALESCE(c.[Collation], g.[Collation]) AS [Collation],
            COALESCE(c.[Fulltext], g.[Fulltext]) AS [Fulltext],
            COALESCE(c.AutoClose, g.AutoClose) AS AutoClose,
            COALESCE(c.[ReadOnly], g.[ReadOnly]) AS [ReadOnly],
            COALESCE(c.AutoShrink, g.AutoShrink) AS AutoShrink,
            COALESCE(c.AutoCreateStatistics, g.AutoCreateStatistics) AS AutoCreateStatistics,
            COALESCE(c.AutoUpdateStatistics, g.AutoUpdateStatistics) AS AutoUpdateStatistics,
            COALESCE(c.SourceTimestamp, g.SourceTimestamp) AS SourceTimestamp,
            COALESCE(c.CachedAt, g.CachedAt) AS CachedAt,
            -- CompatibilidadMotor: derivado de la versión del motor
            CASE
                WHEN PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
                    THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
                ELSE g.CompatibilidadMotor
            END AS CompatibilidadMotor,
            -- Fecha Última Actividad: priorizar reporte, luego gestión
            COALESCE(
                TRY_CAST(r.ultima_actividad AS DATETIME2),
                g.FechaUltimaActividad
            ) AS FechaUltimaActividad,
            ISNULL(g.Offline, 0) AS Offline,
            g.FechaBajaMigracion,
            ISNULL(g.MotivoBasesSinActividad, 0) AS MotivoBasesSinActividad,
            ISNULL(g.MotivoObsolescencia, 0) AS MotivoObsolescencia,
            ISNULL(g.MotivoEficiencia, 0) AS MotivoEficiencia,
            ISNULL(g.MotivoCambioVersionAmbBajos, 0) AS MotivoCambioVersionAmbBajos,
            g.FechaUltimoBkp,
            g.UbicacionUltimoBkp,
            g.DbaAsignado,
            g.[Owner],
            g.Celula,
            g.Comentarios,
            g.FechaCreacion,
            g.FechaModificacion,
            CAST(1 AS BIT) AS EnInventarioActual,
            -- EngineVersion: año del motor
            CASE
                WHEN PATINDEX('%20[0-9][0-9]%', inst.MajorVersion) > 0
                    THEN SUBSTRING(inst.MajorVersion, PATINDEX('%20[0-9][0-9]%', inst.MajorVersion), 4)
                ELSE inst.MajorVersion
            END AS EngineVersion,
            NULL AS EngineCompatLevel,
            GETDATE() AS CacheRefreshedAt
        FROM SqlServerDatabasesCache c
        LEFT JOIN GestionBasesSinUso g ON c.ServerName = g.ServerName AND c.DbName = g.DbName
        LEFT JOIN SqlServerInstancesCache inst ON c.ServerInstanceId = inst.Id
        OUTER APPLY (
            SELECT TOP 1 r.ultima_actividad
            FROM [SQLNova].[dbo].[ReporteBasesSinActividad] r
            WHERE r.ServerName = c.ServerName AND r.DB = c.DbName
            ORDER BY r.fecha_carga DESC
        ) r

        UNION ALL

        -- Parte 2: Bases solo en gestión (ya no están en cache)
        SELECT
            g.Id AS GestionId,
            NULL AS CacheId,
            g.ServerInstanceId,
            g.ServerName,
            g.ServerAmbiente,
            g.DatabaseId,
            g.DbName,
            g.[Status],
            g.StateDesc,
            g.DataFiles,
            g.DataMB,
            g.UserAccess,
            g.RecoveryModel,
            g.CompatibilityLevel,
            g.CreationDate,
            g.[Collation],
            g.[Fulltext],
            g.AutoClose,
            g.[ReadOnly],
            g.AutoShrink,
            g.AutoCreateStatistics,
            g.AutoUpdateStatistics,
            g.SourceTimestamp,
            g.CachedAt,
            g.CompatibilidadMotor,
            g.FechaUltimaActividad,
            g.Offline,
            g.FechaBajaMigracion,
            g.MotivoBasesSinActividad,
            g.MotivoObsolescencia,
            g.MotivoEficiencia,
            g.MotivoCambioVersionAmbBajos,
            g.FechaUltimoBkp,
            g.UbicacionUltimoBkp,
            g.DbaAsignado,
            g.[Owner],
            g.Celula,
            g.Comentarios,
            g.FechaCreacion,
            g.FechaModificacion,
            CAST(0 AS BIT) AS EnInventarioActual,
            g.CompatibilidadMotor AS EngineVersion,
            NULL AS EngineCompatLevel,
            GETDATE() AS CacheRefreshedAt
        FROM GestionBasesSinUso g
        WHERE NOT EXISTS (
            SELECT 1 FROM SqlServerDatabasesCache c 
            WHERE c.ServerName = g.ServerName AND c.DbName = g.DbName
        );

        COMMIT TRANSACTION;

        -- Informar resultado
        DECLARE @RowCount INT = (SELECT COUNT(*) FROM [dbo].[RacionalizacionSQLCache]);
        PRINT 'Cache refrescado: ' + CAST(@RowCount AS VARCHAR(10)) + ' registros.';
        
        -- Retornar timestamp para que el servicio lo pueda usar
        SELECT @RowCount AS TotalRows, GETDATE() AS RefreshedAt;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        DECLARE @ErrorMessage NVARCHAR(4000) = ERROR_MESSAGE();
        DECLARE @ErrorSeverity INT = ERROR_SEVERITY();
        DECLARE @ErrorState INT = ERROR_STATE();
        RAISERROR(@ErrorMessage, @ErrorSeverity, @ErrorState);
    END CATCH
END
GO

-- =============================================
-- 3. Ejecutar primer refresh
-- =============================================
EXEC [dbo].[sp_RefreshRacionalizacionSQLCache];
GO

PRINT '=== Script CreateRacionalizacionSQLCache completado ===';
GO

