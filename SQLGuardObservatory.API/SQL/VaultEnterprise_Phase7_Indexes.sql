-- =============================================
-- Script: VaultEnterprise_Phase7_Indexes.sql
-- Description: Fase 7 - Índices de performance
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'FASE 7: INDICES DE PERFORMANCE - Vault Enterprise v2.1.1'
PRINT '============================================='
GO

-- Registrar inicio
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase7', 'Indexes', 'Started');
GO

-- =============================================
-- 7.1 Índices para CredentialGroupShares
-- FIX 6: Solo incluir PermissionBitMask, NO Permission string
-- =============================================

-- Buscar "qué credenciales tiene este grupo"
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialGroupShares_GroupLookup' AND object_id = OBJECT_ID('CredentialGroupShares'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupShares_GroupLookup]
    ON [dbo].[CredentialGroupShares] ([GroupId], [CredentialId])
    INCLUDE ([PermissionBitMask], [SharedByUserId]);
    -- NOTA: NO incluir [Permission] - será eliminada en Fase 8
    
    PRINT 'Índice IX_CredentialGroupShares_GroupLookup creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_CredentialGroupShares_GroupLookup ya existe.';
END
GO

-- Buscar "en qué grupos está esta credencial"
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialGroupShares_CredentialLookup' AND object_id = OBJECT_ID('CredentialGroupShares'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupShares_CredentialLookup]
    ON [dbo].[CredentialGroupShares] ([CredentialId], [GroupId])
    INCLUDE ([PermissionBitMask]);
    
    PRINT 'Índice IX_CredentialGroupShares_CredentialLookup creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_CredentialGroupShares_CredentialLookup ya existe.';
END
GO

-- =============================================
-- 7.2 Índices para CredentialUserShares
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialUserShares_UserLookup' AND object_id = OBJECT_ID('CredentialUserShares'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialUserShares_UserLookup]
    ON [dbo].[CredentialUserShares] ([UserId])
    INCLUDE ([CredentialId], [PermissionBitMask]);
    
    PRINT 'Índice IX_CredentialUserShares_UserLookup creado.';
END
GO

-- =============================================
-- 7.3 Índice para "My Vault" (credenciales visibles por usuario)
-- NOTA: NO incluir columnas crypto legacy (EncryptedPassword, Salt, IV)
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Credentials_MyVault' AND object_id = OBJECT_ID('Credentials'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Credentials_MyVault]
    ON [dbo].[Credentials] ([IsDeleted], [OwnerUserId])
    INCLUDE ([Name], [CredentialType], [Username], [Description], [IsPrivate], [IsTeamShared], [ExpiresAt], [CreatedAt])
    WHERE [IsDeleted] = 0;
    
    PRINT 'Índice IX_Credentials_MyVault creado.';
END
ELSE
BEGIN
    PRINT 'Índice IX_Credentials_MyVault ya existe.';
END
GO

-- =============================================
-- 7.4 Índice para búsqueda por servidor
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialServers_ServerLookup' AND object_id = OBJECT_ID('CredentialServers'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialServers_ServerLookup]
    ON [dbo].[CredentialServers] ([ServerName], [InstanceName])
    INCLUDE ([CredentialId], [ConnectionPurpose]);
    
    PRINT 'Índice IX_CredentialServers_ServerLookup creado.';
END
GO

-- =============================================
-- 7.5 Índice para credenciales próximas a expirar
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Credentials_Expiring' AND object_id = OBJECT_ID('Credentials'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_Credentials_Expiring]
    ON [dbo].[Credentials] ([ExpiresAt])
    INCLUDE ([Id], [Name], [OwnerUserId])
    WHERE [IsDeleted] = 0 AND [ExpiresAt] IS NOT NULL;
    
    PRINT 'Índice IX_Credentials_Expiring creado.';
END
GO

-- =============================================
-- 7.6 Índice para membresía de grupos
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialGroupMembers_UserGroups' AND object_id = OBJECT_ID('CredentialGroupMembers'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialGroupMembers_UserGroups]
    ON [dbo].[CredentialGroupMembers] ([UserId])
    INCLUDE ([GroupId], [Role]);
    
    PRINT 'Índice IX_CredentialGroupMembers_UserGroups creado.';
END
GO

-- =============================================
-- 7.7 Índices para auditoría
-- =============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialAuditLog_CredentialHistory' AND object_id = OBJECT_ID('CredentialAuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_CredentialHistory]
    ON [dbo].[CredentialAuditLog] ([CredentialId], [PerformedAt] DESC)
    INCLUDE ([Action], [PerformedByUserName], [ActionResult]);
    
    PRINT 'Índice IX_CredentialAuditLog_CredentialHistory creado.';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_CredentialAuditLog_UserActivity' AND object_id = OBJECT_ID('CredentialAuditLog'))
BEGIN
    CREATE NONCLUSTERED INDEX [IX_CredentialAuditLog_UserActivity]
    ON [dbo].[CredentialAuditLog] ([PerformedByUserId], [PerformedAt] DESC)
    INCLUDE ([CredentialId], [CredentialName], [Action]);
    
    PRINT 'Índice IX_CredentialAuditLog_UserActivity creado.';
END
GO

-- Registrar completado
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase7' AND [Step] = 'Indexes' AND [CompletedAt] IS NULL;
GO

PRINT '============================================='
PRINT 'FASE 7 COMPLETADA: Índices de Performance'
PRINT '============================================='
GO

