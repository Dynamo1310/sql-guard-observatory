-- =============================================
-- Sistema Health Score V2 - Datos de Ejemplo
-- Base de datos: SQLNova
-- Inserta datos demo para previsualización
-- =============================================
USE SQLNova;
GO

DECLARE @Instance1 sysname = N'SQL-PROD-01\INST1';
DECLARE @Instance2 sysname = N'SQL-PROD-02';
DECLARE @SnapTime datetime2(0) = SYSDATETIME();

-- =============================================
-- 1. Datos de BACKUPS - Instancia 1 (buena)
-- =============================================
INSERT INTO dbo.InventarioBackupSnapshot (Instance, SnapshotAt, DBName, LastFull, LastDiff, LastLog, FullAgeMin, LogAgeMin, ChainOK, RecoveryModel)
VALUES
    (@Instance1, @SnapTime, N'ProductionDB', DATEADD(HOUR, -12, @SnapTime), DATEADD(HOUR, -6, @SnapTime), DATEADD(MINUTE, -10, @SnapTime), 720, 10, 1, 'FULL'),
    (@Instance1, @SnapTime, N'SalesDB', DATEADD(HOUR, -20, @SnapTime), NULL, DATEADD(MINUTE, -5, @SnapTime), 1200, 5, 1, 'FULL'),
    (@Instance1, @SnapTime, N'ReportingDB', DATEADD(HOUR, -8, @SnapTime), NULL, NULL, 480, NULL, 1, 'SIMPLE');

-- Instancia 2 (con problemas)
INSERT INTO dbo.InventarioBackupSnapshot (Instance, SnapshotAt, DBName, LastFull, LastDiff, LastLog, FullAgeMin, LogAgeMin, ChainOK, RecoveryModel)
VALUES
    (@Instance2, @SnapTime, N'ProductionDB', DATEADD(DAY, -3, @SnapTime), NULL, DATEADD(HOUR, -2, @SnapTime), 4320, 120, 0, 'FULL'),
    (@Instance2, @SnapTime, N'CriticalDB', DATEADD(DAY, -1, @SnapTime), NULL, DATEADD(MINUTE, -90, @SnapTime), 1440, 90, 1, 'FULL');

-- =============================================
-- 2. Datos de ALWAYSON - Solo Instancia 1
-- =============================================
INSERT INTO dbo.InventarioAGSnapshot (Instance, SnapshotAt, AGName, Replica, DBName, SyncState, IsSuspended, SendQueueKB, RedoQueueKB, SendRateKBs, RedoRateKBs)
VALUES
    (@Instance1, @SnapTime, N'AG-Prod', @Instance1, N'ProductionDB', 'SYNCHRONIZED', 0, 512, 128, 450.5, 320.8),
    (@Instance1, @SnapTime, N'AG-Prod', @Instance1, N'SalesDB', 'SYNCHRONIZED', 0, 256, 64, 200.3, 180.2);

-- =============================================
-- 3. Datos de CONECTIVIDAD
-- =============================================
INSERT INTO dbo.InventarioConectividadSnapshot (Instance, SnapshotAt, Reachable, AuthOK, RTTms, FailedLogins15m)
VALUES
    (@Instance1, @SnapTime, 1, 1, 8, 0),
    (@Instance2, @SnapTime, 1, 1, 45, 2);

-- =============================================
-- 4. Datos de ERRORES SEV>=20
-- =============================================
-- Instancia 2 tiene error reciente
INSERT INTO dbo.InventarioErroresSevSnapshot (Instance, SnapshotAt, EventTime, ErrorNumber, Severity, [Message])
VALUES
    (@Instance2, @SnapTime, DATEADD(MINUTE, -30, @SnapTime), 823, 24, N'I/O error (bad page ID) detected during read');

-- =============================================
-- 5. Datos de CPU
-- =============================================
INSERT INTO dbo.InventarioCPUSnapshot (Instance, SnapshotAt, CpuPct_p95, RunnableTasksAvg)
VALUES
    (@Instance1, @SnapTime, 65.5, 1.2),
    (@Instance2, @SnapTime, 88.3, 4.8);

-- =============================================
-- 6. Datos de IO
-- =============================================
INSERT INTO dbo.InventarioIOSnapshot (Instance, SnapshotAt, DbName, FileType, AvgLatencyRead_ms, AvgLatencyWrite_ms, IOPS_Read, IOPS_Write)
VALUES
    (@Instance1, @SnapTime, N'ProductionDB', 'Data', 3.2, 4.5, 1200, 800),
    (@Instance1, @SnapTime, N'ProductionDB', 'Log', 1.8, 2.1, 450, 650),
    (@Instance1, @SnapTime, N'tempdb', 'Tempdb', 2.5, 3.0, 2400, 1800),
    (@Instance2, @SnapTime, N'ProductionDB', 'Data', 12.8, 18.5, 800, 600),
    (@Instance2, @SnapTime, N'ProductionDB', 'Log', 25.3, 32.7, 200, 400),
    (@Instance2, @SnapTime, N'tempdb', 'Tempdb', 8.5, 10.2, 1500, 1200);

