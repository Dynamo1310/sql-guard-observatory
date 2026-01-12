-- =====================================================
-- Script: AddAttachExcelToAlertRules.sql
-- Descripción: Agrega columna AttachExcel a OnCallAlertRules
--              para configurar adjunto de Excel en Calendario Generado
-- Fecha: 2025-01-02
-- =====================================================

USE [SQLGuardObservatoryDB]
GO

PRINT '=== Agregando columna AttachExcel a OnCallAlertRules ==='
PRINT ''

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('OnCallAlertRules') AND name = 'AttachExcel')
BEGIN
    ALTER TABLE OnCallAlertRules ADD AttachExcel BIT NOT NULL DEFAULT 0;
    PRINT 'Columna AttachExcel agregada a OnCallAlertRules'
END
ELSE
BEGIN
    PRINT 'Columna AttachExcel ya existe en OnCallAlertRules'
END
GO

PRINT ''
PRINT '=== Script completado ==='
GO

