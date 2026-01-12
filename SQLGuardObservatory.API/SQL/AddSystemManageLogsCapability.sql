-- =============================================
-- Script: AddSystemManageLogsCapability.sql
-- Descripción: Agrega la capacidad System.ManageLogs a los roles existentes
-- Fecha: 2025-01-25
-- =============================================

USE [SQLNova]
GO

SET NOCOUNT ON;

PRINT '=== Agregando capacidad System.ManageLogs ==='

-- Obtener IDs de roles
DECLARE @SuperAdminId INT, @AdminId INT, @ReaderId INT;
SELECT @SuperAdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'SuperAdmin';
SELECT @AdminId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Admin';
SELECT @ReaderId = Id FROM [dbo].[AdminRoles] WHERE [Name] = 'Reader';

-- Agregar capacidad a SuperAdmin (habilitada)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @SuperAdminId AND [CapabilityKey] = 'System.ManageLogs')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@SuperAdminId, 'System.ManageLogs', 1);
    PRINT 'Capacidad System.ManageLogs agregada a SuperAdmin (habilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ManageLogs ya existe para SuperAdmin';
END

-- Agregar capacidad a Admin (deshabilitada por defecto, puede habilitarse)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @AdminId AND [CapabilityKey] = 'System.ManageLogs')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@AdminId, 'System.ManageLogs', 0);
    PRINT 'Capacidad System.ManageLogs agregada a Admin (deshabilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ManageLogs ya existe para Admin';
END

-- Agregar capacidad a Reader (deshabilitada)
IF NOT EXISTS (SELECT 1 FROM [dbo].[AdminRoleCapabilities] WHERE [RoleId] = @ReaderId AND [CapabilityKey] = 'System.ManageLogs')
BEGIN
    INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
    VALUES (@ReaderId, 'System.ManageLogs', 0);
    PRINT 'Capacidad System.ManageLogs agregada a Reader (deshabilitada)';
END
ELSE
BEGIN
    PRINT 'Capacidad System.ManageLogs ya existe para Reader';
END

-- Agregar a cualquier otro rol personalizado que exista (deshabilitada por defecto)
INSERT INTO [dbo].[AdminRoleCapabilities] ([RoleId], [CapabilityKey], [IsEnabled])
SELECT r.Id, 'System.ManageLogs', 0
FROM [dbo].[AdminRoles] r
WHERE r.Id NOT IN (@SuperAdminId, @AdminId, @ReaderId)
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[AdminRoleCapabilities] c 
    WHERE c.RoleId = r.Id AND c.CapabilityKey = 'System.ManageLogs'
  );

PRINT '=== Script completado ==='
GO