-- =============================================
-- 7. Datos de DISCOS
-- =============================================
INSERT INTO dbo.InventarioDiscosSnapshot (Instance, SnapshotAt, DriveLetter, [Role], FreePct, SizeGB, GrowthPct7d)
VALUES
    (@Instance1, @SnapTime, 'C:\', 'SO', 35.5, 120.0, 2.5),
    (@Instance1, @SnapTime, 'D:\', 'Data', 22.3, 500.0, 5.2),
    (@Instance1, @SnapTime, 'E:\', 'Log', 40.8, 200.0, 3.1),
    (@Instance1, @SnapTime, 'F:\', 'Backups', 55.0, 1000.0, 8.5),
    (@Instance2, @SnapTime, 'C:\', 'SO', 18.2, 120.0, 4.2),
    (@Instance2, @SnapTime, 'D:\', 'Data', 8.5, 500.0, 12.8),  -- Crítico
    (@Instance2, @SnapTime, 'E:\', 'Log', 6.2, 200.0, 15.5),   -- Crítico
    (@Instance2, @SnapTime, 'F:\', 'Backups', 45.0, 1000.0, 6.2);

-- =============================================
-- 8. Datos de MEMORIA
-- =============================================
-- PLE objetivo = 300s × GB buffer pool
-- Instancia 1: 64GB buffer → objetivo 19200s (320min)
-- Instancia 2: 32GB buffer → objetivo 9600s (160min), pero PLE bajo
INSERT INTO dbo.InventarioMemoriaSnapshot (Instance, SnapshotAt, PLE_MinNUMA, PLE_Target_sec, MemoryGrantsPending, CommittedGB, TargetGB)
VALUES
    (@Instance1, @SnapTime, 18500, 19200, 0, 62.5, 64.0),
    (@Instance2, @SnapTime, 2400, 9600, 3, 30.8, 32.0);  -- PLE 25% del objetivo

-- =============================================
-- 9. Datos de MANTENIMIENTO
-- =============================================
INSERT INTO dbo.InventarioMantenimientoSnapshot (Instance, SnapshotAt, DBName, LastCheckDB, CheckDB_AgeDays, CheckDB_WithinSLA, LastIndexOptimize, IndexOpt_AgeDays, LastStatsUpdate, Stats_AgeDays, Success14d_CheckDB, Success14d_Index, Success14d_Stats)
VALUES
    (@Instance1, @SnapTime, N'ProductionDB', DATEADD(DAY, -3, @SnapTime), 3, 1, DATEADD(DAY, -1, @SnapTime), 1, DATEADD(DAY, -1, @SnapTime), 1, 2, 7, 14),
    (@Instance1, @SnapTime, N'SalesDB', DATEADD(DAY, -5, @SnapTime), 5, 1, DATEADD(DAY, -2, @SnapTime), 2, DATEADD(DAY, -1, @SnapTime), 1, 2, 7, 14),
    (@Instance1, @SnapTime, N'ReportingDB', DATEADD(DAY, -6, @SnapTime), 6, 1, DATEADD(DAY, -3, @SnapTime), 3, DATEADD(DAY, -2, @SnapTime), 2, 2, 7, 14),
    (@Instance2, @SnapTime, N'ProductionDB', DATEADD(DAY, -12, @SnapTime), 12, 0, DATEADD(DAY, -8, @SnapTime), 8, DATEADD(DAY, -5, @SnapTime), 5, 1, 4, 10),
    (@Instance2, @SnapTime, N'CriticalDB', DATEADD(DAY, -15, @SnapTime), 15, 0, DATEADD(DAY, -10, @SnapTime), 10, DATEADD(DAY, -7, @SnapTime), 7, 1, 3, 9);

-- =============================================
-- 10. Datos de CONFIG & TEMPDB
-- =============================================
-- Instancia 1: 8 cores → recomendado 2 files, bien configurado
-- Instancia 2: 16 cores → recomendado 4 files, mal configurado (1 file) con PAGELATCH
INSERT INTO dbo.InventarioConfigRecursosSnapshot (Instance, SnapshotAt, Tempdb_Files, Tempdb_Files_Recom, Tempdb_SizesEqualPct, Tempdb_GrowthMBOnly, Tempdb_Pagelatch, Tempdb_Latency_ms, TotalRAM_GB, MaxServerMemory_GB, MaxRecomendado_GB)
VALUES
    (@Instance1, @SnapTime, 2, 2, 98.5, 1, 0, 3.2, 128.0, 110.0, 112.0),  -- Max memory casi ideal
    (@Instance2, @SnapTime, 1, 4, 100.0, 1, 1, 18.5, 64.0, 58.0, 54.0);  -- PAGELATCH + Max memory alto

-- =============================================
-- 11. Log de collectors (ejemplos)
-- =============================================
INSERT INTO dbo.CollectorLog (CollectorName, Instance, [Level], [Message])
VALUES
    ('Get-Backups-ToSQL', @Instance1, 'Info', 'Collector ejecutado exitosamente, 3 DBs procesadas'),
    ('Get-Backups-ToSQL', @Instance2, 'Info', 'Collector ejecutado exitosamente, 2 DBs procesadas'),
    ('Get-AG-ToSQL', @Instance1, 'Info', '2 DBs en AG procesadas'),
    ('Get-CPU-ToSQL', @Instance2, 'Warn', 'CPU p95 >85%, revisar carga'),
    ('Get-Discos-ToSQL', @Instance2, 'Error', 'Espacio crítico en disco Data (8.5%)');

PRINT '';
PRINT '==============================================';
PRINT 'Datos de ejemplo insertados exitosamente';
PRINT '==============================================';
PRINT '';
PRINT 'Instancias demo:';
PRINT '  - ' + @Instance1 + ' (saludable, Health ~85-90)';
PRINT '  - ' + @Instance2 + ' (con problemas, Health ~50-60)';
PRINT '';
PRINT 'Ejecuta SELECT * FROM dbo.vw_HealthFinal_V2 para ver el resultado';
PRINT '';
GO

