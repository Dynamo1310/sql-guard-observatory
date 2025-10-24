-- =============================================
-- Crear SQL Agent Job para materializar Health Scores
-- =============================================
USE msdb;
GO

-- Eliminar job si existe
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = 'HealthScore V2 - Materializar Scores')
BEGIN
    EXEC msdb.dbo.sp_delete_job @job_name = 'HealthScore V2 - Materializar Scores';
    PRINT 'Job anterior eliminado';
END
GO

-- Crear el Job
DECLARE @jobId BINARY(16);

EXEC msdb.dbo.sp_add_job 
    @job_name = N'HealthScore V2 - Materializar Scores',
    @enabled = 1,
    @description = N'Guarda snapshots periódicos de los Health Scores calculados para histórico y tendencias',
    @category_name = N'Database Maintenance',
    @owner_login_name = N'sa',
    @job_id = @jobId OUTPUT;

-- Paso 1: Ejecutar el procedimiento de materialización
EXEC msdb.dbo.sp_add_jobstep 
    @job_id = @jobId,
    @step_name = N'Materializar Health Scores',
    @step_id = 1,
    @cmdexec_success_code = 0,
    @on_success_action = 1, -- Quit with success
    @on_fail_action = 2,     -- Quit with failure
    @retry_attempts = 2,
    @retry_interval = 5,
    @subsystem = N'TSQL',
    @command = N'EXEC dbo.usp_MaterializarHealthScores_V2',
    @database_name = N'SQLNova';

-- Schedule: Cada 10 minutos
EXEC msdb.dbo.sp_add_jobschedule 
    @job_id = @jobId,
    @name = N'Cada 10 minutos',
    @enabled = 1,
    @freq_type = 4,           -- Daily
    @freq_interval = 1,       -- Every 1 day
    @freq_subday_type = 4,    -- Minutes
    @freq_subday_interval = 10, -- Every 10 minutes
    @active_start_time = 0;   -- 00:00:00

-- Asignar al servidor local
EXEC msdb.dbo.sp_add_jobserver 
    @job_id = @jobId,
    @server_name = N'(local)';

PRINT '';
PRINT '==============================================';
PRINT 'Job de SQL Agent creado exitosamente';
PRINT '==============================================';
PRINT '';
PRINT 'Nombre: HealthScore V2 - Materializar Scores';
PRINT 'Schedule: Cada 10 minutos, 24/7';
PRINT 'Database: SQLNova';
PRINT '';
PRINT 'Para ejecutar manualmente:';
PRINT 'EXEC msdb.dbo.sp_start_job @job_name = ''HealthScore V2 - Materializar Scores''';
PRINT '';
PRINT 'Para ver el historial:';
PRINT 'EXEC msdb.dbo.sp_help_jobhistory @job_name = ''HealthScore V2 - Materializar Scores''';
PRINT '';
GO

