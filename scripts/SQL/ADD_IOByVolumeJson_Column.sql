-- Agregar columna para almacenar latencia por volumen/disco
USE SQLNova;
GO

-- Verificar si la columna ya existe
IF NOT EXISTS (
    SELECT 1 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'InstanceHealth_IO' 
    AND COLUMN_NAME = 'IOByVolumeJson'
)
BEGIN
    ALTER TABLE dbo.InstanceHealth_IO
    ADD IOByVolumeJson NVARCHAR(MAX) NULL;
    
    PRINT '✅ Columna IOByVolumeJson agregada a InstanceHealth_IO';
END
ELSE
BEGIN
    PRINT '⚠️  Columna IOByVolumeJson ya existe';
END
GO

