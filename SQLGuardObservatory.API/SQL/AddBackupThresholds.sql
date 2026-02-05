-- =============================================
-- Script: AddBackupThresholds.sql
-- Descripción: Actualiza los thresholds de backup (FULL de 24h a 30h)
--              y agrega threshold para grace period después de FULL
-- Fecha: 2026-02-05
-- =============================================

USE SQLGuardObservatoryAuth;
GO

-- ============================================================================
-- 1. Actualizar threshold de Full Backup de 24h a 30h
-- ============================================================================
PRINT 'Actualizando threshold de Full Backup a 30 horas...';

UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 30,
    DefaultValue = 30,
    Description = 'Full backup en ultimas 30h',
    DisplayName = 'Full Backup Normal (30h)'
WHERE CollectorName = 'Backups' 
  AND ThresholdName = 'FullBackup_Normal';

IF @@ROWCOUNT > 0
    PRINT '   - FullBackup_Normal actualizado de 24h a 30h';
ELSE
    PRINT '   - FullBackup_Normal no encontrado (puede que no exista aun)';

UPDATE dbo.CollectorThresholds 
SET ThresholdValue = 30,
    DefaultValue = 30,
    Description = 'Sin full backup en >30h'
WHERE CollectorName = 'Backups' 
  AND ThresholdName = 'FullBackup_Breach';

IF @@ROWCOUNT > 0
    PRINT '   - FullBackup_Breach actualizado de 24h a 30h';
ELSE
    PRINT '   - FullBackup_Breach no encontrado (puede que no exista aun)';

GO

-- ============================================================================
-- 2. Agregar threshold para Grace Period después de FULL backup
-- ============================================================================
PRINT '';
PRINT 'Agregando threshold para Grace Period...';

IF NOT EXISTS (
    SELECT 1 FROM dbo.CollectorThresholds 
    WHERE CollectorName = 'Backups' AND ThresholdName = 'GraceMinutesAfterFull'
)
BEGIN
    INSERT INTO dbo.CollectorThresholds (
        CollectorName, 
        ThresholdName, 
        DisplayName, 
        ThresholdValue, 
        ThresholdOperator, 
        ResultingScore, 
        ActionType, 
        Description, 
        DefaultValue, 
        EvaluationOrder, 
        ThresholdGroup,
        IsActive
    )
    VALUES (
        'Backups', 
        'GraceMinutesAfterFull', 
        'Grace Period tras FULL (min)', 
        15,              -- 15 minutos por defecto
        '<=', 
        100, 
        'Score', 
        'Minutos de gracia tras finalizar un FULL backup antes de alertar por LOG', 
        15, 
        10, 
        'Suppression',
        1
    );
    PRINT '   - GraceMinutesAfterFull agregado (15 minutos por defecto)';
END
ELSE
BEGIN
    PRINT '   - GraceMinutesAfterFull ya existe, no se modifica';
END
GO

-- ============================================================================
-- 3. Agregar threshold para Full Backup Hours (para que sea configurable)
-- ============================================================================
PRINT '';
PRINT 'Verificando threshold configurable para Full Backup Hours...';

IF NOT EXISTS (
    SELECT 1 FROM dbo.CollectorThresholds 
    WHERE CollectorName = 'Backups' AND ThresholdName = 'FullThresholdHours'
)
BEGIN
    INSERT INTO dbo.CollectorThresholds (
        CollectorName, 
        ThresholdName, 
        DisplayName, 
        ThresholdValue, 
        ThresholdOperator, 
        ResultingScore, 
        ActionType, 
        Description, 
        DefaultValue, 
        EvaluationOrder, 
        ThresholdGroup,
        IsActive
    )
    VALUES (
        'Backups', 
        'FullThresholdHours', 
        'Umbral FULL Backup (horas)', 
        30,              -- 30 horas por defecto
        '>', 
        0, 
        'Score', 
        'Horas maximas sin FULL backup antes de considerar breach', 
        30, 
        1, 
        'Thresholds',
        1
    );
    PRINT '   - FullThresholdHours agregado (30 horas por defecto)';
END
ELSE
BEGIN
    PRINT '   - FullThresholdHours ya existe, no se modifica';
END
GO

-- ============================================================================
-- 4. Agregar threshold para Log Backup Hours (para que sea configurable)
-- ============================================================================
PRINT '';
PRINT 'Verificando threshold configurable para Log Backup Hours...';

IF NOT EXISTS (
    SELECT 1 FROM dbo.CollectorThresholds 
    WHERE CollectorName = 'Backups' AND ThresholdName = 'LogThresholdHours'
)
BEGIN
    INSERT INTO dbo.CollectorThresholds (
        CollectorName, 
        ThresholdName, 
        DisplayName, 
        ThresholdValue, 
        ThresholdOperator, 
        ResultingScore, 
        ActionType, 
        Description, 
        DefaultValue, 
        EvaluationOrder, 
        ThresholdGroup,
        IsActive
    )
    VALUES (
        'Backups', 
        'LogThresholdHours', 
        'Umbral LOG Backup (horas)', 
        2,              -- 2 horas por defecto
        '>', 
        0, 
        'Score', 
        'Horas maximas sin LOG backup antes de considerar breach', 
        2, 
        2, 
        'Thresholds',
        1
    );
    PRINT '   - LogThresholdHours agregado (2 horas por defecto)';
END
ELSE
BEGIN
    PRINT '   - LogThresholdHours ya existe, no se modifica';
END
GO

PRINT '';
PRINT 'Script completado: Thresholds de backup actualizados';
GO
