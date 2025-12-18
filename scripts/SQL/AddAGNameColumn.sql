-- =============================================
-- Agregar columna AGName a InstanceHealth_Maintenance
-- Para identificar a qué AG pertenece la instancia
-- =============================================

USE SQLNova;
GO

-- Agregar columna AGName si no existe
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'AGName')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Maintenance
    ADD AGName NVARCHAR(255) NULL;
    
    PRINT '✅ Columna AGName agregada a InstanceHealth_Maintenance';
END
ELSE
BEGIN
    PRINT '⚠️ Columna AGName ya existe en InstanceHealth_Maintenance';
END
GO

-- Crear índice para búsquedas por AGName
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'IX_AGName')
BEGIN
    CREATE NONCLUSTERED INDEX IX_AGName 
    ON dbo.InstanceHealth_Maintenance (AGName) 
    WHERE AGName IS NOT NULL;
    
    PRINT '✅ Índice IX_AGName creado';
END
GO

