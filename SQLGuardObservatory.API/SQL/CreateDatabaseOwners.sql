-- ============================================
-- Script: CreateDatabaseOwners.sql
-- Descripción: Tabla para el Knowledge Base de owners de bases de datos
-- Fecha: 2026
-- ============================================

USE [AppSQLNova];
GO

-- ============================================
-- 1. Crear tabla DatabaseOwners
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[DatabaseOwners]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[DatabaseOwners] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [ServerName] NVARCHAR(255) NOT NULL,                  -- Nombre del servidor
        [InstanceName] NVARCHAR(255) NULL,                    -- Nombre de instancia (opcional)
        [DatabaseName] NVARCHAR(255) NOT NULL,                -- Nombre de la base de datos
        [OwnerName] NVARCHAR(256) NOT NULL,                   -- Nombre del owner
        [OwnerEmail] NVARCHAR(256) NULL,                      -- Email del owner
        [OwnerPhone] NVARCHAR(50) NULL,                       -- Teléfono del owner
        [CellTeam] NVARCHAR(100) NULL,                        -- Célula/equipo al que pertenece
        [Department] NVARCHAR(100) NULL,                      -- Departamento
        [ApplicationName] NVARCHAR(256) NULL,                 -- Nombre de la aplicación
        [BusinessCriticality] NVARCHAR(20) NULL,              -- Criticidad: Alta, Media, Baja
        [Notes] NVARCHAR(500) NULL,                           -- Notas adicionales
        [IsActive] BIT NOT NULL DEFAULT 1,                    -- Si está activo
        [CreatedAt] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
        [CreatedByUserId] NVARCHAR(450) NOT NULL,
        [CreatedByUserName] NVARCHAR(256) NULL,
        [UpdatedAt] DATETIME2 NULL,
        [UpdatedByUserId] NVARCHAR(450) NULL,
        [UpdatedByUserName] NVARCHAR(256) NULL,
        
        CONSTRAINT [UQ_DatabaseOwners_Server_Instance_Database] 
            UNIQUE ([ServerName], [InstanceName], [DatabaseName])
    );
    
    PRINT 'Tabla DatabaseOwners creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla DatabaseOwners ya existe';
END
GO

-- ============================================
-- 2. Crear índices
-- ============================================
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DatabaseOwners_ServerName' AND object_id = OBJECT_ID('DatabaseOwners'))
BEGIN
    CREATE INDEX [IX_DatabaseOwners_ServerName] ON [dbo].[DatabaseOwners]([ServerName]);
    PRINT 'Índice IX_DatabaseOwners_ServerName creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DatabaseOwners_CellTeam' AND object_id = OBJECT_ID('DatabaseOwners'))
BEGIN
    CREATE INDEX [IX_DatabaseOwners_CellTeam] ON [dbo].[DatabaseOwners]([CellTeam]);
    PRINT 'Índice IX_DatabaseOwners_CellTeam creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DatabaseOwners_OwnerName' AND object_id = OBJECT_ID('DatabaseOwners'))
BEGIN
    CREATE INDEX [IX_DatabaseOwners_OwnerName] ON [dbo].[DatabaseOwners]([OwnerName]);
    PRINT 'Índice IX_DatabaseOwners_OwnerName creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DatabaseOwners_OwnerEmail' AND object_id = OBJECT_ID('DatabaseOwners'))
BEGIN
    CREATE INDEX [IX_DatabaseOwners_OwnerEmail] ON [dbo].[DatabaseOwners]([OwnerEmail]);
    PRINT 'Índice IX_DatabaseOwners_OwnerEmail creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DatabaseOwners_IsActive' AND object_id = OBJECT_ID('DatabaseOwners'))
BEGIN
    CREATE INDEX [IX_DatabaseOwners_IsActive] ON [dbo].[DatabaseOwners]([IsActive]);
    PRINT 'Índice IX_DatabaseOwners_IsActive creado';
END
GO

-- ============================================
-- 3. Vista para consultar owners con info de servidor
-- ============================================
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_DatabaseOwnersWithServerInfo]'))
BEGIN
    DROP VIEW [dbo].[vw_DatabaseOwnersWithServerInfo];
END
GO

CREATE VIEW [dbo].[vw_DatabaseOwnersWithServerInfo]
AS
SELECT 
    do.Id,
    do.ServerName,
    do.InstanceName,
    do.DatabaseName,
    do.OwnerName,
    do.OwnerEmail,
    do.OwnerPhone,
    do.CellTeam,
    do.Department,
    do.ApplicationName,
    do.BusinessCriticality,
    do.Notes,
    do.IsActive,
    do.CreatedAt,
    do.CreatedByUserName,
    do.UpdatedAt,
    do.UpdatedByUserName,
    -- Info del servidor desde cache si existe
    sic.Ambiente AS ServerAmbiente,
    sic.MajorVersion AS SqlVersion,
    sic.AlwaysOn AS IsAlwaysOn,
    sic.HostingSite
FROM [dbo].[DatabaseOwners] do
LEFT JOIN [dbo].[SqlServerInstancesCache] sic 
    ON do.ServerName = sic.ServerName 
    AND (do.InstanceName = sic.NombreInstancia OR (do.InstanceName IS NULL AND sic.NombreInstancia = sic.ServerName));
GO

PRINT 'Vista vw_DatabaseOwnersWithServerInfo creada';
GO

-- ============================================
-- 4. Vista para obtener células únicas
-- ============================================
IF EXISTS (SELECT * FROM sys.views WHERE object_id = OBJECT_ID(N'[dbo].[vw_UniqueCellTeams]'))
BEGIN
    DROP VIEW [dbo].[vw_UniqueCellTeams];
END
GO

CREATE VIEW [dbo].[vw_UniqueCellTeams]
AS
SELECT DISTINCT 
    CellTeam,
    COUNT(*) AS DatabaseCount
FROM [dbo].[DatabaseOwners]
WHERE CellTeam IS NOT NULL AND IsActive = 1
GROUP BY CellTeam;
GO

PRINT 'Vista vw_UniqueCellTeams creada';
GO

-- ============================================
-- 5. Verificar estructura creada
-- ============================================
PRINT '';
PRINT '============================================';
PRINT 'Script CreateDatabaseOwners.sql completado';
PRINT '============================================';
PRINT '';

SELECT 
    c.name AS ColumnName,
    t.name AS DataType,
    c.max_length,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('DatabaseOwners')
ORDER BY c.column_id;
GO
