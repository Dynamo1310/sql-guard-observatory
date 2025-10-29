-- Solo las tablas que faltan
USE SQLNova;
GO

PRINT '2️⃣ Tabla: InstanceHealth_CPU';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_CPU'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '3️⃣ Tabla: InstanceHealth_Memoria';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Memoria'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '4️⃣ Tabla: InstanceHealth_IO';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_IO'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

PRINT '';
PRINT '5️⃣ Tabla: InstanceHealth_Discos';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Discos'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;

