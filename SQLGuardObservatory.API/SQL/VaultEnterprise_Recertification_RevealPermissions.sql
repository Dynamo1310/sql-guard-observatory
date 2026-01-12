-- =============================================
-- Script: VaultEnterprise_Recertification_RevealPermissions.sql
-- Description: Gate de Recertificación - Permisos Reveal
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
--
-- IMPORTANTE: Este script es parte del Gate de Recertificación
-- La migración NO se considera COMPLETA hasta que Security apruebe
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'RECERTIFICACION DE PERMISOS REVEAL'
PRINT '============================================='
PRINT ''
PRINT 'Timeline:'
PRINT '- Día 0-24h: Generar reporte y enviar a Security + Owners'
PRINT '- Día 24-48h: Owners revisan y marcan shares a downgrade'
PRINT '- Día 48-72h: Ejecutar downgrade aprobado por Security'
PRINT '- Día 72h+: Gate CERRADO'
PRINT ''
GO

-- =============================================
-- REPORTE DE RECERTIFICACION
-- Ejecutar: Día 0-24h post-migración
-- Exportar a CSV y enviar a Security Team + Credential Owners
-- =============================================

PRINT '=== REPORTE: Shares con permiso RevealSecret (bit 2) ==='
PRINT ''

-- Reporte de UserShares con Reveal
SELECT 
    c.Id AS CredentialId,
    c.Name AS CredentialName,
    c.CredentialType,
    owner.UserName AS OwnerUserName,
    owner.Email AS OwnerEmail,
    'UserShare' AS ShareType,
    cus.Id AS ShareId,
    sharedWith.UserName AS SharedWithUserName,
    sharedWith.Email AS SharedWithEmail,
    cus.PermissionBitMask,
    CASE WHEN (cus.PermissionBitMask & 2) = 2 THEN 'CAN REVEAL' ELSE 'NO REVEAL' END AS RevealStatus,
    cus.SharedAt,
    -- Último reveal de este usuario para esta credencial (si existe)
    (SELECT MAX(AccessedAt) 
     FROM CredentialAccessLog cal 
     WHERE cal.CredentialId = c.Id 
       AND cal.UserId = cus.UserId 
       AND cal.AccessType = 'Reveal') AS LastRevealAt
FROM Credentials c
JOIN AspNetUsers owner ON c.OwnerUserId = owner.Id
JOIN CredentialUserShares cus ON c.Id = cus.CredentialId
JOIN AspNetUsers sharedWith ON cus.UserId = sharedWith.Id
WHERE (cus.PermissionBitMask & 2) = 2 -- Tiene RevealSecret
  AND c.IsDeleted = 0

UNION ALL

-- Reporte de GroupShares con Reveal
SELECT 
    c.Id,
    c.Name,
    c.CredentialType,
    owner.UserName,
    owner.Email,
    'GroupShare' AS ShareType,
    cgs.Id AS ShareId,
    g.Name AS SharedWithGroupName,
    NULL AS SharedWithEmail,
    cgs.PermissionBitMask,
    CASE WHEN (cgs.PermissionBitMask & 2) = 2 THEN 'CAN REVEAL' ELSE 'NO REVEAL' END,
    cgs.SharedAt,
    NULL AS LastRevealAt
FROM Credentials c
JOIN AspNetUsers owner ON c.OwnerUserId = owner.Id
JOIN CredentialGroupShares cgs ON c.Id = cgs.CredentialId
JOIN CredentialGroups g ON cgs.GroupId = g.Id
WHERE (cgs.PermissionBitMask & 2) = 2
  AND c.IsDeleted = 0

ORDER BY OwnerEmail, CredentialName;
GO

-- =============================================
-- RESUMEN ESTADÍSTICO
-- =============================================
PRINT ''
PRINT '=== RESUMEN ESTADÍSTICO ==='

SELECT 
    'UserShares con Reveal' AS Metric,
    COUNT(*) AS Count
FROM CredentialUserShares cus
JOIN Credentials c ON cus.CredentialId = c.Id
WHERE (cus.PermissionBitMask & 2) = 2 AND c.IsDeleted = 0

UNION ALL

SELECT 
    'GroupShares con Reveal',
    COUNT(*)
FROM CredentialGroupShares cgs
JOIN Credentials c ON cgs.CredentialId = c.Id
WHERE (cgs.PermissionBitMask & 2) = 2 AND c.IsDeleted = 0

UNION ALL

SELECT 
    'Owners únicos afectados',
    COUNT(DISTINCT c.OwnerUserId)
FROM Credentials c
WHERE c.IsDeleted = 0
  AND (
      EXISTS (SELECT 1 FROM CredentialUserShares cus WHERE cus.CredentialId = c.Id AND (cus.PermissionBitMask & 2) = 2)
      OR EXISTS (SELECT 1 FROM CredentialGroupShares cgs WHERE cgs.CredentialId = c.Id AND (cgs.PermissionBitMask & 2) = 2)
  );
