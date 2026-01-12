-- =============================================
-- Script: VaultEnterprise_Phase0_Prerequisites.sql
-- Description: Pre-requisitos para migración Vault Enterprise v2.1.1
-- Database: AppSQLNova
-- SQL Server: 2017+
-- Date: December 2025
-- =============================================

USE [AppSQLNova]
GO

PRINT '============================================='
PRINT 'FASE 0: PREREQUISITOS - Vault Enterprise v2.1.1'
PRINT '============================================='
GO

-- =============================================
-- 1. Función fn_GetArgentinaTimeOffset
-- Retorna DATETIMEOFFSET en hora Argentina (UTC-3)
-- Argentina no tiene DST desde 2009
-- =============================================
IF OBJECT_ID('dbo.fn_GetArgentinaTimeOffset', 'FN') IS NOT NULL
BEGIN
    DROP FUNCTION [dbo].[fn_GetArgentinaTimeOffset];
    PRINT 'Función fn_GetArgentinaTimeOffset eliminada para recrear.';
END
GO

CREATE FUNCTION [dbo].[fn_GetArgentinaTimeOffset]()
RETURNS DATETIMEOFFSET
AS
BEGIN
    -- Argentina siempre es UTC-3 (no tiene DST)
    RETURN SWITCHOFFSET(SYSDATETIMEOFFSET(), '-03:00');
END
GO

PRINT 'Función fn_GetArgentinaTimeOffset creada exitosamente.';
GO

-- Verificar funcionamiento
SELECT dbo.fn_GetArgentinaTimeOffset() AS ArgentinaTimeNow;
GO

-- =============================================
-- 2. Stored Procedure sp_DropDefaultConstraintSafe
-- Elimina DEFAULT constraints de forma segura en SQL Server 2017
-- (SQL 2017 no soporta DROP CONSTRAINT IF EXISTS)
-- =============================================
IF OBJECT_ID('dbo.sp_DropDefaultConstraintSafe', 'P') IS NOT NULL
BEGIN
    DROP PROCEDURE [dbo].[sp_DropDefaultConstraintSafe];
    PRINT 'Procedimiento sp_DropDefaultConstraintSafe eliminado para recrear.';
END
GO

CREATE PROCEDURE [dbo].[sp_DropDefaultConstraintSafe]
    @TableName NVARCHAR(128),
    @ColumnName NVARCHAR(128),
    @SchemaName NVARCHAR(128) = 'dbo'
AS
BEGIN
    SET NOCOUNT ON;
    
    DECLARE @ConstraintName NVARCHAR(128);
    DECLARE @SQL NVARCHAR(MAX);
    DECLARE @FullTableName NVARCHAR(256) = QUOTENAME(@SchemaName) + '.' + QUOTENAME(@TableName);
    
    -- Buscar el constraint real via sys.default_constraints
    SELECT @ConstraintName = dc.name
    FROM sys.default_constraints dc
    INNER JOIN sys.columns c 
        ON dc.parent_object_id = c.object_id 
        AND dc.parent_column_id = c.column_id
    WHERE dc.parent_object_id = OBJECT_ID(@FullTableName)
      AND c.name = @ColumnName;
    
    IF @ConstraintName IS NOT NULL
    BEGIN
        SET @SQL = 'ALTER TABLE ' + @FullTableName + ' DROP CONSTRAINT ' + QUOTENAME(@ConstraintName);
        
        PRINT 'Dropping constraint: ' + @ConstraintName + ' from ' + @FullTableName + '.' + @ColumnName;
        EXEC sp_executesql @SQL;
        PRINT 'Constraint dropped successfully.';
    END
    ELSE
    BEGIN
        PRINT 'No default constraint found on ' + @FullTableName + '.' + @ColumnName;
    END
END
GO

PRINT 'Procedimiento sp_DropDefaultConstraintSafe creado exitosamente.';
GO

-- =============================================
-- 3. Tabla VaultMigrationLog (log de operaciones de schema)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultMigrationLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VaultMigrationLog] (
        [Id] INT IDENTITY(1,1) PRIMARY KEY,
        [Phase] NVARCHAR(50) NOT NULL,
        [Step] NVARCHAR(100) NOT NULL,
        [Status] NVARCHAR(20) NOT NULL,
        [StartedAt] DATETIMEOFFSET NOT NULL DEFAULT (dbo.fn_GetArgentinaTimeOffset()),
        [CompletedAt] DATETIMEOFFSET NULL,
        [AffectedRows] INT NULL,
        [ErrorMessage] NVARCHAR(MAX) NULL,
        [ExecutedBy] NVARCHAR(256) NULL DEFAULT SUSER_SNAME()
    );
    
    PRINT 'Tabla VaultMigrationLog creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla VaultMigrationLog ya existe.';
END
GO

-- =============================================
-- 4. Tabla VaultPurgeLog (log de purgas de datos)
-- =============================================
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[VaultPurgeLog]') AND type in (N'U'))
BEGIN
    CREATE TABLE [dbo].[VaultPurgeLog] (
        [Id] BIGINT IDENTITY(1,1) PRIMARY KEY,
        [PurgedAt] DATETIMEOFFSET NOT NULL DEFAULT (dbo.fn_GetArgentinaTimeOffset()),
        [EntityType] NVARCHAR(50) NOT NULL,
        [EntityId] INT NOT NULL,
        [EntityName] NVARCHAR(256) NULL,
        [DeletedAt] DATETIMEOFFSET NULL,
        [PurgeReason] NVARCHAR(100) NOT NULL DEFAULT 'RetentionExpired'
    );
    
    PRINT 'Tabla VaultPurgeLog creada exitosamente.';
END
ELSE
BEGIN
    PRINT 'Tabla VaultPurgeLog ya existe.';
END
GO

-- =============================================
-- 5. Registrar inicio de migración
-- =============================================
INSERT INTO [dbo].[VaultMigrationLog] ([Phase], [Step], [Status], [StartedAt])
VALUES ('Phase0', 'Prerequisites', 'Completed', dbo.fn_GetArgentinaTimeOffset());

PRINT '============================================='
PRINT 'FASE 0 COMPLETADA: Prerequisites instalados'
PRINT '- fn_GetArgentinaTimeOffset'
PRINT '- sp_DropDefaultConstraintSafe'
PRINT '- VaultMigrationLog'
PRINT '- VaultPurgeLog'
PRINT '============================================='
GO

