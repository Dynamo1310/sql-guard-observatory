-- =============================================
-- Script: AddSchedulePlanToBatches.sql
-- Descripción: Agrega la columna SchedulePlan a OnCallScheduleBatches
--              para almacenar el plan de generación de guardias
--              Las guardias no se insertan hasta que se aprueba el calendario
-- =============================================

PRINT '=== Agregando columna SchedulePlan a OnCallScheduleBatches ==='

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'OnCallScheduleBatches') AND name = 'SchedulePlan')
BEGIN
    ALTER TABLE OnCallScheduleBatches ADD SchedulePlan NVARCHAR(MAX) NULL;
    PRINT 'Columna SchedulePlan agregada a OnCallScheduleBatches';
END
ELSE
BEGIN
    PRINT 'La columna SchedulePlan ya existe';
END
GO

-- =============================================
-- Nota importante sobre el flujo de aprobación:
-- =============================================
-- 
-- ANTES (incorrecto):
--   1. Se generaba el calendario
--   2. Se insertaban las guardias en OnCallSchedules
--   3. Si requería aprobación, se marcaba el batch como PendingApproval
--   4. Si se rechazaba, se eliminaban las guardias
--
-- AHORA (correcto):
--   1. Se genera el calendario
--   2. Se guarda el PLAN de generación en SchedulePlan (JSON)
--   3. Si requiere aprobación, las guardias NO se insertan
--   4. Cuando se APRUEBA, se crean las guardias a partir del plan
--   5. Si se rechaza, simplemente se marca como rechazado (no hay nada que eliminar)
--
-- =============================================

PRINT '=== Script completado ==='

