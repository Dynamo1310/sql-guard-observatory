-- =====================================================
-- Health Score v3.1 - Nuevas columnas para métricas mejoradas
-- Ejecutar en la base de datos AppSQLNova
-- =====================================================

USE AppSQLNova;
GO

-- =====================================================
-- 1. InstanceHealth_CPU - Scheduler Pressure, Worker Threads, Signal Waits
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'AvgRunnableTasksPerScheduler')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD AvgRunnableTasksPerScheduler DECIMAL(10,2) NOT NULL DEFAULT 0;
    PRINT 'Added AvgRunnableTasksPerScheduler to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'MaxRunnableTasksOnScheduler')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD MaxRunnableTasksOnScheduler INT NOT NULL DEFAULT 0;
    PRINT 'Added MaxRunnableTasksOnScheduler to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'SchedulerCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD SchedulerCount INT NOT NULL DEFAULT 0;
    PRINT 'Added SchedulerCount to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'MaxWorkerCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD MaxWorkerCount INT NOT NULL DEFAULT 0;
    PRINT 'Added MaxWorkerCount to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'ActiveWorkers')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD ActiveWorkers INT NOT NULL DEFAULT 0;
    PRINT 'Added ActiveWorkers to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'TotalWorkers')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD TotalWorkers INT NOT NULL DEFAULT 0;
    PRINT 'Added TotalWorkers to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'WorkerThreadUsagePct')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD WorkerThreadUsagePct DECIMAL(10,2) NOT NULL DEFAULT 0;
    PRINT 'Added WorkerThreadUsagePct to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'SignalWaitPct')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD SignalWaitPct DECIMAL(10,2) NOT NULL DEFAULT 0;
    PRINT 'Added SignalWaitPct to InstanceHealth_CPU';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_CPU') AND name = 'TotalSignalWaitMs')
BEGIN
    ALTER TABLE dbo.InstanceHealth_CPU ADD TotalSignalWaitMs BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added TotalSignalWaitMs to InstanceHealth_CPU';
END

-- =====================================================
-- 2. InstanceHealth_Memoria - Memory Clerks, Plan Cache, Memory Pressure
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'TopMemoryClerk')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD TopMemoryClerk NVARCHAR(128) NULL;
    PRINT 'Added TopMemoryClerk to InstanceHealth_Memoria';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'TopMemoryClerkMB')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD TopMemoryClerkMB INT NOT NULL DEFAULT 0;
    PRINT 'Added TopMemoryClerkMB to InstanceHealth_Memoria';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'PlanCacheSizeMB')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD PlanCacheSizeMB INT NOT NULL DEFAULT 0;
    PRINT 'Added PlanCacheSizeMB to InstanceHealth_Memoria';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'PlanCacheCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD PlanCacheCount INT NOT NULL DEFAULT 0;
    PRINT 'Added PlanCacheCount to InstanceHealth_Memoria';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'ResourceSemaphoreWaitMs')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD ResourceSemaphoreWaitMs BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added ResourceSemaphoreWaitMs to InstanceHealth_Memoria';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Memoria') AND name = 'ResourceSemaphoreWaitCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Memoria ADD ResourceSemaphoreWaitCount BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added ResourceSemaphoreWaitCount to InstanceHealth_Memoria';
END

-- =====================================================
-- 3. InstanceHealth_Waits - Network Waits, TotalSignalWaitMs
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Waits') AND name = 'NetworkWaitCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Waits ADD NetworkWaitCount BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added NetworkWaitCount to InstanceHealth_Waits';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Waits') AND name = 'NetworkWaitMs')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Waits ADD NetworkWaitMs BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added NetworkWaitMs to InstanceHealth_Waits';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Waits') AND name = 'TotalSignalWaitMs')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Waits ADD TotalSignalWaitMs BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added TotalSignalWaitMs to InstanceHealth_Waits';
END

-- =====================================================
-- 4. InstanceHealth_ConfiguracionTempdb - Delta Contention, Version Store
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb') AND name = 'TempDBPageLatchDeltaMs')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBPageLatchDeltaMs BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added TempDBPageLatchDeltaMs to InstanceHealth_ConfiguracionTempdb';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb') AND name = 'TempDBPageLatchDeltaCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBPageLatchDeltaCount INT NOT NULL DEFAULT 0;
    PRINT 'Added TempDBPageLatchDeltaCount to InstanceHealth_ConfiguracionTempdb';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb') AND name = 'TempDBUserObjectsMB')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBUserObjectsMB INT NOT NULL DEFAULT 0;
    PRINT 'Added TempDBUserObjectsMB to InstanceHealth_ConfiguracionTempdb';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb') AND name = 'TempDBInternalObjectsMB')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBInternalObjectsMB INT NOT NULL DEFAULT 0;
    PRINT 'Added TempDBInternalObjectsMB to InstanceHealth_ConfiguracionTempdb';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ConfiguracionTempdb') AND name = 'TempDBActiveVersionStoreTx')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ConfiguracionTempdb ADD TempDBActiveVersionStoreTx INT NOT NULL DEFAULT 0;
    PRINT 'Added TempDBActiveVersionStoreTx to InstanceHealth_ConfiguracionTempdb';
END

-- =====================================================
-- 5. InstanceHealth_AlwaysOn - Log Send Rate, Redo Rate
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'MaxLogSendRateKBps')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD MaxLogSendRateKBps BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added MaxLogSendRateKBps to InstanceHealth_AlwaysOn';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'AvgLogSendRateKBps')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD AvgLogSendRateKBps BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added AvgLogSendRateKBps to InstanceHealth_AlwaysOn';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'MaxRedoRateKBps')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD MaxRedoRateKBps BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added MaxRedoRateKBps to InstanceHealth_AlwaysOn';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'AvgRedoRateKBps')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD AvgRedoRateKBps BIGINT NOT NULL DEFAULT 0;
    PRINT 'Added AvgRedoRateKBps to InstanceHealth_AlwaysOn';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_AlwaysOn') AND name = 'MaxSecondsSinceLastHardened')
BEGIN
    ALTER TABLE dbo.InstanceHealth_AlwaysOn ADD MaxSecondsSinceLastHardened INT NOT NULL DEFAULT 0;
    PRINT 'Added MaxSecondsSinceLastHardened to InstanceHealth_AlwaysOn';
END

-- =====================================================
-- 6. InstanceHealth_ErroresCriticos - Categorized Errors
-- =====================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos') AND name = 'IOErrorCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ErroresCriticos ADD IOErrorCount INT NOT NULL DEFAULT 0;
    PRINT 'Added IOErrorCount to InstanceHealth_ErroresCriticos';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos') AND name = 'DeadlockCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ErroresCriticos ADD DeadlockCount INT NOT NULL DEFAULT 0;
    PRINT 'Added DeadlockCount to InstanceHealth_ErroresCriticos';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos') AND name = 'LogFullCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ErroresCriticos ADD LogFullCount INT NOT NULL DEFAULT 0;
    PRINT 'Added LogFullCount to InstanceHealth_ErroresCriticos';
END

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_ErroresCriticos') AND name = 'CorruptionCount')
BEGIN
    ALTER TABLE dbo.InstanceHealth_ErroresCriticos ADD CorruptionCount INT NOT NULL DEFAULT 0;
    PRINT 'Added CorruptionCount to InstanceHealth_ErroresCriticos';
END

PRINT '';
PRINT '=====================================================';
PRINT 'Health Score v3.1 columns migration completed!';
PRINT '=====================================================';
GO

