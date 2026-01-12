-- =============================================
-- Script: VaultEnterprise_Phase4_AuditAccessLog.sql
-- Description: Fase 4 - Auditoría con integridad y AccessLog
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'FASE 4: AUDITORIA Y ACCESS LOG - Vault Enterprise v2.1.1'
PRINT '============================================='
GO

-- Registrar inicio
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase4', 'AuditAccessLog', 'Started');
GO

-- =============================================
-- 4.1 Expandir CredentialAuditLog
-- =============================================

-- ActionResult
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'ActionResult')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD 
        [ActionResult] NVARCHAR(20) NOT NULL 
        CONSTRAINT [DF_CredentialAuditLog_ActionResult] DEFAULT 'Success';
    PRINT 'Columna ActionResult agregada a CredentialAuditLog.';
END
GO

-- FailureReason
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'FailureReason')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [FailureReason] NVARCHAR(500) NULL;
    PRINT 'Columna FailureReason agregada a CredentialAuditLog.';
END
GO

-- TargetServerName
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'TargetServerName')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [TargetServerName] NVARCHAR(256) NULL;
    PRINT 'Columna TargetServerName agregada a CredentialAuditLog.';
END
GO

-- TargetInstanceName
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'TargetInstanceName')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [TargetInstanceName] NVARCHAR(256) NULL;
    PRINT 'Columna TargetInstanceName agregada a CredentialAuditLog.';
END
GO

-- SessionId
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'SessionId')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [SessionId] NVARCHAR(100) NULL;
    PRINT 'Columna SessionId agregada a CredentialAuditLog.';
END
GO

-- RequestId
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'RequestId')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [RequestId] UNIQUEIDENTIFIER NULL;
    PRINT 'Columna RequestId agregada a CredentialAuditLog.';
END
GO

-- PreviousHash (para chain de integridad)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'PreviousHash')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [PreviousHash] VARBINARY(64) NULL;
    PRINT 'Columna PreviousHash agregada a CredentialAuditLog.';
END
GO

-- RecordHash
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'RecordHash')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD [RecordHash] VARBINARY(64) NULL;
    PRINT 'Columna RecordHash agregada a CredentialAuditLog.';
END
GO

-- PerformedAtOffset (DATETIMEOFFSET con timezone)
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'PerformedAtOffset')
BEGIN
    ALTER TABLE [dbo].[CredentialAuditLog] ADD 
        [PerformedAtOffset] DATETIMEOFFSET NULL 
        CONSTRAINT [DF_CredentialAuditLog_PerformedAtOffset] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset());
    PRINT 'Columna PerformedAtOffset agregada a CredentialAuditLog.';
END
GO

