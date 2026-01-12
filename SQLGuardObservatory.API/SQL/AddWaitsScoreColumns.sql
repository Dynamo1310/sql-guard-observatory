-- Script para agregar columnas de WaitsScore al modelo de Health Score
-- Ejecutar en la base de datos AppSQLNova

USE AppSQLNova;
GO

-- Agregar WaitsScore a InstanceHealth_Score
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'WaitsScore')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Score ADD WaitsScore INT NOT NULL DEFAULT 100;
    PRINT 'Columna WaitsScore agregada a InstanceHealth_Score';
END;

-- Agregar WaitsContribution a InstanceHealth_Score
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'WaitsContribution')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Score ADD WaitsContribution INT NOT NULL DEFAULT 0;
    PRINT 'Columna WaitsContribution agregada a InstanceHealth_Score';
END;

-- Actualizar el collector Waits: moverlo a Performance con peso 8%
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'Waits')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET Weight = 8.00,
        Category = 'Performance',
        ExecutionOrder = 5,
        Description = 'Estadisticas de espera y bloqueos (blocking, paralelismo, I/O latches)'
    WHERE CollectorName = 'Waits';
    PRINT 'Collector Waits movido a Performance con peso 8%';
END
ELSE
BEGIN
    -- Si no existe, crearlo en Performance
    INSERT INTO dbo.CollectorConfig (CollectorName, DisplayName, Description, IsEnabled, IntervalSeconds, TimeoutSeconds, Weight, ParallelDegree, Category, ExecutionOrder, CreatedAtUtc, UpdatedAtUtc)
    VALUES ('Waits', 'Wait Statistics', 'Estadisticas de espera y bloqueos (blocking, paralelismo, I/O latches)', 1, 300, 30, 8.00, 5, 'Performance', 5, GETDATE(), GETDATE());
    PRINT 'Collector Waits creado en Performance con peso 8%';
END;

-- ELIMINAR LogChain completamente (deshabilitarlo y peso 0)
IF EXISTS (SELECT 1 FROM dbo.CollectorConfig WHERE CollectorName = 'LogChain')
BEGIN
    UPDATE dbo.CollectorConfig 
    SET Weight = 0.00,
        IsEnabled = 0,
        Description = 'OBSOLETO - La validacion de log backups se hace en el collector de Backups'
    WHERE CollectorName = 'LogChain';
    PRINT 'Collector LogChain DESHABILITADO y peso 0%';
END;

-- Redistribuir los pesos para que sumen 100%
-- Nuevos pesos (12 categorias, sin LogChain en ponderacion):
-- Backups: 18%, AlwaysOn: 14%, DatabaseStates: 3%, CPU: 10%, Memoria: 8%, IO: 10%, 
-- Discos: 7%, Waits: 8%, ErroresCriticos: 7%, Maintenance: 5%, ConfiguracionTempdb: 5%, Autogrowth: 5%
-- Total: 100%

UPDATE dbo.CollectorConfig SET Weight = 18.00 WHERE CollectorName = 'Backups';
UPDATE dbo.CollectorConfig SET Weight = 14.00 WHERE CollectorName = 'AlwaysOn';
UPDATE dbo.CollectorConfig SET Weight = 3.00 WHERE CollectorName = 'DatabaseStates';
UPDATE dbo.CollectorConfig SET Weight = 10.00 WHERE CollectorName = 'CPU';
UPDATE dbo.CollectorConfig SET Weight = 8.00 WHERE CollectorName = 'Memoria';
UPDATE dbo.CollectorConfig SET Weight = 10.00 WHERE CollectorName = 'IO';
UPDATE dbo.CollectorConfig SET Weight = 7.00 WHERE CollectorName = 'Discos';
UPDATE dbo.CollectorConfig SET Weight = 8.00 WHERE CollectorName = 'Waits';
UPDATE dbo.CollectorConfig SET Weight = 7.00 WHERE CollectorName = 'ErroresCriticos';
UPDATE dbo.CollectorConfig SET Weight = 5.00 WHERE CollectorName = 'Maintenance';
UPDATE dbo.CollectorConfig SET Weight = 5.00 WHERE CollectorName = 'ConfiguracionTempdb';
UPDATE dbo.CollectorConfig SET Weight = 5.00 WHERE CollectorName = 'Autogrowth';
UPDATE dbo.CollectorConfig SET Weight = 0.00 WHERE CollectorName = 'LogChain';

PRINT 'Pesos actualizados correctamente. Suma total: 100%';

