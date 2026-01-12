-- =====================================================
-- Script: AddAwsComplianceColumns.sql
-- Descripción: Agrega columnas para configuración de compliance 
--              específica para servidores AWS (SQL 2017+)
-- Fecha: 2026-01-06
-- =====================================================

USE [SQLGuardObservatoryDB]
GO

-- Verificar si las columnas ya existen antes de agregarlas
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') 
    AND name = 'AwsRequiredBuild'
)
BEGIN
    ALTER TABLE dbo.PatchComplianceConfig
    ADD AwsRequiredBuild NVARCHAR(50) NULL;
    
    PRINT 'Columna AwsRequiredBuild agregada a PatchComplianceConfig';
END
ELSE
BEGIN
    PRINT 'Columna AwsRequiredBuild ya existe';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') 
    AND name = 'AwsRequiredCU'
)
BEGIN
    ALTER TABLE dbo.PatchComplianceConfig
    ADD AwsRequiredCU NVARCHAR(20) NULL;
    
    PRINT 'Columna AwsRequiredCU agregada a PatchComplianceConfig';
END
ELSE
BEGIN
    PRINT 'Columna AwsRequiredCU ya existe';
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.PatchComplianceConfig') 
    AND name = 'AwsRequiredKB'
)
BEGIN
    ALTER TABLE dbo.PatchComplianceConfig
    ADD AwsRequiredKB NVARCHAR(20) NULL;
    
    PRINT 'Columna AwsRequiredKB agregada a PatchComplianceConfig';
END
ELSE
BEGIN
    PRINT 'Columna AwsRequiredKB ya existe';
END
GO

-- Agregar comentarios descriptivos a las columnas
EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Build mínimo requerido para servidores AWS (opcional, solo aplica para SQL 2017+). Si está vacío, se usa RequiredBuild.', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'PatchComplianceConfig',
    @level2type = N'COLUMN', @level2name = N'AwsRequiredBuild';
GO

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'CU/SP requerido para servidores AWS', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'PatchComplianceConfig',
    @level2type = N'COLUMN', @level2name = N'AwsRequiredCU';
GO

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Referencia KB del parche requerido para AWS', 
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'PatchComplianceConfig',
    @level2type = N'COLUMN', @level2name = N'AwsRequiredKB';
GO

PRINT '';
PRINT '=== Migración completada exitosamente ===';
PRINT 'Nuevas columnas agregadas a PatchComplianceConfig:';
PRINT '  - AwsRequiredBuild: Build mínimo para AWS (SQL 2017+)';
PRINT '  - AwsRequiredCU: CU/SP para AWS';
PRINT '  - AwsRequiredKB: KB de referencia para AWS';
PRINT '';
PRINT 'Estas columnas permiten configurar requisitos de compliance';
PRINT 'diferenciados para servidores en AWS, que pueden tener';
PRINT 'disponibilidad de parches diferente a on-premises.';
GO

