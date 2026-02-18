-- =============================================
-- Script: AddSystemViewAnalyticsCapability.sql
-- Descripción: Agrega la capacidad System.ViewAnalytics a los roles existentes
-- Fecha: 2026-02-18
-- =============================================

USE [SQLNova]
GO

SET NOCOUNT ON;

PRINT '=== Agregando capacidad System.ViewAnalytics ==='

-- Obtener IDs de roles
DECLARE @SuperAdminId INT, @AdminId INT, @ReaderId INT;
SELECT @SuperAdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin';
SELECT @AdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin';
SELECT @ReaderId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader';

-- Agregar capacidad a SuperAdmin (habilitada)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @SuperAdminId AND [CapabilityKey] = 'System.ViewAnalytics')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@SuperAdminId, 'System.ViewAnalytics', 1);
    PRINT 'Capacidad System.ViewAnalytics agregada a SuperAdmin (habilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ViewAnalytics ya existe para SuperAdmin';
END

-- Agregar capacidad a Admin (deshabilitada por defecto, puede habilitarse)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @AdminId AND [CapabilityKey] = 'System.ViewAnalytics')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@AdminId, 'System.ViewAnalytics', 0);
    PRINT 'Capacidad System.ViewAnalytics agregada a Admin (deshabilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ViewAnalytics ya existe para Admin';
END

-- Agregar capacidad a Reader (deshabilitada)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @ReaderId AND [CapabilityKey] = 'System.ViewAnalytics')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@ReaderId, 'System.ViewAnalytics', 0);
    PRINT 'Capacidad System.ViewAnalytics agregada a Reader (deshabilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ViewAnalytics ya existe para Reader';
END

-- Agregar a cualquier otro rol personalizado que exista (deshabilitada por defecto)
INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
SELECT r.Id, 'System.ViewAnalytics', 0
FROM [dbo].[AdminRoles] r
WHERE r.Id NOT IN (@SuperAdminId, @AdminId, @ReaderId)
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[AdminRoleCapabilities] c 
    WHERE c.RoleId = r.Id AND c.CapabilityKey = 'System.ViewAnalytics'
  );

PRINT '=== Script completado ==='
GO
