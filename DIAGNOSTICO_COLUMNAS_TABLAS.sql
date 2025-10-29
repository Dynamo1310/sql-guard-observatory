-- =====================================================
-- Script de diagnóstico para verificar columnas
-- de las tablas de tendencias
-- =====================================================

USE SQLNova;
GO

PRINT '================================================';
PRINT 'DIAGNÓSTICO DE COLUMNAS - TABLAS DE TENDENCIAS';
PRINT '================================================';
PRINT '';

-- 1. InstanceHealth_Score
PRINT '1️⃣ Tabla: InstanceHealth_Score';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Score'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;
PRINT '';

-- 2. InstanceHealth_CPU
PRINT '2️⃣ Tabla: InstanceHealth_CPU';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_CPU'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;
PRINT '';

-- 3. InstanceHealth_Memoria
PRINT '3️⃣ Tabla: InstanceHealth_Memoria';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Memoria'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;
PRINT '';

-- 4. InstanceHealth_IO
PRINT '4️⃣ Tabla: InstanceHealth_IO';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_IO'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;
PRINT '';

-- 5. InstanceHealth_Discos
PRINT '5️⃣ Tabla: InstanceHealth_Discos';
PRINT '-----------------------------------';
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    CHARACTER_MAXIMUM_LENGTH,
    IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'InstanceHealth_Discos'
    AND TABLE_SCHEMA = 'dbo'
ORDER BY ORDINAL_POSITION;
PRINT '';

PRINT '================================================';
PRINT 'DIAGNÓSTICO COMPLETADO';
PRINT '================================================';
PRINT '';
PRINT '⚠️  Copia TODA la salida y envíamela para ajustar los endpoints';
PRINT '';

