USE SQLNova;
GO

PRINT '🔍 Diagnóstico: Estado de AlwaysOn en la Base de Datos';
PRINT '';

-- =============================================
-- PASO 1: ¿Qué hay en InstanceHealth_Critical_Availability?
-- =============================================
PRINT '═══════════════════════════════════════════════════════';
PRINT 'PASO 1: Tabla InstanceHealth_Critical_Availability';
PRINT '═══════════════════════════════════════════════════════';
PRINT '';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Availability')
BEGIN
    PRINT '✅ La tabla existe';
    PRINT '';
    
    -- Registros más recientes
    PRINT 'Últimos 10 registros (ordenados por fecha):';
    SELECT TOP 10
        InstanceName,
        AlwaysOnEnabled,
        AlwaysOnWorstState,
        AlwaysOnDetails,
        CollectedAtUtc
    FROM dbo.InstanceHealth_Critical_Availability
    ORDER BY CollectedAtUtc DESC;
    
    PRINT '';
    PRINT 'Resumen por estado de AlwaysOn:';
    SELECT 
        CASE WHEN AlwaysOnEnabled = 1 THEN 'Habilitado' ELSE 'Deshabilitado' END AS Estado,
        COUNT(*) AS Total,
        COUNT(DISTINCT InstanceName) AS InstanciasUnicas
    FROM (
        SELECT 
            InstanceName, 
            AlwaysOnEnabled,
            ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
        FROM dbo.InstanceHealth_Critical_Availability
        WHERE CollectedAtUtc >= DATEADD(HOUR, -2, GETUTCDATE())
    ) latest
    WHERE rn = 1
    GROUP BY AlwaysOnEnabled;
    
    PRINT '';
    PRINT 'Instancias con AlwaysOn habilitado (últimas 2 horas):';
    SELECT 
        InstanceName,
        AlwaysOnEnabled,
        AlwaysOnWorstState,
        CollectedAtUtc
    FROM (
        SELECT 
            InstanceName, 
            AlwaysOnEnabled,
            AlwaysOnWorstState,
            CollectedAtUtc,
            ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
        FROM dbo.InstanceHealth_Critical_Availability
        WHERE CollectedAtUtc >= DATEADD(HOUR, -2, GETUTCDATE())
    ) latest
    WHERE rn = 1 AND AlwaysOnEnabled = 1
    ORDER BY InstanceName;
    
END
ELSE
BEGIN
    PRINT '❌ La tabla NO existe';
END

PRINT '';
PRINT '';

-- =============================================
-- PASO 2: ¿Qué hay en la vista vw_InstanceHealth_Latest?
-- =============================================
PRINT '═══════════════════════════════════════════════════════';
PRINT 'PASO 2: Vista vw_InstanceHealth_Latest';
PRINT '═══════════════════════════════════════════════════════';
PRINT '';

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
BEGIN
    PRINT '✅ La vista existe';
    PRINT '';
    
    PRINT 'Columnas de AlwaysOn en la vista (primeras 10):';
    SELECT TOP 10
        InstanceName,
        AlwaysOnEnabled,
        AlwaysOnWorstState,
        AvailabilityCollectedAt,
        ScoreCollectedAt
    FROM dbo.vw_InstanceHealth_Latest
    ORDER BY ScoreCollectedAt DESC;
    
    PRINT '';
    PRINT 'Resumen por estado de AlwaysOn:';
    SELECT 
        CASE WHEN AlwaysOnEnabled = 1 THEN 'Habilitado' ELSE 'Deshabilitado' END AS Estado,
        COUNT(*) AS Total
    FROM dbo.vw_InstanceHealth_Latest
    GROUP BY AlwaysOnEnabled;
    
    PRINT '';
    PRINT 'Instancias con AlwaysOn habilitado (desde vista):';
    SELECT 
        InstanceName,
        AlwaysOnEnabled,
        AlwaysOnWorstState,
        AvailabilityCollectedAt
    FROM dbo.vw_InstanceHealth_Latest
    WHERE AlwaysOnEnabled = 1
    ORDER BY InstanceName;
    
END
ELSE
BEGIN
    PRINT '❌ La vista NO existe';
END

PRINT '';
PRINT '';

-- =============================================
-- PASO 3: Comparación con API (casos conocidos)
-- =============================================
PRINT '═══════════════════════════════════════════════════════';
PRINT 'PASO 3: Verificar casos conocidos de la API';
PRINT '═══════════════════════════════════════════════════════';
PRINT '';

-- RSCRM365-01 debería tener AlwaysOn habilitado según API
PRINT 'RSCRM365-01 (debería estar Habilitado según API):';
SELECT 
    InstanceName,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    CollectedAtUtc
FROM dbo.InstanceHealth_Critical_Availability
WHERE InstanceName = 'RSCRM365-01'
ORDER BY CollectedAtUtc DESC;

PRINT '';

-- TQRSA-02 debería tener AlwaysOn deshabilitado según API
PRINT 'TQRSA-02 (debería estar Deshabilitado según API):';
SELECT 
    InstanceName,
    AlwaysOnEnabled,
    AlwaysOnWorstState,
    CollectedAtUtc
FROM dbo.InstanceHealth_Critical_Availability
WHERE InstanceName = 'TQRSA-02'
ORDER BY CollectedAtUtc DESC;

PRINT '';
PRINT '';

-- =============================================
-- PASO 4: Diagnóstico de problemas potenciales
-- =============================================
PRINT '═══════════════════════════════════════════════════════';
PRINT 'PASO 4: Diagnóstico de problemas potenciales';
PRINT '═══════════════════════════════════════════════════════';
PRINT '';

PRINT 'Verificando si todas las instancias tienen AlwaysOnEnabled = 0...';
SELECT 
    COUNT(*) AS TotalRegistros,
    SUM(CASE WHEN AlwaysOnEnabled = 1 THEN 1 ELSE 0 END) AS ConAlwaysOnHabilitado,
    SUM(CASE WHEN AlwaysOnEnabled = 0 THEN 1 ELSE 0 END) AS ConAlwaysOnDeshabilitado
FROM (
    SELECT 
        AlwaysOnEnabled,
        ROW_NUMBER() OVER (PARTITION BY InstanceName ORDER BY CollectedAtUtc DESC) AS rn
    FROM dbo.InstanceHealth_Critical_Availability
    WHERE CollectedAtUtc >= DATEADD(HOUR, -2, GETUTCDATE())
) latest
WHERE rn = 1;

PRINT '';
PRINT '💡 Interpretación:';
PRINT '  - Si ConAlwaysOnHabilitado = 0 → El script NO está detectando AlwaysOn correctamente';
PRINT '  - Si ConAlwaysOnHabilitado > 0 → Algunos están correctos, verificar lógica del frontend';
PRINT '';

-- =============================================
-- PASO 5: ¿Cuándo fue la última actualización?
-- =============================================
PRINT '═══════════════════════════════════════════════════════';
PRINT 'PASO 5: Última actualización de datos';
PRINT '═══════════════════════════════════════════════════════';
PRINT '';

SELECT 
    'InstanceHealth_Critical_Availability' AS Tabla,
    MAX(CollectedAtUtc) AS UltimaActualizacion,
    DATEDIFF(MINUTE, MAX(CollectedAtUtc), GETUTCDATE()) AS MinutosDesdeUltimaActualizacion
FROM dbo.InstanceHealth_Critical_Availability;

PRINT '';
PRINT '════════════════════════════════════════════════════════════';
PRINT 'Diagnóstico completado';
PRINT '════════════════════════════════════════════════════════════';

