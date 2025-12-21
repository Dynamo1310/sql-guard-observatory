-- Script para agregar la columna ComplianceYear a la tabla PatchComplianceConfig
-- Ejecutar en la base de datos SQLGuardObservatoryAuth

-- 1. Agregar la columna ComplianceYear con valor por defecto del año actual
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') AND name = 'ComplianceYear')
BEGIN
    ALTER TABLE [dbo].[PatchComplianceConfig]
    ADD [ComplianceYear] INT NOT NULL DEFAULT YEAR(GETDATE());
    
    PRINT 'Columna ComplianceYear agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'La columna ComplianceYear ya existe';
END
GO

-- 2. Eliminar el índice único anterior (solo SqlVersion)
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') AND name = 'IX_PatchComplianceConfig_SqlVersion')
BEGIN
    DROP INDEX [IX_PatchComplianceConfig_SqlVersion] ON [dbo].[PatchComplianceConfig];
    PRINT 'Índice IX_PatchComplianceConfig_SqlVersion eliminado';
END
GO

-- 3. Crear nuevo índice único compuesto (ComplianceYear + SqlVersion)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') AND name = 'IX_PatchComplianceConfig_Year_SqlVersion')
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX [IX_PatchComplianceConfig_Year_SqlVersion] 
    ON [dbo].[PatchComplianceConfig] ([ComplianceYear] ASC, [SqlVersion] ASC);
    PRINT 'Índice IX_PatchComplianceConfig_Year_SqlVersion creado';
END
GO

-- 4. Crear índice para filtrar por año
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') AND name = 'IX_PatchComplianceConfig_ComplianceYear')
BEGIN
    CREATE NONCLUSTERED INDEX [IX_PatchComplianceConfig_ComplianceYear] 
    ON [dbo].[PatchComplianceConfig] ([ComplianceYear] ASC);
    PRINT 'Índice IX_PatchComplianceConfig_ComplianceYear creado';
END
GO

-- 5. Verificar las configuraciones existentes (ahora tienen el año actual asignado)
SELECT 
    Id,
    ComplianceYear,
    SqlVersion,
    RequiredBuild,
    RequiredCU,
    IsActive,
    UpdatedAt
FROM [dbo].[PatchComplianceConfig]
ORDER BY ComplianceYear DESC, SqlVersion;
GO

PRINT 'Migración completada exitosamente';
PRINT 'Las configuraciones existentes ahora pertenecen al año ' + CAST(YEAR(GETDATE()) AS VARCHAR(4));

