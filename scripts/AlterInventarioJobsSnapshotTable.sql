/*
    Script para actualizar la tabla InventarioJobsSnapshot
    - Agrega la columna JobEnabled
    - Renombra JobStatus a ExecutionStatus
*/

USE SQLNova
GO

-- Verificar si la tabla existe
IF EXISTS (SELECT 1 FROM sys.tables t
           JOIN sys.schemas s ON s.schema_id = t.schema_id
           WHERE t.name = 'InventarioJobsSnapshot' AND s.name = 'dbo')
BEGIN
    PRINT 'Modificando tabla dbo.InventarioJobsSnapshot...'
    
    -- 1. Agregar la nueva columna JobEnabled (si no existe)
    IF NOT EXISTS (SELECT 1 FROM sys.columns 
                   WHERE object_id = OBJECT_ID('dbo.InventarioJobsSnapshot') 
                   AND name = 'JobEnabled')
    BEGIN
        ALTER TABLE dbo.InventarioJobsSnapshot
        ADD JobEnabled NVARCHAR(20) NULL
        
        PRINT '  ✓ Columna JobEnabled agregada'
    END
    ELSE
    BEGIN
        PRINT '  → Columna JobEnabled ya existe'
    END
    
    -- 2. Verificar si existe la columna ExecutionStatus
    IF NOT EXISTS (SELECT 1 FROM sys.columns 
                   WHERE object_id = OBJECT_ID('dbo.InventarioJobsSnapshot') 
                   AND name = 'ExecutionStatus')
    BEGIN
        -- Si existe JobStatus, renombrarla a ExecutionStatus
        IF EXISTS (SELECT 1 FROM sys.columns 
                   WHERE object_id = OBJECT_ID('dbo.InventarioJobsSnapshot') 
                   AND name = 'JobStatus')
        BEGIN
            EXEC sp_rename 'dbo.InventarioJobsSnapshot.JobStatus', 'ExecutionStatus', 'COLUMN'
            PRINT '  ✓ Columna JobStatus renombrada a ExecutionStatus'
        END
        ELSE
        BEGIN
            -- Si no existe ni JobStatus ni ExecutionStatus, crearla
            ALTER TABLE dbo.InventarioJobsSnapshot
            ADD ExecutionStatus NVARCHAR(50) NULL
            
            PRINT '  ✓ Columna ExecutionStatus creada'
        END
    END
    ELSE
    BEGIN
        PRINT '  → Columna ExecutionStatus ya existe'
        
        -- Si ExecutionStatus existe y JobStatus también existe (caso raro), eliminar JobStatus
        IF EXISTS (SELECT 1 FROM sys.columns 
                   WHERE object_id = OBJECT_ID('dbo.InventarioJobsSnapshot') 
                   AND name = 'JobStatus')
        BEGIN
            PRINT '  ⚠ Ambas columnas existen, limpiando JobStatus antigua...'
            
            -- Eliminar la columna antigua JobStatus directamente
            -- (No copiamos datos porque ExecutionStatus ya existe y tiene prioridad)
            ALTER TABLE dbo.InventarioJobsSnapshot
            DROP COLUMN JobStatus
            
            PRINT '  ✓ Columna JobStatus eliminada'
        END
    END
    
    PRINT ''
    PRINT '✅ Tabla actualizada exitosamente'
    PRINT ''
    
    -- Mostrar estructura actual
    PRINT 'Estructura actual de la tabla:'
    SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        CHARACTER_MAXIMUM_LENGTH,
        IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'InventarioJobsSnapshot'
        AND TABLE_SCHEMA = 'dbo'
    ORDER BY ORDINAL_POSITION
END
ELSE
BEGIN
    PRINT '❌ ERROR: La tabla dbo.InventarioJobsSnapshot no existe'
END
GO

