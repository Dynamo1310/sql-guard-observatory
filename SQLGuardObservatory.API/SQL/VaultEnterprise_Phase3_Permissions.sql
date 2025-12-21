-- =============================================
-- Script: VaultEnterprise_Phase3_Permissions.sql
-- Description: Fase 3 - Modelo de permisos robusto con bitmask
-- Database: SQLGuardObservatoryAuth
-- SQL Server: 2017+
-- Date: December 2025
-- 
-- RIESGO DE SEGURIDAD (v2.1):
-- La migración conservadora mapea "View" a ViewMetadata + RevealSecret
-- porque es el comportamiento ACTUAL del sistema. Esto significa que 
-- usuarios que antes tenían "View" podrán seguir haciendo Reveal.
--
-- FOLLOW-UP OBLIGATORIO (post-migración):
-- 1. Recertificación de shares: revisar CredentialUserShares y CredentialGroupShares
--    donde PermissionBitMask incluye RevealSecret (bit 2) y validar si es intencional
-- 2. UI/UX: al compartir con Viewer, mostrar advertencia
-- 3. Auditoría: registrar SIEMPRE que un usuario hace Reveal
-- 4. Reporte: generar lista de usuarios con RevealSecret para revisión periódica
-- =============================================

USE [SQLGuardObservatoryAuth]
GO

PRINT '============================================='
PRINT 'FASE 3: PERMISOS - Vault Enterprise v2.1.1'
PRINT '============================================='
PRINT ''
PRINT 'RIESGO: Migración conservadora View -> Viewer (incluye Reveal)'
PRINT 'Ver script de recertificación post-migración'
PRINT ''
GO

-- Registrar inicio
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status])
VALUES ('Phase3', 'Permissions', 'Started');
GO

-- =============================================
-- 3.1 Crear tabla PermissionTypes
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[PermissionTypes]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[PermissionTypes] (
        [Id] INT PRIMARY KEY,
        [Code] NVARCHAR(30) NOT NULL,
        [Name] NVARCHAR(100) NOT NULL,
        [Description] NVARCHAR(500) NULL,
        [Category] NVARCHAR(50) NOT NULL,
        [BitFlag] BIGINT NOT NULL,
        
        CONSTRAINT [UQ_PermissionTypes_Code] UNIQUE ([Code]),
        CONSTRAINT [UQ_PermissionTypes_BitFlag] UNIQUE ([BitFlag])
    );
    
    PRINT 'Tabla PermissionTypes creada.';
    
    -- Insertar permisos base
    INSERT INTO [dbo].[PermissionTypes] (Id, Code, Name, Description, Category, BitFlag) VALUES
    -- Permisos de lectura (separados)
    (1,  'ViewMetadata',     'Ver nombre, descripcion, tags',        'Ver metadata básica de la credencial', 'Credential', 1),
    (2,  'RevealSecret',     'Revelar password en pantalla',         'Permite ver el password descifrado', 'Credential', 2),
    (3,  'UseWithoutReveal', 'Usar para conexion sin ver password',  'Usar credencial para conexión sin revelar', 'Credential', 4),

    -- Permisos de escritura
    (4,  'EditMetadata',     'Editar nombre/descripcion/tags',       'Modificar metadata de la credencial', 'Credential', 8),
    (5,  'RotateSecret',     'Cambiar/rotar password',               'Cambiar el password de la credencial', 'Credential', 16),
    (6,  'ManageServers',    'Agregar/quitar servidores asociados',  'Gestionar asociaciones con servidores', 'Credential', 32),

    -- Permisos de administración
    (7,  'ShareCredential',  'Compartir con usuarios/grupos',        'Compartir la credencial con otros', 'Credential', 64),
    (8,  'DeleteCredential', 'Soft-delete credencial',               'Marcar credencial como eliminada', 'Credential', 128),
    (9,  'RestoreCredential','Restaurar credencial eliminada',       'Restaurar credencial de soft-delete', 'Credential', 256),
    (10, 'ViewAudit',        'Ver historial de auditoria',           'Ver logs de auditoría de la credencial', 'Credential', 512),

    -- Permisos de grupo
    (11, 'ManageGroupMembers',  'Admin miembros del grupo',          'Gestionar miembros del grupo', 'Group', 1024),
    (12, 'ManageGroupSettings', 'Editar config del grupo',           'Modificar configuración del grupo', 'Group', 2048);
    
    PRINT 'Permisos base insertados en PermissionTypes.';
END
ELSE
BEGIN
    PRINT 'Tabla PermissionTypes ya existe.';
END
GO

