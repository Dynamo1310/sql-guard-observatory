-- =============================================
-- Script: CreateOverviewSummaryAlertTables.sql
-- Descripción: Crea las tablas para el sistema de alertas de resumen Overview
-- Permite enviar emails programados con el resumen del estado de producción
-- NOTA: Todas las fechas se almacenan en hora local del servidor (Argentina)
-- =============================================

USE [SQLGuardObservatory]
GO

-- =============================================
-- 1. Tabla de configuración principal de alertas
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OverviewSummaryAlertConfig')
BEGIN
    CREATE TABLE [dbo].[OverviewSummaryAlertConfig] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL DEFAULT 'Alerta Resumen Overview',
        [Description] NVARCHAR(500) NULL,
        [IsEnabled] BIT NOT NULL DEFAULT 0,
        [Recipients] NVARCHAR(2000) NOT NULL DEFAULT '',
        [IncludeOnlyProduction] BIT NOT NULL DEFAULT 1,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedBy] NVARCHAR(100) NULL,
        [UpdatedByDisplayName] NVARCHAR(200) NULL
    )
    PRINT 'Tabla OverviewSummaryAlertConfig creada'
END
ELSE
BEGIN
    PRINT 'Tabla OverviewSummaryAlertConfig ya existe'
END
GO

-- =============================================
-- 2. Tabla de horarios programados (schedules)
-- Permite configurar múltiples horarios al día
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OverviewSummaryAlertSchedule')
BEGIN
    CREATE TABLE [dbo].[OverviewSummaryAlertSchedule] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ConfigId] INT NOT NULL,
        [TimeOfDay] TIME NOT NULL,
        [IsEnabled] BIT NOT NULL DEFAULT 1,
        [DaysOfWeek] NVARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5', -- 0=Domingo, 1=Lunes, ..., 6=Sábado
        [LastSentAt] DATETIME2 NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        
        CONSTRAINT FK_OverviewSummaryAlertSchedule_Config 
            FOREIGN KEY ([ConfigId]) REFERENCES [dbo].[OverviewSummaryAlertConfig]([Id]) 
            ON DELETE CASCADE
    )
    
    CREATE INDEX IX_OverviewSummaryAlertSchedule_ConfigId ON [dbo].[OverviewSummaryAlertSchedule]([ConfigId])
    CREATE INDEX IX_OverviewSummaryAlertSchedule_TimeOfDay ON [dbo].[OverviewSummaryAlertSchedule]([TimeOfDay])
    
    PRINT 'Tabla OverviewSummaryAlertSchedule creada'
END
ELSE
BEGIN
    PRINT 'Tabla OverviewSummaryAlertSchedule ya existe'
END
GO

-- =============================================
-- 3. Tabla de historial de alertas enviadas
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OverviewSummaryAlertHistory')
BEGIN
    CREATE TABLE [dbo].[OverviewSummaryAlertHistory] (
        [Id] INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ConfigId] INT NOT NULL,
        [ScheduleId] INT NULL, -- Puede ser NULL si se ejecutó manualmente
        [SentAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [RecipientCount] INT NOT NULL DEFAULT 0,
        [Success] BIT NOT NULL DEFAULT 1,
        [ErrorMessage] NVARCHAR(1000) NULL,
        [SummaryData] NVARCHAR(MAX) NULL, -- JSON con los datos del resumen enviado
        [TriggerType] NVARCHAR(50) NOT NULL DEFAULT 'Scheduled', -- Scheduled, Manual, Test
        
        CONSTRAINT FK_OverviewSummaryAlertHistory_Config 
            FOREIGN KEY ([ConfigId]) REFERENCES [dbo].[OverviewSummaryAlertConfig]([Id]) 
            ON DELETE CASCADE,
        CONSTRAINT FK_OverviewSummaryAlertHistory_Schedule 
            FOREIGN KEY ([ScheduleId]) REFERENCES [dbo].[OverviewSummaryAlertSchedule]([Id]) 
            ON DELETE NO ACTION
    )

    CREATE INDEX IX_OverviewSummaryAlertHistory_SentAt ON [dbo].[OverviewSummaryAlertHistory]([SentAt] DESC)
    CREATE INDEX IX_OverviewSummaryAlertHistory_ConfigId ON [dbo].[OverviewSummaryAlertHistory]([ConfigId])
    CREATE INDEX IX_OverviewSummaryAlertHistory_ScheduleId ON [dbo].[OverviewSummaryAlertHistory]([ScheduleId])
    
    PRINT 'Tabla OverviewSummaryAlertHistory creada'
END
ELSE
BEGIN
    PRINT 'Tabla OverviewSummaryAlertHistory ya existe'
END
GO

-- =============================================
-- 4. Insertar configuración inicial por defecto
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[OverviewSummaryAlertConfig])
BEGIN
    INSERT INTO [dbo].[OverviewSummaryAlertConfig] 
        ([Name], [Description], [IsEnabled], [Recipients], [IncludeOnlyProduction])
    VALUES 
        ('Alerta Resumen Overview', 
         'Envía un resumen del estado de la plataforma productiva por email en los horarios configurados', 
         0, 
         '', 
         1)
    
    PRINT 'Configuración inicial de OverviewSummaryAlertConfig insertada'
END
GO

-- =============================================
-- 5. Agregar permisos para la nueva alerta
-- Ejecutar en la base de datos de autenticación
-- =============================================
USE [SQLGuardObservatoryAuth]
GO

-- Permiso para SuperAdmin
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'SuperAdmin' AND [ViewName] = 'AlertaResumenOverview')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('SuperAdmin', 'AlertaResumenOverview', 1, GETDATE())
    PRINT 'Permiso AlertaResumenOverview agregado para SuperAdmin'
END
GO

-- Permiso para Admin
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'Admin' AND [ViewName] = 'AlertaResumenOverview')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Admin', 'AlertaResumenOverview', 1, GETDATE())
    PRINT 'Permiso AlertaResumenOverview agregado para Admin'
END
GO

-- Permiso para DBA
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'DBA' AND [ViewName] = 'AlertaResumenOverview')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('DBA', 'AlertaResumenOverview', 1, GETDATE())
    PRINT 'Permiso AlertaResumenOverview agregado para DBA'
END
GO

PRINT ''
PRINT '=========================================='
PRINT 'Tablas de Overview Summary Alerts creadas/verificadas'
PRINT '=========================================='
PRINT ''
PRINT 'Estructura de DaysOfWeek:'
PRINT '  0 = Domingo'
PRINT '  1 = Lunes'
PRINT '  2 = Martes'
PRINT '  3 = Miércoles'
PRINT '  4 = Jueves'
PRINT '  5 = Viernes'
PRINT '  6 = Sábado'
PRINT ''
PRINT 'Ejemplo: "1,2,3,4,5" = Lunes a Viernes'
PRINT 'Ejemplo: "0,1,2,3,4,5,6" = Todos los días'
PRINT '=========================================='
GO

