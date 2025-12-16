-- ============================================
-- Script: CreateServerRestartTables.sql
-- Descripción: Tablas para el sistema de reinicio de servidores SQL
-- Fecha: 2025
-- ============================================

USE [SQLGuardObservatoryAuth];
GO

-- Tabla principal de tareas de reinicio
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ServerRestartTask]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ServerRestartTask] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [TaskId] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
        [Servers] NVARCHAR(MAX) NOT NULL,               -- JSON array de servidores seleccionados
        [ServerCount] INT NOT NULL DEFAULT 0,           -- Cantidad de servidores
        [Status] NVARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending, Running, Completed, Failed, Cancelled
        [StartedAt] DATETIME2 NOT NULL DEFAULT GETDATE(),
        [CompletedAt] DATETIME2 NULL,
        [InitiatedByUserId] NVARCHAR(450) NOT NULL,
        [InitiatedByUserName] NVARCHAR(256) NULL,
        [OutputLog] NVARCHAR(MAX) NULL,                 -- Log completo del script
        [Summary] NVARCHAR(MAX) NULL,                   -- Resumen JSON con resultados por servidor
        [ErrorMessage] NVARCHAR(MAX) NULL,
        [SuccessCount] INT NULL DEFAULT 0,              -- Servidores reiniciados exitosamente
        [FailureCount] INT NULL DEFAULT 0,              -- Servidores con error
        [ProcessId] INT NULL,                           -- PID del proceso PowerShell (para cancelación)
        
        CONSTRAINT [FK_ServerRestartTask_User] FOREIGN KEY ([InitiatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers]([Id]) ON DELETE NO ACTION
    );
    
    PRINT 'Tabla ServerRestartTask creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla ServerRestartTask ya existe';
END
GO

-- Índices para búsquedas frecuentes
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerRestartTask_TaskId' AND object_id = OBJECT_ID('ServerRestartTask'))
BEGIN
    CREATE UNIQUE INDEX [IX_ServerRestartTask_TaskId] ON [dbo].[ServerRestartTask]([TaskId]);
    PRINT 'Índice IX_ServerRestartTask_TaskId creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerRestartTask_Status' AND object_id = OBJECT_ID('ServerRestartTask'))
BEGIN
    CREATE INDEX [IX_ServerRestartTask_Status] ON [dbo].[ServerRestartTask]([Status]);
    PRINT 'Índice IX_ServerRestartTask_Status creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerRestartTask_StartedAt' AND object_id = OBJECT_ID('ServerRestartTask'))
BEGIN
    CREATE INDEX [IX_ServerRestartTask_StartedAt] ON [dbo].[ServerRestartTask]([StartedAt] DESC);
    PRINT 'Índice IX_ServerRestartTask_StartedAt creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerRestartTask_InitiatedBy' AND object_id = OBJECT_ID('ServerRestartTask'))
BEGIN
    CREATE INDEX [IX_ServerRestartTask_InitiatedBy] ON [dbo].[ServerRestartTask]([InitiatedByUserId]);
    PRINT 'Índice IX_ServerRestartTask_InitiatedBy creado';
END
GO

-- Tabla de detalle por servidor (opcional, para tracking granular)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ServerRestartDetail]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[ServerRestartDetail] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [TaskId] INT NOT NULL,
        [ServerName] NVARCHAR(256) NOT NULL,
        [Status] NVARCHAR(50) NOT NULL DEFAULT 'Pending', -- Pending, Restarting, Success, Failed, Skipped
        [StartedAt] DATETIME2 NULL,
        [CompletedAt] DATETIME2 NULL,
        [ErrorMessage] NVARCHAR(MAX) NULL,
        [RestartResult] NVARCHAR(50) NULL,              -- Success, Failure
        [PingResult] NVARCHAR(50) NULL,
        [ServicioOSResult] NVARCHAR(50) NULL,
        [DiscosResult] NVARCHAR(50) NULL,
        [ServicioMSSQLSERVERResult] NVARCHAR(50) NULL,
        [ServicioSQLSERVERAGENTResult] NVARCHAR(50) NULL,
        
        CONSTRAINT [FK_ServerRestartDetail_Task] FOREIGN KEY ([TaskId]) 
            REFERENCES [dbo].[ServerRestartTask]([Id]) ON DELETE CASCADE
    );
    
    PRINT 'Tabla ServerRestartDetail creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla ServerRestartDetail ya existe';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ServerRestartDetail_TaskId' AND object_id = OBJECT_ID('ServerRestartDetail'))
BEGIN
    CREATE INDEX [IX_ServerRestartDetail_TaskId] ON [dbo].[ServerRestartDetail]([TaskId]);
    PRINT 'Índice IX_ServerRestartDetail_TaskId creado';
END
GO

-- Agregar permiso ServerRestart
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'ServerRestart' AND [Role] = 'SuperAdmin')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    VALUES ('SuperAdmin', 'ServerRestart', 1);
    PRINT 'Permiso ServerRestart agregado para SuperAdmin';
END
GO

IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'ServerRestart' AND [Role] = 'Admin')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    VALUES ('Admin', 'ServerRestart', 1);
    PRINT 'Permiso ServerRestart agregado para Admin';
END
GO

-- Reader NO tiene permiso por defecto (operación crítica)
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'ServerRestart' AND [Role] = 'Reader')
BEGIN
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    VALUES ('Reader', 'ServerRestart', 0);
    PRINT 'Permiso ServerRestart agregado para Reader (deshabilitado)';
END
GO

PRINT '============================================';
PRINT 'Script CreateServerRestartTables.sql completado';
PRINT '============================================';

