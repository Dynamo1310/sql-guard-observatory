/*******************************************************************************
  CONFIGURACIÓN RECOMENDADA PARA: SSDS14-01
  
  Servidor: SSDS14-01
  SQL Server: 2014 (12.0.6449.1)
  RAM Física: 49 GB (49,151 MB)
  CPUs: 4 cores
  
  PROBLEMAS DETECTADOS:
  1. ❌ Max Server Memory = UNLIMITED (no configurado)
  2. ❌ TempDB tiene solo 1 archivo (debería tener 4)
  3. ⚠️  sys.dm_db_file_space_usage devuelve NULL (sin actividad en TempDB)
  
  EJECUTAR ESTE SCRIPT EN: SSDS14-01
*******************************************************************************/

USE master;
GO

PRINT '════════════════════════════════════════════════════════════════';
PRINT '  FIX 1: CONFIGURAR MAX SERVER MEMORY';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';

-- Calcular Max Memory óptimo (80% de RAM física = 39,320 MB ≈ 39 GB)
DECLARE @PhysicalMemoryMB INT;
DECLARE @RecommendedMaxMemoryMB INT;

SELECT @PhysicalMemoryMB = physical_memory_kb / 1024
FROM sys.dm_os_sys_info;

SET @RecommendedMaxMemoryMB = CAST(@PhysicalMemoryMB * 0.80 AS INT);

PRINT 'RAM Física detectada: ' + CAST(@PhysicalMemoryMB AS VARCHAR(10)) + ' MB';
PRINT 'Max Memory recomendado (80%): ' + CAST(@RecommendedMaxMemoryMB AS VARCHAR(10)) + ' MB';
PRINT '';
PRINT '⚠️  IMPORTANTE: Esto va a REINICIAR la memoria de SQL Server.';
PRINT '   Ejecutar en ventana de mantenimiento si es posible.';
PRINT '';

-- Configurar Max Memory a 39 GB (39,320 MB)
EXEC sp_configure 'show advanced options', 1;
RECONFIGURE;
GO

EXEC sp_configure 'max server memory (MB)', 39320;
RECONFIGURE;
GO

PRINT '✅ Max Server Memory configurado a 39,320 MB (39 GB)';
PRINT '';

-- Verificar cambio
SELECT 
    name,
    value_in_use AS ConfiguredValue,
    CAST(value_in_use AS DECIMAL(10,2)) / 1024 AS ConfiguredGB
FROM sys.configurations
WHERE name = 'max server memory (MB)';
GO

PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '  FIX 2: AGREGAR ARCHIVOS DE TEMPDB';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';

-- Estado actual de TempDB
PRINT 'Estado ACTUAL de TempDB:';
SELECT 
    name AS FileName,
    physical_name AS FilePath,
    size * 8 / 1024 AS CurrentSizeMB,
    CASE is_percent_growth 
        WHEN 1 THEN 'Percent: ' + CAST(growth AS VARCHAR(10)) + '%'
        ELSE 'Fixed: ' + CAST(growth * 8 / 1024 AS VARCHAR(10)) + ' MB'
    END AS GrowthConfig
FROM sys.master_files
WHERE database_id = DB_ID('tempdb')
  AND type_desc = 'ROWS'
ORDER BY file_id;
GO

PRINT '';
PRINT '⚠️  IMPORTANTE: Agregar archivos de TempDB requiere conocer la ruta actual.';
PRINT '   Con 4 CPUs, deberías tener 4 archivos de datos.';
PRINT '';
PRINT '📝 DETECTAR RUTA ACTUAL:';

