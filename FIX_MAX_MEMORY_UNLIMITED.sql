-- =====================================================
-- Script: Identificar y Corregir Max Memory UNLIMITED
-- =====================================================
-- Este script identifica instancias con max server memory 
-- sin configurar y genera comandos para corregirlo.
--
-- IMPORTANTE: Revisar y aprobar ANTES de ejecutar!
-- =====================================================

USE SQLNova;
GO

-- =====================================================
-- 1. IDENTIFICAR INSTANCIAS CON MAX MEMORY UNLIMITED
-- =====================================================

PRINT '🔍 Instancias con Max Server Memory UNLIMITED (sin configurar):';
PRINT '';

SELECT 
    InstanceName,
    Ambiente,
    HostingSite,
    TotalPhysicalMemoryMB,
    MaxServerMemoryMB,
    CPUCount,
    CollectedAtUtc,
    ConfigDetails
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE MaxServerMemoryMB = 0  -- Marcado como UNLIMITED
  AND CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())  -- Última hora
ORDER BY TotalPhysicalMemoryMB DESC, InstanceName;

-- =====================================================
-- 2. RESUMEN POR AMBIENTE
-- =====================================================

PRINT '';
PRINT '📊 Resumen por Ambiente:';
PRINT '';

SELECT 
    Ambiente,
    COUNT(*) AS TotalInstances,
    COUNT(CASE WHEN MaxServerMemoryMB = 0 THEN 1 END) AS WithUnlimited,
    CAST(COUNT(CASE WHEN MaxServerMemoryMB = 0 THEN 1 END) * 100.0 / COUNT(*) AS DECIMAL(5,2)) AS PctUnlimited
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
GROUP BY Ambiente
ORDER BY WithUnlimited DESC;

-- =====================================================
-- 3. GENERAR COMANDOS DE CORRECCIÓN
-- =====================================================

PRINT '';
PRINT '🔧 Comandos para configurar Max Memory (revisar ANTES de ejecutar):';
PRINT '';
PRINT '-- COPIAR Y EJECUTAR EN CADA INSTANCIA SEGÚN CORRESPONDA';
PRINT '';

-- Generar script de corrección para cada instancia
SELECT 
    InstanceName,
    TotalPhysicalMemoryMB,
    -- Calcular max memory recomendado:
    -- - Si RAM < 4 GB: 75% de RAM
    -- - Si RAM 4-16 GB: 80% de RAM
    -- - Si RAM > 16 GB: 85% de RAM (dejar más para OS en servers grandes)
    CASE 
        WHEN TotalPhysicalMemoryMB < 4096 THEN CAST(TotalPhysicalMemoryMB * 0.75 AS INT)
        WHEN TotalPhysicalMemoryMB < 16384 THEN CAST(TotalPhysicalMemoryMB * 0.80 AS INT)
        ELSE CAST(TotalPhysicalMemoryMB * 0.85 AS INT)
    END AS RecommendedMaxMemoryMB,
    '
-- Instancia: ' + InstanceName + ' (RAM: ' + CAST(TotalPhysicalMemoryMB AS VARCHAR) + ' MB)
USE master;
GO
EXEC sp_configure ''show advanced options'', 1;
RECONFIGURE;
GO
EXEC sp_configure ''max server memory (MB)'', ' + 
    CAST(
        CASE 
            WHEN TotalPhysicalMemoryMB < 4096 THEN CAST(TotalPhysicalMemoryMB * 0.75 AS INT)
            WHEN TotalPhysicalMemoryMB < 16384 THEN CAST(TotalPhysicalMemoryMB * 0.80 AS INT)
            ELSE CAST(TotalPhysicalMemoryMB * 0.85 AS INT)
        END AS VARCHAR
    ) + ';
RECONFIGURE;
GO
-- Verificar
SELECT CAST(value AS INT) AS MaxMemoryMB FROM sys.configurations WHERE name = ''max server memory (MB)'';
GO
' AS ScriptToExecute
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE MaxServerMemoryMB = 0  -- UNLIMITED
  AND CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
  AND TotalPhysicalMemoryMB > 0  -- Solo si tenemos info de RAM
ORDER BY TotalPhysicalMemoryMB DESC, InstanceName;

-- =====================================================
-- 4. CASOS ESPECIALES (RAM > 128 GB)
-- =====================================================

PRINT '';
PRINT '⚠️  CASOS ESPECIALES - Servidores con mucha RAM:';
PRINT '';

