/*
 * Migración: Diagnóstico Inteligente de I/O v3.1
 * Fecha: 2025-01-27
 * Descripción: Agrega columnas para diagnóstico avanzado de discos y análisis de causa raíz
 */

BEGIN TRANSACTION;

-- ============================================
-- 1. InstanceHealth_Discos: Métricas avanzadas
-- ============================================

PRINT '📀 Agregando métricas avanzadas a InstanceHealth_Discos...';

-- Métricas de I/O del sistema (globales)
ALTER TABLE dbo.InstanceHealth_Discos ADD PageLifeExpectancy INT NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD PageReadsPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD PageWritesPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD LazyWritesPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD CheckpointPagesPerSec INT NULL;
ALTER TABLE dbo.InstanceHealth_Discos ADD BatchRequestsPerSec INT NULL;

PRINT '  ✅ Métricas de I/O agregadas';

-- Nota: VolumesJson ya incluirá:
-- - MediaType (HDD/SSD/NVMe)
-- - BusType (SATA/SAS/NVMe/iSCSI)
-- - HealthStatus (Healthy/Warning/Unhealthy)
-- - OperationalStatus (Online/Offline/Degraded)
-- - IsTempDBDisk, IsDataDisk, IsLogDisk (flags)
-- - DatabaseCount, FileCount, DatabaseList (competencia)

PRINT '  ℹ️  VolumesJson ahora incluye tipo de disco, health status, y análisis de competencia';

-- ============================================
-- 2. InstanceHealth_ConfiguracionTempdb: Mount Point
-- ============================================

PRINT '💾 Agregando TempDBMountPoint a InstanceHealth_ConfiguracionTempdb...';

ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBMountPoint VARCHAR(10) NULL;

PRINT '  ✅ TempDBMountPoint agregado';

-- ============================================
-- 3. InstanceHealth_Score: Diagnóstico inteligente
-- ============================================

PRINT '🧠 Agregando diagnóstico inteligente a InstanceHealth_Score...';

ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIODiagnosis NVARCHAR(200) NULL;
ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIOSuggestion NVARCHAR(500) NULL;
ALTER TABLE dbo.InstanceHealth_Score ADD TempDBIOSeverity VARCHAR(20) NULL;

PRINT '  ✅ Columnas de diagnóstico agregadas';

-- ============================================
-- 4. Índices para mejorar performance de JOINs
-- ============================================

PRINT '📊 Creando índices para diagnóstico...';

-- Índice en TempDBMountPoint para JOIN con Discos
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ConfiguracionTempdb_MountPoint' AND object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_ConfiguracionTempdb_MountPoint
    ON dbo.InstanceHealth_ConfiguracionTempdb(InstanceName, TempDBMountPoint, CollectedAtUtc DESC);
    PRINT '  ✅ Índice IX_ConfiguracionTempdb_MountPoint creado';
END

-- Índice en Discos para JOIN con TempDB
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Discos_Instance_Collected' AND object_id = OBJECT_ID('dbo.InstanceHealth_Discos'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_Discos_Instance_Collected
    ON dbo.InstanceHealth_Discos(InstanceName, CollectedAtUtc DESC);
    PRINT '  ✅ Índice IX_Discos_Instance_Collected creado';
END

-- ============================================
-- 5. Vista para diagnóstico rápido de TempDB
-- ============================================

PRINT '📊 Creando vista de diagnóstico de TempDB...';

IF OBJECT_ID('dbo.vw_TempDB_IO_Diagnosis', 'V') IS NOT NULL
    DROP VIEW dbo.vw_TempDB_IO_Diagnosis;
GO

CREATE VIEW dbo.vw_TempDB_IO_Diagnosis
AS
SELECT 
    t.InstanceName,
    t.CollectedAtUtc,
    t.TempDBAvgWriteLatencyMs,
    t.TempDBMountPoint,
    t.TempDBPageLatchWaits,
    t.TempDBContentionScore,
    
    -- Datos del disco (de VolumesJson)
    -- El consolidador parseará el JSON para obtener tipo de disco
    d.VolumesJson,
    d.PageLifeExpectancy,
    d.PageWritesPerSec,
    d.LazyWritesPerSec,
    
    -- Diagnóstico final (del consolidador)
    s.TempDBIODiagnosis,
    s.TempDBIOSuggestion,
    s.TempDBIOSeverity,
    s.HealthScore
FROM dbo.InstanceHealth_ConfiguracionTempdb t
LEFT JOIN dbo.InstanceHealth_Discos d 
    ON t.InstanceName = d.InstanceName 
    AND d.CollectedAtUtc = (
        SELECT TOP 1 d2.CollectedAtUtc 
        FROM dbo.InstanceHealth_Discos d2 
        WHERE d2.InstanceName = t.InstanceName 
        AND d2.CollectedAtUtc >= DATEADD(MINUTE, -15, t.CollectedAtUtc)
        AND d2.CollectedAtUtc <= DATEADD(MINUTE, 15, t.CollectedAtUtc)
        ORDER BY ABS(DATEDIFF(SECOND, d2.CollectedAtUtc, t.CollectedAtUtc))
    )
LEFT JOIN dbo.InstanceHealth_Score s
    ON t.InstanceName = s.InstanceName
    AND s.CollectedAtUtc = (
        SELECT TOP 1 s2.CollectedAtUtc 
        FROM dbo.InstanceHealth_Score s2 
        WHERE s2.InstanceName = t.InstanceName 
        AND s2.CollectedAtUtc >= DATEADD(MINUTE, -5, t.CollectedAtUtc)
        ORDER BY s2.CollectedAtUtc DESC
    );
GO

PRINT '  ✅ Vista vw_TempDB_IO_Diagnosis creada';

-- ============================================
-- Finalizar
-- ============================================

PRINT '';
PRINT '---------------------------------------------------';
PRINT '✅ Migración completada exitosamente!';
PRINT '';
PRINT '📊 Columnas agregadas:';
PRINT '   InstanceHealth_Discos:';
PRINT '     - PageLifeExpectancy';
PRINT '     - PageReadsPerSec, PageWritesPerSec';
PRINT '     - LazyWritesPerSec';
PRINT '     - CheckpointPagesPerSec';
PRINT '     - BatchRequestsPerSec';
PRINT '     - VolumesJson (enriquecido con tipo de disco)';
PRINT '';
PRINT '   InstanceHealth_ConfiguracionTempdb:';
PRINT '     - TempDBMountPoint';
PRINT '';
PRINT '   InstanceHealth_Score:';
PRINT '     - TempDBIODiagnosis';
PRINT '     - TempDBIOSuggestion';
PRINT '     - TempDBIOSeverity';
PRINT '';
PRINT '📊 Índices creados:';
PRINT '     - IX_ConfiguracionTempdb_MountPoint';
PRINT '     - IX_Discos_Instance_Collected';
PRINT '';
PRINT '📊 Vista creada:';
PRINT '     - vw_TempDB_IO_Diagnosis';
PRINT '';
PRINT '📝 Próximos pasos:';
PRINT '   1. Ejecutar RelevamientoHealthScore_Discos.ps1 (actualizado)';
PRINT '   2. Ejecutar RelevamientoHealthScore_ConfiguracionTempdb.ps1 (actualizado)';
PRINT '   3. Ejecutar RelevamientoHealthScore_Consolidate_v3_FINAL.ps1 (actualizado)';
PRINT '   4. Revisar diagnóstico inteligente en frontend';
PRINT '---------------------------------------------------';

COMMIT TRANSACTION;
GO

