-- =============================================
-- Sistema Health Score V2 - Tabla de Histórico
-- Guarda snapshots periódicos de los scores calculados
-- =============================================
USE SQLNova;
GO

-- =============================================
-- Tabla para guardar histórico de Health Scores
-- =============================================
IF OBJECT_ID('dbo.HealthScoreHistoryV2', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.HealthScoreHistoryV2 (
        HistoryID bigint IDENTITY(1,1) PRIMARY KEY,
        Instance sysname NOT NULL,
        SnapshotAt datetime2(0) NOT NULL DEFAULT SYSDATETIME(),
        
        -- Health Score Final
        HealthRaw int NOT NULL,
        HealthFinal int NOT NULL,
        CapApplied varchar(100) NULL,
        ColorSemaforo varchar(20) NOT NULL,
        
        -- Scores por categoría (0-100)
        Score_Backups int NOT NULL,
        Score_AG int NOT NULL,
        Score_Conectividad int NOT NULL,
        Score_ErroresSev int NOT NULL,
        Score_CPU int NOT NULL,
        Score_IO int NOT NULL,
        Score_Discos int NOT NULL,
        Score_Memoria int NOT NULL,
        Score_Mantenimiento int NOT NULL,
        Score_ConfigRecursos int NOT NULL,
        
        -- Notas resumidas (top 3 penalizaciones)
        Top3Penalizaciones nvarchar(500) NULL,
        
        -- Índices para consultas rápidas
        INDEX IX_HealthHistory_Instance_SnapshotAt (Instance, SnapshotAt),
        INDEX IX_HealthHistory_SnapshotAt (SnapshotAt),
        INDEX IX_HealthHistory_ColorSemaforo (ColorSemaforo, SnapshotAt)
    );
    
    PRINT 'Tabla HealthScoreHistoryV2 creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla HealthScoreHistoryV2 ya existe';
END
GO

-- =============================================
-- Procedimiento para materializar scores
-- Ejecutar cada 5-15 minutos desde un SQL Agent Job
-- =============================================
IF OBJECT_ID('dbo.usp_MaterializarHealthScores_V2', 'P') IS NOT NULL 
    DROP PROCEDURE dbo.usp_MaterializarHealthScores_V2;
GO

CREATE PROCEDURE dbo.usp_MaterializarHealthScores_V2
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @SnapshotAt datetime2(0) = SYSDATETIME();
    DECLARE @RowsInserted int = 0;
    
    BEGIN TRY
        -- Insertar snapshot actual de todos los health scores
        INSERT INTO dbo.HealthScoreHistoryV2 (
            Instance,
            SnapshotAt,
            HealthRaw,
            HealthFinal,
            CapApplied,
            ColorSemaforo,
            Score_Backups,
            Score_AG,
            Score_Conectividad,
            Score_ErroresSev,
            Score_CPU,
            Score_IO,
            Score_Discos,
            Score_Memoria,
            Score_Mantenimiento,
            Score_ConfigRecursos,
            Top3Penalizaciones
        )
        SELECT
            hf.Instance,
            @SnapshotAt,
            hf.HealthRaw,
            hf.HealthFinal,
            hf.CapApplied,
            hf.ColorSemaforo,
            cs.Score_Backups,
            cs.Score_AG,
            cs.Score_Conectividad,
            cs.Score_ErroresSev,
            cs.Score_CPU,
            cs.Score_IO,
            cs.Score_Discos,
            cs.Score_Memoria,
            cs.Score_Mantenimiento,
            cs.Score_ConfigRecursos,
            hf.Top3Penalizaciones
        FROM dbo.vw_HealthFinal_V2 hf
        INNER JOIN dbo.vw_CategoryScores_V2 cs ON hf.Instance = cs.Instance;
        
        SET @RowsInserted = @@ROWCOUNT;
        
        -- Limpiar datos antiguos (retener últimos 30 días)
        DELETE FROM dbo.HealthScoreHistoryV2
        WHERE SnapshotAt < DATEADD(DAY, -30, SYSDATETIME());
        
        -- Log exitoso
        INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message])
        VALUES ('MaterializarHealthScores', 'SYSTEM', 'Info', 
                'Materializados ' + CAST(@RowsInserted AS varchar) + ' health scores');
        
        RETURN 0;
    END TRY
    BEGIN CATCH
        -- Log de error
        DECLARE @ErrorMsg nvarchar(4000) = ERROR_MESSAGE();
        INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message])
        VALUES ('MaterializarHealthScores', 'SYSTEM', 'Error', @ErrorMsg);
        
        RETURN 1;
    END CATCH
END
GO

-- =============================================
-- Vistas actualizadas que usan el histórico
-- =============================================

-- Vista de tendencias 24h (desde histórico)
IF OBJECT_ID('dbo.vw_HealthTendencias_24h_V2', 'V') IS NOT NULL 
    DROP VIEW dbo.vw_HealthTendencias_24h_V2;
GO

CREATE VIEW dbo.vw_HealthTendencias_24h_V2
AS
SELECT 
    Instance,
    SnapshotAt AS HourBucket,
    HealthFinal AS HealthScore
FROM dbo.HealthScoreHistoryV2
WHERE SnapshotAt >= DATEADD(HOUR, -24, SYSDATETIME());
GO

-- Vista de tendencias 7d (desde histórico, agrupado por hora)
IF OBJECT_ID('dbo.vw_HealthTendencias_7d_V2', 'V') IS NOT NULL 
    DROP VIEW dbo.vw_HealthTendencias_7d_V2;
GO

CREATE VIEW dbo.vw_HealthTendencias_7d_V2
AS
SELECT 
    Instance,
    DATEADD(HOUR, DATEDIFF(HOUR, 0, SnapshotAt), 0) AS DayBucket,
    AVG(HealthFinal) AS HealthScore
FROM dbo.HealthScoreHistoryV2
WHERE SnapshotAt >= DATEADD(DAY, -7, SYSDATETIME())
GROUP BY 
    Instance,
    DATEADD(HOUR, DATEDIFF(HOUR, 0, SnapshotAt), 0);
GO

PRINT '';
PRINT '==============================================';
PRINT 'Tabla de histórico y procedimientos creados';
PRINT '==============================================';
PRINT '';
PRINT 'Próximos pasos:';
PRINT '1. Ejecutar manualmente una vez:';
PRINT '   EXEC dbo.usp_MaterializarHealthScores_V2';
PRINT '';
PRINT '2. Crear SQL Agent Job para ejecutar cada 5-15 minutos:';
PRINT '   - Job Name: HealthScore V2 - Materializar Scores';
PRINT '   - Schedule: Cada 10 minutos';
PRINT '   - Command: EXEC SQLNova.dbo.usp_MaterializarHealthScores_V2';
PRINT '';
GO

