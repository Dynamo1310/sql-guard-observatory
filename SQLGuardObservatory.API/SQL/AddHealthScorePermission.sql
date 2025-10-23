-- ========================================
-- Script: Agregar permisos de HealthScore
-- Base de datos: SQLGuardObservatoryAuth
-- Propósito: Agregar permisos para la vista HealthScore
-- ========================================

USE [SQLGuardObservatoryAuth]
GO

-- Insertar permiso HealthScore para Admin si no existe
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'Admin' AND [ViewName] = 'HealthScore')
BEGIN
    PRINT 'Agregando permiso HealthScore para Admin...'
    
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Admin', 'HealthScore', 1, GETUTCDATE())
    
    PRINT '✓ Permiso Admin agregado.'
END
ELSE
BEGIN
    PRINT '→ Permiso HealthScore para Admin ya existe.'
END
GO

-- Insertar permiso HealthScore para SuperAdmin si no existe
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'SuperAdmin' AND [ViewName] = 'HealthScore')
BEGIN
    PRINT 'Agregando permiso HealthScore para SuperAdmin...'
    
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('SuperAdmin', 'HealthScore', 1, GETUTCDATE())
    
    PRINT '✓ Permiso SuperAdmin agregado.'
END
ELSE
BEGIN
    PRINT '→ Permiso HealthScore para SuperAdmin ya existe.'
END
GO

-- Insertar permiso HealthScore para Reader si no existe (opcional)
IF NOT EXISTS (SELECT 1 FROM [dbo].[RolePermissions] WHERE [Role] = 'Reader' AND [ViewName] = 'HealthScore')
BEGIN
    PRINT 'Agregando permiso HealthScore para Reader...'
    
    INSERT INTO [dbo].[RolePermissions] ([Role], [ViewName], [Enabled], [CreatedAt])
    VALUES ('Reader', 'HealthScore', 1, GETUTCDATE())
    
    PRINT '✓ Permiso Reader agregado.'
END
ELSE
BEGIN
    PRINT '→ Permiso HealthScore para Reader ya existe.'
END
GO

-- Verificar permisos
PRINT ''
PRINT '========================================='
PRINT 'Permisos de HealthScore:'
PRINT '========================================='
SELECT 
    [Role] AS RoleName,
    [ViewName],
    [Enabled],
    [CreatedAt]
FROM [dbo].[RolePermissions]
WHERE [ViewName] = 'HealthScore'
ORDER BY [Role]
GO

