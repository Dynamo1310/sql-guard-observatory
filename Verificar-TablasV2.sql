-- =============================================
-- Script para verificar si existen las tablas v2.0
-- =============================================

USE SQLNova;
GO

PRINT '═══════════════════════════════════════════════════════════';
PRINT 'VERIFICANDO TABLAS V2.0';
PRINT '═══════════════════════════════════════════════════════════';
PRINT '';

-- Verificar tablas v2.0
PRINT '1. TABLAS:';
PRINT '-----------------------------------------------------------';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Availability')
    PRINT '✅ InstanceHealth_Critical_Availability existe'
ELSE
    PRINT '❌ InstanceHealth_Critical_Availability NO EXISTE';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Resources')
    PRINT '✅ InstanceHealth_Critical_Resources existe'
ELSE
    PRINT '❌ InstanceHealth_Critical_Resources NO EXISTE';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Backups')
    PRINT '✅ InstanceHealth_Backups existe'
ELSE
    PRINT '❌ InstanceHealth_Backups NO EXISTE';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Maintenance')
    PRINT '✅ InstanceHealth_Maintenance existe'
ELSE
    PRINT '❌ InstanceHealth_Maintenance NO EXISTE';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
    PRINT '✅ InstanceHealth_Score existe'
ELSE
    PRINT '❌ InstanceHealth_Score NO EXISTE';

PRINT '';
PRINT '2. VISTA CONSOLIDADA:';
PRINT '-----------------------------------------------------------';

IF EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
    PRINT '✅ vw_InstanceHealth_Latest existe'
ELSE
    PRINT '❌ vw_InstanceHealth_Latest NO EXISTE (esto es crítico!)';

PRINT '';
PRINT '3. DATOS EN LAS TABLAS:';
PRINT '-----------------------------------------------------------';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Availability')
BEGIN
    DECLARE @countAvail INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Critical_Availability);
    PRINT 'InstanceHealth_Critical_Availability: ' + CAST(@countAvail AS VARCHAR(10)) + ' registros';
END

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Critical_Resources')
BEGIN
    DECLARE @countRes INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Critical_Resources);
    PRINT 'InstanceHealth_Critical_Resources: ' + CAST(@countRes AS VARCHAR(10)) + ' registros';
END

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Backups')
BEGIN
    DECLARE @countBack INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Backups);
    PRINT 'InstanceHealth_Backups: ' + CAST(@countBack AS VARCHAR(10)) + ' registros';
END

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Maintenance')
BEGIN
    DECLARE @countMaint INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Maintenance);
    PRINT 'InstanceHealth_Maintenance: ' + CAST(@countMaint AS VARCHAR(10)) + ' registros';
END

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    DECLARE @countScore INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Score);
    PRINT 'InstanceHealth_Score: ' + CAST(@countScore AS VARCHAR(10)) + ' registros';
END

PRINT '';
PRINT '4. TABLA ANTIGUA (v1.0):';
PRINT '-----------------------------------------------------------';

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealthSnapshot')
BEGIN
    DECLARE @countOld INT = (SELECT COUNT(*) FROM dbo.InstanceHealthSnapshot);
    PRINT '⚠️  InstanceHealthSnapshot (VIEJA): ' + CAST(@countOld AS VARCHAR(10)) + ' registros';
    PRINT '    Esta tabla ya no se actualiza con los scripts v2.0';
END
ELSE
    PRINT '✅ InstanceHealthSnapshot no existe (correcto para v2.0)';

PRINT '';
PRINT '═══════════════════════════════════════════════════════════';
PRINT 'DIAGNÓSTICO:';
PRINT '═══════════════════════════════════════════════════════════';

IF NOT EXISTS (SELECT * FROM sys.views WHERE name = 'vw_InstanceHealth_Latest')
BEGIN
    PRINT '';
    PRINT '❌ PROBLEMA CRÍTICO: La vista vw_InstanceHealth_Latest NO EXISTE';
    PRINT '   Solución: Ejecuta el script CreateHealthScoreTables_v2_SAFE.sql';
    PRINT '';
END
ELSE IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InstanceHealth_Score')
BEGIN
    PRINT '';
    PRINT '❌ PROBLEMA: Las tablas v2.0 NO EXISTEN';
    PRINT '   Solución: Ejecuta el script CreateHealthScoreTables_v2_SAFE.sql';
    PRINT '';
END
ELSE
BEGIN
    DECLARE @hasData INT = (SELECT COUNT(*) FROM dbo.InstanceHealth_Score);
    IF @hasData = 0
    BEGIN
        PRINT '';
        PRINT '⚠️  Las tablas v2.0 existen pero están VACÍAS';
        PRINT '   Solución: Ejecuta los scripts de PowerShell para recolectar datos:';
        PRINT '   1. .\RelevamientoHealthScore_Availability.ps1';
        PRINT '   2. .\RelevamientoHealthScore_Resources.ps1';
        PRINT '   3. .\RelevamientoHealthScore_Backups.ps1';
        PRINT '   4. .\RelevamientoHealthScore_Maintenance.ps1';
        PRINT '   5. .\RelevamientoHealthScore_Consolidate.ps1';
        PRINT '';
    END
    ELSE
    BEGIN
        PRINT '';
        PRINT '✅ Todo está configurado correctamente!';
        PRINT '   Las tablas v2.0 existen y tienen datos.';
        PRINT '';
        PRINT '   Si el frontend aún muestra datos viejos:';
        PRINT '   1. Verifica que el backend esté apuntando a la BD correcta';
        PRINT '   2. Reinicia el backend: dotnet run o IIS';
        PRINT '   3. Limpia el caché del navegador (Ctrl+F5)';
        PRINT '';
    END
END

GO

