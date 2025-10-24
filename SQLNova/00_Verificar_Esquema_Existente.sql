-- =============================================
-- Verificar esquema existente de tablas
-- =============================================
USE SQLNova;
GO

-- Verificar si existe InventarioDiscosSnapshot y sus columnas
IF OBJECT_ID('dbo.InventarioDiscosSnapshot', 'U') IS NOT NULL
BEGIN
    PRINT 'Tabla InventarioDiscosSnapshot existe con las siguientes columnas:';
    SELECT 
        c.name AS ColumnName,
        t.name AS DataType,
        c.max_length,
        c.is_nullable
    FROM sys.columns c
    INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
    WHERE c.object_id = OBJECT_ID('dbo.InventarioDiscosSnapshot')
    ORDER BY c.column_id;
END
ELSE
BEGIN
    PRINT 'Tabla InventarioDiscosSnapshot NO existe';
END
GO

-- Verificar todas las tablas del esquema Health Score V2
PRINT '';
PRINT 'Tablas que existen del esquema Health Score:';
SELECT 
    name,
    create_date
FROM sys.tables
WHERE name LIKE 'Inventario%Snapshot'
   OR name LIKE 'HealthScore%'
   OR name = 'CollectorLog'
ORDER BY name;
GO

