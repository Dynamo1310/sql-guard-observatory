-- ============================================
-- Script: CreatePatchPlansTable.sql
-- Descripción: Tabla para gestionar la planificación de parcheos de servidores
-- Fecha: 2026
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Crear tabla PatchPlans
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PatchPlans]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PatchPlans] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [ServerName] NVARCHAR(256) NOT NULL,              -- Nombre del servidor a parchear
        [InstanceName] NVARCHAR(256) NULL,                -- Nombre de instancia (opcional)
        [CurrentVersion] NVARCHAR(100) NOT NULL,          -- Versión actual del servidor
        [TargetVersion] NVARCHAR(100) NOT NULL,           -- Versión objetivo a la que se parcheará
        [IsCoordinated] BIT NOT NULL DEFAULT 0,           -- Si está coordinado con el Product Owner
        [ProductOwnerNote] NVARCHAR(500) NULL,            -- Nota del Product Owner
        [ScheduledDate] DATE NOT NULL,                    -- Fecha programada para el parcheo
        [WindowStartTime] TIME NOT NULL,                  -- Hora de inicio de la ventana de parcheo
        [WindowEndTime] TIME NOT NULL,                    -- Hora de fin de la ventana de parcheo
        [AssignedDbaId] NVARCHAR(450) NULL,               -- ID del DBA asignado
        [AssignedDbaName] NVARCHAR(256) NULL,             -- Nombre del DBA asignado (denormalizado)
        [WasPatched] BIT NULL,                            -- Estado: NULL=pendiente, 1=parcheado, 0=fallido
        [PatchedAt] DATETIME2 NULL,                       -- Fecha/hora real del parcheo
        [PatchedByUserId] NVARCHAR(450) NULL,             -- Usuario que marcó como completado
        [Notes] NVARCHAR(MAX) NULL,                       -- Notas adicionales
        [CreatedByUserId] NVARCHAR(450) NOT NULL,         -- Usuario que creó el plan
        [CreatedByUserName] NVARCHAR(256) NULL,           -- Nombre del usuario que creó
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        CONSTRAINT [FK_PatchPlans_AssignedDba] FOREIGN KEY ([AssignedDbaId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        CONSTRAINT [FK_PatchPlans_CreatedBy] FOREIGN KEY ([CreatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION,
        
        CONSTRAINT [FK_PatchPlans_PatchedBy] FOREIGN KEY ([PatchedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );
    
    PRINT 'Tabla PatchPlans creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla PatchPlans ya existe';
END
GO

-- ============================================
-- 2. Crear índices
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_ScheduledDate' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_ScheduledDate] ON [dbo].[PatchPlans]([ScheduledDate]);
    PRINT 'Índice IX_PatchPlans_ScheduledDate creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_AssignedDbaId' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_AssignedDbaId] ON [dbo].[PatchPlans]([AssignedDbaId]);
    PRINT 'Índice IX_PatchPlans_AssignedDbaId creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_WasPatched' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_WasPatched] ON [dbo].[PatchPlans]([WasPatched]);
    PRINT 'Índice IX_PatchPlans_WasPatched creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_PatchPlans_ServerName_ScheduledDate' AND object_id = OBJECT_ID('PatchPlans'))
BEGIN
    CREATE INDEX [IX_PatchPlans_ServerName_ScheduledDate] ON [dbo].[PatchPlans]([ServerName], [ScheduledDate]);
    PRINT 'Índice IX_PatchPlans_ServerName_ScheduledDate creado';
END
GO

-- ============================================
-- 3. Vista para consultar planes pendientes
-- ============================================
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
    p.IsCoordinated,
    p.ProductOwnerNote,
    p.ScheduledDate,
    p.WindowStartTime,
    p.WindowEndTime,
    p.AssignedDbaId,
    p.AssignedDbaName,
    p.Notes,
    p.CreatedAt,
    p.CreatedByUserName,
    CASE 
        WHEN p.WasPatched IS NULL THEN 'Pendiente'
        WHEN p.WasPatched = 1 THEN 'Parcheado'
        ELSE 'No Parcheado'
    END AS Status
FROM [dbo].[PatchPlans] p
WHERE p.WasPatched IS NULL
  AND p.ScheduledDate >= CAST(GETDATE() AS DATE);
GO

PRINT 'Vista vw_PendingPatchPlans creada';
GO

-- ============================================
-- 4. Verificar estructura creada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script CreatePatchPlansTable.sql completado';
PRINT '============================================';
PRINT '';

SELECT 'PatchPlans' AS Tabla, COUNT(*) AS Registros FROM PatchPlans;

GO
