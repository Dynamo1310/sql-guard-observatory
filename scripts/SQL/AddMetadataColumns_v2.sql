-- =============================================
-- Agregar columnas de metadata a tablas v2.0
-- (Ambiente, HostingSite, SqlVersion)
-- =============================================

USE SQLNova;
GO

PRINT 'Agregando columnas de metadata...';

-- =============================================
-- Tabla 1: InstanceHealth_Critical_Availability
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Availability') AND name = 'Ambiente')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Critical_Availability
    ADD 
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(100) NULL;
    
    PRINT '✅ Columnas agregadas a InstanceHealth_Critical_Availability';
END
ELSE
    PRINT '⚠️  InstanceHealth_Critical_Availability ya tiene las columnas';
GO

-- =============================================
-- Tabla 2: InstanceHealth_Critical_Resources
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Resources') AND name = 'Ambiente')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Critical_Resources
    ADD 
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(100) NULL;
    
    PRINT '✅ Columnas agregadas a InstanceHealth_Critical_Resources';
END
ELSE
    PRINT '⚠️  InstanceHealth_Critical_Resources ya tiene las columnas';
GO

-- =============================================
-- Tabla 3: InstanceHealth_Backups
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'Ambiente')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Backups
    ADD 
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(100) NULL;
    
    PRINT '✅ Columnas agregadas a InstanceHealth_Backups';
END
ELSE
    PRINT '⚠️  InstanceHealth_Backups ya tiene las columnas';
GO

-- =============================================
-- Tabla 4: InstanceHealth_Maintenance
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'Ambiente')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Maintenance
    ADD 
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(100) NULL;
    
    PRINT '✅ Columnas agregadas a InstanceHealth_Maintenance';
END
ELSE
    PRINT '⚠️  InstanceHealth_Maintenance ya tiene las columnas';
GO

-- =============================================
-- Tabla 5: InstanceHealth_Score
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'Ambiente')
BEGIN
    ALTER TABLE dbo.InstanceHealth_Score
    ADD 
        Ambiente NVARCHAR(50) NULL,
        HostingSite NVARCHAR(50) NULL,
        SqlVersion NVARCHAR(100) NULL;
    
    PRINT '✅ Columnas agregadas a InstanceHealth_Score';
END
ELSE
    PRINT '⚠️  InstanceHealth_Score ya tiene las columnas';
GO

-- =============================================
-- Verificación
-- =============================================
PRINT '';
PRINT '═════════════════════════════════════════════';
PRINT 'VERIFICACIÓN:';
PRINT '═════════════════════════════════════════════';

SELECT 
    'InstanceHealth_Critical_Availability' AS Tabla,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Availability') AND name = 'Ambiente') THEN '✅' ELSE '❌' END AS Ambiente,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Availability') AND name = 'HostingSite') THEN '✅' ELSE '❌' END AS HostingSite,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Availability') AND name = 'SqlVersion') THEN '✅' ELSE '❌' END AS SqlVersion

UNION ALL

SELECT 
    'InstanceHealth_Critical_Resources',
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Resources') AND name = 'Ambiente') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Resources') AND name = 'HostingSite') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Critical_Resources') AND name = 'SqlVersion') THEN '✅' ELSE '❌' END

UNION ALL

SELECT 
    'InstanceHealth_Backups',
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'Ambiente') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'HostingSite') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Backups') AND name = 'SqlVersion') THEN '✅' ELSE '❌' END

UNION ALL

SELECT 
    'InstanceHealth_Maintenance',
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'Ambiente') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'HostingSite') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Maintenance') AND name = 'SqlVersion') THEN '✅' ELSE '❌' END

UNION ALL

SELECT 
    'InstanceHealth_Score',
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'Ambiente') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'HostingSite') THEN '✅' ELSE '❌' END,
    CASE WHEN EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InstanceHealth_Score') AND name = 'SqlVersion') THEN '✅' ELSE '❌' END;

PRINT '';
PRINT '✅ Columnas de metadata agregadas exitosamente!';
PRINT '   Ahora actualiza los scripts de PowerShell para capturar estos datos.';
GO