-- Agregar umbrales configurables para Waits
IF NOT EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'Waits')
BEGIN
    INSERT INTO dbo.CollectorThresholds (CollectorName, ThresholdName, DisplayName, ThresholdValue, ThresholdOperator, ResultingScore, ActionType, Description, DefaultValue, EvaluationOrder, ThresholdGroup)
    VALUES
        -- Blocking (sesiones bloqueadas)
        ('Waits', 'Blocking_None', 'Sin Bloqueos', 0, '=', 100, 'Score', 'Sin sesiones bloqueadas', 0, 1, 'Blocking'),
        ('Waits', 'Blocking_Low', 'Bloqueos Bajo', 3, '<=', 80, 'Score', '1-3 sesiones bloqueadas', 3, 2, 'Blocking'),
        ('Waits', 'Blocking_Medium', 'Bloqueos Medio', 10, '<=', 60, 'Score', '4-10 sesiones bloqueadas', 10, 3, 'Blocking'),
        ('Waits', 'Blocking_High', 'Bloqueos Alto', 10, '>', 40, 'Score', '>10 sesiones bloqueadas', 10, 4, 'Blocking'),
        
        -- Max Block Time (segundos)
        ('Waits', 'BlockTime_Normal', 'Tiempo Bloqueo Normal', 30, '<=', 100, 'Score', 'Bloqueo max <=30s', 30, 5, 'BlockTime'),
        ('Waits', 'BlockTime_Warning', 'Tiempo Bloqueo Warning', 60, '<=', 70, 'Score', 'Bloqueo max 31-60s', 60, 6, 'BlockTime'),
        ('Waits', 'BlockTime_Critical', 'Tiempo Bloqueo Critico', 60, '>', 40, 'Score', 'Bloqueo max >60s', 60, 7, 'BlockTime'),
        
        -- Signal Wait Percentage (indicador de presion CPU)
        ('Waits', 'SignalWait_Optimal', 'Signal Wait Optimo', 10, '<=', 100, 'Score', 'Signal wait <=10% (CPU OK)', 10, 8, 'SignalWait'),
        ('Waits', 'SignalWait_Warning', 'Signal Wait Warning', 20, '<=', 80, 'Score', 'Signal wait 11-20%', 20, 9, 'SignalWait'),
        ('Waits', 'SignalWait_High', 'Signal Wait Alto', 30, '<=', 60, 'Score', 'Signal wait 21-30%', 30, 10, 'SignalWait'),
        ('Waits', 'SignalWait_Critical', 'Signal Wait Critico', 30, '>', 40, 'Score', 'Signal wait >30% (presion CPU)', 30, 11, 'SignalWait'),
        
        -- CXPACKET/CXCONSUMER waits (paralelismo excesivo)
        ('Waits', 'Parallelism_Optimal', 'Paralelismo Optimo', 20, '<=', 100, 'Score', 'Waits de paralelismo <=20%', 20, 12, 'Parallelism'),
        ('Waits', 'Parallelism_High', 'Paralelismo Alto', 40, '<=', 70, 'Score', 'Waits de paralelismo 21-40%', 40, 13, 'Parallelism'),
        ('Waits', 'Parallelism_Critical', 'Paralelismo Critico', 40, '>', 50, 'Score', 'Waits de paralelismo >40%', 40, 14, 'Parallelism'),
        
        -- PAGEIOLATCH waits (I/O issues)
        ('Waits', 'IOLatches_Optimal', 'I/O Latches Optimo', 15, '<=', 100, 'Score', 'PAGEIOLATCH waits <=15%', 15, 15, 'IOLatches'),
        ('Waits', 'IOLatches_Warning', 'I/O Latches Warning', 30, '<=', 70, 'Score', 'PAGEIOLATCH waits 16-30%', 30, 16, 'IOLatches'),
        ('Waits', 'IOLatches_Critical', 'I/O Latches Critico', 30, '>', 50, 'Score', 'PAGEIOLATCH waits >30%', 30, 17, 'IOLatches'),
        
        -- Memory waits (RESOURCE_SEMAPHORE)
        ('Waits', 'MemoryWait_Optimal', 'Memory Waits Optimo', 5, '<=', 100, 'Score', 'Memory waits <=5%', 5, 18, 'MemoryWaits'),
        ('Waits', 'MemoryWait_Warning', 'Memory Waits Warning', 15, '<=', 70, 'Score', 'Memory waits 6-15%', 15, 19, 'MemoryWaits'),
        ('Waits', 'MemoryWait_Critical', 'Memory Waits Critico', 15, '>', 50, 'Score', 'Memory waits >15%', 15, 20, 'MemoryWaits');
    
    PRINT 'Umbrales de Waits creados correctamente';
END
ELSE
BEGIN
    PRINT 'Los umbrales de Waits ya existen';
END;

-- Eliminar umbrales de LogChain (ya no se usa)
IF EXISTS (SELECT 1 FROM dbo.CollectorThresholds WHERE CollectorName = 'LogChain')
BEGIN
    DELETE FROM dbo.CollectorThresholds WHERE CollectorName = 'LogChain';
    PRINT 'Umbrales de LogChain eliminados';
END;

-- Verificar collectors y pesos
SELECT CollectorName, DisplayName, Weight, IsEnabled, IntervalSeconds, ParallelDegree, Category
FROM dbo.CollectorConfig
WHERE Weight > 0
ORDER BY Weight DESC, CollectorName;

SELECT SUM(Weight) AS TotalWeight FROM dbo.CollectorConfig WHERE Weight > 0;

-- Verificar umbrales de Waits
SELECT * FROM dbo.CollectorThresholds WHERE CollectorName = 'Waits' ORDER BY EvaluationOrder;

GO