DECLARE @TempDBPath NVARCHAR(500);
SELECT TOP 1 @TempDBPath = LEFT(physical_name, LEN(physical_name) - CHARINDEX('\', REVERSE(physical_name)))
FROM sys.master_files
WHERE database_id = DB_ID('tempdb') AND type = 0;

PRINT '   Ruta detectada: ' + @TempDBPath;
PRINT '';

-- Generar script para agregar archivos
PRINT '📋 EJECUTAR LOS SIGUIENTES COMANDOS:';
PRINT '   (Ajustar rutas si es necesario)';
PRINT '';
PRINT '-- Agregar archivo 2';
PRINT 'ALTER DATABASE tempdb ADD FILE (';
PRINT '    NAME = tempdev2,';
PRINT '    FILENAME = ''' + @TempDBPath + '\tempdb2.ndf'',';
PRINT '    SIZE = 8MB,';
PRINT '    FILEGROWTH = 64MB';
PRINT ');';
PRINT '';
PRINT '-- Agregar archivo 3';
PRINT 'ALTER DATABASE tempdb ADD FILE (';
PRINT '    NAME = tempdev3,';
PRINT '    FILENAME = ''' + @TempDBPath + '\tempdb3.ndf'',';
PRINT '    SIZE = 8MB,';
PRINT '    FILEGROWTH = 64MB';
PRINT ');';
PRINT '';
PRINT '-- Agregar archivo 4';
PRINT 'ALTER DATABASE tempdb ADD FILE (';
PRINT '    NAME = tempdev4,';
PRINT '    FILENAME = ''' + @TempDBPath + '\tempdb4.ndf'',';
PRINT '    SIZE = 8MB,';
PRINT '    FILEGROWTH = 64MB';
PRINT ');';
PRINT '';
PRINT '⚠️  NOTA: Los archivos se crearán al REINICIAR SQL Server.';
PRINT '';

/*
-- DESCOMENTA Y EJECUTA MANUALMENTE si estás seguro de la ruta:

ALTER DATABASE tempdb ADD FILE (
    NAME = tempdev2,
    FILENAME = 'C:\SQLData\tempdb2.ndf',  -- AJUSTAR RUTA
    SIZE = 8MB,
    FILEGROWTH = 64MB
);

ALTER DATABASE tempdb ADD FILE (
    NAME = tempdev3,
    FILENAME = 'C:\SQLData\tempdb3.ndf',  -- AJUSTAR RUTA
    SIZE = 8MB,
    FILEGROWTH = 64MB
);

ALTER DATABASE tempdb ADD FILE (
    NAME = tempdev4,
    FILENAME = 'C:\SQLData\tempdb4.ndf',  -- AJUSTAR RUTA
    SIZE = 8MB,
    FILEGROWTH = 64MB
);
*/

PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '  FIX 3: GENERAR ACTIVIDAD EN TEMPDB (para poblar DMV)';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';

-- Generar actividad mínima para que sys.dm_db_file_space_usage tenga datos
USE tempdb;
GO

CREATE TABLE #TestActivity (
    id INT IDENTITY(1,1),
    data NVARCHAR(100)
);

INSERT INTO #TestActivity (data)
VALUES ('Generando actividad para poblar DMV');

DROP TABLE #TestActivity;
GO

PRINT '✅ Actividad generada en TempDB';
PRINT '';

-- Verificar que ahora sys.dm_db_file_space_usage tiene datos
USE master;
GO

PRINT 'Verificando sys.dm_db_file_space_usage:';
SELECT 
    SUM(total_page_count) * 8 / 1024 AS TotalSizeMB,
    SUM(allocated_extent_page_count) * 8 / 1024 AS UsedSpaceMB,
    CASE 
        WHEN SUM(total_page_count) > 0 
        THEN CAST((SUM(total_page_count) - SUM(allocated_extent_page_count)) * 100.0 / SUM(total_page_count) AS DECIMAL(5,2))
        ELSE 0 
    END AS FreeSpacePct
FROM sys.dm_db_file_space_usage
WHERE database_id = DB_ID('tempdb');
GO

PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '  RESUMEN DE CAMBIOS APLICADOS';
PRINT '════════════════════════════════════════════════════════════════';
PRINT '';
PRINT '✅ Max Server Memory: Configurado a 39,320 MB (39 GB)';
PRINT '📝 TempDB Files: Comandos generados (ejecutar manualmente)';
PRINT '✅ DMV Activity: Actividad generada en TempDB';
PRINT '';
PRINT '⚠️  IMPORTANTE:';
PRINT '   - Max Memory ya está activo (sin reinicio)';
PRINT '   - Archivos de TempDB requieren REINICIO de SQL Server';
PRINT '   - Verificar con: .\Diagnosticar-ConfigTempdb.ps1 -InstanceName "SSDS14-01"';
PRINT '';
PRINT '════════════════════════════════════════════════════════════════';
GO

