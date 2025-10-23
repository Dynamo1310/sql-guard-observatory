-- =============================================
-- Script: Migrar columna Drive de NVARCHAR(10) a NVARCHAR(255)
-- Proposito: Soportar mount points y rutas largas
-- Base de datos: SQLNova
-- =============================================

USE SQLNova
GO

-- Verificar si la tabla existe
IF EXISTS (
    SELECT 1 
    FROM sys.tables t
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    WHERE t.name = 'InventarioDiscosSnapshot' AND s.name = 'dbo'
)
BEGIN
    PRINT 'Actualizando columna Drive a NVARCHAR(255)...'
    
    -- Verificar el tamano actual de la columna
    DECLARE @CurrentLength INT
    SELECT @CurrentLength = c.max_length
    FROM sys.columns c
    JOIN sys.tables t ON c.object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE t.name = 'InventarioDiscosSnapshot' 
      AND s.name = 'dbo'
      AND c.name = 'Drive'
    
    IF @CurrentLength < 510  -- 255 * 2 (NVARCHAR usa 2 bytes por caracter)
    BEGIN
        PRINT 'Tamaño actual: ' + CAST(@CurrentLength/2 AS VARCHAR) + ' caracteres'
        PRINT 'Modificando a NVARCHAR(255)...'
        
        -- Alterar la columna
        ALTER TABLE [dbo].[InventarioDiscosSnapshot]
        ALTER COLUMN [Drive] NVARCHAR(255) NOT NULL
        
        PRINT 'Columna actualizada exitosamente'
        
        -- Verificar registros que antes no cabian
        SELECT TOP 10
            Drive,
            LEN(Drive) AS Longitud
        FROM [dbo].[InventarioDiscosSnapshot]
        WHERE LEN(Drive) > 10
        ORDER BY LEN(Drive) DESC
        
    END
    ELSE
    BEGIN
        PRINT 'La columna Drive ya tiene el tamaño correcto (>= 255 caracteres)'
    END
END
ELSE
BEGIN
    PRINT 'La tabla dbo.InventarioDiscosSnapshot no existe'
END
GO