GO

-- =============================================
-- CRITERIOS DE DOWNGRADE
-- Un share debe ser downgraded de Viewer (3) a ViewOnly (1) si:
-- 1. El owner indica que el usuario NO necesita revelar el password
-- 2. El usuario no ha hecho Reveal en los últimos 90 días
-- 3. La credencial es de tipo "service account" y solo se usa para conexiones automáticas
-- =============================================

PRINT ''
PRINT '=== CANDIDATOS A DOWNGRADE (sin Reveal en 90 días) ==='

SELECT 
    cus.Id AS ShareId,
    c.Name AS CredentialName,
    sharedWith.UserName AS SharedWithUserName,
    cus.SharedAt,
    (SELECT MAX(AccessedAt) 
     FROM CredentialAccessLog cal 
     WHERE cal.CredentialId = c.Id 
       AND cal.UserId = cus.UserId 
       AND cal.AccessType = 'Reveal') AS LastRevealAt,
    'CANDIDATE: No Reveal in 90 days' AS Recommendation
FROM Credentials c
JOIN CredentialUserShares cus ON c.Id = cus.CredentialId
JOIN AspNetUsers sharedWith ON cus.UserId = sharedWith.Id
WHERE (cus.PermissionBitMask & 2) = 2
  AND c.IsDeleted = 0
  AND NOT EXISTS (
      SELECT 1 FROM CredentialAccessLog cal 
      WHERE cal.CredentialId = c.Id 
        AND cal.UserId = cus.UserId 
        AND cal.AccessType = 'Reveal'
        AND cal.AccessedAt > DATEADD(DAY, -90, GETDATE())
  );
GO

-- =============================================
-- SCRIPT DE DOWNGRADE
-- EJECUTAR SOLO CON APROBACIÓN DE SECURITY
-- =============================================

PRINT ''
PRINT '=== SCRIPT DE DOWNGRADE (COMENTADO - REQUIERE APROBACION) ==='
PRINT ''
PRINT '-- Descomente y ejecute SOLO con lista de IDs aprobados por Security'
PRINT ''

/*
-- =============================================
-- DOWNGRADE APROBADO - Ejecutar SOLO con lista de IDs aprobados por Security
-- Requiere: Lista de CredentialUserShares.Id a downgrade
-- =============================================

DECLARE @ApprovedShareIds TABLE (ShareId INT);

-- Insertar IDs aprobados (proporcionados por Security)
-- REEMPLAZAR con IDs reales del reporte
INSERT INTO @ApprovedShareIds VALUES 
    (123), (456), (789); -- REEMPLAZAR CON IDs REALES

-- Ejecutar downgrade
UPDATE cus
SET PermissionBitMask = 1 -- ViewMetadata only (sin Reveal)
FROM CredentialUserShares cus
WHERE cus.Id IN (SELECT ShareId FROM @ApprovedShareIds)
  AND cus.PermissionBitMask = 3; -- Solo si es Viewer actual

PRINT 'Downgrade ejecutado. Shares afectados: ' + CAST(@@ROWCOUNT AS VARCHAR);

-- Log de downgrade en auditoría
INSERT INTO CredentialAuditLog 
    (CredentialId, CredentialName, Action, ChangedFields, PerformedByUserId, PerformedByUserName, PerformedAt)
SELECT 
    cus.CredentialId,
    c.Name,
    'PermissionDowngraded',
    '{"from": 3, "to": 1, "reason": "Recertification", "shareId": ' + CAST(cus.Id AS VARCHAR) + '}',
    'system-recertification',
    'System - Recertification Gate',
    dbo.fn_GetArgentinaTimeOffset()
FROM CredentialUserShares cus
JOIN Credentials c ON cus.CredentialId = c.Id
WHERE cus.Id IN (SELECT ShareId FROM @ApprovedShareIds);

*/

-- =============================================
-- CHECKLIST DEL GATE
-- =============================================
PRINT ''
PRINT '=== CHECKLIST DEL GATE (marcar cuando complete) ==='
PRINT ''
PRINT '[ ] Reporte de recertificación generado (este script)'
PRINT '[ ] Reporte enviado a Security Team'
PRINT '[ ] Reporte enviado a Credential Owners'
PRINT '[ ] Owners respondieron con lista de shares a downgrade'
PRINT '[ ] Security aprobó lista de downgrades'
PRINT '[ ] Script de downgrade ejecutado por Ops'
PRINT '[ ] Verificación post-downgrade: usuarios afectados notificados'
PRINT '[ ] SIGN-OFF de Security Team (OBLIGATORIO)'
PRINT '[ ] Gate CERRADO - Migración marcada como COMPLETA'
PRINT ''
GO

