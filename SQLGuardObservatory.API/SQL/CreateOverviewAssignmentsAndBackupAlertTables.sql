-- =============================================
-- Script: CreateOverviewAssignmentsAndBackupAlertTables.sql
-- Descripción: Crea tablas para asignaciones de problemas del Overview
--              y configuración de alertas de backups
-- =============================================

-- =============================================
-- 1. Tabla para asignaciones de problemas del Overview
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OverviewIssueAssignments]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[OverviewIssueAssignments] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [IssueType] NVARCHAR(50) NOT NULL,           -- 'Backup', 'Disk', 'Maintenance'
        [InstanceName] NVARCHAR(255) NOT NULL,
        [DriveOrTipo] NVARCHAR(100) NULL,            -- Drive para discos, Tipo para mantenimiento
        [AssignedToUserId] NVARCHAR(450) NOT NULL,
        [AssignedByUserId] NVARCHAR(450) NOT NULL,
        [AssignedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [ResolvedAt] DATETIME2 NULL,
        [Notes] NVARCHAR(500) NULL,
        
        CONSTRAINT [FK_OverviewIssueAssignments_AssignedToUser] 
            FOREIGN KEY ([AssignedToUserId]) REFERENCES [AspNetUsers]([Id]),
        CONSTRAINT [FK_OverviewIssueAssignments_AssignedByUser] 
            FOREIGN KEY ([AssignedByUserId]) REFERENCES [AspNetUsers]([Id])
    );
    
    -- Índices para búsquedas eficientes
    CREATE INDEX [IX_OverviewIssueAssignments_IssueType] 
        ON [dbo].[OverviewIssueAssignments]([IssueType]);
    CREATE INDEX [IX_OverviewIssueAssignments_InstanceName] 
        ON [dbo].[OverviewIssueAssignments]([InstanceName]);
    CREATE INDEX [IX_OverviewIssueAssignments_AssignedToUserId] 
        ON [dbo].[OverviewIssueAssignments]([AssignedToUserId]);
    CREATE INDEX [IX_OverviewIssueAssignments_ResolvedAt] 
        ON [dbo].[OverviewIssueAssignments]([ResolvedAt]);
    
    -- Índice único para evitar asignaciones duplicadas del mismo problema activo
    CREATE UNIQUE INDEX [IX_OverviewIssueAssignments_Unique_Active] 
        ON [dbo].[OverviewIssueAssignments]([IssueType], [InstanceName], [DriveOrTipo])
        WHERE [ResolvedAt] IS NULL;
    
    PRINT 'Tabla OverviewIssueAssignments creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla OverviewIssueAssignments ya existe.';
END
GO

-- =============================================
-- 2. Tabla de configuración de alertas de backups
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BackupAlertConfig]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[BackupAlertConfig] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Name] NVARCHAR(200) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [IsEnabled] BIT NOT NULL DEFAULT 0,
        [CheckIntervalMinutes] INT NOT NULL DEFAULT 60,
        [AlertIntervalMinutes] INT NOT NULL DEFAULT 240,
        [Recipients] NVARCHAR(2000) NULL,             -- Emails TO separados por coma
        [CcRecipients] NVARCHAR(2000) NULL,           -- Emails CC separados por coma
        [LastRunAt] DATETIME2 NULL,
        [LastAlertSentAt] DATETIME2 NULL,
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        
        CONSTRAINT [FK_BackupAlertConfig_UpdatedByUser] 
            FOREIGN KEY ([UpdatedByUserId]) REFERENCES [AspNetUsers]([Id])
    );
    
    PRINT 'Tabla BackupAlertConfig creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla BackupAlertConfig ya existe.';
END
GO

-- =============================================
-- 3. Tabla de historial de alertas de backups
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[BackupAlertHistory]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[BackupAlertHistory] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [ConfigId] INT NOT NULL,
        [SentAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [RecipientCount] INT NOT NULL,
        [CcCount] INT NOT NULL DEFAULT 0,
        [InstancesAffected] NVARCHAR(4000) NOT NULL,
        [Success] BIT NOT NULL,
        [ErrorMessage] NVARCHAR(1000) NULL,
        
        CONSTRAINT [FK_BackupAlertHistory_Config] 
            FOREIGN KEY ([ConfigId]) REFERENCES [BackupAlertConfig]([Id])
    );
    
    -- Índice para búsquedas por fecha
    CREATE INDEX [IX_BackupAlertHistory_SentAt] 
        ON [dbo].[BackupAlertHistory]([SentAt] DESC);
    CREATE INDEX [IX_BackupAlertHistory_ConfigId] 
        ON [dbo].[BackupAlertHistory]([ConfigId]);
    
    PRINT 'Tabla BackupAlertHistory creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla BackupAlertHistory ya existe.';
END
GO

-- =============================================
-- 4. Agregar permiso para alertas de backups
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [ViewName] = 'AlertaBackups')
BEGIN
    -- Agregar permiso para todos los roles que tengan AlertaServidoresCaidos
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled])
    SELECT DISTINCT [Role], 'AlertaBackups', [Enabled]
    FROM [dbo].[RolePermissions]
    WHERE [ViewName] = 'AlertaServidoresCaidos';
    
    PRINT 'Permiso AlertaBackups agregado.';
END
GO

-- =============================================
-- 5. Insertar configuración inicial si no existe
-- =============================================
IF NOT EXISTS (SELECT 1 FROM [dbo].[BackupAlertConfig])
BEGIN
    INSERT INTO [dbo].[BackupAlertConfig] 
        ([Name], [Description], [IsEnabled], [CheckIntervalMinutes], [AlertIntervalMinutes])
    VALUES 
        (N'Alerta de Backups Atrasados', 
         N'Alerta automática cuando se detectan backups vencidos en instancias de Producción', 
         0, 60, 240);
    
    PRINT 'Configuración inicial de alertas de backups insertada.';
END
GO

PRINT '=== Script completado exitosamente ===';