SELECT 
    InstanceName,
    TotalPhysicalMemoryMB,
    CAST(TotalPhysicalMemoryMB / 1024.0 AS DECIMAL(10,2)) AS TotalPhysicalMemoryGB,
    CAST(TotalPhysicalMemoryMB * 0.85 AS INT) AS RecommendedMaxMemoryMB,
    '⚠️ Revisar manualmente - Servidor con ' + CAST(CAST(TotalPhysicalMemoryMB / 1024.0 AS DECIMAL(10,2)) AS VARCHAR) + ' GB RAM' AS Nota
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE MaxServerMemoryMB = 0
  AND TotalPhysicalMemoryMB > 131072  -- Más de 128 GB
  AND CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
ORDER BY TotalPhysicalMemoryMB DESC;

-- =====================================================
-- 5. VERIFICACIÓN POST-CONFIGURACIÓN
-- =====================================================

PRINT '';
PRINT '✅ Script para VERIFICAR después de aplicar cambios:';
PRINT '';
PRINT '-- Ejecutar en cada instancia DESPUÉS de configurar:';
PRINT '';
PRINT 'SELECT 
    @@SERVERNAME AS InstanceName,
    physical_memory_kb / 1024 AS TotalPhysicalMemoryMB,
    CAST(value AS INT) AS MaxServerMemoryMB,
    CAST((CAST(value AS INT) * 100.0) / (physical_memory_kb / 1024.0) AS DECIMAL(5,2)) AS PctOfPhysical,
    CASE 
        WHEN CAST((CAST(value AS INT) * 100.0) / (physical_memory_kb / 1024.0) AS DECIMAL(5,2)) BETWEEN 70 AND 95 THEN ''✅ ÓPTIMO''
        WHEN CAST(value AS INT) = 2147483647 THEN ''❌ UNLIMITED''
        ELSE ''⚠️ REVISAR''
    END AS Status
FROM sys.dm_os_sys_info
CROSS APPLY (SELECT CAST(value AS INT) AS value FROM sys.configurations WHERE name = ''max server memory (MB)'') cfg;';

-- =====================================================
-- 6. INSTANCIAS PRIORITARIAS (Producción)
-- =====================================================

PRINT '';
PRINT '🚨 INSTANCIAS PRIORITARIAS (PRODUCCIÓN):';
PRINT '';

SELECT TOP 20
    InstanceName,
    Ambiente,
    TotalPhysicalMemoryMB,
    CAST(TotalPhysicalMemoryMB / 1024.0 AS DECIMAL(10,2)) AS TotalGB,
    CAST(TotalPhysicalMemoryMB * 0.85 AS INT) AS RecommendedMaxMemoryMB,
    TempDBFileCount,
    TempDBContentionScore,
    '⚠️ URGENTE' AS Priority
FROM dbo.InstanceHealth_ConfiguracionTempdb
WHERE MaxServerMemoryMB = 0
  AND Ambiente LIKE '%PROD%'
  AND CollectedAtUtc >= DATEADD(HOUR, -1, GETUTCDATE())
ORDER BY TotalPhysicalMemoryMB DESC;

GO

-- =====================================================
-- NOTAS IMPORTANTES
-- =====================================================
/*
⚠️  CONSIDERACIONES ANTES DE APLICAR:

1. 🔍 REVISAR cada instancia individualmente
   - Verificar si hay otros servicios en el servidor
   - Considerar si es un servidor compartido
   - Validar con el DBA propietario

2. 📝 DOCUMENTAR los cambios
   - Crear ticket de cambio
   - Notificar a los stakeholders
   - Agendar ventana de mantenimiento si es necesario

3. ⏱️ TIMING
   - Aplicar en horarios de bajo tráfico
   - NO requiere reinicio de SQL Server
   - El cambio es inmediato

4. 🎯 VALORES RECOMENDADOS:
   - RAM < 4 GB:      75% de RAM física
   - RAM 4-16 GB:     80% de RAM física
   - RAM > 16 GB:     85% de RAM física
   - Servidores con >128 GB: Evaluar caso por caso

5. 🚫 EXCEPCIONES
   - Servidores con Analysis Services o Integration Services
   - Servidores compartidos con otras aplicaciones
   - VMs con memoria dinámica (Hyper-V/VMware)

6. 📊 VERIFICACIÓN
   - Monitorear PLE después del cambio
   - Verificar que no haya memory grants pending
   - Confirmar que Target = Total Server Memory

Para más información:
https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/server-memory-server-configuration-options
*/