-- =============================================
-- 3.2 Crear tabla RolePermissionMatrix
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[RolePermissionMatrix]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[RolePermissionMatrix] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [RoleCode] NVARCHAR(20) NOT NULL UNIQUE,
        [PermissionBitMask] BIGINT NOT NULL,
        [Description] NVARCHAR(500) NULL
    );
    
    PRINT 'Tabla RolePermissionMatrix creada.';
    
    -- Insertar roles predefinidos
    INSERT INTO [dbo].[RolePermissionMatrix] (RoleCode, PermissionBitMask, Description) VALUES
    -- Owner: todos (1+2+4+8+16+32+64+128+256+512 = 1023)
    ('Owner',    1023, 'Control total sobre credencial'),

    -- Admin: todo excepto restore (1023 - 256 = 767)
    ('Admin',    767,  'Todo excepto restore'),

    -- Editor: View + Reveal + Edit + Servers (1+2+8+32 = 43)
    ('Editor',   43,   'Puede ver, revelar y editar metadata'),

    -- Viewer: View + Reveal (1+2 = 3) - COMPORTAMIENTO ACTUAL
    ('Viewer',   3,    'Puede ver metadata y revelar password'),

    -- ViewOnly: Solo View metadata (1) - NUEVO, mas restrictivo
    ('ViewOnly', 1,    'Solo puede ver metadata, NO revelar'),

    -- UseOnly: View + Use sin reveal (1+4 = 5)
    ('UseOnly',  5,    'Puede usar para conexion sin ver password');
    
    PRINT 'Roles predefinidos insertados en RolePermissionMatrix.';
END
ELSE
BEGIN
    PRINT 'Tabla RolePermissionMatrix ya existe.';
END
GO

-- =============================================
-- 3.3 Agregar columna PermissionBitMask a CredentialUserShares
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialUserShares]') AND name = 'PermissionBitMask')
BEGIN
    ALTER TABLE [dbo].[CredentialUserShares] ADD [PermissionBitMask] BIGINT NULL;
    PRINT 'Columna PermissionBitMask agregada a CredentialUserShares.';
END
GO

-- Migrar permisos string a bitmask (CONSERVADOR)
-- View -> 3 (ViewMetadata + RevealSecret) porque es el comportamiento actual
UPDATE cus SET [PermissionBitMask] = 
    CASE [Permission]
        WHEN 'View' THEN 3    -- Viewer: ViewMetadata + RevealSecret (comportamiento actual)
        WHEN 'Edit' THEN 43   -- Editor: + EditMetadata + ManageServers
        WHEN 'Admin' THEN 767 -- Admin: todo excepto restore
        ELSE 1                -- Fallback: solo ViewMetadata
    END
FROM [dbo].[CredentialUserShares] cus
WHERE cus.[PermissionBitMask] IS NULL;

PRINT 'Migración de permisos en CredentialUserShares: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' filas actualizadas.';
GO

-- =============================================
-- 3.4 Agregar columna PermissionBitMask a CredentialGroupShares
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[dbo].[CredentialGroupShares]') AND name = 'PermissionBitMask')
BEGIN
    ALTER TABLE [dbo].[CredentialGroupShares] ADD [PermissionBitMask] BIGINT NULL;
    PRINT 'Columna PermissionBitMask agregada a CredentialGroupShares.';
END
GO

-- Migrar permisos string a bitmask (CONSERVADOR)
UPDATE cgs SET [PermissionBitMask] = 
    CASE [Permission]
        WHEN 'View' THEN 3    -- Viewer
        WHEN 'Edit' THEN 43   -- Editor
        WHEN 'Admin' THEN 767 -- Admin
        ELSE 1                -- Fallback
    END
FROM [dbo].[CredentialGroupShares] cgs
WHERE cgs.[PermissionBitMask] IS NULL;

PRINT 'Migración de permisos en CredentialGroupShares: ' + CAST(@@ROWCOUNT AS VARCHAR) + ' filas actualizadas.';
GO

-- =============================================
-- 3.5 Verificar migración
-- =============================================
DECLARE @PendingUserShares INT, @PendingGroupShares INT;

SELECT @PendingUserShares = COUNT(*)
FROM [dbo].[CredentialUserShares]
WHERE [PermissionBitMask] IS NULL AND [Permission] IS NOT NULL;

SELECT @PendingGroupShares = COUNT(*)
FROM [dbo].[CredentialGroupShares]
WHERE [PermissionBitMask] IS NULL AND [Permission] IS NOT NULL;

IF @PendingUserShares > 0 OR @PendingGroupShares > 0
BEGIN
    PRINT 'WARNING: Migración incompleta!';
    PRINT 'UserShares pendientes: ' + CAST(@PendingUserShares AS VARCHAR);
    PRINT 'GroupShares pendientes: ' + CAST(@PendingGroupShares AS VARCHAR);
END
ELSE
BEGIN
    PRINT 'Migración de permisos completada exitosamente.';
END
GO

-- Registrar completado
UPDATE [dbo].[VaultMigrationLog] 
SET [Status] = 'Completed', [CompletedAt] = dbo.fn_GetArgentinaTimeOffset()
WHERE [Phase] = 'Phase3' AND [Step] = 'Permissions' AND [CompletedAt] IS NULL;
GO

PRINT '============================================='
PRINT 'FASE 3 COMPLETADA: Permisos'
PRINT '- PermissionTypes creada'
PRINT '- RolePermissionMatrix creada'
PRINT '- PermissionBitMask migrado (conservador)'
PRINT ''
PRINT 'ACCION REQUERIDA: Ejecutar script de recertificación'
PRINT '============================================='
GO

