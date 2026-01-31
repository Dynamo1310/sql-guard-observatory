-- ============================================
-- Script: AlterPatchPlansTable.sql
-- Descripción: Agregar nuevos campos a la tabla PatchPlans para el sistema mejorado de gestión de parcheos
-- Fecha: 2026
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Agregar nuevos campos a PatchPlans
-- ============================================
PRINT 'Agregando nuevos campos a la tabla PatchPlans...';

-- Status: Estado granular del plan
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'Status')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [Status] NVARCHAR(50) NOT NULL DEFAULT 'Planificado';
    PRINT 'Columna Status agregada';
END
GO

-- PatchMode: Modo de parcheo (Manual, Automatico, ManualNova)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'PatchMode')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [PatchMode] NVARCHAR(50) NOT NULL DEFAULT 'Manual';
    PRINT 'Columna PatchMode agregada';
END
GO

-- CoordinationOwnerId: ID del owner con quien se coordina
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'CoordinationOwnerId')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [CoordinationOwnerId] NVARCHAR(450) NULL;
    PRINT 'Columna CoordinationOwnerId agregada';
END
GO

-- CoordinationOwnerName: Nombre del owner de coordinación
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'CoordinationOwnerName')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [CoordinationOwnerName] NVARCHAR(256) NULL;
    PRINT 'Columna CoordinationOwnerName agregada';
END
GO

-- CoordinationOwnerEmail: Email del owner de coordinación
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'CoordinationOwnerEmail')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [CoordinationOwnerEmail] NVARCHAR(256) NULL;
    PRINT 'Columna CoordinationOwnerEmail agregada';
END
GO

-- CellTeam: Célula/equipo responsable
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'CellTeam')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [CellTeam] NVARCHAR(100) NULL;
    PRINT 'Columna CellTeam agregada';
END
GO

-- EstimatedDuration: Duración estimada en minutos
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'EstimatedDuration')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [EstimatedDuration] INT NULL;
    PRINT 'Columna EstimatedDuration agregada';
END
GO

-- Priority: Prioridad del parcheo (Alta, Media, Baja)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'Priority')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [Priority] NVARCHAR(20) NULL;
    PRINT 'Columna Priority agregada';
END
GO

-- ClusterName: Nombre del cluster (para validación de conflictos)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'ClusterName')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [ClusterName] NVARCHAR(256) NULL;
    PRINT 'Columna ClusterName agregada';
END
GO

-- IsAlwaysOn: Indica si el servidor es AlwaysOn
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'IsAlwaysOn')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [IsAlwaysOn] BIT NOT NULL DEFAULT 0;
    PRINT 'Columna IsAlwaysOn agregada';
END
GO

-- Ambiente: Ambiente del servidor
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'Ambiente')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [Ambiente] NVARCHAR(50) NULL;
    PRINT 'Columna Ambiente agregada';
END
GO

-- ContactedAt: Fecha/hora cuando se contactó al owner
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'ContactedAt')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [ContactedAt] DATETIME2 NULL;
    PRINT 'Columna ContactedAt agregada';
END
GO

-- ResponseReceivedAt: Fecha/hora cuando se recibió respuesta del owner
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'ResponseReceivedAt')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [ResponseReceivedAt] DATETIME2 NULL;
    PRINT 'Columna ResponseReceivedAt agregada';
END
GO

-- RescheduledCount: Contador de reprogramaciones
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'RescheduledCount')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [RescheduledCount] INT NOT NULL DEFAULT 0;
    PRINT 'Columna RescheduledCount agregada';
END
GO

-- WaiverReason: Razón de waiver si aplica
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND name = 'WaiverReason')
BEGIN
    ALTER TABLE [dbo].[PatchPlans] ADD [WaiverReason] NVARCHAR(500) NULL;
    PRINT 'Columna WaiverReason agregada';
END
GO

-- ============================================
-- 2. Crear nuevos índices
-- ============================================
PRINT '';
PRINT 'Creando índices adicionales...';

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_Status' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_Status] ON [dbo].[PatchPlans]([Status]);
    PRINT 'Índice IX_PatchPlans_Status creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_CellTeam' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_CellTeam] ON [dbo].[PatchPlans]([CellTeam]);
    PRINT 'Índice IX_PatchPlans_CellTeam creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_ClusterName' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_ClusterName] ON [dbo].[PatchPlans]([ClusterName]);
    PRINT 'Índice IX_PatchPlans_ClusterName creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_Priority' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_Priority] ON [dbo].[PatchPlans]([Priority]);
    PRINT 'Índice IX_PatchPlans_Priority creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_Ambiente' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_Ambiente] ON [dbo].[PatchPlans]([Ambiente]);
    PRINT 'Índice IX_PatchPlans_Ambiente creado';
END
GO

-- ============================================
-- 3. Actualizar vista de planes pendientes
-- ============================================
PRINT '';
PRINT 'Actualizando vista vw_PendingPatchPlans...';

IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_PendingPatchPlans]'))
BEGIN
    DROP VIEW [dbo].[vw_PendingPatchPlans];
END
GO

CREATE VIEW [dbo].[vw_PendingPatchPlans]
AS
SELECT 
    p.Id,
    p.ServerName,
    p.InstanceName,
    p.CurrentVersion,
    p.TargetVersion,
    p.Status,
    p.PatchMode,
    p.Priority,
    p.IsCoordinated,
    p.ProductOwnerNote,
    p.CoordinationOwnerId,
    p.CoordinationOwnerName,
    p.CoordinationOwnerEmail,
    p.CellTeam,
    p.Ambiente,
    p.ClusterName,
    p.IsAlwaysOn,
    p.EstimatedDuration,
    p.ScheduledDate,
    p.WindowStartTime,
    p.WindowEndTime,
    p.AssignedDbaId,
    p.AssignedDbaName,
    p.ContactedAt,
    p.ResponseReceivedAt,
    p.RescheduledCount,
    p.WaiverReason,
    p.Notes,
    p.CreatedAt,
    p.CreatedByUserName
FROM [dbo].[PatchPlans] p
WHERE p.Status NOT IN ('Parcheado', 'Fallido', 'Cancelado')
  AND p.ScheduledDate >= CAST(GETDATE() AS DATE);
GO

PRINT 'Vista vw_PendingPatchPlans actualizada';
GO

-- ============================================
-- 4. Crear vista para calendario
-- ============================================
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_PatchCalendar]'))
BEGIN
    DROP VIEW [dbo].[vw_PatchCalendar];
END
GO

CREATE VIEW [dbo].[vw_PatchCalendar]
AS
SELECT 
    p.Id,
    p.ServerName,
    p.InstanceName,
    p.Status,
    p.Priority,
    p.CellTeam,
    p.Ambiente,
    p.ScheduledDate,
    p.WindowStartTime,
    p.WindowEndTime,
    p.AssignedDbaName,
    p.EstimatedDuration,
    p.IsAlwaysOn,
    p.ClusterName
FROM [dbo].[PatchPlans] p
WHERE p.Status NOT IN ('Cancelado');
GO

PRINT 'Vista vw_PatchCalendar creada';
GO

-- ============================================
-- 5. Verificar estructura actualizada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script AlterPatchPlansTable.sql completado';
PRINT '============================================';
PRINT '';

SELECT 
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('PatchPlans')
ORDER BY c.column_id;
GO