-- =============================================
-- 4.2 Crear tabla CredentialAccessLog (alto volumen)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAccessLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[CredentialAccessLog] (
        [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
        [CredentialId] INT NOT NULL,
        [AccessType] NVARCHAR(30) NOT NULL,
        [AccessResult] NVARCHAR(20) NOT NULL,
        [DenialReason] NVARCHAR(100) NULL,
        [TargetServerName] NVARCHAR(256) NULL,
        [TargetInstanceName] NVARCHAR(256) NULL,
        [UserId] NVARCHAR(450) NOT NULL,
        [UserName] NVARCHAR(256) NULL,
        -- FIX 3: Usar función consistente fn_GetArgentinaTimeOffset()
        [AccessedAt] DATETIMEOFFSET NOT NULL 
            CONSTRAINT [DF_CredentialAccessLog_AccessedAt] 
            DEFAULT (dbo.fn_GetArgentinaTimeOffset()),
        [IpAddress] NVARCHAR(50) NULL,
        [UserAgent] NVARCHAR(500) NULL,
        [SessionId] NVARCHAR(100) NULL
    );
    
    PRINT 'Tabla CredentialAccessLog creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla CredentialAccessLog ya existe.';
END
GO

-- =============================================
-- 4.3 Índices para CredentialAccessLog
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialAccessLog_CredentialId' AND object_id = OBJECT_ID('CredentialAccessLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialAccessLog_CredentialId]
    ON [dbo].[CredentialAccessLog] ([CredentialId], [AccessedAt] DESC);
    PRINT 'Índice IX_CredentialAccessLog_CredentialId creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialAccessLog_UserId' AND object_id = OBJECT_ID('CredentialAccessLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialAccessLog_UserId]
    ON [dbo].[CredentialAccessLog] ([UserId], [AccessedAt] DESC);
    PRINT 'Índice IX_CredentialAccessLog_UserId creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialAccessLog_Denied' AND object_id = OBJECT_ID('CredentialAccessLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialAccessLog_Denied]
    ON [dbo].[CredentialAccessLog] ([AccessedAt] DESC)
    WHERE [AccessResult] = 'Denied';
    PRINT 'Índice IX_CredentialAccessLog_Denied creado.';
END
GO

-- =============================================
-- 4.4 Alinear defaults de timestamps usando sp_DropDefaultConstraintSafe
-- =============================================

-- VaultMigrationLog.StartedAt
EXEC sp_DropDefaultConstraintSafe 'VaultMigrationLog', 'StartedAt', 'dbo';
ALTER TABLE [dbo].[VaultMigrationLog] 
    ADD CONSTRAINT [DF_VaultMigrationLog_StartedAt] 
    DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [StartedAt];
PRINT 'Default de VaultMigrationLog.StartedAt actualizado.';
GO

-- VaultPurgeLog.PurgedAt
EXEC sp_DropDefaultConstraintSafe 'VaultPurgeLog', 'PurgedAt', 'dbo';
ALTER TABLE [dbo].[VaultPurgeLog] 
    ADD CONSTRAINT [DF_VaultPurgeLog_PurgedAt] 
    DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [PurgedAt];
PRINT 'Default de VaultPurgeLog.PurgedAt actualizado.';
GO

-- Credentials.CreatedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[Credentials]') AND name = 'CreatedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'Credentials', 'CreatedAt', 'dbo';
    ALTER TABLE [dbo].[Credentials] 
        ADD CONSTRAINT [DF_Credentials_CreatedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [CreatedAt];
    PRINT 'Default de Credentials.CreatedAt actualizado.';
END
GO

-- CredentialGroups.CreatedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroups]') AND name = 'CreatedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialGroups', 'CreatedAt', 'dbo';
    ALTER TABLE [dbo].[CredentialGroups] 
        ADD CONSTRAINT [DF_CredentialGroups_CreatedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [CreatedAt];
    PRINT 'Default de CredentialGroups.CreatedAt actualizado.';
END
GO

-- CredentialGroupMembers.AddedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupMembers]') AND name = 'AddedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialGroupMembers', 'AddedAt', 'dbo';
    ALTER TABLE [dbo].[CredentialGroupMembers] 
        ADD CONSTRAINT [DF_CredentialGroupMembers_AddedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [AddedAt];
    PRINT 'Default de CredentialGroupMembers.AddedAt actualizado.';
END
GO

-- CredentialServers.CreatedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialServers]') AND name = 'CreatedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialServers', 'CreatedAt', 'dbo';
    ALTER TABLE [dbo].[CredentialServers] 
        ADD CONSTRAINT [DF_CredentialServers_CreatedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [CreatedAt];
    PRINT 'Default de CredentialServers.CreatedAt actualizado.';
END
GO

-- CredentialUserShares.SharedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'SharedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialUserShares', 'SharedAt', 'dbo';
    ALTER TABLE [dbo].[CredentialUserShares] 
        ADD CONSTRAINT [DF_CredentialUserShares_SharedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [SharedAt];
    PRINT 'Default de CredentialUserShares.SharedAt actualizado.';
END
GO

-- CredentialGroupShares.SharedAt (si existe)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'SharedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialGroupShares', 'SharedAt', 'dbo';
    ALTER TABLE [dbo].[CredentialGroupShares] 
        ADD CONSTRAINT [DF_CredentialGroupShares_SharedAt] 
        DEFAULT (dbo.fn_GetArgentinaTimeOffset()) FOR [SharedAt];
    PRINT 'Default de CredentialGroupShares.SharedAt actualizado.';
END
GO

-- CredentialAuditLog.PerformedAt (mantener DATETIME2 original, pero agregar OFFSET)
IF EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialAuditLog]') AND name = 'PerformedAt')
BEGIN
    EXEC sp_DropDefaultConstraintSafe 'CredentialAuditLog', 'PerformedAt', 'dbo';
    -- Nota: PerformedAt sigue siendo DATETIME2, usamos fn_GetArgentinaTimeOffset y truncamos
    -- Para nuevos registros, preferir PerformedAtOffset
    PRINT 'Default de CredentialAuditLog.PerformedAt eliminado (usar PerformedAtOffset).';
END
GO

-- Registrar completado
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase4' AND [Step] = 'AuditAccessLog' AND [CompletedAt] IS NULL;
GO

PRINT '============================================='
PRINT 'FASE 4 COMPLETADA: Auditoría y AccessLog'
PRINT '- CredentialAuditLog expandida'
PRINT '- CredentialAccessLog creada'
PRINT '- Todos los defaults usan fn_GetArgentinaTimeOffset()'
PRINT '============================================='
GO

