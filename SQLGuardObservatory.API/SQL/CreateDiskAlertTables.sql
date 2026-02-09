-- =============================================
-- Crear tablas para Alertas de Discos Críticos
-- Similar a BackupAlertConfig / BackupAlertHistory
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DiskAlertConfig')
BEGIN
    CREATE TABLE [dbo].[DiskAlertConfig] (
        [Id]                    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name]                  NVARCHAR(200)     NOT NULL DEFAULT 'Alerta de Discos Críticos',
        [Description]           NVARCHAR(500)     NULL,
        [IsEnabled]             BIT               NOT NULL DEFAULT 0,
        [CheckIntervalMinutes]  INT               NOT NULL DEFAULT 60,
        [AlertIntervalMinutes]  INT               NOT NULL DEFAULT 240,
        [Recipients]            NVARCHAR(2000)    NOT NULL DEFAULT '',
        [CcRecipients]          NVARCHAR(2000)    NOT NULL DEFAULT '',
        [LastRunAt]             DATETIME2         NULL,
        [LastAlertSentAt]       DATETIME2         NULL,
        [CreatedAt]             DATETIME2         NOT NULL DEFAULT GETDATE(),
        [UpdatedAt]             DATETIME2         NULL,
        [UpdatedByUserId]       NVARCHAR(450)     NULL,
        CONSTRAINT [FK_DiskAlertConfig_User] FOREIGN KEY ([UpdatedByUserId]) 
            REFERENCES [dbo].[AspNetUsers] ([Id])
    );
    PRINT 'Tabla DiskAlertConfig creada exitosamente';
END
ELSE
    PRINT 'Tabla DiskAlertConfig ya existe';

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DiskAlertHistory')
BEGIN
    CREATE TABLE [dbo].[DiskAlertHistory] (
        [Id]                INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [ConfigId]          INT               NOT NULL,
        [SentAt]            DATETIME2         NOT NULL DEFAULT GETDATE(),
        [RecipientCount]    INT               NOT NULL DEFAULT 0,
        [CcCount]           INT               NOT NULL DEFAULT 0,
        [DisksAffected]     NVARCHAR(4000)    NOT NULL DEFAULT '',
        [CriticalDiskCount] INT               NOT NULL DEFAULT 0,
        [Success]           BIT               NOT NULL DEFAULT 0,
        [ErrorMessage]      NVARCHAR(1000)    NULL,
        CONSTRAINT [FK_DiskAlertHistory_Config] FOREIGN KEY ([ConfigId]) 
            REFERENCES [dbo].[DiskAlertConfig] ([Id])
    );
    PRINT 'Tabla DiskAlertHistory creada exitosamente';
END
ELSE
    PRINT 'Tabla DiskAlertHistory ya existe';
